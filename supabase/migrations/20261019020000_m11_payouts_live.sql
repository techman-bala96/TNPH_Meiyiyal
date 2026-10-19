-- M11 · live payouts (RazorpayX) behind the same switch as mock.
-- payouts_mock = true  → everything stays in SQL exactly as M8 (local default, tests).
-- payouts_mock = false → payout_run creates provider='razorpayx' rows; the payout-run Edge Function
--   claims them (payout_claim_live), calls RazorpayX, and records the result. Webhooks finish them.
-- Penny-drop in live mode runs in the payout-fund-account Edge Function; SQL validates input,
-- hashes the account (number never stored) and applies the same name-match / cooling rules.
-- Step-up for a bank change: SMS code (stepup_issue / stepup_verify). Mock keeps kyc_stub_otp.
-- Weekly batch: pg_cron Monday 04:30 UTC = 10:00 IST → payout_weekly().

INSERT INTO public.app_settings(key, value) VALUES
  ('payout_run_url', '""'),
  ('payout_hook_secret', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex'))),
  ('payout_max_attempts', '3')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.worker_payout_accounts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS contact_id text,
  ADD COLUMN IF NOT EXISTS validation_ref text;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.payouts_provider() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.payouts_mock_enabled() THEN 'mock' ELSE 'razorpayx' END $$;

-- ---------- step-up codes (SMS) ----------
CREATE TABLE IF NOT EXISTS public.stepup_codes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose ~ '^[a-z_]{3,40}$'),
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  sends int NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose)
);
ALTER TABLE public.stepup_codes ENABLE ROW LEVEL SECURITY; -- server only

CREATE OR REPLACE FUNCTION public.stepup_issue(_user uuid, _purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text := lpad((floor(random() * 1000000))::int::text, 6, '0'); _s public.stepup_codes; _phone text;
BEGIN
  SELECT phone_number INTO _phone FROM public.profiles WHERE user_id = _user;
  IF COALESCE(_phone, '') = '' THEN SELECT phone INTO _phone FROM auth.users WHERE id = _user; END IF;
  IF COALESCE(_phone, '') = '' THEN RAISE EXCEPTION 'add a mobile number first'; END IF;
  SELECT * INTO _s FROM public.stepup_codes WHERE user_id = _user AND purpose = _purpose;
  IF FOUND AND _s.sends >= 5 AND _s.created_at > now() - interval '1 hour' THEN RAISE EXCEPTION 'too many codes, try later'; END IF;
  INSERT INTO public.stepup_codes(user_id, purpose, code_hash, expires_at)
  VALUES (_user, _purpose, encode(extensions.digest(_user::text || ':' || _code, 'sha256'), 'hex'), now() + interval '10 minutes')
  ON CONFLICT (user_id, purpose) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at,
    sends = CASE WHEN stepup_codes.created_at > now() - interval '1 hour' THEN stepup_codes.sends + 1 ELSE 1 END,
    created_at = CASE WHEN stepup_codes.created_at > now() - interval '1 hour' THEN stepup_codes.created_at ELSE now() END;
  RETURN jsonb_build_object('code', _code, 'phone', _phone, 'masked', '•••••' || right(regexp_replace(_phone, '\D', '', 'g'), 4));
END $$;

CREATE OR REPLACE FUNCTION public.stepup_verify(_user uuid, _purpose text, _code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.stepup_codes;
BEGIN
  SELECT * INTO _s FROM public.stepup_codes WHERE user_id = _user AND purpose = _purpose FOR UPDATE;
  IF NOT FOUND OR _s.expires_at < now() OR _s.attempts >= 5 THEN RETURN false; END IF;
  IF _s.code_hash <> encode(extensions.digest(_user::text || ':' || COALESCE(_code, ''), 'sha256'), 'hex') THEN
    UPDATE public.stepup_codes SET attempts = attempts + 1 WHERE user_id = _user AND purpose = _purpose;
    RETURN false;
  END IF;
  DELETE FROM public.stepup_codes WHERE user_id = _user AND purpose = _purpose;
  RETURN true;
END $$;

-- ---------- account apply (shared by mock and live) ----------
CREATE OR REPLACE FUNCTION public._payout_account_apply(_u uuid, _kind text, _account text, _ifsc text, _pan text,
  _registered text, _fail text, _mock text, _fund_account_id text, _provider text, _pending boolean DEFAULT false,
  _contact_id text DEFAULT NULL, _validation_ref text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _legal text; _norm text; _ifsc_n text; _hash text; _mask text; _last4 text; _name_r text; _status text;
  _reason text; _dup boolean := false; _cooling timestamptz; _row public.worker_payout_accounts; _pan_n text;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id = _u AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'workers only' USING ERRCODE = '42501'; END IF;
  _kind := lower(btrim(COALESCE(_kind, '')));
  _norm := regexp_replace(COALESCE(_account, ''), '\s', '', 'g');
  _ifsc_n := upper(regexp_replace(COALESCE(_ifsc, ''), '\s', '', 'g'));
  IF _kind = 'bank' THEN
    IF _norm !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'invalid account number'; END IF;
    IF _ifsc_n !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'invalid IFSC'; END IF;
    _last4 := right(_norm, 4); _mask := '••••' || _last4;
  ELSIF _kind = 'upi' THEN
    IF _norm !~ '^[^@]{2,64}@[^@]{2,64}$' THEN RAISE EXCEPTION 'invalid UPI id'; END IF;
    _ifsc_n := NULL; _last4 := NULL;
    _mask := left(split_part(_norm, '@', 1), 2) || '••••@' || split_part(_norm, '@', 2);
  ELSE
    RAISE EXCEPTION 'account type must be bank or upi';
  END IF;
  _pan_n := upper(btrim(COALESCE(_pan, '')));
  IF _pan_n <> '' AND _pan_n !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'invalid PAN'; END IF;
  SELECT k.legal_name INTO _legal FROM public.kyc_verification k WHERE k.worker_id = _w.id;
  _hash := encode(extensions.digest((public.setting('payout_account_pepper')#>>'{}') || '|' || _kind || '|' || COALESCE(_ifsc_n, '') || '|' || lower(_norm), 'sha256'), 'hex');
  IF _pending THEN
    _status := 'pending'; _reason := 'validating';
  ELSIF _fail IS NOT NULL THEN
    _status := 'failed'; _reason := _fail;
  ELSE
    _name_r := public.payout_name_result(_legal, _registered);
    _dup := EXISTS (SELECT 1 FROM public.worker_payout_accounts o WHERE o.account_hash = _hash AND o.worker_user_id <> _u);
    IF _name_r = 'mismatch' THEN _status := 'rejected'; _reason := 'name_mismatch';
    ELSIF _dup OR _name_r = 'review' THEN
      _status := 'review';
      _reason := CASE WHEN _dup THEN 'duplicate' WHEN _legal IS NULL OR btrim(_legal) = '' THEN 'no_legal_name' ELSE 'name_review' END;
    ELSE
      _status := 'verified'; _cooling := now() + make_interval(days => public.setting_num('payout_cooling_days', 3)::int);
    END IF;
  END IF;
  INSERT INTO public.worker_payout_accounts(worker_user_id, worker_id, kind, account_mask, account_last4, ifsc, account_hash,
    fund_account_id, validation_status, registered_name, failure_reason, duplicate, mock_fail, verified_at, cooling_until, updated_at,
    provider, contact_id, validation_ref)
  VALUES (_u, _w.id, _kind, _mask, _last4, NULLIF(_ifsc_n, ''), _hash,
    CASE WHEN _status IN ('verified','review','pending') THEN _fund_account_id END,
    _status, _registered, _reason, _dup, _mock, CASE WHEN _status = 'verified' THEN now() END, _cooling, now(), _provider, _contact_id, _validation_ref)
  ON CONFLICT (worker_user_id) DO UPDATE SET
    worker_id = EXCLUDED.worker_id, kind = EXCLUDED.kind, account_mask = EXCLUDED.account_mask, account_last4 = EXCLUDED.account_last4,
    ifsc = EXCLUDED.ifsc, account_hash = EXCLUDED.account_hash, fund_account_id = EXCLUDED.fund_account_id,
    validation_status = EXCLUDED.validation_status, registered_name = EXCLUDED.registered_name, failure_reason = EXCLUDED.failure_reason,
    duplicate = EXCLUDED.duplicate, mock_fail = EXCLUDED.mock_fail, verified_at = EXCLUDED.verified_at, cooling_until = EXCLUDED.cooling_until,
    provider = EXCLUDED.provider, contact_id = COALESCE(EXCLUDED.contact_id, worker_payout_accounts.contact_id), validation_ref = EXCLUDED.validation_ref,
    updated_at = now()
  RETURNING * INTO _row;
  IF _pan_n <> '' THEN
    PERFORM set_config('meiyiyal.trusted', 'on', true);
    INSERT INTO public.kyc_verification(worker_id, pan_number, status) VALUES (_w.id, _pan_n, 'pending')
    ON CONFLICT (worker_id) DO UPDATE SET pan_number = EXCLUDED.pan_number, updated_at = now();
    PERFORM set_config('meiyiyal.trusted', 'off', true);
  END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (_u, 'payout.account', _row.id, _status,
    jsonb_build_object('kind', _kind, 'mask', _mask, 'status', _status, 'reason', _reason, 'duplicate', _dup, 'provider', _provider));
  RETURN jsonb_build_object('status', _row.validation_status, 'mask', _row.account_mask, 'kind', _row.kind, 'ifsc', _row.ifsc,
    'cooling_until', _row.cooling_until, 'registered_name', _row.registered_name, 'reason', _row.failure_reason, 'duplicate', _row.duplicate);
END $$;

CREATE OR REPLACE FUNCTION public._payout_account_ratelimit(_u uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.admin_audit WHERE actor = _u AND action = 'payout.account' AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'too many account checks, try later';
  END IF;
END $$;

-- Mock penny-drop (unchanged behaviour). Suffix 0000 → "Other Person", 0001 → invalid, 0002 → later payout fails.
CREATE OR REPLACE FUNCTION public.payout_account_submit(_kind text, _account text, _ifsc text, _otp text, _pan text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _w public.workers; _norm text; _k text; _legal text; _registered text; _fail text; _mock text; _hash text;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.payouts_mock_enabled() THEN RAISE EXCEPTION 'use the payout-fund-account function'; END IF;
  SELECT * INTO _w FROM public.workers WHERE user_id = _u AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'workers only' USING ERRCODE = '42501'; END IF;
  IF _otp IS DISTINCT FROM (public.setting('kyc_stub_otp')#>>'{}') THEN RAISE EXCEPTION 'step-up code did not match'; END IF;
  PERFORM public._payout_account_ratelimit(_u);
  _k := lower(btrim(COALESCE(_kind, '')));
  _norm := regexp_replace(COALESCE(_account, ''), '\s', '', 'g');
  SELECT k.legal_name INTO _legal FROM public.kyc_verification k WHERE k.worker_id = _w.id;
  IF (_k = 'bank' AND right(_norm, 4) = '0001') OR (_k = 'upi' AND split_part(lower(_norm), '@', 1) LIKE '%0001') THEN
    _fail := 'invalid_account';
  ELSIF (_k = 'bank' AND right(_norm, 4) = '0000') OR (_k = 'upi' AND split_part(lower(_norm), '@', 1) LIKE '%0000') THEN
    _registered := 'Other Person';
  ELSE
    _registered := NULLIF(btrim(COALESCE(_legal, '')), '');
    IF (_k = 'bank' AND right(_norm, 4) = '0002') OR (_k = 'upi' AND split_part(lower(_norm), '@', 1) LIKE '%0002') THEN _mock := 'beneficiary'; END IF;
  END IF;
  _hash := encode(extensions.digest((public.setting('payout_account_pepper')#>>'{}') || '|' || _k || '|' || upper(regexp_replace(COALESCE(_ifsc, ''), '\s', '', 'g')) || '|' || lower(_norm), 'sha256'), 'hex');
  RETURN public._payout_account_apply(_u, _kind, _account, CASE WHEN _k = 'upi' THEN NULL ELSE _ifsc END, _pan, _registered, _fail, _mock,
    'fa_mock_' || left(_hash, 12), 'mock');
END $$;
GRANT EXECUTE ON FUNCTION public.payout_account_submit(text, text, text, text, text) TO authenticated;

-- Live: the Edge Function asks first (format, rate limit, step-up, names for the RazorpayX contact)…
CREATE OR REPLACE FUNCTION public.payout_account_live_prepare(_u uuid, _kind text, _account text, _ifsc text, _otp text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _k text := lower(btrim(COALESCE(_kind, ''))); _norm text := regexp_replace(COALESCE(_account, ''), '\s', '', 'g');
  _ifsc_n text := upper(regexp_replace(COALESCE(_ifsc, ''), '\s', '', 'g')); _p public.profiles; _a public.worker_payout_accounts;
BEGIN
  IF public.payouts_mock_enabled() THEN RAISE EXCEPTION 'mock payouts: use payout_account_submit'; END IF;
  SELECT * INTO _w FROM public.workers WHERE user_id = _u AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'workers only' USING ERRCODE = '42501'; END IF;
  IF _k = 'bank' AND (_norm !~ '^[0-9]{9,18}$' OR _ifsc_n !~ '^[A-Z]{4}0[A-Z0-9]{6}$') THEN RAISE EXCEPTION 'invalid account number or IFSC'; END IF;
  IF _k = 'upi' AND _norm !~ '^[^@]{2,64}@[^@]{2,64}$' THEN RAISE EXCEPTION 'invalid UPI id'; END IF;
  IF _k NOT IN ('bank','upi') THEN RAISE EXCEPTION 'account type must be bank or upi'; END IF;
  PERFORM public._payout_account_ratelimit(_u);
  IF NOT public.stepup_verify(_u, 'payout_account', _otp) THEN RAISE EXCEPTION 'step-up code did not match'; END IF;
  SELECT * INTO _p FROM public.profiles WHERE user_id = _u;
  SELECT * INTO _a FROM public.worker_payout_accounts WHERE worker_user_id = _u;
  RETURN jsonb_build_object('name', COALESCE((SELECT legal_name FROM public.kyc_verification WHERE worker_id = _w.id), _w.display_name),
    'email', _p.email, 'phone', _p.phone_number, 'contact_id', CASE WHEN _a.provider = 'razorpayx' THEN _a.contact_id END);
END $$;

-- …then records what RazorpayX said. _state: completed | created (still validating) | failed.
CREATE OR REPLACE FUNCTION public.payout_account_live_record(_u uuid, _kind text, _account text, _ifsc text, _pan text,
  _contact_id text, _fund_account_id text, _validation_ref text, _state text, _account_status text, _registered text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _state = 'created' THEN
    RETURN public._payout_account_apply(_u, _kind, _account, _ifsc, _pan, NULL, NULL, NULL, _fund_account_id, 'razorpayx', true, _contact_id, _validation_ref);
  END IF;
  RETURN public._payout_account_apply(_u, _kind, _account, _ifsc, _pan, NULLIF(btrim(COALESCE(_registered, '')), ''),
    CASE WHEN _state = 'failed' OR COALESCE(_account_status, '') <> 'active' THEN 'invalid_account' END, NULL,
    _fund_account_id, 'razorpayx', false, _contact_id, _validation_ref);
END $$;

-- fund_account.validation.completed / failed webhook for a validation that was still running.
CREATE OR REPLACE FUNCTION public.payout_validation_event(_validation_ref text, _account_status text, _registered text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.worker_payout_accounts; _w public.workers; _legal text; _name_r text; _dup boolean;
BEGIN
  SELECT * INTO _a FROM public.worker_payout_accounts WHERE validation_ref = _validation_ref AND validation_status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF COALESCE(_account_status, '') <> 'active' THEN
    UPDATE public.worker_payout_accounts SET validation_status = 'failed', failure_reason = 'invalid_account', updated_at = now() WHERE id = _a.id;
    RETURN 'failed';
  END IF;
  SELECT * INTO _w FROM public.workers WHERE id = _a.worker_id;
  SELECT legal_name INTO _legal FROM public.kyc_verification WHERE worker_id = _a.worker_id;
  _name_r := public.payout_name_result(_legal, _registered);
  _dup := EXISTS (SELECT 1 FROM public.worker_payout_accounts o WHERE o.account_hash = _a.account_hash AND o.worker_user_id <> _a.worker_user_id);
  UPDATE public.worker_payout_accounts SET registered_name = _registered, duplicate = _dup, updated_at = now(),
    validation_status = CASE WHEN _name_r = 'mismatch' THEN 'rejected' WHEN _dup OR _name_r = 'review' THEN 'review' ELSE 'verified' END,
    failure_reason = CASE WHEN _name_r = 'mismatch' THEN 'name_mismatch' WHEN _dup THEN 'duplicate' WHEN _name_r = 'review' THEN 'name_review' END,
    verified_at = CASE WHEN _name_r = 'match' AND NOT _dup THEN now() END,
    cooling_until = CASE WHEN _name_r = 'match' AND NOT _dup THEN now() + make_interval(days => public.setting_num('payout_cooling_days', 3)::int) END
  WHERE id = _a.id;
  RETURN (SELECT validation_status FROM public.worker_payout_accounts WHERE id = _a.id);
END $$;

-- ---------- batch: provider follows the switch ----------
CREATE OR REPLACE FUNCTION public.payout_run(_force boolean DEFAULT false, _only uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _w public.workers; _a public.worker_payout_accounts; _amt numeric; _id uuid; _st text; _why text; _prov text := public.payouts_provider();
  _min numeric := public.setting_num('payout_min', 200); _review numeric := public.setting_num('payout_review_amount', 10000);
  _created int := 0; _skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT _force AND NOT public.payouts_auto_enabled() THEN
    RETURN jsonb_build_object('ok', true, 'paused', true, 'created', 0);
  END IF;
  FOR _w IN SELECT * FROM public.workers WHERE status = 'approved' AND (_only IS NULL OR user_id = _only) ORDER BY user_id LOOP
    _why := public.payout_block_reason(_w.user_id);
    IF _why IS NOT NULL THEN
      _skipped := _skipped || jsonb_build_array(jsonb_build_object('user', _w.user_id, 'reason', _why));
      CONTINUE;
    END IF;
    SELECT * INTO _a FROM public.worker_payout_accounts WHERE worker_user_id = _w.user_id;
    IF _a.provider IS DISTINCT FROM _prov THEN
      _skipped := _skipped || jsonb_build_array(jsonb_build_object('user', _w.user_id, 'reason', 'account_provider'));
      CONTINUE;
    END IF;
    PERFORM 1 FROM public.worker_earnings WHERE worker_user_id = _w.user_id AND payout_id IS NULL AND available_at <= now() FOR UPDATE;
    SELECT COALESCE(sum(net), 0) INTO _amt FROM public.worker_earnings WHERE worker_user_id = _w.user_id AND payout_id IS NULL AND available_at <= now();
    IF _amt < _min THEN
      _skipped := _skipped || jsonb_build_array(jsonb_build_object('user', _w.user_id, 'reason', 'below_min'));
      CONTINUE;
    END IF;
    IF COALESCE(public.setting('tds_enabled')#>>'{}', 'false') = 'true' OR _amt >= _review OR _a.duplicate THEN
      _st := 'review';
      _why := CASE WHEN COALESCE(public.setting('tds_enabled')#>>'{}', 'false') = 'true' THEN 'tds' WHEN _a.duplicate THEN 'duplicate' ELSE 'amount' END;
    ELSE
      _st := 'queued'; _why := NULL;
    END IF;
    INSERT INTO public.payout_requests(worker_user_id, amount, status, method, provider, gross, fee, tds, fee_bearer, review_reason, account_id)
    VALUES (_w.user_id, _amt, _st, 'auto', _prov, _amt, 0, 0, public.setting('payout_fee_bearer')#>>'{}', _why, _a.id)
    RETURNING id INTO _id;
    UPDATE public.worker_earnings SET payout_id = _id WHERE worker_user_id = _w.user_id AND payout_id IS NULL AND available_at <= now();
    UPDATE public.payout_requests SET entry_count = (SELECT count(*)::int FROM public.worker_earnings WHERE payout_id = _id) WHERE id = _id;
    _created := _created + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'paused', false, 'created', _created, 'skipped', _skipped, 'provider', _prov);
END $$;

-- Claim queued live payouts (status → processing before the HTTP call; idempotency key = payout id).
CREATE OR REPLACE FUNCTION public.payout_claim_live(_limit int DEFAULT 20)
RETURNS TABLE(payout_id uuid, amount numeric, fund_account_id text, kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.payouts_mock_enabled() THEN RETURN; END IF;
  RETURN QUERY
  WITH c AS (
    SELECT p.id FROM public.payout_requests p
    WHERE p.status = 'queued' AND p.provider = 'razorpayx' AND p.provider_payout_id IS NULL
    ORDER BY p.requested_at FOR UPDATE SKIP LOCKED LIMIT greatest(1, least(_limit, 100))
  )
  UPDATE public.payout_requests p SET status = 'processing', attempt_count = p.attempt_count + 1, claimed_at = now()
  FROM c WHERE p.id = c.id
  RETURNING p.id, p.amount, (SELECT a.fund_account_id FROM public.worker_payout_accounts a WHERE a.id = p.account_id),
    (SELECT a.kind FROM public.worker_payout_accounts a WHERE a.id = p.account_id);
END $$;

CREATE OR REPLACE FUNCTION public.payout_mark_sent(_id uuid, _provider_payout_id text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.payout_requests SET provider_payout_id = _provider_payout_id, failure_reason = NULL WHERE id = _id AND status = 'processing' $$;

-- HTTP error before RazorpayX accepted the payout. Retryable → queued again (until payout_max_attempts).
CREATE OR REPLACE FUNCTION public.payout_send_error(_id uuid, _reason text, _retry boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests;
BEGIN
  SELECT * INTO _p FROM public.payout_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _p.status <> 'processing' THEN RETURN 'ignored'; END IF;
  IF _retry AND _p.attempt_count < public.setting_num('payout_max_attempts', 3) THEN
    UPDATE public.payout_requests SET status = 'queued', failure_reason = left(COALESCE(_reason, 'retry'), 120) WHERE id = _id;
    RETURN 'retry';
  END IF;
  UPDATE public.payout_requests SET status = 'failed', failure_reason = left(COALESCE(_reason, 'failed'), 120), decided_at = now() WHERE id = _id;
  PERFORM public.payout_unlink(_id);
  IF _reason = 'beneficiary' THEN
    UPDATE public.worker_payout_accounts SET validation_status = 'failed', failure_reason = 'beneficiary', updated_at = now() WHERE id = _p.account_id;
  END IF;
  RETURN 'failed';
END $$;

-- Event store records the real provider now (was hard-coded 'mock').
CREATE OR REPLACE FUNCTION public.payout_apply_event(_event_id text, _type text, _provider_payout_id text, _payout_id uuid, _utr text, _reason text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests; _outcome text := 'ignored'; _max int := public.setting_num('payout_max_attempts', 3)::int;
BEGIN
  IF COALESCE(btrim(_event_id), '') = '' THEN RAISE EXCEPTION 'event id required'; END IF;
  BEGIN
    INSERT INTO public.payout_events(event_id, provider, type, payout_id, payload)
    VALUES (_event_id, public.payouts_provider(), COALESCE(_type, 'unknown'), _payout_id, _payload);
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
        provider_payout_id = COALESCE(provider_payout_id, _provider_payout_id), failure_reason = NULL, decided_at = now() WHERE id = _p.id;
      _outcome := 'paid';
    END IF;
  ELSIF _type IN ('payout.failed', 'payout.rejected') THEN
    IF _p.status IN ('paid', 'reversed', 'rejected', 'failed') THEN _outcome := 'ignored';
    -- live rows count an attempt when claimed; mock rows count it here
    ELSIF COALESCE(_reason, '') IN ('beneficiary', 'invalid_account')
       OR (CASE WHEN _p.provider = 'razorpayx' THEN _p.attempt_count ELSE _p.attempt_count + 1 END) >= _max THEN
      UPDATE public.payout_requests SET status = 'failed', failure_reason = COALESCE(NULLIF(btrim(_reason), ''), 'failed'),
        attempt_count = CASE WHEN provider = 'razorpayx' THEN attempt_count ELSE attempt_count + 1 END, decided_at = now() WHERE id = _p.id;
      PERFORM public.payout_unlink(_p.id);
      IF COALESCE(_reason, '') = 'beneficiary' THEN
        UPDATE public.worker_payout_accounts SET validation_status = 'failed', failure_reason = 'beneficiary', updated_at = now() WHERE worker_user_id = _p.worker_user_id;
      END IF;
      _outcome := 'failed';
    ELSE
      -- a failed live payout gets a fresh attempt (new RazorpayX payout, same reference)
      UPDATE public.payout_requests SET status = 'queued', failure_reason = COALESCE(NULLIF(btrim(_reason), ''), 'retry'),
        provider_payout_id = CASE WHEN provider = 'razorpayx' THEN NULL ELSE provider_payout_id END,
        attempt_count = CASE WHEN provider = 'razorpayx' THEN attempt_count ELSE attempt_count + 1 END WHERE id = _p.id;
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

-- ---------- kick the payout-run function (live) ----------
CREATE OR REPLACE FUNCTION public.payout_hook_ok(_secret text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(_secret, '') <> '' AND _secret = (public.setting('payout_hook_secret') #>> '{}') $$;

CREATE OR REPLACE FUNCTION public.payout_kick(_body jsonb DEFAULT '{"dispatch_only":true}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text := public.setting('payout_run_url') #>> '{}'; _secret text := public.setting('payout_hook_secret') #>> '{}';
BEGIN
  IF _url IS NULL OR _url = '' OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    USING _url, _body, jsonb_build_object('content-type', 'application/json', 'x-payout-hook', COALESCE(_secret, ''));
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'payout_kick failed: %', SQLERRM;
END $$;

-- Monday 10:00 IST. Mock: everything in SQL. Live: create the rows here, the function sends them.
CREATE OR REPLACE FUNCTION public.payout_weekly() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb; _d jsonb := '{}'::jsonb;
BEGIN
  _r := public.payout_run(false, NULL);
  IF COALESCE((_r->>'paused')::boolean, false) THEN RETURN _r; END IF;
  IF public.payouts_mock_enabled() THEN
    _d := public.payout_dispatch_mock(NULL);
    PERFORM public.push_payout_batch_done(_r, _d);
  ELSE
    PERFORM public.payout_kick();
  END IF;
  RETURN _r || jsonb_build_object('dispatch', _d);
END $$;

CREATE OR REPLACE FUNCTION public.payout_retry_sweep() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF public.payouts_mock_enabled() THEN RETURN 0; END IF;
  -- processing without a provider id for 15 min = the function died mid-call; the idempotency key makes a resend safe
  UPDATE public.payout_requests SET status = 'queued' WHERE provider = 'razorpayx' AND status = 'processing' AND provider_payout_id IS NULL
    AND claimed_at < now() - interval '15 minutes';
  SELECT count(*) INTO _n FROM public.payout_requests WHERE provider = 'razorpayx' AND status = 'queued';
  IF _n > 0 THEN PERFORM public.payout_kick(); END IF;
  RETURN _n;
END $$;

-- ---------- admin actions follow the switch ----------
CREATE OR REPLACE FUNCTION public.admin_payout_approve(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests; _why text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _p FROM public.payout_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _p.status <> 'review' THEN RAISE EXCEPTION 'payout is not in review'; END IF;
  _why := public.payout_block_reason(_p.worker_user_id);
  IF _why IS NOT NULL AND _why <> 'in_flight' THEN RAISE EXCEPTION 'cannot send: %', _why; END IF;
  UPDATE public.payout_requests SET status = 'queued', review_reason = NULL WHERE id = _id;
  IF public.payouts_mock_enabled() THEN PERFORM public.payout_dispatch_mock(_id); ELSE PERFORM public.payout_kick(); END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.approve', _id, 'sent', jsonb_build_object('amount', _p.amount));
  RETURN (SELECT status FROM public.payout_requests WHERE id = _id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_run() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb; _d jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  _r := public.payout_run(false, NULL);
  IF public.payouts_mock_enabled() THEN _d := public.payout_dispatch_mock(NULL); ELSE PERFORM public.payout_kick(); END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.run', NULL, 'batch', _r || jsonb_build_object('dispatch', _d));
  RETURN _r || jsonb_build_object('dispatch', _d);
END $$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public.payouts_provider(), public.stepup_issue(uuid, text), public.stepup_verify(uuid, text, text),
  public._payout_account_apply(uuid, text, text, text, text, text, text, text, text, text, boolean, text, text), public._payout_account_ratelimit(uuid),
  public.payout_account_live_prepare(uuid, text, text, text, text),
  public.payout_account_live_record(uuid, text, text, text, text, text, text, text, text, text, text),
  public.payout_validation_event(text, text, text), public.payout_claim_live(int), public.payout_mark_sent(uuid, text),
  public.payout_send_error(uuid, text, boolean), public.payout_hook_ok(text), public.payout_kick(jsonb), public.payout_weekly(), public.payout_retry_sweep()
  FROM public, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.payouts_provider(), public.stepup_issue(uuid, text), public.stepup_verify(uuid, text, text),
      public.payout_account_live_prepare(uuid, text, text, text, text),
      public.payout_account_live_record(uuid, text, text, text, text, text, text, text, text, text, text),
      public.payout_validation_event(text, text, text), public.payout_claim_live(int), public.payout_mark_sent(uuid, text),
      public.payout_send_error(uuid, text, boolean), public.payout_hook_ok(text), public.payout_weekly(), public.payout_retry_sweep() TO service_role;
  END IF;
END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('payout-weekly', 'payout-retry');
  PERFORM cron.schedule('payout-weekly', '30 4 * * 1', 'SELECT public.payout_weekly()');      -- Monday 10:00 IST
  PERFORM cron.schedule('payout-retry', '*/10 * * * *', 'SELECT public.payout_retry_sweep()'); -- live only; no-op in mock
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable: call payout-run on a schedule instead (%)', SQLERRM;
END $$;
