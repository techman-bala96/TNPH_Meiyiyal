-- M3: rates (DB config), requests/ring, sessions with per-minute metering, calls, chat + files, history, presence.

-- ---------- rate cards (admin-editable, inherited down the taxonomy) ----------
CREATE TABLE public.rate_cards (
  node_slug text NOT NULL REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('chat','voice','video')),
  credits_per_min numeric(8,2) NOT NULL CHECK (credits_per_min > 0),
  band_min numeric(8,2), band_max numeric(8,2),
  min_minutes int NOT NULL DEFAULT 5 CHECK (min_minutes BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_slug, mode),
  CHECK (band_min IS NULL OR band_max IS NULL OR (band_min <= credits_per_min AND credits_per_min <= band_max))
);
ALTER TABLE public.rate_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read rates" ON public.rate_cards FOR SELECT USING (true);
CREATE POLICY "admin write rates" ON public.rate_cards FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.rate_for(_node text, _mode text)
RETURNS TABLE(node_slug text, credits_per_min numeric, min_minutes int) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE cur text := _node;
BEGIN
  WHILE cur IS NOT NULL LOOP
    RETURN QUERY SELECT r.node_slug, r.credits_per_min, r.min_minutes FROM public.rate_cards r WHERE r.node_slug = cur AND r.mode = _mode;
    IF FOUND THEN RETURN; END IF;
    SELECT t.parent_slug INTO cur FROM public.taxonomy_nodes t WHERE t.slug = cur;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.rates_for(_node text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_object_agg(m, (SELECT jsonb_build_object('rate', r.credits_per_min, 'min_minutes', r.min_minutes) FROM public.rate_for(_node, m) r))
  FROM unnest(ARRAY['chat','voice','video']) m $$;
GRANT EXECUTE ON FUNCTION public.rate_for(text,text), public.rates_for(text) TO anon, authenticated;

INSERT INTO public.app_settings(key,value) VALUES ('commission_pct','18'), ('dev_test_credits','true'), ('ring_seconds','45'), ('presence_seconds','120')
ON CONFLICT (key) DO NOTHING;

-- ---------- wallet helpers ----------
CREATE OR REPLACE FUNCTION public.wallet_id_for(_uid uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.wallets WHERE user_id = _uid;
  IF _id IS NULL THEN INSERT INTO public.wallets(user_id, balance) VALUES (_uid, 0) ON CONFLICT (user_id) DO NOTHING RETURNING id INTO _id;
    IF _id IS NULL THEN SELECT id INTO _id FROM public.wallets WHERE user_id=_uid; END IF; END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.wallet_id_for(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_wallet() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.wallets;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  PERFORM public.wallet_id_for(auth.uid());
  SELECT * INTO _w FROM public.wallets WHERE user_id = auth.uid();
  RETURN jsonb_build_object('balance', _w.balance, 'dev_test_credits', COALESCE((public.setting('dev_test_credits'))::text = 'true', false));
END $$;

-- Local/dev only: server grants test credits when app_settings.dev_test_credits = true. Never enabled in production.
CREATE OR REPLACE FUNCTION public.dev_grant_test_credits() RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF COALESCE(public.setting('dev_test_credits')::text,'false') <> 'true' THEN RAISE EXCEPTION 'test credits disabled' USING ERRCODE='42501'; END IF;
  _wid := public.wallet_id_for(auth.uid());
  SELECT balance INTO _bal FROM public.wallets WHERE id=_wid;
  IF _bal >= 200 THEN RETURN _bal; END IF;
  UPDATE public.wallets SET balance = balance + 500 WHERE id=_wid RETURNING balance INTO _bal;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description) VALUES (_wid,'credit',500,'Test credits (local only)');
  RETURN _bal;
END $$;

-- ---------- requests (ring) ----------
CREATE TABLE public.consult_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  worker_user_id uuid NOT NULL,
  node_slug text NOT NULL REFERENCES public.taxonomy_nodes(slug),
  mode text NOT NULL CHECK (mode IN ('chat','voice','video')),
  rate numeric(8,2) NOT NULL, min_minutes int NOT NULL,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','accepted','declined','timeout','cancelled')),
  user_name text, session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, responded_at timestamptz
);
CREATE INDEX consult_requests_worker_idx ON public.consult_requests(worker_id, status);
ALTER TABLE public.consult_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read requests" ON public.consult_requests FOR SELECT USING (auth.uid() IN (user_id, worker_user_id));

-- ---------- sessions ----------
CREATE TABLE public.consult_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE REFERENCES public.consult_requests(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  worker_user_id uuid NOT NULL,
  node_slug text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  current_mode text NOT NULL DEFAULT 'chat' CHECK (current_mode IN ('chat','voice','video')),
  commission_pct numeric(5,2) NOT NULL DEFAULT 18,
  credits_used numeric(10,2) NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, end_reason text
);
CREATE INDEX consult_sessions_user_idx ON public.consult_sessions(user_id, started_at DESC);
CREATE INDEX consult_sessions_worker_idx ON public.consult_sessions(worker_user_id, started_at DESC);
ALTER TABLE public.consult_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read sessions" ON public.consult_sessions FOR SELECT USING (auth.uid() IN (user_id, worker_user_id));

CREATE TABLE public.session_segments (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.consult_sessions(id) ON DELETE CASCADE,
  mode text NOT NULL, rate numeric(8,2) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  minutes_billed int NOT NULL DEFAULT 0, credits numeric(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX session_segments_open_idx ON public.session_segments(session_id) WHERE ended_at IS NULL;
ALTER TABLE public.session_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read segments" ON public.session_segments FOR SELECT USING (session_id IN (SELECT id FROM public.consult_sessions WHERE auth.uid() IN (user_id, worker_user_id)));

CREATE OR REPLACE FUNCTION public.is_session_party(_sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.consult_sessions WHERE id=_sid AND auth.uid() IN (user_id, worker_user_id)) $$;
GRANT EXECUTE ON FUNCTION public.is_session_party(uuid) TO authenticated;

-- ---------- calls ----------
CREATE TABLE public.session_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.consult_sessions(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('voice','video')),
  caller uuid NOT NULL,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','declined','missed','ended')),
  created_at timestamptz NOT NULL DEFAULT now(), answered_at timestamptz, ended_at timestamptz
);
CREATE UNIQUE INDEX session_calls_one_live ON public.session_calls(session_id) WHERE status IN ('ringing','active');
ALTER TABLE public.session_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read calls" ON public.session_calls FOR SELECT USING (public.is_session_party(session_id));

-- ---------- chat + files ----------
CREATE TABLE public.consult_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.consult_sessions(id) ON DELETE CASCADE,
  sender uuid NOT NULL DEFAULT auth.uid(),
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 4000),
  file_path text, file_name text, mime text, size_bytes int CHECK (size_bytes IS NULL OR size_bytes <= 20971520),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','file','system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR file_path IS NOT NULL)
);
CREATE INDEX consult_messages_session_idx ON public.consult_messages(session_id, created_at);
ALTER TABLE public.consult_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read messages" ON public.consult_messages FOR SELECT USING (public.is_session_party(session_id));
CREATE POLICY "parties send while active" ON public.consult_messages FOR INSERT WITH CHECK (
  sender = auth.uid() AND kind IN ('text','file')
  AND EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.id = session_id AND s.status='active' AND auth.uid() IN (s.user_id, s.worker_user_id))
  AND (file_path IS NULL OR file_path LIKE session_id::text || '/%'));

INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('consult-files','consult-files', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=EXCLUDED.file_size_limit;
CREATE POLICY "consult files parties read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='consult-files' AND public.is_session_party(((storage.foldername(name))[1])::uuid));
CREATE POLICY "consult files parties upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='consult-files' AND public.is_session_party(((storage.foldername(name))[1])::uuid)
    AND EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.id = ((storage.foldername(name))[1])::uuid AND s.status='active'));

-- ---------- presence ----------
CREATE OR REPLACE FUNCTION public.presence_window() RETURNS interval LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT make_interval(secs => COALESCE((public.setting('presence_seconds')#>>'{}')::int, 120)) $$;
GRANT EXECUTE ON FUNCTION public.presence_window() TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.worker_heartbeat() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET last_seen_at = now() WHERE user_id = auth.uid() AND is_online AND status='approved';
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN FOUND;
END $$;

-- search: presence window from config + busy flag
DROP FUNCTION IF EXISTS public.search_workers(text,double precision,double precision,double precision,boolean,int);
CREATE OR REPLACE FUNCTION public.search_workers(_node text, _lat double precision, _lng double precision,
  _radius_km double precision DEFAULT 50, _all boolean DEFAULT false, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, rewards_count int, years_experience int,
  primary_node text, specialty jsonb, is_online boolean, is_busy boolean, distance_km double precision, district_slug text, district_name jsonb, rates jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography g)
  SELECT w.id, w.display_name, w.photo_url, w.rating, w.total_reviews, w.rewards_count, w.years_experience,
    w.primary_node, t.name_i18n,
    (w.is_online AND w.last_seen_at > now() - public.presence_window()) AS online,
    EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id=w.id AND s.status='active'),
    round((ST_Distance(w.base_geog, p.g)/1000)::numeric, 1)::double precision,
    w.district_slug, d.name_i18n, public.rates_for(w.primary_node)
  FROM public.workers w CROSS JOIN p
  LEFT JOIN public.taxonomy_nodes t ON t.slug = w.primary_node
  LEFT JOIN public.tn_districts d ON d.slug = w.district_slug
  WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _node OR n.node_slug LIKE _node || '--%'))
    AND (_all OR ST_DWithin(w.base_geog, p.g, _radius_km * 1000))
  ORDER BY online DESC, ST_Distance(w.base_geog, p.g), w.rating DESC
  LIMIT LEAST(GREATEST(_limit,1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.search_workers(text,double precision,double precision,double precision,boolean,int) TO anon, authenticated;

-- ---------- request lifecycle ----------
CREATE OR REPLACE FUNCTION public.request_expire_due() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE public.consult_requests SET status='timeout', responded_at=now() WHERE status='ringing' AND expires_at < now() RETURNING 1) SELECT count(*)::int FROM u $$;

CREATE OR REPLACE FUNCTION public.request_create(_worker uuid, _mode text, _node text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _r record; _bal numeric; _id uuid; _name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('chat','voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  PERFORM public.request_expire_due();
  SELECT * INTO _w FROM public.workers WHERE id=_worker;
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active THEN RAISE EXCEPTION 'worker unavailable'; END IF;
  IF _w.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot request yourself'; END IF;
  IF NOT _w.is_online OR _w.last_seen_at < now() - public.presence_window() THEN RAISE EXCEPTION 'worker offline'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE worker_id=_worker AND status='active') THEN RAISE EXCEPTION 'worker busy'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_requests WHERE user_id=auth.uid() AND status='ringing') THEN RAISE EXCEPTION 'you already have a ringing request'; END IF;
  IF (SELECT count(*) FROM public.consult_requests WHERE user_id=auth.uid() AND created_at > now() - interval '10 minutes') >= 10 THEN RAISE EXCEPTION 'too many requests'; END IF;
  SELECT * INTO _r FROM public.rate_for(COALESCE(_node, _w.primary_node), _mode);
  IF _r IS NULL OR _r.credits_per_min IS NULL THEN RAISE EXCEPTION 'no rate configured'; END IF;
  PERFORM public.wallet_id_for(auth.uid());
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=auth.uid();
  IF _bal < _r.credits_per_min * _r.min_minutes THEN RAISE EXCEPTION 'insufficient credits: need % for % min', _r.credits_per_min * _r.min_minutes, _r.min_minutes; END IF;
  SELECT COALESCE(NULLIF(full_name,''), split_part(email,'@',1), 'User') INTO _name FROM public.profiles WHERE user_id=auth.uid();
  INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
  VALUES (auth.uid(), _worker, _w.user_id, _w.primary_node, _mode, _r.credits_per_min, _r.min_minutes, COALESCE(_name,'User'),
          now() + make_interval(secs => COALESCE((public.setting('ring_seconds')#>>'{}')::int, 45)))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.request_cancel(_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.consult_requests SET status='cancelled', responded_at=now() WHERE id=_id AND user_id=auth.uid() AND status='ringing' $$;

CREATE OR REPLACE FUNCTION public.request_respond(_id uuid, _accept boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _q public.consult_requests; _sid uuid; _comm numeric;
BEGIN
  PERFORM public.request_expire_due();
  SELECT * INTO _q FROM public.consult_requests WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR _q.worker_user_id <> auth.uid() THEN RAISE EXCEPTION 'not your request' USING ERRCODE='42501'; END IF;
  IF _q.status <> 'ringing' THEN RAISE EXCEPTION 'request is %', _q.status; END IF;
  IF NOT _accept THEN UPDATE public.consult_requests SET status='declined', responded_at=now() WHERE id=_id; RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE worker_id=_q.worker_id AND status='active') THEN RAISE EXCEPTION 'finish your current session first'; END IF;
  _comm := COALESCE((public.setting('commission_pct')#>>'{}')::numeric, 18);
  INSERT INTO public.consult_sessions(request_id,user_id,worker_id,worker_user_id,node_slug,current_mode,commission_pct)
  VALUES (_id,_q.user_id,_q.worker_id,_q.worker_user_id,_q.node_slug,_q.mode,_comm) RETURNING id INTO _sid;
  INSERT INTO public.session_segments(session_id,mode,rate) VALUES (_sid,_q.mode,_q.rate);
  IF _q.mode IN ('voice','video') THEN
    INSERT INTO public.session_calls(session_id,mode,caller,status,answered_at) VALUES (_sid,_q.mode,_q.user_id,'active',now());
  END IF;
  INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid,auth.uid(),'session_started','system');
  UPDATE public.consult_requests SET status='accepted', responded_at=now(), session_id=_sid WHERE id=_id;
  RETURN _sid;
END $$;

-- ---------- metering ----------
-- Bills the open segment up to now (per started minute). Ends the session when the user runs out.
CREATE OR REPLACE FUNCTION public.session_bill_internal(_sid uuid, _close boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _g public.session_segments; _mins int; _due numeric; _bal numeric; _uw uuid; _ww uuid; _pay numeric; _exhausted boolean := false;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  SELECT * INTO _g FROM public.session_segments WHERE session_id=_sid AND ended_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF _s.status = 'active' AND _g.id IS NOT NULL THEN
    _mins := GREATEST(1, ceil(extract(epoch FROM (now() - _g.started_at)) / 60.0)::int);
    _due := (_mins - _g.minutes_billed) * _g.rate;
    IF _due > 0 THEN
      _uw := public.wallet_id_for(_s.user_id); _ww := public.wallet_id_for(_s.worker_user_id);
      SELECT balance INTO _bal FROM public.wallets WHERE id=_uw FOR UPDATE;
      IF _bal < _due THEN  -- bill only whole minutes the user can still afford
        _mins := _g.minutes_billed + floor(_bal / _g.rate)::int; _due := (_mins - _g.minutes_billed) * _g.rate; _exhausted := true;
      END IF;
      IF _due > 0 THEN
        _pay := round(_due * (1 - _s.commission_pct/100), 2);
        UPDATE public.wallets SET balance = balance - _due WHERE id=_uw;
        UPDATE public.wallets SET balance = balance + _pay WHERE id=_ww;
        INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES
          (_uw,'debit',-_due, _g.mode || ' consult ' || (_mins - _g.minutes_billed) || ' min', _sid::text),
          (_ww,'credit',_pay, _g.mode || ' earnings ' || (_mins - _g.minutes_billed) || ' min (after ' || _s.commission_pct || '% fee)', _sid::text);
        UPDATE public.session_segments SET minutes_billed=_mins, credits = credits + _due WHERE id=_g.id;
        UPDATE public.consult_sessions SET credits_used = credits_used + _due WHERE id=_sid;
      END IF;
    END IF;
    IF _close OR _exhausted THEN UPDATE public.session_segments SET ended_at=now() WHERE id=_g.id; END IF;
    IF _exhausted THEN
      UPDATE public.session_calls SET status='ended', ended_at=now() WHERE session_id=_sid AND status IN ('ringing','active');
      UPDATE public.consult_sessions SET status='ended', ended_at=now(), end_reason='credits_exhausted' WHERE id=_sid;
      INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid,_s.user_id,'credits_exhausted','system');
    END IF;
  END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=_s.user_id;
  SELECT * INTO _g FROM public.session_segments WHERE session_id=_sid ORDER BY id DESC LIMIT 1;
  RETURN jsonb_build_object('status',_s.status,'credits_used',_s.credits_used,'mode',_s.current_mode,'rate',_g.rate,
    'balance', CASE WHEN auth.uid() = _s.user_id THEN _bal END,
    'minutes_left', CASE WHEN auth.uid() = _s.user_id AND _g.rate > 0 THEN floor(_bal / _g.rate) END, 'end_reason', _s.end_reason);
END $$;
REVOKE ALL ON FUNCTION public.session_bill_internal(uuid,boolean) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.session_tick(_sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  RETURN public.session_bill_internal(_sid, false);
END $$;

CREATE OR REPLACE FUNCTION public.session_switch_mode(_sid uuid, _mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _r record;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.status <> 'active' OR _s.current_mode = _mode THEN RETURN; END IF;
  PERFORM public.session_bill_internal(_sid, true);
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.status <> 'active' THEN RETURN; END IF;
  SELECT * INTO _r FROM public.rate_for(_s.node_slug, _mode);
  INSERT INTO public.session_segments(session_id,mode,rate) VALUES (_sid,_mode,_r.credits_per_min);
  UPDATE public.consult_sessions SET current_mode=_mode WHERE id=_sid;
END $$;
REVOKE ALL ON FUNCTION public.session_switch_mode(uuid,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.session_end(_sid uuid, _reason text DEFAULT 'ended') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb;
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  _r := public.session_bill_internal(_sid, true);
  UPDATE public.session_calls SET status='ended', ended_at=now() WHERE session_id=_sid AND status IN ('ringing','active');
  UPDATE public.consult_sessions SET status='ended', ended_at=COALESCE(ended_at, now()), end_reason=COALESCE(end_reason, left(_reason,40)) WHERE id=_sid AND status='active';
  RETURN public.session_bill_internal(_sid, false);
END $$;

-- ---------- calls ----------
CREATE OR REPLACE FUNCTION public.call_start(_sid uuid, _mode text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _s public.consult_sessions; _r record; _bal numeric;
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.status <> 'active' THEN RAISE EXCEPTION 'session ended'; END IF;
  SELECT * INTO _r FROM public.rate_for(_s.node_slug, _mode);
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=_s.user_id;
  IF _bal < _r.credits_per_min THEN RAISE EXCEPTION 'insufficient credits for %', _mode; END IF;
  UPDATE public.session_calls SET status='missed', ended_at=now() WHERE session_id=_sid AND status='ringing' AND created_at < now() - interval '45 seconds';
  INSERT INTO public.session_calls(session_id,mode,caller) VALUES (_sid,_mode,auth.uid()) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.call_answer(_call uuid, _accept boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.session_calls;
BEGIN
  SELECT * INTO _c FROM public.session_calls WHERE id=_call FOR UPDATE;
  IF NOT FOUND OR NOT public.is_session_party(_c.session_id) OR _c.caller = auth.uid() THEN RAISE EXCEPTION 'not your call' USING ERRCODE='42501'; END IF;
  IF _c.status <> 'ringing' THEN RETURN _c.status; END IF;
  IF NOT _accept THEN UPDATE public.session_calls SET status='declined', ended_at=now() WHERE id=_call; RETURN 'declined'; END IF;
  UPDATE public.session_calls SET status='active', answered_at=now() WHERE id=_call;
  PERFORM public.session_switch_mode(_c.session_id, _c.mode);
  RETURN 'active';
END $$;

CREATE OR REPLACE FUNCTION public.call_end(_call uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.session_calls;
BEGIN
  SELECT * INTO _c FROM public.session_calls WHERE id=_call FOR UPDATE;
  IF NOT FOUND OR NOT public.is_session_party(_c.session_id) THEN RAISE EXCEPTION 'not your call' USING ERRCODE='42501'; END IF;
  IF _c.status NOT IN ('ringing','active') THEN RETURN _c.status; END IF;
  UPDATE public.session_calls SET status = CASE WHEN _c.status='ringing' THEN 'missed' ELSE 'ended' END, ended_at=now() WHERE id=_call;
  IF _c.status = 'active' THEN PERFORM public.session_switch_mode(_c.session_id, 'chat'); END IF;
  RETURN 'ended';
END $$;

-- ---------- views for clients ----------
CREATE OR REPLACE FUNCTION public.session_info(_sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _w public.workers; _me text; _uname text;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF NOT FOUND OR auth.uid() NOT IN (_s.user_id, _s.worker_user_id) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  SELECT * INTO _w FROM public.workers WHERE id=_s.worker_id;
  SELECT user_name INTO _uname FROM public.consult_requests WHERE id=_s.request_id;
  _me := CASE WHEN auth.uid() = _s.user_id THEN 'user' ELSE 'worker' END;
  RETURN jsonb_build_object('id',_s.id,'role',_me,'status',_s.status,'mode',_s.current_mode,'started_at',_s.started_at,'ended_at',_s.ended_at,
    'credits_used',_s.credits_used,'end_reason',_s.end_reason,'node_slug',_s.node_slug,
    'node_name',(SELECT name_i18n FROM public.taxonomy_nodes WHERE slug=_s.node_slug),
    'rates', public.rates_for(_s.node_slug),
    'other', CASE WHEN _me='user' THEN jsonb_build_object('name',_w.display_name,'photo',_w.photo_url,'user_id',_s.worker_user_id)
                  ELSE jsonb_build_object('name',COALESCE(_uname,'User'),'photo',(SELECT avatar_url FROM public.profiles WHERE user_id=_s.user_id),'user_id',_s.user_id) END);
END $$;

CREATE OR REPLACE FUNCTION public.my_history() RETURNS TABLE(id uuid, role text, other_name text, other_photo text, node_slug text, node_name jsonb, category_name jsonb,
  modes text[], started_at timestamptz, ended_at timestamptz, duration_sec int, credits numeric, earned numeric, status text, end_reason text, messages int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, CASE WHEN s.user_id=auth.uid() THEN 'user' ELSE 'worker' END,
    CASE WHEN s.user_id=auth.uid() THEN w.display_name ELSE COALESCE(q.user_name,'User') END,
    CASE WHEN s.user_id=auth.uid() THEN w.photo_url ELSE (SELECT avatar_url FROM public.profiles WHERE user_id=s.user_id) END,
    s.node_slug, t.name_i18n, (SELECT name_i18n FROM public.taxonomy_nodes WHERE slug = public.node_category(s.node_slug)),
    ARRAY(SELECT DISTINCT g.mode FROM public.session_segments g WHERE g.session_id=s.id ORDER BY 1),
    s.started_at, s.ended_at, extract(epoch FROM (COALESCE(s.ended_at, now()) - s.started_at))::int,
    s.credits_used, round(s.credits_used * (1 - s.commission_pct/100), 2), s.status, s.end_reason,
    (SELECT count(*)::int FROM public.consult_messages m WHERE m.session_id=s.id AND m.kind <> 'system')
  FROM public.consult_sessions s JOIN public.workers w ON w.id=s.worker_id
  LEFT JOIN public.consult_requests q ON q.id=s.request_id
  LEFT JOIN public.taxonomy_nodes t ON t.slug=s.node_slug
  WHERE auth.uid() IN (s.user_id, s.worker_user_id)
  ORDER BY s.started_at DESC LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.my_active_session() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.consult_sessions WHERE status='active' AND auth.uid() IN (user_id, worker_user_id) ORDER BY started_at DESC LIMIT 1 $$;

-- grants
REVOKE ALL ON FUNCTION public.my_wallet(), public.dev_grant_test_credits(), public.request_create(uuid,text,text), public.request_cancel(uuid), public.request_respond(uuid,boolean),
  public.request_expire_due(), public.session_tick(uuid), public.session_end(uuid,text), public.call_start(uuid,text), public.call_answer(uuid,boolean), public.call_end(uuid),
  public.session_info(uuid), public.my_history(), public.my_active_session(), public.worker_heartbeat() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_wallet(), public.dev_grant_test_credits(), public.request_create(uuid,text,text), public.request_cancel(uuid), public.request_respond(uuid,boolean),
  public.request_expire_due(), public.session_tick(uuid), public.session_end(uuid,text), public.call_start(uuid,text), public.call_answer(uuid,boolean), public.call_end(uuid),
  public.session_info(uuid), public.my_history(), public.my_active_session(), public.worker_heartbeat() TO authenticated;

-- ---------- realtime ----------
ALTER TABLE public.consult_requests REPLICA IDENTITY FULL;
ALTER TABLE public.session_calls REPLICA IDENTITY FULL;
ALTER TABLE public.consult_sessions REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consult_requests, public.consult_sessions, public.session_calls, public.consult_messages;
  END IF;
END $$;
-- private broadcast channels "call:<session_id>" (WebRTC signaling) only for the two parties
CREATE POLICY "call signaling parties read" ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() LIKE 'call:%' AND public.is_session_party(substr(realtime.topic(), 6)::uuid));
CREATE POLICY "call signaling parties send" ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() LIKE 'call:%' AND public.is_session_party(substr(realtime.topic(), 6)::uuid));
