# Admin on admin.meiyiyal.com (optional, recommended)

The admin console is the same web app, served from a second host name. Security does **not** depend on the host:
the database refuses every admin read and write unless the signed-in user holds the `admin` role **and** the session
has passed the authenticator (TOTP) step (`aal2`). The separate host adds:

- a separate browser origin, so an admin session is not shared with ordinary browsing on meiyiyal.com;
- a place to add extra edge rules (IP allow-list, HTTP basic auth) without touching the public site;
- `noindex` on every response, so search engines never list it.

## Steps (Hostinger DNS + the same build)

1. **DNS.** Hostinger hPanel → Domains → meiyiyal.com → DNS / Nameservers → add a record:
   - if the site is on Hostinger hosting: `A  admin  <same IP as the @ record>`;
   - if the site is on another static host (Netlify / Cloudflare Pages / Vercel): `CNAME  admin  <that host's target>`.
2. **Hosting.** Point `admin.meiyiyal.com` at the same `dist/` folder (Hostinger: Websites → Add website → subdomain →
   same files, or a second deploy of the same build). Keep HTTPS on (free SSL in hPanel).
3. **Build setting.** Build the web app with `VITE_ADMIN_HOST=admin.meiyiyal.com`. With it set:
   - visiting `/admin` on meiyiyal.com sends the browser to `https://admin.meiyiyal.com/admin`;
   - admins sign in again there (sessions are per origin) and pass the authenticator step.
4. **Supabase Auth URLs.** Dashboard → Authentication → URL configuration → add
   `https://admin.meiyiyal.com/auth/callback` to *Redirect URLs* (keep the main one).
5. **Headers.** `deploy/hostinger/.htaccess` sends `X-Robots-Tag: noindex` for the admin host and `/admin`, plus the
   security headers used on the main site. Optional extra: an IP allow-list for the admin host
   (commented block in the same file).
6. **Authenticator.** Each admin opens `/admin`, scans the QR code with Google/Microsoft Authenticator or Authy and enters a
   code. Lost phone → another admin uses Admin → Security → Reset (written to the audit log with a reason). If the last
   admin loses theirs, run in the Supabase SQL editor: `DELETE FROM auth.mfa_factors WHERE user_id = '<uuid>';`.

## Related settings (Admin → Settings → Security)

| key | default | meaning |
| --- | --- | --- |
| `admin_mfa_required` | `true` | Admin powers need TOTP. Can be turned **on** in the app but only turned **off** from SQL. |
| `admin_idle_minutes` | `30` | Admin tabs sign out after this many idle minutes (activity in any tab counts). |

Without `VITE_ADMIN_HOST` the console simply stays at `meiyiyal.com/admin`; everything else above still applies.
