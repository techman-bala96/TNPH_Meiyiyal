-- M11 referrals + professionals by district. One transaction, rolled back.
BEGIN;
INSERT INTO auth.users(id, email, aud, role, created_at) VALUES
 ('00000000-0000-0000-0000-00000000e101','ref-a@test.local','authenticated','authenticated', now()),
 ('00000000-0000-0000-0000-00000000e102','ref-b@test.local','authenticated','authenticated', now()),
 ('00000000-0000-0000-0000-00000000e103','ref-c@test.local','authenticated','authenticated', now()),
 ('00000000-0000-0000-0000-00000000e104','ref-old@test.local','authenticated','authenticated', now() - interval '90 days'),
 ('00000000-0000-0000-0000-00000000e109','ref-admin@test.local','authenticated','authenticated', now());
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000e109','admin');
INSERT INTO public.profiles(user_id, full_name) VALUES ('00000000-0000-0000-0000-00000000e101','Anbu A'), ('00000000-0000-0000-0000-00000000e102','Bala B')
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;
SET LOCAL role authenticated;

CREATE TEMP TABLE IF NOT EXISTS t_codes(k text PRIMARY KEY, code text) ON COMMIT DROP;
GRANT ALL ON t_codes TO authenticated;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated"}', true);
DO $$ DECLARE r jsonb; r2 jsonb; BEGIN
  r := public.my_referral(); r2 := public.my_referral();
  IF r->>'code' !~ '^M[A-Z2-9]{6}$' OR r->>'code' <> r2->>'code' THEN RAISE EXCEPTION 'FAIL: personal code %', r; END IF;
  IF public.referral_claim(r->>'code') <> 'self' THEN RAISE EXCEPTION 'FAIL: self-referral allowed'; END IF;
  INSERT INTO t_codes VALUES ('a', r->>'code');
  BEGIN PERFORM * FROM public.admin_referrals(); RAISE EXCEPTION 'FAIL: user sees referrals'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.admin_professionals_by_district(); RAISE EXCEPTION 'FAIL: user sees districts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.referrals; RAISE EXCEPTION 'FAIL: table readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: personal code stable, self-referral blocked, admin-only views';
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e102","role":"authenticated"}', true);
DO $$ DECLARE _a text := (SELECT code FROM t_codes WHERE k = 'a'); BEGIN
  IF (public.referral_check(lower(_a))->>'valid')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: check'; END IF;
  IF (public.referral_check('NOPE1')->>'valid')::boolean THEN RAISE EXCEPTION 'FAIL: bogus valid'; END IF;
  IF public.referral_claim('NOPE1') <> 'invalid' THEN RAISE EXCEPTION 'FAIL: invalid code'; END IF;
  IF public.referral_claim(' ' || lower(_a) || ' ', 'worker') <> 'ok' THEN RAISE EXCEPTION 'FAIL: claim'; END IF;
  IF public.referral_claim(_a) <> 'already' THEN RAISE EXCEPTION 'FAIL: duplicate'; END IF;
  IF (public.my_referral()->>'referred_by') <> _a OR (public.my_referral()->>'can_claim')::boolean THEN RAISE EXCEPTION 'FAIL: my_referral referred_by'; END IF;
  INSERT INTO t_codes VALUES ('b', public.my_referral()->>'code');
  RAISE NOTICE 'PASS: claim normalises code, duplicates refused';
END $$;

-- A cannot be referred back by B (two-way loop), old accounts cannot attach a code
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated"}', true);
DO $$ BEGIN
  IF public.referral_claim((SELECT code FROM t_codes WHERE k = 'b')) <> 'self' THEN RAISE EXCEPTION 'FAIL: loop allowed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e104","role":"authenticated"}', true);
DO $$ BEGIN
  IF public.referral_claim((SELECT code FROM t_codes WHERE k = 'a')) <> 'too_late' THEN RAISE EXCEPTION 'FAIL: old account'; END IF;
  RAISE NOTICE 'PASS: loop + late claim refused';
END $$;

-- admin campaign codes
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e109","role":"authenticated"}', true);
DO $$ DECLARE _c text; BEGIN
  _c := public.admin_create_campaign_code('fb-diwali', 'Facebook Diwali post', 1, NULL);
  IF _c <> 'FB-DIWALI' THEN RAISE EXCEPTION 'FAIL: campaign code %', _c; END IF;
  BEGIN PERFORM public.admin_create_campaign_code('FB-DIWALI', 'dup'); RAISE EXCEPTION 'FAIL: dup campaign'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_create_campaign_code('x y', 'bad'); RAISE EXCEPTION 'FAIL: bad code'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  IF public.admin_create_campaign_code(NULL, 'Auto code') !~ '^C[A-Z2-9]{6}$' THEN RAISE EXCEPTION 'FAIL: auto campaign code'; END IF;
  BEGIN PERFORM public.admin_set_setting('referral_rewards', '{"enabled": true}'); RAISE EXCEPTION 'FAIL: rewards enabled';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  IF NOT EXISTS (SELECT 1 FROM public.admin_settings() WHERE key = 'referral_rewards' AND (value->>'enabled')::boolean = false) THEN RAISE EXCEPTION 'FAIL: rewards setting'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated"}', true);
DO $$ BEGIN
  IF public.referral_claim('fb-diwali') <> 'ok' THEN RAISE EXCEPTION 'FAIL: campaign claim'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e109","role":"authenticated"}', true);
DO $$ BEGIN
  IF (public.referral_check('FB-DIWALI')->>'valid')::boolean THEN RAISE EXCEPTION 'FAIL: max uses'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_referral_codes() WHERE code = (SELECT code FROM t_codes WHERE k = 'a') AND uses = 1 AND owner_name = 'Anbu A') THEN RAISE EXCEPTION 'FAIL: per-referrer count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_referral_codes('campaign') WHERE code = 'FB-DIWALI' AND uses = 1) THEN RAISE EXCEPTION 'FAIL: campaign count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_referrals() WHERE referred_name = 'Bala B' AND referrer_name = 'Anbu A' AND landing = 'worker') THEN RAISE EXCEPTION 'FAIL: who referred whom'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_referrals('FB-DIWALI') WHERE referrer_name IS NOT NULL) THEN RAISE EXCEPTION 'FAIL: campaign referrer'; END IF;
  PERFORM public.admin_set_referral_code_active('FB-DIWALI', false);
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit WHERE action IN ('referral.campaign_create','referral.disable') AND note = 'FB-DIWALI' GROUP BY note HAVING count(*) = 2) THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions t JOIN public.wallets w ON w.id = t.wallet_id WHERE w.user_id::text LIKE '00000000-0000-0000-0000-00000000e1%') THEN RAISE EXCEPTION 'FAIL: rewards moved'; END IF;
  RAISE NOTICE 'PASS: campaign codes, counts per referrer, who→whom, no rewards';
END $$;

-- professionals by district
RESET role;
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, district_slug) VALUES
 ('00000000-0000-0000-0000-00000000e201','00000000-0000-0000-0000-00000000e101','Dr A','professionals--doctor--allopathy','approved','ariyalur'),
 ('00000000-0000-0000-0000-00000000e202','00000000-0000-0000-0000-00000000e102','Dr Vet','professionals--doctor--veterinary--poultry','pending','ariyalur'),
 ('00000000-0000-0000-0000-00000000e203','00000000-0000-0000-0000-00000000e103','Adv C','professionals--lawyer','rejected','ariyalur'),
 ('00000000-0000-0000-0000-00000000e204','00000000-0000-0000-0000-00000000e104','Er D','professionals--engineer','draft','ariyalur');
SELECT set_config('meiyiyal.trusted','off', true);
SET LOCAL role authenticated;
DO $$ DECLARE r record; _n int; _base record; BEGIN
  SELECT count(*) INTO _n FROM public.admin_professionals_by_district() WHERE district_slug IS NOT NULL;
  IF _n <> 38 THEN RAISE EXCEPTION 'FAIL: % districts', _n; END IF;
  -- other rows already in the local DB are fine; compare against the delta in Ariyalur only
  SELECT * INTO r FROM public.admin_professionals_by_district() WHERE district_slug = 'ariyalur';
  IF r.total < 4 OR r.submitted < 3 OR r.pending < 1 OR r.approved < 1 OR r.rejected < 1 OR r.doctor < 2 OR r.veterinary < 1 OR r.lawyer < 1 OR r.engineer < 1 THEN RAISE EXCEPTION 'FAIL: counts %', r; END IF;
  SELECT * INTO _base FROM public.admin_professionals_by_district('veterinary', 'all') WHERE district_slug = 'ariyalur';
  IF _base.total <> r.veterinary OR _base.pending < 1 OR _base.approved <> 0 + (SELECT count(*) FROM public.workers WHERE district_slug = 'ariyalur' AND status = 'approved' AND primary_node LIKE 'professionals--doctor--veterinary%') THEN RAISE EXCEPTION 'FAIL: vet filter %', _base; END IF;
  SELECT * INTO _base FROM public.admin_professionals_by_district('all', 'approved') WHERE district_slug = 'ariyalur';
  IF _base.total <> r.approved OR _base.lawyer <> (SELECT count(*) FROM public.workers WHERE district_slug = 'ariyalur' AND status = 'approved' AND primary_node LIKE 'professionals--lawyer%') THEN RAISE EXCEPTION 'FAIL: status filter %', _base; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_professionals_by_district() WHERE district_slug = 'nilgiris' AND total < 0) THEN RAISE EXCEPTION 'FAIL'; END IF;
  BEGIN PERFORM * FROM public.admin_professionals_by_district('astrologer'); RAISE EXCEPTION 'FAIL: bad filter'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: professionals by district (38 rows, status/profession splits, filters)';
END $$;
ROLLBACK;
