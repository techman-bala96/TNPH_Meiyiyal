-- M11 · referral / invite codes and the admin "Professionals by district" view.
-- v1 records who invited whom only. No credits or rewards move: referral_rewards stays disabled (admin_set_setting refuses enabled=true).

INSERT INTO public.app_settings(key, value) VALUES
  ('referral_rewards', '{"enabled": false, "referrer_credits": 0, "referred_credits": 0, "note": "Not active in v1. Rules to be decided."}'),
  ('referral_claim_days', '30')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_specs(key, grp, kind, min, max, sort, label_i18n, prod_hint) VALUES
  ('referral_claim_days', 'referrals', 'number', 1, 365, 90, '{"en":"New accounts can add an invite code within (days)","ta":"புதிய கணக்குகள் அழைப்புக் குறியீட்டைச் சேர்க்கும் அவகாசம் (நாள்)"}', NULL),
  ('referral_rewards', 'referrals', 'json', NULL, NULL, 91, '{"en":"Referral reward rules (disabled in v1)","ta":"பரிந்துரை வெகுமதி விதிகள் (v1-ல் முடக்கப்பட்டது)"}', 'keep enabled=false until rewards are decided')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{3,19}$'),
  kind text NOT NULL CHECK (kind IN ('personal','campaign')),
  owner_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label text CHECK (length(label) <= 80),
  active boolean NOT NULL DEFAULT true,
  max_uses int CHECK (max_uses IS NULL OR max_uses > 0),
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_one_personal ON public.referral_codes(owner_user) WHERE kind = 'personal';

CREATE TABLE IF NOT EXISTS public.referrals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referred_user uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,  -- one referral per account: no duplicates
  code text NOT NULL REFERENCES public.referral_codes(code) ON UPDATE CASCADE,
  referrer_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('personal','campaign')),
  landing text NOT NULL DEFAULT 'user' CHECK (landing IN ('user','worker')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_user IS NULL OR referrer_user <> referred_user)            -- no self-referral
);
CREATE INDEX IF NOT EXISTS referrals_code_idx ON public.referrals(code, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_user);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_codes, public.referrals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._referral_new_code() RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE _a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; _c text; _i int;
BEGIN
  LOOP
    _c := 'M';
    FOR _i IN 1..6 LOOP _c := _c || substr(_a, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = _c);
  END LOOP;
  RETURN _c;
END $$;
REVOKE ALL ON FUNCTION public._referral_new_code() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_referral() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _c text; _r record; _age interval;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  SELECT code INTO _c FROM public.referral_codes WHERE owner_user = _u AND kind = 'personal';
  IF _c IS NULL THEN
    _c := public._referral_new_code();
    INSERT INTO public.referral_codes(code, kind, owner_user, created_by) VALUES (_c, 'personal', _u, _u) ON CONFLICT DO NOTHING;
    SELECT code INTO _c FROM public.referral_codes WHERE owner_user = _u AND kind = 'personal';
  END IF;
  SELECT code, created_at INTO _r FROM public.referrals WHERE referred_user = _u;
  SELECT now() - created_at INTO _age FROM auth.users WHERE id = _u;
  RETURN jsonb_build_object('code', _c,
    'joined', (SELECT count(*) FROM public.referrals WHERE referrer_user = _u),
    'joined_workers', (SELECT count(*) FROM public.referrals f JOIN public.workers w ON w.user_id = f.referred_user WHERE f.referrer_user = _u),
    'referred_by', _r.code,
    'can_claim', _r.code IS NULL AND COALESCE(_age, interval '0') <= make_interval(days => public.setting_num('referral_claim_days', 30)::int));
END $$;

-- Anyone may ask whether a code is valid (to show "invite applied"); owner identity is never revealed.
CREATE OR REPLACE FUNCTION public.referral_check(_code text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('valid', c.code IS NOT NULL AND c.active AND (c.expires_at IS NULL OR c.expires_at > now())
      AND (c.max_uses IS NULL OR (SELECT count(*) FROM public.referrals r WHERE r.code = c.code) < c.max_uses), 'kind', c.kind, 'code', c.code)
  FROM (SELECT upper(btrim(_code)) AS q) x LEFT JOIN public.referral_codes c ON c.code = x.q $$;

CREATE OR REPLACE FUNCTION public.referral_claim(_code text, _landing text DEFAULT 'user') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); c record; _created timestamptz;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user = _u) THEN RETURN 'already'; END IF;
  SELECT * INTO c FROM public.referral_codes WHERE code = upper(btrim(COALESCE(_code, '')));
  IF NOT FOUND OR NOT c.active THEN RETURN 'invalid'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at <= now() THEN RETURN 'expired'; END IF;
  IF c.owner_user = _u THEN RETURN 'self'; END IF;
  IF c.max_uses IS NOT NULL AND (SELECT count(*) FROM public.referrals WHERE code = c.code) >= c.max_uses THEN RETURN 'full'; END IF;
  SELECT created_at INTO _created FROM auth.users WHERE id = _u;
  IF _created < now() - make_interval(days => public.setting_num('referral_claim_days', 30)::int) THEN RETURN 'too_late'; END IF;
  -- no two-way loop: someone you invited cannot become your referrer
  IF c.owner_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.referrals WHERE referred_user = c.owner_user AND referrer_user = _u) THEN RETURN 'self'; END IF;
  INSERT INTO public.referrals(referred_user, code, referrer_user, kind, landing)
  VALUES (_u, c.code, c.owner_user, c.kind, CASE WHEN _landing = 'worker' THEN 'worker' ELSE 'user' END)
  ON CONFLICT (referred_user) DO NOTHING;
  RETURN CASE WHEN FOUND THEN 'ok' ELSE 'already' END;
END $$;

-- ---------- admin ----------
CREATE OR REPLACE FUNCTION public.admin_referral_codes(_kind text DEFAULT 'all') RETURNS TABLE(code text, kind text, label text, owner_name text, active boolean, max_uses int,
  expires_at timestamptz, uses bigint, worker_uses bigint, last_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY SELECT c.code, c.kind, c.label, COALESCE(NULLIF(p.full_name, ''), NULLIF(btrim(p.first_name || ' ' || p.last_name), ''), p.email, p.phone_number),
    c.active, c.max_uses, c.expires_at, count(r.id), count(w.id), max(r.created_at), c.created_at
  FROM public.referral_codes c
  LEFT JOIN public.profiles p ON p.user_id = c.owner_user
  LEFT JOIN public.referrals r ON r.code = c.code
  LEFT JOIN public.workers w ON w.user_id = r.referred_user
  WHERE (_kind = 'all' OR c.kind = _kind) AND (c.kind = 'campaign' OR EXISTS (SELECT 1 FROM public.referrals r2 WHERE r2.code = c.code) OR _kind = 'personal')
  GROUP BY c.code, p.full_name, p.first_name, p.last_name, p.email, p.phone_number
  ORDER BY count(r.id) DESC, c.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_referrals(_code text DEFAULT NULL, _limit int DEFAULT 200) RETURNS TABLE(id bigint, code text, kind text, landing text,
  referred_name text, referred_is_worker boolean, worker_status text, referrer_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY SELECT r.id, r.code, r.kind, r.landing,
    COALESCE(NULLIF(a.full_name, ''), NULLIF(btrim(a.first_name || ' ' || a.last_name), ''), a.email, a.phone_number, 'User'),
    w.id IS NOT NULL, w.status,
    CASE WHEN r.kind = 'campaign' THEN NULL ELSE COALESCE(NULLIF(b.full_name, ''), NULLIF(btrim(b.first_name || ' ' || b.last_name), ''), b.email, b.phone_number, 'User') END,
    r.created_at
  FROM public.referrals r
  LEFT JOIN public.profiles a ON a.user_id = r.referred_user
  LEFT JOIN public.profiles b ON b.user_id = r.referrer_user
  LEFT JOIN public.workers w ON w.user_id = r.referred_user
  WHERE _code IS NULL OR r.code = upper(_code)
  ORDER BY r.created_at DESC LIMIT LEAST(GREATEST(_limit, 1), 1000);
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_campaign_code(_code text, _label text, _max_uses int DEFAULT NULL, _expires_at timestamptz DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c text := upper(btrim(COALESCE(_code, '')));
BEGIN
  PERFORM public.admin_guard();
  IF _c = '' THEN _c := 'C' || substr(public._referral_new_code(), 2); END IF;
  IF _c !~ '^[A-Z0-9][A-Z0-9-]{3,19}$' THEN RAISE EXCEPTION 'code: 4-20 letters, digits or -'; END IF;
  IF COALESCE(btrim(_label), '') = '' THEN RAISE EXCEPTION 'label required'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN RAISE EXCEPTION 'expiry must be in the future'; END IF;
  IF EXISTS (SELECT 1 FROM public.referral_codes WHERE code = _c) THEN RAISE EXCEPTION 'code already exists'; END IF;
  INSERT INTO public.referral_codes(code, kind, label, max_uses, expires_at, created_by) VALUES (_c, 'campaign', btrim(_label), _max_uses, _expires_at, auth.uid());
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'referral.campaign_create', NULL, _c,
    jsonb_build_object('label', _label, 'max_uses', _max_uses, 'expires_at', _expires_at));
  RETURN _c;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_referral_code_active(_code text, _active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  UPDATE public.referral_codes SET active = _active WHERE code = upper(_code);
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown code'; END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), CASE WHEN _active THEN 'referral.enable' ELSE 'referral.disable' END, NULL, upper(_code), NULL);
END $$;

-- ---------- professionals by district ----------
-- All 38 districts always come back (zero rows included), plus an "unassigned" row when someone has no district yet.
-- Status buckets: submitted = everyone past draft; pending includes needs_info. Profession buckets: doctor includes veterinary,
-- which is also shown on its own.
CREATE OR REPLACE FUNCTION public.admin_professionals_by_district(_profession text DEFAULT 'all', _status text DEFAULT 'all')
RETURNS TABLE(district_slug text, name_i18n jsonb, sort int, total bigint, submitted bigint, pending bigint, approved bigint, rejected bigint,
  doctor bigint, veterinary bigint, lawyer bigint, engineer bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  IF _profession NOT IN ('all','doctor','veterinary','lawyer','engineer') THEN RAISE EXCEPTION 'bad profession filter'; END IF;
  IF _status NOT IN ('all','submitted','pending','approved','rejected') THEN RAISE EXCEPTION 'bad status filter'; END IF;
  RETURN QUERY
  WITH w AS (
    SELECT x.district_slug AS d, x.status AS st, x.primary_node AS node,
      CASE WHEN x.primary_node LIKE 'professionals--doctor%' THEN 'doctor' WHEN x.primary_node LIKE 'professionals--lawyer%' THEN 'lawyer'
           WHEN x.primary_node LIKE 'professionals--engineer%' THEN 'engineer' END AS prof,
      x.primary_node LIKE 'professionals--doctor--veterinary%' AS vet
    FROM public.workers x WHERE x.primary_node LIKE 'professionals--%'
  ), f AS (
    SELECT w.*,
      (_profession = 'all' OR (_profession = 'veterinary' AND w.vet) OR (_profession <> 'veterinary' AND w.prof = _profession)) AS p_ok,
      (_status = 'all' OR (_status = 'submitted' AND w.st <> 'draft') OR (_status = 'pending' AND w.st IN ('pending','needs_info')) OR w.st = _status) AS s_ok
    FROM w
  ), districts AS (
    SELECT d.slug, d.name_i18n, d.sort FROM public.tn_districts d
    UNION ALL
    SELECT NULL, '{"en":"District not set","ta":"மாவட்டம் அமைக்கப்படவில்லை"}'::jsonb, 9999 WHERE EXISTS (SELECT 1 FROM w WHERE w.d IS NULL OR w.d NOT IN (SELECT slug FROM public.tn_districts))
  )
  SELECT ds.slug, ds.name_i18n, ds.sort,
    count(*) FILTER (WHERE f.p_ok AND f.s_ok),
    count(*) FILTER (WHERE f.p_ok AND f.st <> 'draft'),
    count(*) FILTER (WHERE f.p_ok AND f.st IN ('pending','needs_info')),
    count(*) FILTER (WHERE f.p_ok AND f.st = 'approved'),
    count(*) FILTER (WHERE f.p_ok AND f.st = 'rejected'),
    count(*) FILTER (WHERE f.s_ok AND f.prof = 'doctor'),
    count(*) FILTER (WHERE f.s_ok AND f.vet),
    count(*) FILTER (WHERE f.s_ok AND f.prof = 'lawyer'),
    count(*) FILTER (WHERE f.s_ok AND f.prof = 'engineer')
  FROM districts ds
  LEFT JOIN f ON (ds.slug IS NOT NULL AND f.d = ds.slug) OR (ds.slug IS NULL AND (f.d IS NULL OR f.d NOT IN (SELECT slug FROM public.tn_districts)))
  GROUP BY ds.slug, ds.name_i18n, ds.sort
  ORDER BY ds.sort, ds.name_i18n->>'en';
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['my_referral()','referral_claim(text,text)','admin_referral_codes(text)','admin_referrals(text,int)',
    'admin_create_campaign_code(text,text,int,timestamptz)','admin_set_referral_code_active(text,boolean)','admin_professionals_by_district(text,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.referral_check(text) FROM public;
GRANT EXECUTE ON FUNCTION public.referral_check(text) TO anon, authenticated;
