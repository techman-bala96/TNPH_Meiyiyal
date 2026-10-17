BEGIN;
INSERT INTO auth.users(id,email,aud,role) VALUES
 ('00000000-0000-0000-0000-00000000a601','pu@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a602','pw@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a603','pa@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-00000000a603','admin');
SELECT set_config('meiyiyal.trusted','on',true);
INSERT INTO public.workers(id,user_id,display_name,primary_node,status,is_active,is_verified,decided_at,base_geog,district_slug,years_experience)
VALUES ('00000000-0000-0000-0000-00000000b602','00000000-0000-0000-0000-00000000a602','Adv P','professionals--lawyer--property-land','approved',true,true,now(),'POINT(80.27 13.03)','chennai',10);
SELECT set_config('meiyiyal.trusted','off',true);
CREATE FUNCTION pg_temp.as_(_u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',_u,'role','authenticated')::text, true) $$;
CREATE FUNCTION pg_temp.bal(_u uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT COALESCE((SELECT balance FROM public.wallets WHERE user_id=_u),0) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- ---- user: order from DB pack; no client minting
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a601');
DO $$ DECLARE o jsonb; BEGIN
  o := public.payment_order_new('value','mock');
  IF (o->>'amount_paise')::int <> 49900 OR (o->>'gst_paise')::int <> 7612 OR (o->>'credits')::numeric <> 499 OR (o->>'bonus')::numeric <> 31 OR o->>'status' <> 'created' THEN RAISE EXCEPTION 'FAIL: order amounts %', o; END IF;
  RAISE NOTICE 'PASS: order amount/GST/credits come from the DB pack (₹499 → 499+31, GST ₹76.12 incl.)';
  PERFORM set_config('test.o1', o->>'id', true);
  BEGIN PERFORM public.payment_order_new('nope','mock'); RAISE EXCEPTION 'FAIL: unknown pack';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: unknown/inactive pack rejected'; END;
  BEGIN PERFORM public.payment_mark_paid('x','y','client'); RAISE EXCEPTION 'FAIL: client mark paid';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot call payment_mark_paid'; END;
  BEGIN PERFORM public.payment_order_attach(current_setting('test.o1')::uuid,'order_x'); RAISE EXCEPTION 'FAIL: client attach';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot attach provider order ids'; END;
  BEGIN PERFORM public.payment_event_once('e','mock','payment.captured',NULL,'{}'); RAISE EXCEPTION 'FAIL: client event';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot inject webhook events'; END;
  BEGIN UPDATE public.payment_orders SET status='paid' WHERE id=current_setting('test.o1')::uuid; RAISE EXCEPTION 'FAIL: client update order';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot update orders'; END;
  BEGIN INSERT INTO public.wallet_transactions(wallet_id,type,amount) SELECT id,'top_up',1000 FROM public.wallets WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: client ledger';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot write the ledger'; END;
  BEGIN UPDATE public.wallets SET balance=99999 WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: client balance';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot set wallet balance'; END;
  BEGIN INSERT INTO public.credit_packs(id,name_i18n,price_inr,credits) VALUES ('free','{"en":"x"}',1,100000); RAISE EXCEPTION 'FAIL: client pack';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot create packs'; END;
  BEGIN PERFORM public.admin_upsert_pack('free','{"en":"x"}',99,99,0,9,true,false); RAISE EXCEPTION 'FAIL: non-admin pack';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: non-admin cannot edit packs'; END;
END $$;
RESET role;

-- ---- server: verify/webhook crediting is idempotent
DO $$ DECLARE r jsonb; b0 numeric := pg_temp.bal('00000000-0000-0000-0000-00000000a601'); BEGIN
  PERFORM public.payment_order_attach(current_setting('test.o1')::uuid,'order_t1');
  r := public.payment_mark_paid('order_t1','pay_t1','verify');
  IF NOT (r->>'credited')::boolean OR pg_temp.bal('00000000-0000-0000-0000-00000000a601') <> b0 + 530 THEN RAISE EXCEPTION 'FAIL: credit %', r; END IF;
  IF (SELECT count(*) FROM public.wallet_transactions t JOIN public.wallets w ON w.id=t.wallet_id WHERE w.user_id='00000000-0000-0000-0000-00000000a601' AND reference_id=current_setting('test.o1')) <> 2 THEN RAISE EXCEPTION 'FAIL: ledger rows'; END IF;
  RAISE NOTICE 'PASS: verified payment credits 499 paid + 31 bonus with 2 ledger rows';
  r := public.payment_mark_paid('order_t1','pay_t1','webhook');
  IF (r->>'credited')::boolean OR NOT (r->>'duplicate')::boolean OR pg_temp.bal('00000000-0000-0000-0000-00000000a601') <> b0 + 530 THEN RAISE EXCEPTION 'FAIL: double credit %', r; END IF;
  RAISE NOTICE 'PASS: webhook after verify does not double-credit';
  IF NOT public.payment_event_once('evt_1','mock','payment.captured','order_t1','{}') OR public.payment_event_once('evt_1','mock','payment.captured','order_t1','{}') THEN RAISE EXCEPTION 'FAIL: event dedupe'; END IF;
  RAISE NOTICE 'PASS: duplicate webhook event id is detected';
  IF public.payment_mark_failed('order_t1','late failure') IS NOT NULL OR (SELECT status FROM public.payment_orders WHERE provider_order_id='order_t1') <> 'paid' THEN RAISE EXCEPTION 'FAIL: failure overwrote paid'; END IF;
  RAISE NOTICE 'PASS: a late failure event cannot undo a paid order';
END $$;

-- ---- cancel / fail
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a601');
DO $$ DECLARE o jsonb; BEGIN
  o := public.payment_order_new('starter','mock'); PERFORM set_config('test.o2', o->>'id', true);
  IF public.payment_order_cancel((o->>'id')::uuid) <> 'cancelled' THEN RAISE EXCEPTION 'FAIL: cancel'; END IF;
  IF public.payment_order_cancel(current_setting('test.o1')::uuid) <> 'paid' THEN RAISE EXCEPTION 'FAIL: cancel paid'; END IF;
  RAISE NOTICE 'PASS: user can cancel an unpaid order but not a paid one';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a602');
DO $$ BEGIN
  IF public.payment_order_cancel(current_setting('test.o1')::uuid) IS NOT NULL OR (SELECT count(*) FROM public.payment_orders WHERE user_id='00000000-0000-0000-0000-00000000a601') <> 0 THEN RAISE EXCEPTION 'FAIL: cross-user'; END IF;
  RAISE NOTICE 'PASS: orders are private to their owner';
END $$;
RESET role;
DO $$ DECLARE b0 numeric := pg_temp.bal('00000000-0000-0000-0000-00000000a601'); BEGIN
  PERFORM public.payment_order_attach(current_setting('test.o2')::uuid,'order_t2');
  IF public.payment_mark_failed('order_t2','declined') <> 'failed' THEN RAISE EXCEPTION 'FAIL: mark failed'; END IF;
  IF pg_temp.bal('00000000-0000-0000-0000-00000000a601') <> b0 THEN RAISE EXCEPTION 'FAIL: failed credited'; END IF;
  RAISE NOTICE 'PASS: failed payment credits nothing';
END $$;

-- ---- commission from config + earnings ledger (worker wallet untouched)
DO $$ DECLARE s uuid; wb numeric := pg_temp.bal('00000000-0000-0000-0000-00000000a602'); e public.worker_earnings; BEGIN
  IF public.commission_for('00000000-0000-0000-0000-00000000b602','professionals--lawyer--property-land') <> 15 THEN RAISE EXCEPTION 'FAIL: new worker 15%%'; END IF;
  SET LOCAL meiyiyal.trusted = 'on'; UPDATE public.workers SET decided_at = now() - interval '60 days' WHERE id='00000000-0000-0000-0000-00000000b602'; SET LOCAL meiyiyal.trusted = 'off';
  IF public.commission_for('00000000-0000-0000-0000-00000000b602','professionals--lawyer--property-land') <> 18 THEN RAISE EXCEPTION 'FAIL: default 18%%'; END IF;
  INSERT INTO public.commission_rules VALUES ('professionals--lawyer',20);
  IF public.commission_for('00000000-0000-0000-0000-00000000b602','professionals--lawyer--property-land') <> 20 THEN RAISE EXCEPTION 'FAIL: rule inherited'; END IF;
  DELETE FROM public.commission_rules;
  RAISE NOTICE 'PASS: commission 15%% new / 18%% default / per-category rule inherited';
  INSERT INTO public.consult_sessions(user_id,worker_id,worker_user_id,node_slug,commission_pct,started_at)
  VALUES ('00000000-0000-0000-0000-00000000a601','00000000-0000-0000-0000-00000000b602','00000000-0000-0000-0000-00000000a602','professionals--lawyer--property-land',18, now()-interval '150 seconds') RETURNING id INTO s;
  INSERT INTO public.session_segments(session_id,mode,rate,started_at) VALUES (s,'chat',10,now()-interval '150 seconds');
  PERFORM public.session_bill_internal(s,true);
  SELECT * INTO e FROM public.worker_earnings WHERE session_id=s;
  IF e.gross <> 30 OR e.net <> 24.60 OR e.commission <> 5.40 OR e.available_at < now() + interval '71 hours' THEN RAISE EXCEPTION 'FAIL: earnings %', row_to_json(e); END IF;
  IF pg_temp.bal('00000000-0000-0000-0000-00000000a602') <> wb THEN RAISE EXCEPTION 'FAIL: worker wallet credited'; END IF;
  RAISE NOTICE 'PASS: billing writes held earnings (30 gross → 24.60 net @18%%), not spendable credits';
END $$;

-- ---- payouts
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a602');
DO $$ DECLARE m jsonb; BEGIN
  m := public.my_earnings();
  IF (m->>'on_hold')::numeric <> 24.60 OR (m->>'available')::numeric <> 0 THEN RAISE EXCEPTION 'FAIL: hold %', m; END IF;
  BEGIN PERFORM public.payout_request(); RAISE EXCEPTION 'FAIL: payout under min';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: earnings on 72h hold; payout below minimum refused'; END;
  BEGIN UPDATE public.worker_earnings SET available_at=now() WHERE worker_user_id=auth.uid(); RAISE EXCEPTION 'FAIL: worker edits earnings';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: worker cannot edit earnings'; END;
END $$;
RESET role;
INSERT INTO public.worker_earnings(worker_user_id,gross,commission_pct,commission,net,available_at) VALUES ('00000000-0000-0000-0000-00000000a602',300,18,54,246,now()-interval '1 day');
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a602');
DO $$ DECLARE r jsonb; BEGIN
  r := public.payout_request();
  IF (r->>'amount')::numeric <> 246 THEN RAISE EXCEPTION 'FAIL: payout amount %', r; END IF;
  BEGIN PERFORM public.payout_request(); RAISE EXCEPTION 'FAIL: second payout';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_payout_decide((r->>'id')::uuid,true,'UTR1',NULL); RAISE EXCEPTION 'FAIL: worker marks paid';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('test.p1', r->>'id', true);
  RAISE NOTICE 'PASS: payout requests only available earnings; one open request; worker cannot mark paid';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a603');
DO $$ BEGIN
  BEGIN PERFORM public.admin_payout_decide(current_setting('test.p1')::uuid,true,'',NULL); RAISE EXCEPTION 'FAIL: no reference';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  IF public.admin_payout_decide(current_setting('test.p1')::uuid,false,NULL,'bank details mismatch') <> 'rejected' THEN RAISE EXCEPTION 'FAIL: reject'; END IF;
  IF (SELECT count(*) FROM public.worker_earnings WHERE payout_id IS NOT NULL AND worker_user_id='00000000-0000-0000-0000-00000000a602') <> 0 THEN RAISE EXCEPTION 'FAIL: reject unlink'; END IF;
  RAISE NOTICE 'PASS: admin reject (reason required) returns earnings to available';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a602');
DO $$ BEGIN PERFORM set_config('test.p2', public.payout_request()->>'id', true); END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a603');
DO $$ DECLARE m jsonb; BEGIN
  IF public.admin_payout_decide(current_setting('test.p2')::uuid,true,'UTR-778899',NULL) <> 'paid' THEN RAISE EXCEPTION 'FAIL: paid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit WHERE action='payout.paid' AND target=current_setting('test.p2')::uuid) THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
  RAISE NOTICE 'PASS: admin marks payout paid with reference (audited)';
  -- refund
  BEGIN PERFORM public.admin_refund(current_setting('test.o1')::uuid,''); RAISE EXCEPTION 'FAIL: refund no reason';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
RESET role;
UPDATE public.wallets SET balance = balance + 30 WHERE user_id='00000000-0000-0000-0000-00000000a601';  -- top back up what the billing test spent
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a603');
DO $$ BEGIN
  BEGIN PERFORM public.admin_refund(current_setting('test.o2')::uuid,'x'); RAISE EXCEPTION 'FAIL: refund failed order';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  PERFORM public.admin_refund(current_setting('test.o1')::uuid,'customer request');
END $$;
RESET role;
DO $$ BEGIN
  IF pg_temp.bal('00000000-0000-0000-0000-00000000a601') <> 0 OR (SELECT status FROM public.payment_orders WHERE id=current_setting('test.o1')::uuid) <> 'refunded' THEN RAISE EXCEPTION 'FAIL: refund'; END IF;
  RAISE NOTICE 'PASS: admin refund reverses the pack credits (audited)';
END $$;
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a602');
DO $$ DECLARE m jsonb; BEGIN
  m := public.my_earnings();
  IF (m->>'paid')::numeric <> 246 OR jsonb_array_length(m->'weeks') < 1 THEN RAISE EXCEPTION 'FAIL: my_earnings %', m; END IF;
  RAISE NOTICE 'PASS: earnings summary with weekly ledger + payout history';
END $$;
ROLLBACK;
