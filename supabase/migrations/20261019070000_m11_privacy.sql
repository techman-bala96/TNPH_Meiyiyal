-- M11 · DPDP Act 2023: data export and account deletion.
-- Deletion = erase personal data + disable the login, after a grace period (default 7 days, cancellable).
-- Kept because the law requires it or to prevent fraud: payment, payout, earnings and consultation billing rows
-- (tax/GST record-keeping, linked to an anonymous account id) and hashes of blocked identities.
INSERT INTO public.app_settings(key, value) VALUES
  ('account_delete_grace_days', '7'), ('account_purge_url', '""'),
  ('account_hook_secret', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex'))), ('data_export_per_day', '3')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.setting_specs(key, grp, kind, min, max, sort, label_i18n, prod_hint) VALUES
  ('account_delete_grace_days', 'security', 'number', 1, 30, 100, '{"en":"Account deletion grace period (days)","ta":"கணக்கு நீக்கக் காத்திருப்பு (நாள்)"}', NULL),
  ('data_export_per_day', 'security', 'number', 1, 20, 101, '{"en":"Data downloads per user per day","ta":"ஒரு நாளில் தரவுப் பதிவிறக்கங்கள்"}', NULL),
  ('account_purge_url', 'security', 'text', NULL, NULL, 102, '{"en":"account-purge function URL","ta":"account-purge செயல்பாட்டு URL"}', 'https://<project>.supabase.co/functions/v1/account-purge')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.data_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,           -- no FK: the record of an erasure must outlive the account
  kind text NOT NULL CHECK (kind IN ('export','delete')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cancelled','done','blocked')),
  reason text,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS data_requests_user_idx ON public.data_requests(user_id, kind, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS data_requests_one_pending_delete ON public.data_requests(user_id) WHERE kind = 'delete' AND status = 'pending';
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_data_export() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _w uuid; _out jsonb;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.data_requests WHERE user_id = _u AND kind = 'export' AND created_at > now() - interval '1 day') >= public.setting_num('data_export_per_day', 3) THEN
    RAISE EXCEPTION 'export limit reached, try again tomorrow'; END IF;
  SELECT id INTO _w FROM public.workers WHERE user_id = _u;
  _out := jsonb_build_object(
    'format', 'meiyiyal-export-v1', 'generated_at', now(), 'user_id', _u,
    'account', (SELECT jsonb_build_object('email', email, 'phone', phone, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at) FROM auth.users WHERE id = _u),
    'profile', (SELECT to_jsonb(p) - 'id' FROM public.profiles p WHERE user_id = _u),
    'locations', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'address', address, 'district', district_slug, 'is_current', is_current, 'created_at', created_at)) FROM public.user_locations WHERE user_id = _u), '[]'),
    'wallet', (SELECT jsonb_build_object('balance', balance, 'transactions', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', t.type, 'amount', t.amount, 'description', t.description, 'at', t.created_at) ORDER BY t.created_at) FROM public.wallet_transactions t WHERE t.wallet_id = w.id), '[]')) FROM public.wallets w WHERE w.user_id = _u),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(o) - 'user_id' ORDER BY o.created_at) FROM public.payment_orders o WHERE user_id = _u), '[]'),
    'consultations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'role', CASE WHEN s.user_id = _u THEN 'client' ELSE 'professional' END, 'profession', s.node_slug,
        'mode', s.current_mode, 'started_at', s.started_at, 'ended_at', s.ended_at, 'credits_used', s.credits_used,
        'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('mine', m.sender = _u, 'kind', m.kind, 'text', m.body, 'file', m.file_name, 'at', m.created_at) ORDER BY m.created_at) FROM public.consult_messages m WHERE m.session_id = s.id), '[]'))
        ORDER BY s.started_at) FROM public.consult_sessions s WHERE s.user_id = _u OR s.worker_user_id = _u), '[]'),
    'feedback_given', COALESCE((SELECT jsonb_agg(jsonb_build_object('session', session_id, 'rating', rating, 'tags', tags, 'comment', comment, 'complaint', complaint_reason, 'at', created_at)) FROM public.consult_feedback WHERE user_id = _u), '[]'),
    'offline_messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('to_or_from', CASE WHEN user_id = _u THEN 'sent' ELSE 'received' END, 'text', body, 'status', status, 'at', created_at)) FROM public.worker_messages WHERE user_id = _u OR worker_user_id = _u), '[]'),
    'notifications', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'params', params, 'at', created_at, 'read_at', read_at)) FROM (SELECT * FROM public.notifications WHERE user_id = _u ORDER BY created_at DESC LIMIT 500) n), '[]'),
    'referral', jsonb_build_object('my_code', (SELECT code FROM public.referral_codes WHERE owner_user = _u AND kind = 'personal'),
      'joined_with', (SELECT code FROM public.referrals WHERE referred_user = _u), 'people_invited', (SELECT count(*) FROM public.referrals WHERE referrer_user = _u)),
    'professional', CASE WHEN _w IS NULL THEN NULL ELSE jsonb_build_object(
      'profile', (SELECT to_jsonb(w) - 'base_geog' - 'user_id' FROM public.workers w WHERE id = _w),
      'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', doc_type, 'file', path, 'uploaded_at', created_at)) FROM public.worker_documents WHERE worker_id = _w), '[]'),
      'identity', (SELECT jsonb_build_object('legal_name', legal_name, 'aadhaar', 'XXXX-XXXX-' || aadhaar_last4, 'verified', aadhaar_verified, 'provider', provider) FROM public.kyc_verification WHERE worker_id = _w),
      'verification', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', c.status, 'decision', c.decision, 'reasons', c.reason_codes, 'at', c.created_at, 'decided_at', c.decided_at,
          'checks', (SELECT jsonb_agg(jsonb_build_object('check', k.check_name, 'status', k.status)) FROM public.verification_checks k WHERE k.case_id = c.id))) FROM public.verification_cases c WHERE c.worker_id = _w), '[]'),
      'appeals', COALESCE((SELECT jsonb_agg(jsonb_build_object('note', note, 'status', status, 'at', created_at)) FROM public.verification_appeals WHERE worker_id = _w), '[]'),
      'earnings', COALESCE((SELECT jsonb_agg(jsonb_build_object('session', session_id, 'gross', gross, 'commission', commission, 'net', net, 'at', created_at) ORDER BY created_at) FROM public.worker_earnings WHERE worker_user_id = _u), '[]'),
      'payouts', COALESCE((SELECT jsonb_agg(jsonb_build_object('amount', amount, 'status', status, 'method', method, 'at', requested_at, 'reference', reference) ORDER BY requested_at) FROM public.payout_requests WHERE worker_user_id = _u), '[]'),
      'payout_accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'account', account_mask, 'ifsc', ifsc, 'status', validation_status, 'name_at_bank', registered_name)) FROM public.worker_payout_accounts WHERE worker_user_id = _u), '[]'),
      'rewards', COALESCE((SELECT jsonb_agg(jsonb_build_object('milestone', milestone, 'certificate', cert_no, 'at', awarded_at)) FROM public.worker_rewards WHERE worker_id = _w), '[]')) END,
    'privacy_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'status', status, 'at', created_at, 'due_at', due_at)) FROM public.data_requests WHERE user_id = _u), '[]'));
  INSERT INTO public.data_requests(user_id, kind, status, done_at) VALUES (_u, 'export', 'done', now());
  RETURN _out;
END $$;

-- What would stop a deletion right now (shown to the user before they confirm).
CREATE OR REPLACE FUNCTION public._account_blockers(_u uuid) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM public.consult_sessions WHERE (user_id = _u OR worker_user_id = _u) AND status = 'active') THEN 'active_consultation' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.payout_requests WHERE worker_user_id = _u AND status IN ('requested','queued','review','processing')) THEN 'payout_in_progress' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.worker_earnings WHERE worker_user_id = _u AND payout_id IS NULL AND net > 0) THEN 'unpaid_earnings' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _u AND role = 'admin') THEN 'admin_account' END
  ], NULL) $$;
REVOKE ALL ON FUNCTION public._account_blockers(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_privacy() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pending_delete', (SELECT jsonb_build_object('due_at', due_at, 'created_at', created_at) FROM public.data_requests WHERE user_id = auth.uid() AND kind = 'delete' AND status = 'pending'),
    'blockers', to_jsonb(public._account_blockers(auth.uid())),
    'wallet_balance', COALESCE((SELECT balance FROM public.wallets WHERE user_id = auth.uid()), 0),
    'grace_days', public.setting_num('account_delete_grace_days', 7)) $$;

CREATE OR REPLACE FUNCTION public.account_delete_request(_confirm text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _b text[]; _due timestamptz;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF upper(btrim(COALESCE(_confirm, ''))) NOT IN ('DELETE', 'நீக்கு') THEN RAISE EXCEPTION 'type DELETE to confirm'; END IF;
  _b := public._account_blockers(_u);
  IF 'admin_account' = ANY (_b) THEN RAISE EXCEPTION 'admin accounts are removed by another admin'; END IF;
  _due := now() + make_interval(days => public.setting_num('account_delete_grace_days', 7)::int);
  INSERT INTO public.data_requests(user_id, kind, status, due_at) VALUES (_u, 'delete', 'pending', _due)
  ON CONFLICT (user_id) WHERE kind = 'delete' AND status = 'pending' DO NOTHING;
  -- stop new work right away: professionals go offline
  PERFORM set_config('meiyiyal.trusted', 'on', true);
  UPDATE public.workers SET is_online = false WHERE user_id = _u;
  PERFORM set_config('meiyiyal.trusted', 'off', true);
  RETURN public.my_privacy();
END $$;

CREATE OR REPLACE FUNCTION public.account_delete_cancel() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  UPDATE public.data_requests SET status = 'cancelled', done_at = now() WHERE user_id = auth.uid() AND kind = 'delete' AND status = 'pending';
  RETURN public.my_privacy();
END $$;

-- ---------- service side (account-purge Edge Function) ----------
CREATE OR REPLACE FUNCTION public.account_hook_ok(_secret text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(_secret, '') <> '' AND _secret = (public.setting('account_hook_secret') #>> '{}') $$;

-- Due requests; anything still blocked waits (a request with unpaid earnings stays pending until they are paid out).
CREATE OR REPLACE FUNCTION public.account_purge_due(_limit int DEFAULT 20) RETURNS TABLE(request_id bigint, user_id uuid, blockers text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.user_id, public._account_blockers(r.user_id) FROM public.data_requests r
  WHERE r.kind = 'delete' AND r.status = 'pending' AND r.due_at <= now() ORDER BY r.due_at LIMIT LEAST(GREATEST(_limit, 1), 100) $$;

CREATE OR REPLACE FUNCTION public.account_anonymize(_request bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _u uuid; _w uuid; _b text[];
BEGIN
  SELECT * INTO r FROM public.data_requests WHERE id = _request AND kind = 'delete' AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_pending'); END IF;
  _u := r.user_id; _b := public._account_blockers(_u);
  IF cardinality(_b) > 0 THEN
    UPDATE public.data_requests SET reason = array_to_string(_b, ',') WHERE id = _request;
    RETURN jsonb_build_object('ok', false, 'reason', array_to_string(_b, ','));
  END IF;
  SELECT id INTO _w FROM public.workers WHERE user_id = _u;
  PERFORM set_config('meiyiyal.trusted', 'on', true);
  UPDATE public.profiles SET full_name = NULL, first_name = '', last_name = '', email = NULL, phone_number = NULL, avatar_url = NULL, dob = NULL,
    location_lat = NULL, location_lng = NULL, location_address = NULL, prefs = '{}' WHERE user_id = _u;
  DELETE FROM public.user_locations WHERE user_id = _u;
  DELETE FROM public.push_subscriptions WHERE user_id = _u;
  DELETE FROM public.notifications WHERE user_id = _u;
  DELETE FROM public.consult_searches WHERE user_id = _u;
  DELETE FROM public.stepup_codes WHERE user_id = _u;
  DELETE FROM public.worker_mutes WHERE user_id = _u OR worker_user_id = _u;
  UPDATE public.consult_messages SET body = CASE WHEN body IS NULL THEN NULL ELSE '[deleted]' END, file_path = NULL, file_name = NULL WHERE sender = _u;
  UPDATE public.worker_messages SET body = CASE WHEN user_id = _u THEN '[deleted]' ELSE body END, user_name = CASE WHEN user_id = _u THEN NULL ELSE user_name END,
    voice_path = CASE WHEN user_id = _u THEN NULL ELSE voice_path END WHERE user_id = _u OR worker_user_id = _u;
  UPDATE public.consult_feedback SET comment = NULL WHERE user_id = _u;
  UPDATE public.consult_requests SET user_name = NULL WHERE user_id = _u;
  UPDATE public.referral_codes SET active = false WHERE owner_user = _u;
  UPDATE public.wallets SET balance = 0, updated_at = now() WHERE user_id = _u AND balance <> 0;
  IF _w IS NOT NULL THEN
    UPDATE public.workers SET display_name = 'Deleted professional', photo_url = NULL, about = NULL, reg_data = '{}', base_geog = NULL,
      is_online = false, is_active = false, status = 'blocked' WHERE id = _w;
    DELETE FROM public.worker_documents WHERE worker_id = _w;
    UPDATE public.kyc_verification SET legal_name = NULL, pan_number = NULL, pan_name = NULL, video_verification_url = NULL WHERE worker_id = _w;
    UPDATE public.verification_intake SET qr_path = NULL, raw_selfie_path = NULL, public_portrait_url = NULL, liveness_frames = NULL WHERE worker_id = _w;
    UPDATE public.verification_cases SET qr_path = NULL, raw_selfie_path = NULL, live_frames = NULL WHERE worker_id = _w;
    DELETE FROM public.identity_fingerprints WHERE worker_id = _w AND NOT blocked;
    UPDATE public.worker_payout_accounts SET registered_name = NULL WHERE worker_user_id = _u;
  END IF;
  PERFORM set_config('meiyiyal.trusted', 'off', true);
  UPDATE public.data_requests SET status = 'done', done_at = now(), reason = NULL WHERE id = _request;
  RETURN jsonb_build_object('ok', true, 'user_id', _u, 'worker', _w IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.account_purge_kick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text := public.setting('account_purge_url') #>> '{}';
BEGIN
  IF _url IS NULL OR _url = '' OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.data_requests WHERE kind = 'delete' AND status = 'pending' AND due_at <= now()) THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 10000)'
    USING _url, jsonb_build_object('content-type', 'application/json', 'x-account-hook', public.setting('account_hook_secret') #>> '{}');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'account_purge_kick failed: %', SQLERRM;
END $$;

REVOKE ALL ON FUNCTION public.account_hook_ok(text), public.account_purge_due(int), public.account_anonymize(bigint), public.account_purge_kick() FROM public, anon, authenticated;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['my_data_export()','my_privacy()','account_delete_request(text)','account_delete_cancel()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'account-purge';
  PERFORM cron.schedule('account-purge', '15 * * * *', 'SELECT public.account_purge_kick()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable (%)', SQLERRM;
END $$;

-- Files a user sent inside consultations live under the session folder, not the user folder.
CREATE OR REPLACE FUNCTION public.account_user_files(_u uuid) RETURNS TABLE(bucket text, path text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'consult-files', file_path FROM public.consult_messages WHERE sender = _u AND file_path IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.account_user_files(uuid) FROM public, anon, authenticated;

-- After the auth user is scrubbed, drop its sign-in identities so the same Google account / phone can sign up afresh.
CREATE OR REPLACE FUNCTION public.account_drop_identities(_u uuid) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.data_requests WHERE user_id = _u AND kind = 'delete' AND status = 'done') THEN RAISE EXCEPTION 'not deleted'; END IF;
  DELETE FROM auth.identities WHERE user_id = _u; GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM auth.sessions WHERE user_id = _u; DELETE FROM auth.mfa_factors WHERE user_id = _u;
  RETURN n; END $$;
REVOKE ALL ON FUNCTION public.account_drop_identities(uuid) FROM public, anon, authenticated;
