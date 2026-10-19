-- M11 DPDP export + deletion. One transaction, rolled back.
BEGIN;
INSERT INTO auth.users(id, email, phone, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000f101','priv-u@test.local','919800000101','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000f102','priv-w@test.local',NULL,'authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000f103','priv-other@test.local',NULL,'authenticated','authenticated');
INSERT INTO public.profiles(user_id, full_name, phone_number, dob) VALUES
 ('00000000-0000-0000-0000-00000000f101','Priya U','+919800000101','1990-01-01'), ('00000000-0000-0000-0000-00000000f102','Dr Wee',NULL,NULL),
 ('00000000-0000-0000-0000-00000000f103','Other Person',NULL,NULL)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, phone_number = EXCLUDED.phone_number, dob = EXCLUDED.dob;
INSERT INTO public.user_locations(user_id, address, geog, source, is_current) VALUES ('00000000-0000-0000-0000-00000000f101','12 Anna Salai','POINT(80.27 13.03)','gps',true);
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, district_slug, about) VALUES
 ('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000f102','Dr Wee','professionals--doctor--allopathy','approved','chennai','About me');
SELECT set_config('meiyiyal.trusted','off', true);
INSERT INTO public.worker_earnings(worker_user_id, mode, minutes, gross, commission_pct, commission, net, available_at)
  VALUES ('00000000-0000-0000-0000-00000000f102','chat',5,50,18,9,41,now());
SET LOCAL role authenticated;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
DO $$ DECLARE e jsonb; p jsonb; ok boolean; BEGIN
  e := public.my_data_export();
  IF e->>'format' <> 'meiyiyal-export-v1' OR e#>>'{profile,full_name}' <> 'Priya U' OR e#>>'{account,email}' <> 'priv-u@test.local'
     OR jsonb_array_length(e->'locations') <> 1 OR e->'professional' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL: export %', left(e::text, 300); END IF;
  IF e::text LIKE '%Other Person%' THEN RAISE EXCEPTION 'FAIL: export leaks another user'; END IF;
  PERFORM public.my_data_export(); PERFORM public.my_data_export();
  BEGIN PERFORM public.my_data_export(); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: export rate limit'; END IF;
  BEGIN PERFORM public.account_delete_request('yes'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: unconfirmed delete'; END IF;
  p := public.account_delete_request('delete');
  IF p->'pending_delete' IS NULL OR (p#>>'{pending_delete,due_at}')::timestamptz < now() + interval '6 days' THEN RAISE EXCEPTION 'FAIL: grace %', p; END IF;
  p := public.account_delete_request('DELETE');  -- idempotent
  p := public.account_delete_cancel();
  IF p->'pending_delete' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL: cancel'; END IF;
  PERFORM public.account_delete_request('நீக்கு');
  BEGIN PERFORM public.account_anonymize(1); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: user can run anonymize'; END IF;
  RAISE NOTICE 'PASS: export (own data only, rate-limited), delete request with typed confirm, grace, cancel';
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
DO $$ DECLARE e jsonb; p jsonb; BEGIN
  e := public.my_data_export();
  IF e#>>'{professional,profile,display_name}' <> 'Dr Wee' OR jsonb_array_length(e#>'{professional,earnings}') <> 1 THEN RAISE EXCEPTION 'FAIL: worker export'; END IF;
  p := public.account_delete_request('DELETE');
  IF NOT (p->'blockers') ? 'unpaid_earnings' THEN RAISE EXCEPTION 'FAIL: blockers %', p; END IF;
END $$;

RESET role;
DO $$ DECLARE r jsonb; _ru bigint; _rw bigint; BEGIN
  UPDATE public.data_requests SET due_at = now() - interval '1 minute' WHERE kind = 'delete' AND status = 'pending' AND user_id::text LIKE '00000000-0000-0000-0000-00000000f1%';
  SELECT id INTO _ru FROM public.data_requests WHERE user_id = '00000000-0000-0000-0000-00000000f101' AND kind = 'delete' AND status = 'pending';
  SELECT id INTO _rw FROM public.data_requests WHERE user_id = '00000000-0000-0000-0000-00000000f102' AND kind = 'delete' AND status = 'pending';
  IF (SELECT count(*) FROM public.account_purge_due() WHERE request_id IN (_ru, _rw)) <> 2 THEN RAISE EXCEPTION 'FAIL: due list'; END IF;
  -- worker with unpaid earnings waits
  r := public.account_anonymize(_rw);
  IF (r->>'ok')::boolean OR r->>'reason' <> 'unpaid_earnings' THEN RAISE EXCEPTION 'FAIL: blocked anonymize %', r; END IF;
  IF (SELECT display_name FROM public.workers WHERE id = '00000000-0000-0000-0000-00000000f201') <> 'Dr Wee' THEN RAISE EXCEPTION 'FAIL: blocked worker touched'; END IF;
  -- user goes through
  r := public.account_anonymize(_ru);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: anonymize %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-00000000f101' AND (full_name IS NOT NULL OR phone_number IS NOT NULL OR dob IS NOT NULL)) THEN RAISE EXCEPTION 'FAIL: profile kept'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_locations WHERE user_id = '00000000-0000-0000-0000-00000000f101') THEN RAISE EXCEPTION 'FAIL: locations kept'; END IF;
  IF (SELECT status FROM public.data_requests WHERE id = _ru) <> 'done' THEN RAISE EXCEPTION 'FAIL: request status'; END IF;
  IF ((public.account_anonymize(_ru))->>'reason') <> 'not_pending' THEN RAISE EXCEPTION 'FAIL: rerun'; END IF;
  -- earnings paid → worker can go
  UPDATE public.worker_earnings SET net = 0 WHERE worker_user_id = '00000000-0000-0000-0000-00000000f102';
  r := public.account_anonymize(_rw);
  IF NOT (r->>'ok')::boolean OR (SELECT display_name || status || is_active::text FROM public.workers WHERE id = '00000000-0000-0000-0000-00000000f201') <> 'Deleted professionalblockedfalse' THEN RAISE EXCEPTION 'FAIL: worker anonymize'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.worker_earnings WHERE worker_user_id = '00000000-0000-0000-0000-00000000f102') THEN RAISE EXCEPTION 'FAIL: financial rows must stay'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-purge') THEN RAISE EXCEPTION 'FAIL: cron'; END IF;
  IF EXISTS (SELECT 1 FROM public.setting_specs WHERE key = 'account_hook_secret') THEN RAISE EXCEPTION 'FAIL: secret editable'; END IF;
  RAISE NOTICE 'PASS: purge waits on blockers, anonymises personal data, keeps financial records';
END $$;
ROLLBACK;
