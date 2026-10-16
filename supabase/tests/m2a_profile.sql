BEGIN;
INSERT INTO auth.users(id,email,aud,role) VALUES ('00000000-0000-0000-0000-0000000000e1','e1@test.local','authenticated','authenticated'),('00000000-0000-0000-0000-0000000000e2','e2@test.local','authenticated','authenticated');
UPDATE public.profiles SET phone_number='+919999999999', full_name=NULL WHERE user_id='00000000-0000-0000-0000-0000000000e2';
DELETE FROM public.profiles WHERE user_id='00000000-0000-0000-0000-0000000000e1';
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}',true);
DO $$ BEGIN
  INSERT INTO public.profiles(user_id,email,role) VALUES ('00000000-0000-0000-0000-0000000000e1','e1@test.local','admin');
  IF (SELECT role FROM public.profiles WHERE user_id=auth.uid()) <> 'user' THEN RAISE EXCEPTION 'FAIL: self-assigned role'; END IF;
  UPDATE public.profiles SET full_name='E One', dob='1990-01-01', prefs='{"theme":"dark"}' WHERE user_id=auth.uid();
  RAISE NOTICE 'PASS: owner creates/updates profile; role forced to user';
  BEGIN UPDATE public.profiles SET role='admin' WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: role escalation';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: cannot change own role'; END;
  BEGIN UPDATE public.profiles SET dob='2999-01-01' WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: future dob';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: dob validated'; END;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id='00000000-0000-0000-0000-0000000000e2') THEN RAISE EXCEPTION 'FAIL: other profile (phone/email) readable'; END IF;
  UPDATE public.profiles SET full_name='hacked' WHERE user_id='00000000-0000-0000-0000-0000000000e2';
  RAISE NOTICE 'PASS: other users profiles hidden';
  BEGIN INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('avatars','00000000-0000-0000-0000-0000000000e2/x.webp',auth.uid()); RAISE EXCEPTION 'FAIL: wrote into other avatar folder';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: avatar write limited to own folder'; END;
  INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('avatars','00000000-0000-0000-0000-0000000000e1/a.webp',auth.uid());
  RAISE NOTICE 'PASS: own avatar upload allowed';
END $$;
RESET role;
DO $$ BEGIN
  IF (SELECT full_name FROM public.profiles WHERE user_id='00000000-0000-0000-0000-0000000000e2') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: updated other profile'; END IF;
END $$;
ROLLBACK;
