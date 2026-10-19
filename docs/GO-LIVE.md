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
   `VITE_ADMIN_HOST=admin.meiyiyal.com`, `VITE_GRIEVANCE_NAME/EMAIL/PHONE/ADDRESS`, and as each provider goes live:
   `VITE_CAPTCHA_PROVIDER` + `VITE_CAPTCHA_SITE_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_STT`, maps (`.env.example`).
   **Never** put a secret (service-role key, Razorpay secret …) here. After changing a variable: Deployments →
   *Retry deployment* (they are read at build time).
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

### 2c. Checks
- `https://meiyiyal.com/login` opens with a padlock; `https://www.meiyiyal.com` goes to `https://meiyiyal.com`.
- Reload on a deep link (e.g. `https://meiyiyal.com/privacy`) still shows the page, not an error.
- Chrome → ⋮ → *Install app* works; Lighthouse PWA installable, accessibility ≥ 95 (same checks as `npm run test:pwa`).
- `https://admin.meiyiyal.com/admin` asks for sign-in + authenticator; `https://meiyiyal.com/admin` moves there.
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

## Appendix: Hostinger shared hosting (fallback only, not used)
Only if you ever move off Cloudflare Pages: buy a Hostinger web hosting plan, upload the contents of `dist/` plus
`deploy/hostinger/.htaccess` (same headers and SPA rules) to `public_html/`, enable SSL in hPanel, and point `@`, `www`,
`admin` at the hosting IP instead of `meiyiyal.pages.dev`.
