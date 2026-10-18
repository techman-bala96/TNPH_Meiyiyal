BEGIN;
-- Account numbers here (7310…, 8310…) are used only by this file, so accounts left by e2e runs
-- (5010… in e2e/payouts.spec.ts) can never be flagged as duplicates of these; the duplicate rule itself is unchanged.
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000a801','p8a@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a802','p8b@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a803','p8c@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a804','p8d@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000a803','admin');
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, is_active, is_verified, decided_at, base_geog, district_slug, years_experience) VALUES
 ('00000000-0000-0000-0000-00000000b801','00000000-0000-0000-0000-00000000a801','Dr. Kavitha Raman','professionals--doctor--allopathy','approved',true,true,now(),'POINT(80.27 13.03)','chennai',12),
 ('00000000-0000-0000-0000-00000000b802','00000000-0000-0000-0000-00000000a802','Other Worker','professionals--doctor--allopathy','approved',true,true,now(),'POINT(80.27 13.03)','chennai',4),
 ('00000000-0000-0000-0000-00000000b804','00000000-0000-0000-0000-00000000a804','Manual Worker','professionals--doctor--allopathy','approved',true,true,now(),'POINT(80.27 13.03)','chennai',4);
SELECT set_config('meiyiyal.trusted','off', true);
INSERT INTO public.kyc_verification(worker_id, legal_name, aadhaar_verified, status) VALUES
 ('00000000-0000-0000-0000-00000000b801','Kavitha Raman',true,'verified'),
 ('00000000-0000-0000-0000-00000000b802','Kavitha Raman',true,'verified');
CREATE FUNCTION pg_temp.as_(_u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',_u,'role','authenticated')::text, true) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

DO $$ BEGIN
  IF public.setting_num('payout_cooling_days', 0) <> 3 THEN RAISE EXCEPTION 'FAIL: cooling days'; END IF;
  IF COALESCE(public.setting('payouts_auto')#>>'{}','') <> 'false' THEN RAISE EXCEPTION 'FAIL: auto default'; END IF;
  IF COALESCE(public.setting('tds_enabled')#>>'{}','') <> 'false' THEN RAISE EXCEPTION 'FAIL: tds default'; END IF;
  IF COALESCE(public.setting('payout_fee_bearer')#>>'{}','') <> 'platform' THEN RAISE EXCEPTION 'FAIL: fee bearer'; END IF;
  IF public.payout_name_result('Dr. Kavitha Raman','KAVITHA RAMAN') <> 'match' THEN RAISE EXCEPTION 'FAIL: name match'; END IF;
  IF public.payout_name_result('Kavitha Raman','Someone Else') <> 'mismatch' THEN RAISE EXCEPTION 'FAIL: name mismatch'; END IF;
  IF public.payout_name_result(NULL,'Kavitha Raman') <> 'review' THEN RAISE EXCEPTION 'FAIL: name review'; END IF;
  RAISE NOTICE 'PASS: cooling is 3 days, auto off, TDS off, platform bears the fee, name fold matches';
END $$;

SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a804');
DO $$ BEGIN
  INSERT INTO public.kyc_verification(worker_id, legal_name, status) VALUES ('00000000-0000-0000-0000-00000000b804','Hacker','pending');
  IF (SELECT legal_name FROM public.kyc_verification WHERE worker_id='00000000-0000-0000-0000-00000000b804') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: worker set legal name'; END IF;
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a801');
DO $$ BEGIN
  UPDATE public.kyc_verification SET legal_name='Hacker' WHERE worker_id='00000000-0000-0000-0000-00000000b801';
  IF (SELECT legal_name FROM public.kyc_verification WHERE worker_id='00000000-0000-0000-0000-00000000b801') IS DISTINCT FROM 'Kavitha Raman' THEN RAISE EXCEPTION 'FAIL: worker updated legal name'; END IF;
  BEGIN INSERT INTO public.worker_payout_accounts(worker_user_id, kind, account_mask, account_hash) VALUES (auth.uid(),'bank','••••1111','abc'); RAISE EXCEPTION 'FAIL: worker inserted account';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.payout_apply_event('evt','payout.processed','x',NULL,'UTR','', '{}'); RAISE EXCEPTION 'FAIL: worker webhook';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.payout_account_submit('bank','7310012345678','HDFC0001234','000000',NULL); RAISE EXCEPTION 'FAIL: bad otp';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: worker cannot set the Aadhaar name, write an account, or forge a payout event; wrong step-up code is refused';
END $$;
RESET role;

DO $$ DECLARE _case uuid; BEGIN
  INSERT INTO public.verification_cases(worker_id, status) VALUES ('00000000-0000-0000-0000-00000000b804','running') RETURNING id INTO _case;
  PERFORM public.verification_write_check(_case, 'identity', 'qr', 'pass', 1, '{"name":"  Manual Worker  ","last4":"4242"}'::jsonb);
  IF (SELECT legal_name FROM public.kyc_verification WHERE worker_id='00000000-0000-0000-0000-00000000b804') <> 'Manual Worker' THEN RAISE EXCEPTION 'FAIL: legal name from check'; END IF;
  PERFORM public.verification_write_check(_case, 'identity', 'qr', 'fail', 0, '{"name":"Other Person"}'::jsonb);
  IF (SELECT legal_name FROM public.kyc_verification WHERE worker_id='00000000-0000-0000-0000-00000000b804') <> 'Manual Worker' THEN RAISE EXCEPTION 'FAIL: fail cleared legal name'; END IF;
  RAISE NOTICE 'PASS: a passing identity check stores the Aadhaar name; a later fail does not clear it';
END $$;

SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a801');
DO $$ DECLARE r jsonb; a public.worker_payout_accounts; BEGIN
  r := public.payout_account_submit('bank','7310011110001','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'failed' OR r->>'reason' <> 'invalid_account' THEN RAISE EXCEPTION 'FAIL: invalid %', r; END IF;
  r := public.payout_account_submit('bank','7310011110000','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'rejected' OR r->>'reason' <> 'name_mismatch' OR r->>'registered_name' <> 'Other Person' THEN RAISE EXCEPTION 'FAIL: mismatch %', r; END IF;
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id=auth.uid()) <> 0 THEN RAISE EXCEPTION 'FAIL: mismatch created a payout'; END IF;
  IF public.my_earnings()->>'wait_reason' <> 'account_rejected' OR public.my_earnings()->>'next_batch' IS NOT NULL THEN RAISE EXCEPTION 'FAIL: rejected date %', public.my_earnings(); END IF;
  r := public.payout_account_submit('upi','kavitha@okaxis',NULL,'123456','ABCDE1234F');
  IF r->>'status' <> 'verified' OR r->>'mask' <> 'ka••••@okaxis' THEN RAISE EXCEPTION 'FAIL: upi %', r; END IF;
  r := public.payout_account_submit('bank','7310012345678','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'verified' OR r->>'mask' <> '••••5678' OR r->>'registered_name' <> 'Kavitha Raman' THEN RAISE EXCEPTION 'FAIL: penny %', r; END IF;
  IF (r->>'cooling_until')::timestamptz NOT BETWEEN now() + interval '71 hours' AND now() + interval '73 hours' THEN RAISE EXCEPTION 'FAIL: cooling %', r->>'cooling_until'; END IF;
  SELECT * INTO a FROM public.worker_payout_accounts WHERE worker_user_id=auth.uid();
  IF a.account_hash IS NULL OR length(a.account_hash) <> 64 OR a.fund_account_id NOT LIKE 'fa_mock_%' THEN RAISE EXCEPTION 'FAIL: hash'; END IF;
  IF row_to_json(a)::text LIKE '%7310012345678%' THEN RAISE EXCEPTION 'FAIL: full account stored'; END IF;
  IF (SELECT pan_number FROM public.kyc_verification WHERE worker_id='00000000-0000-0000-0000-00000000b801') <> 'ABCDE1234F'
     OR (SELECT pan_verified FROM public.kyc_verification WHERE worker_id='00000000-0000-0000-0000-00000000b801') THEN RAISE EXCEPTION 'FAIL: pan'; END IF;
  IF public.my_earnings()->>'wait_reason' <> 'cooling' OR public.my_earnings()->>'next_batch' IS NULL
     OR (public.my_earnings()->>'next_batch')::timestamptz < (public.my_earnings()->'account'->>'cooling_until')::timestamptz
     OR (public.my_earnings()->>'wait_until') IS DISTINCT FROM (public.my_earnings()->'account'->>'cooling_until') THEN
    RAISE EXCEPTION 'FAIL: wait %', public.my_earnings(); END IF;
  BEGIN PERFORM public.payout_request(); RAISE EXCEPTION 'FAIL: request while verified';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: penny-drop verifies a matching bank or UPI, masks it, starts a 3-day cool-off, and does not store the number';
END $$;
RESET role;
DO $$ DECLARE _earn bigint; BEGIN
  PERFORM pg_temp.as_('00000000-0000-0000-0000-00000000a801');
  IF public.payout_next_at('2026-10-21 12:00:00+05:30') <> timestamptz '2026-10-26 10:00:00+05:30' THEN
    RAISE EXCEPTION 'FAIL: pinned monday %', public.payout_next_at('2026-10-21 12:00:00+05:30'); END IF;
  IF public.payout_next_at('2026-10-26 10:00:00+05:30') <> timestamptz '2026-10-26 10:00:00+05:30' THEN
    RAISE EXCEPTION 'FAIL: exact monday %', public.payout_next_at('2026-10-26 10:00:00+05:30'); END IF;
  IF public.payout_next_at('2026-10-26 10:01:00+05:30') <> timestamptz '2026-11-02 10:00:00+05:30' THEN
    RAISE EXCEPTION 'FAIL: after monday %', public.payout_next_at('2026-10-26 10:01:00+05:30'); END IF;
  UPDATE public.worker_payout_accounts SET cooling_until = '2026-10-21 12:00:00+05:30' WHERE worker_user_id = '00000000-0000-0000-0000-00000000a801';
  IF (public.my_earnings()->>'next_batch')::timestamptz <> timestamptz '2026-10-26 10:00:00+05:30'
     OR (public.my_earnings()->>'wait_until')::timestamptz <> timestamptz '2026-10-21 12:00:00+05:30'
     OR public.my_earnings()->>'wait_reason' <> 'cooling' THEN
    RAISE EXCEPTION 'FAIL: cool-off next %', public.my_earnings(); END IF;
  UPDATE public.worker_payout_accounts SET cooling_until = now() - interval '1 hour' WHERE worker_user_id = '00000000-0000-0000-0000-00000000a801';
  INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at)
  VALUES ('00000000-0000-0000-0000-00000000a801', 300, 18, 50, 250, '2026-11-04 15:00:00+05:30') RETURNING id INTO _earn;
  IF public.my_earnings()->>'wait_reason' <> 'on_hold'
     OR (public.my_earnings()->>'next_batch')::timestamptz <> timestamptz '2026-11-09 10:00:00+05:30' THEN
    RAISE EXCEPTION 'FAIL: hold next %', public.my_earnings(); END IF;
  DELETE FROM public.worker_earnings WHERE id = _earn;
  -- Held earnings under the minimum: no payout date, but the line still says when they unlock.
  INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at)
  VALUES ('00000000-0000-0000-0000-00000000a801', 180, 18, 30, 150, date_trunc('second', now() + interval '2 days')) RETURNING id INTO _earn;
  IF public.my_earnings()->>'wait_reason' <> 'on_hold'
     OR (public.my_earnings()->>'next_batch') IS NOT NULL
     OR (public.my_earnings()->>'wait_until')::timestamptz IS DISTINCT FROM (SELECT available_at FROM public.worker_earnings WHERE id = _earn) THEN
    RAISE EXCEPTION 'FAIL: hold under minimum %', public.my_earnings(); END IF;
  DELETE FROM public.worker_earnings WHERE id = _earn;
  -- Enough available but the batch is paused (payouts_auto is still false here): no Monday is promised.
  INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at)
  VALUES ('00000000-0000-0000-0000-00000000a801', 300, 18, 50, 250, now() - interval '1 hour') RETURNING id INTO _earn;
  IF public.my_earnings()->>'wait_reason' <> 'paused' OR (public.my_earnings()->>'next_batch') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: paused date %', public.my_earnings(); END IF;
  DELETE FROM public.worker_earnings WHERE id = _earn;
  UPDATE public.worker_payout_accounts SET cooling_until = now() + interval '3 days' WHERE worker_user_id = '00000000-0000-0000-0000-00000000a801';
  RAISE NOTICE 'PASS: next payout is the first Monday 10:00 IST on or after the cool-off or the hold release; none while paused';
END $$;
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a802');
DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_account_submit('bank','7310012345678','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'review' OR r->>'reason' <> 'duplicate' OR NOT (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'FAIL: duplicate %', r; END IF;
  RAISE NOTICE 'PASS: a second worker with the same account waits for review';
END $$;
RESET role;

UPDATE public.kyc_verification SET legal_name = NULL WHERE worker_id = '00000000-0000-0000-0000-00000000b802';
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a802');
DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_account_submit('bank','8310012345678','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'review' OR r->>'reason' <> 'no_legal_name' THEN RAISE EXCEPTION 'FAIL: no legal %', r; END IF;
  RAISE NOTICE 'PASS: a penny-drop with no Aadhaar name waits for review';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a801');
DO $$ BEGIN
  BEGIN PERFORM public.admin_payout_pause(true); RAISE EXCEPTION 'FAIL: worker pause';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_payout_release_cooling(auth.uid()); RAISE EXCEPTION 'FAIL: worker release';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: a worker cannot pause payouts or skip the cool-off';
END $$;
RESET role;

INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at) VALUES
 ('00000000-0000-0000-0000-00000000a801',100,18,18,82, now() + interval '2 days'),
 ('00000000-0000-0000-0000-00000000a801',400,18,72,328, now() - interval '1 day');

DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_run(false, '00000000-0000-0000-0000-00000000a801');
  IF NOT (r->>'paused')::boolean THEN RAISE EXCEPTION 'FAIL: paused %', r; END IF;
  UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'payouts_auto';
  r := public.payout_run(false, '00000000-0000-0000-0000-00000000a801');
  IF (r->>'created')::int <> 0 OR EXISTS (SELECT 1 FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801') THEN RAISE EXCEPTION 'FAIL: cooling did not hold %', r; END IF;
  RAISE NOTICE 'PASS: global pause and the 3-day cool-off both skip the batch';
END $$;

SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a803');
DO $$ DECLARE r jsonb; _id uuid; BEGIN
  PERFORM public.admin_payout_release_cooling('00000000-0000-0000-0000-00000000a801');
  r := public.admin_payout_run();
  SELECT id INTO _id FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status='processing';
  IF _id IS NULL OR (SELECT amount FROM public.payout_requests WHERE id=_id) <> 328 OR (SELECT entry_count FROM public.payout_requests WHERE id=_id) <> 1 THEN RAISE EXCEPTION 'FAIL: weekly %', r; END IF;
  IF (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NULL AND available_at <= now()) <> 0 THEN RAISE EXCEPTION 'FAIL: earnings still free'; END IF;
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status IN ('queued','processing','review','requested')) <> 1 THEN RAISE EXCEPTION 'FAIL: double payout'; END IF;
  PERFORM set_config('test.payout', _id::text, true);
  RAISE NOTICE 'PASS: Monday batch pays released earnings above ₹200 once, and leaves the 72h hold alone';
END $$;
RESET role;

DO $$ DECLARE r jsonb; _id uuid := current_setting('test.payout')::uuid; _prov text; BEGIN
  SELECT provider_payout_id INTO _prov FROM public.payout_requests WHERE id=_id;
  r := public.payout_apply_event('evt_pay_1','payout.processed',_prov,_id,'UTRMOCK123',NULL,'{}');
  IF r->>'outcome' <> 'paid' OR (SELECT reference FROM public.payout_requests WHERE id=_id) <> 'UTRMOCK123' THEN RAISE EXCEPTION 'FAIL: paid %', r; END IF;
  r := public.payout_apply_event('evt_pay_1','payout.processed',_prov,_id,'UTRMOCK123',NULL,'{}');
  IF NOT (r->>'duplicate')::boolean OR (SELECT count(*) FROM public.payout_events WHERE event_id='evt_pay_1') <> 1 THEN RAISE EXCEPTION 'FAIL: dup event %', r; END IF;
  r := public.payout_apply_event('evt_pay_2','payout.processed',_prov,_id,'UTR-OTHER',NULL,'{}');
  IF r->>'outcome' <> 'already_paid' OR (SELECT reference FROM public.payout_requests WHERE id=_id) <> 'UTRMOCK123' THEN RAISE EXCEPTION 'FAIL: second pay %', r; END IF;
  RAISE NOTICE 'PASS: webhook marks the payout paid once; a repeated event does not pay again';
  r := public.payout_apply_event('evt_rev_1','payout.reversed',_prov,_id,NULL,'bank reversed','{}');
  IF r->>'outcome' <> 'reversed' THEN RAISE EXCEPTION 'FAIL: reverse %', r; END IF;
  IF (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NULL AND available_at <= now()) <> 328 THEN RAISE EXCEPTION 'FAIL: reverse unlink'; END IF;
  RAISE NOTICE 'PASS: a reversal puts the earnings back';
END $$;

-- three transient failures, then the earnings return
DO $$ DECLARE r jsonb; _id uuid; _prov text; i int; BEGIN
  r := public.payout_run(false, '00000000-0000-0000-0000-00000000a801');
  PERFORM public.payout_dispatch_mock(NULL);
  SELECT id, provider_payout_id INTO _id, _prov FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status='processing' ORDER BY requested_at DESC LIMIT 1;
  IF _id IS NULL THEN RAISE EXCEPTION 'FAIL: retry setup %', r; END IF;
  FOR i IN 1..2 LOOP
    r := public.payout_apply_event('evt_to_'||i,'payout.failed',_prov,_id,NULL,'timeout','{}');
    IF r->>'outcome' <> 'retry' THEN RAISE EXCEPTION 'FAIL: retry % %', i, r; END IF;
    PERFORM public.payout_dispatch_mock(_id);
  END LOOP;
  r := public.payout_apply_event('evt_to_3','payout.failed',_prov,_id,NULL,'timeout','{}');
  IF r->>'outcome' <> 'failed' THEN RAISE EXCEPTION 'FAIL: give up %', r; END IF;
  IF (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NULL AND available_at <= now()) <> 328 THEN RAISE EXCEPTION 'FAIL: retry unlink'; END IF;
  RAISE NOTICE 'PASS: a transient failure is retried and then the earnings return';
END $$;

-- beneficiary failure (account ending 0002) returns the balance and does not try again
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a801');
DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_account_submit('bank','7310012340002','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'verified' THEN RAISE EXCEPTION 'FAIL: 0002 validate %', r; END IF;
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a803');
DO $$ DECLARE r jsonb; BEGIN
  PERFORM public.admin_payout_release_cooling('00000000-0000-0000-0000-00000000a801');
  r := public.admin_payout_run();
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status='failed' AND failure_reason='beneficiary') <> 1 THEN RAISE EXCEPTION 'FAIL: 0002 status %', r; END IF;
  IF (SELECT items FROM public.admin_payouts(NULL) p WHERE p.worker_user_id='00000000-0000-0000-0000-00000000a801' AND p.failure_reason='beneficiary') <> 1 THEN RAISE EXCEPTION 'FAIL: returned count'; END IF;
  IF (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NULL AND available_at <= now()) <> 328 THEN RAISE EXCEPTION 'FAIL: 0002 balance'; END IF;
  IF (SELECT validation_status FROM public.worker_payout_accounts WHERE worker_user_id='00000000-0000-0000-0000-00000000a801') <> 'failed' THEN RAISE EXCEPTION 'FAIL: 0002 account'; END IF;
  r := public.admin_payout_run();
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status IN ('queued','processing','review')) <> 0 THEN RAISE EXCEPTION 'FAIL: 0002 retried'; END IF;
  RAISE NOTICE 'PASS: a beneficiary failure returns the balance and does not retry that account';
END $$;
RESET role;

-- good account again; a large amount waits for review; flag and hold skip the worker
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a801');
DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_account_submit('bank','7310099988877','HDFC0001234','123456',NULL);
  IF r->>'status' <> 'verified' THEN RAISE EXCEPTION 'FAIL: restore %', r; END IF;
END $$;
RESET role;
UPDATE public.worker_earnings SET net = 12000, gross = 14000 WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NULL AND available_at <= now();
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a803');
DO $$ DECLARE r jsonb; _id uuid; BEGIN
  PERFORM public.admin_payout_release_cooling('00000000-0000-0000-0000-00000000a801');
  r := public.admin_payout_run();
  SELECT id INTO _id FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status='review';
  IF _id IS NULL OR (SELECT review_reason FROM public.payout_requests WHERE id=_id) <> 'amount' THEN RAISE EXCEPTION 'FAIL: review %', r; END IF;
  IF public.admin_payout_approve(_id) NOT IN ('processing','queued') THEN RAISE EXCEPTION 'FAIL: approve'; END IF;
  RAISE NOTICE 'PASS: an amount over the review line waits, and an admin can send it';
END $$;
RESET role;
-- put that send back so the flag test has free earnings
UPDATE public.payout_requests SET status='rejected' WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND status IN ('processing','queued','review');
UPDATE public.worker_earnings SET payout_id=NULL WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NOT NULL AND net=12000;

SELECT set_config('meiyiyal.trusted','on', true);
UPDATE public.workers SET flag_active=true WHERE user_id='00000000-0000-0000-0000-00000000a801';
SELECT set_config('meiyiyal.trusted','off', true);
DO $$ DECLARE r jsonb; n int; BEGIN
  SELECT count(*) INTO n FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801';
  r := public.payout_run(false, '00000000-0000-0000-0000-00000000a801');
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801') <> n THEN RAISE EXCEPTION 'FAIL: flagged paid %', r; END IF;
  PERFORM pg_temp.as_('00000000-0000-0000-0000-00000000a801');
  IF (public.my_earnings()->>'next_batch') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: flagged date %', public.my_earnings(); END IF;
  IF (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id='00000000-0000-0000-0000-00000000a801' AND payout_id IS NULL AND net=12000) <> 12000 THEN RAISE EXCEPTION 'FAIL: flagged balance'; END IF;
  RAISE NOTICE 'PASS: a flagged worker is skipped and keeps the balance';
END $$;
SELECT set_config('meiyiyal.trusted','on', true);
UPDATE public.workers SET flag_active=false, blocked_until=now() + interval '1 day' WHERE user_id='00000000-0000-0000-0000-00000000a801';
SELECT set_config('meiyiyal.trusted','off', true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801';
  PERFORM public.payout_run(false, '00000000-0000-0000-0000-00000000a801');
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801') <> n THEN RAISE EXCEPTION 'FAIL: blocked paid'; END IF;
  RAISE NOTICE 'PASS: a temporary block skips the worker';
END $$;
SELECT set_config('meiyiyal.trusted','on', true);
UPDATE public.workers SET blocked_until=NULL, payout_hold=true WHERE user_id='00000000-0000-0000-0000-00000000a801';
SELECT set_config('meiyiyal.trusted','off', true);
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a803');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801';
  IF public.admin_payout_hold('00000000-0000-0000-0000-00000000a801', true) <> true THEN RAISE EXCEPTION 'FAIL: hold'; END IF;
  PERFORM public.admin_payout_run();
  IF (SELECT count(*) FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a801') <> n THEN RAISE EXCEPTION 'FAIL: hold paid'; END IF;
  PERFORM public.admin_payout_hold('00000000-0000-0000-0000-00000000a801', false);
  RAISE NOTICE 'PASS: an admin hold skips the worker until it is lifted';
END $$;
RESET role;
INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at) VALUES
 ('00000000-0000-0000-0000-00000000a804',300,18,54,246, now() - interval '1 day');
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a804');
DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_request();
  IF (r->>'amount')::numeric <> 246 OR (SELECT status FROM public.payout_requests WHERE id=(r->>'id')::uuid) <> 'requested'
     OR (SELECT entry_count FROM public.payout_requests WHERE id=(r->>'id')::uuid) <> 1 THEN RAISE EXCEPTION 'FAIL: manual %', r; END IF;
  BEGIN PERFORM public.payout_request(); RAISE EXCEPTION 'FAIL: second manual';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: without a verified account the worker can still request, and only once';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a803');
DO $$ DECLARE _id uuid; BEGIN
  SELECT id INTO _id FROM public.payout_requests WHERE worker_user_id='00000000-0000-0000-0000-00000000a804' AND status='requested';
  IF public.admin_payout_decide(_id, true, 'UTR-MANUAL', NULL) <> 'paid' THEN RAISE EXCEPTION 'FAIL: mark paid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit WHERE action='payout.paid' AND target=_id) THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
  RAISE NOTICE 'PASS: break-glass mark-paid still needs a UTR and writes an audit row';
END $$;
RESET role;

-- fee and tds are not taken from the worker
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE worker_user_id IN ('00000000-0000-0000-0000-00000000a801','00000000-0000-0000-0000-00000000a804') AND (fee <> 0 OR tds <> 0)) THEN
    RAISE EXCEPTION 'FAIL: fee or tds deducted';
  END IF;
  RAISE NOTICE 'PASS: v1 does not deduct a transfer fee or TDS';
END $$;
ROLLBACK;
