-- M10: nearby search + Rapido-style auto request, paid messages, session presence (no billing for dead time),
-- early-end refunds, reconnect prompts. Decisions D1–D13 approved 18 Oct 2026.

INSERT INTO public.app_settings(key, value) VALUES
  ('auto_request_max', '5'),               -- workers tried per round before asking the user
  ('auto_ring_seconds', '30'),             -- ring per worker in auto mode (manual stays ring_seconds = 45)
  ('search_radius_km', '50'),
  ('missed_rings_offline', '3'),           -- this many missed rings in a row sets a worker Offline
  ('worker_message_credits', '5'),
  ('worker_message_refund_hours', '24'),
  ('worker_message_daily_max', '3'),       -- per user per worker per 24 h
  ('worker_message_reserve_minutes', '5'), -- after "I'm available now", only that user can request for this long
  ('session_drop_seconds', '30'),          -- one side silent this long = network drop, billing pauses
  ('session_resume_minutes', '3'),         -- wait this long for the side to come back, then end
  ('early_end_refund_minutes', '2'),       -- worker ends this early without replying = full refund
  ('low_balance_resume_minutes', '2'),     -- minutes of balance needed to continue after a drop
  ('reconnect_window_minutes', '10'),      -- one-tap reconnect to the same worker after an early/low-balance end
  ('ask_again_wait_seconds', '60')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================================
-- 1. Session presence: pause billing when a side goes silent, ask both to continue
-- =====================================================================================
ALTER TABLE public.consult_sessions
  ADD COLUMN IF NOT EXISTS user_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_side text CHECK (pause_side IN ('user','worker','both')),
  ADD COLUMN IF NOT EXISTS resume_user boolean,
  ADD COLUMN IF NOT EXISTS resume_worker boolean,
  ADD COLUMN IF NOT EXISTS ended_by uuid,
  ADD COLUMN IF NOT EXISTS refunded_credits numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_id uuid;

-- Bills the open segment up to _at (per started minute).
CREATE OR REPLACE FUNCTION public.session_bill_at(_sid uuid, _close boolean, _at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _g public.session_segments; _mins int; _due numeric; _bal numeric; _uw uuid; _pay numeric; _exhausted boolean := false; _end timestamptz;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  SELECT * INTO _g FROM public.session_segments WHERE session_id=_sid AND ended_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF _s.status <> 'active' OR _g.id IS NULL THEN RETURN; END IF;
  _end := GREATEST(_g.started_at, LEAST(_at, now()));
  -- the first minute is billed when a segment opens (as before); a stop point before the segment began bills nothing
  _mins := CASE WHEN _at < _g.started_at THEN _g.minutes_billed
                ELSE GREATEST(_g.minutes_billed, 1, ceil(extract(epoch FROM (_end - _g.started_at)) / 60.0)::int) END;
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
  IF _close OR _exhausted THEN UPDATE public.session_segments SET ended_at = CASE WHEN _exhausted THEN now() ELSE _end END WHERE id=_g.id; END IF;
  IF _exhausted THEN
    UPDATE public.session_calls SET status='ended', ended_at=now() WHERE session_id=_sid AND status IN ('ringing','active');
    UPDATE public.consult_sessions SET status='ended', ended_at=now(), end_reason='credits_exhausted' WHERE id=_sid;
    INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid,_s.user_id,'credits_exhausted','system');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.session_bill_at(uuid, boolean, timestamptz) FROM public, anon, authenticated;

-- Pause when a side has been silent for session_drop_seconds; end when nobody came back within session_resume_minutes.
-- A side that never showed up counts from the session start, so it is never billed.
CREATE OR REPLACE FUNCTION public.session_presence_check(_sid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _drop interval := make_interval(secs => public.setting_num('session_drop_seconds', 30)::int);
  _us timestamptz; _ws timestamptz; _uoff boolean; _woff boolean; _at timestamptz;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  IF NOT FOUND OR _s.status <> 'active' THEN RETURN; END IF;
  _us := COALESCE(_s.user_seen_at, _s.started_at); _ws := COALESCE(_s.worker_seen_at, _s.started_at);
  _uoff := _us < now() - _drop; _woff := _ws < now() - _drop;
  IF _s.paused_at IS NULL THEN
    IF NOT (_uoff OR _woff) THEN RETURN; END IF;
    _at := CASE WHEN _uoff AND _woff THEN LEAST(_us, _ws) WHEN _uoff THEN _us ELSE _ws END;
    PERFORM public.session_bill_at(_sid, true, _at);
    SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
    IF _s.status <> 'active' THEN RETURN; END IF;
    UPDATE public.session_calls SET status='ended', ended_at=now() WHERE session_id=_sid AND status IN ('ringing','active');
    UPDATE public.consult_sessions SET paused_at = GREATEST(_at, started_at),
      pause_side = CASE WHEN _uoff AND _woff THEN 'both' WHEN _uoff THEN 'user' ELSE 'worker' END,
      resume_user = NULL, resume_worker = NULL WHERE id=_sid;
    INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid, CASE WHEN _uoff THEN _s.user_id ELSE _s.worker_user_id END, 'session_paused','system');
    SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  END IF;
  -- still paused: give up after the resume window unless both sides are back (then they are being asked)
  IF _s.paused_at < now() - make_interval(mins => public.setting_num('session_resume_minutes', 3)::int) AND (_uoff OR _woff) THEN
    UPDATE public.consult_sessions SET status='ended', ended_at = _s.paused_at, end_reason='dropped' WHERE id=_sid AND status='active';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.session_presence_check(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.session_state(_sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _g public.session_segments; _bal numeric; _me text; _drop interval := make_interval(secs => public.setting_num('session_drop_seconds', 30)::int);
  _uback boolean; _wback boolean; _rate numeric;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  _me := CASE WHEN auth.uid() = _s.user_id THEN 'user' WHEN auth.uid() = _s.worker_user_id THEN 'worker' END;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=_s.user_id;
  SELECT * INTO _g FROM public.session_segments WHERE session_id=_sid ORDER BY id DESC LIMIT 1;
  _rate := COALESCE(_g.rate, (SELECT credits_per_min FROM public.rate_for(_s.node_slug, _s.current_mode)));
  _uback := COALESCE(_s.user_seen_at, _s.started_at) >= now() - _drop; _wback := COALESCE(_s.worker_seen_at, _s.started_at) >= now() - _drop;
  RETURN jsonb_build_object('status',_s.status,'credits_used',_s.credits_used,'mode',_s.current_mode,'rate',_rate,
    'balance', CASE WHEN _me = 'user' THEN _bal END,
    'minutes_left', CASE WHEN _me = 'user' AND _rate > 0 THEN floor(_bal / _rate) END, 'end_reason', _s.end_reason,
    'paused', _s.paused_at IS NOT NULL AND _s.status = 'active', 'paused_at', _s.paused_at, 'pause_side', _s.pause_side,
    'other_here', CASE WHEN _me = 'user' THEN _wback ELSE _uback END,
    -- both are back after a drop: each side answers "Continue?"
    'resume_ask', _s.paused_at IS NOT NULL AND _s.status = 'active' AND _uback AND _wback,
    'my_answer', CASE WHEN _me = 'user' THEN _s.resume_user ELSE _s.resume_worker END,
    'other_answer', CASE WHEN _me = 'user' THEN _s.resume_worker ELSE _s.resume_user END,
    'low_balance', _rate > 0 AND _bal < _rate * public.setting_num('low_balance_resume_minutes', 2),
    'refunded', _s.refunded_credits);
END $$;
REVOKE ALL ON FUNCTION public.session_state(uuid) FROM public, anon, authenticated;

-- The app ticks every 10 s while the session screen is open: marks this side present, checks the other side, bills.
CREATE OR REPLACE FUNCTION public.session_tick(_sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions;
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  IF _s.status = 'active' THEN
    -- check first, so a side coming back after a long gap is not counted as present for the gap
    PERFORM public.session_presence_check(_sid);
    IF auth.uid() = _s.user_id THEN UPDATE public.consult_sessions SET user_seen_at = now() WHERE id=_sid;
    ELSE UPDATE public.consult_sessions SET worker_seen_at = now() WHERE id=_sid; END IF;
    SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
    IF _s.status = 'active' AND _s.paused_at IS NULL THEN PERFORM public.session_bill_at(_sid, false, now()); END IF;
  END IF;
  RETURN public.session_state(_sid);
END $$;

-- "Continue the session?" after a drop. Both yes = billing resumes; any no = the session ends.
CREATE OR REPLACE FUNCTION public.session_resume_answer(_sid uuid, _yes boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _st jsonb; _r record;
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  IF _s.status <> 'active' OR _s.paused_at IS NULL THEN RETURN public.session_state(_sid); END IF;
  IF NOT _yes THEN
    UPDATE public.consult_sessions SET status='ended', ended_at=now(), ended_by=auth.uid(), end_reason='not_resumed' WHERE id=_sid;
    RETURN public.session_state(_sid);
  END IF;
  _st := public.session_state(_sid);
  IF auth.uid() = _s.user_id AND (_st->>'low_balance')::boolean THEN
    UPDATE public.consult_sessions SET status='ended', ended_at=now(), ended_by=auth.uid(), end_reason='low_balance' WHERE id=_sid;
    RETURN public.session_state(_sid);
  END IF;
  IF auth.uid() = _s.user_id THEN UPDATE public.consult_sessions SET resume_user = true, user_seen_at = now() WHERE id=_sid;
  ELSE UPDATE public.consult_sessions SET resume_worker = true, worker_seen_at = now() WHERE id=_sid; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.resume_user AND _s.resume_worker THEN
    SELECT * INTO _r FROM public.rate_for(_s.node_slug, _s.current_mode);
    INSERT INTO public.session_segments(session_id, mode, rate) VALUES (_sid, _s.current_mode,
      COALESCE((SELECT rate FROM public.session_segments WHERE session_id=_sid ORDER BY id DESC LIMIT 1), _r.credits_per_min));
    UPDATE public.consult_sessions SET paused_at=NULL, pause_side=NULL, resume_user=NULL, resume_worker=NULL WHERE id=_sid;
    INSERT INTO public.consult_messages(session_id,sender,body,kind) VALUES (_sid, auth.uid(), 'session_resumed','system');
  END IF;
  RETURN public.session_state(_sid);
END $$;
REVOKE ALL ON FUNCTION public.session_resume_answer(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.session_resume_answer(uuid, boolean) TO authenticated;

-- End: remembers who ended it. A worker who ends (or drops) within early_end_refund_minutes without sending
-- a single message gives the user a full refund and gets a no-show count.
CREATE OR REPLACE FUNCTION public.session_end(_sid uuid, _reason text DEFAULT 'ended') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions;
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  IF _s.status = 'active' THEN
    IF _s.paused_at IS NULL THEN PERFORM public.session_bill_at(_sid, true, now()); END IF;
    UPDATE public.session_calls SET status='ended', ended_at=now() WHERE session_id=_sid AND status IN ('ringing','active');
    UPDATE public.consult_sessions SET status='ended', ended_at=COALESCE(ended_at, now()), ended_by=auth.uid(),
      end_reason=COALESCE(end_reason, left(_reason,40)) WHERE id=_sid AND status='active';
  END IF;
  RETURN public.session_state(_sid);
END $$;

CREATE OR REPLACE FUNCTION public.session_early_end_refund() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _amt numeric; _uw uuid; _worker_left boolean;
BEGIN
  IF NOT (OLD.status = 'active' AND NEW.status = 'ended') THEN RETURN NULL; END IF;
  _worker_left := COALESCE(NEW.ended_by = NEW.worker_user_id, false) OR COALESCE(NEW.end_reason = 'dropped' AND NEW.pause_side = 'worker', false);
  IF NOT _worker_left OR COALESCE(NEW.ended_at, now()) > NEW.started_at + make_interval(mins => public.setting_num('early_end_refund_minutes', 2)::int)
     OR EXISTS (SELECT 1 FROM public.consult_messages m WHERE m.session_id = NEW.id AND m.sender = NEW.worker_user_id AND m.kind <> 'system') THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET noshow_count = noshow_count + 1 WHERE id = NEW.worker_id;
  PERFORM set_config('meiyiyal.trusted','off',true);
  _amt := NEW.credits_used;
  IF _amt > 0 THEN
    _uw := public.wallet_id_for(NEW.user_id);
    UPDATE public.wallets SET balance = balance + _amt WHERE id = _uw;
    INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_uw,'refund',_amt,'Refund: consultation ended early',NEW.id::text);
    -- mirror every earning row with a reversal (same hold time, so held/available totals stay right)
    INSERT INTO public.worker_earnings(worker_user_id,session_id,mode,minutes,gross,commission_pct,commission,net,available_at)
    SELECT worker_user_id, session_id, 'refund', -minutes, -gross, commission_pct, -commission, -net, available_at
    FROM public.worker_earnings WHERE session_id = NEW.id AND payout_id IS NULL AND gross > 0;
  END IF;
  UPDATE public.consult_sessions SET refunded_credits = _amt, credits_used = 0, end_reason = 'early_end' WHERE id = NEW.id;
  PERFORM public.worker_refresh(NEW.worker_id);
  PERFORM public.notify(NEW.user_id, 'session.early_end', jsonb_build_object('name', (SELECT display_name FROM public.workers WHERE id = NEW.worker_id), 'amount', _amt),
    '/session/' || NEW.id, 'early-' || NEW.id, NULL, 'early-' || NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS session_early_end_refund ON public.consult_sessions;
CREATE TRIGGER session_early_end_refund AFTER UPDATE OF status ON public.consult_sessions FOR EACH ROW EXECUTE FUNCTION public.session_early_end_refund();

CREATE OR REPLACE FUNCTION public.trg_session_dropped_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wname text;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'ended' AND NEW.end_reason = 'dropped' THEN
    _wname := (SELECT display_name FROM public.workers WHERE id = NEW.worker_id);
    PERFORM public.notify(NEW.user_id, 'session.dropped', jsonb_build_object('name', _wname), '/session/' || NEW.id, 'drop-' || NEW.id, NULL, 'drop-u-' || NEW.id);
    PERFORM public.notify(NEW.worker_user_id, 'session.dropped', jsonb_build_object('name', public.push_user_name(NEW.user_id)), '/session/' || NEW.id, 'drop-' || NEW.id, NULL, 'drop-w-' || NEW.id);
  ELSIF NEW.paused_at IS NOT NULL AND OLD.paused_at IS NULL AND NEW.status = 'active' THEN
    -- tell the side that is still here, and wake the silent side's phone
    PERFORM public.notify(CASE WHEN NEW.pause_side = 'user' THEN NEW.user_id ELSE NEW.worker_user_id END, 'session.resume_ask',
      jsonb_build_object('name', CASE WHEN NEW.pause_side = 'user' THEN (SELECT display_name FROM public.workers WHERE id = NEW.worker_id) ELSE public.push_user_name(NEW.user_id) END),
      '/session/' || NEW.id, 'drop-' || NEW.id, NULL, 'pause-' || NEW.id || '-' || extract(epoch FROM NEW.paused_at)::bigint);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS session_dropped_push ON public.consult_sessions;
CREATE TRIGGER session_dropped_push AFTER UPDATE OF status, paused_at ON public.consult_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_session_dropped_push();

CREATE OR REPLACE FUNCTION public.session_presence_sweep() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _n int := 0; _drop interval := make_interval(secs => public.setting_num('session_drop_seconds', 30)::int);
BEGIN
  FOR _id IN SELECT id FROM public.consult_sessions WHERE status = 'active'
      AND (paused_at IS NOT NULL OR COALESCE(user_seen_at, started_at) < now() - _drop OR COALESCE(worker_seen_at, started_at) < now() - _drop) LOOP
    PERFORM public.session_presence_check(_id); _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.session_presence_sweep() FROM public, anon, authenticated;

-- session_info: + worker id (for one-tap reconnect), who ended, refund, reconnect window
CREATE OR REPLACE FUNCTION public.session_info(_sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _w public.workers; _me text; _uname text;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF NOT FOUND OR auth.uid() NOT IN (_s.user_id, _s.worker_user_id) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  SELECT * INTO _w FROM public.workers WHERE id=_s.worker_id;
  SELECT user_name INTO _uname FROM public.consult_requests WHERE id=_s.request_id;
  _me := CASE WHEN auth.uid() = _s.user_id THEN 'user' ELSE 'worker' END;
  RETURN jsonb_build_object('id',_s.id,'role',_me,'status',_s.status,'mode',_s.current_mode,'started_at',_s.started_at,'ended_at',_s.ended_at,
    'credits_used',_s.credits_used,'end_reason',_s.end_reason,'node_slug',_s.node_slug,
    'node_name',(SELECT name_i18n FROM public.taxonomy_nodes WHERE slug=_s.node_slug),
    'rates', public.rates_for(_s.node_slug), 'worker_id', _s.worker_id,
    'ended_by', CASE WHEN _s.ended_by IS NULL THEN NULL WHEN _s.ended_by = auth.uid() THEN 'me' ELSE 'other' END,
    'refunded', _s.refunded_credits,
    'reconnect_until', CASE WHEN _s.status = 'ended' AND _s.end_reason IN ('early_end','dropped','low_balance','credits_exhausted','not_resumed')
      THEN _s.ended_at + make_interval(mins => public.setting_num('reconnect_window_minutes', 10)::int) END,
    'other', CASE WHEN _me='user' THEN jsonb_build_object('name',_w.display_name,'photo',_w.photo_url,'user_id',_s.worker_user_id)
                  ELSE jsonb_build_object('name',COALESCE(_uname,'User'),'photo',(SELECT avatar_url FROM public.profiles WHERE user_id=_s.user_id),'user_id',_s.user_id) END);
END $$;

-- Older callers (mode switch, calls) bill through this; it now respects a pause.
CREATE OR REPLACE FUNCTION public.session_bill_internal(_sid uuid, _close boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT paused_at FROM public.consult_sessions WHERE id=_sid) IS NULL THEN PERFORM public.session_bill_at(_sid, _close, now()); END IF;
  RETURN public.session_state(_sid);
END $$;
REVOKE ALL ON FUNCTION public.session_bill_internal(uuid,boolean) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.session_switch_mode(_sid uuid, _mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _r record;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.status <> 'active' OR _s.current_mode = _mode THEN RETURN; END IF;
  IF _s.paused_at IS NOT NULL THEN UPDATE public.consult_sessions SET current_mode=_mode WHERE id=_sid; RETURN; END IF;  -- no billing while paused
  PERFORM public.session_bill_internal(_sid, true);
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.status <> 'active' THEN RETURN; END IF;
  SELECT * INTO _r FROM public.rate_for(_s.node_slug, _mode);
  INSERT INTO public.session_segments(session_id,mode,rate) VALUES (_sid,_mode,_r.credits_per_min);
  UPDATE public.consult_sessions SET current_mode=_mode WHERE id=_sid;
END $$;
REVOKE ALL ON FUNCTION public.session_switch_mode(uuid,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.call_start(_sid uuid, _mode text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _s public.consult_sessions; _r record; _bal numeric;
BEGIN
  IF NOT public.is_session_party(_sid) THEN RAISE EXCEPTION 'not your session' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid;
  IF _s.status <> 'active' THEN RAISE EXCEPTION 'session ended'; END IF;
  IF _s.paused_at IS NOT NULL THEN RAISE EXCEPTION 'session paused: reconnect first'; END IF;
  SELECT * INTO _r FROM public.rate_for(_s.node_slug, _mode);
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=_s.user_id;
  IF _bal < _r.credits_per_min THEN RAISE EXCEPTION 'insufficient credits for %', _mode; END IF;
  UPDATE public.session_calls SET status='missed', ended_at=now() WHERE session_id=_sid AND status='ringing' AND created_at < now() - interval '45 seconds';
  INSERT INTO public.session_calls(session_id,mode,caller) VALUES (_sid,_mode,auth.uid()) RETURNING id INTO _id;
  RETURN _id;
END $$;

-- =====================================================================================
-- 2. Workers: reliability counters; location/presence only through server functions
-- =====================================================================================
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS missed_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS noshow_count int NOT NULL DEFAULT 0;

-- Nearest-first is now the main order, so a worker must not be able to move their own pin or fake presence.
CREATE OR REPLACE FUNCTION public.guard_worker_reach_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.trusted() OR current_setting('request.jwt.claim.role', true) = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.missed_streak := 0; NEW.noshow_count := 0; RETURN NEW; END IF;
  IF (NEW.missed_streak, NEW.noshow_count, NEW.last_seen_at, NEW.base_geog::text, NEW.district_slug)
     IS DISTINCT FROM (OLD.missed_streak, OLD.noshow_count, OLD.last_seen_at, OLD.base_geog::text, OLD.district_slug) THEN
    RAISE EXCEPTION 'location and presence fields can only be changed by the server' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_worker_reach_fields ON public.workers;
CREATE TRIGGER guard_worker_reach_fields BEFORE INSERT OR UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.guard_worker_reach_fields();

-- One ring per worker at a time (auto mode would otherwise pile rings onto the nearest worker).
UPDATE public.consult_requests SET status='timeout', responded_at=now() WHERE status='ringing' AND expires_at < now();
UPDATE public.consult_requests q SET status='timeout', responded_at=now()
  WHERE q.status='ringing' AND EXISTS (SELECT 1 FROM public.consult_requests o WHERE o.worker_id=q.worker_id AND o.status='ringing' AND o.created_at > q.created_at);
CREATE UNIQUE INDEX IF NOT EXISTS consult_requests_one_ring_per_worker ON public.consult_requests(worker_id) WHERE status = 'ringing';

CREATE OR REPLACE FUNCTION public.worker_ringing(_wid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.consult_requests r WHERE r.worker_id = _wid AND r.status = 'ringing' AND r.expires_at > now()) $$;
REVOKE ALL ON FUNCTION public.worker_ringing(uuid) FROM public, anon, authenticated;

-- Shown distance: "< 1 km" (0) or whole km. Sorting always uses the true distance on the server.
CREATE OR REPLACE FUNCTION public.public_km(_m double precision) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _m IS NULL THEN NULL WHEN _m < 1000 THEN 0 ELSE round(_m / 1000.0) END::double precision $$;

-- =====================================================================================
-- 3. Messages to a worker (paid) + "I'm available now" reservation
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.worker_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  worker_user_id uuid NOT NULL,
  user_name text,
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 300),
  voice_path text, voice_seconds int CHECK (voice_seconds IS NULL OR voice_seconds BETWEEN 1 AND 30),
  credits numeric(8,2) NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','read','responded','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, responded_at timestamptz, reserved_until timestamptz, refunded_at timestamptz,
  CHECK (body IS NOT NULL OR voice_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS worker_messages_worker_idx ON public.worker_messages(worker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_messages_user_idx ON public.worker_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_messages_open_idx ON public.worker_messages(created_at) WHERE status IN ('sent','read');
ALTER TABLE public.worker_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parties read worker messages" ON public.worker_messages;
CREATE POLICY "parties read worker messages" ON public.worker_messages FOR SELECT USING (auth.uid() IN (user_id, worker_user_id));
REVOKE INSERT, UPDATE, DELETE ON public.worker_messages FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.worker_mutes (
  worker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_user_id, user_id)
);
ALTER TABLE public.worker_mutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worker reads own mutes" ON public.worker_mutes;
CREATE POLICY "worker reads own mutes" ON public.worker_mutes FOR SELECT USING (auth.uid() = worker_user_id);
REVOKE INSERT, UPDATE, DELETE ON public.worker_mutes FROM anon, authenticated;

-- voice notes: private; the sender writes into their own folder; the recipient worker can read through the message row
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-notes', 'voice-notes', false, 1048576, ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/wav'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "voice notes owner upload" ON storage.objects;
CREATE POLICY "voice notes owner upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "voice notes parties read" ON storage.objects;
CREATE POLICY "voice notes parties read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'voice-notes' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.worker_messages m WHERE m.voice_path = name AND m.worker_user_id = auth.uid())));

-- someone else holds this worker for a few minutes after "I'm available now"
CREATE OR REPLACE FUNCTION public.worker_reserved_for_other(_wid uuid, _uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.worker_messages m WHERE m.worker_id = _wid AND m.status = 'responded' AND m.reserved_until > now() AND m.user_id <> _uid) $$;
REVOKE ALL ON FUNCTION public.worker_reserved_for_other(uuid, uuid) FROM public, anon, authenticated;

-- phone numbers, e-mails and links are masked so contact stays inside the app
CREATE OR REPLACE FUNCTION public.mask_contact(_t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(_t,
    '(\+?\d[\d\s-]{8,}\d)', '•••', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '•••', 'g'),
    '(https?://|www\.)\S+', '•••', 'gi') $$;

CREATE OR REPLACE FUNCTION public.worker_message_send(_worker uuid, _body text DEFAULT NULL, _voice_path text DEFAULT NULL, _voice_seconds int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _cost numeric := public.setting_num('worker_message_credits', 5); _uw uuid; _bal numeric; _id uuid; _name text; _b text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO _w FROM public.workers WHERE id = _worker;
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active OR public.worker_is_blocked(_w) THEN RAISE EXCEPTION 'worker unavailable'; END IF;
  IF _w.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot message yourself'; END IF;
  _b := NULLIF(btrim(COALESCE(_body, '')), '');
  IF _b IS NULL AND _voice_path IS NULL THEN RAISE EXCEPTION 'write a message or record a voice note'; END IF;
  IF char_length(_b) > 300 THEN RAISE EXCEPTION 'message too long (max 300 letters)'; END IF;
  IF _voice_path IS NOT NULL AND (_voice_path NOT LIKE auth.uid()::text || '/%' OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'voice-notes' AND o.name = _voice_path)) THEN
    RAISE EXCEPTION 'voice note not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.worker_mutes m WHERE m.worker_user_id = _w.user_id AND m.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'this professional is not taking messages from you'; END IF;
  IF (SELECT count(*) FROM public.worker_messages WHERE user_id = auth.uid() AND worker_id = _worker AND created_at > now() - interval '1 day')
     >= public.setting_num('worker_message_daily_max', 3) THEN RAISE EXCEPTION 'daily message limit reached for this professional'; END IF;
  _uw := public.wallet_id_for(auth.uid());
  SELECT balance INTO _bal FROM public.wallets WHERE id = _uw FOR UPDATE;
  IF _bal < _cost THEN RAISE EXCEPTION 'insufficient credits: need % for a message', _cost; END IF;
  SELECT COALESCE(NULLIF(full_name,''), split_part(email,'@',1), 'User') INTO _name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.worker_messages(user_id, worker_id, worker_user_id, user_name, body, voice_path, voice_seconds, credits)
  VALUES (auth.uid(), _worker, _w.user_id, _name, public.mask_contact(_b), _voice_path, CASE WHEN _voice_path IS NOT NULL THEN LEAST(30, GREATEST(1, COALESCE(_voice_seconds, 1))) END, _cost)
  RETURNING id INTO _id;
  UPDATE public.wallets SET balance = balance - _cost WHERE id = _uw;
  INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_uw,'debit',-_cost,'Message to ' || COALESCE(_w.display_name,'professional'),_id::text);
  PERFORM public.notify(_w.user_id, 'worker.message', jsonb_build_object('name', public.push_first_name(_name)), '/messages', 'wmsg-' || _id);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.worker_message_read(_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.worker_messages SET status = 'read', read_at = now() WHERE id = _id AND worker_user_id = auth.uid() AND status = 'sent' $$;

-- "I'm available now": goes Online, holds the slot for this user for a few minutes, tells them to connect
CREATE OR REPLACE FUNCTION public.worker_message_respond(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.worker_messages; _w public.workers; _until timestamptz;
BEGIN
  SELECT * INTO _m FROM public.worker_messages WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _m.worker_user_id <> auth.uid() THEN RAISE EXCEPTION 'not your message' USING ERRCODE='42501'; END IF;
  IF _m.status NOT IN ('sent','read') THEN RAISE EXCEPTION 'message is %', _m.status; END IF;
  SELECT * INTO _w FROM public.workers WHERE id = _m.worker_id;
  IF _w.status <> 'approved' OR public.worker_is_blocked(_w) THEN RAISE EXCEPTION 'not approved yet' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE worker_id = _w.id AND status = 'active') THEN RAISE EXCEPTION 'finish your current session first'; END IF;
  _until := now() + make_interval(mins => public.setting_num('worker_message_reserve_minutes', 5)::int);
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET is_online = true, last_seen_at = now(), missed_streak = 0 WHERE id = _w.id;
  PERFORM set_config('meiyiyal.trusted','off',true);
  UPDATE public.worker_messages SET status = 'responded', responded_at = now(), read_at = COALESCE(read_at, now()), reserved_until = _until WHERE id = _id;
  PERFORM public.notify(_m.user_id, 'worker.available_for_you', jsonb_build_object('name', _w.display_name), '/w/' || _w.id || '?connect=1', 'wmsg-' || _id);
  RETURN jsonb_build_object('reserved_until', _until);
END $$;

CREATE OR REPLACE FUNCTION public.worker_mute_user(_message uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.worker_messages;
BEGIN
  SELECT * INTO _m FROM public.worker_messages WHERE id = _message;
  IF NOT FOUND OR _m.worker_user_id <> auth.uid() THEN RAISE EXCEPTION 'not your message' USING ERRCODE='42501'; END IF;
  INSERT INTO public.worker_mutes(worker_user_id, user_id) VALUES (auth.uid(), _m.user_id) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.my_worker_messages() RETURNS TABLE(id uuid, role text, other_name text, other_photo text, worker_id uuid, body text, voice_path text, voice_seconds int,
  credits numeric, status text, created_at timestamptz, responded_at timestamptz, reserved_until timestamptz, refund_at timestamptz, muted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, CASE WHEN m.worker_user_id = auth.uid() THEN 'worker' ELSE 'user' END,
    CASE WHEN m.worker_user_id = auth.uid() THEN COALESCE(m.user_name, 'User') ELSE w.display_name END,
    CASE WHEN m.worker_user_id = auth.uid() THEN (SELECT avatar_url FROM public.profiles WHERE user_id = m.user_id) ELSE w.photo_url END,
    m.worker_id, m.body, m.voice_path, m.voice_seconds, m.credits, m.status, m.created_at, m.responded_at, m.reserved_until,
    CASE WHEN m.status IN ('sent','read') THEN m.created_at + make_interval(hours => public.setting_num('worker_message_refund_hours', 24)::int) END,
    EXISTS (SELECT 1 FROM public.worker_mutes x WHERE x.worker_user_id = m.worker_user_id AND x.user_id = m.user_id)
  FROM public.worker_messages m JOIN public.workers w ON w.id = m.worker_id
  WHERE auth.uid() IN (m.user_id, m.worker_user_id)
  ORDER BY m.created_at DESC LIMIT 100 $$;

CREATE OR REPLACE FUNCTION public.worker_message_refund_due() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m record; _n int := 0; _uw uuid;
BEGIN
  FOR _m IN SELECT * FROM public.worker_messages WHERE status IN ('sent','read')
      AND created_at < now() - make_interval(hours => public.setting_num('worker_message_refund_hours', 24)::int) FOR UPDATE SKIP LOCKED LOOP
    _uw := public.wallet_id_for(_m.user_id);
    UPDATE public.wallets SET balance = balance + _m.credits WHERE id = _uw;
    INSERT INTO public.wallet_transactions(wallet_id,type,amount,description,reference_id) VALUES (_uw,'refund',_m.credits,'Refund: message not answered in time',_m.id::text);
    UPDATE public.worker_messages SET status = 'refunded', refunded_at = now() WHERE id = _m.id;
    PERFORM public.notify(_m.user_id, 'worker.message_refunded', jsonb_build_object('name', (SELECT display_name FROM public.workers WHERE id = _m.worker_id), 'amount', _m.credits),
      '/messages', 'wmsg-' || _m.id, NULL, 'wmsg-refund-' || _m.id);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.worker_message_refund_due() FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.worker_message_send(uuid, text, text, int), public.worker_message_read(uuid), public.worker_message_respond(uuid),
  public.worker_mute_user(uuid), public.my_worker_messages() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.worker_message_send(uuid, text, text, int), public.worker_message_read(uuid), public.worker_message_respond(uuid),
  public.worker_mute_user(uuid), public.my_worker_messages() TO authenticated;

-- =====================================================================================
-- 4. Search: available → busy → offline, nearest first (D1); flagged lower (D2); signed-in only; rounded km (D8)
-- =====================================================================================
DROP FUNCTION IF EXISTS public.search_workers(text, double precision, double precision, double precision, boolean, int);
CREATE OR REPLACE FUNCTION public.search_workers(_node text, _lat double precision, _lng double precision,
  _radius_km double precision DEFAULT 50, _all boolean DEFAULT false, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, rewards_count int, years_experience int,
  primary_node text, specialty jsonb, is_online boolean, is_busy boolean, distance_km double precision, district_slug text, district_name jsonb, rates jsonb, badges jsonb,
  badge_tier text, verified_at timestamptz, availability text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography g),
  c AS (
    SELECT w.*, ST_Distance(w.base_geog, p.g) AS dist, public.worker_reachable(w) AS reach,
      EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id = w.id AND s.status = 'active') AS in_session,
      public.worker_ringing(w.id) OR public.worker_reserved_for_other(w.id, auth.uid()) AS held
    FROM public.workers w CROSS JOIN p
    WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
      AND (w.blocked_until IS NULL OR w.blocked_until <= now())
      AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _node OR n.node_slug LIKE _node || '--%'))
      AND (_all OR ST_DWithin(w.base_geog, p.g, _radius_km * 1000)))
  SELECT c.id, c.display_name, c.photo_url, c.rating, c.total_reviews, c.rewards_count, c.years_experience,
    c.primary_node, t.name_i18n, c.reach, c.in_session OR (c.reach AND c.held),
    public.public_km(c.dist), c.district_slug, d.name_i18n, public.rates_for(c.primary_node),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', m.slug, 'icon', m.icon, 'color', m.color, 'title', m.title_i18n) ORDER BY m.sort DESC)
              FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug = r.milestone WHERE r.worker_id = c.id), '[]'),
    c.badge_tier, c.verified_at,
    CASE WHEN NOT c.reach THEN 'offline' WHEN c.in_session OR c.held THEN 'busy' ELSE 'available' END
  FROM c
  LEFT JOIN public.taxonomy_nodes t ON t.slug = c.primary_node
  LEFT JOIN public.tn_districts d ON d.slug = c.district_slug
  ORDER BY CASE WHEN NOT c.reach THEN 2 WHEN c.in_session OR c.held THEN 1 ELSE 0 END, c.flag_active, c.dist, c.id
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;
REVOKE ALL ON FUNCTION public.search_workers(text, double precision, double precision, double precision, boolean, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_workers(text, double precision, double precision, double precision, boolean, int) TO authenticated;

-- 2–3 people to try instead: same category, available now, nearest first. Doctors/engineers prefer rating ≥ 4 (or new)
-- among the nearest 10; lawyers are never picked by rating (Bar Council rule), distance only.
CREATE OR REPLACE FUNCTION public.search_suggestions(_node text, _lat double precision, _lng double precision, _exclude uuid[] DEFAULT '{}', _n int DEFAULT 3)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, years_experience int, primary_node text, specialty jsonb,
  distance_km double precision, rates jsonb, badge_tier text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _lawyer boolean := public.node_category(_node) = 'professionals--lawyer';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH s AS (SELECT * FROM public.search_workers(_node, _lat, _lng, public.setting_num('search_radius_km', 50), false, 60) x
             WHERE x.availability = 'available' AND NOT (x.id = ANY(COALESCE(_exclude, '{}'))) LIMIT 10)
  SELECT s.id, s.display_name, s.photo_url, s.rating, s.feedback_count, s.years_experience, s.primary_node, s.specialty, s.distance_km, s.rates, s.badge_tier
  FROM (SELECT s.*, row_number() OVER () AS pos FROM s) s
  ORDER BY CASE WHEN _lawyer THEN 0 WHEN s.feedback_count = 0 OR s.rating >= 4 THEN 0 ELSE 1 END, s.pos
  LIMIT LEAST(GREATEST(_n, 1), 5);
END $$;
REVOKE ALL ON FUNCTION public.search_suggestions(text, double precision, double precision, uuid[], int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_suggestions(text, double precision, double precision, uuid[], int) TO authenticated;

-- =====================================================================================
-- 5. Auto request: one server-side job rings the nearest available worker, then the next (D3–D7)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.consult_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_slug text NOT NULL REFERENCES public.taxonomy_nodes(slug),
  mode text NOT NULL CHECK (mode IN ('chat','voice','video')),
  geog geography(Point,4326) NOT NULL,
  max_rate numeric(8,2) NOT NULL,           -- the price the user agreed to; never ring a costlier specialty
  status text NOT NULL DEFAULT 'searching' CHECK (status IN ('searching','matched','exhausted','cancelled')),
  reason text CHECK (reason IN ('cap','none_left','no_credits')),
  all_tn boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0, round_attempts int NOT NULL DEFAULT 0,
  tried uuid[] NOT NULL DEFAULT '{}',
  current_request uuid, session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS consult_searches_one_live ON public.consult_searches(user_id) WHERE status = 'searching';
CREATE INDEX IF NOT EXISTS consult_searches_user_idx ON public.consult_searches(user_id, created_at DESC);
ALTER TABLE public.consult_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own searches" ON public.consult_searches;
CREATE POLICY "own searches" ON public.consult_searches FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.consult_searches FROM anon, authenticated;
ALTER TABLE public.consult_requests ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES public.consult_searches(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consult_searches;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- requests counted for the rate limit: a whole auto search is one
CREATE OR REPLACE FUNCTION public.recent_request_count(_uid uuid) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT COALESCE(search_id, id))::int FROM public.consult_requests WHERE user_id = _uid AND created_at > now() - interval '10 minutes' $$;
REVOKE ALL ON FUNCTION public.recent_request_count(uuid) FROM public, anon, authenticated;

-- Rings the next nearest available worker for a live search. Called on start, after each decline/timeout, and on "try more".
CREATE OR REPLACE FUNCTION public.search_advance(_sid uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_searches; _cand record; _rid uuid; _name text; _bal numeric; _radius double precision := public.setting_num('search_radius_km', 50);
BEGIN
  SELECT * INTO _s FROM public.consult_searches WHERE id = _sid FOR UPDATE;
  IF NOT FOUND OR _s.status <> 'searching' THEN RETURN NULL; END IF;
  IF _s.current_request IS NOT NULL AND EXISTS (SELECT 1 FROM public.consult_requests WHERE id = _s.current_request AND status = 'ringing') THEN RETURN _s.current_request; END IF;
  IF _s.round_attempts >= public.setting_num('auto_request_max', 5) THEN
    UPDATE public.consult_searches SET status = 'exhausted', reason = 'cap', current_request = NULL, updated_at = now() WHERE id = _sid;
    PERFORM public.notify(_s.user_id, 'search.exhausted', jsonb_build_object('tried', _s.attempts, 'reason', 'cap'), '/', 'search-' || _sid, NULL, 'search-cap-' || _sid || '-' || _s.attempts);
    RETURN NULL;
  END IF;
  SELECT COALESCE(NULLIF(full_name,''), split_part(email,'@',1), 'User') INTO _name FROM public.profiles WHERE user_id = _s.user_id;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id = _s.user_id;
  FOR _cand IN
    SELECT w.id, w.user_id, w.primary_node, r.credits_per_min, r.min_minutes
    FROM public.workers w
    CROSS JOIN LATERAL public.rate_for(w.primary_node, _s.mode) r
    WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
      AND (w.blocked_until IS NULL OR w.blocked_until <= now())
      AND w.user_id <> _s.user_id AND NOT (w.id = ANY(_s.tried))
      AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _s.node_slug OR n.node_slug LIKE _s.node_slug || '--%'))
      AND (_s.all_tn OR ST_DWithin(w.base_geog, _s.geog, _radius * 1000))
      AND public.worker_reachable(w)
      AND NOT EXISTS (SELECT 1 FROM public.consult_sessions x WHERE x.worker_id = w.id AND x.status = 'active')
      AND NOT public.worker_ringing(w.id)
      AND NOT public.worker_reserved_for_other(w.id, _s.user_id)
      AND r.credits_per_min <= _s.max_rate
    ORDER BY w.flag_active, ST_Distance(w.base_geog, _s.geog), w.id
  LOOP
    IF _bal < _cand.credits_per_min * _cand.min_minutes THEN CONTINUE; END IF;
    BEGIN
      INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at, search_id)
      VALUES (_s.user_id, _cand.id, _cand.user_id, _cand.primary_node, _s.mode, _cand.credits_per_min, _cand.min_minutes, COALESCE(_name, 'User'),
              now() + make_interval(secs => public.setting_num('auto_ring_seconds', 30)::int), _sid)
      RETURNING id INTO _rid;
    EXCEPTION WHEN unique_violation THEN CONTINUE;   -- someone else started ringing this worker a moment ago
    END;
    UPDATE public.consult_searches SET tried = tried || _cand.id, attempts = attempts + 1, round_attempts = round_attempts + 1,
      current_request = _rid, updated_at = now() WHERE id = _sid;
    RETURN _rid;
  END LOOP;
  UPDATE public.consult_searches SET status = 'exhausted', reason = 'none_left', current_request = NULL, updated_at = now() WHERE id = _sid;
  PERFORM public.notify(_s.user_id, 'search.exhausted', jsonb_build_object('tried', _s.attempts, 'reason', 'none_left'), '/', 'search-' || _sid, NULL, 'search-none-' || _sid || '-' || _s.attempts);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.search_advance(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_view(_sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_searches; _q public.consult_requests; _w public.workers;
BEGIN
  SELECT * INTO _s FROM public.consult_searches WHERE id = _sid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF _s.current_request IS NOT NULL THEN SELECT * INTO _q FROM public.consult_requests WHERE id = _s.current_request; END IF;
  IF _q.id IS NOT NULL THEN SELECT * INTO _w FROM public.workers WHERE id = _q.worker_id; END IF;
  RETURN jsonb_build_object('id', _s.id, 'status', _s.status, 'reason', _s.reason, 'node', _s.node_slug, 'mode', _s.mode, 'all_tn', _s.all_tn,
    'attempts', _s.attempts, 'round_attempts', _s.round_attempts, 'max', public.setting_num('auto_request_max', 5), 'session_id', _s.session_id,
    'max_rate', _s.max_rate,
    -- people already rung (for "send a message instead"), nearest first
    'tried', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name', w.display_name, 'photo', w.photo_url,
        'distance_km', public.public_km(ST_Distance(w.base_geog, _s.geog))) ORDER BY ST_Distance(w.base_geog, _s.geog))
      FROM public.workers w WHERE w.id = ANY(_s.tried)), '[]'::jsonb),
    'current', CASE WHEN _q.id IS NOT NULL AND _q.status = 'ringing' THEN jsonb_build_object('request_id', _q.id, 'expires_at', _q.expires_at, 'rate', _q.rate,
      'worker', jsonb_build_object('id', _w.id, 'name', _w.display_name, 'photo', _w.photo_url,
        'specialty', (SELECT name_i18n FROM public.taxonomy_nodes WHERE slug = _w.primary_node),
        'distance_km', public.public_km(ST_Distance(_w.base_geog, _s.geog)))) END);
END $$;
REVOKE ALL ON FUNCTION public.search_view(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_start(_node text, _mode text, _lat double precision, _lng double precision, _all boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _bal numeric; _id uuid; _kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('chat','voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'set your location first'; END IF;
  SELECT kind INTO _kind FROM public.taxonomy_nodes WHERE slug = _node AND is_active;
  IF _kind IS NULL OR _kind NOT IN ('subcategory','specialty') THEN RAISE EXCEPTION 'pick a specialty first'; END IF;
  PERFORM public.request_expire_due();
  IF EXISTS (SELECT 1 FROM public.consult_searches WHERE user_id = auth.uid() AND status = 'searching') THEN RAISE EXCEPTION 'you already have a search running'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_requests WHERE user_id = auth.uid() AND status = 'ringing') THEN RAISE EXCEPTION 'you already have a ringing request'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE user_id = auth.uid() AND status = 'active') THEN RAISE EXCEPTION 'finish your current consultation first'; END IF;
  IF public.recent_request_count(auth.uid()) >= 10 THEN RAISE EXCEPTION 'too many requests'; END IF;
  SELECT * INTO _r FROM public.rate_for(_node, _mode);
  IF _r IS NULL OR _r.credits_per_min IS NULL THEN RAISE EXCEPTION 'no rate configured'; END IF;
  PERFORM public.wallet_id_for(auth.uid());
  SELECT balance INTO _bal FROM public.wallets WHERE user_id = auth.uid();
  IF _bal < _r.credits_per_min * _r.min_minutes THEN RAISE EXCEPTION 'insufficient credits: need % for % min', _r.credits_per_min * _r.min_minutes, _r.min_minutes; END IF;
  INSERT INTO public.consult_searches(user_id, node_slug, mode, geog, max_rate, all_tn)
  VALUES (auth.uid(), _node, _mode, ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography, _r.credits_per_min, COALESCE(_all, false))
  RETURNING id INTO _id;
  PERFORM public.search_advance(_id);
  RETURN public.search_view(_id);
END $$;

CREATE OR REPLACE FUNCTION public.search_tick(_sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.consult_searches WHERE id = _sid AND user_id = auth.uid()) THEN RAISE EXCEPTION 'not your search' USING ERRCODE='42501'; END IF;
  PERFORM public.request_expire_due();   -- an expired ring advances the search (trigger)
  PERFORM public.search_advance(_sid);   -- safety net if a ring ended without advancing
  RETURN public.search_view(_sid);
END $$;

CREATE OR REPLACE FUNCTION public.search_cancel(_sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_searches;
BEGIN
  SELECT * INTO _s FROM public.consult_searches WHERE id = _sid AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not your search' USING ERRCODE='42501'; END IF;
  IF _s.status IN ('searching','exhausted') THEN
    UPDATE public.consult_searches SET status = 'cancelled', current_request = NULL, ended_at = now(), updated_at = now() WHERE id = _sid;
    UPDATE public.consult_requests SET status = 'cancelled', responded_at = now() WHERE search_id = _sid AND status = 'ringing';
  END IF;
  RETURN public.search_view(_sid);
END $$;

-- "Try 5 more" / "All of Tamil Nadu"
CREATE OR REPLACE FUNCTION public.search_continue(_sid uuid, _all boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_searches; _bal numeric;
BEGIN
  SELECT * INTO _s FROM public.consult_searches WHERE id = _sid AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not your search' USING ERRCODE='42501'; END IF;
  IF _s.status <> 'exhausted' THEN RETURN public.search_view(_sid); END IF;
  IF EXISTS (SELECT 1 FROM public.consult_searches WHERE user_id = auth.uid() AND status = 'searching') THEN RAISE EXCEPTION 'you already have a search running'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE user_id = auth.uid() AND status = 'active') THEN RAISE EXCEPTION 'finish your current consultation first'; END IF;
  SELECT balance INTO _bal FROM public.wallets WHERE user_id = auth.uid();
  IF _bal < _s.max_rate * COALESCE((SELECT min_minutes FROM public.rate_for(_s.node_slug, _s.mode)), 1) THEN RAISE EXCEPTION 'insufficient credits: please recharge'; END IF;
  UPDATE public.consult_searches SET status = 'searching', reason = NULL, round_attempts = 0, all_tn = all_tn OR COALESCE(_all, false), updated_at = now() WHERE id = _sid;
  PERFORM public.search_advance(_sid);
  RETURN public.search_view(_sid);
END $$;

CREATE OR REPLACE FUNCTION public.my_live_search() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.search_view(id) FROM public.consult_searches WHERE user_id = auth.uid() AND status IN ('searching','exhausted')
    AND updated_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 1 $$;

REVOKE ALL ON FUNCTION public.search_start(text, text, double precision, double precision, boolean), public.search_tick(uuid), public.search_cancel(uuid),
  public.search_continue(uuid, boolean), public.my_live_search() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_start(text, text, double precision, double precision, boolean), public.search_tick(uuid), public.search_cancel(uuid),
  public.search_continue(uuid, boolean), public.my_live_search() TO authenticated;

-- A ring ended: move the search on, keep the worker's missed-ring streak (D7).
CREATE OR REPLACE FUNCTION public.trg_request_outcome() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _prev text := current_setting('meiyiyal.trusted', true);
BEGIN
  IF OLD.status <> 'ringing' OR NEW.status = OLD.status THEN RETURN NULL; END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  IF NEW.status = 'timeout' THEN
    UPDATE public.workers SET missed_streak = missed_streak + 1 WHERE id = NEW.worker_id RETURNING * INTO _w;
    IF _w.missed_streak >= public.setting_num('missed_rings_offline', 3) AND _w.is_online THEN
      UPDATE public.workers SET is_online = false, missed_streak = 0 WHERE id = _w.id;
      PERFORM public.notify(_w.user_id, 'worker.auto_offline', jsonb_build_object('count', public.setting_num('missed_rings_offline', 3)), '/?tab=worker', 'auto-offline', NULL,
        'auto-offline-' || _w.id || '-' || extract(epoch FROM now())::bigint);
    END IF;
  ELSIF NEW.status IN ('accepted','declined') THEN
    UPDATE public.workers SET missed_streak = 0 WHERE id = NEW.worker_id AND missed_streak <> 0;
  END IF;
  PERFORM set_config('meiyiyal.trusted', COALESCE(NULLIF(_prev,''),'off'), true);
  IF NEW.search_id IS NOT NULL THEN
    IF NEW.status = 'accepted' THEN
      UPDATE public.consult_searches SET status = 'matched', session_id = NEW.session_id, current_request = NULL, ended_at = now(), updated_at = now()
        WHERE id = NEW.search_id AND status = 'searching';
      UPDATE public.consult_sessions SET search_id = NEW.search_id WHERE id = NEW.session_id;
    ELSIF NEW.status IN ('declined','timeout') THEN
      PERFORM public.search_advance(NEW.search_id);
    ELSIF NEW.status = 'cancelled' THEN   -- the user stopped the ring: stop the whole search
      UPDATE public.consult_searches SET status = 'cancelled', current_request = NULL, ended_at = now(), updated_at = now()
        WHERE id = NEW.search_id AND status = 'searching';
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS request_outcome ON public.consult_requests;
CREATE TRIGGER request_outcome AFTER UPDATE OF status ON public.consult_requests FOR EACH ROW EXECUTE FUNCTION public.trg_request_outcome();

-- Manual request: + one ring per worker, ask-again pacing, "available for you" hold; a whole auto search counts once.
CREATE OR REPLACE FUNCTION public.request_create(_worker uuid, _mode text, _node text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _r record; _bal numeric; _id uuid; _name text; _last timestamptz; _misses int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('chat','voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  PERFORM public.request_expire_due();
  SELECT * INTO _w FROM public.workers WHERE id=_worker;
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active THEN RAISE EXCEPTION 'worker unavailable'; END IF;
  IF _w.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot request yourself'; END IF;
  IF NOT public.worker_reachable(_w) THEN RAISE EXCEPTION 'worker offline'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE worker_id=_worker AND status='active') THEN RAISE EXCEPTION 'worker busy'; END IF;
  IF public.worker_ringing(_worker) OR public.worker_reserved_for_other(_worker, auth.uid()) THEN RAISE EXCEPTION 'worker busy'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_requests WHERE user_id=auth.uid() AND status='ringing') THEN RAISE EXCEPTION 'you already have a ringing request'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_searches WHERE user_id=auth.uid() AND status='searching') THEN RAISE EXCEPTION 'you already have a search running'; END IF;
  IF public.recent_request_count(auth.uid()) >= 10 THEN RAISE EXCEPTION 'too many requests'; END IF;
  -- asking the same person again: wait a minute, and only once more in 30 minutes
  SELECT max(responded_at), count(*) INTO _last, _misses FROM public.consult_requests
    WHERE user_id = auth.uid() AND worker_id = _worker AND status IN ('declined','timeout') AND search_id IS NULL AND created_at > now() - interval '30 minutes';
  IF _misses >= 2 THEN RAISE EXCEPTION 'asked twice already: send a message or try someone else'; END IF;
  IF _last > now() - make_interval(secs => public.setting_num('ask_again_wait_seconds', 60)::int) THEN RAISE EXCEPTION 'please wait a minute before asking again'; END IF;
  SELECT * INTO _r FROM public.rate_for(COALESCE(_node, _w.primary_node), _mode);
  IF _r IS NULL OR _r.credits_per_min IS NULL THEN RAISE EXCEPTION 'no rate configured'; END IF;
  PERFORM public.wallet_id_for(auth.uid());
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=auth.uid();
  IF _bal < _r.credits_per_min * _r.min_minutes THEN RAISE EXCEPTION 'insufficient credits: need % for % min', _r.credits_per_min * _r.min_minutes, _r.min_minutes; END IF;
  SELECT COALESCE(NULLIF(full_name,''), split_part(email,'@',1), 'User') INTO _name FROM public.profiles WHERE user_id=auth.uid();
  BEGIN
    INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
    VALUES (auth.uid(), _worker, _w.user_id, _w.primary_node, _mode, _r.credits_per_min, _r.min_minutes, COALESCE(_name,'User'),
            now() + make_interval(secs => COALESCE((public.setting('ring_seconds')#>>'{}')::int, 45)))
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'worker busy';
  END;
  -- a used "available for you" hold is done
  UPDATE public.worker_messages SET reserved_until = now() WHERE worker_id = _worker AND user_id = auth.uid() AND reserved_until > now();
  RETURN _id;
END $$;

-- inside an auto search the user hears only the final outcome, not every "X couldn't take it"
CREATE OR REPLACE FUNCTION public.trg_push_requests() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wname text := (SELECT display_name FROM public.workers WHERE id = NEW.worker_id); _cname text := public.push_first_name(NEW.user_name);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ringing' THEN
      PERFORM public.notify(NEW.worker_user_id, 'request.incoming',
        jsonb_build_object('name', _cname, 'mode', NEW.mode, 'request_id', NEW.id, 'seconds', GREATEST(1, ceil(extract(epoch FROM NEW.expires_at - now())))::int),
        '/?ring=' || NEW.id, 'req-' || NEW.id);
    END IF;
    RETURN NULL;
  END IF;
  IF OLD.status <> 'ringing' OR NEW.status = OLD.status THEN RETURN NULL; END IF;
  IF NEW.status = 'accepted' THEN
    PERFORM public.notify(NEW.user_id, 'request.accepted', jsonb_build_object('name', _wname, 'mode', NEW.mode),
      COALESCE('/session/' || NEW.session_id, '/history'), 'req-' || NEW.id);
  ELSIF NEW.status = 'declined' THEN
    IF NEW.search_id IS NULL THEN
      PERFORM public.notify(NEW.user_id, 'request.declined', jsonb_build_object('name', _wname, 'reason', 'declined'), '/', 'req-' || NEW.id);
    END IF;
  ELSIF NEW.status = 'timeout' THEN
    PERFORM public.notify(NEW.worker_user_id, 'request.missed', jsonb_build_object('name', _cname, 'mode', NEW.mode), '/history', 'req-' || NEW.id);
    IF NEW.search_id IS NULL THEN
      PERFORM public.notify(NEW.user_id, 'request.declined', jsonb_build_object('name', _wname, 'reason', 'timeout'), '/', 'req-' || NEW.id);
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM public.notify(NEW.worker_user_id, 'request.missed', jsonb_build_object('name', _cname, 'mode', NEW.mode), '/history', 'req-' || NEW.id);
  END IF;
  RETURN NULL;
END $$;

-- new kinds: categories and priority
CREATE OR REPLACE FUNCTION public.push_kind_meta(_kind text, OUT category text, OUT priority text, OUT always boolean)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE
      WHEN _kind IN ('request.incoming','request.missed','request.accepted','request.declined','call.incoming','search.exhausted',
                     'worker.message','worker.available_for_you','session.dropped','session.resume_ask') THEN 'requests'
      WHEN _kind = 'chat.message' THEN 'chat'
      WHEN _kind LIKE 'payment.%' OR _kind LIKE 'payout.%' OR _kind LIKE 'payout_account.%' OR _kind IN ('session.credits_out','session.early_end','worker.message_refunded') THEN 'money'
      WHEN _kind LIKE 'verify.%' OR _kind LIKE 'account.%' OR _kind LIKE 'appeal.%' OR _kind IN ('reward.earned','worker.auto_offline') THEN 'account'
      WHEN _kind LIKE 'admin.%' THEN 'admin'
      WHEN _kind = 'feedback.reminder' THEN 'promos'
      ELSE 'system' END,
    CASE WHEN _kind IN ('request.incoming','call.incoming','request.accepted','worker.available_for_you','session.resume_ask') THEN 'urgent' ELSE 'normal' END,
    _kind IN ('payout.failed','account.blocked','verify.rejected','verify.needs_info','appeal.upheld','worker.auto_offline')
$$;

-- =====================================================================================
-- 6. Fast sweep every 5 s: expire rings (advances searches), pause/end silent sessions, refund old messages
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.fast_sweep() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e int; _p int; _m int; _s int := 0; _id uuid;
BEGIN
  _e := public.request_expire_due();
  -- searches whose ring ended without advancing (safety net)
  FOR _id IN SELECT s.id FROM public.consult_searches s WHERE s.status = 'searching'
      AND (s.current_request IS NULL OR NOT EXISTS (SELECT 1 FROM public.consult_requests q WHERE q.id = s.current_request AND q.status = 'ringing')) LOOP
    PERFORM public.search_advance(_id); _s := _s + 1;
  END LOOP;
  _p := public.session_presence_sweep();
  _m := public.worker_message_refund_due();
  IF EXISTS (SELECT 1 FROM public.notifications WHERE push_status = 'pending') THEN PERFORM public.push_kick(); END IF;
  RETURN jsonb_build_object('expired', _e, 'searches', _s, 'sessions', _p, 'refunds', _m);
END $$;
REVOKE ALL ON FUNCTION public.fast_sweep() FROM public, anon, authenticated;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fast-sweep';
  PERFORM cron.schedule('fast-sweep', '5 seconds', 'SELECT public.fast_sweep()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable: call fast_sweep() on a schedule instead (%)', SQLERRM;
END $$;

-- =====================================================================================
-- 7. Everyday words for search (EN / Tamil / Tanglish)
-- =====================================================================================
CREATE OR REPLACE FUNCTION pg_temp.addsyn(_slug text, _words text[]) RETURNS void LANGUAGE sql AS $$
  UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || _words)) WHERE slug = _slug $$;
SELECT pg_temp.addsyn('professionals--doctor--veterinary--pet-small-animal', ARRAY['dog','dogs','puppy','cat','kitten','pet','my pet','pet sick','dog sick','sick dog','நாய்','நாய்க்குட்டி','பூனை','செல்லப்பிராணி','naai','poonai']);
SELECT pg_temp.addsyn('professionals--doctor--veterinary--livestock', ARRAY['cow','cows','buffalo','goat','goats','sheep','calf','cattle','மாடு','மாட்டு','பசு','எருமை','ஆடு','ஆட்டு','கன்று','maadu','pasu','aadu','erumai']);
SELECT pg_temp.addsyn('professionals--doctor--veterinary--poultry', ARRAY['hen','hens','chicken','poultry farm','கோழி','koli','kozhi']);
SELECT pg_temp.addsyn('professionals--engineer--civil--structural', ARRAY['wall crack','cracks in wall','crack','cracks','wall cracked','roof leak','leakage','seepage','pillar crack','சுவர் விரிசல்','விரிசல்','ஒழுகுது','கசிவு','suvar virisal','virisal']);
SELECT pg_temp.addsyn('professionals--doctor--allopathy--paediatrics', ARRAY['child fever','kid fever','baby fever','baby doctor','child doctor','kids doctor','குழந்தைக்கு காய்ச்சல்','குழந்தை காய்ச்சல்','kulanthai','kuzhanthai','pillai doctor']);
SELECT pg_temp.addsyn('professionals--lawyer--family-divorce', ARRAY['divorce case','separation','husband wife problem','dowry','domestic violence','talaq','மனைவி பிரச்சனை','கணவன் மனைவி','வரதட்சணை','விவாகரத்து வழக்கு','vivakarathu','vivaagarathu']);
SELECT pg_temp.addsyn('professionals--lawyer--property-land', ARRAY['land case','land problem','patta name change','patta transfer','boundary dispute','encroachment','inheritance','partition','நில பிரச்சனை','பட்டா மாற்றம்','எல்லை பிரச்சனை','பாகப்பிரிவினை','nila prachanai','patta maatram']);
-- "will" alone matched "I will need a doctor" → only the full phrases now
UPDATE public.taxonomy_nodes SET synonyms = array_remove(synonyms, 'will') WHERE 'will' = ANY(synonyms);
SELECT pg_temp.addsyn('professionals--lawyer--documentation-registration', ARRAY['write a will','will writing','my will','will deed','உயில் எழுத']);
