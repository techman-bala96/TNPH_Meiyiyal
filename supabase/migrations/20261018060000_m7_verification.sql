-- M7 verification engine v1.
-- Decisions (18 Oct 2026): Aadhaar is mandatory (no other ID). Auto-approve is on in local/dev
-- via verify_auto_approve and can be turned off globally or per category (production stays off
-- until a labelled accuracy set passes). Statutory councils require a registration number.
-- Live registry lookups are allowed but a missing adapter, timeout, or kill switch is "review"
-- (admin queue), never a silent pass and never a hard fail. Raw selfies/QR photos are private
-- and purged 30 days after the decision (paused while an appeal is open). A separately consented
-- public portrait is the profile photo and is kept.
-- Deliberately not a consult category: anesthesiology (the act is the procedure), emergency
-- medicine (call 108, not a paid chat), forensic medicine, academic non-clinical subjects,
-- immigration and notary (in-person), bail as its own area (covered by Criminal).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- worker trust columns (server-written) ----------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS badge_tier text CHECK (badge_tier IS NULL OR badge_tier IN ('licence','degree')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_selfie_path text,
  ADD COLUMN IF NOT EXISTS selfie_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_worker_protected_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.trusted() OR current_setting('request.jwt.claim.role', true) = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false; NEW.is_active := false; NEW.rating := 0; NEW.total_reviews := 0; NEW.rewards_count := 0;
    NEW.status := 'draft'; NEW.is_online := false; NEW.submitted_at := NULL; NEW.decided_at := NULL; NEW.review_note := NULL;
    NEW.badge_tier := NULL; NEW.verified_at := NULL; NEW.public_selfie_path := NULL; NEW.selfie_consent_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.rating IS DISTINCT FROM OLD.rating OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
     OR NEW.rewards_count IS DISTINCT FROM OLD.rewards_count OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_online IS DISTINCT FROM OLD.is_online OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.decided_at IS DISTINCT FROM OLD.decided_at OR NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.badge_tier IS DISTINCT FROM OLD.badge_tier OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.public_selfie_path IS DISTINCT FROM OLD.public_selfie_path OR NEW.selfie_consent_at IS DISTINCT FROM OLD.selfie_consent_at THEN
    RAISE EXCEPTION 'protected worker fields can only be changed by the server';
  END IF;
  IF OLD.status IN ('pending','approved','blocked') AND (NEW.reg_data IS DISTINCT FROM OLD.reg_data OR NEW.primary_node IS DISTINCT FROM OLD.primary_node) THEN
    RAISE EXCEPTION 'registration is locked while %', OLD.status;
  END IF;
  RETURN NEW;
END $$;

-- The original public SELECT exposed reg_data (registration numbers) for every approved worker.
-- Search and profiles go through SECURITY DEFINER RPCs. Owners still read their own row.
DROP POLICY IF EXISTS "Public can view active verified workers" ON public.workers;

-- ---------- settings ----------
-- verify_auto_approve defaults ON for local/dev. Set it false in production until the labelled
-- accuracy set meets the false-accept target. Per-category overrides: {"professionals--lawyer": false}.
INSERT INTO public.app_settings(key, value) VALUES
  ('verify_auto_approve', 'true'),
  ('verify_auto_approve_categories', '{}'),
  ('verify_registry_live', 'true'),
  ('verify_hmac_pepper', to_jsonb(encode(gen_random_bytes(32), 'hex'))),
  ('verify_risk_approve', '20'),
  ('verify_risk_reject', '60'),
  ('verify_name_pass', '0.92'),
  ('verify_name_review', '0.80'),
  ('verify_registry_days', '90'),
  ('verify_selfie_days', '180'),
  ('verify_retain_days', '30')
ON CONFLICT (key) DO NOTHING;

-- ---------- rules (inherited down the taxonomy like rate cards) ----------
CREATE TABLE public.verification_rules (
  category_slug text NOT NULL REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  check_name text NOT NULL CHECK (check_name IN ('identity','face','registry','degree','name','forensics','duplicates')),
  required boolean NOT NULL DEFAULT true,
  weight numeric NOT NULL DEFAULT 0,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (category_slug, check_name)
);
ALTER TABLE public.verification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read verification rules" ON public.verification_rules FOR SELECT USING (true);
CREATE POLICY "admin write verification rules" ON public.verification_rules FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.verification_rules_for(_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text := _slug; chain text[] := '{}'; s text; acc jsonb := '{}'::jsonb; r record;
BEGIN
  WHILE cur IS NOT NULL LOOP
    chain := cur || chain;
    SELECT parent_slug INTO cur FROM public.taxonomy_nodes WHERE slug = cur;
  END LOOP;
  FOREACH s IN ARRAY chain LOOP
    FOR r IN SELECT check_name, required, weight, params FROM public.verification_rules WHERE category_slug = s LOOP
      acc := acc || jsonb_build_object(r.check_name, jsonb_build_object('required', r.required, 'weight', r.weight, 'params', r.params));
    END LOOP;
  END LOOP;
  RETURN acc;
END $$;
GRANT EXECUTE ON FUNCTION public.verification_rules_for(text) TO anon, authenticated;

-- ---------- cases, checks, jobs, fingerprints, appeals, cache ----------
CREATE TABLE public.verification_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','queued','approved','rejected','needs_info','appealed')),
  risk numeric,
  decision text CHECK (decision IS NULL OR decision IN ('auto_approve','queue','reject','admin')),
  decided_by uuid,
  sla_due_at timestamptz,
  sla_paused_at timestamptz,
  reason_codes text[] NOT NULL DEFAULT '{}',
  qr_path text,
  raw_selfie_path text,
  hard_fail text,
  kind text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','recheck')),
  purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX verification_cases_one_open ON public.verification_cases(worker_id)
  WHERE status IN ('running','queued','needs_info','appealed');
CREATE INDEX verification_cases_worker_idx ON public.verification_cases(worker_id, created_at DESC);

CREATE TABLE public.verification_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.verification_cases(id) ON DELETE CASCADE,
  check_name text NOT NULL,
  provider text,
  status text NOT NULL CHECK (status IN ('pass','review','fail','error')),
  score numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, check_name)
);

CREATE TABLE public.verification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.verification_cases(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dead')),
  attempts int NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_jobs_claim_idx ON public.verification_jobs(run_after) WHERE status = 'queued';

-- Hashes only. Rejected/blocked identities keep the row (worker_id set null on account delete).
CREATE TABLE public.identity_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  hash text NOT NULL,
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, hash)
);

CREATE TABLE public.verification_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.verification_cases(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  note text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','overturned')),
  sla_due_at timestamptz NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id)
);

CREATE TABLE public.registry_cache (
  source text NOT NULL,
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, cache_key)
);

-- Staged files before submit. Paths only; the QR payload and raw image live in the private kyc bucket.
CREATE TABLE public.verification_intake (
  worker_id uuid PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  qr_path text,
  raw_selfie_path text,
  public_portrait_url text,
  selfie_consent_at timestamptz,
  liveness_challenge text,
  liveness_ok boolean,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_intake ENABLE ROW LEVEL SECURITY;
-- No worker/anon policies on checks, jobs, fingerprints, cache, or case evidence.
-- Admins can read cases and checks. Writes go through SECURITY DEFINER functions.
CREATE POLICY "admin read cases" ON public.verification_cases FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin read checks" ON public.verification_checks FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin read appeals" ON public.verification_appeals FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "owner reads own intake" ON public.verification_intake FOR SELECT
  USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kyc','kyc', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','text/plain'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
CREATE POLICY "kyc owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "kyc owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "kyc owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kyc' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- intake RPCs (paths only; payload is never a column) ----------
CREATE OR REPLACE FUNCTION public.verification_liveness_challenge() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _c text;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  _c := (ARRAY['blink','turn-left','turn-right'])[1 + floor(random()*3)::int];
  INSERT INTO public.verification_intake(worker_id, liveness_challenge, liveness_ok)
  VALUES (_wid, _c, false)
  ON CONFLICT (worker_id) DO UPDATE SET liveness_challenge = EXCLUDED.liveness_challenge, liveness_ok = false, updated_at = now();
  RETURN _c;
END $$;

CREATE OR REPLACE FUNCTION public.verification_stage_qr(_path text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  IF _path IS NULL OR _path NOT LIKE auth.uid()::text || '/%' OR _path LIKE '%..%' THEN RAISE EXCEPTION 'bad path'; END IF;
  INSERT INTO public.verification_intake(worker_id, qr_path) VALUES (_wid, _path)
  ON CONFLICT (worker_id) DO UPDATE SET qr_path = EXCLUDED.qr_path, updated_at = now();
  RETURN 'staged';
END $$;

CREATE OR REPLACE FUNCTION public.verification_stage_selfie(_raw_path text, _public_url text, _consent boolean, _did_challenge boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _ch text;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  IF _consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'selfie consent required'; END IF;
  IF _raw_path IS NULL OR _raw_path NOT LIKE auth.uid()::text || '/%' THEN RAISE EXCEPTION 'bad path'; END IF;
  IF COALESCE(btrim(_public_url),'') = '' THEN RAISE EXCEPTION 'public portrait required'; END IF;
  SELECT liveness_challenge INTO _ch FROM public.verification_intake WHERE worker_id = _wid;
  INSERT INTO public.verification_intake(worker_id, raw_selfie_path, public_portrait_url, selfie_consent_at, liveness_ok)
  VALUES (_wid, _raw_path, _public_url, now(), _ch IS NOT NULL AND _did_challenge IS TRUE)
  ON CONFLICT (worker_id) DO UPDATE SET raw_selfie_path = EXCLUDED.raw_selfie_path, public_portrait_url = EXCLUDED.public_portrait_url,
    selfie_consent_at = EXCLUDED.selfie_consent_at, liveness_ok = EXCLUDED.liveness_ok, updated_at = now();
  PERFORM set_config('meiyiyal.trusted','on', true);
  UPDATE public.workers SET public_selfie_path = _public_url, selfie_consent_at = now() WHERE id = _wid;
  PERFORM set_config('meiyiyal.trusted','off', true);
  RETURN 'staged';
END $$;

-- ---------- submit opens a case ----------
CREATE OR REPLACE FUNCTION public.worker_submit() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; req jsonb; item jsonb; missing text[] := '{}'; _intake public.verification_intake; _cid uuid;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id = auth.uid();
  IF NOT FOUND OR _w.status NOT IN ('draft','needs_info') THEN RAISE EXCEPTION 'nothing to submit'; END IF;
  req := public.node_requirements_for(_w.primary_node);
  FOR item IN SELECT * FROM jsonb_array_elements(req->'fields') LOOP
    IF (item->>'required')::boolean AND COALESCE(btrim(_w.reg_data->>(item->>'key')),'') = '' THEN missing := missing || (item->>'key'); END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(req->'docs') LOOP
    IF (item->>'required')::boolean AND NOT EXISTS (SELECT 1 FROM public.worker_documents WHERE worker_id = _w.id AND doc_type = item->>'type') THEN missing := missing || ('doc:' || (item->>'type')); END IF;
  END LOOP;
  IF _w.display_name IS NULL THEN missing := missing || 'display_name'::text; END IF;
  IF _w.years_experience IS NULL THEN missing := missing || 'years_experience'::text; END IF;
  -- Aadhaar is mandatory. There is no other identity document.
  IF NOT EXISTS (SELECT 1 FROM public.kyc_verification WHERE worker_id = _w.id AND aadhaar_verified) THEN missing := missing || 'aadhaar'::text; END IF;
  IF array_length(missing,1) > 0 THEN RAISE EXCEPTION 'missing: %', array_to_string(missing, ', '); END IF;
  SELECT * INTO _intake FROM public.verification_intake WHERE worker_id = _w.id;
  PERFORM set_config('meiyiyal.trusted','on', true);
  UPDATE public.workers SET status = 'pending', submitted_at = COALESCE(submitted_at, now()), review_note = NULL,
    photo_url = COALESCE(_intake.public_portrait_url, (SELECT avatar_url FROM public.profiles WHERE user_id = auth.uid()), photo_url)
  WHERE id = _w.id;
  PERFORM set_config('meiyiyal.trusted','off', true);
  SELECT id INTO _cid FROM public.verification_cases WHERE worker_id = _w.id AND status IN ('running','queued','needs_info','appealed') LIMIT 1;
  IF _cid IS NULL THEN
    INSERT INTO public.verification_cases(worker_id, status, sla_due_at, qr_path, raw_selfie_path)
    VALUES (_w.id, 'running', now() + interval '24 hours', _intake.qr_path, _intake.raw_selfie_path)
    RETURNING id INTO _cid;
  ELSE
    UPDATE public.verification_cases SET status = 'running', sla_due_at = now() + interval '24 hours', sla_paused_at = NULL,
      qr_path = COALESCE(_intake.qr_path, qr_path), raw_selfie_path = COALESCE(_intake.raw_selfie_path, raw_selfie_path)
    WHERE id = _cid;
  END IF;
  INSERT INTO public.verification_jobs(case_id) VALUES (_cid);
  RETURN 'pending';
END $$;

-- ---------- service-only check writer, fingerprints, decision ----------
CREATE OR REPLACE FUNCTION public.verification_write_check(_case uuid, _check text, _provider text, _status text, _score numeric, _evidence jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _status NOT IN ('pass','review','fail','error') THEN RAISE EXCEPTION 'bad check status'; END IF;
  INSERT INTO public.verification_checks(case_id, check_name, provider, status, score, evidence)
  VALUES (_case, _check, _provider, _status, _score, COALESCE(_evidence,'{}'::jsonb))
  ON CONFLICT (case_id, check_name) DO UPDATE SET provider = EXCLUDED.provider, status = EXCLUDED.status, score = EXCLUDED.score, evidence = EXCLUDED.evidence
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Returns self | ok | banned | active. Banned and active are other accounts.
CREATE OR REPLACE FUNCTION public.verification_observe_fingerprint(_worker uuid, _kind text, _hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.identity_fingerprints; _st text;
BEGIN
  IF COALESCE(btrim(_hash),'') = '' THEN RETURN 'ok'; END IF;
  SELECT * INTO _row FROM public.identity_fingerprints WHERE kind = _kind AND hash = _hash;
  IF NOT FOUND THEN
    INSERT INTO public.identity_fingerprints(kind, hash, worker_id) VALUES (_kind, _hash, _worker);
    RETURN 'ok';
  END IF;
  IF _row.worker_id IS NOT DISTINCT FROM _worker THEN RETURN 'self'; END IF;
  IF _row.blocked THEN RETURN 'banned'; END IF;
  SELECT status INTO _st FROM public.workers WHERE id = _row.worker_id;
  IF _st IN ('rejected','blocked') THEN
    UPDATE public.identity_fingerprints SET blocked = true WHERE id = _row.id;
    RETURN 'banned';
  END IF;
  IF _st = 'approved' THEN RETURN 'active'; END IF;
  RETURN 'active';
END $$;

CREATE OR REPLACE FUNCTION public.badge_tier_for(_slug text, _reg jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rules jsonb := public.verification_rules_for(_slug); reg_rule jsonb; field text; val text; optional boolean;
BEGIN
  reg_rule := rules->'registry';
  IF reg_rule IS NULL THEN RETURN 'degree'; END IF;
  field := COALESCE(reg_rule->'params'->>'reg_field', 'reg_no');
  optional := COALESCE((reg_rule->'params'->>'optional')::boolean, false) OR COALESCE((reg_rule->>'required')::boolean, true) = false;
  val := btrim(COALESCE(_reg->>field, ''));
  IF optional AND val = '' THEN RETURN 'degree'; END IF;
  IF COALESCE(reg_rule->'params'->>'tier', 'degree') = 'licence' THEN RETURN 'licence'; END IF;
  IF val <> '' AND COALESCE(reg_rule->'params'->>'tier','') = 'licence_if_present' THEN RETURN 'licence'; END IF;
  RETURN 'degree';
END $$;

CREATE OR REPLACE FUNCTION public._verification_apply(_case uuid, _decision text, _risk numeric, _hard text, _by uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.verification_cases; _w public.workers; _tier text; _days int;
BEGIN
  SELECT * INTO _c FROM public.verification_cases WHERE id = _case;
  SELECT * INTO _w FROM public.workers WHERE id = _c.worker_id;
  _days := public.setting_num('verify_retain_days', 30)::int;
  PERFORM set_config('meiyiyal.trusted','on', true);
  IF _decision = 'auto_approve' OR _decision = 'admin' THEN
    _tier := public.badge_tier_for(_w.primary_node, _w.reg_data);
    UPDATE public.workers SET status = 'approved', is_verified = true, is_active = true, is_online = false,
      badge_tier = _tier, verified_at = COALESCE(verified_at, now()), decided_at = now(), review_note = NULL,
      public_selfie_path = COALESCE((SELECT public_portrait_url FROM public.verification_intake i WHERE i.worker_id = _w.id), public_selfie_path),
      selfie_consent_at = COALESCE((SELECT selfie_consent_at FROM public.verification_intake i WHERE i.worker_id = _w.id), selfie_consent_at),
      photo_url = COALESCE((SELECT public_portrait_url FROM public.verification_intake i WHERE i.worker_id = _w.id), photo_url)
    WHERE id = _w.id;
    UPDATE public.kyc_verification SET status = 'verified', verified_at = now() WHERE worker_id = _w.id;
    UPDATE public.verification_cases SET status = 'approved', decision = CASE WHEN _decision = 'admin' THEN 'admin' ELSE 'auto_approve' END,
      risk = _risk, decided_by = _by, decided_at = now(), hard_fail = NULL, purge_after = now() + make_interval(days => _days)
    WHERE id = _case;
    INSERT INTO public.admin_audit(actor, action, target, data)
    VALUES (COALESCE(_by, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN _decision = 'admin' THEN 'worker.approve' ELSE 'worker.auto_approve' END,
            _w.id, jsonb_build_object('risk', _risk, 'case', _case, 'badge', _tier));
  ELSIF _decision = 'reject' THEN
    UPDATE public.workers SET status = 'rejected', is_verified = false, is_active = false, is_online = false,
      badge_tier = NULL, verified_at = NULL, decided_at = now(), review_note = COALESCE(_hard, 'verification failed')
    WHERE id = _w.id;
    UPDATE public.kyc_verification SET status = 'rejected' WHERE worker_id = _w.id;
    UPDATE public.verification_cases SET status = 'rejected', decision = 'reject', risk = _risk, hard_fail = _hard,
      decided_by = _by, decided_at = now(), purge_after = now() + make_interval(days => _days)
    WHERE id = _case;
    UPDATE public.identity_fingerprints SET blocked = true WHERE worker_id = _w.id;
    INSERT INTO public.admin_audit(actor, action, target, note, data)
    VALUES (COALESCE(_by, '00000000-0000-0000-0000-000000000000'::uuid), 'worker.auto_reject', _w.id, _hard,
            jsonb_build_object('risk', _risk, 'case', _case));
  ELSE
    UPDATE public.workers SET status = 'pending', review_note = NULL WHERE id = _w.id AND status IS DISTINCT FROM 'approved';
    UPDATE public.verification_cases SET status = 'queued', decision = 'queue', risk = _risk, hard_fail = NULL, sla_paused_at = NULL
    WHERE id = _case;
  END IF;
  PERFORM set_config('meiyiyal.trusted','off', true);
  UPDATE public.verification_jobs SET status = 'done' WHERE case_id = _case AND status IN ('queued','running');
  RETURN _decision;
END $$;

-- Mirrors services/verify/verify/risk.py. Hard fails: identity, registry, duplicates, or face with evidence.hard.
-- Any other fail/review/error or a missing required check goes to the queue unless risk exceeds the reject line.
CREATE OR REPLACE FUNCTION public.verification_decide(_case uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.verification_cases; _w public.workers; rules jsonb; key text; rule jsonb; chk record;
  _risk numeric := 0; _all_pass boolean := true; _hard text; _wht numeric; _auto boolean; _cat text;
  _approve numeric; _reject numeric; _field text; _filled boolean; _provider text;
BEGIN
  SELECT * INTO _c FROM public.verification_cases WHERE id = _case;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found'; END IF;
  SELECT * INTO _w FROM public.workers WHERE id = _c.worker_id;
  rules := public.verification_rules_for(_w.primary_node);
  _approve := public.setting_num('verify_risk_approve', 20);
  _reject := public.setting_num('verify_risk_reject', 60);
  FOR key, rule IN SELECT * FROM jsonb_each(rules) LOOP
    -- Optional registry (civil CMDA, electrical licence): empty number stays on the degree path.
    -- A filled number is a real check. provider "none" (nutrition) is never a gate.
    IF COALESCE((rule->>'required')::boolean, true) = false AND key <> 'duplicates' THEN
      IF key <> 'registry' THEN CONTINUE; END IF;
      _provider := COALESCE(rule->'params'->>'provider', 'none');
      _field := COALESCE(rule->'params'->>'reg_field', 'reg_no');
      _filled := btrim(COALESCE(_w.reg_data->>_field, '')) <> '';
      IF NOT _filled OR _provider IN ('none', '') THEN CONTINUE; END IF;
    END IF;
    SELECT * INTO chk FROM public.verification_checks WHERE case_id = _case AND check_name = key;
    _wht := COALESCE((rule->>'weight')::numeric, 0);
    IF NOT FOUND THEN
      _all_pass := false;
      _risk := _risk + _wht * 0.5;
      CONTINUE;
    END IF;
    IF chk.status = 'fail' AND (key IN ('identity','registry','duplicates') OR (key = 'face' AND COALESCE(chk.evidence->>'hard','') = 'true')) THEN
      _hard := COALESCE(_hard, key || ':' || COALESCE(chk.evidence->>'reason', chk.status));
    END IF;
    IF chk.status IS DISTINCT FROM 'pass' THEN _all_pass := false; END IF;
    _risk := _risk + _wht * CASE chk.status WHEN 'pass' THEN 0 WHEN 'fail' THEN 1 ELSE 0.5 END;
  END LOOP;
  _cat := public.node_category(_w.primary_node);
  _auto := public.setting('verify_auto_approve') = 'true'::jsonb
    AND COALESCE(public.setting('verify_auto_approve_categories')->>_cat, 'true') <> 'false';
  IF _hard IS NOT NULL THEN
    RETURN public._verification_apply(_case, 'reject', _risk, _hard, NULL);
  ELSIF _risk > _reject THEN
    RETURN public._verification_apply(_case, 'reject', _risk, 'risk', NULL);
  ELSIF _auto AND _all_pass AND _risk <= _approve THEN
    RETURN public._verification_apply(_case, 'auto_approve', _risk, NULL, NULL);
  ELSE
    RETURN public._verification_apply(_case, 'queue', _risk, NULL, NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verification_claim_job() RETURNS TABLE(job_id uuid, case_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT j.id FROM public.verification_jobs j
    WHERE j.status = 'queued' AND j.run_after <= now()
    ORDER BY j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.verification_jobs j SET status = 'running', locked_at = now(), attempts = j.attempts + 1
  FROM c WHERE j.id = c.id
  RETURNING j.id, j.case_id;
END $$;

CREATE OR REPLACE FUNCTION public.registry_cache_get(_source text, _key text, _max_age interval) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT payload FROM public.registry_cache WHERE source = _source AND cache_key = _key AND fetched_at > now() - _max_age $$;

CREATE OR REPLACE FUNCTION public.registry_cache_put(_source text, _key text, _payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.registry_cache(source, cache_key, payload, fetched_at) VALUES (_source, _key, _payload, now())
  ON CONFLICT (source, cache_key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now() $$;

-- ---------- worker-facing status (no evidence) ----------
CREATE OR REPLACE FUNCTION public.my_verification() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _c public.verification_cases;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id = auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _c FROM public.verification_cases WHERE worker_id = _w.id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'worker_status', _w.status,
    'badge_tier', _w.badge_tier,
    'verified_at', _w.verified_at,
    'case_status', _c.status,
    'risk', _c.risk,
    'decision', _c.decision,
    'sla_due_at', _c.sla_due_at,
    'hard_fail', _c.hard_fail,
    'checks', COALESCE((SELECT jsonb_agg(jsonb_build_object('check', k.check_name, 'status', k.status) ORDER BY k.check_name)
      FROM public.verification_checks k WHERE k.case_id = _c.id), '[]'::jsonb),
    'can_appeal', _w.status = 'rejected' AND _w.decided_at > now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.verification_appeals a WHERE a.worker_id = _w.id));
END $$;

CREATE OR REPLACE FUNCTION public.verification_appeal(_note text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _c public.verification_cases;
BEGIN
  IF COALESCE(btrim(_note),'') = '' THEN RAISE EXCEPTION 'note required'; END IF;
  SELECT * INTO _w FROM public.workers WHERE user_id = auth.uid();
  IF NOT FOUND OR _w.status <> 'rejected' THEN RAISE EXCEPTION 'nothing to appeal'; END IF;
  IF _w.decided_at IS NULL OR _w.decided_at < now() - interval '30 days' THEN RAISE EXCEPTION 'appeal window closed'; END IF;
  SELECT * INTO _c FROM public.verification_cases WHERE worker_id = _w.id AND status = 'rejected' ORDER BY decided_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'nothing to appeal'; END IF;
  IF EXISTS (SELECT 1 FROM public.verification_appeals WHERE case_id = _c.id OR worker_id = _w.id) THEN RAISE EXCEPTION 'one appeal only'; END IF;
  INSERT INTO public.verification_appeals(case_id, worker_id, note, sla_due_at) VALUES (_c.id, _w.id, btrim(_note), now() + interval '72 hours');
  UPDATE public.verification_cases SET status = 'appealed', purge_after = NULL, sla_paused_at = now() WHERE id = _c.id;
  PERFORM set_config('meiyiyal.trusted','on', true);
  UPDATE public.workers SET status = 'pending', review_note = NULL WHERE id = _w.id;
  PERFORM set_config('meiyiyal.trusted','off', true);
  RETURN 'appealed';
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_appeal(_case uuid, _decision text, _note text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.verification_cases; _a public.verification_appeals;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  IF COALESCE(btrim(_note),'') = '' THEN RAISE EXCEPTION 'note required'; END IF;
  SELECT * INTO _c FROM public.verification_cases WHERE id = _case AND status = 'appealed';
  IF NOT FOUND THEN RAISE EXCEPTION 'no open appeal'; END IF;
  SELECT * INTO _a FROM public.verification_appeals WHERE case_id = _case AND status = 'open';
  IF _c.decided_by IS NOT NULL AND _c.decided_by = auth.uid() THEN RAISE EXCEPTION 'a different admin reviews the appeal'; END IF;
  IF _decision = 'overturn' THEN
    PERFORM public._verification_apply(_case, 'admin', COALESCE(_c.risk, 0), NULL, auth.uid());
    UPDATE public.verification_appeals SET status = 'overturned', decided_by = auth.uid(), decided_at = now() WHERE id = _a.id;
    RETURN 'approved';
  ELSIF _decision = 'uphold' THEN
    PERFORM set_config('meiyiyal.trusted','on', true);
    UPDATE public.workers SET status = 'rejected', is_verified = false, is_active = false, is_online = false, decided_at = now(), review_note = _note WHERE id = _c.worker_id;
    PERFORM set_config('meiyiyal.trusted','off', true);
    UPDATE public.verification_cases SET status = 'rejected', decision = 'reject', decided_at = now(),
      purge_after = now() + make_interval(days => public.setting_num('verify_retain_days', 30)::int) WHERE id = _case;
    UPDATE public.verification_appeals SET status = 'upheld', decided_by = auth.uid(), decided_at = now() WHERE id = _a.id;
    INSERT INTO public.admin_audit(actor, action, target, note) VALUES (auth.uid(), 'worker.appeal_upheld', _c.worker_id, _note);
    RETURN 'rejected';
  ELSE
    RAISE EXCEPTION 'bad decision';
  END IF;
END $$;

-- Admin approval still works for the queue (and for the existing registration tests).
CREATE OR REPLACE FUNCTION public.admin_decide_worker(_worker uuid, _decision text, _note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text; _c public.verification_cases; _hash text; _reg text; _w public.workers;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  _st := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'needs_info' THEN 'needs_info' WHEN 'block' THEN 'blocked' ELSE NULL END;
  IF _st IS NULL THEN RAISE EXCEPTION 'bad decision'; END IF;
  IF _st IN ('rejected','needs_info','blocked') AND COALESCE(btrim(_note),'') = '' THEN RAISE EXCEPTION 'note required'; END IF;
  SELECT * INTO _w FROM public.workers WHERE id = _worker;
  IF NOT FOUND THEN RAISE EXCEPTION 'worker not found'; END IF;
  _reg := lower(btrim(COALESCE(_w.reg_data->>'reg_no', _w.reg_data->>'enrolment_no', _w.reg_data->>'coa_no', '')));
  IF _st = 'approved' AND _reg <> '' AND EXISTS (
    SELECT 1 FROM public.identity_fingerprints f WHERE f.kind = 'reg_no' AND f.hash = _reg AND f.worker_id IS DISTINCT FROM _worker
  ) THEN RAISE EXCEPTION 'registration number already used'; END IF;
  IF _st = 'approved' THEN
    SELECT * INTO _c FROM public.verification_cases WHERE worker_id = _worker ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      PERFORM public._verification_apply(_c.id, 'admin', COALESCE(_c.risk, 0), NULL, auth.uid());
    ELSE
      PERFORM set_config('meiyiyal.trusted','on', true);
      UPDATE public.workers SET status = 'approved', is_verified = true, is_active = true, decided_at = now(), review_note = _note,
        badge_tier = public.badge_tier_for(primary_node, reg_data), verified_at = COALESCE(verified_at, now())
      WHERE id = _worker;
      PERFORM set_config('meiyiyal.trusted','off', true);
      INSERT INTO public.admin_audit(actor, action, target, note) VALUES (auth.uid(), 'worker.approve', _worker, _note);
    END IF;
    IF _reg <> '' THEN
      INSERT INTO public.identity_fingerprints(kind, hash, worker_id) VALUES ('reg_no', _reg, _worker)
      ON CONFLICT (kind, hash) DO NOTHING;
    END IF;
    RETURN 'approved';
  END IF;
  PERFORM set_config('meiyiyal.trusted','on', true);
  UPDATE public.workers SET status = _st, is_verified = false, is_active = false, is_online = false,
    review_note = _note, decided_at = now(),
    badge_tier = CASE WHEN _st = 'approved' THEN badge_tier ELSE NULL END
  WHERE id = _worker;
  UPDATE public.kyc_verification SET status = CASE WHEN _st = 'rejected' THEN 'rejected'::kyc_status ELSE status END WHERE worker_id = _worker;
  PERFORM set_config('meiyiyal.trusted','off', true);
  SELECT * INTO _c FROM public.verification_cases WHERE worker_id = _worker AND status IN ('running','queued','needs_info','appealed') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.verification_cases SET
      status = CASE _st WHEN 'needs_info' THEN 'needs_info' WHEN 'rejected' THEN 'rejected' ELSE status END,
      decision = CASE WHEN _st = 'rejected' THEN 'reject' ELSE decision END,
      sla_paused_at = CASE WHEN _st = 'needs_info' THEN now() ELSE sla_paused_at END,
      decided_by = auth.uid(),
      decided_at = CASE WHEN _st = 'rejected' THEN now() ELSE decided_at END,
      purge_after = CASE WHEN _st = 'rejected' THEN now() + make_interval(days => public.setting_num('verify_retain_days', 30)::int) ELSE purge_after END
    WHERE id = _c.id;
  END IF;
  INSERT INTO public.admin_audit(actor, action, target, note) VALUES (auth.uid(), 'worker.' || _decision, _worker, _note);
  RETURN _st;
END $$;

-- Queue gains the case summary. Evidence JSON stays out; admins read checks separately.
DROP FUNCTION IF EXISTS public.admin_worker_queue(text);
CREATE OR REPLACE FUNCTION public.admin_worker_queue(_status text DEFAULT 'pending')
RETURNS TABLE(id uuid, display_name text, primary_node text, node_name jsonb, years_experience int, about text, reg_data jsonb, status text,
  submitted_at timestamptz, district_slug text, aadhaar_verified boolean, aadhaar_masked text, docs jsonb, photo_url text, email text, phone text,
  case_id uuid, case_status text, risk numeric, badge_tier text, sla_due_at timestamptz, checks jsonb, deep_link text, reason_codes text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT w.id, w.display_name, w.primary_node, t.name_i18n, w.years_experience, w.about, w.reg_data, w.status, w.submitted_at, w.district_slug,
    COALESCE(k.aadhaar_verified, false), 'XXXX-XXXX-' || k.aadhaar_last4,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.path, 'mime', d.mime) ORDER BY d.doc_type) FROM public.worker_documents d WHERE d.worker_id = w.id), '[]'),
    w.photo_url, p.email, p.phone_number,
    c.id, c.status, c.risk, w.badge_tier, c.sla_due_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('check', ck.check_name, 'status', ck.status, 'score', ck.score, 'reason', ck.evidence->>'reason', 'provider', ck.provider) ORDER BY ck.check_name)
      FROM public.verification_checks ck WHERE ck.case_id = c.id), '[]'::jsonb),
    (public.verification_rules_for(w.primary_node)->'registry'->'params'->>'deep_link'),
    c.reason_codes
  FROM public.workers w
  LEFT JOIN public.taxonomy_nodes t ON t.slug = w.primary_node
  LEFT JOIN public.kyc_verification k ON k.worker_id = w.id
  LEFT JOIN public.profiles p ON p.user_id = w.user_id
  LEFT JOIN LATERAL (SELECT * FROM public.verification_cases vc WHERE vc.worker_id = w.id ORDER BY vc.created_at DESC LIMIT 1) c ON true
  WHERE (_status = 'all' OR w.status = _status)
  ORDER BY w.submitted_at NULLS LAST;
END $$;

-- Public card / profile: one badge tier and the verified-on date. The public portrait is photo_url.
DROP FUNCTION IF EXISTS public.search_workers(text, double precision, double precision, double precision, boolean, int);
CREATE OR REPLACE FUNCTION public.search_workers(_node text, _lat double precision, _lng double precision,
  _radius_km double precision DEFAULT 50, _all boolean DEFAULT false, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, rewards_count int, years_experience int,
  primary_node text, specialty jsonb, is_online boolean, is_busy boolean, distance_km double precision, district_slug text, district_name jsonb, rates jsonb, badges jsonb,
  badge_tier text, verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography g)
  SELECT w.id, w.display_name, w.photo_url, w.rating, w.total_reviews, w.rewards_count, w.years_experience,
    w.primary_node, t.name_i18n,
    (w.is_online AND w.last_seen_at > now() - public.presence_window()) AS online,
    EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id = w.id AND s.status = 'active'),
    round((ST_Distance(w.base_geog, p.g) / 1000)::numeric, 1)::double precision,
    w.district_slug, d.name_i18n, public.rates_for(w.primary_node),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', m.slug, 'icon', m.icon, 'color', m.color, 'title', m.title_i18n) ORDER BY m.sort DESC)
              FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug = r.milestone WHERE r.worker_id = w.id), '[]'),
    w.badge_tier, w.verified_at
  FROM public.workers w CROSS JOIN p
  LEFT JOIN public.taxonomy_nodes t ON t.slug = w.primary_node
  LEFT JOIN public.tn_districts d ON d.slug = w.district_slug
  WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
    AND (w.blocked_until IS NULL OR w.blocked_until <= now())
    AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _node OR n.node_slug LIKE _node || '--%'))
    AND (_all OR ST_DWithin(w.base_geog, p.g, _radius_km * 1000))
  ORDER BY online DESC, w.flag_active, ST_Distance(w.base_geog, p.g), w.rating DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.worker_public(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; st record;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE id = _id AND status = 'approved' AND is_active;
  IF NOT FOUND OR (public.worker_is_blocked(_w) AND _w.user_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN RETURN NULL; END IF;
  SELECT * INTO st FROM public.worker_stats(_id);
  RETURN jsonb_build_object('id', _w.id, 'display_name', _w.display_name, 'photo_url', _w.photo_url, 'about', _w.about, 'years_experience', _w.years_experience,
    'primary_node', _w.primary_node, 'specialty', (SELECT name_i18n FROM public.taxonomy_nodes WHERE slug = _w.primary_node),
    'category', (SELECT name_i18n FROM public.taxonomy_nodes WHERE slug = public.node_category(_w.primary_node)),
    'district', (SELECT name_i18n FROM public.tn_districts WHERE slug = _w.district_slug),
    'is_online', (_w.is_online AND _w.last_seen_at > now() - public.presence_window()),
    'is_busy', EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id = _w.id AND s.status = 'active'),
    'joined_at', COALESCE(_w.decided_at, _w.created_at), 'rating', _w.rating, 'reviews', _w.total_reviews,
    'sessions_served', st.sessions_served, 'users_served', st.users_served, 'rates', public.rates_for(_w.primary_node),
    'council', COALESCE(_w.reg_data->>'council', _w.reg_data->>'bar_council'),
    'badge_tier', _w.badge_tier, 'verified_at', _w.verified_at,
    'rewards', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', m.slug, 'icon', m.icon, 'color', m.color, 'title', m.title_i18n, 'desc', m.desc_i18n, 'cert_no', r.cert_no, 'awarded_at', r.awarded_at) ORDER BY r.awarded_at DESC)
      FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug = r.milestone WHERE r.worker_id = _w.id), '[]'),
    'feedback', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT f.rating, f.tags, f.comment, f.created_at, COALESCE(NULLIF(split_part(p.full_name, ' ', 1), ''), 'User') AS by_name
      FROM public.consult_feedback f LEFT JOIN public.profiles p ON p.user_id = f.user_id
      WHERE f.worker_id = _w.id AND NOT f.is_complaint ORDER BY f.created_at DESC LIMIT 10) x), '[]'));
END $$;

-- Re-check registry on a schedule and immediately after a fake-profile / wrong-advice complaint.
CREATE OR REPLACE FUNCTION public.verification_enqueue_recheck(_worker uuid, _why text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid; _w public.workers;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE id = _worker AND status = 'approved';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.verification_cases WHERE worker_id = _worker AND status IN ('running','queued','appealed') AND kind = 'recheck') THEN
    SELECT id INTO _cid FROM public.verification_cases WHERE worker_id = _worker AND kind = 'recheck' AND status IN ('running','queued') LIMIT 1;
    RETURN _cid;
  END IF;
  INSERT INTO public.verification_cases(worker_id, status, sla_due_at, kind, reason_codes)
  VALUES (_worker, 'running', now() + interval '24 hours', 'recheck', ARRAY[_why])
  RETURNING id INTO _cid;
  INSERT INTO public.verification_jobs(case_id) VALUES (_cid);
  RETURN _cid;
END $$;

CREATE OR REPLACE FUNCTION public.verification_scan_rechecks() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int := 0; r record; _reg interval; _selfie interval;
BEGIN
  _reg := make_interval(days => public.setting_num('verify_registry_days', 90)::int);
  _selfie := make_interval(days => public.setting_num('verify_selfie_days', 180)::int);
  FOR r IN SELECT id FROM public.workers WHERE status = 'approved' AND verified_at IS NOT NULL AND verified_at < now() - _reg LOOP
    IF public.verification_enqueue_recheck(r.id, 'registry_due') IS NOT NULL THEN _n := _n + 1; END IF;
  END LOOP;
  FOR r IN SELECT id FROM public.workers WHERE status = 'approved' AND selfie_consent_at IS NOT NULL AND selfie_consent_at < now() - _selfie LOOP
    PERFORM public.verification_enqueue_recheck(id, 'selfie_due');
  END LOOP;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.verification_on_complaint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_complaint AND NEW.complaint_reason IN ('fake_profile','wrong_advice') THEN
    PERFORM public.verification_enqueue_recheck(NEW.worker_id, 'complaint:' || NEW.complaint_reason);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS verification_on_complaint ON public.consult_feedback;
CREATE TRIGGER verification_on_complaint AFTER INSERT ON public.consult_feedback
  FOR EACH ROW EXECUTE FUNCTION public.verification_on_complaint();

-- Raw QR and selfie objects are removed decision+30 days. Open appeals pause the clock.
-- The consented public portrait (avatars / public_selfie_path) is not touched.
CREATE OR REPLACE FUNCTION public.verification_purge_expired() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int := 0; r record;
BEGIN
  FOR r IN SELECT id, qr_path, raw_selfie_path FROM public.verification_cases
    WHERE purge_after IS NOT NULL AND purge_after < now() AND status NOT IN ('appealed','running','queued','needs_info')
      AND (qr_path IS NOT NULL OR raw_selfie_path IS NOT NULL)
  LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'kyc' AND name IN (r.qr_path, r.raw_selfie_path);
    UPDATE public.verification_cases SET qr_path = NULL, raw_selfie_path = NULL WHERE id = r.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

-- Case bundle for the verify service (service role). Includes paths, never a stored Aadhaar number.
CREATE OR REPLACE FUNCTION public.verification_case_bundle(_case uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.verification_cases; _w public.workers; _k public.kyc_verification; _i public.verification_intake;
BEGIN
  SELECT * INTO _c FROM public.verification_cases WHERE id = _case;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _w FROM public.workers WHERE id = _c.worker_id;
  SELECT * INTO _k FROM public.kyc_verification WHERE worker_id = _w.id;
  SELECT * INTO _i FROM public.verification_intake WHERE worker_id = _w.id;
  RETURN jsonb_build_object(
    'case_id', _c.id, 'worker_id', _w.id, 'user_id', _w.user_id, 'primary_node', _w.primary_node,
    'display_name', _w.display_name, 'reg_data', _w.reg_data, 'status', _w.status,
    'rules', public.verification_rules_for(_w.primary_node),
    'aadhaar_verified', COALESCE(_k.aadhaar_verified, false), 'aadhaar_last4', _k.aadhaar_last4,
    'qr_path', _c.qr_path, 'raw_selfie_path', _c.raw_selfie_path,
    'liveness_ok', _i.liveness_ok, 'public_portrait_url', _i.public_portrait_url,
    'docs', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.path)) FROM public.worker_documents d WHERE d.worker_id = _w.id), '[]'));
END $$;

REVOKE ALL ON FUNCTION public.verification_write_check(uuid, text, text, text, numeric, jsonb),
  public.verification_observe_fingerprint(uuid, text, text), public.verification_decide(uuid),
  public.verification_claim_job(), public.registry_cache_get(text, text, interval), public.registry_cache_put(text, text, jsonb),
  public._verification_apply(uuid, text, numeric, text, uuid), public.verification_enqueue_recheck(uuid, text),
  public.verification_scan_rechecks(), public.verification_purge_expired(), public.verification_case_bundle(uuid)
  FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.verification_liveness_challenge(), public.verification_stage_qr(text),
  public.verification_stage_selfie(text, text, boolean, boolean), public.my_verification(), public.verification_appeal(text),
  public.admin_decide_appeal(uuid, text, text), public.admin_worker_queue(text), public.badge_tier_for(text, jsonb)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.verification_liveness_challenge(), public.verification_stage_qr(text),
  public.verification_stage_selfie(text, text, boolean, boolean), public.my_verification(), public.verification_appeal(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_appeal(uuid, text, text), public.admin_worker_queue(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_workers(text, double precision, double precision, double precision, boolean, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.badge_tier_for(text, jsonb) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.verification_write_check(uuid, text, text, text, numeric, jsonb),
      public.verification_observe_fingerprint(uuid, text, text), public.verification_decide(uuid),
      public.verification_claim_job(), public.registry_cache_get(text, text, interval), public.registry_cache_put(text, text, jsonb),
      public.verification_enqueue_recheck(uuid, text), public.verification_scan_rechecks(), public.verification_purge_expired(),
      public.verification_case_bundle(uuid), public.my_verification() TO service_role;
  END IF;
END $$;
