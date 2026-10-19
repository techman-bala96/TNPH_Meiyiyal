-- M11 · drop the Lovable-era tables nothing uses any more. Safe by construction: the migration ABORTS (and changes nothing)
-- if any of them holds user data, or if a live column still points at them. Checked before writing this:
--   no reference in src/, services/, supabase/functions/, e2e/, tests/, or any public function, view or policy body;
--   the only incoming foreign keys are workers.occupation_id and wallet_transactions.request_id, both always NULL.
-- `occupations` holds the 20 seed rows of the old category list (replaced by taxonomy_nodes in M1); those are not user data.
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['certificates','chat_messages','occupation_services','service_requests','support_tickets',
                           'worker_education','worker_experience','worker_portfolio'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'legacy cleanup stopped: public.% has % rows — archive them first', t, n; END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'occupation_id')
     AND EXISTS (SELECT 1 FROM public.workers WHERE occupation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'legacy cleanup stopped: workers.occupation_id is in use';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'request_id')
     AND EXISTS (SELECT 1 FROM public.wallet_transactions WHERE request_id IS NOT NULL) THEN
    RAISE EXCEPTION 'legacy cleanup stopped: wallet_transactions.request_id is in use';
  END IF;
END $$;

ALTER TABLE public.workers DROP COLUMN IF EXISTS occupation_id;
ALTER TABLE public.wallet_transactions DROP COLUMN IF EXISTS request_id;

DROP TABLE IF EXISTS public.chat_messages, public.certificates, public.support_tickets, public.service_requests,
  public.occupation_services, public.occupations, public.worker_education, public.worker_experience, public.worker_portfolio;

DROP FUNCTION IF EXISTS public.guard_request_payment();
-- Enums that only those tables used.
DROP TYPE IF EXISTS public.request_status;
DROP TYPE IF EXISTS public.payment_methodology;
