# Go-live: meiyiyal.com on Cloudflare Pages + hosted Supabase (Mumbai)

Nothing in this repo deploys by itself. Follow the steps in order; each ends with a check. Secret **names** are listed
here, never values. Keep values in a password manager and in `supabase secrets` / the VM env files only.

Run `psql "$PROD_DB_URL" -f deploy/production/check.sql` at any point: it prints OK / TODO for every go-live item.

## 0. Accounts Bala needs (see HANDOFF §27 "What Bala must provide")
**On hold (19 Oct 2026):** all key-dependent features stay on their mock adapters until the keys arrive; HANDOFF §27 lists
each key with the exact env var / setting it goes into and where to get it.
Supabase (Pro plan recommended for daily backups + PITR), **Cloudflare (free: web hosting on Pages + DNS + Turnstile)**,
Hostinger (domain only, already bought; no hosting plan), Razorpay + RazorpayX,
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
     (The app sends people back to `<its own address>/auth/callback`, so these two cover both hosts; `www` always moves
     to the bare domain first. To try the app on `https://meiyiyal.pages.dev` before DNS is ready, add
     `https://meiyiyal.pages.dev/**` for that test and remove it afterwards.)
   - Providers: Email (magic link) on; Phone on; Google with the OAuth client (authorised redirect
     `https://<project-ref>.supabase.co/auth/v1/callback`).
   - SMTP: Settings → SMTP with your sender (from `no-reply@meiyiyal.com`); templates from `supabase/templates/`.
   - Hooks → **Send SMS** → HTTPS `https://<project-ref>.supabase.co/functions/v1/sms-hook`; copy the secret into
     `SEND_SMS_HOOK_SECRET`; set `SMS_PROVIDER=msg91` + `MSG91_*`.
   - MFA: TOTP **enabled** (admins need it).
   - Bot protection: Turnstile + secret; build the web app with `VITE_CAPTCHA_PROVIDER=turnstile` + site key.
   - Rate limits: keep defaults or lower (e.g. 30 SMS / hour project-wide at launch).
7. Database → Backups: confirm daily backups (Pro) and enable PITR if budget allows.

## 2. Web app on Cloudflare Pages (free)
**Decided 19 Oct 2026:** the web app is hosted on **Cloudflare Pages** (free plan, commercial use allowed, no bandwidth
limit, free SSL). **No Hostinger hosting plan is needed.** Hostinger keeps only the domain registration (meiyiyal.com).
The app is static files (`dist/`); everything that runs (database, payments, sign-in) is on Supabase, and the agent /
verify / TURN servers are on the VM (§4).

**Before 15 Feb 2027:** hPanel → Domains → meiyiyal.com → turn **Auto-renewal ON** (today it is off; renewal ₹1,499/year).
If the domain lapses, the whole site stops.

### 2a. Cloudflare account and the meiyiyal.com site
1. Sign up free at **dash.cloudflare.com** (use the same e-mail you keep for business accounts).
2. **Add a domain** → `meiyiyal.com` → plan **Free** → Cloudflare scans the current records. Delete the scanned
   Hostinger parking records (any `A @` / `CNAME www` pointing at Hostinger parking); you add the real ones in §3.
3. Cloudflare shows **two nameservers** (for example `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`; yours will differ).
4. **Hostinger:** hPanel → Domains → meiyiyal.com → **DNS / Nameservers** → *Change nameservers* → choose
   *Use custom nameservers* → replace `ns1.dns-parking.com` / `ns2.dns-parking.com` with the two Cloudflare names → Save.
   (If DNSSEC is on in hPanel, turn it off first; you can turn it on again later from Cloudflare → DNS → Settings.)
5. Wait until Cloudflare e-mails "meiyiyal.com is now active" (minutes to a few hours, at most 24 h).
   Why nameservers move: the bare domain `meiyiyal.com` can only point at Pages when Cloudflare runs the domain's DNS.
6. Cloudflare → meiyiyal.com → **SSL/TLS**: mode **Full (strict)**; Edge Certificates → **Always Use HTTPS ON**.
   Certificates are automatic and free; nothing to buy or renew.
7. Leave **Rocket Loader** and automatic **Web Analytics** off: they inject scripts that the app's security policy
   (`deploy/cloudflare/_headers`) blocks. (If you want Web Analytics later, add `https://static.cloudflareinsights.com`
   to `script-src` and `https://cloudflareinsights.com` to `connect-src` in that file.)

### 2b. Pages project (one project serves meiyiyal.com, www and admin)
1. Cloudflare → **Workers & Pages** → Create → **Pages** → **Connect to Git** → GitHub → allow the
   `techman-bala96/TNPH_Meiyiyal` repo.
2. Settings:
   | field | value |
   | --- | --- |
   | Project name | `meiyiyal` (gives `meiyiyal.pages.dev`) |
   | Production branch | `meyiyal-v1` (never `main`) |
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` (Pages runs `npm ci` first by itself) |
   | Build output directory | `dist` |
   | Root directory | *(empty)* |
3. **Environment variables → Production** (plain variables; these are public values that end up in the browser):
   `NODE_VERSION=22` (the repo also has `.node-version`), `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`,
   `VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>`, `VITE_AGENT_URL=https://agent.meiyiyal.com`,
   `VITE_ADMIN_HOST` **empty** (see the note below), `VITE_GRIEVANCE_NAME/EMAIL/PHONE/ADDRESS`, and as each provider goes live:
   `VITE_CAPTCHA_PROVIDER` + `VITE_CAPTCHA_SITE_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_STT`, maps (`.env.example`).
   `VITE_TEST_MODE` must be **empty or absent** for the real launch (it is `true` only for the test deployment, §8).
   **Never** put a secret (service-role key, Razorpay secret …) here. After changing a variable: Deployments →
   *Retry deployment* (they are read at build time).
   > **Leave `VITE_ADMIN_HOST` empty.** The sign-in session lives in the browser's `localStorage`, which is separate
   > for each domain. With `VITE_ADMIN_HOST=admin.meiyiyal.com`, opening `meiyiyal.com/admin` redirects to
   > `admin.meiyiyal.com`, where there is no session, so the admin page bounces back to the normal app. That was the
   > bug found on 21 Oct 2026. The admin console therefore lives at `https://meiyiyal.com/admin`. Today
   > `admin.meiyiyal.com` just shows the normal app. If a separate admin domain is wanted at launch, admins must sign
   > in **directly on that domain** (not via meiyiyal.com), and it must be in the Supabase Redirect URLs
   > (docs/admin-subdomain.md).
4. Settings → Builds → **Branch control → Preview branches: None** (so other branches are not published).
5. **Custom domains** → Set up a custom domain → add `meiyiyal.com`, then `www.meiyiyal.com`, then
   `admin.meiyiyal.com`. Cloudflare creates the DNS records and SSL for each one itself.
6. **www → meiyiyal.com:** meiyiyal.com → Rules → **Redirect Rules** → Create from template **"Redirect from WWW to
   root"** (301, keep the query string).
7. Every push to `meyiyal-v1` now builds and goes live by itself. Roll back: Deployments → an older one → *Rollback*.

What the repo adds to the build (`deploy/cloudflare/`, copied into `dist/` by `vite.config.ts`):
- `_headers`: security headers + CSP (same as the old `.htaccess`), `noindex` for the admin host and `/admin`,
  `/assets/*` cached forever (file names change each build), `index.html` / `sw.js` / `manifest.webmanifest` never cached.
- `_redirects`: no rules needed. Deep links like `/privacy`, `/admin`, `/session/…` work because `dist/` has no
  `404.html`, so Pages serves `index.html` for every unknown path; real files (service worker, manifest, icons) are
  served as themselves.

*Without Git (optional):* on your PC with `.env.production.local` filled: `npm ci && npm run build` then
`npx wrangler pages deploy dist --project-name meiyiyal --branch meyiyal-v1`. (A project made this way cannot be
switched to Git later; pick one way.)

### 2b-2. Auto-deploy (GitHub Actions)
The Pages project is *Direct Upload*, so it cannot use Cloudflare's Git integration. Instead
`.github/workflows/deploy-pages.yml` builds and runs `wrangler pages deploy dist --project-name=meiyiyal
--branch=meyiyal-v1` on every push to `meyiyal-v1` (and by hand: Actions → *Deploy to Cloudflare Pages* → *Run
workflow*). One deploy runs at a time. Roll back in Cloudflare: Deployments → an older one → *Rollback*.

Set once in GitHub → repo → Settings → Secrets and variables → Actions:
- **Secrets** (never commit these): `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Make a **new** token
  (My Profile → API Tokens → Create custom token) with only **Account › Cloudflare Pages: Edit** for this account,
  and revoke any token that was shared in chat or email.
- **Variables** (public, they end up in the browser bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  (anon key) and `VITE_TEST_MODE` (`true` for the test site; delete it for the real launch, §8).
  `VITE_ADMIN_HOST` is always empty in the workflow. Add other `VITE_*` values (§2b list) to both the variables and
  the workflow's Build step as each provider goes live.

### 2c. Checks
- `https://meiyiyal.com/login` opens with a padlock; `https://www.meiyiyal.com` goes to `https://meiyiyal.com`.
- Reload on a deep link (e.g. `https://meiyiyal.com/privacy`) still shows the page, not an error.
- Chrome → ⋮ → *Install app* works; Lighthouse PWA installable, accessibility ≥ 95 (same checks as `npm run test:pwa`).
- `https://meiyiyal.com/admin` (signed in on meiyiyal.com) asks for the authenticator and opens the console; it does
  **not** move to another host (`VITE_ADMIN_HOST` empty).
- DevTools → Console shows no "Content Security Policy" errors while signing in, paying and making a call.

## 3. DNS records (Cloudflare → meiyiyal.com → DNS → Records)
Orange cloud = **Proxied** (traffic goes through Cloudflare). Grey cloud = **DNS only** (Cloudflare only answers the
name; traffic goes straight to your server).

| type | name | value | proxy | for |
| --- | --- | --- | --- | --- |
| CNAME | `@` | `meiyiyal.pages.dev` | orange (made by Pages, §2b-5) | web app |
| CNAME | `www` | `meiyiyal.pages.dev` | orange (made by Pages) | redirect rule → bare domain |
| CNAME | `admin` | `meiyiyal.pages.dev` | orange (made by Pages) | admin console |
| A | `agent` | VM public IP | **grey** (recommended at launch) | voice agent (services/agent) |
| A | `verify` | VM public IP | **grey** (recommended) | verification worker (services/verify) |
| A | `turn` | VM (or TURN VM) public IP | **grey, always** | coturn |
| TXT | `@` | SPF from your e-mail sender (e.g. `v=spf1 include:… ~all`) | — | e-mail |
| CNAME/TXT | as given | DKIM records from your e-mail sender | **grey** | e-mail |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@meiyiyal.com` | — | e-mail |
| MX | `@` | only if you want to *receive* mail at @meiyiyal.com (Zoho / Google Workspace give the values) | — | inbox |

Why grey for these:
- **turn** must be grey: Cloudflare's proxy only carries web traffic, not the TURN ports (3478 udp/tcp, 5349, 49152–65535 udp).
  Orange would break calls on mobile data.
- **agent / verify**: grey lets Caddy on the VM get its own free certificate straight away and keeps request sizes and
  time limits as Caddy sets them. Orange also works (hides the VM IP, adds DDoS protection) **only after** Caddy has its
  certificate and SSL mode is *Full (strict)*; if you switch, keep Bot Fight Mode off for these names, because the
  verify worker is called by Supabase, not a browser.
- **DKIM CNAMEs** must be grey or the mail checks fail. TXT / MX records are never proxied.

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

## 8. Test deployment on meiyiyal.com (mocks on)
**Decided 19 Oct 2026:** before the real keys exist, meiyiyal.com runs a **test version**: Cloudflare Pages + a free
hosted Supabase project, every provider on its mock (payments, SMS/OTP with fixed codes, KYC, verification, push), and
demo professionals. Everything in §1–§3 applies, with the differences below. Going live for real later = new keys in the
same project (or a fresh Pro project), `VITE_TEST_MODE` removed, demo data deleted (end of this section).

### 8a. The `VITE_TEST_MODE` flag
`VITE_TEST_MODE=true` at build time (Pages → Settings → Environment variables) turns on:
- a slim, non-dismissable bar on **every** screen, admin included: *"Test version — payments and OTP are not real"* /
  *"சோதனைப் பதிப்பு — பணம் செலுத்துதலும் OTP-யும் உண்மையானவை அல்ல"* (follows the app language). The page, sticky headers
  and the session pill move down under it; the bottom nav is untouched (`src/components/app/TestModeBanner.tsx`, `index.css`);
- `<meta name="robots" content="noindex, nofollow">` in `index.html` and a `robots.txt` that disallows everything,
  so search engines don't list the test site.

Any other value (empty, `false`, missing) = nothing changes; the real build is identical to one without the flag.
Changing it needs a rebuild: Deployments → *Retry deployment*.

### 8b. Supabase (free tier, region Mumbai)
Same as §1 steps 1–5 (`db push`, `settings.sql`, `functions deploy`), on the **Free** plan (pauses after 7 days without
traffic; Dashboard → *Restore* brings it back; no daily backups, which is fine for test data). Then:
1. **Function secrets (mocks):** `npx supabase secrets set SMS_PROVIDER=mock KYC_PROVIDER=mock
   MOCK_PAYMENT_SECRET=<random> MOCK_WEBHOOK_SECRET=<random> ICE_PROVIDER=stun`. Leave every Razorpay / RazorpayX /
   MSG91 / Surepass secret **unset**: payments and payouts then stay on the mock checkout (`payments_mock` /
   `payouts_mock` settings stay on; check them in Admin → Settings).
   `settings.sql` is written for the real launch, so for the test version put two mocks back afterwards (SQL editor):
   `UPDATE public.app_settings SET value='true' WHERE key='push_mock'; UPDATE public.app_settings SET value='"123456"'
   WHERE key='kyc_stub_otp';` (mock push; the mock KYC / step-up code is 123456). VAPID keys
   (`node scripts/gen-vapid-keys.mjs`) are optional; without them the push switch says push is unavailable.
2. **Auth → URL configuration:** Site URL `https://meiyiyal.com`; Redirect URLs `https://meiyiyal.com/**`,
   `https://admin.meiyiyal.com/**` (add `https://meiyiyal.pages.dev/**` while trying it before DNS is ready).
2a. **Auth → Providers → Google** (test site, set up 21 Oct 2026): Google Cloud project `hopeful-market-512207-h6`,
   OAuth client "Meiyiyal Supabase" (Web application), consent screen **published to production** (any Gmail can sign
   in; Google shows "unverified app" until the app is verified before the real launch). Authorized redirect URI:
   `https://dsegcwepcbphjyfzvmab.supabase.co/auth/v1/callback`. The Client ID and Secret are entered only in the
   Supabase dashboard; never commit them.
3. **Auth → Providers → Phone:** on. Hosted Supabase needs an SMS sender before it accepts phone sign-in: use
   **Hooks → Send SMS** → `https://<project-ref>.supabase.co/functions/v1/sms-hook` with `SMS_PROVIDER=mock` (no SMS
   is sent; codes land in `public.sms_outbox`) and copy the hook secret into `SEND_SMS_HOOK_SECRET`.
4. **Fixed test OTPs:** Auth → Providers → Phone → **Test phone numbers and OTPs** (no SMS, no hook call for these):
   `919876543210=123456, 919000000003=135790, 919000000001=654321, 919000000004=112233, 919000000002=246810`
   (same as `supabase/config.toml` `[auth.sms.test_otp]`). Supabase lets test numbers be valid for a limited time;
   set the expiry far ahead and renew it if sign-in starts saying "invalid code".
5. **Auth → MFA:** TOTP on (the admin needs an authenticator code). Captcha off (`VITE_CAPTCHA_PROVIDER` empty).
6. **Demo data** (from your PC, Python 3 + `psql`; DB URL from Dashboard → *Connect* → Session pooler):
   ```bash
   MEIYIYAL_DEMO_SEED=yes SUPABASE_URL=https://<project-ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service_role or sb_secret key> SUPABASE_ANON_KEY=<anon or sb_publishable key> \
   SUPABASE_DB_URL='postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' \
   python3 scripts/seed_demo.py
   ```
   Creates 17 approved demo professionals (doctors incl. vet/physio, lawyers, engineers) across 9 districts, the two
   clients, the admin (role + authenticator; the key is printed and saved to `admin-totp-secret.txt`, which git
   ignores) and a pg_cron job `demo-presence` that keeps the demo pros online. Safe to re-run. **Test projects only:**
   it refuses to run without `MEIYIYAL_DEMO_SEED=yes`.

### 8c. Pages build variables for the test version
`NODE_VERSION=22`, `VITE_TEST_MODE=true`, `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`,
`VITE_SUPABASE_PUBLISHABLE_KEY=<anon / publishable key>`. Leave `VITE_ADMIN_HOST` **empty** (§2b note: the session
is per domain, so the redirect to admin.meiyiyal.com lost it; bug found 21 Oct 2026).
Leave `VITE_AGENT_URL` empty unless the VM (§4) is up (voice search / AI helper are then hidden or fall back), and
leave `VITE_CAPTCHA_*`, `VITE_CALL_PROVIDER`, `VITE_MAPS_PROVIDER` empty (defaults: no captcha, WebRTC with STUN, OSM).
Without TURN (§4) calls can fail on mobile data; Wi-Fi works best.

### 8d. Logins on the test site
| who | phone | OTP |
| --- | --- | --- |
| client | 9876543210 | 123456 |
| second client | 9000000003 | 135790 |
| doctor (Dr. Priya Raman) | 9000000001 | 654321 |
| lawyer (Adv. Lakshmi Narayanan) | 9000000004 | 112233 |
| admin | 9000000002 | 246810, then the authenticator code |

### 8e. From test to real launch
1. Remove `VITE_TEST_MODE` in Pages and redeploy (bar and noindex disappear).
2. Delete demo data: `SELECT cron.unschedule('demo-presence');` and delete the demo users (phones `919000000%` and
   `919876543210`) in Dashboard → Authentication → Users; remove the test phone numbers.
3. Do §5 (real providers one at a time) and upgrade the project to Pro (backups, no pausing) per §1.7.

## Appendix: Hostinger shared hosting (fallback only, not used)
Only if you ever move off Cloudflare Pages: buy a Hostinger web hosting plan, upload the contents of `dist/` plus
`deploy/hostinger/.htaccess` (same headers and SPA rules) to `public_html/`, enable SSL in hPanel, and point `@`, `www`,
`admin` at the hosting IP instead of `meiyiyal.pages.dev`.
