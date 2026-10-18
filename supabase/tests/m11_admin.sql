-- M11 admin editors: admin-only, validated, audited. One transaction, rolled back.
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000ad01','adm@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000ad02','usr@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000ad01','admin');
SET LOCAL role authenticated;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ad02","role":"authenticated"}', true);
DO $$ DECLARE ok boolean; BEGIN
  BEGIN PERFORM * FROM public.admin_settings(); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: user lists settings'; END IF;
  BEGIN PERFORM public.admin_set_setting('gst_pct', '12'); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: user sets setting'; END IF;
  BEGIN PERFORM public.admin_set_commission('professionals--lawyer', 16); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: user sets commission'; END IF;
  BEGIN PERFORM public.admin_upsert_node('professionals--lawyer','tax-x','{"en":"X","ta":"எ"}'); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: user edits taxonomy'; END IF;
  BEGIN INSERT INTO public.verification_rules(category_slug, check_name, required, weight) VALUES ('professionals--lawyer','forensics',false,0); ok := true;
  EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: direct rules write'; END IF;
  RAISE NOTICE 'PASS: non-admin blocked from every editor';
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated"}', true);
DO $$ DECLARE ok boolean; v jsonb; BEGIN
  -- secrets are never listed
  IF EXISTS (SELECT 1 FROM public.admin_settings() s WHERE s.key ~ '(pepper|secret|service_key|stub_otp)') THEN RAISE EXCEPTION 'FAIL: secret listed'; END IF;
  IF (SELECT count(*) FROM public.admin_settings()) < 50 THEN RAISE EXCEPTION 'FAIL: settings list short'; END IF;
  BEGIN PERFORM public.admin_set_setting('aadhaar_pepper', '"x"'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: secret editable'; END IF;
  -- validation
  v := public.admin_set_setting('gst_pct', '"12"', 'test');
  IF v <> '12'::jsonb OR public.setting_num('gst_pct', 0) <> 12 THEN RAISE EXCEPTION 'FAIL: number set'; END IF;
  BEGIN PERFORM public.admin_set_setting('gst_pct', '40'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: range'; END IF;
  BEGIN PERFORM public.admin_set_setting('payouts_auto', '"yes"'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: bool type'; END IF;
  BEGIN PERFORM public.admin_set_setting('kyc_provider', '"aws"'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: enum'; END IF;
  BEGIN PERFORM public.admin_set_setting('verify_service_url', '"ftp://x"'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: url'; END IF;
  BEGIN PERFORM public.admin_set_setting('verify_retain_days', '45'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: raw selfie retention above 30 days'; END IF;
  BEGIN PERFORM public.admin_set_setting('verify_risk_approve', '70'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: approve>=reject'; END IF;
  BEGIN PERFORM public.admin_set_setting('verify_auto_approve_categories', '{"professionals--nope":true}'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: unknown category in map'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit WHERE action = 'setting.set' AND data->>'key' = 'gst_pct' AND data->'old' = '18'::jsonb AND data->'new' = '12'::jsonb) THEN RAISE EXCEPTION 'FAIL: audit old/new'; END IF;
  RAISE NOTICE 'PASS: settings validated + audited, secrets hidden';
  -- per-category auto-approve: global off, one category on
  PERFORM public.admin_set_setting('verify_auto_approve', 'false');
  PERFORM public.admin_set_setting('verify_auto_approve_categories', '{"professionals--engineer":true,"professionals--doctor":false}');
END $$;
RESET role;
DO $$ BEGIN
  IF NOT public.verify_auto_for('professionals--engineer') OR public.verify_auto_for('professionals--doctor') OR public.verify_auto_for('professionals--lawyer') THEN RAISE EXCEPTION 'FAIL: per-category switch (global off)'; END IF;
  UPDATE public.app_settings SET value = 'true' WHERE key = 'verify_auto_approve';
  IF NOT public.verify_auto_for('professionals--lawyer') OR public.verify_auto_for('professionals--doctor') THEN RAISE EXCEPTION 'FAIL: per-category switch (global on)'; END IF;
  IF position('verify_auto_for' IN pg_get_functiondef('public.verification_decide(uuid)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'FAIL: decide not patched'; END IF;
  RAISE NOTICE 'PASS: per-category auto-approve overrides global';
END $$;
SET LOCAL role authenticated;
DO $$ DECLARE ok boolean; BEGIN
  -- commission
  PERFORM public.admin_set_commission('professionals--lawyer', 16.5);
  IF (SELECT pct FROM public.commission_rules WHERE node_slug = 'professionals--lawyer') <> 16.5 THEN RAISE EXCEPTION 'FAIL: commission'; END IF;
  BEGIN PERFORM public.admin_set_commission('professionals--lawyer', 25); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: commission range'; END IF;
  PERFORM public.admin_set_commission('professionals--lawyer', NULL);
  IF EXISTS (SELECT 1 FROM public.commission_rules WHERE node_slug = 'professionals--lawyer') THEN RAISE EXCEPTION 'FAIL: commission clear'; END IF;
  -- milestones
  PERFORM public.admin_upsert_milestone('test_ms', 'sessions_served', 7, 0, '{"en":"Seven","ta":"ஏழு"}', '{"en":"Served 7","ta":"7 சேவை"}', 'award', 'teal', 99, true);
  BEGIN PERFORM public.admin_upsert_milestone('test_ms', 'rating_avg', 7, 0, '{"en":"x","ta":"y"}', '{"en":"x","ta":"y"}'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: rating > 5'; END IF;
  BEGIN PERFORM public.admin_upsert_milestone('test_ms2', 'sessions_served', 3, 0, '{"en":"x"}', '{"en":"x","ta":"y"}'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: Tamil title required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_milestones() WHERE slug = 'test_ms' AND color = 'teal') THEN RAISE EXCEPTION 'FAIL: milestone'; END IF;
  -- taxonomy
  IF public.admin_upsert_node('professionals--lawyer', 'space-law', '{"en":"Space Law","ta":"விண்வெளி சட்டம்"}', ARRAY['satellite'], 50, true) <> 'professionals--lawyer--space-law' THEN RAISE EXCEPTION 'FAIL: add node'; END IF;
  IF (SELECT kind FROM public.taxonomy_nodes WHERE slug = 'professionals--lawyer--space-law') <> 'subcategory' THEN RAISE EXCEPTION 'FAIL: node kind'; END IF;
  PERFORM public.admin_upsert_node('professionals--lawyer', 'space-law', '{"en":"Space Law","ta":"விண்வெளி சட்டம்"}', ARRAY['satellite'], 50, false);
  IF (SELECT is_active FROM public.taxonomy_nodes WHERE slug = 'professionals--lawyer--space-law') THEN RAISE EXCEPTION 'FAIL: deactivate'; END IF;
  BEGIN PERFORM public.admin_upsert_node('professionals', 'astrologer', '{"en":"A","ta":"அ"}'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: new top-level profession'; END IF;
  BEGIN PERFORM public.admin_upsert_node('professionals--lawyer', 'Bad Slug', '{"en":"A","ta":"அ"}'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: slug format'; END IF;
  -- requirements & rules keep the mandatory decisions
  PERFORM public.admin_set_requirements('professionals--lawyer--space-law', ARRAY['degree_cert','council_cert']);
  PERFORM public.admin_set_requirements('professionals--engineer--civil', ARRAY['degree_cert']);
  BEGIN PERFORM public.admin_set_requirements('professionals--lawyer--space-law', ARRAY['degree_cert']); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: council cert removable'; END IF;
  PERFORM public.admin_set_verification_rule('professionals--lawyer', 'forensics', false, 5);
  PERFORM public.admin_set_verification_rule('professionals--engineer--electrical', 'registry', false, 10);  -- no council today: may stay optional
  BEGIN PERFORM public.admin_set_verification_rule('professionals--lawyer', 'registry', false, 30); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: registry optional'; END IF;
  BEGIN PERFORM public.admin_set_verification_rule('professionals', 'identity', false, 30); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: identity optional'; END IF;
  IF (SELECT count(*) FROM public.admin_audit WHERE actor = '00000000-0000-0000-0000-00000000ad01' AND action IN ('commission.set','milestone.upsert','taxonomy.add','taxonomy.update','requirements.set','verify_rule.set')) < 7 THEN
    RAISE EXCEPTION 'FAIL: editor audit'; END IF;
  RAISE NOTICE 'PASS: commission / milestones / taxonomy / requirements editors, mandatory checks kept, audited';
END $$;
ROLLBACK;
