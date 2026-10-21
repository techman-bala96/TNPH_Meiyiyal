# Admin on admin.meiyiyal.com (optional, not used now)

> **Current setup: leave `VITE_ADMIN_HOST` empty; the console is at `https://meiyiyal.com/admin`.** The sign-in
> session lives in `localStorage`, which is separate for each domain, so redirecting meiyiyal.com/admin to
> admin.meiyiyal.com loses the session and bounces to the normal app (bug found 21 Oct 2026).
> `admin.meiyiyal.com` currently just shows the normal app. To use a separate admin domain at launch, admins must
> sign in directly on that domain, and it must be added to the Supabase Redirect URLs (step 4).

The admin console is the same web app, served from a second host name. Security does **not** depend on the host:
the database refuses every admin read and write unless the signed-in user holds the `admin` role **and** the session
has passed the authenticator (TOTP) step (`aal2`). The separate host adds:

- a separate browser origin, so an admin session is not shared with ordinary browsing on meiyiyal.com;
- a place to add extra edge rules (IP allow-list, HTTP basic auth) without touching the public site;
- `noindex` on every response, so search engines never list it.

## Steps (Cloudflare Pages + the same build)

1. **Hosting + DNS.** The same Cloudflare Pages project that serves meiyiyal.com serves the admin host too (one build,
   no second project): Workers & Pages → `meiyiyal` → Custom domains → add `admin.meiyiyal.com`. Cloudflare makes the
   `CNAME admin → meiyiyal.pages.dev` record and the free SSL certificate itself (docs/GO-LIVE.md §2b, §3).
2. **Nothing else to upload.** Every push to `meyiyal-v1` updates both hosts at once.
3. **Build setting (only if you adopt this).** `VITE_ADMIN_HOST=admin.meiyiyal.com`. With it set:
   - visiting `/admin` on meiyiyal.com sends the browser to `https://admin.meiyiyal.com/admin`;
   - the meiyiyal.com session does **not** carry over (localStorage is per domain); admins must sign in directly on
     admin.meiyiyal.com and pass the authenticator step.
4. **Supabase Auth URLs.** Dashboard → Authentication → URL configuration → add
   `https://admin.meiyiyal.com/auth/callback` to *Redirect URLs* (keep the main one).
5. **Headers.** `deploy/cloudflare/_headers` sends `X-Robots-Tag: noindex` for `https://admin.meiyiyal.com/*` and `/admin`,
   plus the security headers used on the main site. Optional extra lock: Cloudflare → meiyiyal.com → Security → WAF →
   Custom rule "hostname equals admin.meiyiyal.com and IP not in {office/home IPs} → Block" (free plan allows it), or
   Cloudflare Zero Trust → Access (free up to 50 users) for an e-mail login in front of the admin host.
6. **Authenticator.** Each admin opens `/admin`, scans the QR code with Google/Microsoft Authenticator or Authy and enters a
   code. Lost phone → another admin uses Admin → Security → Reset (written to the audit log with a reason). If the last
   admin loses theirs, run in the Supabase SQL editor: `DELETE FROM auth.mfa_factors WHERE user_id = '<uuid>';`.

## Related settings (Admin → Settings → Security)

| key | default | meaning |
| --- | --- | --- |
| `admin_mfa_required` | `true` | Admin powers need TOTP. Can be turned **on** in the app but only turned **off** from SQL. |
| `admin_idle_minutes` | `30` | Admin tabs sign out after this many idle minutes (activity in any tab counts). |

Without `VITE_ADMIN_HOST` the console simply stays at `meiyiyal.com/admin`; everything else above still applies.
