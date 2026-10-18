-- M8: automatic payouts in mock mode (no live RazorpayX).
-- Cooling is 3 days for a new or changed account, including the first account.
-- An admin can release that wait sooner. The weekly batch is Monday 10:00 Asia/Kolkata.
-- Bank and UPI use the same penny-drop and Aadhaar-name match. The platform bears the
-- transfer fee (payout_fee_bearer can flip later; v1 never deducts it). TDS is off
-- (tds_enabled=false); PAN is optional text and is not checked. A verified account is
-- paid by the batch — the worker does not tap Request. Manual request, admin pay-now,
-- and break-glass mark-paid stay for accounts that are not verified.

INSERT INTO public.app_settings(key, value) VALUES
  ('payouts_auto', 'false'),
  ('payouts_mock', 'true'),
  ('payout_schedule', '"weekly"'),
  ('payout_review_amount', '10000'),
  ('payout_cooling_days', '3'),
  ('payout_fee_bearer', '"platform"'),
  ('tds_enabled', 'false'),
  ('payout_account_pepper', to_jsonb(encode(gen_random_bytes(24), 'hex')))
ON CONFLICT (key) DO NOTHING;

-- ---------- legal name (server-written from a passing identity check) ----------
ALTER TABLE public.kyc_verification ADD COLUMN IF NOT EXISTS legal_name text;

CREATE OR REPLACE FUNCTION public.guard_kyc_legal_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.trusted()
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public.has_role(auth.uid(), 'admin')
     OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.legal_name := NULL; RETURN NEW; END IF;
  IF NEW.legal_name IS DISTINCT FROM OLD.legal_name THEN
    RAISE EXCEPTION 'legal name is server-written' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_kyc_legal_name ON public.kyc_verification;
CREATE TRIGGER guard_kyc_legal_name BEFORE INSERT OR UPDATE ON public.kyc_verification
  FOR EACH ROW EXECUTE FUNCTION public.guard_kyc_legal_name();

-- Copy the Aadhaar QR name onto the worker when the identity check passes.
CREATE OR REPLACE FUNCTION public.verification_write_check(_case uuid, _check text, _provider text, _status text, _score numeric, _evidence jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _name text;
BEGIN
  IF _status NOT IN ('pass','review','fail','error') THEN RAISE EXCEPTION 'bad check status'; END IF;
  INSERT INTO public.verification_checks(case_id, check_name, provider, status, score, evidence)
  VALUES (_case, _check, _provider, _status, _score, COALESCE(_evidence,'{}'::jsonb))
  ON CONFLICT (case_id, check_name) DO UPDATE SET provider = EXCLUDED.provider, status = EXCLUDED.status, score = EXCLUDED.score, evidence = EXCLUDED.evidence
  RETURNING id INTO _id;
  _name := btrim(COALESCE(_evidence->>'name', ''));
  IF _check = 'identity' AND _status = 'pass' AND _name <> '' THEN
    PERFORM set_config('meiyiyal.trusted', 'on', true);
    INSERT INTO public.kyc_verification(worker_id, legal_name, status)
    SELECT c.worker_id, _name, 'pending'::public.kyc_status FROM public.verification_cases c WHERE c.id = _case
    ON CONFLICT (worker_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, updated_at = now();
    PERFORM set_config('meiyiyal.trusted', 'off', true);
  END IF;
  RETURN _id;
END $$;

-- ---------- per-worker payout hold (admin only, same guard as flags) ----------
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS payout_hold boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_worker_moderation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.trusted() OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.flag_active := false; NEW.flag_good_needed := 0; NEW.flag_reason := NULL; NEW.flagged_at := NULL;
    NEW.blocked_until := NULL; NEW.block_reason := NULL; NEW.strikes_reset_at := '-infinity'; NEW.payout_hold := false;
    RETURN NEW;
  END IF;
  IF (NEW.flag_active, NEW.flag_good_needed, NEW.flag_reason, NEW.flagged_at, NEW.blocked_until, NEW.block_reason, NEW.strikes_reset_at, NEW.payout_hold)
     IS DISTINCT FROM (OLD.flag_active, OLD.flag_good_needed, OLD.flag_reason, OLD.flagged_at, OLD.blocked_until, OLD.block_reason, OLD.strikes_reset_at, OLD.payout_hold) THEN
    RAISE EXCEPTION 'moderation fields can only be changed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ---------- payout account (mask + hash only; the full number is not a column) ----------
CREATE TABLE public.worker_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('bank','upi')),
  account_mask text NOT NULL,
  account_last4 text,
  ifsc text,
  account_hash text NOT NULL,
  fund_account_id text,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','verified','review','rejected','failed')),
  registered_name text,
  failure_reason text,
  duplicate boolean NOT NULL DEFAULT false,
  mock_fail text,
  verified_at timestamptz,
  cooling_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX worker_payout_accounts_hash_idx ON public.worker_payout_accounts(account_hash);
ALTER TABLE public.worker_payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payout account" ON public.worker_payout_accounts FOR SELECT
  USING (auth.uid() = worker_user_id OR public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.worker_payout_accounts FROM anon, authenticated;

-- ---------- payout rows: more statuses, provider ids, reserved fee/tds ----------
ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_status_check
  CHECK (status IN ('requested','queued','review','processing','paid','failed','reversed','rejected'));
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_payout_id text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross numeric(12,2),
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS fee_bearer text,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.worker_payout_accounts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payout_provider_id_uidx ON public.payout_requests(provider_payout_id) WHERE provider_payout_id IS NOT NULL;
DROP INDEX IF EXISTS public.payout_one_open;
CREATE UNIQUE INDEX payout_one_open ON public.payout_requests(worker_user_id)
  WHERE status IN ('requested','queued','review','processing');

CREATE TABLE public.payout_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  type text NOT NULL,
  payout_id uuid REFERENCES public.payout_requests(id) ON DELETE SET NULL,
  outcome text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_events FROM anon, authenticated;

-- ---------- name fold (titles + case). The full Tamil matcher stays in services/verify. ----------
CREATE OR REPLACE FUNCTION public.payout_fold_name(_n text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(COALESCE(_n, '')), '\m(dr|adv|er|mr|mrs|ms|smt|shri)\M\.?', '', 'g'), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.payout_name_result(_legal text, _bank text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a text := public.payout_fold_name(_legal); b text := public.payout_fold_name(_bank);
  ta text[]; tb text[]; inter int;
BEGIN
  IF a = '' OR b = '' THEN RETURN 'review'; END IF;
  IF a = b THEN RETURN 'match'; END IF;
  ta := regexp_split_to_array(a, ' ');
  tb := regexp_split_to_array(b, ' ');
  IF ta <@ tb AND tb <@ ta THEN RETURN 'match'; END IF;
  SELECT count(*)::int INTO inter FROM unnest(ta) x WHERE x <> '' AND length(x) > 1 AND x = ANY(tb);
  IF inter = 0 THEN RETURN 'mismatch'; END IF;
  RETURN 'review';
END $$;
REVOKE ALL ON FUNCTION public.payout_fold_name(text), public.payout_name_result(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payout_next_at() RETURNS timestamptz LANGUAGE sql STABLE AS $$
  WITH ist AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata') AS local),
  cand AS (
    SELECT local, date_trunc('day', local) + ((8 - EXTRACT(ISODOW FROM local)::int) % 7) * interval '1 day' + interval '10 hours' AS slot
    FROM ist)
  SELECT (CASE WHEN slot <= local THEN slot + interval '7 days' ELSE slot END) AT TIME ZONE 'Asia/Kolkata' FROM cand
$$;
REVOKE ALL ON FUNCTION public.payout_next_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payout_next_at() TO authenticated;

CREATE OR REPLACE FUNCTION public.payouts_mock_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.setting('payouts_mock')#>>'{}', 'false') = 'true' $$;
CREATE OR REPLACE FUNCTION public.payouts_auto_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.setting('payouts_auto')#>>'{}', 'false') = 'true' $$;
REVOKE ALL ON FUNCTION public.payouts_mock_enabled(), public.payouts_auto_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payouts_mock_enabled(), public.payouts_auto_enabled() TO service_role;

-- Why the batch will not pay this worker right now. NULL means the account itself is eligible.
CREATE OR REPLACE FUNCTION public.payout_block_reason(_user uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _a public.worker_payout_accounts;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id = _user;
  IF NOT FOUND OR _w.status <> 'approved' THEN RETURN 'not_approved'; END IF;
  IF _w.flag_active THEN RETURN 'flagged'; END IF;
  IF _w.blocked_until IS NOT NULL AND _w.blocked_until > now() THEN RETURN 'blocked'; END IF;
  IF _w.payout_hold THEN RETURN 'payout_hold'; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE worker_user_id = _user AND status IN ('requested','queued','review','processing')) THEN
    RETURN 'in_flight';
  END IF;
  SELECT * INTO _a FROM public.worker_payout_accounts WHERE worker_user_id = _user;
  IF NOT FOUND OR _a.validation_status IN ('pending','failed') THEN RETURN 'account_unverified'; END IF;
  IF _a.validation_status = 'rejected' THEN RETURN 'account_rejected'; END IF;
  IF _a.validation_status = 'review' THEN RETURN 'account_review'; END IF;
  IF _a.cooling_until IS NOT NULL AND _a.cooling_until > now() THEN RETURN 'cooling'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.payout_block_reason(uuid) FROM PUBLIC, anon, authenticated;

-- Penny-drop (mock). Account numbers are hashed and dropped; they are not stored.
-- Suffix 0000 → bank name "Other Person" (mismatch when the Aadhaar name differs).
-- Suffix 0001 → invalid account. Suffix 0002 → account validates, the later payout fails.
CREATE OR REPLACE FUNCTION public.payout_account_submit(_kind text, _account text, _ifsc text, _otp text, _pan text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _u uuid := auth.uid(); _w public.workers; _legal text; _norm text; _ifsc_n text; _hash text; _mask text; _last4 text;
  _registered text; _fail text; _mock text; _name_r text; _status text; _reason text; _dup boolean := false;
  _cooling timestamptz; _row public.worker_payout_accounts; _pan_n text;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.payouts_mock_enabled() THEN RAISE EXCEPTION 'live payouts are not enabled'; END IF;
  SELECT * INTO _w FROM public.workers WHERE user_id = _u AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'workers only' USING ERRCODE = '42501'; END IF;
  IF _otp IS DISTINCT FROM (public.setting('kyc_stub_otp')#>>'{}') THEN RAISE EXCEPTION 'step-up code did not match'; END IF;
  IF (SELECT count(*) FROM public.admin_audit WHERE actor = _u AND action = 'payout.account' AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'too many account checks, try later';
  END IF;
  _kind := lower(btrim(COALESCE(_kind, '')));
  _norm := regexp_replace(COALESCE(_account, ''), '\s', '', 'g');
  _ifsc_n := upper(regexp_replace(COALESCE(_ifsc, ''), '\s', '', 'g'));
  IF _kind = 'bank' THEN
    IF _norm !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'invalid account number'; END IF;
    IF _ifsc_n !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'invalid IFSC'; END IF;
    _last4 := right(_norm, 4);
    _mask := '••••' || _last4;
  ELSIF _kind = 'upi' THEN
    IF _norm !~ '^[^@]{2,64}@[^@]{2,64}$' THEN RAISE EXCEPTION 'invalid UPI id'; END IF;
    _ifsc_n := NULL;
    _last4 := NULL;
    _mask := left(split_part(_norm, '@', 1), 2) || '••••@' || split_part(_norm, '@', 2);
  ELSE
    RAISE EXCEPTION 'account type must be bank or upi';
  END IF;
  _pan_n := upper(btrim(COALESCE(_pan, '')));
  IF _pan_n <> '' AND _pan_n !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'invalid PAN'; END IF;

  SELECT k.legal_name INTO _legal FROM public.kyc_verification k WHERE k.worker_id = _w.id;
  _hash := encode(extensions.digest((public.setting('payout_account_pepper')#>>'{}') || '|' || _kind || '|' || COALESCE(_ifsc_n, '') || '|' || lower(_norm), 'sha256'), 'hex');

  IF (_kind = 'bank' AND right(_norm, 4) = '0001') OR (_kind = 'upi' AND split_part(lower(_norm), '@', 1) LIKE '%0001') THEN
    _fail := 'invalid_account';
  ELSIF (_kind = 'bank' AND right(_norm, 4) = '0000') OR (_kind = 'upi' AND split_part(lower(_norm), '@', 1) LIKE '%0000') THEN
    _registered := 'Other Person';
  ELSE
    _registered := NULLIF(btrim(COALESCE(_legal, '')), '');
    IF (_kind = 'bank' AND right(_norm, 4) = '0002') OR (_kind = 'upi' AND split_part(lower(_norm), '@', 1) LIKE '%0002') THEN
      _mock := 'beneficiary';
    END IF;
  END IF;

  IF _fail = 'invalid_account' THEN
    _status := 'failed'; _reason := 'invalid_account';
  ELSE
    _name_r := public.payout_name_result(_legal, _registered);
    IF EXISTS (SELECT 1 FROM public.worker_payout_accounts o WHERE o.account_hash = _hash AND o.worker_user_id <> _u) THEN
      _dup := true;
    END IF;
    IF _name_r = 'mismatch' THEN
      _status := 'rejected'; _reason := 'name_mismatch';
    ELSIF _dup OR _name_r = 'review' THEN
      _status := 'review';
      _reason := CASE WHEN _dup THEN 'duplicate' WHEN _legal IS NULL OR btrim(_legal) = '' THEN 'no_legal_name' ELSE 'name_review' END;
    ELSE
      _status := 'verified';
      _cooling := now() + make_interval(days => public.setting_num('payout_cooling_days', 3)::int);
    END IF;
  END IF;

  INSERT INTO public.worker_payout_accounts(worker_user_id, worker_id, kind, account_mask, account_last4, ifsc, account_hash,
    fund_account_id, validation_status, registered_name, failure_reason, duplicate, mock_fail, verified_at, cooling_until, updated_at)
  VALUES (_u, _w.id, _kind, _mask, _last4, NULLIF(_ifsc_n, ''), _hash,
    CASE WHEN _status IN ('verified','review') THEN 'fa_mock_' || left(_hash, 12) END,
    _status, _registered, _reason, _dup, _mock, CASE WHEN _status = 'verified' THEN now() END, _cooling, now())
  ON CONFLICT (worker_user_id) DO UPDATE SET
    worker_id = EXCLUDED.worker_id, kind = EXCLUDED.kind, account_mask = EXCLUDED.account_mask, account_last4 = EXCLUDED.account_last4,
    ifsc = EXCLUDED.ifsc, account_hash = EXCLUDED.account_hash, fund_account_id = EXCLUDED.fund_account_id,
    validation_status = EXCLUDED.validation_status, registered_name = EXCLUDED.registered_name, failure_reason = EXCLUDED.failure_reason,
    duplicate = EXCLUDED.duplicate, mock_fail = EXCLUDED.mock_fail, verified_at = EXCLUDED.verified_at, cooling_until = EXCLUDED.cooling_until, updated_at = now()
  RETURNING * INTO _row;

  IF _pan_n <> '' THEN
    PERFORM set_config('meiyiyal.trusted', 'on', true);
    INSERT INTO public.kyc_verification(worker_id, pan_number, status) VALUES (_w.id, _pan_n, 'pending')
    ON CONFLICT (worker_id) DO UPDATE SET pan_number = EXCLUDED.pan_number, updated_at = now();
    PERFORM set_config('meiyiyal.trusted', 'off', true);
  END IF;

  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (_u, 'payout.account', _row.id, _status,
    jsonb_build_object('kind', _kind, 'mask', _mask, 'status', _status, 'reason', _reason, 'duplicate', _dup));
  RETURN jsonb_build_object('status', _row.validation_status, 'mask', _row.account_mask, 'kind', _row.kind, 'ifsc', _row.ifsc,
    'cooling_until', _row.cooling_until, 'registered_name', _row.registered_name, 'reason', _row.failure_reason, 'duplicate', _row.duplicate);
END $$;
GRANT EXECUTE ON FUNCTION public.payout_account_submit(text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.payout_account_submit(text, text, text, text, text) FROM anon;

-- ---------- earnings summary (account, next Monday, why it is waiting) ----------
CREATE OR REPLACE FUNCTION public.my_earnings() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _wk public.workers; _a public.worker_payout_accounts; _block text; _avail numeric; _hold numeric; _reason text; _min numeric;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _wk FROM public.workers WHERE user_id = _u;
  SELECT * INTO _a FROM public.worker_payout_accounts WHERE worker_user_id = _u;
  _avail := (SELECT COALESCE(sum(net), 0) FROM public.worker_earnings WHERE worker_user_id = _u AND payout_id IS NULL AND available_at <= now());
  _hold := (SELECT COALESCE(sum(net), 0) FROM public.worker_earnings WHERE worker_user_id = _u AND payout_id IS NULL AND available_at > now());
  _min := public.setting_num('payout_min', 200);
  _block := public.payout_block_reason(_u);
  IF _wk.id IS NULL THEN _reason := NULL;
  ELSIF _block IS NOT NULL THEN _reason := _block;
  ELSIF _avail < _min AND _hold > 0 THEN _reason := 'on_hold';
  ELSIF _avail < _min THEN _reason := 'below_min';
  ELSIF NOT public.payouts_auto_enabled() THEN _reason := 'paused';
  ELSE _reason := 'ready';
  END IF;
  RETURN jsonb_build_object(
    'is_worker', _wk.id IS NOT NULL,
    'commission_pct', CASE WHEN _wk.id IS NOT NULL THEN public.commission_for(_wk.id, _wk.primary_node) END,
    'lifetime_gross', (SELECT COALESCE(sum(gross), 0) FROM public.worker_earnings WHERE worker_user_id = _u),
    'lifetime_net', (SELECT COALESCE(sum(net), 0) FROM public.worker_earnings WHERE worker_user_id = _u),
    'on_hold', _hold,
    'available', _avail,
    'requested', (SELECT COALESCE(sum(amount), 0) FROM public.payout_requests WHERE worker_user_id = _u AND status IN ('requested','queued','review','processing')),
    'paid', (SELECT COALESCE(sum(amount), 0) FROM public.payout_requests WHERE worker_user_id = _u AND status = 'paid'),
    'payout_min', _min, 'hold_hours', public.setting_num('payout_hold_hours', 72),
    'payouts_auto', public.payouts_auto_enabled(),
    'next_batch', public.payout_next_at(),
    'wait_reason', _reason,
    'cooling_days', public.setting_num('payout_cooling_days', 3),
    'account', CASE WHEN _a.id IS NULL THEN NULL ELSE jsonb_build_object(
      'kind', _a.kind, 'mask', _a.account_mask, 'ifsc', _a.ifsc, 'status', _a.validation_status,
      'registered_name', _a.registered_name, 'reason', _a.failure_reason, 'duplicate', _a.duplicate,
      'cooling_until', _a.cooling_until, 'verified_at', _a.verified_at) END,
    'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', wk, 'sessions', n, 'gross', g, 'commission', c, 'net', nt) ORDER BY wk DESC) FROM (
        SELECT date_trunc('week', created_at AT TIME ZONE 'Asia/Kolkata')::date wk, count(DISTINCT session_id) n, sum(gross) g, sum(commission) c, sum(net) nt
        FROM public.worker_earnings WHERE worker_user_id = _u GROUP BY 1 ORDER BY 1 DESC LIMIT 26) x), '[]'::jsonb),
    'payouts', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'decided_by' ORDER BY p.requested_at DESC) FROM (
        SELECT * FROM public.payout_requests WHERE worker_user_id = _u ORDER BY requested_at DESC LIMIT 50) p), '[]'::jsonb));
END $$;

-- Manual request stays for workers with no verified account (break-glass / the existing payments test).
CREATE OR REPLACE FUNCTION public.payout_request() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _amt numeric; _id uuid; _a public.worker_payout_accounts;
BEGIN
  IF _u IS NULL OR NOT EXISTS (SELECT 1 FROM public.workers WHERE user_id = _u AND status = 'approved') THEN RAISE EXCEPTION 'workers only' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE user_id = _u AND (flag_active OR payout_hold OR (blocked_until IS NOT NULL AND blocked_until > now()))) THEN
    RAISE EXCEPTION 'payouts are paused for this account';
  END IF;
  SELECT * INTO _a FROM public.worker_payout_accounts WHERE worker_user_id = _u;
  IF FOUND AND _a.validation_status = 'verified' THEN RAISE EXCEPTION 'payouts are sent automatically'; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE worker_user_id = _u AND status IN ('requested','queued','review','processing')) THEN
    RAISE EXCEPTION 'a payout is already pending';
  END IF;
  PERFORM 1 FROM public.worker_earnings WHERE worker_user_id = _u AND payout_id IS NULL AND available_at <= now() FOR UPDATE;
  SELECT COALESCE(sum(net), 0) INTO _amt FROM public.worker_earnings WHERE worker_user_id = _u AND payout_id IS NULL AND available_at <= now();
  IF _amt < public.setting_num('payout_min', 200) THEN RAISE EXCEPTION 'minimum payout is %', public.setting_num('payout_min', 200); END IF;
  INSERT INTO public.payout_requests(worker_user_id, amount, method, gross, fee, tds, fee_bearer)
  VALUES (_u, _amt, 'manual', _amt, 0, 0, public.setting('payout_fee_bearer')#>>'{}') RETURNING id INTO _id;
  UPDATE public.worker_earnings SET payout_id = _id WHERE worker_user_id = _u AND payout_id IS NULL AND available_at <= now();
  RETURN jsonb_build_object('id', _id, 'amount', _amt);
END $$;

-- ---------- batch ----------
CREATE OR REPLACE FUNCTION public.payout_unlink(_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.worker_earnings SET payout_id = NULL WHERE payout_id = _id $$;
REVOKE ALL ON FUNCTION public.payout_unlink(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payout_run(_force boolean DEFAULT false, _only uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _w public.workers; _a public.worker_payout_accounts; _amt numeric; _id uuid; _st text; _why text;
  _min numeric := public.setting_num('payout_min', 200); _review numeric := public.setting_num('payout_review_amount', 10000);
  _created int := 0; _skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.payouts_mock_enabled() THEN RAISE EXCEPTION 'live payouts are not enabled'; END IF;
  IF NOT _force AND NOT public.payouts_auto_enabled() THEN
    RETURN jsonb_build_object('ok', true, 'paused', true, 'created', 0);
  END IF;
  FOR _w IN SELECT * FROM public.workers WHERE status = 'approved' AND (_only IS NULL OR user_id = _only) ORDER BY user_id LOOP
    _why := public.payout_block_reason(_w.user_id);
    IF _why IS NOT NULL THEN
      _skipped := _skipped || jsonb_build_array(jsonb_build_object('user', _w.user_id, 'reason', _why));
      CONTINUE;
    END IF;
    PERFORM 1 FROM public.worker_earnings WHERE worker_user_id = _w.user_id AND payout_id IS NULL AND available_at <= now() FOR UPDATE;
    SELECT COALESCE(sum(net), 0) INTO _amt FROM public.worker_earnings WHERE worker_user_id = _w.user_id AND payout_id IS NULL AND available_at <= now();
    IF _amt < _min THEN
      _skipped := _skipped || jsonb_build_array(jsonb_build_object('user', _w.user_id, 'reason', 'below_min'));
      CONTINUE;
    END IF;
    SELECT * INTO _a FROM public.worker_payout_accounts WHERE worker_user_id = _w.user_id;
    IF COALESCE(public.setting('tds_enabled')#>>'{}', 'false') = 'true' OR _amt >= _review OR _a.duplicate THEN
      _st := 'review';
      _why := CASE WHEN COALESCE(public.setting('tds_enabled')#>>'{}', 'false') = 'true' THEN 'tds' WHEN _a.duplicate THEN 'duplicate' ELSE 'amount' END;
    ELSE
      _st := 'queued'; _why := NULL;
    END IF;
    INSERT INTO public.payout_requests(worker_user_id, amount, status, method, provider, gross, fee, tds, fee_bearer, review_reason, account_id)
    VALUES (_w.user_id, _amt, _st, 'auto', 'mock', _amt, 0, 0, public.setting('payout_fee_bearer')#>>'{}', _why, _a.id)
    RETURNING id INTO _id;
    UPDATE public.worker_earnings SET payout_id = _id WHERE worker_user_id = _w.user_id AND payout_id IS NULL AND available_at <= now();
    _created := _created + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'paused', false, 'created', _created, 'skipped', _skipped);
END $$;

CREATE OR REPLACE FUNCTION public.payout_dispatch_mock(_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests; _a public.worker_payout_accounts; _n int := 0; _failed int := 0;
BEGIN
  IF NOT public.payouts_mock_enabled() THEN RAISE EXCEPTION 'live payouts are not enabled'; END IF;
  FOR _p IN SELECT * FROM public.payout_requests WHERE status = 'queued' AND (_id IS NULL OR id = _id) AND (provider IS NULL OR provider = 'mock') ORDER BY requested_at FOR UPDATE LOOP
    SELECT * INTO _a FROM public.worker_payout_accounts WHERE id = _p.account_id;
    IF _a.mock_fail = 'beneficiary' THEN
      UPDATE public.payout_requests SET status = 'failed', failure_reason = 'beneficiary', attempt_count = attempt_count + 1, decided_at = now(), provider = 'mock' WHERE id = _p.id;
      PERFORM public.payout_unlink(_p.id);
      UPDATE public.worker_payout_accounts SET validation_status = 'failed', failure_reason = 'beneficiary', updated_at = now() WHERE id = _a.id;
      _failed := _failed + 1;
    ELSE
      UPDATE public.payout_requests SET status = 'processing', provider = 'mock',
        provider_payout_id = COALESCE(provider_payout_id, 'pout_mock_' || replace(id::text, '-', ''))
      WHERE id = _p.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('processing', _n, 'failed', _failed);
END $$;

CREATE OR REPLACE FUNCTION public.payout_apply_event(_event_id text, _type text, _provider_payout_id text, _payout_id uuid, _utr text, _reason text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests; _outcome text := 'ignored';
BEGIN
  IF COALESCE(btrim(_event_id), '') = '' THEN RAISE EXCEPTION 'event id required'; END IF;
  BEGIN
    INSERT INTO public.payout_events(event_id, provider, type, payout_id, payload)
    VALUES (_event_id, 'mock', COALESCE(_type, 'unknown'), _payout_id, _payload);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END;
  SELECT * INTO _p FROM public.payout_requests
  WHERE (_provider_payout_id IS NOT NULL AND provider_payout_id = _provider_payout_id) OR (_payout_id IS NOT NULL AND id = _payout_id)
  ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    _outcome := 'unknown';
  ELSIF _type IN ('payout.processed', 'payout.processed.manual') THEN
    IF _p.status = 'paid' THEN _outcome := 'already_paid';
    ELSIF _p.status NOT IN ('processing', 'queued') THEN _outcome := 'ignored';
    ELSE
      UPDATE public.payout_requests SET status = 'paid', reference = COALESCE(NULLIF(btrim(_utr), ''), reference, 'UTR-' || left(id::text, 8)),
        failure_reason = NULL, decided_at = now() WHERE id = _p.id;
      _outcome := 'paid';
    END IF;
  ELSIF _type = 'payout.failed' THEN
    IF _p.status IN ('paid', 'reversed', 'rejected', 'failed') THEN _outcome := 'ignored';
    ELSIF COALESCE(_reason, '') IN ('beneficiary', 'invalid_account') OR _p.attempt_count + 1 >= 3 THEN
      UPDATE public.payout_requests SET status = 'failed', failure_reason = COALESCE(NULLIF(btrim(_reason), ''), 'failed'),
        attempt_count = attempt_count + 1, decided_at = now() WHERE id = _p.id;
      PERFORM public.payout_unlink(_p.id);
      IF COALESCE(_reason, '') = 'beneficiary' THEN
        UPDATE public.worker_payout_accounts SET validation_status = 'failed', failure_reason = 'beneficiary', updated_at = now() WHERE worker_user_id = _p.worker_user_id;
      END IF;
      _outcome := 'failed';
    ELSE
      UPDATE public.payout_requests SET status = 'queued', failure_reason = COALESCE(NULLIF(btrim(_reason), ''), 'retry'),
        attempt_count = attempt_count + 1 WHERE id = _p.id;
      _outcome := 'retry';
    END IF;
  ELSIF _type = 'payout.reversed' THEN
    IF _p.status = 'reversed' THEN _outcome := 'already_reversed';
    ELSIF _p.status <> 'paid' THEN _outcome := 'ignored';
    ELSE
      UPDATE public.payout_requests SET status = 'reversed', failure_reason = COALESCE(NULLIF(btrim(_reason), ''), 'reversed'), decided_at = now() WHERE id = _p.id;
      PERFORM public.payout_unlink(_p.id);
      _outcome := 'reversed';
    END IF;
  END IF;
  UPDATE public.payout_events SET outcome = _outcome, payout_id = COALESCE(_p.id, payout_id) WHERE event_id = _event_id;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'outcome', _outcome);
END $$;

REVOKE ALL ON FUNCTION public.payout_run(boolean, uuid), public.payout_dispatch_mock(uuid),
  public.payout_apply_event(text, text, text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_run(boolean, uuid), public.payout_dispatch_mock(uuid),
  public.payout_apply_event(text, text, text, uuid, text, text, jsonb) TO service_role;

-- ---------- admin ----------
CREATE OR REPLACE FUNCTION public.admin_payout_pause(_paused boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.app_settings(key, value) VALUES ('payouts_auto', to_jsonb(NOT _paused))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.pause', NULL, CASE WHEN _paused THEN 'paused' ELSE 'resumed' END, jsonb_build_object('paused', _paused));
  RETURN _paused;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_hold(_user uuid, _hold boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('meiyiyal.trusted', 'on', true);
  UPDATE public.workers SET payout_hold = _hold WHERE user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'worker not found'; END IF;
  PERFORM set_config('meiyiyal.trusted', 'off', true);
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.hold', _user, CASE WHEN _hold THEN 'hold' ELSE 'release' END, jsonb_build_object('hold', _hold));
  RETURN _hold;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_release_cooling(_user uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _until timestamptz := now();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  UPDATE public.worker_payout_accounts SET cooling_until = _until, updated_at = now()
  WHERE worker_user_id = _user AND validation_status = 'verified' RETURNING cooling_until INTO _until;
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified account'; END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.cooling', _user, 'released', '{}'::jsonb);
  RETURN _until;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_approve(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests; _why text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _p FROM public.payout_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _p.status <> 'review' THEN RAISE EXCEPTION 'payout is not in review'; END IF;
  _why := public.payout_block_reason(_p.worker_user_id);
  IF _why IS NOT NULL AND _why <> 'in_flight' THEN RAISE EXCEPTION 'cannot send: %', _why; END IF;
  UPDATE public.payout_requests SET status = 'queued', review_reason = NULL WHERE id = _id;
  PERFORM public.payout_dispatch_mock(_id);
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.approve', _id, 'sent', jsonb_build_object('amount', _p.amount));
  RETURN (SELECT status FROM public.payout_requests WHERE id = _id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_run() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb; _d jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  _r := public.payout_run(false, NULL);
  _d := public.payout_dispatch_mock(NULL);
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.run', NULL, 'batch', _r || jsonb_build_object('dispatch', _d));
  RETURN _r || jsonb_build_object('dispatch', _d);
END $$;

DROP FUNCTION IF EXISTS public.admin_payouts(text);
CREATE FUNCTION public.admin_payouts(_status text DEFAULT NULL) RETURNS TABLE(
  id uuid, worker_user_id uuid, worker_name text, amount numeric, status text, reference text, admin_note text,
  requested_at timestamptz, decided_at timestamptz, items int, review_reason text, failure_reason text,
  provider text, attempt_count int, account_mask text, account_status text, payout_hold boolean, flag_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.id, p.worker_user_id, COALESCE(w.display_name, pr.full_name, 'Worker'), p.amount, p.status, p.reference, p.admin_note,
    p.requested_at, p.decided_at, (SELECT count(*)::int FROM public.worker_earnings e WHERE e.payout_id = p.id),
    p.review_reason, p.failure_reason, p.provider, p.attempt_count, a.account_mask, a.validation_status, COALESCE(w.payout_hold, false), COALESCE(w.flag_active, false)
  FROM public.payout_requests p
  LEFT JOIN public.workers w ON w.user_id = p.worker_user_id
  LEFT JOIN public.profiles pr ON pr.user_id = p.worker_user_id
  LEFT JOIN public.worker_payout_accounts a ON a.id = p.account_id
  WHERE _status IS NULL OR p.status = _status
  ORDER BY (p.status IN ('review','requested','queued','processing')) DESC, p.requested_at DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_accounts() RETURNS TABLE(
  worker_user_id uuid, worker_name text, kind text, account_mask text, ifsc text, status text, registered_name text,
  failure_reason text, duplicate boolean, cooling_until timestamptz, payout_hold boolean, flag_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.worker_user_id, COALESCE(w.display_name, 'Worker'), a.kind, a.account_mask, a.ifsc, a.validation_status,
    a.registered_name, a.failure_reason, a.duplicate, a.cooling_until, COALESCE(w.payout_hold, false), COALESCE(w.flag_active, false)
  FROM public.worker_payout_accounts a LEFT JOIN public.workers w ON w.user_id = a.worker_user_id
  ORDER BY (a.validation_status = 'review') DESC, (a.validation_status IN ('rejected','failed')) DESC, a.updated_at DESC LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_decide(_id uuid, _paid boolean, _reference text, _note text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _p FROM public.payout_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _p.status NOT IN ('requested','queued','review','processing') THEN RAISE EXCEPTION 'payout is not pending'; END IF;
  IF _paid AND COALESCE(btrim(_reference), '') = '' THEN RAISE EXCEPTION 'payment reference required'; END IF;
  IF NOT _paid AND COALESCE(btrim(_note), '') = '' THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.payout_requests SET status = CASE WHEN _paid THEN 'paid' ELSE 'rejected' END, reference = NULLIF(btrim(_reference), ''),
    admin_note = NULLIF(btrim(_note), ''), decided_at = now(), decided_by = auth.uid() WHERE id = _id;
  IF NOT _paid THEN PERFORM public.payout_unlink(_id); END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), CASE WHEN _paid THEN 'payout.paid' ELSE 'payout.rejected' END, _id,
    COALESCE(_note, _reference), jsonb_build_object('amount', _p.amount, 'worker', _p.worker_user_id, 'reference', _reference));
  RETURN CASE WHEN _paid THEN 'paid' ELSE 'rejected' END;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_payout_pause(boolean), public.admin_payout_hold(uuid, boolean), public.admin_payout_release_cooling(uuid),
  public.admin_payout_approve(uuid), public.admin_payout_run(), public.admin_payouts(text), public.admin_payout_accounts(),
  public.admin_payout_decide(uuid, boolean, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_payout_pause(boolean), public.admin_payout_hold(uuid, boolean), public.admin_payout_release_cooling(uuid),
  public.admin_payout_approve(uuid), public.admin_payout_run(), public.admin_payouts(text), public.admin_payout_accounts(),
  public.admin_payout_decide(uuid, boolean, text, text) FROM anon;
