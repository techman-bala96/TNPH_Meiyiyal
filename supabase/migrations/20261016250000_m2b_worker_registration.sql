-- M2b: worker registration (config-driven requirements), Aadhaar OTP (pluggable, local stub), documents, admin review, Go Online
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- app settings (admin-only, server config) ----------
CREATE TABLE IF NOT EXISTS public.app_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage settings" ON public.app_settings FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
-- kyc_provider: 'stub' (local/dev only, fixed test OTP) | 'edge' (Edge Function calls the real provider and then kyc_provider_confirm)
INSERT INTO public.app_settings(key,value) VALUES
  ('kyc_provider','"stub"'), ('kyc_stub_otp','"123456"'), ('aadhaar_pepper', to_jsonb(encode(gen_random_bytes(24),'hex')))
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.setting(_k text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT value FROM public.app_settings WHERE key=_k $$;
REVOKE ALL ON FUNCTION public.setting(text) FROM public, anon, authenticated;
-- client may only learn whether stub mode is on (to show the test hint)
CREATE OR REPLACE FUNCTION public.kyc_mode() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT COALESCE(public.setting('kyc_provider')#>>'{}','edge') $$;
GRANT EXECUTE ON FUNCTION public.kyc_mode() TO authenticated;

-- ---------- workers: lifecycle + public card fields ----------
ALTER TABLE public.workers
  ALTER COLUMN category SET DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','needs_info','approved','rejected','blocked')),
  ADD COLUMN IF NOT EXISTS primary_node text REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS display_name text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS reg_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS district_slug text REFERENCES public.tn_districts(slug),
  ADD COLUMN IF NOT EXISTS rewards_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE public.workers ADD CONSTRAINT workers_years_chk CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 70);

CREATE OR REPLACE FUNCTION public.trusted() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('meiyiyal.trusted', true) = 'on' $$;

CREATE OR REPLACE FUNCTION public.guard_worker_protected_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.trusted() OR current_setting('request.jwt.claim.role', true) = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false; NEW.is_active := false; NEW.rating := 0; NEW.total_reviews := 0; NEW.rewards_count := 0;
    NEW.status := 'draft'; NEW.is_online := false; NEW.submitted_at := NULL; NEW.decided_at := NULL; NEW.review_note := NULL;
    RETURN NEW;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.rating IS DISTINCT FROM OLD.rating OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
     OR NEW.rewards_count IS DISTINCT FROM OLD.rewards_count OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_online IS DISTINCT FROM OLD.is_online OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.decided_at IS DISTINCT FROM OLD.decided_at OR NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'protected worker fields can only be changed by the server';
  END IF;
  -- registration data is frozen while under review / after approval (edits go through worker_register which resets status)
  IF OLD.status IN ('pending','approved','blocked') AND (NEW.reg_data IS DISTINCT FROM OLD.reg_data OR NEW.primary_node IS DISTINCT FROM OLD.primary_node) THEN
    RAISE EXCEPTION 'registration is locked while %', OLD.status;
  END IF;
  RETURN NEW;
END $$;

-- ---------- KYC (Aadhaar) ----------
ALTER TABLE public.kyc_verification ADD COLUMN IF NOT EXISTS aadhaar_last4 text, ADD COLUMN IF NOT EXISTS provider text;
CREATE TABLE IF NOT EXISTS public.kyc_otp_sessions (
  worker_id uuid PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  aadhaar_hash text NOT NULL, last4 text NOT NULL, provider_ref text,
  attempts int NOT NULL DEFAULT 0, sends int NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kyc_otp_sessions ENABLE ROW LEVEL SECURITY; -- no policies: server-only

-- ---------- documents ----------
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type ~ '^[a-z0-9_]{2,40}$'),
  path text NOT NULL,
  mime text, size_bytes int,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, doc_type)
);
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads docs" ON public.worker_documents FOR SELECT USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));
CREATE POLICY "owner adds docs while editable" ON public.worker_documents FOR INSERT WITH CHECK (
  status = 'uploaded' AND worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info'))
  AND path LIKE auth.uid()::text || '/%');
CREATE POLICY "owner replaces docs while editable" ON public.worker_documents FOR DELETE USING (
  worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info')));
CREATE POLICY "admin docs" ON public.worker_documents FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('worker-docs','worker-docs', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY "docs owner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='worker-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "docs owner read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='worker-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "docs owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='worker-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- admin audit ----------
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id bigserial PRIMARY KEY, actor uuid NOT NULL, action text NOT NULL, target uuid, note text, data jsonb, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read audit" ON public.admin_audit FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- ---------- requirements (config-driven, inherited & overridable per node) ----------
CREATE OR REPLACE FUNCTION public.node_requirements_for(_slug text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE cur text := _slug; chain text[] := '{}'; s text; f jsonb := '[]'; d jsonb := '[]'; r jsonb; item jsonb; idx int;
BEGIN
  WHILE cur IS NOT NULL LOOP chain := cur || chain; SELECT parent_slug INTO cur FROM public.taxonomy_nodes WHERE slug = cur; END LOOP;
  FOREACH s IN ARRAY chain LOOP
    SELECT schema INTO r FROM public.node_requirements WHERE node_slug = s;
    IF r IS NULL THEN CONTINUE; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(r->'fields','[]')) LOOP
      idx := (SELECT i - 1 FROM jsonb_array_elements(f) WITH ORDINALITY e(x,i) WHERE x->>'key' = item->>'key' LIMIT 1);
      f := CASE WHEN idx IS NULL THEN f || jsonb_build_array(item) ELSE jsonb_set(f, ARRAY[idx::text], item) END;
    END LOOP;
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(r->'docs','[]')) LOOP
      idx := (SELECT i - 1 FROM jsonb_array_elements(d) WITH ORDINALITY e(x,i) WHERE x->>'type' = item->>'type' LIMIT 1);
      d := CASE WHEN idx IS NULL THEN d || jsonb_build_array(item) ELSE jsonb_set(d, ARRAY[idx::text], item) END;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('fields', f, 'docs', d);
END $$;
GRANT EXECUTE ON FUNCTION public.node_requirements_for(text) TO anon, authenticated;

-- ---------- worker RPCs ----------
CREATE OR REPLACE FUNCTION public.my_worker() RETURNS SETOF public.workers LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.workers WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.worker_register(_node text, _extra_nodes text[], _display_name text, _years int, _about text, _reg jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _loc record; _cat text; n text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug=_node AND is_active AND kind IN ('subcategory','specialty')) THEN RAISE EXCEPTION 'pick a sub-category'; END IF;
  _cat := split_part(_node,'--',1) || '--' || split_part(_node,'--',2);
  IF COALESCE(array_length(_extra_nodes,1),0) > 5 THEN RAISE EXCEPTION 'max 5 extra areas'; END IF;
  FOREACH n IN ARRAY COALESCE(_extra_nodes,'{}') LOOP
    IF n NOT LIKE _cat || '--%' OR NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug=n AND is_active) THEN RAISE EXCEPTION 'extra area % not in same profession', n; END IF;
  END LOOP;
  SELECT * INTO _w FROM public.workers WHERE user_id = auth.uid();
  IF FOUND AND _w.status IN ('pending','approved','blocked') THEN RAISE EXCEPTION 'registration is locked while %', _w.status; END IF;
  SELECT l.geog, l.district_slug INTO _loc FROM public.user_locations l WHERE l.user_id=auth.uid() AND l.is_current;
  PERFORM set_config('meiyiyal.trusted','on',true);
  INSERT INTO public.workers(user_id, category, primary_node, display_name, years_experience, about, reg_data, base_geog, district_slug, status, is_active, is_verified)
  VALUES (auth.uid(), 'professional', _node, btrim(_display_name), _years, left(_about,1000), COALESCE(_reg,'{}'), _loc.geog, _loc.district_slug, 'draft', false, false)
  ON CONFLICT (user_id) DO UPDATE SET primary_node=EXCLUDED.primary_node, display_name=EXCLUDED.display_name, years_experience=EXCLUDED.years_experience,
    about=EXCLUDED.about, reg_data=EXCLUDED.reg_data, base_geog=COALESCE(EXCLUDED.base_geog, workers.base_geog), district_slug=COALESCE(EXCLUDED.district_slug, workers.district_slug)
  RETURNING * INTO _w;
  DELETE FROM public.worker_nodes WHERE worker_id=_w.id;
  INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) VALUES (_w.id,_node,true);
  INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) SELECT _w.id, x, false FROM unnest(COALESCE(_extra_nodes,'{}')) x WHERE x <> _node ON CONFLICT DO NOTHING;
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN _w.id;
END $$;

-- Aadhaar OTP: start. Stub mode issues the configured test OTP; 'edge' mode is driven by an Edge Function.
CREATE OR REPLACE FUNCTION public.aadhaar_send_otp(_aadhaar text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _a text := regexp_replace(COALESCE(_aadhaar,''),'\D','','g'); _s public.kyc_otp_sessions;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id=auth.uid() AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  IF _a !~ '^[2-9][0-9]{11}$' THEN RAISE EXCEPTION 'invalid aadhaar'; END IF;
  IF public.kyc_mode() <> 'stub' THEN RAISE EXCEPTION 'use the kyc edge function'; END IF;
  SELECT * INTO _s FROM public.kyc_otp_sessions WHERE worker_id=_wid;
  IF FOUND AND _s.sends >= 5 AND _s.created_at > now() - interval '1 hour' THEN RAISE EXCEPTION 'too many OTP requests, try later'; END IF;
  INSERT INTO public.kyc_otp_sessions(worker_id,aadhaar_hash,last4,provider_ref,expires_at)
  VALUES (_wid, encode(extensions.digest((public.setting('aadhaar_pepper')#>>'{}') || _a,'sha256'),'hex'), right(_a,4), 'stub', now() + interval '10 minutes')
  ON CONFLICT (worker_id) DO UPDATE SET aadhaar_hash=EXCLUDED.aadhaar_hash, last4=EXCLUDED.last4, attempts=0, expires_at=EXCLUDED.expires_at,
    sends = CASE WHEN kyc_otp_sessions.created_at > now() - interval '1 hour' THEN kyc_otp_sessions.sends + 1 ELSE 1 END;
  RETURN jsonb_build_object('masked', 'XXXX-XXXX-' || right(_a,4), 'expires_in', 600);
END $$;

CREATE OR REPLACE FUNCTION public.aadhaar_verify_otp(_otp text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _s public.kyc_otp_sessions;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id=auth.uid() AND status IN ('draft','needs_info');
  SELECT * INTO _s FROM public.kyc_otp_sessions WHERE worker_id=_wid;
  IF NOT FOUND THEN RAISE EXCEPTION 'send OTP first'; END IF;
  IF _s.expires_at < now() THEN RAISE EXCEPTION 'OTP expired'; END IF;
  IF _s.attempts >= 5 THEN RAISE EXCEPTION 'too many attempts'; END IF;
  IF public.kyc_mode() <> 'stub' OR _otp IS DISTINCT FROM (public.setting('kyc_stub_otp')#>>'{}') THEN
    UPDATE public.kyc_otp_sessions SET attempts=attempts+1 WHERE worker_id=_wid;
    RETURN jsonb_build_object('ok', false);
  END IF;
  INSERT INTO public.kyc_verification(worker_id, aadhaar_number_hash, aadhaar_last4, aadhaar_verified, provider, status)
  VALUES (_wid, _s.aadhaar_hash, _s.last4, true, _s.provider_ref, 'pending')
  ON CONFLICT (worker_id) DO UPDATE SET aadhaar_number_hash=EXCLUDED.aadhaar_number_hash, aadhaar_last4=EXCLUDED.aadhaar_last4, aadhaar_verified=true, provider=EXCLUDED.provider, updated_at=now();
  DELETE FROM public.kyc_otp_sessions WHERE worker_id=_wid;
  RETURN jsonb_build_object('ok', true, 'masked', 'XXXX-XXXX-' || _s.last4);
END $$;

CREATE OR REPLACE FUNCTION public.my_kyc() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('aadhaar_verified', k.aadhaar_verified, 'masked', 'XXXX-XXXX-' || k.aadhaar_last4, 'status', k.status)
  FROM public.kyc_verification k JOIN public.workers w ON w.id=k.worker_id WHERE w.user_id=auth.uid() $$;

-- Submit for review: validates required fields/docs from config + Aadhaar.
CREATE OR REPLACE FUNCTION public.worker_submit() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; req jsonb; item jsonb; missing text[] := '{}';
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id=auth.uid();
  IF NOT FOUND OR _w.status NOT IN ('draft','needs_info') THEN RAISE EXCEPTION 'nothing to submit'; END IF;
  req := public.node_requirements_for(_w.primary_node);
  FOR item IN SELECT * FROM jsonb_array_elements(req->'fields') LOOP
    IF (item->>'required')::boolean AND COALESCE(btrim(_w.reg_data->>(item->>'key')),'') = '' THEN missing := missing || (item->>'key'); END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(req->'docs') LOOP
    IF (item->>'required')::boolean AND NOT EXISTS (SELECT 1 FROM public.worker_documents WHERE worker_id=_w.id AND doc_type=item->>'type') THEN missing := missing || ('doc:' || (item->>'type')); END IF;
  END LOOP;
  IF _w.display_name IS NULL THEN missing := missing || 'display_name'::text; END IF;
  IF _w.years_experience IS NULL THEN missing := missing || 'years_experience'::text; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kyc_verification WHERE worker_id=_w.id AND aadhaar_verified) THEN missing := missing || 'aadhaar'::text; END IF;
  IF array_length(missing,1) > 0 THEN RAISE EXCEPTION 'missing: %', array_to_string(missing, ', '); END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET status='pending', submitted_at=now(), review_note=NULL,
    photo_url=(SELECT avatar_url FROM public.profiles WHERE user_id=auth.uid()) WHERE id=_w.id;
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.worker_set_online(_online boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id=auth.uid();
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active THEN RAISE EXCEPTION 'not approved yet' USING ERRCODE='42501'; END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET is_online=_online, last_seen_at=now(),
    photo_url=COALESCE((SELECT avatar_url FROM public.profiles WHERE user_id=auth.uid()), photo_url) WHERE id=_w.id;
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN _online;
END $$;

-- ---------- admin RPCs ----------
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.has_role(auth.uid(),'admin') $$;

CREATE OR REPLACE FUNCTION public.admin_worker_queue(_status text DEFAULT 'pending')
RETURNS TABLE(id uuid, display_name text, primary_node text, node_name jsonb, years_experience int, about text, reg_data jsonb, status text,
  submitted_at timestamptz, district_slug text, aadhaar_verified boolean, aadhaar_masked text, docs jsonb, photo_url text, email text, phone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT w.id, w.display_name, w.primary_node, t.name_i18n, w.years_experience, w.about, w.reg_data, w.status, w.submitted_at, w.district_slug,
    COALESCE(k.aadhaar_verified,false), 'XXXX-XXXX-' || k.aadhaar_last4,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('type',d.doc_type,'path',d.path,'mime',d.mime) ORDER BY d.doc_type) FROM public.worker_documents d WHERE d.worker_id=w.id),'[]'),
    w.photo_url, p.email, p.phone_number
  FROM public.workers w LEFT JOIN public.taxonomy_nodes t ON t.slug=w.primary_node LEFT JOIN public.kyc_verification k ON k.worker_id=w.id
  LEFT JOIN public.profiles p ON p.user_id=w.user_id
  WHERE (_status = 'all' OR w.status=_status) ORDER BY w.submitted_at NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_worker(_worker uuid, _decision text, _note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  _st := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'needs_info' THEN 'needs_info' WHEN 'block' THEN 'blocked' ELSE NULL END;
  IF _st IS NULL THEN RAISE EXCEPTION 'bad decision'; END IF;
  IF _st IN ('rejected','needs_info','blocked') AND COALESCE(btrim(_note),'') = '' THEN RAISE EXCEPTION 'note required'; END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET status=_st, is_verified=(_st='approved'), is_active=(_st='approved'), is_online=CASE WHEN _st='approved' THEN is_online ELSE false END,
    review_note=_note, decided_at=now() WHERE id=_worker;
  IF NOT FOUND THEN RAISE EXCEPTION 'worker not found'; END IF;
  UPDATE public.kyc_verification SET status = CASE WHEN _st='approved' THEN 'verified'::kyc_status WHEN _st='rejected' THEN 'rejected'::kyc_status ELSE status END,
    verified_at = CASE WHEN _st='approved' THEN now() ELSE verified_at END WHERE worker_id=_worker;
  PERFORM set_config('meiyiyal.trusted','off',true);
  INSERT INTO public.admin_audit(actor,action,target,note) VALUES (auth.uid(),'worker.'||_decision,_worker,_note);
  RETURN _st;
END $$;

REVOKE ALL ON FUNCTION public.worker_register(text,text[],text,int,text,jsonb), public.aadhaar_send_otp(text), public.aadhaar_verify_otp(text),
  public.my_kyc(), public.worker_submit(), public.worker_set_online(boolean), public.admin_worker_queue(text), public.admin_decide_worker(uuid,text,text), public.is_admin(), public.my_worker() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.worker_register(text,text[],text,int,text,jsonb), public.aadhaar_send_otp(text), public.aadhaar_verify_otp(text),
  public.my_kyc(), public.worker_submit(), public.worker_set_online(boolean), public.admin_worker_queue(text), public.admin_decide_worker(uuid,text,text), public.is_admin(), public.my_worker() TO authenticated;
