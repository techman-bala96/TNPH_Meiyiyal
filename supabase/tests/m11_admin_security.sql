-- M11 admin MFA: admin powers need aal2 when admin_mfa_required is on; raw role still visible; off-switch is SQL-only.
BEGIN;
UPDATE public.app_settings SET value = 'true' WHERE key = 'admin_mfa_required';
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000e101','sec-a@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000e102','sec-b@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000e103','sec-u@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000e101','admin'), ('00000000-0000-0000-0000-00000000e102','admin');
INSERT INTO auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e102', 'phone', 'totp', 'verified', now(), now(), 'x');
SET LOCAL role authenticated;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated","aal":"aal1"}', true);
DO $$ DECLARE s jsonb; ok boolean; BEGIN
  s := public.admin_status();
  IF NOT (s->>'role')::boolean OR (s->>'ok')::boolean OR NOT (s->>'mfa_required')::boolean THEN RAISE EXCEPTION 'FAIL: status aal1 %', s; END IF;
  IF public.is_admin() THEN RAISE EXCEPTION 'FAIL: is_admin without MFA'; END IF;
  BEGIN PERFORM * FROM public.admin_settings(); ok := true; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: admin RPC without MFA'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-00000000e102') THEN RAISE EXCEPTION 'FAIL: RLS admin read without MFA'; END IF;
  BEGIN PERFORM public.admin_security_event('mfa.verified'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: verified event at aal1'; END IF;
  RAISE NOTICE 'PASS: aal1 admin sees the role but has no admin powers';
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e101","role":"authenticated","aal":"aal2"}', true);
DO $$ DECLARE s jsonb; ok boolean; n int; BEGIN
  s := public.admin_status();
  IF NOT (s->>'ok')::boolean OR NOT public.is_admin() THEN RAISE EXCEPTION 'FAIL: aal2 %', s; END IF;
  PERFORM * FROM public.admin_settings();
  PERFORM public.admin_security_event('mfa.verified');
  IF (SELECT count(*) FROM public.admin_list_admins() WHERE user_id::text LIKE '00000000-0000-0000-0000-00000000e10%') <> 2 THEN RAISE EXCEPTION 'FAIL: list admins'; END IF;
  IF (SELECT factors FROM public.admin_list_admins() WHERE user_id = '00000000-0000-0000-0000-00000000e102') <> 1 THEN RAISE EXCEPTION 'FAIL: factor count'; END IF;
  -- off-switch refused from a session
  BEGIN PERFORM public.admin_set_setting('admin_mfa_required', 'false'::jsonb, 'test'); ok := true; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: MFA turned off from the app'; END IF;
  PERFORM public.admin_set_setting('admin_idle_minutes', '20'::jsonb, 'test');
  BEGIN PERFORM public.admin_reset_mfa('00000000-0000-0000-0000-00000000e101', 'lost phone'); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: reset own factor'; END IF;
  BEGIN PERFORM public.admin_reset_mfa('00000000-0000-0000-0000-00000000e102', ''); ok := true; EXCEPTION WHEN raise_exception THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: reset without note'; END IF;
  n := public.admin_reset_mfa('00000000-0000-0000-0000-00000000e102', 'lost phone, verified by call');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: reset count %', n; END IF;
  RAISE NOTICE 'PASS: aal2 admin has powers; MFA off-switch is SQL-only; colleague factor reset is audited';
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e103","role":"authenticated","aal":"aal2"}', true);
DO $$ DECLARE s jsonb; ok boolean; BEGIN
  s := public.admin_status();
  IF (s->>'role')::boolean OR (s->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: user status'; END IF;
  BEGIN PERFORM public.admin_security_event('mfa.verified'); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END;
  IF ok THEN RAISE EXCEPTION 'FAIL: non-admin event'; END IF;
END $$;

RESET role;
DO $$ BEGIN
  -- service / SQL context: has_role about another user is unchanged; the off-switch works from SQL.
  IF NOT public.has_role('00000000-0000-0000-0000-00000000e101', 'admin') THEN RAISE EXCEPTION 'FAIL: service view'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.app_settings SET value = 'false' WHERE key = 'admin_mfa_required';
  IF (SELECT count(*) FROM public.admin_audit WHERE actor = '00000000-0000-0000-0000-00000000e101' AND action IN ('admin.mfa.verified','admin.mfa_reset')) <> 2 THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
  RAISE NOTICE 'PASS: service checks unchanged, SQL can switch MFA off';
END $$;
ROLLBACK;
