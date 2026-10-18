# Go-live: meiyiyal.com + hosted Supabase (Mumbai)

Nothing in this repo deploys by itself. Follow the steps in order; each ends with a check. Secret **names** are listed
here, never values. Keep values in a password manager and in `supabase secrets` / the host's environment only.

Run `psql "$PROD_DB_URL" -f deploy/production/check.sql` at any point: it prints OK / TODO for every go-live item.

## 0. Accounts Bala needs (see HANDOFF "What Bala must provide")
Supabase (Pro plan recommended for daily backups + PITR), Hostinger (domain + hosting), Razorpay + RazorpayX,
MSG91 (with DLT registration), Surepass (Aadhaar e-KYC), Google Cloud (OAuth client; Maps keys optional),
a small Linux VM (agent + verify + coturn; e.g. 2 vCPU / 4 GB in Mumbai), Cloudflare Turnstile (captcha, free),
an SMTP sender (e.g. Resend / Amazon SES / Zoho) for sign-in emails.

## 1. Supabase project (Mumbai)
1. Dashboard → New project → Region **South Asia (Mumbai) `ap-south-1`**. Save the DB password.
2. Database → Extensions: enable `pg_cron`, `pg_net`, `postgis`, `pgcrypto` (the migrations also try).
3. On your PC in `C:\Users\BALA\meiyiyal` (branch `meyiyal-v1`):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push                      # applies every file in supabase/migrations
   psql "$PROD_DB_URL" -v project_ref=<project-ref> -f deploy/production/settings.sql
   ```
   Check: `check.sql` shows OK for "pg_cron jobs scheduled", "push_send_url", "payout_run_url", "account_purge_url".
4. Edge Functions: `npx supabase functions deploy` (all folders in `supabase/functions`). `verify_jwt` per function comes
   from `config.toml`.
5. Function secrets: `npx supabase secrets set NAME=value …` for each name in `.env.example` → "Edge Function secrets" that
   applies (start with VAPID_*, then each provider as it goes live, step 6).
6. Auth (Dashboard → Authentication):
   - URL configuration: Site URL `https://meiyiyal.com`; Redirect URLs `https://meiyiyal.com/**`, `https://admin.meiyiyal.com/**`.
   - Providers: Email (magic link) on; Phone on; Google with the OAuth client (authorised redirect
     `https://<project-ref>.supabase.co/auth/v1/callback`).
   - SMTP: Settings → SMTP with your sender (from `no-reply@meiyiyal.com`); templates from `supabase/templates/`.
   - Hooks → **Send SMS** → HTTPS `https://<project-ref>.supabase.co/functions/v1/sms-hook`; copy the secret into
     `SEND_SMS_HOOK_SECRET`; set `SMS_PROVIDER=msg91` + `MSG91_*`.
   - MFA: TOTP **enabled** (admins need it).
   - Bot protection: Turnstile + secret; build the web app with `VITE_CAPTCHA_PROVIDER=turnstile` + site key.
   - Rate limits: keep defaults or lower (e.g. 30 SMS / hour project-wide at launch).
7. Database → Backups: confirm daily backups (Pro) and enable PITR if budget allows.

## 2. Web app on Hostinger (meiyiyal.com)
1. Build on your PC with a production `.env.production.local` (VITE_* only, values from step 1 + providers):
   `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>`,
   `VITE_AGENT_URL=https://agent.meiyiyal.com`, `VITE_ADMIN_HOST=admin.meiyiyal.com`, `VITE_GRIEVANCE_*`, captcha, maps.
   Then `npm ci && npm run build`.
2. hPanel → Websites → meiyiyal.com → File manager: upload **the contents of `dist/`** to `public_html/`, plus
   `deploy/hostinger/.htaccess`. Do the same for the `admin` subdomain (docs/admin-subdomain.md).
3. hPanel → SSL: enable for `meiyiyal.com`, `www`, `admin`.
4. Check: `https://meiyiyal.com/login` loads, installs as an app, and `npm run test:pwa` style checks pass in Chrome
   Lighthouse (PWA installable, a11y ≥ 95).

## 3. DNS records (Hostinger → Domains → meiyiyal.com → DNS)
| type | name | value | for |
| --- | --- | --- | --- |
| A | `@` | Hostinger hosting IP (hPanel shows it) | web app |
| CNAME | `www` | `meiyiyal.com` | redirects to bare domain (.htaccess) |
| A | `admin` | same IP as `@` | admin console |
| A | `agent` | VM public IP | voice agent (services/agent) |
| A | `verify` | VM public IP | verification worker (services/verify) |
| A | `turn` | VM (or TURN VM) public IP | coturn |
| TXT | `@` | SPF from your SMTP provider | email deliverability |
| CNAME/TXT | as given | DKIM records from your SMTP provider | email deliverability |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@meiyiyal.com` | email |

## 4. VM: voice agent, verification worker, TURN
1. Ubuntu 24.04, open ports 80/443 (Caddy), 3478 udp/tcp, 5349 tcp, 49152–65535 udp (TURN).
2. Docker: `docker build -t meiyiyal-agent services/agent` and `docker build -t meiyiyal-verify services/verify`;
   run each with an env file (names in `.env.example` → agent / verify sections; the verify worker needs the
   service-role key and `VERIFY_SERVICE_KEY` = the value of the `verify_service_key` setting).
3. Reverse proxy with automatic HTTPS (Caddy): `agent.meiyiyal.com → 127.0.0.1:8787`, `verify.meiyiyal.com → 127.0.0.1:8788`.
4. coturn: `apt install coturn`, copy `deploy/coturn/turnserver.conf`, fill `__TURN_SECRET__` / `__PUBLIC_IP__`, certbot
   for `turn.meiyiyal.com`. Then `supabase secrets set ICE_PROVIDER=coturn TURN_URLS=… TURN_SECRET=…`.
5. Set `verify_service_url` (SQL in deploy/production/settings.sql). Check: Admin → Queue shows checks running.

## 5. Providers, one at a time (each: secrets → test with your own account → flip the setting)
| provider | secrets | flip | test |
| --- | --- | --- | --- |
| Razorpay | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`; webhook URL `…/functions/v1/payments-webhook` | `payments_mock=false` | buy the ₹99 pack, refund it from Razorpay |
| RazorpayX | `RAZORPAYX_*`; webhook `…/functions/v1/payout-webhook` | `payouts_mock=false`, later `payouts_auto=true` | ₹1 test payout to your own account |
| MSG91 | `MSG91_*`, `SMS_PROVIDER=msg91`, Send-SMS hook | — | phone sign-in on your number |
| Surepass | `KYC_PROVIDER=surepass`, `SUREPASS_TOKEN` | `kyc_provider=edge` | your own Aadhaar OTP |
| Web Push | `VAPID_*` (node scripts/gen-vapid-keys.mjs) | `push_mock=false` | turn on alerts, send yourself a chat |
| Google Maps (optional) | `GOOGLE_MAPS_SERVER_KEY`; build `VITE_MAPS_PROVIDER=google` + browser key | — | search an address |
| STT / LLM (optional) | `AGENT_STT_*`, `AGENT_LLM_*` on the VM; build `VITE_STT=auto` | — | speak in Tamil on Home |

## 6. Cron (already scheduled by the migrations, times in IST)
| job | schedule (UTC) | IST | does |
| --- | --- | --- | --- |
| fast-sweep | every 5 s | — | rings, timeouts, billing ticks |
| push-sweep | every 30 s | — | sends queued push notifications |
| verify-dispatch | every minute | — | hands verification jobs to services/verify |
| payout-retry | every 10 min | — | retries failed payouts |
| sms-outbox-sweep | hourly | — | trims the SMS outbox |
| account-purge | :15 hourly | :45 hourly | DPDP deletions after the grace period |
| verify-retention | :15 hourly | :45 hourly | deletes raw selfies after 30 days etc. |
| bonus-expire | 19:00 daily | 00:30 daily | expires bonus credits (90 days), warns 7 days before |
| verify-rechecks | 21:30 daily | 03:00 daily | re-checks council registrations |
| payout-weekly | 04:30 Monday | 10:00 Monday | weekly payouts (only when `payouts_auto` is on) |

## 7. Launch checks
- `check.sql` → everything OK except providers you deliberately keep in mock.
- Admin: each admin enrols an authenticator; Admin → Settings → Verification: per-category auto-approve stays **off**.
- Legal: lawyer-reviewed `/privacy` and `/terms` replace the DRAFT text (`src/features/legal/content.ts`); Grievance
  Officer details in `VITE_GRIEVANCE_*`; remove the DRAFT banner (`legal.draft` key / `Legal.tsx`).
- Monitoring: Supabase → Reports + Log drains (optional); an uptime check on `/login`, `agent…/agent/health`, `verify…/verify/health`.
