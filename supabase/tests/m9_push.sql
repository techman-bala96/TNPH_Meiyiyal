BEGIN;
-- M9 push notifications: RLS, devices, every event trigger, prefs, quiet hours + morning summary, claim/record, reachability.
INSERT INTO auth.users(id, email, aud, role, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-00000000a901','p9client@test.local','authenticated','authenticated','{"full_name":"Meena Sundaram"}'),
 ('00000000-0000-0000-0000-00000000a902','p9worker@test.local','authenticated','authenticated','{}'),
 ('00000000-0000-0000-0000-00000000a903','p9admin@test.local','authenticated','authenticated','{}'),
 ('00000000-0000-0000-0000-00000000a904','p9other@test.local','authenticated','authenticated','{}');
UPDATE public.profiles SET full_name = 'Meena Sundaram' WHERE user_id = '00000000-0000-0000-0000-00000000a901';
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-0000-0000-0000-00000000a903','admin');
SELECT set_config('meiyiyal.trusted','on', true);
INSERT INTO public.workers(id, user_id, display_name, primary_node, status, is_active, is_verified, decided_at, base_geog, district_slug, years_experience, is_online, last_seen_at) VALUES
 ('00000000-0000-0000-0000-00000000b902','00000000-0000-0000-0000-00000000a902','Dr. Kavitha Raman','professionals--doctor--allopathy','approved',true,true,now(),'POINT(80.27 13.03)','chennai',12,true,now() - interval '1 hour');
INSERT INTO public.worker_nodes(worker_id, node_slug, is_primary) VALUES ('00000000-0000-0000-0000-00000000b902','professionals--doctor--allopathy',true);
CREATE FUNCTION pg_temp.as_(_u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub',_u,'role','authenticated')::text, true) $$;
CREATE FUNCTION pg_temp.n(_u text, _kind text) RETURNS int LANGUAGE sql AS $$ SELECT count(*)::int FROM public.notifications WHERE user_id = _u::uuid AND kind = _kind $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;
-- quiet hours off for the event checks (they get their own section below)
UPDATE public.profiles SET prefs = '{"notify":{"quiet":{"on":false}}}' WHERE user_id IN ('00000000-0000-0000-0000-00000000a901','00000000-0000-0000-0000-00000000a902','00000000-0000-0000-0000-00000000a903','00000000-0000-0000-0000-00000000a904');

DO $$ BEGIN
  IF COALESCE(public.setting('push_mock')#>>'{}','') <> 'true' THEN RAISE EXCEPTION 'FAIL: mock default'; END IF;
  IF COALESCE(public.setting('push_enabled')#>>'{}','') <> 'true' THEN RAISE EXCEPTION 'FAIL: enabled default'; END IF;
  IF public.setting('push_quiet_default') <> '{"on":true,"from":"22:00","to":"07:00"}'::jsonb THEN RAISE EXCEPTION 'FAIL: quiet default'; END IF;
  IF NOT public.push_quiet_now('{}', '2026-10-18 23:30+05:30') OR public.push_quiet_now('{}', '2026-10-18 07:00+05:30') OR NOT public.push_quiet_now('{}', '2026-10-19 06:59+05:30') THEN RAISE EXCEPTION 'FAIL: quiet maths'; END IF;
  IF public.push_quiet_now('{"notify":{"quiet":{"on":true,"from":"bad","to":"x"}}}', '2026-10-18 12:00+05:30') THEN RAISE EXCEPTION 'FAIL: bad quiet values'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-sweep') THEN RAISE EXCEPTION 'FAIL: no scheduled sweep'; END IF;
  IF (public.push_kind_meta('request.incoming')).priority <> 'urgent' OR NOT (public.push_kind_meta('payout.failed')).always OR (public.push_kind_meta('chat.message')).category <> 'chat' THEN RAISE EXCEPTION 'FAIL: kind meta'; END IF;
  RAISE NOTICE 'PASS: mock on by default, quiet hours 22:00-07:00 IST (across midnight), 30 s sweep scheduled';
END $$;

-- ---------- devices + RLS ----------
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a902');
DO $$ DECLARE _a uuid; _b uuid; BEGIN
  _a := public.push_subscribe('https://fcm.googleapis.com/fcm/send/dev-worker', 'BPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'authsecret123', 'en', 'android');
  _b := public.push_subscribe('https://fcm.googleapis.com/fcm/send/dev-worker', 'BPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'authsecret123', 'en', 'android');
  IF _a <> _b OR (SELECT count(*) FROM public.push_subscriptions) <> 1 THEN RAISE EXCEPTION 'FAIL: subscribe not idempotent'; END IF;
  BEGIN PERFORM public.push_subscribe('http://insecure.example/x', 'BPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'authsecret123'); RAISE EXCEPTION 'FAIL: http endpoint';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth) VALUES (auth.uid(), 'https://x.example/1', 'BPxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'authsecret123'); RAISE EXCEPTION 'FAIL: direct device insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.notifications(user_id, kind, category) VALUES (auth.uid(), 'x.y', 'system'); RAISE EXCEPTION 'FAIL: direct notification insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.notify(auth.uid(), 'verify.approved'); RAISE EXCEPTION 'FAIL: client called notify';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.push_claim(10); RAISE EXCEPTION 'FAIL: client claimed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.push_sweep(); RAISE EXCEPTION 'FAIL: client swept';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.push_hook_ok('x'); RAISE EXCEPTION 'FAIL: client read hook';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT public.push_set_lang('https://fcm.googleapis.com/fcm/send/dev-worker', 'ta') THEN RAISE EXCEPTION 'FAIL: set lang'; END IF;
  IF (SELECT lang FROM public.push_subscriptions) <> 'ta' THEN RAISE EXCEPTION 'FAIL: lang not saved'; END IF;
  IF (public.push_config()->>'mock')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: push_config'; END IF;
  RAISE NOTICE 'PASS: device register is idempotent, https only; clients cannot write rows, call notify/claim/sweep or read the hook secret';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a904');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.push_subscriptions) THEN RAISE EXCEPTION 'FAIL: saw another user''s device'; END IF;
  IF public.push_unsubscribe('https://fcm.googleapis.com/fcm/send/dev-worker') THEN RAISE EXCEPTION 'FAIL: removed another user''s device'; END IF;
  RAISE NOTICE 'PASS: devices are private to their owner';
END $$;
RESET role;

-- ---------- reachability: Online worker, app closed for an hour ----------
DO $$ DECLARE _w public.workers; BEGIN
  SELECT * INTO _w FROM public.workers WHERE id = '00000000-0000-0000-0000-00000000b902';
  IF NOT public.worker_reachable(_w) THEN RAISE EXCEPTION 'FAIL: push worker not reachable'; END IF;
  IF NOT (SELECT s.is_online FROM public.search_workers('professionals--doctor', 13.03, 80.27, 50, true, 50) s WHERE s.id = _w.id) THEN RAISE EXCEPTION 'FAIL: search hides push worker'; END IF;
  DELETE FROM public.push_subscriptions WHERE user_id = _w.user_id;
  IF public.worker_reachable(_w) THEN RAISE EXCEPTION 'FAIL: reachable without push'; END IF;
  IF (public.worker_public(_w.id)->>'is_online')::boolean THEN RAISE EXCEPTION 'FAIL: profile online without push'; END IF;
  INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth, lang) VALUES (_w.user_id, 'https://fcm.googleapis.com/fcm/send/dev-worker', 'BPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'authsecret123', 'en');
  UPDATE public.workers SET last_seen_at = now() - interval '9 hours' WHERE id = _w.id;
  SELECT * INTO _w FROM public.workers WHERE id = _w.id;
  IF public.worker_reachable(_w) THEN RAISE EXCEPTION 'FAIL: reachable after 8 h'; END IF;
  UPDATE public.workers SET last_seen_at = now() - interval '1 hour' WHERE id = _w.id;
  RAISE NOTICE 'PASS: an Online worker with push stays requestable for 8 h after closing the app; without push the old 2-minute rule holds';
END $$;

-- ---------- requests, calls, chat, sessions ----------
DO $$ DECLARE _r uuid; _r2 uuid; _s uuid; _n public.notifications; BEGIN
  INSERT INTO public.consult_requests(id, user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-00000000a902',
          'professionals--doctor--allopathy', 'video', 10, 5, 'Meena Sundaram', now() + interval '45 seconds') RETURNING id INTO _r;
  SELECT * INTO _n FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a902' AND kind = 'request.incoming';
  IF _n.priority <> 'urgent' OR _n.push_status <> 'pending' OR _n.url <> '/?ring=' || _r OR _n.tag <> 'req-' || _r THEN RAISE EXCEPTION 'FAIL: W1 row %', row_to_json(_n); END IF;
  IF _n.params->>'name' <> 'Meena' OR _n.params->>'mode' <> 'video' OR (_n.params->>'seconds')::int NOT BETWEEN 40 AND 45 THEN RAISE EXCEPTION 'FAIL: W1 params %', _n.params; END IF;
  IF _n.params::text LIKE '%Sundaram%' THEN RAISE EXCEPTION 'FAIL: full name on lock screen'; END IF;
  -- unanswered: the scheduled sweep expires it
  UPDATE public.consult_requests SET expires_at = now() - interval '1 second' WHERE id = _r;
  PERFORM public.push_sweep();
  IF (SELECT status FROM public.consult_requests WHERE id = _r) <> 'timeout' THEN RAISE EXCEPTION 'FAIL: sweep did not expire the ring'; END IF;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'request.missed') <> 1 THEN RAISE EXCEPTION 'FAIL: W2'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a901' AND kind = 'request.declined' AND params->>'reason' = 'timeout' AND params->>'name' = 'Dr. Kavitha Raman') THEN RAISE EXCEPTION 'FAIL: U2 timeout'; END IF;
  -- declined
  INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
  VALUES ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-00000000a902', 'professionals--doctor--allopathy', 'chat', 10, 5, 'Meena', now() + interval '45 seconds') RETURNING id INTO _r2;
  UPDATE public.consult_requests SET status = 'declined' WHERE id = _r2;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a901' AND kind = 'request.declined' AND params->>'reason' = 'declined') THEN RAISE EXCEPTION 'FAIL: U2 declined'; END IF;
  -- cancelled by the client: the worker's ring notification is replaced (same tag)
  INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
  VALUES ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-00000000a902', 'professionals--doctor--allopathy', 'voice', 10, 5, 'Meena', now() + interval '45 seconds') RETURNING id INTO _r2;
  UPDATE public.consult_requests SET status = 'cancelled' WHERE id = _r2;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'request.missed' AND tag = 'req-' || _r2) THEN RAISE EXCEPTION 'FAIL: W2 on cancel'; END IF;
  -- accepted
  INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
  VALUES ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-00000000a902', 'professionals--doctor--allopathy', 'chat', 10, 5, 'Meena', now() + interval '45 seconds') RETURNING id INTO _r2;
  INSERT INTO public.consult_sessions(request_id, user_id, worker_id, worker_user_id, node_slug) VALUES (_r2, '00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-00000000a902', 'professionals--doctor--allopathy') RETURNING id INTO _s;
  UPDATE public.consult_requests SET status = 'accepted', session_id = _s WHERE id = _r2;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a901' AND kind = 'request.accepted' AND url = '/session/' || _s AND priority = 'urgent') THEN RAISE EXCEPTION 'FAIL: U1'; END IF;
  -- chat: two messages collapse into one row; system lines and the text itself never notify
  INSERT INTO public.consult_messages(session_id, sender, body, kind) VALUES (_s, '00000000-0000-0000-0000-00000000a901', 'session_started', 'system');
  INSERT INTO public.consult_messages(session_id, sender, body) VALUES (_s, '00000000-0000-0000-0000-00000000a901', 'my sugar is 300');
  INSERT INTO public.consult_messages(session_id, sender, body) VALUES (_s, '00000000-0000-0000-0000-00000000a901', 'please call');
  SELECT * INTO _n FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a902' AND kind = 'chat.message';
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'chat.message') <> 1 OR _n.count <> 2 OR (_n.params->>'count')::int <> 2 THEN RAISE EXCEPTION 'FAIL: chat collapse %', row_to_json(_n); END IF;
  IF _n.params::text LIKE '%sugar%' OR _n.params->>'name' <> 'Meena' THEN RAISE EXCEPTION 'FAIL: chat leaks text or name %', _n.params; END IF;
  INSERT INTO public.consult_messages(session_id, sender, body) VALUES (_s, '00000000-0000-0000-0000-00000000a902', 'Hello Meena');
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a901' AND kind = 'chat.message' AND params->>'name' = 'Dr. Kavitha Raman') THEN RAISE EXCEPTION 'FAIL: U4'; END IF;
  -- calls go to the other party
  INSERT INTO public.session_calls(session_id, mode, caller) VALUES (_s, 'video', '00000000-0000-0000-0000-00000000a902');
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a901' AND kind = 'call.incoming' AND priority = 'urgent' AND params->>'mode' = 'video') THEN RAISE EXCEPTION 'FAIL: U3'; END IF;
  UPDATE public.session_calls SET status = 'ended' WHERE session_id = _s;
  INSERT INTO public.session_calls(session_id, mode, caller) VALUES (_s, 'voice', '00000000-0000-0000-0000-00000000a901');
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a902' AND kind = 'call.incoming' AND params->>'name' = 'Meena') THEN RAISE EXCEPTION 'FAIL: W3'; END IF;
  UPDATE public.session_calls SET status = 'ended' WHERE session_id = _s;
  -- credits ran out
  UPDATE public.consult_sessions SET status = 'ended', end_reason = 'credits_exhausted', ended_at = now(), credits_used = 50 WHERE id = _s;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a901', 'session.credits_out') <> 1 THEN RAISE EXCEPTION 'FAIL: U8'; END IF;
  RAISE NOTICE 'PASS: ring (urgent, first name, ring link), sweep expiry -> missed + no answer, decline, cancel, accept, collapsed chat with no text, calls both ways, credits ran out';
END $$;

-- ---------- money ----------
DO $$ DECLARE _o uuid; _a uuid; _p uuid; BEGIN
  INSERT INTO public.payment_orders(user_id, pack_id, amount_paise, credits, bonus, provider) VALUES ('00000000-0000-0000-0000-00000000a901', (SELECT id FROM public.credit_packs LIMIT 1), 49900, 500, 25, 'mock') RETURNING id INTO _o;
  UPDATE public.payment_orders SET status = 'paid' WHERE id = _o;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'payment.paid' AND (params->>'amount')::numeric = 499 AND (params->>'credits')::numeric = 525) THEN RAISE EXCEPTION 'FAIL: U5'; END IF;
  UPDATE public.payment_orders SET status = 'refunded' WHERE id = _o;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a901', 'payment.refunded') <> 1 THEN RAISE EXCEPTION 'FAIL: U7'; END IF;
  INSERT INTO public.payment_orders(user_id, pack_id, amount_paise, credits, provider) VALUES ('00000000-0000-0000-0000-00000000a901', (SELECT id FROM public.credit_packs LIMIT 1), 9900, 99, 'mock') RETURNING id INTO _o;
  UPDATE public.payment_orders SET status = 'failed' WHERE id = _o;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a901', 'payment.failed') <> 1 THEN RAISE EXCEPTION 'FAIL: U6'; END IF;
  INSERT INTO public.worker_payout_accounts(worker_user_id, worker_id, kind, account_mask, account_last4, account_hash, validation_status)
  VALUES ('00000000-0000-0000-0000-00000000a902', '00000000-0000-0000-0000-00000000b902', 'upi', 'kav••••@okhdfc', '4321', 'h1', 'review') RETURNING id INTO _a;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'payout_account.review') <> 1 OR pg_temp.n('00000000-0000-0000-0000-00000000a903', 'admin.account_review') <> 1 THEN RAISE EXCEPTION 'FAIL: W9 review / A1'; END IF;
  UPDATE public.worker_payout_accounts SET validation_status = 'verified', cooling_until = now() - interval '1 minute' WHERE id = _a;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'payout_account.verified') <> 1 THEN RAISE EXCEPTION 'FAIL: W9 verified'; END IF;
  PERFORM public.push_sweep(); PERFORM public.push_sweep();
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'payout.cooled') <> 1 THEN RAISE EXCEPTION 'FAIL: W8 cool-off ended once'; END IF;
  INSERT INTO public.payout_requests(worker_user_id, amount, status, account_id) VALUES ('00000000-0000-0000-0000-00000000a902', 12000, 'review', _a) RETURNING id INTO _p;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'payout.review') <> 1 OR pg_temp.n('00000000-0000-0000-0000-00000000a903', 'admin.payout_review') <> 1 THEN RAISE EXCEPTION 'FAIL: W8 / A1 payout review'; END IF;
  UPDATE public.payout_requests SET status = 'paid' WHERE id = _p;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'payout.paid' AND params->>'last4' = '4321' AND params->>'kind' = 'upi') THEN RAISE EXCEPTION 'FAIL: W6'; END IF;
  INSERT INTO public.payout_requests(worker_user_id, amount, status, account_id) VALUES ('00000000-0000-0000-0000-00000000a902', 300, 'processing', _a) RETURNING id INTO _p;
  -- Money switched off: payout failed still comes (safety notice)
  UPDATE public.profiles SET prefs = '{"notify":{"money":false,"quiet":{"on":false}}}' WHERE user_id = '00000000-0000-0000-0000-00000000a902';
  UPDATE public.payout_requests SET status = 'failed' WHERE id = _p;
  IF (SELECT push_status FROM public.notifications WHERE kind = 'payout.failed') <> 'pending' THEN RAISE EXCEPTION 'FAIL: W7 must ignore the switch'; END IF;
  UPDATE public.workers SET payout_hold = true WHERE id = '00000000-0000-0000-0000-00000000b902';
  IF (SELECT push_status FROM public.notifications WHERE kind = 'payout.hold') <> 'skipped_pref' THEN RAISE EXCEPTION 'FAIL: money switch ignored'; END IF;
  UPDATE public.workers SET payout_hold = false WHERE id = '00000000-0000-0000-0000-00000000b902';
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'payout.resumed') <> 1 THEN RAISE EXCEPTION 'FAIL: resumed'; END IF;
  UPDATE public.profiles SET prefs = '{"notify":{"quiet":{"on":false}}}' WHERE user_id = '00000000-0000-0000-0000-00000000a902';
  PERFORM public.push_payout_batch_done('{"created":5,"paused":false}', '{"processing":4,"failed":1}');
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a903' AND kind = 'admin.payout_batch' AND (params->>'failed')::int = 1) THEN RAISE EXCEPTION 'FAIL: A3'; END IF;
  RAISE NOTICE 'PASS: payment paid/failed/refunded, account review/verified + one cool-off notice, payout review/paid/failed (always on), hold/resume, batch summary to admins';
END $$;

-- ---------- account, verification, rewards, complaints ----------
DO $$ DECLARE _c uuid; _s uuid; BEGIN
  UPDATE public.workers SET status = 'needs_info' WHERE id = '00000000-0000-0000-0000-00000000b902';
  UPDATE public.workers SET status = 'rejected' WHERE id = '00000000-0000-0000-0000-00000000b902';
  UPDATE public.workers SET status = 'approved' WHERE id = '00000000-0000-0000-0000-00000000b902';
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'verify.needs_info') <> 1 OR pg_temp.n('00000000-0000-0000-0000-00000000a902', 'verify.rejected') <> 1
     OR pg_temp.n('00000000-0000-0000-0000-00000000a902', 'verify.approved') <> 1 THEN RAISE EXCEPTION 'FAIL: W10'; END IF;
  UPDATE public.workers SET blocked_until = now() + interval '7 days' WHERE id = '00000000-0000-0000-0000-00000000b902';
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'account.blocked' AND params ? 'until' AND always) THEN RAISE EXCEPTION 'FAIL: W11 blocked'; END IF;
  UPDATE public.workers SET blocked_until = NULL WHERE id = '00000000-0000-0000-0000-00000000b902';
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'account.unblocked') <> 1 THEN RAISE EXCEPTION 'FAIL: W11 lifted'; END IF;
  INSERT INTO public.verification_cases(worker_id, status) VALUES ('00000000-0000-0000-0000-00000000b902', 'queued') RETURNING id INTO _c;
  UPDATE public.verification_cases SET status = 'running' WHERE id = _c;
  UPDATE public.verification_cases SET status = 'queued' WHERE id = _c;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a903', 'admin.verify_queue') <> 1 OR (SELECT count FROM public.notifications WHERE kind = 'admin.verify_queue') <> 2 THEN RAISE EXCEPTION 'FAIL: A2 batched'; END IF;
  INSERT INTO public.verification_appeals(case_id, worker_id, note, sla_due_at) VALUES (_c, '00000000-0000-0000-0000-00000000b902', 'please re-check', now() + interval '2 days');
  UPDATE public.verification_appeals SET status = 'upheld' WHERE case_id = _c;
  IF pg_temp.n('00000000-0000-0000-0000-00000000a902', 'appeal.upheld') <> 1 THEN RAISE EXCEPTION 'FAIL: appeal upheld'; END IF;
  INSERT INTO public.worker_rewards(worker_id, milestone) SELECT '00000000-0000-0000-0000-00000000b902', m.slug FROM public.reward_milestones m ORDER BY m.sort DESC LIMIT 1 ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'reward.earned' AND params->'title' ? 'en') THEN RAISE EXCEPTION 'FAIL: W12'; END IF;
  INSERT INTO public.consult_sessions(user_id, worker_id, worker_user_id, node_slug, status, ended_at, credits_used) VALUES
    ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', '00000000-0000-0000-0000-00000000a902', 'professionals--doctor--allopathy', 'ended', now() - interval '40 minutes', 30) RETURNING id INTO _s;
  PERFORM public.push_sweep(); PERFORM public.push_sweep();
  IF (SELECT push_status FROM public.notifications WHERE kind = 'feedback.reminder' AND user_id = '00000000-0000-0000-0000-00000000a901') <> 'skipped_pref' THEN RAISE EXCEPTION 'FAIL: U9 off by default / once'; END IF;
  INSERT INTO public.consult_feedback(session_id, user_id, worker_id, rating, is_complaint, complaint_reason, is_good, is_negative)
  VALUES (_s, '00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000b902', 1, true, 'rude', false, true);
  IF pg_temp.n('00000000-0000-0000-0000-00000000a903', 'admin.complaint') <> 1 THEN RAISE EXCEPTION 'FAIL: A4'; END IF;
  RAISE NOTICE 'PASS: verification approved/needs info/rejected, block + lift, batched admin queue, appeal, reward, feedback reminder (off by default), complaint alert';
END $$;

-- ---------- prefs + quiet hours + morning summary ----------
DO $$ DECLARE _q jsonb; BEGIN
  UPDATE public.profiles SET prefs = '{"notify":{"chat":false,"quiet":{"on":false}}}' WHERE user_id = '00000000-0000-0000-0000-00000000a904';
  PERFORM public.notify('00000000-0000-0000-0000-00000000a904', 'chat.message', '{"name":"X"}', '/session/x');
  IF (SELECT push_status FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND kind = 'chat.message') <> 'skipped_pref' THEN RAISE EXCEPTION 'FAIL: chat switch'; END IF;
  -- a quiet window around "now" (IST)
  _q := jsonb_build_object('on', true, 'from', to_char((now() AT TIME ZONE 'Asia/Kolkata') - interval '1 hour', 'HH24:MI'), 'to', to_char((now() AT TIME ZONE 'Asia/Kolkata') + interval '1 hour', 'HH24:MI'));
  UPDATE public.profiles SET prefs = jsonb_build_object('notify', jsonb_build_object('quiet', _q)) WHERE user_id = '00000000-0000-0000-0000-00000000a904';
  PERFORM public.notify('00000000-0000-0000-0000-00000000a904', 'payment.paid', '{"amount":99,"credits":99}', '/wallet');
  PERFORM public.notify('00000000-0000-0000-0000-00000000a904', 'reward.earned', '{}', '/');
  PERFORM public.notify('00000000-0000-0000-0000-00000000a904', 'payout.failed', '{"amount":300}', '/earnings');
  PERFORM public.notify('00000000-0000-0000-0000-00000000a904', 'call.incoming', '{"name":"Y","mode":"voice"}', '/session/y');
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND push_status = 'held') <> 3 THEN RAISE EXCEPTION 'FAIL: quiet hours hold'; END IF;
  IF (SELECT push_status FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND kind = 'call.incoming') <> 'pending' THEN RAISE EXCEPTION 'FAIL: calls must ring in quiet hours'; END IF;
  PERFORM public.push_sweep();
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND push_status = 'held') <> 3 THEN RAISE EXCEPTION 'FAIL: released while still quiet'; END IF;
  -- quiet hours end
  UPDATE public.profiles SET prefs = '{"notify":{"quiet":{"on":false}}}' WHERE user_id = '00000000-0000-0000-0000-00000000a904';
  PERFORM public.push_sweep();
  IF (SELECT push_status FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND kind = 'payout.failed') <> 'pending' THEN RAISE EXCEPTION 'FAIL: safety notice not released on its own'; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND push_status = 'summarized') <> 2 THEN RAISE EXCEPTION 'FAIL: summarized'; END IF;
  IF (SELECT (params->>'count')::int FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-00000000a904' AND kind = 'summary.quiet') <> 2 THEN RAISE EXCEPTION 'FAIL: morning summary'; END IF;
  -- master switch
  UPDATE public.app_settings SET value = 'false' WHERE key = 'push_enabled';
  IF (SELECT push_status FROM public.notifications WHERE id = public.notify('00000000-0000-0000-0000-00000000a904', 'payment.paid', '{}', '/wallet')) <> 'skipped_off' THEN RAISE EXCEPTION 'FAIL: kill switch'; END IF;
  UPDATE public.app_settings SET value = 'true' WHERE key = 'push_enabled';
  RAISE NOTICE 'PASS: category switch, quiet hours hold normal alerts but not calls, morning summary + safety notice released, kill switch';
END $$;

-- ---------- claim, record, devices ----------
DO $$ DECLARE _j jsonb; _row jsonb; _id uuid; _dev uuid; BEGIN
  UPDATE public.notifications SET push_status = 'sent' WHERE push_status = 'pending' AND user_id <> '00000000-0000-0000-0000-00000000a902';
  _j := public.push_claim(200);
  IF jsonb_array_length(_j) < 1 THEN RAISE EXCEPTION 'FAIL: nothing claimed'; END IF;
  IF (_j->0->>'priority') <> 'urgent' THEN RAISE EXCEPTION 'FAIL: urgent first'; END IF;
  SELECT r INTO _row FROM jsonb_array_elements(_j) r WHERE r->>'kind' = 'request.incoming' LIMIT 1;
  IF jsonb_array_length(_row->'devices') <> 1 OR _row->'devices'->0->>'lang' <> 'en' THEN RAISE EXCEPTION 'FAIL: devices in claim %', _row; END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE push_status = 'pending' AND user_id = '00000000-0000-0000-0000-00000000a902') THEN RAISE EXCEPTION 'FAIL: claim left pending'; END IF;
  IF jsonb_array_length(public.push_claim(10)) <> 0 THEN RAISE EXCEPTION 'FAIL: double claim'; END IF;
  _id := (_row->>'id')::uuid; _dev := (_row->'devices'->0->>'id')::uuid;
  PERFORM public.push_record(_id, 'sent', '{"mock":true,"ok":1}', '{"title":"t"}');
  IF (SELECT push_status FROM public.notifications WHERE id = _id) <> 'sent' OR (SELECT sent_at FROM public.notifications WHERE id = _id) IS NULL THEN RAISE EXCEPTION 'FAIL: record sent'; END IF;
  -- retry after a crash, at most 3 attempts
  UPDATE public.notifications SET push_status = 'sending', updated_at = now() - interval '5 minutes', push_attempts = 1 WHERE kind = 'chat.message' AND user_id = '00000000-0000-0000-0000-00000000a902';
  PERFORM public.push_sweep();
  IF (SELECT push_status FROM public.notifications WHERE kind = 'chat.message' AND user_id = '00000000-0000-0000-0000-00000000a902') <> 'pending' THEN RAISE EXCEPTION 'FAIL: stale send not retried'; END IF;
  UPDATE public.notifications SET push_attempts = 3 WHERE kind = 'chat.message' AND user_id = '00000000-0000-0000-0000-00000000a902';
  PERFORM public.push_record((SELECT id FROM public.notifications WHERE kind = 'chat.message' AND user_id = '00000000-0000-0000-0000-00000000a902'), 'pending', '{"failed":1}');
  IF (SELECT push_status FROM public.notifications WHERE kind = 'chat.message' AND user_id = '00000000-0000-0000-0000-00000000a902') <> 'failed' THEN RAISE EXCEPTION 'FAIL: gives up after 3'; END IF;
  PERFORM public.push_device_result(_dev, false, false);
  IF (SELECT failure_count FROM public.push_subscriptions WHERE id = _dev) <> 1 THEN RAISE EXCEPTION 'FAIL: failure count'; END IF;
  PERFORM public.push_device_result(_dev, true, false);
  IF (SELECT failure_count FROM public.push_subscriptions WHERE id = _dev) <> 0 THEN RAISE EXCEPTION 'FAIL: ok resets'; END IF;
  PERFORM public.push_device_result(_dev, false, true);
  IF EXISTS (SELECT 1 FROM public.push_subscriptions WHERE id = _dev) THEN RAISE EXCEPTION 'FAIL: gone device kept'; END IF;
  RAISE NOTICE 'PASS: claim is urgent-first, once only, carries devices + language; record/retry/give-up; dead devices removed';
END $$;

-- ---------- inbox as the user ----------
SET LOCAL role authenticated;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a901');
DO $$ DECLARE _mine int; _id uuid; BEGIN
  SELECT count(*) INTO _mine FROM public.notifications;
  IF _mine = 0 OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id <> auth.uid()) THEN RAISE EXCEPTION 'FAIL: inbox RLS'; END IF;
  IF public.notifications_mark_read(NULL) <> _mine THEN RAISE EXCEPTION 'FAIL: mark all read'; END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE read_at IS NULL) THEN RAISE EXCEPTION 'FAIL: unread left'; END IF;
  BEGIN UPDATE public.notifications SET read_at = NULL; RAISE EXCEPTION 'FAIL: direct update';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  _id := public.push_test();
  IF (SELECT push_status FROM public.notifications WHERE id = _id) <> 'pending' THEN RAISE EXCEPTION 'FAIL: test alert'; END IF;
  BEGIN PERFORM public.push_test(); RAISE EXCEPTION 'FAIL: test alert not rate-limited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS: inbox is private, mark-read works, rows are read-only to clients, test alert is rate-limited';
END $$;
SELECT pg_temp.as_('00000000-0000-0000-0000-00000000a904');
DO $$ BEGIN
  IF public.notifications_mark_read(ARRAY(SELECT id FROM public.notifications WHERE false)) <> 0 THEN RAISE EXCEPTION 'FAIL: mark none'; END IF;
  RAISE NOTICE 'PASS: marking an empty list changes nothing';
END $$;
RESET role;
ROLLBACK;
