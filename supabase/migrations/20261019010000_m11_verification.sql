-- M11 · verification completion
-- * Active liveness: server-issued nonce + random 3-step sequence, frames staged per step.
-- * Job lifecycle (finish / retry with backoff / dead), stale-lock release.
-- * Dispatcher: pg_net kick to the verify service + pg_cron schedules (dispatch, rechecks, retention).
-- * Retention through the Storage API: SQL only lists what is due and marks it done
--   (Supabase blocks direct DELETE on storage.objects, which broke the M7 purge).
-- * Fix: verification_scan_rechecks used a bare `id` in the selfie loop.
-- * KYC edge-function RPCs (service role only) so `kyc_provider = 'edge'` works with any adapter.
-- * Admin: appeals list + raw media paths for a case.

INSERT INTO public.app_settings(key, value) VALUES
  ('verify_service_url', '""'),
  ('verify_service_key', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex'))),
  ('verify_registry_adapters', '{}'),
  ('verify_liveness_window_seconds', '180'),
  ('verify_job_max_attempts', '5'),
  ('kyc_edge_sends_per_hour', '5')
ON CONFLICT (key) DO NOTHING;

-- ---------- active liveness ----------
ALTER TABLE public.verification_intake
  ADD COLUMN IF NOT EXISTS liveness_nonce text,
  ADD COLUMN IF NOT EXISTS liveness_steps text[],
  ADD COLUMN IF NOT EXISTS liveness_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS liveness_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS liveness_frames jsonb;
ALTER TABLE public.verification_cases
  ADD COLUMN IF NOT EXISTS live_frames jsonb,
  ADD COLUMN IF NOT EXISTS live_steps text[],
  ADD COLUMN IF NOT EXISTS live_window_ok boolean;

CREATE OR REPLACE FUNCTION public.verification_liveness_start() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _pool text[] := ARRAY['blink','turn_left','turn_right','smile','look_up']; _steps text[] := '{}'; _s text; _nonce text;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  WHILE coalesce(array_length(_steps, 1), 0) < 3 LOOP
    _s := _pool[1 + floor(random() * array_length(_pool, 1))::int];
    IF NOT _s = ANY(_steps) THEN _steps := _steps || _s; END IF;
  END LOOP;
  _nonce := encode(extensions.gen_random_bytes(12), 'hex');
  INSERT INTO public.verification_intake(worker_id, liveness_challenge, liveness_ok, liveness_nonce, liveness_steps, liveness_issued_at, liveness_done_at, liveness_frames)
  VALUES (_wid, array_to_string(_steps, ','), false, _nonce, _steps, now(), NULL, NULL)
  ON CONFLICT (worker_id) DO UPDATE SET liveness_challenge = EXCLUDED.liveness_challenge, liveness_ok = false, liveness_nonce = EXCLUDED.liveness_nonce,
    liveness_steps = EXCLUDED.liveness_steps, liveness_issued_at = now(), liveness_done_at = NULL, liveness_frames = NULL, updated_at = now();
  RETURN jsonb_build_object('nonce', _nonce, 'steps', to_jsonb(_steps), 'expires_in', public.setting_num('verify_liveness_window_seconds', 180)::int);
END $$;

-- _frames: [{"step":"blink","path":"<uid>/live-<nonce>-blink-0.jpg"}, ...]. Every step needs at least one frame.
CREATE OR REPLACE FUNCTION public.verification_stage_liveness(_nonce text, _frames jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _i public.verification_intake; _f jsonb; _s text; _win int := public.setting_num('verify_liveness_window_seconds', 180)::int;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = auth.uid() AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  SELECT * INTO _i FROM public.verification_intake WHERE worker_id = _wid;
  IF NOT FOUND OR _i.liveness_nonce IS NULL OR _i.liveness_nonce IS DISTINCT FROM _nonce THEN RAISE EXCEPTION 'start the liveness check again'; END IF;
  IF _i.liveness_issued_at < now() - make_interval(secs => _win) THEN RAISE EXCEPTION 'liveness check expired'; END IF;
  IF jsonb_typeof(_frames) <> 'array' OR jsonb_array_length(_frames) > 30 THEN RAISE EXCEPTION 'bad frames'; END IF;
  FOR _f IN SELECT * FROM jsonb_array_elements(_frames) LOOP
    IF NOT (_f->>'step') = ANY(_i.liveness_steps) THEN RAISE EXCEPTION 'unknown step'; END IF;
    IF (_f->>'path') IS NULL OR (_f->>'path') NOT LIKE auth.uid()::text || '/%' OR (_f->>'path') LIKE '%..%' THEN RAISE EXCEPTION 'bad path'; END IF;
  END LOOP;
  FOREACH _s IN ARRAY _i.liveness_steps LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_frames) e WHERE e->>'step' = _s) THEN RAISE EXCEPTION 'missing frames for %', _s; END IF;
  END LOOP;
  UPDATE public.verification_intake SET liveness_frames = _frames, liveness_done_at = now(), liveness_ok = true, updated_at = now() WHERE worker_id = _wid;
  RETURN 'staged';
END $$;

-- ---------- submit snapshots liveness onto the case ----------
CREATE OR REPLACE FUNCTION public.worker_submit() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; req jsonb; item jsonb; missing text[] := '{}'; _intake public.verification_intake; _cid uuid; _win_ok boolean;
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
  IF NOT EXISTS (SELECT 1 FROM public.kyc_verification WHERE worker_id = _w.id AND aadhaar_verified) THEN missing := missing || 'aadhaar'::text; END IF;
  IF array_length(missing,1) > 0 THEN RAISE EXCEPTION 'missing: %', array_to_string(missing, ', '); END IF;
  SELECT * INTO _intake FROM public.verification_intake WHERE worker_id = _w.id;
  _win_ok := _intake.liveness_done_at IS NOT NULL AND _intake.liveness_issued_at IS NOT NULL
    AND _intake.liveness_done_at - _intake.liveness_issued_at <= make_interval(secs => public.setting_num('verify_liveness_window_seconds', 180)::int);
  PERFORM set_config('meiyiyal.trusted','on', true);
  UPDATE public.workers SET status = 'pending', submitted_at = COALESCE(submitted_at, now()), review_note = NULL,
    photo_url = COALESCE(_intake.public_portrait_url, (SELECT avatar_url FROM public.profiles WHERE user_id = auth.uid()), photo_url)
  WHERE id = _w.id;
  PERFORM set_config('meiyiyal.trusted','off', true);
  SELECT id INTO _cid FROM public.verification_cases WHERE worker_id = _w.id AND status IN ('running','queued','needs_info','appealed') LIMIT 1;
  IF _cid IS NULL THEN
    INSERT INTO public.verification_cases(worker_id, status, sla_due_at, qr_path, raw_selfie_path, live_frames, live_steps, live_window_ok)
    VALUES (_w.id, 'running', now() + interval '24 hours', _intake.qr_path, _intake.raw_selfie_path, _intake.liveness_frames, _intake.liveness_steps, _win_ok)
    RETURNING id INTO _cid;
  ELSE
    UPDATE public.verification_cases SET status = 'running', sla_due_at = now() + interval '24 hours', sla_paused_at = NULL,
      qr_path = COALESCE(_intake.qr_path, qr_path), raw_selfie_path = COALESCE(_intake.raw_selfie_path, raw_selfie_path),
      live_frames = COALESCE(_intake.liveness_frames, live_frames), live_steps = COALESCE(_intake.liveness_steps, live_steps),
      live_window_ok = COALESCE(_win_ok, live_window_ok)
    WHERE id = _cid;
  END IF;
  INSERT INTO public.verification_jobs(case_id) VALUES (_cid);
  PERFORM public.verification_kick();
  RETURN 'pending';
END $$;

-- ---------- bundle for the verify service ----------
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
    'case_id', _c.id, 'kind', _c.kind, 'worker_id', _w.id, 'user_id', _w.user_id, 'primary_node', _w.primary_node,
    'display_name', _w.display_name, 'reg_data', _w.reg_data, 'status', _w.status,
    'rules', public.verification_rules_for(_w.primary_node),
    'aadhaar_verified', COALESCE(_k.aadhaar_verified, false), 'aadhaar_last4', _k.aadhaar_last4,
    'qr_path', _c.qr_path, 'raw_selfie_path', _c.raw_selfie_path,
    'liveness_ok', _i.liveness_ok, 'public_portrait_url', _i.public_portrait_url,
    'liveness_steps', to_jsonb(_c.live_steps), 'liveness_frames', COALESCE(_c.live_frames, '[]'::jsonb), 'liveness_window_ok', _c.live_window_ok,
    'docs', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.path)) FROM public.worker_documents d WHERE d.worker_id = _w.id), '[]'));
END $$;

-- ---------- job lifecycle ----------
CREATE OR REPLACE FUNCTION public.verification_job_finish(_job uuid, _ok boolean, _error text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _j public.verification_jobs; _max int := public.setting_num('verify_job_max_attempts', 5)::int;
BEGIN
  SELECT * INTO _j FROM public.verification_jobs WHERE id = _job FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF _ok THEN
    UPDATE public.verification_jobs SET status = 'done', locked_at = NULL, last_error = NULL WHERE id = _job;
    RETURN 'done';
  END IF;
  IF _j.attempts >= _max THEN
    UPDATE public.verification_jobs SET status = 'dead', locked_at = NULL, last_error = left(_error, 300) WHERE id = _job;
    -- The case stays visible in the admin queue; mark it so a human looks at it.
    UPDATE public.verification_cases SET status = 'queued', reason_codes = array_append(COALESCE(reason_codes, '{}'), 'service_error')
      WHERE id = _j.case_id AND status = 'running';
    RETURN 'dead';
  END IF;
  UPDATE public.verification_jobs SET status = 'queued', locked_at = NULL, last_error = left(_error, 300),
    run_after = now() + make_interval(secs => least(3600, 30 * power(2, _j.attempts)::int)) WHERE id = _job;
  RETURN 'retry';
END $$;

-- Wake the verify service. No-op without pg_net or a configured URL (the service's poll loop covers that case).
CREATE OR REPLACE FUNCTION public.verification_kick(_path text DEFAULT '/verify/dispatch') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text := public.setting('verify_service_url') #>> '{}'; _key text := public.setting('verify_service_key') #>> '{}';
BEGIN
  IF _url IS NULL OR _url = '' OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    USING rtrim(_url, '/') || _path, '{"kick":true}'::jsonb,
      jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || COALESCE(_key, ''));
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'verification_kick failed: %', SQLERRM;
END $$;

-- Every minute: release stale locks, then kick if anything is runnable.
CREATE OR REPLACE FUNCTION public.verification_dispatch() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE public.verification_jobs SET status = 'queued', locked_at = NULL, last_error = 'lock expired'
    WHERE status = 'running' AND locked_at < now() - interval '10 minutes';
  SELECT count(*) INTO _n FROM public.verification_jobs WHERE status = 'queued' AND run_after <= now();
  IF _n > 0 THEN PERFORM public.verification_kick(); END IF;
  RETURN _n;
END $$;

-- ---------- rechecks (bug fix: r.id) ----------
CREATE OR REPLACE FUNCTION public.verification_scan_rechecks() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int := 0; r record; _reg interval; _selfie interval;
BEGIN
  _reg := make_interval(days => public.setting_num('verify_registry_days', 90)::int);
  _selfie := make_interval(days => public.setting_num('verify_selfie_days', 180)::int);
  FOR r IN SELECT w.id FROM public.workers w WHERE w.status = 'approved' AND w.verified_at IS NOT NULL AND w.verified_at < now() - _reg
    AND NOT EXISTS (SELECT 1 FROM public.verification_cases c WHERE c.worker_id = w.id AND c.kind = 'recheck' AND c.created_at > now() - _reg) LOOP
    IF public.verification_enqueue_recheck(r.id, 'registry_due') IS NOT NULL THEN _n := _n + 1; END IF;
  END LOOP;
  FOR r IN SELECT w.id FROM public.workers w WHERE w.status = 'approved' AND w.selfie_consent_at IS NOT NULL AND w.selfie_consent_at < now() - _selfie
    AND NOT EXISTS (SELECT 1 FROM public.verification_cases c WHERE c.worker_id = w.id AND c.kind = 'recheck' AND c.created_at > now() - _selfie) LOOP
    IF public.verification_enqueue_recheck(r.id, 'selfie_due') IS NOT NULL THEN _n := _n + 1; END IF;
  END LOOP;
  IF _n > 0 THEN PERFORM public.verification_kick(); END IF;
  RETURN _n;
END $$;

-- ---------- retention through the Storage API ----------
-- Raw QR, raw selfie and liveness frames are deleted decision + 30 days (purge_after). Open appeals pause it.
-- The consented public portrait is not touched.
CREATE OR REPLACE FUNCTION public.verification_purge_due(_limit int DEFAULT 50) RETURNS TABLE(case_id uuid, paths text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, array_remove(ARRAY[c.qr_path, c.raw_selfie_path] || COALESCE(ARRAY(SELECT e->>'path' FROM jsonb_array_elements(c.live_frames) e), '{}'), NULL)
  FROM public.verification_cases c
  WHERE c.purge_after IS NOT NULL AND c.purge_after < now() AND c.status NOT IN ('appealed','running','queued','needs_info')
    AND (c.qr_path IS NOT NULL OR c.raw_selfie_path IS NOT NULL OR c.live_frames IS NOT NULL)
  ORDER BY c.purge_after LIMIT greatest(1, least(_limit, 500)) $$;

CREATE OR REPLACE FUNCTION public.verification_purge_mark(_case uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid;
BEGIN
  UPDATE public.verification_cases SET qr_path = NULL, raw_selfie_path = NULL, live_frames = NULL WHERE id = _case RETURNING worker_id INTO _wid;
  -- Intake copies point at the same objects; clear them unless the worker is mid-resubmission.
  UPDATE public.verification_intake i SET qr_path = NULL, raw_selfie_path = NULL, liveness_frames = NULL, updated_at = now()
    WHERE i.worker_id = _wid AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = _wid AND w.status IN ('draft','needs_info'));
END $$;

-- Kept for compatibility: no longer touches storage, returns how many cases are due.
CREATE OR REPLACE FUNCTION public.verification_purge_expired() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.verification_purge_due(500);
  IF _n > 0 THEN PERFORM public.verification_kick('/verify/maintenance'); END IF;
  RETURN _n;
END $$;

-- ---------- KYC edge function (service role) ----------
CREATE OR REPLACE FUNCTION public.kyc_edge_start(_user uuid, _aadhaar text, _provider text, _ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _a text := regexp_replace(COALESCE(_aadhaar,''),'\D','','g'); _s public.kyc_otp_sessions;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = _user AND status IN ('draft','needs_info');
  IF _wid IS NULL THEN RAISE EXCEPTION 'register first'; END IF;
  IF _a !~ '^[2-9][0-9]{11}$' THEN RAISE EXCEPTION 'invalid aadhaar'; END IF;
  SELECT * INTO _s FROM public.kyc_otp_sessions WHERE worker_id = _wid;
  IF FOUND AND _s.sends >= public.setting_num('kyc_edge_sends_per_hour', 5) AND _s.created_at > now() - interval '1 hour' THEN
    RAISE EXCEPTION 'too many OTP requests, try later';
  END IF;
  INSERT INTO public.kyc_otp_sessions(worker_id, aadhaar_hash, last4, provider_ref, expires_at)
  VALUES (_wid, encode(extensions.digest((public.setting('aadhaar_pepper')#>>'{}') || _a,'sha256'),'hex'), right(_a,4),
          left(_provider, 30) || ':' || left(COALESCE(_ref,''), 200), now() + interval '10 minutes')
  ON CONFLICT (worker_id) DO UPDATE SET aadhaar_hash = EXCLUDED.aadhaar_hash, last4 = EXCLUDED.last4, attempts = 0, expires_at = EXCLUDED.expires_at,
    provider_ref = EXCLUDED.provider_ref,
    sends = CASE WHEN kyc_otp_sessions.created_at > now() - interval '1 hour' THEN kyc_otp_sessions.sends + 1 ELSE 1 END;
  RETURN jsonb_build_object('masked', 'XXXX-XXXX-' || right(_a,4), 'expires_in', 600);
END $$;

-- Rate-limit check before the provider is called (so a send that is going to be refused costs nothing).
CREATE OR REPLACE FUNCTION public.kyc_edge_can_send(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.kyc_otp_sessions s JOIN public.workers w ON w.id = s.worker_id
    WHERE w.user_id = _user AND s.sends >= public.setting_num('kyc_edge_sends_per_hour', 5) AND s.created_at > now() - interval '1 hour') $$;

CREATE OR REPLACE FUNCTION public.kyc_edge_session(_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('provider', split_part(s.provider_ref, ':', 1), 'ref', substr(s.provider_ref, strpos(s.provider_ref, ':') + 1),
    'expired', s.expires_at < now(), 'attempts', s.attempts, 'last4', s.last4)
  FROM public.kyc_otp_sessions s JOIN public.workers w ON w.id = s.worker_id
  WHERE w.user_id = _user AND w.status IN ('draft','needs_info') $$;

CREATE OR REPLACE FUNCTION public.kyc_edge_confirm(_user uuid, _ok boolean, _legal_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wid uuid; _s public.kyc_otp_sessions;
BEGIN
  SELECT id INTO _wid FROM public.workers WHERE user_id = _user AND status IN ('draft','needs_info');
  SELECT * INTO _s FROM public.kyc_otp_sessions WHERE worker_id = _wid;
  IF NOT FOUND THEN RAISE EXCEPTION 'send OTP first'; END IF;
  IF _s.expires_at < now() THEN RAISE EXCEPTION 'OTP expired'; END IF;
  IF _s.attempts >= 5 THEN RAISE EXCEPTION 'too many attempts'; END IF;
  IF NOT _ok THEN
    UPDATE public.kyc_otp_sessions SET attempts = attempts + 1 WHERE worker_id = _wid;
    RETURN jsonb_build_object('ok', false);
  END IF;
  PERFORM set_config('meiyiyal.trusted', 'on', true);
  INSERT INTO public.kyc_verification(worker_id, aadhaar_number_hash, aadhaar_last4, aadhaar_verified, provider, status, legal_name)
  VALUES (_wid, _s.aadhaar_hash, _s.last4, true, split_part(_s.provider_ref, ':', 1), 'pending', NULLIF(btrim(_legal_name), ''))
  ON CONFLICT (worker_id) DO UPDATE SET aadhaar_number_hash = EXCLUDED.aadhaar_number_hash, aadhaar_last4 = EXCLUDED.aadhaar_last4,
    aadhaar_verified = true, provider = EXCLUDED.provider, legal_name = COALESCE(EXCLUDED.legal_name, kyc_verification.legal_name), updated_at = now();
  PERFORM set_config('meiyiyal.trusted', 'off', true);
  DELETE FROM public.kyc_otp_sessions WHERE worker_id = _wid;
  RETURN jsonb_build_object('ok', true, 'masked', 'XXXX-XXXX-' || _s.last4);
END $$;

-- ---------- admin: appeals + raw media ----------
CREATE OR REPLACE FUNCTION public.admin_appeals(_status text DEFAULT 'open')
RETURNS TABLE(appeal_id uuid, case_id uuid, worker_id uuid, display_name text, primary_node text, note text, status text,
  sla_due_at timestamptz, created_at timestamptz, decided_at timestamptz, rejected_by uuid, rejected_by_me boolean, rejection_note text,
  reason_codes text[], checks jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.id, a.case_id, a.worker_id, w.display_name, w.primary_node, a.note, a.status, a.sla_due_at, a.created_at, a.decided_at,
    c.decided_by, c.decided_by IS NOT DISTINCT FROM auth.uid(), w.review_note, c.reason_codes,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('check', ck.check_name, 'status', ck.status, 'reason', ck.evidence->>'reason') ORDER BY ck.check_name)
      FROM public.verification_checks ck WHERE ck.case_id = c.id), '[]'::jsonb)
  FROM public.verification_appeals a
  JOIN public.verification_cases c ON c.id = a.case_id
  JOIN public.workers w ON w.id = a.worker_id
  WHERE _status = 'all' OR a.status = _status
  ORDER BY a.sla_due_at;
END $$;

CREATE OR REPLACE FUNCTION public.admin_case_media(_case uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.verification_cases;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _c FROM public.verification_cases WHERE id = _case;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'verification.view_media', _c.worker_id, NULL, jsonb_build_object('case', _case));
  RETURN jsonb_build_object('raw_selfie_path', _c.raw_selfie_path, 'frames', COALESCE(_c.live_frames, '[]'::jsonb),
    'steps', to_jsonb(_c.live_steps), 'window_ok', _c.live_window_ok, 'purged', _c.raw_selfie_path IS NULL AND _c.live_frames IS NULL);
END $$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public.verification_liveness_start(), public.verification_stage_liveness(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.verification_liveness_start(), public.verification_stage_liveness(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_appeals(text), public.admin_case_media(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_appeals(text), public.admin_case_media(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.verification_job_finish(uuid, boolean, text), public.verification_kick(text), public.verification_dispatch(),
  public.verification_purge_due(int), public.verification_purge_mark(uuid), public.verification_scan_rechecks(), public.verification_purge_expired(),
  public.verification_case_bundle(uuid), public.kyc_edge_start(uuid, text, text, text), public.kyc_edge_can_send(uuid),
  public.kyc_edge_session(uuid), public.kyc_edge_confirm(uuid, boolean, text)
  FROM public, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.verification_job_finish(uuid, boolean, text), public.verification_dispatch(),
      public.verification_purge_due(int), public.verification_purge_mark(uuid), public.verification_scan_rechecks(), public.verification_purge_expired(),
      public.verification_case_bundle(uuid), public.kyc_edge_start(uuid, text, text, text), public.kyc_edge_can_send(uuid),
      public.kyc_edge_session(uuid), public.kyc_edge_confirm(uuid, boolean, text) TO service_role;
  END IF;
END $$;

-- ---------- schedules (IST in comments; pg_cron runs in UTC) ----------
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('verify-dispatch', 'verify-rechecks', 'verify-retention');
  PERFORM cron.schedule('verify-dispatch', '* * * * *', 'SELECT public.verification_dispatch()');
  PERFORM cron.schedule('verify-rechecks', '30 21 * * *', 'SELECT public.verification_scan_rechecks()');   -- 03:00 IST daily
  PERFORM cron.schedule('verify-retention', '15 * * * *', 'SELECT public.verification_purge_expired()');   -- hourly
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable: call /verify/dispatch and /verify/maintenance on a schedule (%)', SQLERRM;
END $$;
