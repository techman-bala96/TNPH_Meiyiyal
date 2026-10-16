BEGIN;
INSERT INTO auth.users(id,email,aud,role) VALUES
 ('00000000-0000-0000-0000-00000000c001','u@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000c002','law@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000c003','x@test.local','authenticated','authenticated');
SELECT set_config('meiyiyal.trusted','on',true);
INSERT INTO public.workers(id,user_id,display_name,primary_node,status,is_active,is_verified,is_online,last_seen_at,base_geog,district_slug,years_experience)
VALUES ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-00000000c002','Adv T','professionals--lawyer--property-land','approved',true,true,true,now(),'POINT(80.27 13.03)','chennai',10);
SELECT set_config('meiyiyal.trusted','off',true);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}',true);
DO $$ BEGIN
  IF (public.rates_for('professionals--lawyer--property-land')->'video'->>'rate')::numeric <> 25 THEN RAISE EXCEPTION 'FAIL: inherited rate'; END IF;
  IF (public.rates_for('professionals--doctor--allopathy--paediatrics')->'chat'->>'rate')::numeric <> 10 THEN RAISE EXCEPTION 'FAIL: specialist rate'; END IF;
  RAISE NOTICE 'PASS: rates from DB, inherited per profession';
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-00000000d002','chat'); RAISE EXCEPTION 'FAIL: no credits';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'insufficient credits%' THEN RAISE; END IF; RAISE NOTICE 'PASS: request needs min-minutes credits'; END;
  BEGIN UPDATE public.wallets SET balance=99999 WHERE user_id=auth.uid(); IF FOUND THEN RAISE EXCEPTION 'FAIL: mint'; END IF; RAISE NOTICE 'PASS: client cannot mint';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: client cannot mint'; END;
  IF public.dev_grant_test_credits() <> 500 THEN RAISE EXCEPTION 'FAIL: test credits'; END IF;
  IF public.dev_grant_test_credits() <> 500 THEN RAISE EXCEPTION 'FAIL: test credits capped'; END IF;
  RAISE NOTICE 'PASS: local test credits are server-granted and capped';
END $$;
DO $$ DECLARE rid uuid; BEGIN
  rid := public.request_create('00000000-0000-0000-0000-00000000d002','chat');
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-00000000d002','voice'); RAISE EXCEPTION 'FAIL: double ring';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: one ringing request at a time'; END;
  BEGIN PERFORM public.request_respond(rid, true); RAISE EXCEPTION 'FAIL: user accepted own';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only the worker can accept'; END;
  PERFORM set_config('test.rid', rid::text, true);
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}',true);
DO $$ DECLARE sid uuid; BEGIN
  IF (SELECT count(*) FROM public.consult_requests WHERE status='ringing') <> 1 THEN RAISE EXCEPTION 'FAIL: worker sees ring'; END IF;
  sid := public.request_respond(current_setting('test.rid')::uuid, true);
  PERFORM set_config('test.sid', sid::text, true);
  RAISE NOTICE 'PASS: worker sees ring + accepts -> session';
  INSERT INTO public.consult_messages(session_id,body) VALUES (sid,'Hello, how can I help?');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.consult_messages) OR EXISTS (SELECT 1 FROM public.consult_sessions) THEN RAISE EXCEPTION 'FAIL: outsider reads'; END IF;
  BEGIN INSERT INTO public.consult_messages(session_id,body) VALUES (current_setting('test.sid')::uuid,'spam'); RAISE EXCEPTION 'FAIL: outsider writes';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: outsider cannot read/write chat'; END;
  BEGIN PERFORM public.session_tick(current_setting('test.sid')::uuid); RAISE EXCEPTION 'FAIL: outsider tick';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: outsider cannot touch session'; END;
END $$;
RESET role;
-- time travel: chat started 3m30s ago -> 4 started minutes x 10 = 40
UPDATE public.session_segments SET started_at = now() - interval '210 seconds' WHERE session_id = current_setting('test.sid')::uuid;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}',true);
DO $$ DECLARE r jsonb; cid uuid; BEGIN
  r := public.session_tick(current_setting('test.sid')::uuid);
  IF (r->>'credits_used')::numeric <> 40 OR (r->>'balance')::numeric <> 460 THEN RAISE EXCEPTION 'FAIL: chat billing %', r; END IF;
  r := public.session_tick(current_setting('test.sid')::uuid);
  IF (r->>'credits_used')::numeric <> 40 THEN RAISE EXCEPTION 'FAIL: tick idempotent'; END IF;
  RAISE NOTICE 'PASS: chat billed per started minute at 10/min, idempotent';
  cid := public.call_start(current_setting('test.sid')::uuid,'video');
  PERFORM set_config('test.cid', cid::text, true);
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}',true);
DO $$ BEGIN
  IF public.call_answer(current_setting('test.cid')::uuid, true) <> 'active' THEN RAISE EXCEPTION 'FAIL: answer'; END IF;
  IF (SELECT current_mode FROM public.consult_sessions WHERE id=current_setting('test.sid')::uuid) <> 'video' THEN RAISE EXCEPTION 'FAIL: mode'; END IF;
  RAISE NOTICE 'PASS: video call answered, mode switched';
END $$;
RESET role;
UPDATE public.session_segments SET started_at = now() - interval '90 seconds' WHERE session_id = current_setting('test.sid')::uuid AND ended_at IS NULL;
SET LOCAL role authenticated;
DO $$ DECLARE r jsonb; earned numeric; h record; BEGIN
  PERFORM public.call_end(current_setting('test.cid')::uuid); -- 2 min video x 25 = 50
  r := public.session_end(current_setting('test.sid')::uuid);
  IF (r->>'credits_used')::numeric <> 100 THEN RAISE EXCEPTION 'FAIL: total % (expect 40 + 50 video + 10 chat)', r->>'credits_used'; END IF;
  SELECT balance INTO earned FROM public.wallets WHERE user_id=auth.uid();
  IF earned <> 82 THEN RAISE EXCEPTION 'FAIL: worker earned % (expect 82 after 18%%)', earned; END IF;
  SELECT * INTO h FROM public.my_history() LIMIT 1;
  IF h.role <> 'worker' OR h.credits <> 100 OR h.modes <> ARRAY['chat','video'] OR h.messages <> 1 THEN RAISE EXCEPTION 'FAIL: history %', h; END IF;
  RAISE NOTICE 'PASS: chat->video->chat billed (100), worker earns 82, history ok';
  BEGIN INSERT INTO public.consult_messages(session_id,body) VALUES (current_setting('test.sid')::uuid,'late'); RAISE EXCEPTION 'FAIL: chat after end';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: no chat after session end'; END;
END $$;
-- credits exhaustion auto-ends
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}',true);
DO $$ DECLARE rid uuid; BEGIN rid := public.request_create('00000000-0000-0000-0000-00000000d002','video'); PERFORM set_config('test.rid2', rid::text, true); END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}',true);
DO $$ BEGIN PERFORM set_config('test.sid2', public.request_respond(current_setting('test.rid2')::uuid, true)::text, true); END $$;
RESET role;
UPDATE public.session_segments SET started_at = now() - interval '2 hours' WHERE session_id = current_setting('test.sid2')::uuid;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}',true);
DO $$ DECLARE r jsonb; BEGIN
  r := public.session_tick(current_setting('test.sid2')::uuid);
  IF r->>'status' <> 'ended' OR r->>'end_reason' <> 'credits_exhausted' OR (r->>'balance')::numeric >= 25 OR (r->>'balance')::numeric < 0 THEN RAISE EXCEPTION 'FAIL: exhaustion %', r; END IF;
  RAISE NOTICE 'PASS: session auto-ends at zero credits, never negative (balance %)', r->>'balance';
END $$;
ROLLBACK;
