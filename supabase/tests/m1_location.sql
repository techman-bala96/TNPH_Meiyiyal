-- Run: docker exec -i supabase_db_meyiyal-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/m1_location.sql
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-0000000000c1','c1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000c2','c2@test.local','authenticated','authenticated');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tn_districts) <> 38 THEN RAISE EXCEPTION 'FAIL: expected 38 districts'; END IF;
  IF (SELECT count(*) FROM public.tn_areas) < 213 THEN RAISE EXCEPTION 'FAIL: expected >=213 areas'; END IF;
  IF (SELECT slug FROM public.tn_districts ORDER BY sort LIMIT 1) <> 'kanniyakumari' THEN RAISE EXCEPTION 'FAIL: Kanniyakumari not first'; END IF;
  IF (SELECT district_slug FROM public.nearest_location(8.0883,77.5385)) <> 'kanniyakumari' THEN RAISE EXCEPTION 'FAIL: nearest(Kanniyakumari)'; END IF;
  IF (SELECT district_slug FROM public.nearest_location(13.0827,80.2707)) <> 'chennai' THEN RAISE EXCEPTION 'FAIL: nearest(Chennai)'; END IF;
  RAISE NOTICE 'PASS: seed counts, order, nearest_location';
END $$;
SET LOCAL role anon;
DO $$ BEGIN
  BEGIN PERFORM public.set_current_location(8.08,77.54,'gps'); RAISE EXCEPTION 'FAIL: anon save allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot save location'; END;
  IF (SELECT count(*) FROM public.tn_districts) <> 38 THEN RAISE EXCEPTION 'FAIL: anon cannot read districts'; END IF;
END $$;
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
DO $$ DECLARE a bigint; BEGIN
  SELECT id INTO a FROM public.tn_areas WHERE district_slug='kanniyakumari' ORDER BY sort LIMIT 1;
  PERFORM public.set_current_location(8.08,77.54,'gps',NULL,'kanniyakumari',a);
  PERFORM public.set_current_location(8.18,77.41,'list',NULL,'kanniyakumari',a);
  IF (SELECT count(*) FROM public.user_locations WHERE is_current) <> 1 THEN RAISE EXCEPTION 'FAIL: one current location'; END IF;
  IF (SELECT source FROM public.my_current_location()) <> 'list' THEN RAISE EXCEPTION 'FAIL: my_current_location'; END IF;
  RAISE NOTICE 'PASS: owner saves; single current location';
  BEGIN PERFORM public.set_current_location(8.1,77.5,'list',NULL,'chennai',a); RAISE EXCEPTION 'FAIL: mismatched area';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: area/district mismatch rejected'; END;
  BEGIN INSERT INTO public.user_locations(user_id,geog,source) VALUES ('00000000-0000-0000-0000-0000000000c2','POINT(77 8)','gps');
    RAISE EXCEPTION 'FAIL: wrote another user location';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: cannot write another user''s location'; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_locations) <> 0 THEN RAISE EXCEPTION 'FAIL: read other user locations'; END IF;
  UPDATE public.user_locations SET address='x';
  RESET role;
  IF EXISTS (SELECT 1 FROM public.user_locations WHERE address='x') THEN RAISE EXCEPTION 'FAIL: updated other user location'; END IF;
  RAISE NOTICE 'PASS: other user cannot read/update';
END $$;
ROLLBACK;
