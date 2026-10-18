BEGIN;
-- M10 bug repro: an abandoned session must not keep billing the user for time nobody was there.
-- Uses only M3 APIs, so it runs on the old schema (where it FAILS) and on M10 (where it passes).
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000c101','gapuser@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000c102','gapworker@test.local','authenticated','authenticated');
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, is_active, is_verified, decided_at, base_geog, district_slug, is_online, last_seen_at) VALUES
 ('00000000-0000-0000-0000-00000000c112','00000000-0000-0000-0000-00000000c102','Adv. Gap','professionals--lawyer--civil','approved',true,true,now(),'POINT(80.27 13.03)','chennai',true,now());
SELECT public.wallet_id_for('00000000-0000-0000-0000-00000000c101');
UPDATE public.wallets SET balance = 500 WHERE user_id = '00000000-0000-0000-0000-00000000c101';
-- a chat session that started 20 minutes ago; the user never came back after it started (phone died)
INSERT INTO public.consult_sessions(id, user_id, worker_id, worker_user_id, node_slug, current_mode, commission_pct, started_at) VALUES
 ('00000000-0000-0000-0000-00000000c1a1','00000000-0000-0000-0000-00000000c101','00000000-0000-0000-0000-00000000c112','00000000-0000-0000-0000-00000000c102',
  'professionals--lawyer--civil','chat',18, now() - interval '20 minutes');
INSERT INTO public.session_segments(session_id, mode, rate, started_at) VALUES ('00000000-0000-0000-0000-00000000c1a1','chat',10, now() - interval '20 minutes');
SELECT set_config('meiyiyal.trusted','off', true);
CREATE FUNCTION pg_temp.as_(_u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',_u,'role','authenticated')::text, true) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;
SET LOCAL role authenticated;
-- the worker left the chat screen open; their app ticks now
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000c102');
SELECT public.session_tick('00000000-0000-0000-0000-00000000c1a1');
RESET role;
DO $$ DECLARE _used numeric; _bal numeric; BEGIN
  SELECT credits_used INTO _used FROM public.consult_sessions WHERE id = '00000000-0000-0000-0000-00000000c1a1';
  SELECT balance INTO _bal FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-00000000c101';
  -- before the fix: 20 minutes x 10 = 200 credits charged for a dead session
  IF _used > 10 OR _bal < 490 THEN RAISE EXCEPTION 'FAIL: abandoned session billed % credits (balance %)', _used, _bal; END IF;
  RAISE NOTICE 'PASS: abandoned session not billed for dead time (charged %)', _used;
END $$;
ROLLBACK;
