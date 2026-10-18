-- Run: docker exec -i supabase_db_meyiyal-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/m0_security.sql
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES ('00000000-0000-0000-0000-0000000000a1','a@test.local','authenticated','authenticated');
INSERT INTO public.wallets(user_id, balance) VALUES ('00000000-0000-0000-0000-0000000000a1', 0);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
DO $$ BEGIN
  BEGIN UPDATE public.wallets SET balance = 1000000; RAISE EXCEPTION 'FAIL: wallet update allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: wallet mint blocked'; END;
  BEGIN INSERT INTO public.wallet_transactions(wallet_id,type,amount) SELECT id,'top_up',999 FROM public.wallets;
    RAISE EXCEPTION 'FAIL: txn insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: wallet txn insert blocked'; END;
END $$;
RESET role;
INSERT INTO public.workers(id,user_id,category) VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','professional');
SET LOCAL role authenticated;
DO $$ DECLARE v boolean; BEGIN
  SELECT is_verified INTO v FROM public.workers WHERE id='00000000-0000-0000-0000-0000000000b1';
  BEGIN UPDATE public.workers SET is_verified = true WHERE id='00000000-0000-0000-0000-0000000000b1';
    RAISE EXCEPTION 'FAIL: self-verify worker allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: worker protected fields blocked'; END;
  UPDATE public.workers SET about = 'ok' WHERE id='00000000-0000-0000-0000-0000000000b1';
  RAISE NOTICE 'PASS: worker can edit about';
  BEGIN INSERT INTO public.kyc_verification(worker_id,status,aadhaar_verified) VALUES ('00000000-0000-0000-0000-0000000000b1','verified',true);
    RAISE EXCEPTION 'FAIL: self-verified KYC insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: self-verified KYC insert blocked'; END;
  INSERT INTO public.kyc_verification(worker_id) VALUES ('00000000-0000-0000-0000-0000000000b1');
  RAISE NOTICE 'PASS: pending KYC submit allowed';
  UPDATE public.kyc_verification SET status='verified';
  IF EXISTS (SELECT 1 FROM public.kyc_verification WHERE status='verified') THEN RAISE EXCEPTION 'FAIL: KYC self-update'; END IF;
  RAISE NOTICE 'PASS: KYC self-update has no effect';
END $$;
ROLLBACK;
