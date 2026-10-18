-- M11 bonus-credit expiry. One transaction, rolled back.
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES ('00000000-0000-0000-0000-00000000b801','bonus1@test.local','authenticated','authenticated');
INSERT INTO public.wallets(user_id, balance) SELECT '00000000-0000-0000-0000-00000000b801', 0
  WHERE NOT EXISTS (SELECT 1 FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-00000000b801');
UPDATE public.app_settings SET value = '90' WHERE key = 'bonus_expiry_days';

DO $$ DECLARE _w uuid; r jsonb; _bal numeric; BEGIN
  SELECT id INTO _w FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-00000000b801';
  -- pack: 100 paid + 20 bonus
  UPDATE public.wallets SET balance = 120 WHERE id = _w;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_w,'top_up',100,'pack:p1','o1'), (_w,'credit',20,'bonus:p1','o1');
  IF (SELECT count(*) FROM public.bonus_grants WHERE wallet_id = _w AND remaining = 20 AND expires_at > now() + interval '89 days') <> 1 THEN RAISE EXCEPTION 'FAIL: grant not created'; END IF;
  -- spend 12: bonus used first
  UPDATE public.wallets SET balance = balance - 12 WHERE id = _w;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description) VALUES (_w,'debit',-12,'chat consult 2 min');
  IF (SELECT remaining FROM public.bonus_grants WHERE wallet_id = _w) <> 8 THEN RAISE EXCEPTION 'FAIL: bonus not used first'; END IF;
  -- not yet due: nothing expires
  r := public.bonus_expire();
  IF (r->>'expired_grants')::int <> 0 THEN RAISE EXCEPTION 'FAIL: early expiry %', r; END IF;
  -- due: only the unused 8 go, paid credits stay
  UPDATE public.bonus_grants SET expires_at = now() - interval '1 minute' WHERE wallet_id = _w;
  r := public.bonus_expire();
  SELECT balance INTO _bal FROM public.wallets WHERE id = _w;
  IF _bal <> 100 OR (r->>'expired_credits')::numeric <> 8 THEN RAISE EXCEPTION 'FAIL: expiry bal=% r=%', _bal, r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE wallet_id = _w AND description = 'bonus_expired' AND amount = -8) THEN RAISE EXCEPTION 'FAIL: ledger row'; END IF;
  -- idempotent
  r := public.bonus_expire();
  IF (r->>'expired_grants')::int <> 0 THEN RAISE EXCEPTION 'FAIL: double expiry'; END IF;
  -- never below zero: bonus 10, balance already spent down to 3 via a non-debit path
  UPDATE public.wallets SET balance = 13 WHERE id = _w;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_w,'credit',10,'bonus:p2','o2');
  UPDATE public.wallets SET balance = 3 WHERE id = _w;
  UPDATE public.bonus_grants SET expires_at = now() - interval '1 minute' WHERE reference_id = 'o2';
  PERFORM public.bonus_expire();
  IF (SELECT balance FROM public.wallets WHERE id = _w) <> 0 THEN RAISE EXCEPTION 'FAIL: clamp'; END IF;
  -- refund removes the bonus grant
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_w,'credit',5,'bonus:p3','o3');
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_w,'refund',-105,'refund:p3','o3');
  IF (SELECT remaining FROM public.bonus_grants WHERE reference_id = 'o3') <> 0 THEN RAISE EXCEPTION 'FAIL: refund grant'; END IF;
  -- warning push a week ahead, once
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_w,'credit',7,'bonus:p4','o4');
  UPDATE public.bonus_grants SET expires_at = now() + interval '3 days' WHERE reference_id = 'o4';
  r := public.bonus_expire();
  IF (r->>'warned')::int <> 1 THEN RAISE EXCEPTION 'FAIL: warn %', r; END IF;
  r := public.bonus_expire();
  IF (r->>'warned')::int <> 0 THEN RAISE EXCEPTION 'FAIL: warned twice'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000b801' AND kind = 'payment.bonus_expiring') THEN RAISE EXCEPTION 'FAIL: notification'; END IF;
  -- my_bonus
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000b801","role":"authenticated"}', true);
  r := public.my_bonus();
  IF (r->>'total')::numeric <> 7 OR (r->>'expiry_days')::numeric <> 90 THEN RAISE EXCEPTION 'FAIL: my_bonus %', r; END IF;
  -- 0 days = never: no grant
  UPDATE public.app_settings SET value = '0' WHERE key = 'bonus_expiry_days';
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_w,'credit',9,'bonus:p5','o5');
  IF EXISTS (SELECT 1 FROM public.bonus_grants WHERE reference_id = 'o5') THEN RAISE EXCEPTION 'FAIL: grant with expiry off'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bonus-expire') THEN RAISE EXCEPTION 'FAIL: cron'; END IF;
  RAISE NOTICE 'PASS m11_bonus';
END $$;
ROLLBACK;
