-- M9: push notifications (standard Web Push with our own VAPID keys, no Firebase).
-- One `notifications` row per event is both the in-app inbox and the push outbox. Triggers on the existing
-- tables call public.notify(); the push-send Edge Function claims pending rows and delivers them (mock by default).

-- ---------- settings ----------
INSERT INTO public.app_settings(key, value) VALUES
  ('push_enabled', 'true'),
  ('push_mock', 'true'),                                   -- record instead of calling Google/Apple (set false with real VAPID keys)
  ('push_quiet_default', '{"on":true,"from":"22:00","to":"07:00"}'),
  ('push_chat_collapse_seconds', '120'),
  ('push_admin_collapse_seconds', '3600'),
  ('push_reach_minutes', '480'),                          -- an Online worker with push on stays requestable this long after the app closes
  ('push_feedback_reminder_minutes', '30'),
  ('push_send_url', '"http://kong:8000/functions/v1/push-send"'), -- local stack; production: https://<ref>.supabase.co/functions/v1/push-send
  ('push_hook_secret', to_jsonb(encode(gen_random_bytes(24), 'hex')))
ON CONFLICT (key) DO NOTHING;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net unavailable: pushes go out on the scheduled sweep only';
END $$;

-- ---------- devices ----------
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 8 AND 100),
  lang text NOT NULL DEFAULT 'ta' CHECK (lang IN ('en','ta')),
  platform text CHECK (char_length(platform) <= 40),
  failure_count int NOT NULL DEFAULT 0,
  last_ok_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.push_subscriptions FROM anon, authenticated;

-- ---------- inbox + outbox ----------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  category text NOT NULL CHECK (category IN ('requests','chat','money','account','admin','promos','system')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal')),
  always boolean NOT NULL DEFAULT false,                    -- safety/legal: the category switch cannot turn it off
  params jsonb NOT NULL DEFAULT '{}',                       -- names, amounts, ids only. Never message text or case details.
  url text NOT NULL DEFAULT '/' CHECK (url ~ '^/'),
  tag text,
  collapse_key text,
  dedupe_key text,
  count int NOT NULL DEFAULT 1,
  push_status text NOT NULL DEFAULT 'pending'
    CHECK (push_status IN ('pending','sending','sent','held','summarized','skipped_pref','skipped_off','no_device','failed')),
  push_attempts int NOT NULL DEFAULT 0,
  push_result jsonb,
  push_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  read_at timestamptz
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_queue_idx ON public.notifications(push_status, created_at) WHERE push_status IN ('pending','sending','held');
CREATE INDEX notifications_collapse_idx ON public.notifications(user_id, collapse_key, created_at DESC) WHERE collapse_key IS NOT NULL;
CREATE UNIQUE INDEX notifications_dedupe_uidx ON public.notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ---------- what each kind is ----------
CREATE OR REPLACE FUNCTION public.push_kind_meta(_kind text, OUT category text, OUT priority text, OUT always boolean)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE
      WHEN _kind IN ('request.incoming','request.missed','request.accepted','request.declined','call.incoming') THEN 'requests'
      WHEN _kind = 'chat.message' THEN 'chat'
      WHEN _kind LIKE 'payment.%' OR _kind LIKE 'payout.%' OR _kind LIKE 'payout_account.%' OR _kind = 'session.credits_out' THEN 'money'
      WHEN _kind LIKE 'verify.%' OR _kind LIKE 'account.%' OR _kind LIKE 'appeal.%' OR _kind = 'reward.earned' THEN 'account'
      WHEN _kind LIKE 'admin.%' THEN 'admin'
      WHEN _kind = 'feedback.reminder' THEN 'promos'
      ELSE 'system' END,
    CASE WHEN _kind IN ('request.incoming','call.incoming','request.accepted') THEN 'urgent' ELSE 'normal' END,
    _kind IN ('payout.failed','account.blocked','verify.rejected','verify.needs_info','appeal.upheld')
$$;

-- Category defaults when the user has not chosen: everything on except promos.
CREATE OR REPLACE FUNCTION public.push_pref_on(_prefs jsonb, _category text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _category = 'system' THEN true
    ELSE COALESCE((_prefs #>> ARRAY['notify', _category])::boolean, _category <> 'promos') END
$$;

-- Quiet hours in IST. Handles ranges across midnight (22:00 → 07:00). Bad values fall back to the default.
CREATE OR REPLACE FUNCTION public.push_quiet_now(_prefs jsonb, _at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _q jsonb := COALESCE(_prefs #> '{notify,quiet}', public.setting('push_quiet_default'), '{"on":true,"from":"22:00","to":"07:00"}');
  _d jsonb := COALESCE(public.setting('push_quiet_default'), '{"on":true,"from":"22:00","to":"07:00"}');
  _t time := (_at AT TIME ZONE 'Asia/Kolkata')::time; _f time; _to time;
BEGIN
  IF NOT COALESCE((_q->>'on')::boolean, (_d->>'on')::boolean, true) THEN RETURN false; END IF;
  BEGIN _f := COALESCE(_q->>'from', _d->>'from')::time; _to := COALESCE(_q->>'to', _d->>'to')::time;
  EXCEPTION WHEN OTHERS THEN _f := (_d->>'from')::time; _to := (_d->>'to')::time; END;
  IF _f = _to THEN RETURN false; END IF;
  IF _f < _to THEN RETURN _t >= _f AND _t < _to; END IF;
  RETURN _t >= _f OR _t < _to;
END $$;
REVOKE ALL ON FUNCTION public.push_quiet_now(jsonb, timestamptz) FROM public, anon, authenticated;

-- First name only, for lock screens. NULL lets the text say "someone".
CREATE OR REPLACE FUNCTION public.push_first_name(_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(btrim(COALESCE(_name, '')), ' ', 1), '') $$;
CREATE OR REPLACE FUNCTION public.push_user_name(_uid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.push_first_name(full_name) FROM public.profiles WHERE user_id = _uid $$;
REVOKE ALL ON FUNCTION public.push_user_name(uuid) FROM public, anon, authenticated;

-- Wake push-send right after the row commits (pg_net is async). No-op if pg_net or the URL is missing.
CREATE OR REPLACE FUNCTION public.push_kick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text := public.setting('push_send_url') #>> '{}'; _secret text := public.setting('push_hook_secret') #>> '{}';
BEGIN
  IF _url IS NULL OR _url = '' OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    USING _url, '{"kick":true}'::jsonb, jsonb_build_object('content-type', 'application/json', 'x-push-hook', COALESCE(_secret, ''));
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'push_kick failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.push_kick() FROM public, anon, authenticated;

-- ---------- the one entry point ----------
CREATE OR REPLACE FUNCTION public.notify(_user uuid, _kind text, _params jsonb DEFAULT '{}', _url text DEFAULT '/',
  _tag text DEFAULT NULL, _collapse text DEFAULT NULL, _dedupe text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m record; _prefs jsonb; _status text; _id uuid; _win int;
BEGIN
  IF _user IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _m FROM public.push_kind_meta(_kind);
  IF _collapse IS NOT NULL THEN
    _win := CASE WHEN _m.category = 'admin' THEN public.setting_num('push_admin_collapse_seconds', 3600) ELSE public.setting_num('push_chat_collapse_seconds', 120) END::int;
    UPDATE public.notifications SET count = count + 1, params = COALESCE(_params, '{}') || jsonb_build_object('count', count + 1), updated_at = now()
      WHERE id = (SELECT id FROM public.notifications WHERE user_id = _user AND collapse_key = _collapse AND read_at IS NULL
                  AND created_at > now() - make_interval(secs => _win) ORDER BY created_at DESC LIMIT 1)
      RETURNING id INTO _id;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  SELECT prefs INTO _prefs FROM public.profiles WHERE user_id = _user;
  _prefs := COALESCE(_prefs, '{}');
  _status := CASE
    WHEN COALESCE(public.setting('push_enabled') #>> '{}', 'true') <> 'true' THEN 'skipped_off'
    WHEN NOT _m.always AND NOT public.push_pref_on(_prefs, _m.category) THEN 'skipped_pref'
    WHEN _m.priority <> 'urgent' AND public.push_quiet_now(_prefs) THEN 'held'
    ELSE 'pending' END;
  INSERT INTO public.notifications(user_id, kind, category, priority, always, params, url, tag, collapse_key, dedupe_key, push_status)
  VALUES (_user, _kind, _m.category, _m.priority, _m.always, COALESCE(_params, '{}'), COALESCE(_url, '/'), _tag, _collapse, _dedupe, _status)
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.notify(uuid, text, jsonb, text, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins(_kind text, _params jsonb DEFAULT '{}', _url text DEFAULT '/admin', _collapse text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid; _n int := 0;
BEGIN
  FOR _u IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.notify(_u, _kind, _params, _url, NULL, _collapse, NULL); _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.notify_admins(text, jsonb, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_notifications_kick() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.push_kick(); RETURN NULL; END $$;
CREATE TRIGGER notifications_kick AFTER INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.push_status = 'pending') EXECUTE FUNCTION public.trg_notifications_kick();

-- ---------- event triggers ----------
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
    PERFORM public.notify(NEW.user_id, 'request.declined', jsonb_build_object('name', _wname, 'reason', 'declined'), '/', 'req-' || NEW.id);
  ELSIF NEW.status = 'timeout' THEN
    PERFORM public.notify(NEW.worker_user_id, 'request.missed', jsonb_build_object('name', _cname, 'mode', NEW.mode), '/history', 'req-' || NEW.id);
    PERFORM public.notify(NEW.user_id, 'request.declined', jsonb_build_object('name', _wname, 'reason', 'timeout'), '/', 'req-' || NEW.id);
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM public.notify(NEW.worker_user_id, 'request.missed', jsonb_build_object('name', _cname, 'mode', NEW.mode), '/history', 'req-' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_requests AFTER INSERT OR UPDATE OF status ON public.consult_requests FOR EACH ROW EXECUTE FUNCTION public.trg_push_requests();

CREATE OR REPLACE FUNCTION public.trg_push_calls() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _to uuid; _name text;
BEGIN
  IF NEW.status <> 'ringing' THEN RETURN NULL; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id = NEW.session_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NEW.caller = _s.worker_user_id THEN _to := _s.user_id; _name := (SELECT display_name FROM public.workers WHERE id = _s.worker_id);
  ELSE _to := _s.worker_user_id; _name := public.push_user_name(_s.user_id); END IF;
  PERFORM public.notify(_to, 'call.incoming', jsonb_build_object('name', _name, 'mode', NEW.mode), '/session/' || _s.id, 'call-' || _s.id);
  RETURN NULL;
END $$;
CREATE TRIGGER push_calls AFTER INSERT ON public.session_calls FOR EACH ROW EXECUTE FUNCTION public.trg_push_calls();

-- Chat: only "New message from {name}". The message text never leaves the database in a push.
CREATE OR REPLACE FUNCTION public.trg_push_messages() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _to uuid; _name text;
BEGIN
  IF COALESCE(NEW.kind, 'text') = 'system' THEN RETURN NULL; END IF;
  SELECT * INTO _s FROM public.consult_sessions WHERE id = NEW.session_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NEW.sender = _s.worker_user_id THEN _to := _s.user_id; _name := (SELECT display_name FROM public.workers WHERE id = _s.worker_id);
  ELSIF NEW.sender = _s.user_id THEN _to := _s.worker_user_id; _name := public.push_user_name(_s.user_id);
  ELSE RETURN NULL; END IF;
  PERFORM public.notify(_to, 'chat.message', jsonb_build_object('name', _name, 'session_id', _s.id), '/session/' || _s.id, 'chat-' || _s.id, 'chat-' || _s.id);
  RETURN NULL;
END $$;
CREATE TRIGGER push_messages AFTER INSERT ON public.consult_messages FOR EACH ROW EXECUTE FUNCTION public.trg_push_messages();

CREATE OR REPLACE FUNCTION public.trg_push_sessions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'ended' AND NEW.end_reason = 'credits_exhausted' THEN
    PERFORM public.notify(NEW.user_id, 'session.credits_out', jsonb_build_object('name', (SELECT display_name FROM public.workers WHERE id = NEW.worker_id)), '/wallet', 'credits-' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_sessions AFTER UPDATE OF status ON public.consult_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_push_sessions();

CREATE OR REPLACE FUNCTION public.trg_push_payments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NULL; END IF;
  IF NEW.status = 'paid' THEN
    PERFORM public.notify(NEW.user_id, 'payment.paid', jsonb_build_object('amount', round(NEW.amount_paise / 100.0, 2), 'credits', NEW.credits + NEW.bonus), '/wallet', 'pay-' || NEW.id);
  ELSIF NEW.status = 'failed' THEN
    PERFORM public.notify(NEW.user_id, 'payment.failed', jsonb_build_object('amount', round(NEW.amount_paise / 100.0, 2)), '/wallet', 'pay-' || NEW.id);
  ELSIF NEW.status = 'refunded' THEN
    PERFORM public.notify(NEW.user_id, 'payment.refunded', jsonb_build_object('amount', round(NEW.amount_paise / 100.0, 2)), '/wallet', 'pay-' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_payments AFTER UPDATE OF status ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.trg_push_payments();

CREATE OR REPLACE FUNCTION public.trg_push_payouts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.worker_payout_accounts; _p jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NULL; END IF;
  SELECT * INTO _a FROM public.worker_payout_accounts WHERE id = NEW.account_id;
  _p := jsonb_build_object('amount', NEW.amount, 'kind', _a.kind, 'last4', COALESCE(_a.account_last4, right(_a.account_mask, 4)));
  IF NEW.status = 'paid' THEN
    PERFORM public.notify(NEW.worker_user_id, 'payout.paid', _p, '/earnings', 'payout-' || NEW.id);
  ELSIF NEW.status IN ('failed', 'reversed', 'rejected') THEN
    PERFORM public.notify(NEW.worker_user_id, 'payout.failed', _p, '/earnings', 'payout-' || NEW.id);
  ELSIF NEW.status = 'review' THEN
    PERFORM public.notify(NEW.worker_user_id, 'payout.review', _p, '/earnings', 'payout-' || NEW.id);
    PERFORM public.notify_admins('admin.payout_review', jsonb_build_object('amount', NEW.amount,
      'name', (SELECT display_name FROM public.workers WHERE user_id = NEW.worker_user_id)), '/admin?tab=payouts');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_payouts AFTER INSERT OR UPDATE OF status ON public.payout_requests FOR EACH ROW EXECUTE FUNCTION public.trg_push_payouts();

CREATE OR REPLACE FUNCTION public.trg_push_payout_accounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.validation_status = OLD.validation_status AND NEW.account_hash = OLD.account_hash THEN RETURN NULL; END IF;
  _p := jsonb_build_object('kind', NEW.kind, 'last4', COALESCE(NEW.account_last4, right(NEW.account_mask, 4)), 'cooling_until', NEW.cooling_until);
  IF NEW.validation_status = 'verified' THEN
    PERFORM public.notify(NEW.worker_user_id, 'payout_account.verified', _p, '/earnings', 'acct-' || NEW.id);
  ELSIF NEW.validation_status IN ('rejected', 'failed') THEN
    PERFORM public.notify(NEW.worker_user_id, 'payout_account.rejected', _p, '/earnings', 'acct-' || NEW.id);
  ELSIF NEW.validation_status = 'review' THEN
    PERFORM public.notify(NEW.worker_user_id, 'payout_account.review', _p, '/earnings', 'acct-' || NEW.id);
    PERFORM public.notify_admins('admin.account_review', jsonb_build_object('name', (SELECT display_name FROM public.workers WHERE user_id = NEW.worker_user_id)), '/admin?tab=payouts');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_payout_accounts AFTER INSERT OR UPDATE ON public.worker_payout_accounts FOR EACH ROW EXECUTE FUNCTION public.trg_push_payout_accounts();

CREATE OR REPLACE FUNCTION public.trg_push_workers() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN PERFORM public.notify(NEW.user_id, 'verify.approved', '{}', '/?tab=worker', 'verify-' || NEW.id);
    ELSIF NEW.status = 'rejected' THEN PERFORM public.notify(NEW.user_id, 'verify.rejected', '{}', '/?tab=worker', 'verify-' || NEW.id);
    ELSIF NEW.status = 'needs_info' THEN PERFORM public.notify(NEW.user_id, 'verify.needs_info', '{}', '/worker/register', 'verify-' || NEW.id);
    ELSIF NEW.status = 'blocked' THEN PERFORM public.notify(NEW.user_id, 'account.blocked', '{}', '/?tab=worker', 'block-' || NEW.id);
    END IF;
  END IF;
  IF NEW.blocked_until IS NOT NULL AND NEW.blocked_until > now() AND (OLD.blocked_until IS NULL OR OLD.blocked_until <= now()) THEN
    PERFORM public.notify(NEW.user_id, 'account.blocked', jsonb_build_object('until', NEW.blocked_until), '/?tab=worker', 'block-' || NEW.id);
  ELSIF OLD.blocked_until IS NOT NULL AND OLD.blocked_until > now() AND NEW.blocked_until IS NULL THEN
    PERFORM public.notify(NEW.user_id, 'account.unblocked', '{}', '/?tab=worker', 'block-' || NEW.id, NULL, 'unblock-' || NEW.id || '-' || extract(epoch FROM OLD.blocked_until)::bigint);
  END IF;
  IF NEW.payout_hold AND NOT OLD.payout_hold THEN PERFORM public.notify(NEW.user_id, 'payout.hold', '{}', '/earnings', 'hold-' || NEW.id);
  ELSIF OLD.payout_hold AND NOT NEW.payout_hold THEN PERFORM public.notify(NEW.user_id, 'payout.resumed', '{}', '/earnings', 'hold-' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_workers AFTER UPDATE OF status, blocked_until, payout_hold ON public.workers FOR EACH ROW EXECUTE FUNCTION public.trg_push_workers();

CREATE OR REPLACE FUNCTION public.trg_push_appeals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('admin.verify_queue', '{}', '/admin', 'verify-queue');
  ELSIF NEW.status = 'upheld' AND OLD.status = 'open' THEN
    PERFORM public.notify((SELECT user_id FROM public.workers WHERE id = NEW.worker_id), 'appeal.upheld', '{}', '/?tab=worker', 'verify-' || NEW.worker_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_appeals AFTER INSERT OR UPDATE OF status ON public.verification_appeals FOR EACH ROW EXECUTE FUNCTION public.trg_push_appeals();

CREATE OR REPLACE FUNCTION public.trg_push_cases() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'queued' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'queued') THEN
    PERFORM public.notify_admins('admin.verify_queue', '{}', '/admin', 'verify-queue');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_cases AFTER INSERT OR UPDATE OF status ON public.verification_cases FOR EACH ROW EXECUTE FUNCTION public.trg_push_cases();

CREATE OR REPLACE FUNCTION public.trg_push_rewards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify((SELECT user_id FROM public.workers WHERE id = NEW.worker_id), 'reward.earned',
    jsonb_build_object('title', (SELECT title_i18n FROM public.reward_milestones WHERE slug = NEW.milestone)), '/?tab=worker', 'reward-' || NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER push_rewards AFTER INSERT ON public.worker_rewards FOR EACH ROW EXECUTE FUNCTION public.trg_push_rewards();

CREATE OR REPLACE FUNCTION public.trg_push_feedback() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_complaint OR NEW.is_negative THEN
    PERFORM public.notify_admins('admin.complaint', '{}', '/admin', 'complaints');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER push_feedback AFTER INSERT ON public.consult_feedback FOR EACH ROW EXECUTE FUNCTION public.trg_push_feedback();

-- A3: batch summary to admins (called by admin_payout_run and the payout-run function).
CREATE OR REPLACE FUNCTION public.push_payout_batch_done(_run jsonb, _dispatch jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE((_run->>'paused')::boolean, false) THEN RETURN; END IF;
  PERFORM public.notify_admins('admin.payout_batch', jsonb_build_object('created', COALESCE((_run->>'created')::int, 0),
    'processing', COALESCE((_dispatch->>'processing')::int, 0), 'failed', COALESCE((_dispatch->>'failed')::int, 0)), '/admin?tab=payouts');
END $$;
REVOKE ALL ON FUNCTION public.push_payout_batch_done(jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_payout_batch_done(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_payout_run() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb; _d jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  _r := public.payout_run(false, NULL);
  _d := public.payout_dispatch_mock(NULL);
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'payout.run', NULL, 'batch', _r || jsonb_build_object('dispatch', _d));
  PERFORM public.push_payout_batch_done(_r, _d);
  RETURN _r || jsonb_build_object('dispatch', _d);
END $$;

-- ---------- reachable by push: an Online worker whose app is closed can still be requested ----------
CREATE OR REPLACE FUNCTION public.worker_reachable(_w public.workers) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(_w.is_online, false) AND _w.last_seen_at IS NOT NULL AND (
    _w.last_seen_at > now() - public.presence_window()
    OR (COALESCE(public.setting('push_enabled') #>> '{}', 'true') = 'true'
        AND _w.last_seen_at > now() - make_interval(mins => public.setting_num('push_reach_minutes', 480)::int)
        AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = _w.user_id AND s.failure_count < 3)))
$$;
GRANT EXECUTE ON FUNCTION public.worker_reachable(public.workers) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.search_workers(text, double precision, double precision, double precision, boolean, int);
CREATE OR REPLACE FUNCTION public.search_workers(_node text, _lat double precision, _lng double precision,
  _radius_km double precision DEFAULT 50, _all boolean DEFAULT false, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, rewards_count int, years_experience int,
  primary_node text, specialty jsonb, is_online boolean, is_busy boolean, distance_km double precision, district_slug text, district_name jsonb, rates jsonb, badges jsonb,
  badge_tier text, verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography g)
  SELECT w.id, w.display_name, w.photo_url, w.rating, w.total_reviews, w.rewards_count, w.years_experience,
    w.primary_node, t.name_i18n,
    public.worker_reachable(w) AS online,
    EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id = w.id AND s.status = 'active'),
    round((ST_Distance(w.base_geog, p.g) / 1000)::numeric, 1)::double precision,
    w.district_slug, d.name_i18n, public.rates_for(w.primary_node),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', m.slug, 'icon', m.icon, 'color', m.color, 'title', m.title_i18n) ORDER BY m.sort DESC)
              FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug = r.milestone WHERE r.worker_id = w.id), '[]'),
    w.badge_tier, w.verified_at
  FROM public.workers w CROSS JOIN p
  LEFT JOIN public.taxonomy_nodes t ON t.slug = w.primary_node
  LEFT JOIN public.tn_districts d ON d.slug = w.district_slug
  WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
    AND (w.blocked_until IS NULL OR w.blocked_until <= now())
    AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _node OR n.node_slug LIKE _node || '--%'))
    AND (_all OR ST_DWithin(w.base_geog, p.g, _radius_km * 1000))
  ORDER BY online DESC, w.flag_active, ST_Distance(w.base_geog, p.g), w.rating DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.search_workers(text, double precision, double precision, double precision, boolean, int) TO anon, authenticated;

-- same as M7, with push reachability
CREATE OR REPLACE FUNCTION public.worker_public(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; st record;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE id = _id AND status = 'approved' AND is_active;
  IF NOT FOUND OR (public.worker_is_blocked(_w) AND _w.user_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN RETURN NULL; END IF;
  SELECT * INTO st FROM public.worker_stats(_id);
  RETURN jsonb_build_object('id', _w.id, 'display_name', _w.display_name, 'photo_url', _w.photo_url, 'about', _w.about, 'years_experience', _w.years_experience,
    'primary_node', _w.primary_node, 'specialty', (SELECT name_i18n FROM public.taxonomy_nodes WHERE slug = _w.primary_node),
    'category', (SELECT name_i18n FROM public.taxonomy_nodes WHERE slug = public.node_category(_w.primary_node)),
    'district', (SELECT name_i18n FROM public.tn_districts WHERE slug = _w.district_slug),
    'is_online', public.worker_reachable(_w),
    'is_busy', EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id = _w.id AND s.status = 'active'),
    'joined_at', COALESCE(_w.decided_at, _w.created_at), 'rating', _w.rating, 'reviews', _w.total_reviews,
    'sessions_served', st.sessions_served, 'users_served', st.users_served, 'rates', public.rates_for(_w.primary_node),
    'council', COALESCE(_w.reg_data->>'council', _w.reg_data->>'bar_council'),
    'badge_tier', _w.badge_tier, 'verified_at', _w.verified_at,
    'rewards', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', m.slug, 'icon', m.icon, 'color', m.color, 'title', m.title_i18n, 'desc', m.desc_i18n, 'cert_no', r.cert_no, 'awarded_at', r.awarded_at) ORDER BY r.awarded_at DESC)
      FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug = r.milestone WHERE r.worker_id = _w.id), '[]'),
    'feedback', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT f.rating, f.tags, f.comment, f.created_at, COALESCE(NULLIF(split_part(p.full_name, ' ', 1), ''), 'User') AS by_name
      FROM public.consult_feedback f LEFT JOIN public.profiles p ON p.user_id = f.user_id
      WHERE f.worker_id = _w.id AND NOT f.is_complaint ORDER BY f.created_at DESC LIMIT 10) x), '[]'));
END $$;

-- same as M3, with push reachability
CREATE OR REPLACE FUNCTION public.request_create(_worker uuid, _mode text, _node text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _r record; _bal numeric; _id uuid; _name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('chat','voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  PERFORM public.request_expire_due();
  SELECT * INTO _w FROM public.workers WHERE id=_worker;
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active THEN RAISE EXCEPTION 'worker unavailable'; END IF;
  IF _w.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot request yourself'; END IF;
  IF NOT public.worker_reachable(_w) THEN RAISE EXCEPTION 'worker offline'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_sessions WHERE worker_id=_worker AND status='active') THEN RAISE EXCEPTION 'worker busy'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_requests WHERE user_id=auth.uid() AND status='ringing') THEN RAISE EXCEPTION 'you already have a ringing request'; END IF;
  IF (SELECT count(*) FROM public.consult_requests WHERE user_id=auth.uid() AND created_at > now() - interval '10 minutes') >= 10 THEN RAISE EXCEPTION 'too many requests'; END IF;
  SELECT * INTO _r FROM public.rate_for(COALESCE(_node, _w.primary_node), _mode);
  IF _r IS NULL OR _r.credits_per_min IS NULL THEN RAISE EXCEPTION 'no rate configured'; END IF;
  PERFORM public.wallet_id_for(auth.uid());
  SELECT balance INTO _bal FROM public.wallets WHERE user_id=auth.uid();
  IF _bal < _r.credits_per_min * _r.min_minutes THEN RAISE EXCEPTION 'insufficient credits: need % for % min', _r.credits_per_min * _r.min_minutes, _r.min_minutes; END IF;
  SELECT COALESCE(NULLIF(full_name,''), split_part(email,'@',1), 'User') INTO _name FROM public.profiles WHERE user_id=auth.uid();
  INSERT INTO public.consult_requests(user_id, worker_id, worker_user_id, node_slug, mode, rate, min_minutes, user_name, expires_at)
  VALUES (auth.uid(), _worker, _w.user_id, _w.primary_node, _mode, _r.credits_per_min, _r.min_minutes, COALESCE(_name,'User'),
          now() + make_interval(secs => COALESCE((public.setting('ring_seconds')#>>'{}')::int, 45)))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ---------- client RPCs ----------
CREATE OR REPLACE FUNCTION public.push_subscribe(_endpoint text, _p256dh text, _auth text, _lang text DEFAULT 'ta', _platform text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  -- one browser = one endpoint; a new sign-in on a shared phone takes the device over
  INSERT INTO public.push_subscriptions(user_id, endpoint, p256dh, auth, lang, platform)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth, CASE WHEN _lang = 'en' THEN 'en' ELSE 'ta' END, left(_platform, 40))
  ON CONFLICT (endpoint) DO UPDATE SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, lang = EXCLUDED.lang,
    platform = EXCLUDED.platform, failure_count = 0, updated_at = now()
  RETURNING id INTO _id;
  -- keep the 10 newest devices
  DELETE FROM public.push_subscriptions WHERE user_id = auth.uid() AND id NOT IN
    (SELECT id FROM public.push_subscriptions WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 10);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.push_unsubscribe(_endpoint text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.push_subscriptions WHERE user_id = auth.uid() AND endpoint = _endpoint;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.push_set_lang(_endpoint text, _lang text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.push_subscriptions SET lang = CASE WHEN _lang = 'en' THEN 'en' ELSE 'ta' END, updated_at = now()
    WHERE user_id = auth.uid() AND endpoint = _endpoint;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.push_test() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = auth.uid() AND kind = 'test.ping' AND created_at > now() - interval '10 seconds') THEN
    RAISE EXCEPTION 'please wait a few seconds';
  END IF;
  INSERT INTO public.notifications(user_id, kind, category, priority, params, url, tag, push_status)
  VALUES (auth.uid(), 'test.ping', 'system', 'normal', '{}', '/settings', 'test', 'pending')   -- a test ignores quiet hours
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.notifications_mark_read(_ids uuid[] DEFAULT NULL) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
END $$;

-- What the Settings page needs to show (no secrets).
CREATE OR REPLACE FUNCTION public.push_config() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('enabled', COALESCE(public.setting('push_enabled') #>> '{}', 'true') = 'true',
    'mock', COALESCE(public.setting('push_mock') #>> '{}', 'true') = 'true',
    'quiet_default', COALESCE(public.setting('push_quiet_default'), '{"on":true,"from":"22:00","to":"07:00"}')) $$;

REVOKE ALL ON FUNCTION public.push_subscribe(text, text, text, text, text), public.push_unsubscribe(text), public.push_set_lang(text, text),
  public.push_test(), public.notifications_mark_read(uuid[]), public.push_config() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.push_subscribe(text, text, text, text, text), public.push_unsubscribe(text), public.push_set_lang(text, text),
  public.push_test(), public.notifications_mark_read(uuid[]), public.push_config() TO authenticated;

-- ---------- service-only: claim, record, sweep ----------
CREATE OR REPLACE FUNCTION public.push_claim(_limit int DEFAULT 50) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  WITH c AS (
    SELECT id FROM public.notifications WHERE push_status = 'pending'
    ORDER BY (priority = 'urgent') DESC, created_at LIMIT LEAST(GREATEST(_limit, 1), 200) FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE public.notifications n SET push_status = 'sending', push_attempts = n.push_attempts + 1, updated_at = now()
    FROM c WHERE n.id = c.id RETURNING n.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u.id, 'user_id', u.user_id, 'kind', u.kind, 'priority', u.priority, 'params', u.params,
    'url', u.url, 'tag', u.tag, 'count', u.count, 'created_at', u.created_at,
    'prefs_lang', (SELECT prefs->>'lang' FROM public.profiles p WHERE p.user_id = u.user_id),
    'devices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'lang', s.lang))
                         FROM public.push_subscriptions s WHERE s.user_id = u.user_id), '[]'))), '[]')
  INTO _out FROM u;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.push_record(_id uuid, _status text, _result jsonb DEFAULT NULL, _payload jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('sent','no_device','failed','pending') THEN RAISE EXCEPTION 'bad push status'; END IF;
  UPDATE public.notifications SET push_status = CASE WHEN _status = 'pending' AND push_attempts >= 3 THEN 'failed' ELSE _status END,
    push_result = _result, push_payload = COALESCE(_payload, push_payload), sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END, updated_at = now()
  WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.push_device_result(_sub uuid, _ok boolean, _gone boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _gone THEN DELETE FROM public.push_subscriptions WHERE id = _sub; RETURN; END IF;
  UPDATE public.push_subscriptions SET last_ok_at = CASE WHEN _ok THEN now() ELSE last_ok_at END,
    failure_count = CASE WHEN _ok THEN 0 ELSE failure_count + 1 END WHERE id = _sub;
END $$;

-- Runs every 30 s (pg_cron) and on every push-send call. Also the scheduled expiry of unanswered rings.
CREATE OR REPLACE FUNCTION public.push_sweep() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _expired int; _released int := 0; _summaries int := 0; _r record; _n int; _fb int;
BEGIN
  _expired := public.request_expire_due();
  -- quiet hours over: safety notices go out one by one, the rest become one summary
  FOR _r IN SELECT n.user_id, COALESCE(p.prefs, '{}') AS prefs FROM public.notifications n LEFT JOIN public.profiles p ON p.user_id = n.user_id
            WHERE n.push_status = 'held' GROUP BY n.user_id, p.prefs LOOP
    IF public.push_quiet_now(_r.prefs) THEN CONTINUE; END IF;
    UPDATE public.notifications SET push_status = 'pending', updated_at = now() WHERE user_id = _r.user_id AND push_status = 'held' AND always;
    UPDATE public.notifications SET push_status = 'summarized', updated_at = now() WHERE user_id = _r.user_id AND push_status = 'held';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n > 0 THEN
      INSERT INTO public.notifications(user_id, kind, category, priority, params, url, tag, push_status)
      VALUES (_r.user_id, 'summary.quiet', 'system', 'normal', jsonb_build_object('count', _n), '/notifications', 'summary', 'pending');
      _summaries := _summaries + 1;
    END IF;
    _released := _released + 1;
  END LOOP;
  -- new payout account ready after the cool-off
  PERFORM public.notify(a.worker_user_id, 'payout.cooled', jsonb_build_object('kind', a.kind, 'last4', COALESCE(a.account_last4, right(a.account_mask, 4))),
    '/earnings', 'acct-' || a.id, NULL, 'cooled-' || a.id || '-' || extract(epoch FROM a.cooling_until)::bigint)
  FROM public.worker_payout_accounts a
  WHERE a.validation_status = 'verified' AND a.cooling_until IS NOT NULL AND a.cooling_until <= now() AND a.cooling_until > now() - interval '7 days';
  -- temporary block ended on its own
  PERFORM public.notify(w.user_id, 'account.unblocked', '{}', '/?tab=worker', 'block-' || w.id, NULL, 'unblock-' || w.id || '-' || extract(epoch FROM w.blocked_until)::bigint)
  FROM public.workers w WHERE w.blocked_until IS NOT NULL AND w.blocked_until <= now() AND w.blocked_until > now() - interval '7 days';
  -- feedback reminder (Offers & updates category: off unless the user turns it on)
  _fb := public.setting_num('push_feedback_reminder_minutes', 30)::int;
  PERFORM public.notify(s.user_id, 'feedback.reminder', jsonb_build_object('name', (SELECT display_name FROM public.workers WHERE id = s.worker_id)),
    '/history', 'fb-' || s.id, NULL, 'fb-' || s.id)
  FROM public.consult_sessions s
  WHERE s.status = 'ended' AND s.ended_at <= now() - make_interval(mins => _fb) AND s.ended_at > now() - interval '1 day'
    AND s.credits_used > 0 AND NOT EXISTS (SELECT 1 FROM public.consult_feedback f WHERE f.session_id = s.id);
  -- a send that crashed half-way is retried (max 3 attempts)
  UPDATE public.notifications SET push_status = CASE WHEN push_attempts >= 3 THEN 'failed' ELSE 'pending' END, updated_at = now()
    WHERE push_status = 'sending' AND updated_at < now() - interval '2 minutes';
  IF EXISTS (SELECT 1 FROM public.notifications WHERE push_status = 'pending') THEN PERFORM public.push_kick(); END IF;
  RETURN jsonb_build_object('expired', _expired, 'released_users', _released, 'summaries', _summaries);
END $$;

REVOKE ALL ON FUNCTION public.push_claim(int), public.push_record(uuid, text, jsonb, jsonb), public.push_device_result(uuid, boolean, boolean), public.push_sweep()
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_claim(int), public.push_record(uuid, text, jsonb, jsonb), public.push_device_result(uuid, boolean, boolean), public.push_sweep()
  TO service_role;

-- push-send checks the pg_net hook header against this (service role only).
CREATE OR REPLACE FUNCTION public.push_hook_ok(_secret text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _secret IS NOT NULL AND _secret <> '' AND _secret = (public.setting('push_hook_secret') #>> '{}') $$;
REVOKE ALL ON FUNCTION public.push_hook_ok(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_hook_ok(text) TO service_role;

-- ---------- schedule (pg_cron): sweep every 30 s ----------
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-sweep';
  PERFORM cron.schedule('push-sweep', '30 seconds', 'SELECT public.push_sweep()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable: call push-send {"sweep":true} on a schedule instead (%)', SQLERRM;
END $$;
