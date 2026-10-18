-- Next payout is the first Monday 10:00 IST on or after the worker can actually be paid
-- (cool-off, 72h hold, temporary block). Failed payouts remember how many entries went back.

ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS entry_count integer NOT NULL DEFAULT 0;
UPDATE public.payout_requests p
SET entry_count = (SELECT count(*)::int FROM public.worker_earnings e WHERE e.payout_id = p.id)
WHERE entry_count = 0
  AND EXISTS (SELECT 1 FROM public.worker_earnings e WHERE e.payout_id = p.id);

DROP FUNCTION IF EXISTS public.payout_next_at();
CREATE FUNCTION public.payout_next_at(_not_before timestamptz DEFAULT NULL) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT GREATEST(now(), COALESCE(_not_before, now())) AS at
  ),
  ist AS (
    SELECT at AT TIME ZONE 'Asia/Kolkata' AS local FROM bounds
  ),
  cand AS (
    SELECT local,
      date_trunc('day', local)
        + ((8 - EXTRACT(ISODOW FROM local)::int) % 7) * interval '1 day'
        + interval '10 hours' AS slot
    FROM ist)
  SELECT (CASE WHEN slot < local THEN slot + interval '7 days' ELSE slot END) AT TIME ZONE 'Asia/Kolkata' FROM cand
$$;
REVOKE ALL ON FUNCTION public.payout_next_at(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payout_next_at(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_earnings() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _u uuid := auth.uid(); _wk public.workers; _a public.worker_payout_accounts;
  _block text; _avail numeric; _hold numeric; _reason text; _min numeric;
  _gate timestamptz := now(); _ready timestamptz; _until timestamptz; _show boolean := true;
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

  -- No honest Monday while a person, a complaint, or an open payout is the blocker.
  IF _block IN ('flagged','payout_hold','not_approved','account_unverified','account_rejected','account_review','in_flight') THEN
    _show := false;
  END IF;
  IF _a.validation_status = 'verified' AND _a.cooling_until IS NOT NULL AND _a.cooling_until > _gate THEN
    _gate := _a.cooling_until;
  END IF;
  IF _wk.blocked_until IS NOT NULL AND _wk.blocked_until > _gate THEN
    _gate := _wk.blocked_until;
  END IF;
  IF _avail < _min THEN
    SELECT s.available_at INTO _ready
    FROM (
      SELECT e.available_at, sum(e.net) OVER (ORDER BY e.available_at, e.id) AS running
      FROM public.worker_earnings e
      WHERE e.worker_user_id = _u AND e.payout_id IS NULL
    ) s
    WHERE s.running >= _min
    ORDER BY s.available_at
    LIMIT 1;
    IF _ready IS NOT NULL AND _ready > _gate THEN _gate := _ready; END IF;
    IF _ready IS NULL AND _gate <= now() AND _reason IN ('below_min','on_hold') THEN _show := false; END IF;
  END IF;
  IF _reason = 'cooling' THEN _until := _a.cooling_until;
  ELSIF _reason = 'blocked' THEN _until := _wk.blocked_until;
  ELSIF _reason = 'on_hold' THEN _until := _ready;
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
    'next_batch', CASE WHEN _wk.id IS NOT NULL AND _show THEN public.payout_next_at(_gate) END,
    'wait_reason', _reason,
    'wait_until', _until,
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
  UPDATE public.payout_requests SET entry_count = (SELECT count(*)::int FROM public.worker_earnings WHERE payout_id = _id) WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'amount', _amt);
END $$;

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
    UPDATE public.payout_requests SET entry_count = (SELECT count(*)::int FROM public.worker_earnings WHERE payout_id = _id) WHERE id = _id;
    _created := _created + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'paused', false, 'created', _created, 'skipped', _skipped);
END $$;

CREATE OR REPLACE FUNCTION public.admin_payouts(_status text DEFAULT NULL) RETURNS TABLE(
  id uuid, worker_user_id uuid, worker_name text, amount numeric, status text, reference text, admin_note text,
  requested_at timestamptz, decided_at timestamptz, items int, review_reason text, failure_reason text,
  provider text, attempt_count int, account_mask text, account_status text, payout_hold boolean, flag_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.id, p.worker_user_id, COALESCE(w.display_name, pr.full_name, 'Worker'), p.amount, p.status, p.reference, p.admin_note,
    p.requested_at, p.decided_at,
    CASE WHEN p.status IN ('failed','reversed','rejected') THEN p.entry_count
         ELSE (SELECT count(*)::int FROM public.worker_earnings e WHERE e.payout_id = p.id) END,
    p.review_reason, p.failure_reason, p.provider, p.attempt_count, a.account_mask, a.validation_status, COALESCE(w.payout_hold, false), COALESCE(w.flag_active, false)
  FROM public.payout_requests p
  LEFT JOIN public.workers w ON w.user_id = p.worker_user_id
  LEFT JOIN public.profiles pr ON pr.user_id = p.worker_user_id
  LEFT JOIN public.worker_payout_accounts a ON a.id = p.account_id
  WHERE _status IS NULL OR p.status = _status
  ORDER BY (p.status IN ('review','requested','queued','processing')) DESC, p.requested_at DESC LIMIT 200;
END $$;
