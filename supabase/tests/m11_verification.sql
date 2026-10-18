-- M11 verification completion. One transaction, rolled back.
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000b101','m11a@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000b102','m11b@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000b1a1','m11admin1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000b1a2','m11admin2@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000b1a1','admin'), ('00000000-0000-0000-0000-00000000b1a2','admin');

-- Active liveness: nonce + 3 distinct steps, frames for every step, expiry.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000b101","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wid uuid; ch jsonb; steps text[]; frames jsonb; ok boolean; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Live', 8, 'about',
    '{"degree":"MBBS","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC11001","reg_year":"2015"}'::jsonb);
  ch := public.verification_liveness_start();
  steps := ARRAY(SELECT jsonb_array_elements_text(ch->'steps'));
  IF array_length(steps, 1) <> 3 OR (SELECT count(DISTINCT s) FROM unnest(steps) s) <> 3 THEN RAISE EXCEPTION 'FAIL: steps %', steps; END IF;
  BEGIN PERFORM public.verification_stage_liveness('wrong', '[]'); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: wrong nonce accepted'; END IF;
  frames := jsonb_build_array(jsonb_build_object('step', steps[1], 'path', '00000000-0000-0000-0000-00000000b101/l1.jpg'));
  BEGIN PERFORM public.verification_stage_liveness(ch->>'nonce', frames); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: missing steps accepted'; END IF;
  frames := jsonb_build_array(jsonb_build_object('step', steps[1], 'path', 'someone-else/l1.jpg'));
  BEGIN PERFORM public.verification_stage_liveness(ch->>'nonce', frames); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: foreign path accepted'; END IF;
  SELECT jsonb_agg(jsonb_build_object('step', s, 'path', '00000000-0000-0000-0000-00000000b101/live-' || s || '.jpg')) INTO frames FROM unnest(steps) s;
  IF public.verification_stage_liveness(ch->>'nonce', frames) <> 'staged' THEN RAISE EXCEPTION 'FAIL: stage'; END IF;
  PERFORM public.aadhaar_send_otp('900000001101');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000b101/d.pdf'), (wid, 'council_cert', '00000000-0000-0000-0000-00000000b101/c.pdf');
  IF public.worker_submit() <> 'pending' THEN RAISE EXCEPTION 'FAIL: submit'; END IF;
  RAISE NOTICE 'PASS: active liveness staged and submitted';
END $$;
DO $$ DECLARE ok boolean; BEGIN
  BEGIN PERFORM public.verification_claim_job(); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: worker can claim jobs'; END IF;
  BEGIN PERFORM public.kyc_edge_confirm(auth.uid(), true, 'X'); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: worker can confirm kyc directly'; END IF;
  BEGIN PERFORM public.admin_appeals('open'); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: worker sees appeals'; END IF;
  RAISE NOTICE 'PASS: service-only and admin-only RPCs refuse a worker';
END $$;
RESET ROLE;

-- Bundle carries liveness; job lifecycle retries then dies; stale lock released.
DO $$ DECLARE wid uuid; cid uuid; b jsonb; j record; r text; BEGIN
  SELECT id INTO wid FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000b101';
  SELECT id INTO cid FROM public.verification_cases WHERE worker_id = wid;
  b := public.verification_case_bundle(cid);
  IF jsonb_array_length(b->'liveness_steps') <> 3 OR jsonb_array_length(b->'liveness_frames') <> 3 OR (b->>'liveness_window_ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: bundle liveness %', b;
  END IF;
  UPDATE public.verification_jobs SET run_after = now() - interval '1 day' WHERE case_id <> cid AND status = 'queued';
  UPDATE public.verification_jobs SET status = 'done' WHERE case_id <> cid AND status = 'queued';
  SELECT * INTO j FROM public.verification_claim_job();
  IF j.case_id <> cid THEN RAISE EXCEPTION 'FAIL: claimed other case'; END IF;
  r := public.verification_job_finish(j.job_id, false, 'boom');
  IF r <> 'retry' OR (SELECT run_after FROM public.verification_jobs WHERE id = j.job_id) <= now() THEN RAISE EXCEPTION 'FAIL: retry backoff %', r; END IF;
  UPDATE public.verification_jobs SET attempts = 5, status = 'running' WHERE id = j.job_id;
  r := public.verification_job_finish(j.job_id, false, 'boom again');
  IF r <> 'dead' THEN RAISE EXCEPTION 'FAIL: dead %', r; END IF;
  IF NOT (SELECT 'service_error' = ANY(reason_codes) FROM public.verification_cases WHERE id = cid) THEN RAISE EXCEPTION 'FAIL: case not flagged'; END IF;
  UPDATE public.verification_jobs SET status = 'running', locked_at = now() - interval '11 minutes' WHERE id = j.job_id;
  PERFORM public.verification_dispatch();
  IF (SELECT status FROM public.verification_jobs WHERE id = j.job_id) <> 'queued' THEN RAISE EXCEPTION 'FAIL: stale lock kept'; END IF;
  IF public.verification_job_finish(j.job_id, true, NULL) <> 'done' THEN RAISE EXCEPTION 'FAIL: done'; END IF;
  RAISE NOTICE 'PASS: bundle liveness, retry/dead/stale-lock lifecycle';
END $$;

-- Retention: due list includes frames; mark clears; appeal pauses; public portrait kept.
DO $$ DECLARE wid uuid; cid uuid; d record; n int; BEGIN
  SELECT id INTO wid FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000b101';
  SELECT id INTO cid FROM public.verification_cases WHERE worker_id = wid;
  UPDATE public.verification_cases SET status = 'approved', decided_at = now() - interval '31 days', purge_after = now() - interval '1 day',
    raw_selfie_path = '00000000-0000-0000-0000-00000000b101/raw.jpg', qr_path = '00000000-0000-0000-0000-00000000b101/qr.txt' WHERE id = cid;
  SELECT * INTO d FROM public.verification_purge_due(50) WHERE case_id = cid;
  IF d.case_id IS NULL OR array_length(d.paths, 1) <> 5 THEN RAISE EXCEPTION 'FAIL: due paths %', d.paths; END IF;
  n := public.verification_purge_expired();
  IF n < 1 THEN RAISE EXCEPTION 'FAIL: purge_expired count'; END IF;
  PERFORM public.verification_purge_mark(cid);
  IF EXISTS (SELECT 1 FROM public.verification_cases WHERE id = cid AND (raw_selfie_path IS NOT NULL OR qr_path IS NOT NULL OR live_frames IS NOT NULL)) THEN
    RAISE EXCEPTION 'FAIL: not cleared';
  END IF;
  IF EXISTS (SELECT 1 FROM public.verification_purge_due(50) WHERE case_id = cid) THEN RAISE EXCEPTION 'FAIL: still due'; END IF;
  UPDATE public.verification_cases SET status = 'appealed', raw_selfie_path = 'x/raw.jpg' WHERE id = cid;
  IF EXISTS (SELECT 1 FROM public.verification_purge_due(50) WHERE case_id = cid) THEN RAISE EXCEPTION 'FAIL: appeal does not pause'; END IF;
  RAISE NOTICE 'PASS: retention via storage API list/mark, appeal pauses';
END $$;

-- Rechecks: the M7 selfie loop referenced a bare id; both loops now enqueue and count.
DO $$ DECLARE wid uuid; n int; BEGIN
  SELECT id INTO wid FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000b101';
  PERFORM set_config('meiyiyal.trusted','on', true);
  UPDATE public.workers SET status = 'approved', verified_at = now() - interval '10 days', selfie_consent_at = now() - interval '400 days' WHERE id = wid;
  PERFORM set_config('meiyiyal.trusted','off', true);
  UPDATE public.verification_cases SET status = 'approved' WHERE worker_id = wid;
  n := public.verification_scan_rechecks();
  IF n < 1 OR NOT EXISTS (SELECT 1 FROM public.verification_cases WHERE worker_id = wid AND kind = 'recheck' AND 'selfie_due' = ANY(reason_codes)) THEN
    RAISE EXCEPTION 'FAIL: selfie recheck (n=%)', n;
  END IF;
  UPDATE public.verification_cases SET status = 'approved' WHERE worker_id = wid AND kind = 'recheck';
  IF public.verification_scan_rechecks() <> 0 THEN RAISE EXCEPTION 'FAIL: recheck repeats immediately'; END IF;
  RAISE NOTICE 'PASS: scheduled rechecks (selfie loop fixed, no repeat)';
END $$;

-- KYC edge RPCs (service role path): start, rate limit, wrong OTP, confirm writes legal name.
DO $$ DECLARE wid uuid; s jsonb; ok boolean; BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000b102","role":"authenticated"}', true);
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Edge', 3, '', '{"reg_no":"TNMC11002"}'::jsonb);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF NOT public.kyc_edge_can_send('00000000-0000-0000-0000-00000000b102') THEN RAISE EXCEPTION 'FAIL: can_send'; END IF;
  s := public.kyc_edge_start('00000000-0000-0000-0000-00000000b102', '9000 0000 1102', 'mock', 'ref-1');
  IF s->>'masked' <> 'XXXX-XXXX-1102' THEN RAISE EXCEPTION 'FAIL: masked %', s; END IF;
  s := public.kyc_edge_session('00000000-0000-0000-0000-00000000b102');
  IF s->>'provider' <> 'mock' OR s->>'ref' <> 'ref-1' THEN RAISE EXCEPTION 'FAIL: session %', s; END IF;
  IF (public.kyc_edge_confirm('00000000-0000-0000-0000-00000000b102', false, NULL)->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: wrong otp ok'; END IF;
  IF NOT (public.kyc_edge_confirm('00000000-0000-0000-0000-00000000b102', true, 'Edge Person')->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: confirm'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kyc_verification WHERE worker_id = wid AND aadhaar_verified AND legal_name = 'Edge Person' AND provider = 'mock') THEN
    RAISE EXCEPTION 'FAIL: kyc row';
  END IF;
  UPDATE public.kyc_otp_sessions SET sends = 0;
  INSERT INTO public.kyc_otp_sessions(worker_id, aadhaar_hash, last4, provider_ref, expires_at, sends) VALUES (wid, 'h', '1102', 'mock:x', now() + interval '5 minutes', 5);
  IF public.kyc_edge_can_send('00000000-0000-0000-0000-00000000b102') THEN RAISE EXCEPTION 'FAIL: rate limit'; END IF;
  BEGIN PERFORM public.kyc_edge_start('00000000-0000-0000-0000-00000000b102', '900000001102', 'mock', 'r'); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: start ignores rate limit'; END IF;
  RAISE NOTICE 'PASS: kyc edge start/session/confirm/rate-limit';
END $$;

-- Admin appeals list + media (audited), different-admin rule still enforced.
DO $$ DECLARE wid uuid; cid uuid; m jsonb; n int; ok boolean; BEGIN
  SELECT id INTO wid FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000b101';
  SELECT id INTO cid FROM public.verification_cases WHERE worker_id = wid AND kind <> 'recheck' ORDER BY created_at LIMIT 1;
  UPDATE public.verification_cases SET status = 'appealed', decided_by = '00000000-0000-0000-0000-00000000b1a1' WHERE id = cid;
  INSERT INTO public.verification_appeals(case_id, worker_id, note, sla_due_at) VALUES (cid, wid, 'please re-check', now() + interval '72 hours');
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000b1a1","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.admin_appeals('open') WHERE case_id = cid AND rejected_by_me;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: admin_appeals'; END IF;
  m := public.admin_case_media(cid);
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit WHERE action = 'verification.view_media' AND target = wid) THEN RAISE EXCEPTION 'FAIL: media audit'; END IF;
  BEGIN PERFORM public.admin_decide_appeal(cid, 'overturn', 'ok'); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: same admin decided appeal'; END IF;
  RAISE NOTICE 'PASS: admin appeals list, media audit, different-admin rule';
END $$;

-- Schedules exist.
DO $$ BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname IN ('verify-dispatch','verify-rechecks','verify-retention')) <> 3 THEN RAISE EXCEPTION 'FAIL: cron jobs'; END IF;
  RAISE NOTICE 'PASS: pg_cron verify-dispatch / verify-rechecks / verify-retention';
END $$;
ROLLBACK;
