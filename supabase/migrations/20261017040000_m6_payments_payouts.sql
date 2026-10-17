-- M6: credit packs (DB config, GST-inclusive), payment orders (pluggable provider: razorpay | mock), server-only crediting
-- (idempotent verify + webhook), worker earnings ledger (commission 18% / 15% new from config), weekly payouts, admin views.

INSERT INTO public.app_settings(key,value) VALUES
  ('commission_new_pct','15'), ('commission_new_days','30'), ('commission_new_sessions','20'),
  ('gst_pct','18'), ('payout_min','200'), ('payout_hold_hours','72'), ('payments_mock','true')
ON CONFLICT (key) DO NOTHING;

-- ---------- packs ----------
CREATE TABLE public.credit_packs (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,32}$'),
  name_i18n jsonb NOT NULL,
  price_inr numeric(10,2) NOT NULL CHECK (price_inr >= 1),         -- what the user pays, GST included
  credits numeric(10,2) NOT NULL CHECK (credits > 0),               -- paid credits (1 credit = ₹1)
  bonus numeric(10,2) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  sort int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, popular boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active packs" ON public.credit_packs FOR SELECT USING (active OR public.has_role(auth.uid(),'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.credit_packs FROM anon, authenticated;
INSERT INTO public.credit_packs(id,name_i18n,price_inr,credits,bonus,sort,popular) VALUES
  ('starter','{"en":"Starter","ta":"தொடக்கம்"}',99,99,0,1,false),
  ('basic','{"en":"Basic","ta":"அடிப்படை"}',249,249,11,2,false),
  ('value','{"en":"Value","ta":"மதிப்பு"}',499,499,31,3,true),
  ('pro','{"en":"Pro","ta":"புரோ"}',999,999,81,4,false),
  ('max','{"en":"Max","ta":"மேக்ஸ்"}',1999,1999,201,5,false)
ON CONFLICT (id) DO NOTHING;

-- ---------- orders + provider events ----------
CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id text NOT NULL REFERENCES public.credit_packs(id),
  amount_paise int NOT NULL CHECK (amount_paise > 0), currency text NOT NULL DEFAULT 'INR',
  gst_paise int NOT NULL DEFAULT 0,
  credits numeric(10,2) NOT NULL, bonus numeric(10,2) NOT NULL DEFAULT 0,
  provider text NOT NULL CHECK (provider IN ('razorpay','mock')),
  provider_order_id text UNIQUE, provider_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','cancelled','refunded')),
  failure_reason text, credited_at timestamptz, refunded_at timestamptz, refund_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_orders_user_idx ON public.payment_orders(user_id, created_at DESC);
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders" ON public.payment_orders FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.payment_orders FROM anon, authenticated;

CREATE TABLE public.payment_events (
  event_id text PRIMARY KEY,               -- provider event id (x-razorpay-event-id) — makes webhooks idempotent
  provider text NOT NULL, type text NOT NULL, order_id uuid REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  outcome text, payload jsonb, received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;  -- no policies: server only
REVOKE ALL ON public.payment_events FROM anon, authenticated;

-- user: start an order for a pack (amount comes from the DB, never the client)
CREATE OR REPLACE FUNCTION public.payment_order_new(_pack text, _provider text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.credit_packs; _o public.payment_orders; _gst numeric := public.setting_num('gst_pct',18);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF _provider NOT IN ('razorpay','mock') THEN RAISE EXCEPTION 'bad provider'; END IF;
  SELECT * INTO _p FROM public.credit_packs WHERE id=_pack AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'pack not available'; END IF;
  IF (SELECT count(*) FROM public.payment_orders WHERE user_id=auth.uid() AND created_at > now() - interval '1 hour') >= 30 THEN RAISE EXCEPTION 'too many orders, try later'; END IF;
  INSERT INTO public.payment_orders(user_id,pack_id,amount_paise,gst_paise,credits,bonus,provider)
  VALUES (auth.uid(), _p.id, round(_p.price_inr*100)::int, round(_p.price_inr*100 * _gst/(100+_gst))::int, _p.credits, _p.bonus, _provider) RETURNING * INTO _o;
  RETURN to_jsonb(_o);
END $$;
-- user: closed the checkout without paying
CREATE OR REPLACE FUNCTION public.payment_order_cancel(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text;
BEGIN
  UPDATE public.payment_orders SET status='cancelled', updated_at=now() WHERE id=_id AND user_id=auth.uid() AND status='created' RETURNING status INTO _st;
  RETURN COALESCE(_st, (SELECT status FROM public.payment_orders WHERE id=_id AND user_id=auth.uid()));
END $$;
GRANT EXECUTE ON FUNCTION public.payment_order_new(text,text), public.payment_order_cancel(uuid) TO authenticated;

-- server (Edge Function, service role): attach provider order id
CREATE OR REPLACE FUNCTION public.payment_order_attach(_id uuid, _provider_order_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.payment_orders SET provider_order_id=_provider_order_id, updated_at=now() WHERE id=_id AND provider_order_id IS NULL $$;

-- server: the ONLY place paid credits enter a wallet. Idempotent on the order (row lock + status) and on the payment id.
CREATE OR REPLACE FUNCTION public.payment_mark_paid(_provider_order_id text, _payment_id text, _source text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.payment_orders; _wid uuid; _bal numeric;
BEGIN
  SELECT * INTO _o FROM public.payment_orders WHERE provider_order_id=_provider_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown order'; END IF;
  IF _o.status = 'paid' OR _o.status = 'refunded' THEN RETURN jsonb_build_object('order_id',_o.id,'status',_o.status,'credited',false,'duplicate',true); END IF;
  -- a late success after the user closed the checkout / an earlier failure still credits (money was captured)
  _wid := public.wallet_id_for(_o.user_id);
  UPDATE public.wallets SET balance = balance + _o.credits + _o.bonus, updated_at=now() WHERE id=_wid RETURNING balance INTO _bal;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_wid,'top_up',_o.credits,'pack:'||_o.pack_id,_o.id::text);
  IF _o.bonus > 0 THEN INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_wid,'credit',_o.bonus,'bonus:'||_o.pack_id,_o.id::text); END IF;
  UPDATE public.payment_orders SET status='paid', provider_payment_id=_payment_id, credited_at=now(), failure_reason=NULL, updated_at=now() WHERE id=_o.id;
  RETURN jsonb_build_object('order_id',_o.id,'status','paid','credited',true,'duplicate',false,'balance',_bal,'source',_source);
END $$;

CREATE OR REPLACE FUNCTION public.payment_mark_failed(_provider_order_id text, _reason text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.payment_orders SET status='failed', failure_reason=left(_reason,300), updated_at=now()
  WHERE provider_order_id=_provider_order_id AND status IN ('created','cancelled') RETURNING status $$;

-- server: webhook dedupe. Returns false when the event was already processed.
CREATE OR REPLACE FUNCTION public.payment_event_once(_event_id text, _provider text, _type text, _provider_order_id text, _payload jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.payment_events(event_id,provider,type,order_id,payload)
  VALUES (_event_id,_provider,_type,(SELECT id FROM public.payment_orders WHERE provider_order_id=_provider_order_id),_payload);
  RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.payment_event_outcome(_event_id text, _outcome text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.payment_events SET outcome=_outcome WHERE event_id=_event_id $$;
CREATE OR REPLACE FUNCTION public.payments_mock_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.setting('payments_mock')#>>'{}','false') = 'true' $$;

REVOKE ALL ON FUNCTION public.payment_order_attach(uuid,text), public.payment_mark_paid(text,text,text), public.payment_mark_failed(text,text),
  public.payment_event_once(text,text,text,text,jsonb), public.payment_event_outcome(text,text), public.payments_mock_enabled() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_order_attach(uuid,text), public.payment_mark_paid(text,text,text), public.payment_mark_failed(text,text),
  public.payment_event_once(text,text,text,text,jsonb), public.payment_event_outcome(text,text), public.payments_mock_enabled() TO service_role;

-- user: wallet summary + ledger
CREATE OR REPLACE FUNCTION public.my_wallet_ledger(_limit int DEFAULT 50) RETURNS TABLE(id uuid, type text, amount numeric, description text, reference_id text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.type::text, t.amount, t.description, t.reference_id, t.created_at FROM public.wallet_transactions t JOIN public.wallets w ON w.id=t.wallet_id
  WHERE w.user_id = auth.uid() ORDER BY t.created_at DESC LIMIT LEAST(GREATEST(_limit,1),200) $$;
GRANT EXECUTE ON FUNCTION public.my_wallet_ledger(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.payments_config() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('gst_pct', public.setting_num('gst_pct',18), 'payout_min', public.setting_num('payout_min',200), 'payout_hold_hours', public.setting_num('payout_hold_hours',72),
    'commission_pct', public.setting_num('commission_pct',18), 'commission_new_pct', public.setting_num('commission_new_pct',15),
    'commission_new_days', public.setting_num('commission_new_days',30), 'commission_new_sessions', public.setting_num('commission_new_sessions',20)) $$;
GRANT EXECUTE ON FUNCTION public.payments_config() TO anon, authenticated;

-- ---------- commission (per category rules, new-worker discount) ----------
CREATE TABLE public.commission_rules (
  node_slug text PRIMARY KEY REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  pct numeric(5,2) NOT NULL CHECK (pct BETWEEN 15 AND 20)
);
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read commission rules" ON public.commission_rules FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.commission_rules FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.commission_for(_worker uuid, _node text) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; cur text := _node; _pct numeric; _n int;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE id=_worker;
  SELECT count(*) INTO _n FROM public.consult_sessions WHERE worker_id=_worker AND status='ended' AND credits_used > 0;
  IF COALESCE(_w.decided_at, _w.created_at) > now() - make_interval(days => public.setting_num('commission_new_days',30)::int)
     AND _n < public.setting_num('commission_new_sessions',20) THEN
    RETURN public.setting_num('commission_new_pct',15);
  END IF;
  WHILE cur IS NOT NULL LOOP
    SELECT pct INTO _pct FROM public.commission_rules WHERE node_slug=cur;
    IF FOUND THEN RETURN _pct; END IF;
    SELECT parent_slug INTO cur FROM public.taxonomy_nodes WHERE slug=cur;
  END LOOP;
  RETURN public.setting_num('commission_pct',18);
END $$;
REVOKE ALL ON FUNCTION public.commission_for(uuid,text) FROM public, anon, authenticated;

-- ---------- earnings + payouts ----------
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected')),
  method text NOT NULL DEFAULT 'manual', reference text, admin_note text,
  requested_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by uuid
);
CREATE UNIQUE INDEX payout_one_open ON public.payout_requests(worker_user_id) WHERE status='requested';
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payouts" ON public.payout_requests FOR SELECT USING (auth.uid()=worker_user_id OR public.has_role(auth.uid(),'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.payout_requests FROM anon, authenticated;

CREATE TABLE public.worker_earnings (
  id bigserial PRIMARY KEY,
  worker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.consult_sessions(id) ON DELETE SET NULL,
  mode text, minutes int, gross numeric(12,2) NOT NULL, commission_pct numeric(5,2) NOT NULL, commission numeric(12,2) NOT NULL, net numeric(12,2) NOT NULL,
  available_at timestamptz NOT NULL, payout_id uuid REFERENCES public.payout_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX worker_earnings_worker_idx ON public.worker_earnings(worker_user_id, created_at DESC);
ALTER TABLE public.worker_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own earnings" ON public.worker_earnings FOR SELECT USING (auth.uid()=worker_user_id OR public.has_role(auth.uid(),'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.worker_earnings FROM anon, authenticated;

-- accept: commission now comes from config (rules + new-worker rate)
CREATE OR REPLACE FUNCTION public.request_respond(_id uuid, _accept boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _q public.consult_requests; _sid uuid; _comm numeric;
BEGIN
  PERFORM public.request_expire_due();
  SELECT * INTO _q FROM public.consult_requests WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR _q.worker_user_id <> auth.uid() THEN RAISE EXCEPTION 'not your request' USING ERRCODE='42501'; END IF;
  IF _q.status <> 'ringing' THEN RAISE EXCEPTION 'request is %', _q.status; END IF;
  IF NOT _accept THEN UPDATE public.consult_requests SET status='declined', responded_at=now() WHERE id=_id; RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE worker_id=_q.worker_id AND status='active') THEN RAISE EXCEPTION 'finish your current session first'; END IF;
  _comm := public.commission_for(_q.worker_id, _q.node_slug);
  INSERT INTO public.consult_sessions(request_id,user_id,worker_id,worker_user_id,node_slug,current_mode,commission_pct)
  VALUES (_id,_q.user_id,_q.worker_id,_q.worker_user_id,_q.node_slug,_q.mode,_comm) RETURNING id INTO _sid;
  INSERT INTO public.session_segments(session_id,mode,rate) VALUES (_sid,_q.mode,_q.rate);
  IF _q.mode IN ('voice','video') THEN
    INSERT INTO public.session_calls(session_id,mode,caller,status,answered_at) VALUES (_sid,_q.mode,_q.user_id,'active',now());
  END IF;
  INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid,auth.uid(),'session_started','system');
  UPDATE public.consult_requests SET status='accepted', responded_at=now(), session_id=_sid WHERE id=_id;
  RETURN _sid;
END $$;

-- metering: the worker's share now goes to the earnings ledger (held, then paid out) instead of their spendable wallet
CREATE OR REPLACE FUNCTION public.session_bill_internal(_sid uuid, _close boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _g public.session_segments; _mins int; _due numeric; _bal numeric; _uw uuid; _pay numeric; _exhausted boolean := false;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  SELECT * INTO _g FROM public.session_segments WHERE session_id=_sid AND ended_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF _s.status = 'active' AND _g.id IS NOT NULL THEN
    _mins := GREATEST(1, ceil(extract(epoch FROM (now() - _g.started_at)) / 60.0)::int);
    _due := (_mins - _g.minutes_billed) * _g.rate;
    IF _due > 0 THEN
      _uw := public.wallet_id_for(_s.user_id);
      SELECT balance INTO _bal FROM public.wallets WHERE id=_uw FOR UPDATE;
      IF _bal < _due THEN
        _mins := _g.minutes_billed + floor(_bal / _g.rate)::int; _due := (_mins - _g.minutes_billed) * _g.rate; _exhausted := true;
      END IF;
      IF _due > 0 THEN
        _pay := round(_due * (1 - _s.commission_pct/100), 2);
        UPDATE public.wallets SET balance = balance - _due WHERE id=_uw;
        INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES
          (_uw,'debit',-_due, _g.mode || ' consult ' || (_mins - _g.minutes_billed) || ' min', _sid::text);
        INSERT INTO public.worker_earnings(worker_user_id,session_id,mode,minutes,gross,commission_pct,commission,net,available_at)
        VALUES (_s.worker_user_id,_sid,_g.mode,_mins - _g.minutes_billed,_due,_s.commission_pct,_due - _pay,_pay,
                now() + make_interval(hours => public.setting_num('payout_hold_hours',72)::int));
        UPDATE public.session_segments SET minutes_billed=_mins, credits = credits + _due WHERE id=_g.id;
        UPDATE public.consult_sessions SET credits_used = credits_used + _due WHERE id=_sid;
      END IF;
    END IF;
    IF _close OR _exhausted THEN UPDATE public.session_segments SET ended_at=now() WHERE id=_g.id; END IF;
    IF _exhausted THEN
      UPDATE public.session_calls SET status='ended', ended_at=now() WHERE session_id=_sid AND status IN ('ringing','active');
      UPDATE public.consult_sessions SET status='ended', ended_at=now(), end_reason='credits_exhausted' WHERE id=_sid;
      INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid,_s.user_id,'credits_exhausted','system');
    END IF;
  END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=_s.user_id;
  SELECT * INTO _g FROM public.session_segments WHERE session_id=_sid ORDER BY id DESC LIMIT 1;
  RETURN jsonb_build_object('status',_s.status,'credits_used',_s.credits_used,'mode',_s.current_mode,'rate',_g.rate,
    'balance', CASE WHEN auth.uid() = _s.user_id THEN _bal END,
    'minutes_left', CASE WHEN auth.uid() = _s.user_id AND _g.rate > 0 THEN floor(_bal / _g.rate) END, 'end_reason', _s.end_reason);
END $$;
REVOKE ALL ON FUNCTION public.session_bill_internal(uuid,boolean) FROM public, anon, authenticated;

-- earlier (M3–M5) sessions credited the worker wallet directly; carry those over into the earnings ledger once (already available)
INSERT INTO public.worker_earnings(worker_user_id,session_id,mode,minutes,gross,commission_pct,commission,net,available_at,created_at)
SELECT s.worker_user_id, s.id, s.current_mode, NULL, s.credits_used, s.commission_pct, s.credits_used - round(s.credits_used*(1-s.commission_pct/100),2),
       round(s.credits_used*(1-s.commission_pct/100),2), COALESCE(s.ended_at, s.started_at), COALESCE(s.ended_at, s.started_at)
FROM public.consult_sessions s WHERE s.credits_used > 0 AND NOT EXISTS (SELECT 1 FROM public.worker_earnings e WHERE e.session_id=s.id);

CREATE OR REPLACE FUNCTION public.my_earnings() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _wk public.workers;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wk FROM public.workers WHERE user_id=_u;
  RETURN jsonb_build_object(
    'is_worker', _wk.id IS NOT NULL,
    'commission_pct', CASE WHEN _wk.id IS NOT NULL THEN public.commission_for(_wk.id, _wk.primary_node) END,
    'lifetime_gross', (SELECT COALESCE(sum(gross),0) FROM public.worker_earnings WHERE worker_user_id=_u),
    'lifetime_net', (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id=_u),
    'on_hold', (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id=_u AND payout_id IS NULL AND available_at > now()),
    'available', (SELECT COALESCE(sum(net),0) FROM public.worker_earnings WHERE worker_user_id=_u AND payout_id IS NULL AND available_at <= now()),
    'requested', (SELECT COALESCE(sum(amount),0) FROM public.payout_requests WHERE worker_user_id=_u AND status='requested'),
    'paid', (SELECT COALESCE(sum(amount),0) FROM public.payout_requests WHERE worker_user_id=_u AND status='paid'),
    'payout_min', public.setting_num('payout_min',200), 'hold_hours', public.setting_num('payout_hold_hours',72),
    'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', wk, 'sessions', n, 'gross', g, 'commission', c, 'net', nt) ORDER BY wk DESC) FROM (
        SELECT date_trunc('week', created_at AT TIME ZONE 'Asia/Kolkata')::date wk, count(DISTINCT session_id) n, sum(gross) g, sum(commission) c, sum(net) nt
        FROM public.worker_earnings WHERE worker_user_id=_u GROUP BY 1 ORDER BY 1 DESC LIMIT 26) x), '[]'::jsonb),
    'payouts', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'decided_by' ORDER BY p.requested_at DESC) FROM (SELECT * FROM public.payout_requests WHERE worker_user_id=_u ORDER BY requested_at DESC LIMIT 50) p), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.payout_request() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _amt numeric; _id uuid;
BEGIN
  IF _u IS NULL OR NOT EXISTS (SELECT 1 FROM public.workers WHERE user_id=_u AND status='approved') THEN RAISE EXCEPTION 'workers only' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE worker_user_id=_u AND status='requested') THEN RAISE EXCEPTION 'a payout is already pending'; END IF;
  PERFORM 1 FROM public.worker_earnings WHERE worker_user_id=_u AND payout_id IS NULL AND available_at <= now() FOR UPDATE;
  SELECT COALESCE(sum(net),0) INTO _amt FROM public.worker_earnings WHERE worker_user_id=_u AND payout_id IS NULL AND available_at <= now();
  IF _amt < public.setting_num('payout_min',200) THEN RAISE EXCEPTION 'minimum payout is %', public.setting_num('payout_min',200); END IF;
  INSERT INTO public.payout_requests(worker_user_id,amount) VALUES (_u,_amt) RETURNING id INTO _id;
  UPDATE public.worker_earnings SET payout_id=_id WHERE worker_user_id=_u AND payout_id IS NULL AND available_at <= now();
  RETURN jsonb_build_object('id',_id,'amount',_amt);
END $$;
GRANT EXECUTE ON FUNCTION public.my_earnings(), public.payout_request() TO authenticated;

-- ---------- admin ----------
CREATE OR REPLACE FUNCTION public.admin_payouts(_status text DEFAULT NULL) RETURNS TABLE(id uuid, worker_user_id uuid, worker_name text, amount numeric, status text, reference text, admin_note text, requested_at timestamptz, decided_at timestamptz, items int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.id, p.worker_user_id, COALESCE(w.display_name, pr.full_name, 'Worker'), p.amount, p.status, p.reference, p.admin_note, p.requested_at, p.decided_at,
    (SELECT count(*)::int FROM public.worker_earnings e WHERE e.payout_id=p.id)
  FROM public.payout_requests p LEFT JOIN public.workers w ON w.user_id=p.worker_user_id LEFT JOIN public.profiles pr ON pr.user_id=p.worker_user_id
  WHERE _status IS NULL OR p.status=_status ORDER BY (p.status='requested') DESC, p.requested_at DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payout_decide(_id uuid, _paid boolean, _reference text, _note text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payout_requests;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  SELECT * INTO _p FROM public.payout_requests WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR _p.status <> 'requested' THEN RAISE EXCEPTION 'payout is not pending'; END IF;
  IF _paid AND COALESCE(trim(_reference),'') = '' THEN RAISE EXCEPTION 'payment reference required'; END IF;
  IF NOT _paid AND COALESCE(trim(_note),'') = '' THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.payout_requests SET status=CASE WHEN _paid THEN 'paid' ELSE 'rejected' END, reference=NULLIF(trim(_reference),''), admin_note=NULLIF(trim(_note),''),
    decided_at=now(), decided_by=auth.uid() WHERE id=_id;
  IF NOT _paid THEN UPDATE public.worker_earnings SET payout_id=NULL WHERE payout_id=_id; END IF;  -- back to available
  INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(), CASE WHEN _paid THEN 'payout.paid' ELSE 'payout.rejected' END, _id, COALESCE(_note,_reference),
    jsonb_build_object('amount',_p.amount,'worker',_p.worker_user_id,'reference',_reference));
  RETURN CASE WHEN _paid THEN 'paid' ELSE 'rejected' END;
END $$;

CREATE OR REPLACE FUNCTION public.admin_payments(_limit int DEFAULT 100) RETURNS TABLE(id uuid, user_name text, pack_id text, amount_paise int, credits numeric, bonus numeric, provider text, provider_order_id text, provider_payment_id text, status text, failure_reason text, refund_note text, created_at timestamptz, events int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT o.id, COALESCE(pr.full_name,'User'), o.pack_id, o.amount_paise, o.credits, o.bonus, o.provider, o.provider_order_id, o.provider_payment_id, o.status, o.failure_reason, o.refund_note, o.created_at,
    (SELECT count(*)::int FROM public.payment_events e WHERE e.order_id=o.id)
  FROM public.payment_orders o LEFT JOIN public.profiles pr ON pr.user_id=o.user_id ORDER BY o.created_at DESC LIMIT LEAST(GREATEST(_limit,1),500);
END $$;

-- refund: reverses the credited pack from the wallet (only unspent credits can be refunded) and records it; the provider refund
-- itself is issued from the gateway dashboard / RazorpayX later and confirmed by the refund.processed webhook.
CREATE OR REPLACE FUNCTION public.admin_refund(_id uuid, _note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.payment_orders; _wid uuid; _bal numeric; _back numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF COALESCE(trim(_note),'') = '' THEN RAISE EXCEPTION 'reason required'; END IF;
  SELECT * INTO _o FROM public.payment_orders WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR _o.status <> 'paid' THEN RAISE EXCEPTION 'only paid orders can be refunded'; END IF;
  _wid := public.wallet_id_for(_o.user_id);
  SELECT balance INTO _bal FROM public.wallets WHERE id=_wid FOR UPDATE;
  _back := _o.credits + _o.bonus;
  IF _bal < _back THEN RAISE EXCEPTION 'credits already used (balance %, needs %)', _bal, _back; END IF;
  UPDATE public.wallets SET balance = balance - _back, updated_at=now() WHERE id=_wid;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_wid,'refund',-_back,'refund:'||_o.pack_id,_o.id::text);
  UPDATE public.payment_orders SET status='refunded', refunded_at=now(), refund_note=trim(_note), updated_at=now() WHERE id=_id;
  INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(),'payment.refund',_id,trim(_note), jsonb_build_object('amount_paise',_o.amount_paise,'credits',_back));
  RETURN jsonb_build_object('status','refunded','credits_reversed',_back);
END $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_pack(_id text, _name jsonb, _price numeric, _credits numeric, _bonus numeric, _sort int, _active boolean, _popular boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF _price < 99 THEN RAISE EXCEPTION 'minimum top-up is ₹99'; END IF;
  IF _credits < _price * 0.5 OR _bonus > _credits * 0.5 THEN RAISE EXCEPTION 'credits/bonus out of range'; END IF;
  IF COALESCE(_name->>'en','') = '' THEN RAISE EXCEPTION 'name required'; END IF;
  INSERT INTO public.credit_packs(id,name_i18n,price_inr,credits,bonus,sort,active,popular,updated_at) VALUES (_id,_name,_price,_credits,_bonus,_sort,_active,_popular,now())
  ON CONFLICT (id) DO UPDATE SET name_i18n=EXCLUDED.name_i18n, price_inr=EXCLUDED.price_inr, credits=EXCLUDED.credits, bonus=EXCLUDED.bonus, sort=EXCLUDED.sort,
    active=EXCLUDED.active, popular=EXCLUDED.popular, updated_at=now();
  INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(),'pack.upsert',NULL,_id, jsonb_build_object('price',_price,'credits',_credits,'bonus',_bonus,'active',_active));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_payouts(text), public.admin_payout_decide(uuid,boolean,text,text), public.admin_payments(int), public.admin_refund(uuid,text),
  public.admin_upsert_pack(text,jsonb,numeric,numeric,numeric,int,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_payouts(text), public.admin_payout_decide(uuid,boolean,text,text), public.admin_payments(int), public.admin_refund(uuid,text),
  public.admin_upsert_pack(text,jsonb,numeric,numeric,numeric,int,boolean,boolean) FROM anon;
