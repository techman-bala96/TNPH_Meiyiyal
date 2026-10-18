BEGIN;
-- M11 SMS mock outbox: hourly sms-outbox-sweep removes rows older than a day, keeps fresh ones; clients cannot read it.
INSERT INTO public.sms_outbox(phone, template, vars, created_at) VALUES
  ('+919000000101', 'otp', '{"code":"111111"}', now() - interval '2 days'),
  ('+919000000102', 'otp', '{"code":"222222"}', now() - interval '1 hour');
DO $$ DECLARE n int; BEGIN
  n := public.sms_outbox_sweep();
  IF n < 1 THEN RAISE EXCEPTION 'FAIL: sweep removed % rows', n; END IF;
  IF EXISTS (SELECT 1 FROM public.sms_outbox WHERE phone = '+919000000101') THEN RAISE EXCEPTION 'FAIL: old row kept'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sms_outbox WHERE phone = '+919000000102') THEN RAISE EXCEPTION 'FAIL: fresh row swept'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sms-outbox-sweep' AND schedule = '0 * * * *') THEN RAISE EXCEPTION 'FAIL: cron job missing'; END IF;
  RAISE NOTICE 'PASS: sms-outbox-sweep removes day-old rows only (hourly job scheduled)';
END $$;
SET LOCAL role authenticated;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.sms_outbox; RAISE EXCEPTION 'FAIL: client can read sms_outbox';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: sms_outbox is service-only'; END;
  BEGIN PERFORM public.sms_outbox_sweep(); RAISE EXCEPTION 'FAIL: client can run the sweep';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: sweep is not callable by clients'; END;
END $$;
RESET role;
ROLLBACK;
