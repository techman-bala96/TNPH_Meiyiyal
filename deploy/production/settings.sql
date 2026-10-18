-- Meiyiyal production settings. Run ONCE on the hosted database after `supabase db push`, then again after each provider
-- goes live (each block is safe to re-run). Edit the values marked <...> first. Uses psql variables:
--   psql "$PROD_DB_URL" -v project_ref=abcdefghijklmnop -f deploy/production/settings.sql
-- Nothing here is a secret; peppers and hook secrets are generated randomly by the migrations on the new database.
\set ON_ERROR_STOP on
BEGIN;
-- Edge Function URLs that pg_cron / pg_net call (local defaults point at the Docker gateway).
UPDATE public.app_settings SET value = to_jsonb('https://' || :'project_ref' || '.supabase.co/functions/v1/push-send') WHERE key = 'push_send_url';
UPDATE public.app_settings SET value = to_jsonb('https://' || :'project_ref' || '.supabase.co/functions/v1/payout-run') WHERE key = 'payout_run_url';
UPDATE public.app_settings SET value = to_jsonb('https://' || :'project_ref' || '.supabase.co/functions/v1/account-purge') WHERE key = 'account_purge_url';
-- verify_service_url: the public URL of services/verify (e.g. https://verify.meiyiyal.com). Leave '' until it is deployed.
-- UPDATE public.app_settings SET value = '"https://verify.meiyiyal.com"' WHERE key = 'verify_service_url';

-- Decisions already agreed: no auto-approval in production (switch per category later in Admin → Settings), no test credits,
-- admin MFA on, live registry checks on.
UPDATE public.app_settings SET value = 'false' WHERE key = 'verify_auto_approve';
UPDATE public.app_settings SET value = '{}'    WHERE key = 'verify_auto_approve_categories';
UPDATE public.app_settings SET value = 'false' WHERE key = 'dev_test_credits';
UPDATE public.app_settings SET value = 'true'  WHERE key = 'admin_mfa_required';
UPDATE public.app_settings SET value = 'false' WHERE key = 'push_mock';
-- Replace the local test OTP with a random value so nobody can use 123456 (step-up codes then need SMS_PROVIDER=msg91).
UPDATE public.app_settings SET value = to_jsonb(encode(extensions.gen_random_bytes(16), 'hex')) WHERE key = 'kyc_stub_otp';
COMMIT;

-- ===== Flip ONE block at a time, only after that provider's secrets are set (supabase secrets set …) and tested =====
-- Aadhaar e-KYC live (KYC_PROVIDER=surepass + SUREPASS_TOKEN):
--   UPDATE public.app_settings SET value = '"edge"' WHERE key = 'kyc_provider';
-- Razorpay payments live (RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET):
--   UPDATE public.app_settings SET value = 'false' WHERE key = 'payments_mock';
-- RazorpayX payouts live (RAZORPAYX_*), then weekly automatic payouts (Monday 10:00 IST):
--   UPDATE public.app_settings SET value = 'false' WHERE key = 'payouts_mock';
--   UPDATE public.app_settings SET value = 'true'  WHERE key = 'payouts_auto';
-- TDS once the CA confirms the rule:
--   UPDATE public.app_settings SET value = 'true'  WHERE key = 'tds_enabled';
