# Meiyiyal (மெய்யியல்)

Bilingual (Tamil / English) mobile-first web app that connects people in Tamil Nadu with **verified** doctors,
veterinarians, lawyers and engineers for chat, voice and video consultations, billed per minute from a wallet.

- **Web app**: React 18 + Vite + TypeScript + Tailwind/shadcn, installable PWA, i18next (`src/i18n/locales/{en,ta}.json`).
- **Backend**: Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions, pg_cron). All money, verification and
  admin logic lives in SQL functions under `supabase/migrations/`; the browser never writes balances or decisions.
- **Services**: `services/agent` (FastAPI voice/intent agent, optional server STT + LLM) and `services/verify`
  (FastAPI document / face / liveness verification worker).
- **Everything that needs an outside account is behind an adapter with a working mock** (payments, payouts, SMS, KYC, maps,
  TURN, STT/LLM, captcha). See `docs/HANDOFF.md` for each feature, its settings and the go-live checklist.

## Run locally

```bash
npm ci
npx supabase start                    # local Postgres/Auth/Storage (Docker); applies supabase/migrations
cp .env.example .env.local            # fill VITE_SUPABASE_URL=http://127.0.0.1:54321 and the local anon key (npx supabase status)
npx supabase functions serve          # Edge Functions (mocks unless secrets are set)
npm run agent:dev                     # optional: voice agent on :8787
npm run dev                           # http://localhost:8080
```

Local sign-in uses the Mailpit inbox at http://127.0.0.1:54324 (email links) or the fixed test OTPs in `supabase/config.toml`.
Admins: `INSERT INTO public.user_roles(user_id, role) VALUES ('<uuid>', 'admin');`, then open `/admin` and enrol an
authenticator app (admin MFA is on by default).

## Tests

| command | what |
| --- | --- |
| `npm run test:db` | SQL suites in `supabase/tests/` (RLS, money, verification, privacy, admin MFA …) |
| `npm run typecheck` · `npm run lint` · `npm run build` | static checks and production build |
| `npm run test:unit` | Node unit tests (`tests/unit/`) |
| `npm run test:agent` · `npm run test:verify` | pytest for the two Python services |
| `npm run test:e2e` | Playwright, mobile (Pixel 7) + desktop, incl. axe accessibility and visual checks |

## Layout

```
src/                 web app (pages/, features/<area>/, components/, i18n/)
supabase/migrations  schema + SQL API, in order    supabase/functions  Edge Functions (+ _shared adapters)
supabase/tests       SQL test suites               e2e/                Playwright specs
services/agent       voice agent (Python)          services/verify     verification worker (Python)
deploy/              cloudflare (Pages _headers), coturn, production     docs/  HANDOFF, go-live, admin subdomain
```

## Docs

- `docs/HANDOFF.md` — every feature: how it works, what is mocked, every setting, and **What Bala must provide**.
- `docs/GO-LIVE.md` — production steps for meiyiyal.com (Cloudflare Pages + DNS; Hostinger keeps the domain) + hosted Supabase (Mumbai).
- `docs/admin-subdomain.md` — optional admin.meiyiyal.com host (not used; console is meiyiyal.com/admin with TOTP).

Legal pages (`/privacy`, `/terms`) are **drafts** and must be reviewed by a lawyer before launch.
