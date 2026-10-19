-- M11 · SMS. Mock provider writes here instead of sending (local/dev). Rows older than 1 day are swept.
-- Production uses SMS_PROVIDER=msg91; nothing is written here then.
CREATE TABLE IF NOT EXISTS public.sms_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone text NOT NULL,
  template text NOT NULL,
  vars jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY; -- no policies: service role only
REVOKE ALL ON public.sms_outbox FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sms_outbox_sweep() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.sms_outbox WHERE created_at < now() - interval '1 day' RETURNING 1) SELECT count(*)::int FROM d $$;
REVOKE ALL ON FUNCTION public.sms_outbox_sweep() FROM public, anon, authenticated;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sms-outbox-sweep';
  PERFORM cron.schedule('sms-outbox-sweep', '0 * * * *', 'SELECT public.sms_outbox_sweep()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable (%)', SQLERRM;
END $$;
