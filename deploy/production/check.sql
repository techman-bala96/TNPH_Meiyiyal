-- Go-live readiness report (read-only). psql "$PROD_DB_URL" -f deploy/production/check.sql
-- Each line is OK or TODO with what to do. Secrets are never printed.
WITH s AS (SELECT key, value #>> '{}' AS v FROM public.app_settings),
c(item, ok, todo) AS (VALUES
  ('push_send_url is the hosted function', (SELECT v FROM s WHERE key = 'push_send_url') LIKE 'https://%.supabase.co/functions/v1/push-send', 'run deploy/production/settings.sql'),
  ('payout_run_url set', (SELECT v FROM s WHERE key = 'payout_run_url') LIKE 'https://%', 'run deploy/production/settings.sql'),
  ('account_purge_url set', (SELECT v FROM s WHERE key = 'account_purge_url') LIKE 'https://%', 'run deploy/production/settings.sql'),
  ('verify_service_url set', (SELECT v FROM s WHERE key = 'verify_service_url') LIKE 'https://%', 'deploy services/verify, then set verify_service_url'),
  ('auto-approve off', (SELECT v FROM s WHERE key = 'verify_auto_approve') = 'false', 'Admin → Settings → Verification'),
  ('test credits off', (SELECT v FROM s WHERE key = 'dev_test_credits') = 'false', 'Admin → Settings → Dev'),
  ('admin MFA on', (SELECT v FROM s WHERE key = 'admin_mfa_required') = 'true', 'UPDATE app_settings SET value=''true'' WHERE key=''admin_mfa_required'''),
  ('local test OTP replaced', (SELECT v FROM s WHERE key = 'kyc_stub_otp') <> '123456', 'run deploy/production/settings.sql'),
  ('Aadhaar e-KYC live', (SELECT v FROM s WHERE key = 'kyc_provider') = 'edge', 'Surepass token → kyc_provider=edge'),
  ('payments live', (SELECT v FROM s WHERE key = 'payments_mock') = 'false', 'Razorpay keys → payments_mock=false'),
  ('payouts live', (SELECT v FROM s WHERE key = 'payouts_mock') = 'false', 'RazorpayX keys → payouts_mock=false'),
  ('weekly payouts on', (SELECT v FROM s WHERE key = 'payouts_auto') = 'true', 'after a manual test payout → payouts_auto=true'),
  ('web push live', (SELECT v FROM s WHERE key = 'push_mock') = 'false', 'VAPID secrets → push_mock=false'),
  ('at least one admin', EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'), 'INSERT INTO user_roles(user_id, role) …'),
  ('every admin has an authenticator', NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.role = 'admin' AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = r.user_id AND f.status = 'verified')), 'each admin opens /admin once'),
  ('pg_cron jobs scheduled', (SELECT count(*) FROM cron.job WHERE jobname IN ('account-purge','bonus-expire','fast-sweep','payout-retry','payout-weekly','push-sweep','sms-outbox-sweep','verify-dispatch','verify-rechecks','verify-retention')) = 10, 'enable pg_cron + pg_net, re-run migrations'),
  ('no leftover Lovable tables', to_regclass('public.service_requests') IS NULL, 'apply 20261019090000_m11_legacy_cleanup.sql')
)
SELECT CASE WHEN ok THEN 'OK  ' ELSE 'TODO' END AS status, item, CASE WHEN ok THEN '' ELSE todo END AS next_step FROM c ORDER BY ok, item;
