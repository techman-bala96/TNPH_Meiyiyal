BEGIN;
-- M10: nearest-first search, auto request cascade, one ring per worker, missed rings → offline,
-- paid messages (+ refunds, limits, mute, hold), session presence pause/resume/drop, early-end refund, RLS.
SELECT set_config('meiyiyal.trusted','on', true);
UPDATE public.workers SET status='rejected', is_active=false, is_verified=false, is_online=false;  -- isolate (rolled back)
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-0000000a1001','n10u1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000a1002','n10u2@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000a2001','n10w1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000a2002','n10w2@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000a2003','n10w3@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000a2004','n10w4@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000a2005','n10w5@test.local','authenticated','authenticated');
UPDATE public.profiles SET full_name = CASE user_id WHEN '00000000-0000-0000-0000-0000000a1001' THEN 'Meena Sundaram' ELSE 'Ravi Kumar' END,
  prefs = '{"notify":{"quiet":{"on":false}}}' WHERE user_id::text LIKE '00000000-0000-0000-0000-0000000a%';
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, is_active, is_verified, decided_at, base_geog, district_slug, years_experience, is_online, last_seen_at) VALUES
 ('00000000-0000-0000-0000-0000000b1001','00000000-0000-0000-0000-0000000a2001','Dr. Near','professionals--doctor--allopathy--paediatrics','approved',true,true,now(),'POINT(80.2746 13.03)','chennai',5,true,now()),
 ('00000000-0000-0000-0000-0000000b1002','00000000-0000-0000-0000-0000000a2002','Dr. Five','professionals--doctor--allopathy--paediatrics','approved',true,true,now(),'POINT(80.3161 13.03)','chennai',5,true,now()),
 ('00000000-0000-0000-0000-0000000b1003','00000000-0000-0000-0000-0000000a2003','Dr. Ten','professionals--doctor--allopathy--paediatrics','approved',true,true,now(),'POINT(80.3623 13.03)','chennai',5,true,now()),
 ('00000000-0000-0000-0000-0000000b1004','00000000-0000-0000-0000-0000000a2004','Dr. Offline','professionals--doctor--allopathy--paediatrics','approved',true,true,now(),'POINT(80.2885 13.03)','chennai',5,false,now()),
 ('00000000-0000-0000-0000-0000000b1005','00000000-0000-0000-0000-0000000a2005','Dr. Far','professionals--doctor--allopathy--paediatrics','approved',true,true,now(),'POINT(81.19 13.03)','chennai',5,true,now());
INSERT INTO public.worker_nodes(worker_id, node_slug, is_primary) SELECT id, primary_node, true FROM public.workers WHERE id::text LIKE '00000000-0000-0000-0000-0000000b10%';
UPDATE public.wallets SET balance = 1000 WHERE user_id IN ('00000000-0000-0000-0000-0000000a1001','00000000-0000-0000-0000-0000000a1002');
INSERT INTO public.wallets(user_id, balance) SELECT u, 1000 FROM unnest(ARRAY['00000000-0000-0000-0000-0000000a1001','00000000-0000-0000-0000-0000000a1002']::uuid[]) u ON CONFLICT (user_id) DO UPDATE SET balance = 1000;
SELECT set_config('meiyiyal.trusted','off', true);
CREATE FUNCTION pg_temp.as_(_u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',_u,'role','authenticated')::text, true) $$;
CREATE FUNCTION pg_temp.n(_u text, _kind text) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.notifications WHERE user_id = _u::uuid AND kind = _kind $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;
CREATE TEMP TABLE ids(k text PRIMARY KEY, v uuid); GRANT ALL ON ids TO authenticated;
CREATE FUNCTION pg_temp.id(_k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = _k $$;
CREATE FUNCTION pg_temp.put(_k text, _v uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO ids VALUES (_k,_v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;
-- node shorthand
CREATE FUNCTION pg_temp.paed() RETURNS text LANGUAGE sql AS $$ SELECT 'professionals--doctor--allopathy--paediatrics' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- ---------- search order + privacy ----------
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE names text[]; av text[]; km double precision[]; BEGIN
  SELECT array_agg(display_name), array_agg(availability), array_agg(distance_km) INTO names, av, km FROM public.search_workers(pg_temp.paed(), 13.03, 80.27);
  IF names <> ARRAY['Dr. Near','Dr. Five','Dr. Ten','Dr. Offline'] THEN RAISE EXCEPTION 'FAIL: order %', names; END IF;
  IF av <> ARRAY['available','available','available','offline'] THEN RAISE EXCEPTION 'FAIL: groups %', av; END IF;
  IF km <> ARRAY[0,5,10,2]::double precision[] THEN RAISE EXCEPTION 'FAIL: rounded km %', km; END IF;
  RAISE NOTICE 'PASS: available nearest-first, then offline; 50 km radius; distance "< 1 km" or whole km';
END $$;

-- ---------- one ring per worker; a ringing worker shows busy ----------
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
SELECT pg_temp.put('r_u2', public.request_create('00000000-0000-0000-0000-0000000b1001','chat'));
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE names text[]; BEGIN
  SELECT array_agg(display_name) INTO names FROM public.search_workers(pg_temp.paed(), 13.03, 80.27);
  IF names <> ARRAY['Dr. Five','Dr. Ten','Dr. Near','Dr. Offline'] THEN RAISE EXCEPTION 'FAIL: ringing worker not busy %', names; END IF;
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-0000000b1001','chat'); RAISE EXCEPTION 'FAIL: second ring on same worker';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'worker busy' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: one ring per worker; a ringing worker is listed as busy';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
SELECT public.request_cancel(pg_temp.id('r_u2'));

-- ---------- auto request: nearest first, decline → next, timeout → next, accept → matched ----------
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE v jsonb; BEGIN
  v := public.search_start(pg_temp.paed(), 'chat', 13.03, 80.27);
  PERFORM pg_temp.put('s1', (v->>'id')::uuid);
  IF v->>'status' <> 'searching' OR v#>>'{current,worker,name}' <> 'Dr. Near' OR (v->>'attempts')::int <> 1 THEN RAISE EXCEPTION 'FAIL: start %', v; END IF;
  IF (v#>>'{current,expires_at}')::timestamptz <> now() + interval '30 seconds' THEN RAISE EXCEPTION 'FAIL: auto ring is not 30 s'; END IF;
  BEGIN PERFORM public.search_start(pg_temp.paed(), 'chat', 13.03, 80.27); RAISE EXCEPTION 'FAIL: two searches';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%search running%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-0000000b1003','chat'); RAISE EXCEPTION 'FAIL: manual ring during search';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  RAISE NOTICE 'PASS: search rings the nearest available first, 30 s, one search at a time';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2001');
SELECT public.request_respond((SELECT id FROM public.consult_requests WHERE search_id = pg_temp.id('s1') AND status='ringing'), false);
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE v jsonb; BEGIN
  v := public.search_tick(pg_temp.id('s1'));
  IF v#>>'{current,worker,name}' <> 'Dr. Five' OR (v->>'attempts')::int <> 2 THEN RAISE EXCEPTION 'FAIL: decline did not move on %', v; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001', 'request.declined') <> 0 THEN RAISE EXCEPTION 'FAIL: user pushed for each hop'; END IF;
  RAISE NOTICE 'PASS: decline → next nearest, no per-hop push';
END $$;
RESET role;
UPDATE public.consult_requests SET expires_at = now() - interval '1 second' WHERE search_id = pg_temp.id('s1') AND status='ringing';
SET LOCAL role authenticated;
DO $$ DECLARE v jsonb; BEGIN
  v := public.search_tick(pg_temp.id('s1'));
  IF v#>>'{current,worker,name}' <> 'Dr. Ten' THEN RAISE EXCEPTION 'FAIL: timeout did not move on %', v; END IF;
  IF jsonb_array_length(v->'tried') <> 3 OR v#>>'{tried,0,name}' <> 'Dr. Near' THEN RAISE EXCEPTION 'FAIL: tried list %', v->'tried'; END IF;
  IF (SELECT missed_streak FROM public.workers WHERE id='00000000-0000-0000-0000-0000000b1002') <> 1 THEN RAISE EXCEPTION 'FAIL: missed streak'; END IF;
  RAISE NOTICE 'PASS: no answer in 30 s → next; missed-ring streak counted';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2003');
SELECT pg_temp.put('sess1', public.request_respond((SELECT id FROM public.consult_requests WHERE search_id = pg_temp.id('s1') AND status='ringing'), true));
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE v jsonb; BEGIN
  v := public.search_tick(pg_temp.id('s1'));
  IF v->>'status' <> 'matched' OR (v->>'session_id')::uuid <> pg_temp.id('sess1') THEN RAISE EXCEPTION 'FAIL: matched %', v; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001', 'request.accepted') <> 1 THEN RAISE EXCEPTION 'FAIL: accepted push'; END IF;
  RAISE NOTICE 'PASS: accept → search matched with the session';
END $$;

-- ---------- cap of N per round, then "try more", then nobody left ----------
RESET role;
UPDATE public.app_settings SET value = '2' WHERE key = 'auto_request_max';
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
SELECT pg_temp.put('s2', (public.search_start(pg_temp.paed(), 'voice', 13.03, 80.27)->>'id')::uuid);
DO $$ DECLARE v jsonb; i int; BEGIN
  FOR i IN 1..2 LOOP
    v := public.search_tick(pg_temp.id('s2'));
    IF v#>>'{current,worker,name}' = 'Dr. Ten' THEN RAISE EXCEPTION 'FAIL: rang a worker who is in a session'; END IF;
    PERFORM set_config('test.rid', v#>>'{current,request_id}', true);
    EXECUTE 'RESET role';
    UPDATE public.consult_requests SET expires_at = now() - interval '1 second' WHERE id = current_setting('test.rid')::uuid;
    EXECUTE 'SET LOCAL role authenticated';
  END LOOP;
  v := public.search_tick(pg_temp.id('s2'));
  IF v->>'status' <> 'exhausted' OR v->>'reason' <> 'cap' OR pg_temp.n('00000000-0000-0000-0000-0000000a1002','search.exhausted') <> 1 THEN RAISE EXCEPTION 'FAIL: cap %', v; END IF;
  v := public.search_continue(pg_temp.id('s2'));
  IF v->>'status' <> 'exhausted' OR v->>'reason' <> 'none_left' THEN RAISE EXCEPTION 'FAIL: none left %', v; END IF;
  v := public.search_cancel(pg_temp.id('s2'));
  IF v->>'status' <> 'cancelled' THEN RAISE EXCEPTION 'FAIL: cancel'; END IF;
  RAISE NOTICE 'PASS: stops after the cap and asks; "try more" continues; then reports nobody left';
END $$;

-- ---------- 3 missed rings in a row → Offline + push ----------
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ BEGIN
  IF (SELECT missed_streak FROM public.workers WHERE id='00000000-0000-0000-0000-0000000b1002') <> 2 THEN RAISE EXCEPTION 'FAIL: streak before'; END IF;
END $$;
RESET role;
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
VALUES ('00000000-0000-0000-0000-0000000a1001','00000000-0000-0000-0000-0000000b1002','00000000-0000-0000-0000-0000000a2002',pg_temp.paed(),'chat',10,5,'Meena', now() - interval '1 second');
SELECT set_config('meiyiyal.trusted','off', true);
SELECT public.request_expire_due();
DO $$ BEGIN
  IF (SELECT is_online FROM public.workers WHERE id='00000000-0000-0000-0000-0000000b1002') THEN RAISE EXCEPTION 'FAIL: still online after 3 misses'; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a2002','worker.auto_offline') <> 1 THEN RAISE EXCEPTION 'FAIL: auto-offline push'; END IF;
  RAISE NOTICE 'PASS: 3 missed rings → Offline with a push';
END $$;

-- ---------- ask again: wait a minute, at most twice in 30 min ----------
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
SELECT pg_temp.put('r_again', public.request_create('00000000-0000-0000-0000-0000000b1001','chat'));
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2001');
SELECT public.request_respond(pg_temp.id('r_again'), false);
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
DO $$ BEGIN
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-0000000b1001','chat'); RAISE EXCEPTION 'FAIL: asked again at once';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%wait a minute%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: asking the same person again waits a minute';
END $$;

-- ---------- paid messages ----------
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE m uuid; b numeric; BEGIN
  SELECT balance INTO b FROM public.wallets WHERE user_id = auth.uid();
  m := public.worker_message_send('00000000-0000-0000-0000-0000000b1004', 'Call me on 98765 43210 or mail a@b.com, my child has fever');
  PERFORM pg_temp.put('m1', m);
  IF (SELECT balance FROM public.wallets WHERE user_id = auth.uid()) <> b - 5 THEN RAISE EXCEPTION 'FAIL: message cost'; END IF;
  IF (SELECT body FROM public.worker_messages WHERE id = m) <> 'Call me on ••• or mail •••, my child has fever' THEN RAISE EXCEPTION 'FAIL: contact not masked: %', (SELECT body FROM public.worker_messages WHERE id = m); END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a2004','worker.message') <> 1 THEN RAISE EXCEPTION 'FAIL: worker push'; END IF;
  PERFORM pg_temp.put('m2', public.worker_message_send('00000000-0000-0000-0000-0000000b1004', 'second'));
  PERFORM public.worker_message_send('00000000-0000-0000-0000-0000000b1004', 'third');
  BEGIN PERFORM public.worker_message_send('00000000-0000-0000-0000-0000000b1004', 'fourth'); RAISE EXCEPTION 'FAIL: 4th message';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'daily message limit%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.worker_messages(user_id, worker_id, worker_user_id, body, credits) VALUES (auth.uid(), '00000000-0000-0000-0000-0000000b1004','00000000-0000-0000-0000-0000000a2004','free',0);
    RAISE EXCEPTION 'FAIL: direct insert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: message costs 5, contact details masked, 3 per worker per day, no direct writes';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.worker_messages) OR EXISTS (SELECT 1 FROM public.my_worker_messages()) OR EXISTS (SELECT 1 FROM public.consult_searches WHERE user_id <> auth.uid()) THEN RAISE EXCEPTION 'FAIL: others read messages/searches'; END IF;
  RAISE NOTICE 'PASS: messages and searches are private';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2004');
DO $$ DECLARE r jsonb; BEGIN
  IF (SELECT count(*) FROM public.my_worker_messages() WHERE role = 'worker') <> 3 THEN RAISE EXCEPTION 'FAIL: worker inbox'; END IF;
  r := public.worker_message_respond(pg_temp.id('m1'));
  IF NOT (SELECT is_online FROM public.workers WHERE id = '00000000-0000-0000-0000-0000000b1004') THEN RAISE EXCEPTION 'FAIL: respond sets online'; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001','worker.available_for_you') <> 1 THEN RAISE EXCEPTION 'FAIL: available push'; END IF;
  PERFORM public.worker_mute_user(pg_temp.id('m2'));
  RAISE NOTICE 'PASS: "I''m available now" → online + push to the user';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1002');
DO $$ BEGIN
  IF (SELECT availability FROM public.search_workers(pg_temp.paed(), 13.03, 80.27) WHERE display_name = 'Dr. Offline') <> 'busy' THEN RAISE EXCEPTION 'FAIL: held worker not busy for others'; END IF;
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-0000000b1004','chat'); RAISE EXCEPTION 'FAIL: other user took the held slot';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'worker busy' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: the slot is held for the user who messaged';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ BEGIN
  BEGIN PERFORM public.worker_message_send('00000000-0000-0000-0000-0000000b1004', 'muted?'); RAISE EXCEPTION 'FAIL: mute ignored';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%not taking messages%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: muted users cannot message';
END $$;
RESET role;
UPDATE public.worker_messages SET created_at = created_at - interval '25 hours' WHERE worker_id = '00000000-0000-0000-0000-0000000b1004';
DO $$ DECLARE b numeric := (SELECT balance FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-0000000a1001'); n int; BEGIN
  n := public.worker_message_refund_due();
  IF n <> 2 OR (SELECT balance FROM public.wallets WHERE user_id = '00000000-0000-0000-0000-0000000a1001') <> b + 10 THEN RAISE EXCEPTION 'FAIL: refunds % %', n, b; END IF;
  IF (SELECT status FROM public.worker_messages WHERE id = pg_temp.id('m1')) <> 'responded' THEN RAISE EXCEPTION 'FAIL: answered message refunded'; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001','worker.message_refunded') <> 2 THEN RAISE EXCEPTION 'FAIL: refund push'; END IF;
  RAISE NOTICE 'PASS: unanswered messages refunded after 24 h; answered ones kept';
END $$;

-- ---------- presence: pause on drop, ask to continue, end after 3 min ----------
-- sess1: Meena (user) ↔ Dr. Ten. Meena's app went silent 40 s ago.
UPDATE public.consult_sessions SET user_seen_at = now() - interval '40 seconds', worker_seen_at = now() WHERE id = pg_temp.id('sess1');
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2003');
DO $$ DECLARE r jsonb; used numeric; BEGIN
  r := public.session_tick(pg_temp.id('sess1'));
  IF NOT (r->>'paused')::boolean OR r->>'pause_side' <> 'user' OR (r->>'other_here')::boolean THEN RAISE EXCEPTION 'FAIL: pause %', r; END IF;
  used := (r->>'credits_used')::numeric;
  r := public.session_tick(pg_temp.id('sess1'));
  IF (r->>'credits_used')::numeric <> used THEN RAISE EXCEPTION 'FAIL: billed while paused'; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001','session.resume_ask') <> 1 THEN RAISE EXCEPTION 'FAIL: resume push to the silent side'; END IF;
  BEGIN PERFORM public.call_start(pg_temp.id('sess1'), 'voice'); RAISE EXCEPTION 'FAIL: call while paused';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'session paused%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: silent 30 s → paused, no billing, silent side pushed';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE r jsonb; BEGIN
  r := public.session_tick(pg_temp.id('sess1'));
  IF NOT (r->>'resume_ask')::boolean THEN RAISE EXCEPTION 'FAIL: both back but not asked %', r; END IF;
  r := public.session_resume_answer(pg_temp.id('sess1'), true);
  IF NOT (r->>'paused')::boolean OR NOT (r->>'my_answer')::boolean THEN RAISE EXCEPTION 'FAIL: one yes resumed %', r; END IF;
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2003');
DO $$ DECLARE r jsonb; BEGIN
  r := public.session_resume_answer(pg_temp.id('sess1'), true);
  IF (r->>'paused')::boolean OR r->>'status' <> 'active' THEN RAISE EXCEPTION 'FAIL: both yes %', r; END IF;
  IF (SELECT count(*) FROM public.session_segments WHERE session_id = pg_temp.id('sess1') AND ended_at IS NULL) <> 1 THEN RAISE EXCEPTION 'FAIL: new segment'; END IF;
  RAISE NOTICE 'PASS: both say continue → billing resumes on a new segment';
END $$;
RESET role;
UPDATE public.consult_sessions SET paused_at = now() - interval '4 minutes', pause_side = 'worker', worker_seen_at = now() - interval '4 minutes', user_seen_at = now(),
  started_at = now() - interval '10 minutes' WHERE id = pg_temp.id('sess1');
UPDATE public.session_segments SET ended_at = now() - interval '4 minutes' WHERE session_id = pg_temp.id('sess1') AND ended_at IS NULL;
SELECT public.session_presence_sweep();
DO $$ DECLARE s public.consult_sessions; BEGIN
  SELECT * INTO s FROM public.consult_sessions WHERE id = pg_temp.id('sess1');
  IF s.status <> 'ended' OR s.end_reason <> 'dropped' OR s.ended_at <> s.paused_at THEN RAISE EXCEPTION 'FAIL: drop end % % %', s.status, s.end_reason, s.ended_at; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001','session.dropped') <> 1 THEN RAISE EXCEPTION 'FAIL: drop push'; END IF;
  RAISE NOTICE 'PASS: nobody back in 3 min → ended at the drop time, both told';
END $$;
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
DO $$ DECLARE i jsonb := public.session_info(pg_temp.id('sess1')); BEGIN
  IF (i->>'reconnect_until')::timestamptz IS NULL OR (i->>'worker_id')::uuid <> '00000000-0000-0000-0000-0000000b1003' THEN RAISE EXCEPTION 'FAIL: reconnect info %', i; END IF;
  RAISE NOTICE 'PASS: dropped session offers a 10-minute reconnect';
END $$;

-- ---------- worker ends early without helping → full refund + no-show ----------
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a1001');
SELECT pg_temp.put('r_early', public.request_create('00000000-0000-0000-0000-0000000b1003','chat'));
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2003');
SELECT pg_temp.put('sess2', public.request_respond(pg_temp.id('r_early'), true));
DO $$ DECLARE r jsonb; BEGIN
  r := public.session_end(pg_temp.id('sess2'));
  IF r->>'end_reason' <> 'early_end' OR (r->>'credits_used')::numeric <> 0 OR (r->>'refunded')::numeric <= 0 THEN RAISE EXCEPTION 'FAIL: early end %', r; END IF;
  RAISE NOTICE 'PASS: worker ended within 2 min without a reply → full refund';
END $$;
RESET role;
DO $$ BEGIN
  IF (SELECT noshow_count FROM public.workers WHERE id = '00000000-0000-0000-0000-0000000b1003') <> 1 THEN RAISE EXCEPTION 'FAIL: no-show count'; END IF;
  IF (SELECT sum(net) FROM public.worker_earnings WHERE session_id = pg_temp.id('sess2')) <> 0 THEN RAISE EXCEPTION 'FAIL: earnings not reversed'; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-0000000a1001','session.early_end') <> 1 THEN RAISE EXCEPTION 'FAIL: early-end push'; END IF;
  RAISE NOTICE 'PASS: no-show counted, earnings reversed, user told';
END $$;

-- ---------- workers cannot move their own pin or fake presence ----------
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-0000000a2001');
DO $$ BEGIN
  BEGIN UPDATE public.workers SET base_geog = 'POINT(80.27 13.03)' WHERE user_id = auth.uid(); RAISE EXCEPTION 'FAIL: moved own pin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.workers SET missed_streak = 0, last_seen_at = now() + interval '1 day' WHERE user_id = auth.uid(); RAISE EXCEPTION 'FAIL: faked presence';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: location and presence fields are server-only';
END $$;
RESET role;
SET LOCAL role anon;
DO $$ BEGIN
  BEGIN PERFORM public.search_start(pg_temp.paed(), 'chat', 13.03, 80.27); RAISE EXCEPTION 'FAIL: anon search_start';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: auto request needs sign-in';
END $$;
ROLLBACK;
