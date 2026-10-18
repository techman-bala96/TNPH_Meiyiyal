-- M11 · bonus-credit expiry. Pack bonuses ("bonus:<pack>" credit rows) become grants that expire after
-- bonus_expiry_days (0 = never). Spending uses bonus first, soonest-expiring first, so expiry only ever
-- removes bonus that was not used. Paid credits never expire. Daily job at 00:30 IST.
INSERT INTO public.app_settings(key, value) VALUES ('bonus_expiry_days', '90'), ('bonus_expiry_warn_days', '7')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bonus_grants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  remaining numeric(10,2) NOT NULL CHECK (remaining >= 0),
  source text NOT NULL,
  reference_id text,
  expires_at timestamptz NOT NULL,
  expired_amount numeric(10,2) NOT NULL DEFAULT 0,
  warned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bonus_grants_open_idx ON public.bonus_grants(wallet_id, expires_at) WHERE remaining > 0;
ALTER TABLE public.bonus_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bonus grants" ON public.bonus_grants FOR SELECT
  USING (wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.bonus_grants FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_bonus_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _days int := public.setting_num('bonus_expiry_days', 90)::int; _left numeric; g record; _take numeric;
BEGIN
  IF NEW.type = 'credit' AND NEW.amount > 0 AND NEW.description LIKE 'bonus:%' THEN
    IF _days > 0 THEN
      INSERT INTO public.bonus_grants(wallet_id, amount, remaining, source, reference_id, expires_at)
      VALUES (NEW.wallet_id, NEW.amount, NEW.amount, NEW.description, NEW.reference_id, NEW.created_at + make_interval(days => _days));
    END IF;
  ELSIF NEW.type = 'refund' AND NEW.amount < 0 AND NEW.description LIKE 'refund:%' THEN
    -- a refunded pack takes its bonus back with it
    UPDATE public.bonus_grants SET remaining = 0 WHERE wallet_id = NEW.wallet_id AND reference_id = NEW.reference_id;
  ELSIF NEW.type = 'debit' AND NEW.amount < 0 AND COALESCE(NEW.description, '') <> 'bonus_expired' THEN
    _left := -NEW.amount;
    FOR g IN SELECT id, remaining FROM public.bonus_grants WHERE wallet_id = NEW.wallet_id AND remaining > 0 AND expires_at > now()
      ORDER BY expires_at, id FOR UPDATE LOOP
      EXIT WHEN _left <= 0;
      _take := least(g.remaining, _left);
      UPDATE public.bonus_grants SET remaining = remaining - _take WHERE id = g.id;
      _left := _left - _take;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bonus_ledger ON public.wallet_transactions;
CREATE TRIGGER bonus_ledger AFTER INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.trg_bonus_ledger();

-- Expire: remove min(remaining, balance) — never take the balance below zero, never touch paid credits.
CREATE OR REPLACE FUNCTION public.bonus_expire() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; _bal numeric; _amt numeric; _n int := 0; _total numeric := 0; _warned int := 0; _uid uuid;
  _warn int := public.setting_num('bonus_expiry_warn_days', 7)::int;
BEGIN
  FOR g IN SELECT * FROM public.bonus_grants WHERE remaining > 0 AND expires_at <= now() ORDER BY wallet_id, expires_at FOR UPDATE LOOP
    SELECT balance INTO _bal FROM public.wallets WHERE id = g.wallet_id FOR UPDATE;
    _amt := least(g.remaining, greatest(COALESCE(_bal, 0), 0));
    IF _amt > 0 THEN
      UPDATE public.wallets SET balance = balance - _amt, updated_at = now() WHERE id = g.wallet_id;
      INSERT INTO public.wallet_transactions(wallet_id, type, amount, description, reference_id)
      VALUES (g.wallet_id, 'debit', -_amt, 'bonus_expired', g.id::text);
    END IF;
    UPDATE public.bonus_grants SET remaining = 0, expired_amount = _amt WHERE id = g.id;
    _n := _n + 1; _total := _total + _amt;
  END LOOP;
  -- heads-up push a week before (best effort; notify() respects the user's preferences)
  FOR g IN SELECT b.*, w.user_id FROM public.bonus_grants b JOIN public.wallets w ON w.id = b.wallet_id
    WHERE b.remaining > 0 AND b.warned_at IS NULL AND b.expires_at <= now() + make_interval(days => _warn) LOOP
    BEGIN
      PERFORM public.notify(g.user_id, 'payment.bonus_expiring', jsonb_build_object('amount', g.remaining, 'date', to_char(g.expires_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon')),
        '/wallet', 'bonus-' || g.id, NULL, 'bonus-' || g.id);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    UPDATE public.bonus_grants SET warned_at = now() WHERE id = g.id;
    _warned := _warned + 1;
  END LOOP;
  RETURN jsonb_build_object('expired_grants', _n, 'expired_credits', _total, 'warned', _warned);
END $$;
REVOKE ALL ON FUNCTION public.bonus_expire(), public.trg_bonus_ledger() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_bonus() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', COALESCE(sum(b.remaining), 0),
    'next_amount', (SELECT b2.remaining FROM public.bonus_grants b2 WHERE b2.wallet_id = w.id AND b2.remaining > 0 AND b2.expires_at > now() ORDER BY b2.expires_at LIMIT 1),
    'next_expires_at', min(b.expires_at),
    'expiry_days', public.setting_num('bonus_expiry_days', 90))
  FROM public.wallets w LEFT JOIN public.bonus_grants b ON b.wallet_id = w.id AND b.remaining > 0 AND b.expires_at > now()
  WHERE w.user_id = auth.uid() GROUP BY w.id $$;
REVOKE ALL ON FUNCTION public.my_bonus() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_bonus() TO authenticated;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bonus-expire';
  PERFORM cron.schedule('bonus-expire', '0 19 * * *', 'SELECT public.bonus_expire()'); -- 00:30 IST
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable (%)', SQLERRM;
END $$;
