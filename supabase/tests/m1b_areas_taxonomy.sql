-- Run: docker exec -i supabase_db_meyiyal-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/m1b_areas_taxonomy.sql
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.tn_areas WHERE center IS NULL) THEN RAISE EXCEPTION 'FAIL: area without coordinates'; END IF;
  IF EXISTS (SELECT 1 FROM public.tn_areas a JOIN public.tn_districts d ON d.slug=a.district_slug WHERE ST_Distance(a.center,d.center) > 100000)
    THEN RAISE EXCEPTION 'FAIL: area >100 km from its district'; END IF;
  IF (SELECT area_name FROM public.nearest_location(8.0883,77.5385)) <> 'Kanniyakumari' THEN RAISE EXCEPTION 'FAIL: Kanyakumari town area'; END IF;
  IF (SELECT area_name FROM public.nearest_location(13.0533,80.2833)) <> 'Mylapore' THEN RAISE EXCEPTION 'FAIL: Marina Beach area'; END IF;
  IF (SELECT area_name FROM public.nearest_location(8.1840,77.4315)) <> 'Nagercoil' THEN RAISE EXCEPTION 'FAIL: Nagercoil area'; END IF;
  IF (SELECT district_slug FROM public.nearest_location(10.4511,77.5154)) <> 'dindigul' THEN RAISE EXCEPTION 'FAIL: Palani district'; END IF;
  RAISE NOTICE 'PASS: all 213 areas have coordinates; nearest area accurate';
  IF (SELECT count(*) FROM public.taxonomy_nodes WHERE parent_slug='professionals' AND kind='category') <> 3 THEN RAISE EXCEPTION 'FAIL: 3 categories'; END IF;
  IF EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE NOT (name_i18n ? 'en' AND name_i18n ? 'ta')) THEN RAISE EXCEPTION 'FAIL: node missing en/ta'; END IF;
  IF EXISTS (SELECT 1 FROM public.taxonomy_nodes c LEFT JOIN public.taxonomy_nodes p ON p.slug=c.parent_slug WHERE c.parent_slug IS NOT NULL AND p.slug IS NULL)
    THEN RAISE EXCEPTION 'FAIL: orphan node'; END IF;
  RAISE NOTICE 'PASS: taxonomy tree complete (EN+TA, no orphans)';
END $$;
INSERT INTO public.taxonomy_nodes(slug,parent_slug,kind,name_i18n,is_active) VALUES ('professionals--hidden-test','professionals','category','{"en":"Hidden","ta":"மறை"}',false);
SET LOCAL role anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.taxonomy_nodes) < 81 THEN RAISE EXCEPTION 'FAIL: anon cannot read tree'; END IF;
  IF EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug='professionals--hidden-test') THEN RAISE EXCEPTION 'FAIL: inactive node visible'; END IF;
  BEGIN INSERT INTO public.taxonomy_nodes(slug,kind,name_i18n) VALUES ('x','group','{"en":"x"}'); RAISE EXCEPTION 'FAIL: anon inserted node';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot write taxonomy'; END;
  RAISE NOTICE 'PASS: inactive nodes hidden';
END $$;
RESET role;
INSERT INTO auth.users(id,email,aud,role) VALUES ('00000000-0000-0000-0000-0000000000d1','d1@test.local','authenticated','authenticated');
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}',true);
DO $$ BEGIN
  BEGIN UPDATE public.taxonomy_nodes SET is_active=false WHERE slug='professionals--doctor';
    IF NOT FOUND THEN RAISE NOTICE 'PASS: user cannot modify taxonomy'; ELSE RAISE EXCEPTION 'FAIL: user modified taxonomy'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: user cannot modify taxonomy'; END;
  BEGIN UPDATE public.tn_areas SET name='x' WHERE id=1;
    IF NOT FOUND THEN RAISE NOTICE 'PASS: user cannot modify areas'; ELSE RAISE EXCEPTION 'FAIL: user modified areas'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: user cannot modify areas'; END;
END $$;
ROLLBACK;
