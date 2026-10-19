-- M11 live payouts (RazorpayX) through SQL: the Edge Function's calls, simulated. One transaction, rolled back.
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000c101','px1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000c102','px2@test.local','authenticated','authenticated');
INSERT INTO public.profiles(user_id, full_name, phone_number) VALUES ('00000000-0000-0000-0000-00000000c101','Meena S','+919876500001')
  ON CONFLICT (user_id) DO UPDATE SET phone_number = EXCLUDED.phone_number;
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, is_active, is_verified, decided_at, base_geog, district_slug, years_experience) VALUES
 ('00000000-0000-0000-0000-00000000d101','00000000-0000-0000-0000-00000000c101','Adv. Meena S','professionals--lawyer','approved',true,true,now(),'POINT(80.27 13.03)','chennai',9),
 ('00000000-0000-0000-0000-00000000d102','00000000-0000-0000-0000-00000000c102','Er. Ravi','professionals--engineer','approved',true,true,now(),'POINT(80.27 13.03)','chennai',5);
SELECT set_config('meiyiyal.trusted','off', true);
INSERT INTO public.kyc_verification(worker_id, legal_name, aadhaar_verified, status) VALUES
 ('00000000-0000-0000-0000-00000000d101','Meena Sundaram',true,'verified'), ('00000000-0000-0000-0000-00000000d102','Ravi Kumar',true,'verified');
UPDATE public.app_settings SET value = 'false' WHERE key = 'payouts_mock';
UPDATE public.app_settings SET value = 'true' WHERE key = 'payouts_auto';

DO $$ DECLARE s jsonb; ok boolean; r jsonb; BEGIN
  IF public.payouts_provider() <> 'razorpayx' THEN RAISE EXCEPTION 'FAIL: provider'; END IF;
  -- mock RPC refuses in live mode
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c101","role":"authenticated"}', true);
  BEGIN PERFORM public.payout_account_submit('bank','9410012345678','HDFC0001234','123456',NULL); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: mock submit in live mode'; END IF;
  -- step-up: wrong code refused, the issued code works once
  s := public.stepup_issue('00000000-0000-0000-0000-00000000c101', 'payout_account');
  IF s->>'masked' <> '•••••0001' OR length(s->>'code') <> 6 THEN RAISE EXCEPTION 'FAIL: stepup issue %', s; END IF;
  BEGIN PERFORM public.payout_account_live_prepare('00000000-0000-0000-0000-00000000c101','bank','9410012345678','HDFC0001234','000000'); ok := true;
  EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: wrong step-up accepted'; END IF;
  r := public.payout_account_live_prepare('00000000-0000-0000-0000-00000000c101','bank','9410012345678','HDFC0001234', s->>'code');
  IF r->>'name' <> 'Meena Sundaram' THEN RAISE EXCEPTION 'FAIL: prepare %', r; END IF;
  IF public.stepup_verify('00000000-0000-0000-0000-00000000c101', 'payout_account', s->>'code') THEN RAISE EXCEPTION 'FAIL: code reused'; END IF;
  BEGIN PERFORM public.stepup_issue('00000000-0000-0000-0000-00000000c102', 'payout_account'); ok := true; EXCEPTION WHEN OTHERS THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: step-up without phone'; END IF;
  -- RazorpayX validation completed, bank name matches → verified + cooling
  r := public.payout_account_live_record('00000000-0000-0000-0000-00000000c101','bank','9410012345678','HDFC0001234',NULL,
    'cont_1','fa_1','fav_1','completed','active','MEENA SUNDARAM');
  IF r->>'status' <> 'verified' OR (SELECT provider || fund_account_id || contact_id FROM public.worker_payout_accounts WHERE worker_user_id = '00000000-0000-0000-0000-00000000c101') <> 'razorpayxfa_1cont_1' THEN
    RAISE EXCEPTION 'FAIL: live record %', r;
  END IF;
  -- slow validation → pending; webhook finishes it; invalid account → failed
  r := public.payout_account_live_record('00000000-0000-0000-0000-00000000c102','upi','ravi@okaxis',NULL,NULL,'cont_2','fa_2','fav_2','created',NULL,NULL);
  IF r->>'status' <> 'pending' THEN RAISE EXCEPTION 'FAIL: pending %', r; END IF;
  IF public.payout_validation_event('fav_2', 'active', 'Somebody Else') <> 'rejected' THEN RAISE EXCEPTION 'FAIL: validation mismatch'; END IF;
  r := public.payout_account_live_record('00000000-0000-0000-0000-00000000c102','upi','ravi@okaxis',NULL,NULL,'cont_2','fa_3','fav_3','created',NULL,NULL);
  IF public.payout_validation_event('fav_3', 'active', 'RAVI KUMAR') <> 'verified' THEN RAISE EXCEPTION 'FAIL: validation verified'; END IF;
  r := public.payout_account_live_record('00000000-0000-0000-0000-00000000c102','bank','9410099990001','SBIN0001234',NULL,'cont_2','fa_4','fav_4','completed','invalid',NULL);
  IF r->>'status' <> 'failed' THEN RAISE EXCEPTION 'FAIL: invalid account %', r; END IF;
  RAISE NOTICE 'PASS: live account: SMS step-up, penny-drop record, async validation webhook, invalid account';
END $$;

-- batch creates razorpayx rows; claim → send → webhook paid; retry and permanent failure paths
DO $$ DECLARE r jsonb; c record; pid uuid; out text; n int; BEGIN
  UPDATE public.worker_payout_accounts SET cooling_until = now() - interval '1 minute' WHERE worker_user_id = '00000000-0000-0000-0000-00000000c101';
  INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at)
  VALUES ('00000000-0000-0000-0000-00000000c101', 1200, 18, 216, 984, now() - interval '1 day');
  r := public.payout_run(false, '00000000-0000-0000-0000-00000000c101');
  IF (r->>'created')::int <> 1 OR r->>'provider' <> 'razorpayx' THEN RAISE EXCEPTION 'FAIL: run %', r; END IF;
  SELECT id INTO pid FROM public.payout_requests WHERE worker_user_id = '00000000-0000-0000-0000-00000000c101' AND status = 'queued';
  IF (SELECT provider FROM public.payout_requests WHERE id = pid) <> 'razorpayx' THEN RAISE EXCEPTION 'FAIL: row provider'; END IF;
  BEGIN PERFORM public.payout_dispatch_mock(NULL); RAISE EXCEPTION 'FAIL: mock dispatch ran in live mode'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  SELECT * INTO c FROM public.payout_claim_live(10) WHERE payout_id = pid;
  IF c.fund_account_id <> 'fa_1' OR c.amount <> 984 OR c.kind <> 'bank' THEN RAISE EXCEPTION 'FAIL: claim %', c; END IF;
  -- network error → retry (queued again)
  IF public.payout_send_error(pid, 'provider_unavailable', true) <> 'retry' THEN RAISE EXCEPTION 'FAIL: retry'; END IF;
  PERFORM public.payout_claim_live(10);
  PERFORM public.payout_mark_sent(pid, 'pout_live_1');
  r := public.payout_apply_event('evt_l1', 'payout.failed', 'pout_live_1', pid, NULL, 'provider:bank offline', '{}');
  IF r->>'outcome' <> 'retry' OR (SELECT provider_payout_id FROM public.payout_requests WHERE id = pid) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: live retry clears provider id %', r; END IF;
  PERFORM public.payout_claim_live(10);
  PERFORM public.payout_mark_sent(pid, 'pout_live_2');
  r := public.payout_apply_event('evt_l2', 'payout.processed', 'pout_live_2', pid, 'UTR123', NULL, '{}');
  IF r->>'outcome' <> 'paid' OR (SELECT reference FROM public.payout_requests WHERE id = pid) <> 'UTR123' THEN RAISE EXCEPTION 'FAIL: paid %', r; END IF;
  IF (SELECT provider FROM public.payout_events WHERE event_id = 'evt_l2') <> 'razorpayx' THEN RAISE EXCEPTION 'FAIL: event provider'; END IF;
  -- permanent failure at send time
  INSERT INTO public.worker_earnings(worker_user_id, gross, commission_pct, commission, net, available_at)
  VALUES ('00000000-0000-0000-0000-00000000c101', 600, 18, 108, 492, now() - interval '1 day');
  PERFORM public.payout_run(false, '00000000-0000-0000-0000-00000000c101');
  SELECT payout_id INTO pid FROM public.payout_claim_live(10);
  IF public.payout_send_error(pid, 'beneficiary', false) <> 'failed' THEN RAISE EXCEPTION 'FAIL: permanent'; END IF;
  IF (SELECT validation_status FROM public.worker_payout_accounts WHERE worker_user_id = '00000000-0000-0000-0000-00000000c101') <> 'failed' THEN RAISE EXCEPTION 'FAIL: account not failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.worker_earnings WHERE payout_id = pid) THEN RAISE EXCEPTION 'FAIL: earnings not released'; END IF;
  -- stale processing row without a provider id is re-queued by the sweep
  UPDATE public.worker_payout_accounts SET validation_status = 'verified' WHERE worker_user_id = '00000000-0000-0000-0000-00000000c101';
  PERFORM public.payout_run(false, '00000000-0000-0000-0000-00000000c101');
  SELECT payout_id INTO pid FROM public.payout_claim_live(10);
  UPDATE public.payout_requests SET claimed_at = now() - interval '20 minutes' WHERE id = pid;
  n := public.payout_retry_sweep();
  IF n < 1 OR (SELECT status FROM public.payout_requests WHERE id = pid) <> 'queued' THEN RAISE EXCEPTION 'FAIL: sweep'; END IF;
  RAISE NOTICE 'PASS: live batch: claim, retry, paid via webhook, permanent failure releases earnings, stale-claim sweep';
END $$;

-- hook secret + schedule
DO $$ BEGIN
  IF public.payout_hook_ok('') OR public.payout_hook_ok('nope') THEN RAISE EXCEPTION 'FAIL: hook secret'; END IF;
  IF NOT public.payout_hook_ok(public.setting('payout_hook_secret')#>>'{}') THEN RAISE EXCEPTION 'FAIL: hook ok'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payout-weekly' AND schedule = '30 4 * * 1') THEN RAISE EXCEPTION 'FAIL: weekly cron (Mon 10:00 IST)'; END IF;
  UPDATE public.app_settings SET value = 'true' WHERE key = 'payouts_mock';
  IF public.payout_retry_sweep() <> 0 THEN RAISE EXCEPTION 'FAIL: sweep in mock'; END IF;
  UPDATE public.app_settings SET value = 'false' WHERE key = 'payouts_auto';
  IF NOT (public.payout_weekly()->>'paused')::boolean THEN RAISE EXCEPTION 'FAIL: weekly respects auto switch'; END IF;
  RAISE NOTICE 'PASS: payout hook secret, Monday 10:00 IST cron, mock/auto switches';
END $$;
ROLLBACK;
