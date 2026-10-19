# Cloudflare Pages files

`_headers` and `_redirects` are copied into `dist/` on every `npm run build` (plugin `cloudflarePagesFiles` in
`vite.config.ts`). Cloudflare Pages reads them from there. Setup steps: `docs/GO-LIVE.md` §2–3.

- `_headers`: security headers + Content-Security-Policy, `noindex` for the admin host and `/admin`, caching
  (`/assets/*` forever, `index.html` / `sw.js` / `manifest.webmanifest` never).
- `_redirects`: intentionally no rules. Pages already answers every unknown path with `index.html` because `dist/` has no
  `404.html`.

Changing the CSP? Change `deploy/hostinger/.htaccess` (fallback host) the same way.

Test locally: `npm run build && npx wrangler pages dev dist` → open the printed address; `curl -I` a deep link such as
`/privacy` (200, HTML) and `/assets/<file>.js` (`Cache-Control: public, max-age=31536000, immutable`).
