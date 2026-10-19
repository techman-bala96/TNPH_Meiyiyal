-- M11 · admin hardening. Admin powers need a TOTP second factor (session aal2) when admin_mfa_required is on (the default).
-- Enforced in has_role itself, so every RLS policy and admin RPC written so far is covered without touching it.
INSERT INTO public.app_settings(key, value) VALUES
  ('admin_mfa_required', 'true'), ('admin_idle_minutes', '30'), ('captcha_provider', '"none"')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_specs(key, grp, kind, min, max, options, sort, label_i18n, prod_hint) VALUES
  ('admin_mfa_required', 'security', 'bool', NULL, NULL, NULL, 110, '{"en":"Admins must use an authenticator app (TOTP)","ta":"நிர்வாகிகளுக்கு அங்கீகாரச் செயலி (TOTP) கட்டாயம்"}', 'true (can only be turned off from SQL)'),
  ('admin_idle_minutes', 'security', 'number', 5, 240, NULL, 111, '{"en":"Sign admins out after idle minutes","ta":"செயலற்ற நிமிடங்களுக்குப் பின் நிர்வாகி வெளியேற்றம்"}', '30'),
  ('captcha_provider', 'security', 'enum', NULL, NULL, ARRAY['none','mock','turnstile','hcaptcha'], 112, '{"en":"Sign-in captcha (informational; set the matching VITE_CAPTCHA_PROVIDER and [auth.captcha])","ta":"உள்நுழைவு கேப்ட்சா (தகவல்)"}', 'turnstile')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_mfa_ok() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT COALESCE((public.setting('admin_mfa_required') #>> '{}')::boolean, true)
      OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' $$;
REVOKE ALL ON FUNCTION public.admin_mfa_ok() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_ok() TO authenticated;

-- Raw role check for code that asks about someone else (blockers, notifications) or runs as service/cron.
CREATE OR REPLACE FUNCTION public.has_role_raw(_uid uuid, _role public.user_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = _role) $$;
REVOKE ALL ON FUNCTION public.has_role_raw(uuid, public.user_role) FROM public, anon, authenticated;

-- The signed-in user asking about their own admin role must have passed MFA. Questions about other users are unchanged.
CREATE OR REPLACE FUNCTION public.has_role(_uid uuid, _role public.user_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_raw(_uid, _role)
     AND (_role <> 'admin' OR _uid IS DISTINCT FROM auth.uid() OR public.admin_mfa_ok()) $$;

CREATE OR REPLACE FUNCTION public.admin_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'role', public.has_role_raw(auth.uid(), 'admin'),
    'mfa_required', COALESCE((public.setting('admin_mfa_required') #>> '{}')::boolean, true),
    'aal', COALESCE(auth.jwt() ->> 'aal', 'aal1'),
    'ok', public.has_role(auth.uid(), 'admin'),
    'idle_minutes', public.setting_num('admin_idle_minutes', 30)) $$;
REVOKE ALL ON FUNCTION public.admin_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;

-- Audit trail for second-factor events (enrolled / verified / signed out idle).
CREATE OR REPLACE FUNCTION public.admin_security_event(_event text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role_raw(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  IF _event NOT IN ('mfa.enrolled', 'mfa.verified', 'idle.signout') THEN RAISE EXCEPTION 'bad event'; END IF;
  IF _event <> 'idle.signout' AND COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN RAISE EXCEPTION 'not verified'; END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'admin.' || _event, auth.uid(), NULL, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_security_event(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_security_event(text) TO authenticated;

-- Another (verified) admin resets a colleague's lost authenticator; they enrol again at next sign-in.
CREATE OR REPLACE FUNCTION public.admin_reset_mfa(_user uuid, _note text) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; BEGIN
  PERFORM public.admin_guard();
  IF _user = auth.uid() THEN RAISE EXCEPTION 'cannot reset your own factor'; END IF;
  IF NOT public.has_role_raw(_user, 'admin') THEN RAISE EXCEPTION 'not an admin'; END IF;
  IF length(COALESCE(trim(_note), '')) < 5 THEN RAISE EXCEPTION 'note required'; END IF;
  DELETE FROM auth.mfa_factors WHERE user_id = _user; GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'admin.mfa_reset', _user, _note, jsonb_build_object('factors', n));
  RETURN n; END $$;
REVOKE ALL ON FUNCTION public.admin_reset_mfa(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_admins() RETURNS TABLE(user_id uuid, name text, email text, factors int, last_verified timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY SELECT r.user_id, p.full_name, u.email::text,
    (SELECT count(*)::int FROM auth.mfa_factors f WHERE f.user_id = r.user_id AND f.status = 'verified'),
    (SELECT max(a.created_at) FROM public.admin_audit a WHERE a.actor = r.user_id AND a.action = 'admin.mfa.verified')
  FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id LEFT JOIN public.profiles p ON p.user_id = r.user_id
  WHERE r.role = 'admin' ORDER BY p.full_name NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_admins() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;

-- Turning MFA off is a SQL-only operation (a stolen admin session must not be able to drop the second factor).
CREATE OR REPLACE FUNCTION public.trg_guard_admin_mfa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.key = 'admin_mfa_required' AND auth.uid() IS NOT NULL
     AND COALESCE((OLD.value #>> '{}')::boolean, true) AND NOT COALESCE((NEW.value #>> '{}')::boolean, true) THEN
    RAISE EXCEPTION 'admin MFA can only be turned off from SQL' USING ERRCODE = '42501';
  END IF;
  RETURN NEW; END $$;
DROP TRIGGER IF EXISTS guard_admin_mfa ON public.app_settings;
CREATE TRIGGER guard_admin_mfa BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.trg_guard_admin_mfa();
