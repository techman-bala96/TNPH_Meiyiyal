BEGIN;
INSERT INTO auth.users(id,email,aud,role) VALUES
 ('00000000-0000-0000-0000-00000000e001','fu@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000e002','fw@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000e003','fa@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-00000000e003','admin');
SELECT set_config('meiyiyal.trusted','on',true);
INSERT INTO public.workers(id,user_id,display_name,primary_node,status,is_active,is_verified,is_online,last_seen_at,base_geog,district_slug,years_experience)
VALUES ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-00000000e002','Adv F','professionals--lawyer--property-land','approved',true,true,true,now(),'POINT(80.27 13.03)','chennai',10);
INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) VALUES ('00000000-0000-0000-0000-00000000f002','professionals--lawyer--property-land',true);
SELECT set_config('meiyiyal.trusted','off',true);
CREATE FUNCTION pg_temp.mk(_end boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE s uuid; BEGIN
  INSERT INTO public.consult_sessions(user_id,worker_id,worker_user_id,node_slug,credits_used)
  VALUES ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-00000000e002','professionals--lawyer--property-land',10) RETURNING id INTO s;
  IF _end THEN UPDATE public.consult_sessions SET status='ended', ended_at=now() WHERE id=s; END IF; RETURN s; END $$;
CREATE FUNCTION pg_temp.as_(_u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',_u,'role','authenticated')::text, true) $$;
CREATE FUNCTION pg_temp.w() RETURNS public.workers LANGUAGE sql AS $$ SELECT * FROM public.workers WHERE id='00000000-0000-0000-0000-00000000f002' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

DO $$ DECLARE s1 uuid := pg_temp.mk(); s2 uuid := pg_temp.mk(false); r jsonb; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.worker_rewards WHERE worker_id='00000000-0000-0000-0000-00000000f002' AND milestone='first_consult') THEN RAISE EXCEPTION 'FAIL: first_consult award'; END IF;
  RAISE NOTICE 'PASS: session end auto-awards config milestone (first_consult)';
  PERFORM set_config('test.s1', s1::text, true); PERFORM set_config('test.s2', s2::text, true);
END $$;
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000e002');
DO $$ BEGIN
  BEGIN PERFORM public.feedback_submit(current_setting('test.s1')::uuid, 5); RAISE EXCEPTION 'FAIL: worker rated self';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only the session client can give feedback'; END;
  BEGIN UPDATE public.workers SET flag_active=true, strikes_reset_at=now() WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: self edit moderation';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: worker cannot edit moderation fields'; END;
  BEGIN INSERT INTO public.worker_rewards(worker_id,milestone) VALUES ('00000000-0000-0000-0000-00000000f002','sessions_100'); RAISE EXCEPTION 'FAIL: self award';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: worker cannot self-award'; END;
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000e001');
DO $$ DECLARE r jsonb; BEGIN
  BEGIN PERFORM public.feedback_submit(current_setting('test.s2')::uuid, 5); RAISE EXCEPTION 'FAIL: active session';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: no feedback while session active'; END;
  BEGIN PERFORM public.feedback_submit(current_setting('test.s1')::uuid, 6); RAISE EXCEPTION 'FAIL: rating 6';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.feedback_submit(current_setting('test.s1')::uuid, 5, ARRAY['hacker']); RAISE EXCEPTION 'FAIL: bad tag';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.feedback_submit(current_setting('test.s1')::uuid, 1, '{}', NULL, true, 'nope'); RAISE EXCEPTION 'FAIL: bad reason';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.consult_feedback(session_id,user_id,worker_id,rating,is_good,is_negative) VALUES (current_setting('test.s1')::uuid,auth.uid(),'00000000-0000-0000-0000-00000000f002',5,true,false); RAISE EXCEPTION 'FAIL: direct insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: rating/tags/complaint reason validated; no direct inserts';
  r := public.feedback_submit(current_setting('test.s1')::uuid, 5, ARRAY['clear_advice','patient'], 'Very helpful');
  IF NOT (r->'awarded') ? 'first_five_star' THEN RAISE EXCEPTION 'FAIL: five star award %', r; END IF;
  IF (pg_temp.w()).rating <> 5 OR (pg_temp.w()).total_reviews <> 1 OR (pg_temp.w()).rewards_count <> 2 THEN RAISE EXCEPTION 'FAIL: aggregates'; END IF;
  RAISE NOTICE 'PASS: 5-star feedback -> server aggregates + first_five_star reward';
  BEGIN PERFORM public.feedback_submit(current_setting('test.s1')::uuid, 4); RAISE EXCEPTION 'FAIL: twice';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: one feedback per session'; END;
END $$;
-- complaint -> flag; 3 good -> cleared
RESET role;
DO $$ BEGIN PERFORM set_config('test.c1', pg_temp.mk()::text, true); PERFORM set_config('test.g1', pg_temp.mk()::text, true);
  PERFORM set_config('test.g2', pg_temp.mk()::text, true); PERFORM set_config('test.g3', pg_temp.mk()::text, true);
  PERFORM set_config('test.n2', pg_temp.mk()::text, true); PERFORM set_config('test.n3', pg_temp.mk()::text, true); PERFORM set_config('test.n4', pg_temp.mk()::text, true); END $$;
SET LOCAL role authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r := public.feedback_submit(current_setting('test.c1')::uuid, 2, ARRAY['rude'], 'Was rude', true, 'misconduct');
  IF NOT (pg_temp.w()).flag_active OR (pg_temp.w()).flag_good_needed <> 3 OR (r->>'blocked')::boolean THEN RAISE EXCEPTION 'FAIL: flag %', r; END IF;
  RAISE NOTICE 'PASS: complaint flags worker (needs 3 good sessions)';
  PERFORM public.feedback_submit(current_setting('test.g1')::uuid, 5);
  PERFORM public.feedback_submit(current_setting('test.g2')::uuid, 3);  -- neutral: no effect
  PERFORM public.feedback_submit(current_setting('test.g3')::uuid, 4);
  IF NOT (pg_temp.w()).flag_active OR (pg_temp.w()).flag_good_needed <> 1 THEN RAISE EXCEPTION 'FAIL: countdown %', (pg_temp.w()).flag_good_needed; END IF;
  RAISE NOTICE 'PASS: good sessions count down the flag, neutral ones do not';
END $$;
RESET role;
DO $$ BEGIN PERFORM set_config('test.g4', pg_temp.mk()::text, true); END $$;
SET LOCAL role authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r := public.feedback_submit(current_setting('test.g4')::uuid, 5);
  IF (pg_temp.w()).flag_active OR NOT (r->>'flag_cleared')::boolean THEN RAISE EXCEPTION 'FAIL: clear'; END IF;
  RAISE NOTICE 'PASS: flag clears automatically after N good sessions';
  -- negatives 2 and 3 (complaint above is #1 in window) -> auto block
  r := public.feedback_submit(current_setting('test.n2')::uuid, 1, ARRAY['unhelpful']);
  IF (r->>'blocked')::boolean THEN RAISE EXCEPTION 'FAIL: blocked too early'; END IF;
  r := public.feedback_submit(current_setting('test.n3')::uuid, 2, '{}', NULL, true, 'wrong_advice');
  IF NOT (r->>'blocked')::boolean OR (pg_temp.w()).blocked_until < now() + interval '6 days' OR (pg_temp.w()).is_online THEN RAISE EXCEPTION 'FAIL: auto block %', r; END IF;
  RAISE NOTICE 'PASS: 3rd negative within window -> 7-day block, forced offline';
  IF EXISTS (SELECT 1 FROM public.search_workers('professionals--lawyer--property-land',13.03::float8,80.27::float8,50::float8,true,50) WHERE id='00000000-0000-0000-0000-00000000f002') THEN RAISE EXCEPTION 'FAIL: hidden'; END IF;
  BEGIN PERFORM public.request_create('00000000-0000-0000-0000-00000000f002','chat'); RAISE EXCEPTION 'FAIL: request blocked';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  IF public.worker_public('00000000-0000-0000-0000-00000000f002') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: public profile hidden'; END IF;
  RAISE NOTICE 'PASS: blocked worker hidden from search/profile and cannot be requested';
  BEGIN PERFORM public.admin_moderate('00000000-0000-0000-0000-00000000f002','unblock','x'); RAISE EXCEPTION 'FAIL: user unblocked';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only admins moderate'; END;
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000e002');
DO $$ DECLARE st jsonb; BEGIN
  BEGIN PERFORM public.worker_set_online(true); RAISE EXCEPTION 'FAIL: online while blocked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  st := public.my_worker_standing();
  IF NOT (st->>'blocked')::boolean OR st->>'block_reason' NOT LIKE 'auto:3%' THEN RAISE EXCEPTION 'FAIL: standing %', st; END IF;
  IF public.worker_public('00000000-0000-0000-0000-00000000f002') IS NULL THEN RAISE EXCEPTION 'FAIL: own profile'; END IF;
  RAISE NOTICE 'PASS: blocked worker cannot go online and sees status + reason';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000e003');
DO $$ DECLARE m record; BEGIN
  SELECT * INTO m FROM public.admin_moderation() WHERE id='00000000-0000-0000-0000-00000000f002';
  IF NOT m.blocked OR m.negatives <> 3 THEN RAISE EXCEPTION 'FAIL: admin view'; END IF;
  BEGIN PERFORM public.admin_moderate(m.id,'unblock',''); RAISE EXCEPTION 'FAIL: note';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  PERFORM public.admin_moderate(m.id,'extend','Repeat complaints, extending',3);
  IF (pg_temp.w()).blocked_until < now() + interval '9 days' THEN RAISE EXCEPTION 'FAIL: extend'; END IF;
  PERFORM public.admin_moderate(m.id,'unblock','Reviewed: unblocking');
  IF (pg_temp.w()).blocked_until IS NOT NULL THEN RAISE EXCEPTION 'FAIL: unblock'; END IF;
  IF (SELECT count(*) FROM public.admin_audit_log(200) WHERE target='00000000-0000-0000-0000-00000000f002' AND action IN ('worker.auto_block','worker.extend','worker.unblock','worker.flag_auto_cleared')) <> 4 THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
  RAISE NOTICE 'PASS: admin sees, extends and unblocks; full audit trail';
  PERFORM public.admin_set_rate('professionals--lawyer','chat',12,10);
  IF (public.rates_for('professionals--lawyer--property-land')->'chat'->>'rate')::numeric <> 12 THEN RAISE EXCEPTION 'FAIL: rate edit'; END IF;
  BEGIN PERFORM public.admin_set_rate('professionals--lawyer','chat',-1,10); RAISE EXCEPTION 'FAIL: neg rate';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: admin edits rates (validated, inherited, audited)';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000e002');
DO $$ BEGIN
  IF NOT public.worker_set_online(true) THEN RAISE EXCEPTION 'FAIL: online after unblock'; END IF;
  BEGIN PERFORM public.admin_set_rate('professionals--lawyer','chat',1,1); RAISE EXCEPTION 'FAIL: worker edits rate';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.rate_cards SET credits_per_min=1; IF FOUND THEN RAISE EXCEPTION 'FAIL: direct rate'; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: unblocked worker can go online; non-admin cannot edit rates';
  IF jsonb_array_length(public.worker_public('00000000-0000-0000-0000-00000000f002')->'feedback') <> 6 THEN RAISE EXCEPTION 'FAIL: public feedback excludes complaints'; END IF;
  RAISE NOTICE 'PASS: public profile shows recent feedback without complaints';
END $$;
ROLLBACK;
