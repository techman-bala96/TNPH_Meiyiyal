-- M11 legacy cleanup: Lovable-era tables are gone, current ones untouched.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['certificates','chat_messages','occupation_services','occupations','service_requests','support_tickets','worker_education','worker_experience','worker_portfolio'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: % still exists', t; END IF;
  END LOOP;
  IF to_regclass('public.workers') IS NULL OR to_regclass('public.wallet_transactions') IS NULL OR to_regclass('public.taxonomy_nodes') IS NULL THEN RAISE EXCEPTION 'FAIL: current table lost'; END IF;
  RAISE NOTICE 'PASS: legacy tables dropped, current schema intact';
END $$;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tn_areas WHERE COALESCE(name_ta, '') = '') > 5 THEN RAISE EXCEPTION 'FAIL: Tamil area names missing'; END IF;
  IF (SELECT name_ta FROM public.tn_areas WHERE district_slug = 'krishnagiri' AND name = 'Hosur') <> 'ஓசூர்' THEN RAISE EXCEPTION 'FAIL: Hosur'; END IF;
  RAISE NOTICE 'PASS: Tamil area names filled except the listed uncertain ones';
END $$;
