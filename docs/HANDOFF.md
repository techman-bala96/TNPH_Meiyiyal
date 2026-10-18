# Meiyiyal (மெய்யியல்) — Complete Engineering Handoff

_Last updated: Sunday 18 Oct 2026, 10:15 AM IST · Build-box repo `/workspace/TNPH_Meiyiyal`, branch `meyiyal-v1` (HEAD `137cf8e`, original history, local only) · **GitHub:** sanitised history pushed as branch [`meyiyal-v1`](https://github.com/techman-bala96/TNPH_Meiyiyal/tree/meyiyal-v1) of `techman-bala96/TNPH_Meiyiyal` (HEAD `e427ec3`) · Working tree clean._
_This file replaces the 16 Oct HANDOFF.md. It is self-contained: you can rebuild, run, test and continue the project from this file plus the git bundle in `meiyiyal-handoff.zip`._

> **⚠️ இனிமே எல்லா வேலையும் இந்த branch-ல மட்டும் தான் / All work continues ONLY on this branch:** [`techman-bala96/TNPH_Meiyiyal` → `meyiyal-v1`](https://github.com/techman-bala96/TNPH_Meiyiyal/tree/meyiyal-v1). Clone it with `git clone -b meyiyal-v1 https://github.com/techman-bala96/TNPH_Meiyiyal.git`, commit and push to `meyiyal-v1`. Do **not** work on `main`, which is the old Lovable code with the leaked `.env`. Do **not** push from the build-box `/workspace/TNPH_Meiyiyal`, whose history still holds `.env`. Later, `meyiyal-v1` becomes the default branch (Appendix D).

> **Public copy:** test phone numbers, OTPs and the preview URL are replaced with `<placeholders>` (`<TEST_PHONE_n>` = number as stored with the 91 prefix, `<TEST_PHONE_n_LOCAL>` = the 10-digit number typed in the app). The full version is kept privately on the build box (`/workspace/meyiyal/docs/HANDOFF.md`).

> **Spelling:** the product is **Meiyiyal**. The older spelling "meyiyal" still shows in a few technical names: the branch `meyiyal-v1`, the docs folder `/workspace/meyiyal`, the Docker project id `meyiyal-local` and the container names `supabase_*_meyiyal-local`. These are cosmetic and work as they are.

---

## தமிழ் சுருக்கம் (Tamil summary)

**மெய்யியல்** என்பது தமிழ்நாட்டுக்கான ஒரு mobile-first PWA. இதில் மக்கள் சரிபார்க்கப்பட்ட **மருத்துவர், வழக்கறிஞர், பொறியாளர்களிடம்** online-ல் (chat, voice, video, file share) ஆலோசனை பெறலாம். கட்டணம் **credits** மூலம் (1 credit = ₹1).

**முடிந்தவை (எல்லா tests-உம் pass):**
- Login: phone OTP, email, Gmail
- Location: map, GPS, 38 மாவட்டங்கள், 213 பகுதிகள்
- Find Worker / Worker tabs, category வாரியாக browse பண்றது
- Worker registration (profession ஒரு தடவை தேர்ந்தெடுத்தா lock ஆயிடும்), admin approval, Go Online
- அருகில் இருப்பவர்களின் பட்டியல், online-ல இருப்பவர்கள் முதல்ல
- Request அனுப்பினா worker-க்கு ring + vibrate, chat, voice/video call, file share, நிமிஷக் கணக்குல credits கழியும்
- Feedback, 9 வகை rewards + certificates (EN/TA, PNG/PDF), negative flag, 7 நாள் தற்காலிக block, admin moderation, audit log
- Top bar mic voice agent (EN/TA/Tanglish)
- Wallet, credit packs (₹99–₹1,999), Razorpay (keys இல்லாததால இப்போ mock), worker earnings (15%/18% commission, 72 மணி நேர hold), payout request, admin "mark paid"
- கீழே Home / Conversations / Profile bottom bar

**GitHub:** சுத்தம் பண்ண (`.env` இல்லாத) code [`meyiyal-v1` branch](https://github.com/techman-bala96/TNPH_Meiyiyal/tree/meyiyal-v1)-ல push ஆயிருக்கு (HEAD `e427ec3`). `main` branch-ஐ தொடல; அதுல பழைய `.env` இன்னும் இருக்கு.

**Tests:** DB 111 PASS, Playwright 32/32, voice agent pytest 107, lint 11 (பழைய baseline).

**அடுத்து செய்ய வேண்டியவை (இந்த வரிசையில்):**
1. Verification engine v1. எல்லாம் முடிஞ்ச அளவு automate: doctors/lawyers-உம் checks pass ஆனா தானா approve ஆகணும். "Licence verified" / "Degree verified" ரெண்டு badge இருக்கும். எல்லா வகை engineers, doctors-ஐயும் சேர்க்கணும்.
2. RazorpayX மூலம் payout automation + penny-drop.
3. FCM push.
4. TURN/100ms.
5. MSG91 SMS.
6. Google Maps.
7. முழு test matrix, UI polish.
8. Admin editors.
9. Production deploy, DPDP.

**உங்கள் வேலை:**
- பழைய Supabase anon key-ஐ rotate பண்ணுங்க. இது **மிக அவசரம்**.
- KYC provider, RazorpayX, MSG91 DLT, 100ms, FCM, Google Maps accounts.
- வக்கீல் ஆலோசனை.
- Privacy policy.

---

## Table of contents
1. Product vision, every user requirement and decision (with WHY)
2. Architecture, stack, folder map
3. Milestones M0 → M6 + UI changes (what, files, DB, config values)
4. Configuration, environment variable names, providers, pluggable/mock behaviour
5. Local setup from scratch + test accounts + running every test suite
6. Known issues, limitations, security items
7. Remaining work, in order
8. Testing plan for each remaining item
9. Cost estimates (ESTIMATES, with sources)
10. User action items
- Appendix A: commit list + bundle hash map
- Appendix B: screenshot index
- Appendix C: other docs in this package
- Appendix D: GitHub branch (where the code lives now)

---

## 1. Product vision, requirements and decisions

### 1.1 Vision
Meiyiyal is a **Tamil Nadu-first marketplace for ONLINE professional consultation**. A person opens the app on a phone or laptop and finds a verified professional near them. They consult by chat, voice or video, share documents, and pay in prepaid credits. One login can be a **User** (the "Find Worker" tab) and/or a **Worker** (the "Worker" tab). The trust layer covers verification, ratings, reward certificates, temporary negative flags and temporary blocks. An admin console runs approvals, moderation, rates, packs, payments and payouts. A hands-free **voice agent** (Tamil + English + Tanglish) can drive search.

**Why online-first:** the user's primary focus is "online solutions/consultation". Research (`research.md` §1) showed that doctors (telemedicine, TPG 2020), lawyers (advice and document review) and engineers/architects (plan review, software consulting) can genuinely deliver online. Skilled trades (plumber, painter) mostly can't, so they are deferred.

### 1.2 Requirements from the user, in their order (source: `flow-notes.md`, chat, `00-decisions.md`)
| # | Requirement / decision | Status | WHY |
|---|---|---|---|
| 1 | **Login:** Gmail, Email or Phone + OTP, each a clear, separate option; username optional | ✅ | Low-friction onboarding; phone is the default in TN |
| 2 | **After login → Location page**, Swiggy/Zomato-style: live GPS or manual pick; distances computed from it | ✅ (Leaflet + OSM map; Google Maps pluggable) | Distance drives ranking ("near me") |
| 3 | **Two tabs:** Find Worker / Worker | ✅ | One account, two roles |
| 4 | **Browse:** groups → categories → sub-categories (→ specialty) with breadcrumbs, "zero confusion"; TN-realistic taxonomy | ✅ 81 nodes, EN+TA | Data-driven tree; admin can add nodes without a deploy |
| 5 | **v1 scope = Doctor, Lawyer, Engineer only** (Group A, "Professionals") | ✅ | Highest online value, clear licensing. Skilled trades later |
| 6 | **Worker list:** online first, card shows rating, specialty, info, distance km | ✅ | Speed to consult |
| 7 | **Request → worker phone rings with vibration** (app open or background) → accept | ✅ in-app ring; ❌ background push (FCM pending) | Real-time matching |
| 8 | **Credits:** user buys credits; chat/voice/video billed per minute; file sharing in chat and in calls | ✅ (Razorpay mock until keys) | Closed-loop wallet = simple refunds, no cash-out (RBI closed-system PPI) |
| 9 | **Rewards/recognition certificates** based on quality + feedback | ✅ 9 milestones, EN/TA PNG/PDF | Motivates good workers |
| 10 | **Negative feedback is temporary:** watch the next 3–4 jobs; hide it if they're good. 2–3 negatives → temporary block | ✅ flag clears after 3 good sessions; 3 negatives / 30 days → 7-day block | Fair to workers, protects users |
| 11 | **Worker registration:** name, location, education, experience, work type, Aadhaar OTP, degree + experience certificates; **category-specific requirements**; manual verification within 24 h now, verification engine later | ✅ (Aadhaar via stub) | Trust |
| 12 | **Go Online toggle** | ✅ | Availability |
| 13 | **Separate admin interface:** verify docs, approve, manage workers, monitor performance, blocks | ✅ `/admin` (Queue, Moderation, Rates, Audit, Packs, Payments, Payouts) | Operations |
| 14 | **Brand Meiyiyal**: green "M" with a tick, red "eiyiyal"; new logo supplied by the user | ✅ | — |
| 15 | **Coverage: all 38 TN districts**, Kanniyakumari first, plus major towns/areas | ✅ 38 districts, 213 areas with coordinates (117 have Tamil names) | Launch region |
| 16 | **Lawyers in FULL mode** (ratings, rewards, ranking, online-first) like doctors/engineers; the earlier "BCI compliance mode" is dropped | ✅ (one exception: the voice agent never sorts lawyers by rating, see §6) | User decision 16 Oct. Legal risk noted (BCI Rule 36) |
| 17 | **Dynamic / config-driven:** categories, pricing, documents, rates, thresholds live in the DB and are admin-editable; no hardcoding | ✅ mostly (`app_settings`, `rate_cards`, `credit_packs`, `node_requirements`, `reward_milestones`, `commission_rules`); admin editors exist for rates + packs only | Long-term product |
| 18 | **Neat, trendy UI**, no unnecessary text, smooth animations, mobile + desktop, light + dark, EN + TA | ✅ ongoing; polish pass pending | — |
| 19 | **Exhaustive testing** per page / scenario / category / sub-category, mobile + desktop | 🟡 strong coverage; full matrix pending | Gated delivery |
| 20 | **Gated delivery:** each step verified with automated tests + screenshots before the next starts | ✅ followed | Quality |
| 21 | **Voice agent:** top-bar mic; filter/sort the list by speech; asks follow-up questions; EN + TA | ✅ M5 | Accessibility |
| 22 | **Profession lock:** once a worker submits a profession it can never be changed | ✅ server trigger | Stops category-hopping fraud |
| 23 | **Bottom navigation:** Home / Conversations / Profile at the bottom (not Conversations inside the profile menu) | ✅ `137cf8e` | User request 17 Oct |
| 24 | **Automate payouts** (no manual admin "mark paid" in the normal case) | ❌ next (RazorpayX + penny-drop) | User request 17 Oct |
| 25 | **Automate verification as much as possible**, including **auto-approve for doctors & lawyers** when all checks pass | ❌ next (verification engine v1) | User request 17 Oct |
| 26 | **Council website lookups automated** as score signals, with admin fallback | ❌ next | User asked for clarification; answered: allowed as signals |
| 27 | **Two-tier badges:** "Licence verified" (statutory register) vs "Degree verified" (unregulated disciplines); handle both correctly | ❌ next | Some disciplines have no licence |
| 28 | **Engineers: all disciplines that can consult online**: software, IT, data/AI, cyber security, cloud, civil, structural, electrical, mechanical, electronics, chemical, etc., each with the discipline-correct licence | ❌ next (today: 8 engineer sub-categories) | Software engineers can be hired online too |
| 29 | **Doctors: all systems**: Allopathy, Siddha, Ayurveda, Unani, Homoeopathy, Yoga & Naturopathy, Dental, Physio, Psychology, Nutrition; each with its correct council; **require both registration and degree verification** | 🟡 taxonomy exists; both-checks rule pending | Patient safety |
| 30 | **Public profile shows** the verified badge + "verified on <date>" + **the verification selfie** | ❌ next (needs explicit consent at capture) | Trust signal |
| 31 | Python only where it adds value: a FastAPI service for the voice agent (done) and the future verification engine | ✅ | — |
| 32 | Providers: **100ms** (calls), **MSG91** (SMS OTP), **Google Maps/Places**, **Razorpay** (+RazorpayX), **FCM** | 🟡 all pluggable; real keys pending | — |
| 33 | Shareable preview URL for the user's phone | ✅ ngrok (while the box runs) | — |

### 1.3 Final pricing / trust numbers (decided; the live values sit in the DB, see §3)
- **1 credit = ₹1.** Packs: ₹99 / ₹249 / ₹499 / ₹999 / ₹1,999 (GST-inclusive), with bonus credits 0 / 11 / 31 / 81 / 201.
- **Per-minute rate bands per category**, chat < voice < video (see §3.M3 table).
- **Commission:** 18% default; **15% for new workers** (first 30 days or 20 sessions). Worker earnings are **held 72 h**; payout **minimum ₹200**; weekly.
- **Negative:** a complaint or a rating ≤ 2★ flags the worker. 3 good sessions (≥ 4★) clear the flag. **3 negatives in 30 days → 7-day block.**
- **Rewards:** 9 milestones (first consult, first 5★, 10/50/100 sessions, 5/20 positive streak, Top Rated 4.5★/10 reviews, Excellence 4.8★/25 reviews).

---

## 2. Architecture, stack, folder map

### 2.1 Stack
| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Router 6, i18next (en, ta), vite-plugin-pwa | Mobile-first PWA; fonts Inter + Noto Sans Tamil |
| Backend core | **Supabase** (Postgres 17 + PostGIS, Auth, Realtime, Storage, RLS) | All state changes go through `SECURITY DEFINER` RPCs; RLS on every table |
| Edge Functions | Deno/TS in `supabase/functions` | Payments only so far (create-order, verify, webhook, mock) |
| Python service | FastAPI `services/agent` (uvicorn :8787) | Voice-agent intent parser; JWT-verified |
| Maps | Leaflet + OpenStreetMap tiles + Nominatim (dev) behind a `MapFactory` | Google Maps swappable |
| Calls | P2P WebRTC (STUN only) with signalling over private Supabase Realtime channels | 100ms provider slot exists (`VITE_HMS_TOKEN_URL`), not implemented |
| Speech | Browser Web Speech API (en-IN, ta-IN) + speechSynthesis | Server STT hook (`VITE_STT=server`) not implemented |
| Payments | Razorpay Orders/Checkout/Webhooks, with a local mock gateway | Switches on automatically when keys exist |
| Testing | Playwright (mobile Pixel 7 + desktop 1366×820), SQL tests via psql, pytest + ruff | |
| Preview | `vite preview` :8090 with a same-origin proxy → ngrok | `/workspace/tunnels` |

### 2.2 Runtime diagram (local / preview)
```
Phone/laptop browser ──https──> ngrok (<your-ngrok-domain>) ──> vite preview :8090 (/workspace/meyiyal-preview)
      │                                                                  │ proxy
      │                                                                  ├─ /auth/v1 /rest/v1 /storage/v1 /functions/v1 /graphql/v1 /realtime/v1 ──> Supabase local :54321 (Kong)
      │                                                                  └─ /agent ──> FastAPI voice agent :8787
Supabase local (Docker, project "meyiyal-local"): Postgres :54322 · Mailpit/Inbucket :54324 · Edge runtime (functions serve) · Realtime · Storage
Dev server: npm run dev → http://localhost:8080 (talks to http://127.0.0.1:54321 directly)
```

### 2.3 Folder map (repo `TNPH_Meiyiyal`, branch `meyiyal-v1`)
```
TNPH_Meiyiyal/
├─ package.json                 # name "meiyiyal"; scripts: dev, build, lint, typecheck, test:e2e, test:db, agent:dev, test:agent
├─ vite.config.ts               # PWA config, dev server :8080
├─ playwright.config.ts         # 3 webServers (vite :8080, supabase functions serve, agent :8787); projects mobile + desktop
├─ .env.example                 # frontend env names (copy to .env.local)
├─ index.html, public/          # icons (icon-180/192/512, maskable), favicon
├─ src/
│  ├─ App.tsx                   # routes: /login /auth/callback /location / /browse/:slug /w/:id /session/:id /history
│  │                            #         /profile /settings /wallet /earnings /worker/register /admin  (* → redirect)
│  ├─ pages/                    # Login, AuthCallback, LocationPage, Home (tabs), Browse, WorkerProfile, Session, History,
│  │                            # Profile, Settings, Wallet, Earnings, WorkerRegister, Admin
│  ├─ features/
│  │  ├─ location/              # geocoding.ts (pluggable), nominatim.ts (1 req/s queue + cache), map/ (MapFactory, leafletMap), useCurrentLocation
│  │  ├─ taxonomy/              # useTaxonomy (DB tree + bundled seed.json fallback), themes.ts (Doctor/Lawyer/Engineer looks), icons
│  │  ├─ worker/api.ts          # registration, KYC, go-online RPC wrappers
│  │  ├─ consult/               # ConsultProvider (ring overlay, presence heartbeat), RequestSheet, CallView, ringtone, call/ (CallProvider, webrtc.ts)
│  │  ├─ feedback/              # FeedbackCard + api
│  │  ├─ rewards/               # RewardsGrid, CertificateDialog (canvas → PNG/PDF, EN/TA), WorkerStanding banners
│  │  ├─ voice/                 # speech.ts (Recognizer/TTS interfaces), agent.ts (client + URL builder), VoiceProvider, VoicePill, MicButton
│  │  ├─ payments/              # api.ts, checkout.ts (Razorpay | mock), MockCheckout.tsx
│  │  ├─ admin/                 # Moderation.tsx, Rates.tsx, Payments.tsx (packs/payments/refunds/payouts)
│  │  └─ profile/useProfile.ts
│  ├─ components/app/           # Guards (RequireAuth/GuestOnly/RequireLocation), BottomNav, HomeHeader, UserMenu (avatar menu), PageShell,
│  │                            # WorkerList (cards + URL filter chips), WorkerPanel (Worker tab), WorkerBadge, PrefsSync, Logo, LangToggle
│  ├─ components/ui/            # shadcn primitives
│  ├─ hooks/useAuth.tsx         # Google OAuth, email magic link, phone OTP, sign-out
│  ├─ i18n/ (index.ts, locales/en.json, ta.json)
│  └─ integrations/supabase/    # client.ts (VITE_SUPABASE_URL/KEY), types.ts (legacy generated; regenerate)
├─ supabase/
│  ├─ config.toml               # local stack config (auth providers, test OTPs, env() refs only; no secrets)
│  ├─ .env.example              # Google OAuth env names (real file supabase/.env is git-ignored)
│  ├─ templates/                # magic_link.html, confirmation.html (https-aware)
│  ├─ migrations/               # 3 legacy Lovable + 15 Meiyiyal migrations (§3)
│  ├─ tests/                    # m0_security, m1_location, m1b_areas_taxonomy, m2a_profile, m2b_worker, m2c_search, m2d_lock, m3_consult, m4_feedback, m6_payments (.sql)
│  ├─ functions/                # _shared/payments.ts, payments-create-order, payments-verify, payments-webhook, payments-mock
│  └─ pending-m1/frontend/      # OBSOLETE leftover from M1 preparation (safe to delete)
├─ services/agent/              # FastAPI voice agent: agent/{main,parser,lexicon,auth,llm}.py, tests/, run.sh, requirements*.txt, pyproject.toml
├─ scripts/                     # gen_seed.py (taxonomy/district seed generator), geocode_areas.py (OSM area coordinates)
└─ e2e/                         # login, location, browse, profile, worker-reg, marketplace, consult, trust, voice, payments, bottomnav specs;
                                # helpers mocks.ts, workerFlow.ts, consultFlow.ts; fixtures/ (OSM tiles, Nominatim JSON, worker photos)
```
Outside the repo on the build box:
```
/workspace/meyiyal/            docs/ (00–06 + this HANDOFF), flow-notes.md, research.md, screens/ (179 PNG), scripts/ (geocoding helpers + area_coords.json)
/workspace/meyiyal-preview/    exported copy of a commit, patched for same-origin proxy (built by refresh-preview.sh)
/workspace/tunnels/            refresh-preview.sh, start-ngrok.sh, logs/pids (ngrok, agent, functions, mailpit, supabase)
```

---

## 3. Milestones: what was built, where, and the config values

Conventions used everywhere:
- Every table has RLS ON.
- Clients never write money, status, rating, reward or verification fields directly. Those go through `SECURITY DEFINER` RPCs or Edge Functions with the service role, guarded by triggers.
- Settings live in `public.app_settings(key, value jsonb)`, read with `setting()` / `setting_num()`.
- Admin = a row in `public.user_roles(user_id, role='admin')`, checked by `has_role()` / `is_admin()`.
- Every admin action writes `public.admin_audit`.

### M0 — Security hardening (`3781e00`)
- **Problem found in the inherited Lovable repo:** clients could mint wallet credits, self-verify KYC, edit protected worker fields and payment status; the `.env` with the live anon key was committed; `profile_visitors` leaked data.
- **Migration** `20261016230000_m0_security_hardening.sql`:
  - `user_roles` + `has_role()`.
  - Client INSERT/UPDATE on `wallets` / `wallet_transactions` dropped.
  - KYC owner may insert only pending rows.
  - Triggers `guard_worker_protected_fields` and `guard_request_payment`.
  - `profile_visitors` dropped.
- `.env` untracked (`.env.example` added); Lovable componentTagger removed (`54b8d59`).
- **Tests:** `supabase/tests/m0_security.sql`.

### Login v1 (`a87945b`) + brand (`c4603ff`) + tunnel host (`2c2d7f1`, `7780ecf`)
- **Methods:**
  - Google OAuth (`signInWithOAuth` → `/auth/callback`)
  - email magic link (local Mailpit)
  - phone OTP (+91, `verifyOtp type sms`; local test OTPs in `config.toml [auth.sms.test_otp]`)
- **Guards:** `RequireAuth`, `GuestOnly`. EN/TA toggle; PWA manifest; legacy Lovable pages/Feeds removed.
- **Brand:** `src/assets/logo-source.jpg` → wordmark, PWA icons, favicon regenerated.
- **Public host support (`2c2d7f1`):**
  - `site_url`, the extra redirect allow-list and Google `redirect_uri` come from `supabase/.env` (`SUPABASE_AUTH_SITE_URL`, `SUPABASE_AUTH_PUBLIC_REDIRECT`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI`), so Google + email login work on the ngrok URL.
  - The magic-link/confirmation templates are https-aware.
- **Real Google sign-in verified by the user on 17 Oct.** Their Gmail account is in the local DB. The Google Cloud OAuth client has the ngrok callback `https://<your-ngrok-domain>/auth/v1/callback` and origin added.
- **Tests:** `e2e/login.spec.ts`.

### M1a — Location (`648b74b`, map v2 `c27a359`)
- **Migrations:**
  - `…230100_m1_taxonomy_location_schema.sql`: PostGIS, `taxonomy_nodes`, `node_requirements`, `tn_districts`, `tn_areas`, `user_locations`, `worker_nodes`, worker geo/online columns.
  - `…230200_m1_seed_taxonomy_districts.sql`: generated by `scripts/gen_seed.py`. 81 taxonomy nodes with Tamil names; 38 districts with Tamil names and HQ coordinates, Kanniyakumari first; 213 areas.
  - `…230300_m1_location_rpcs.sql`: `nearest_location`, `set_current_location` (validated), `my_current_location`, and a one-current-location unique index.
- **UI:** `/location` is a full-screen Leaflet + OSM map behind `features/location/map` (`MapFactory`).
  - GPS auto-detect with a fixed centre pin, drag to adjust, "Locate me".
  - Search: seeded districts/areas instantly; Nominatim TN-restricted on Enter.
  - Reverse-address bottom sheet. Confirm saves the exact lat/lng + district/area + address.
  - Nominatim client: 1 req/s serialised queue, cache, 700 ms debounce, OSM attribution.
  - `RequireLocation` guard; location chip in the Home header.
- **WHY Leaflet/OSM:** no keys needed for development. Google Maps is the production target, and the abstraction exists for it.
- **Tests:** `m1_location.sql`; `e2e/location.spec.ts`. Deterministic: cached tiles in `e2e/fixtures/tiles` and Nominatim fixtures in `e2e/mocks.ts`.

### M1b — Areas + Find Worker browse (`fa96a40`)
- `…230400_m1b_area_coordinates.sql`:
  - Real OSM coordinates for all 213 areas (via `scripts/geocode_areas.py`).
  - 117 Tamil names from OSM `name:ta`; **96 areas still have no Tamil name.**
  - Generated `lat`/`lng` columns + GiST index.
  - `nearest_location`: nearest area within 25 km, else nearest district centre.
- **Home:** Find Worker / Worker tabs; themed Doctor (teal), Lawyer (navy/gold), Engineer (blue/orange) cards.
- **`/browse/:slug`:** themed hero, breadcrumbs, tile grid/list.
- **Taxonomy:** read from `taxonomy_nodes`, with a bundled `seed.json` fallback. New nodes appear without code changes.
- **Taxonomy today (81 nodes):** Professionals →
  - **Doctor:** Allopathy (17 specialties), Siddha (7), Ayurveda, Unani, Homoeopathy, Yoga & Naturopathy, Dental, Physiotherapy, Psychology & Counselling, Nutrition & Diet
  - **Lawyer:** 12 practice areas: Property & Land, Family & Divorce, Criminal, Civil, Consumer, Cheque Bounce, Cyber Crime, Labour & Employment, Motor Accident Claims, Corporate & Startup, Tax, Documentation & Registration
  - **Engineer:** 8: Civil, Software/IT, Electrical, Electronics & Communication, Mechanical, Architect, Interior Design, Solar & EV
- **Tests:** `m1b_areas_taxonomy.sql`; `e2e/browse.spec.ts`.

### M2a — Profile & Settings (`d8328ad`, `e778052`)
- `…240000_m2a_profile_prefs_avatars.sql`:
  - `profiles` made **owner-only**. It was public before, which exposed email and phone.
  - Users can't change their own role.
  - `prefs` jsonb; RPCs `my_locations`, `use_saved_location`; trigger `guard_profile_fields`.
  - **`avatars` bucket:** public read; only the owner can write their own folder.
- **Profile page:** photo (resized to 512 px WebP), name, read-only email, phone, DOB, saved locations.
- **Settings page:** EN/TA, Light/Dark/System (real dark mode, map included), notification prefs placeholder.
- **Tests:** `m2a_profile.sql`; `e2e/profile.spec.ts`.

### M2b — Worker registration + admin verification (`1372c05`)
- `…250000_m2b_worker_registration.sql` + `…250100_m2b_requirements_seed.sql`:
  - **Tables:** `app_settings`, `admin_audit`, `kyc_otp_sessions`, `worker_documents`.
  - **Config-driven form:** `node_requirements(node_slug, schema jsonb, doc_types[])`. Category defaults plus sub-category overrides, merged by `node_requirements_for`. Fields per profession:
    - **Doctor:** qualification, council (TNMC/NMC IMR, TN Siddha Medical Council/NCISM, TN Board of Indian Medicine, TN Homoeopathy Medical Council/NCH, TN Dental Council/DCI, RCI, Allied council), reg no., year.
    - **Lawyer:** LLB, Bar Council of TN & Puducherry, enrolment no. + date, COP, courts.
    - **Engineer:** degree, discipline, institution, optional licence; **Architect requires a CoA number.**
  - **RPCs:** `worker_register`, `worker_submit` (validates against config), `my_worker`, `aadhaar_send_otp`, `aadhaar_verify_otp`, `my_kyc`, `kyc_mode`, `admin_worker_queue`, `admin_decide_worker` (approve / need info / reject; note required; audited), `worker_set_online`.
  - **Aadhaar:** pluggable `AadhaarProvider`. Locally `app_settings.kyc_provider = "stub"`, stub OTP `<TEST_OTP>`. Only the **last 4 digits + a peppered hash** are stored (`aadhaar_pepper` is generated randomly in the DB), with rate and attempt limits.
  - **Documents** go to the private **`worker-docs`** bucket (owner folder only; admin reads through signed URLs).
- **UI:** 5-step wizard at `/worker/register` (profession → details → Aadhaar OTP → documents → review).
  - `/admin` Queue tab with a 24 h SLA badge.
  - Go Online unlocks only after approval.
- **Tests:** `m2b_worker.sql`; `e2e/worker-reg.spec.ts`.

### M2c — Worker listing (`95e07da`) + M2 demo (`8f71b16`)
- **`search_workers(node, lat, lng, _radius_km = 50, _all, _limit = 50)`** (redefined in M3/M4):
  - active + unblocked workers only, matched at sub-category/specialty level
  - **online first** (presence window), then nearest PostGIS km within **50 km**
  - "Show all" = the whole state grouped by district
  - returns rates + badges
- **Cards:** photo, verified tick, specialty, rating (or "New"), years, rewards, feedback count, km, online dot.
- **Demo:** `e2e/marketplace.spec.ts` creates 3 dummy workers through the real UI + admin approval. A user in Kanniyakumari and one in Chennai check what they see.
- **Tests:** `m2c_search.sql`; `e2e/marketplace.spec.ts`.

### Step A — Profession lock (`e53cb57`)
- `…20261017000000_m2d_profession_lock.sql`:
  - `workers.locked_category` is set at the first submit.
  - Triggers `guard_worker_profession`, `guard_worker_nodes`, `worker_register_guard`.
  - Helper `node_category`.
  - **A worker can never change profession.** They can change specialty within the same profession only.
- The profession/status badge (`WorkerBadge`) shows in Profile and Settings.
- **Tests:** `m2d_lock.sql`.

### M3 — Consult: request, ring, chat, files, calls, metering (`1714e1b`)
- `…20261017010000_m3_consult.sql` + `…010100_m3_rates_seed.sql`:
  - **Tables:** `consult_requests`, `consult_sessions`, `session_segments` (billing per mode), `session_calls`, `consult_messages`, `rate_cards`.
  - **Request flow:** `request_create` (checks balance ≥ rate × min minutes) → ringing for **`ring_seconds` = 45** → `request_respond` (atomic accept/decline) or `request_expire_due` / `request_cancel`.
  - **Presence:** `worker_heartbeat` every 45 s; window **`presence_seconds` = 120**; busy flag while in a session.
  - **Session:** `session_tick` charges **per started minute** from `rate_cards` via `rate_for` / `rates_for`. `session_switch_mode` handles chat ↔ voice ↔ video; `session_end` auto-ends at 0 credits. Plus `session_info`, `my_active_session`, `my_history`, `my_wallet`, `wallet_id_for`, `is_session_party`.
  - **Calls:** `call_start` / `call_answer` / `call_end`. P2P WebRTC with signalling on private Realtime channel `call:<sessionId>`; the caller re-offers if the callee joins late (M4 fix).
  - **Files:** private **`consult-files`** bucket, **20 MB** limit, session parties only.
  - **Dev:** `dev_grant_test_credits` (`app_settings.dev_test_credits = true`; the button is hidden in production builds since M6).
  - **Settings added:** `commission_pct` 18, `dev_test_credits` true, `ring_seconds` 45, `presence_seconds` 120.
- **Rate cards (credits/min = ₹/min; default / band min–max / minimum minutes)**, admin-editable, children inherit:

| node | chat | voice | video | min |
|---|---|---|---|---|
| Doctor (default; AYUSH/Siddha/etc. inherit) | 5 (3–10) | 8 (5–15) | 12 (8–20) | 5 |
| Doctor › Allopathy (GP) | 6 (3–20) | 10 (5–30) | 15 (8–40) | 5 |
| Allopathy specialists (all except General Physician) | 10 (6–20) | 15 (10–30) | 20 (15–40) | 5 |
| Dental / Physiotherapy | 4 (3–8) | 7 (5–12) | 10 (8–18) | 5 |
| Nutrition & Diet | 4 (3–8) | 6 (5–12) | 9 (8–18) | 5 |
| Psychology & Counselling | 8 (5–15) | 12 (8–20) | 18 (10–30) | 15 |
| Lawyer | 10 (5–20) | 15 (10–30) | 25 (15–40) | 10 |
| Engineer | 6 (4–15) | 10 (6–20) | 15 (10–30) | 10 |
| Engineer › Architect | 8 (4–15) | 12 (6–20) | 18 (10–30) | 10 |

- **UI:**
  - `RequestSheet`, then a full-screen ring overlay (WebAudio tone + `navigator.vibrate`; also polls every 5 s in case a Realtime event is missed).
  - `/session/:id`: realtime chat, attachments, call view, meter.
  - `/history`: who, profession, mode, duration, credits.
- **Push:** a `PushProvider` interface exists (in-app now; FCM later).
- **Tests:** `m3_consult.sql` (14 checks: no client minting, outsider isolation, billing maths, exhaustion); `e2e/consult.spec.ts` (3 browser contexts with fake camera/mic).

### M4 — Feedback, rewards, moderation, public profile, admin rates (`ff1936d`)
- `…20261017020000_m4_feedback_rewards_moderation.sql`:
  - **`consult_feedback`:**
    - One per session; only the client can submit, through `feedback_submit`.
    - Tags and complaint reasons are validated against `app_settings.feedback_tags`:
      - positive: clear_advice, patient, on_time, knowledgeable, friendly
      - negative: rude, unhelpful, late, poor_connection, overcharged
      - complaint: misconduct, fake_profile, wrong_advice, abuse, other
    - Rating aggregates are recomputed server-side (`worker_refresh`, `worker_stats`).
  - **`reward_milestones`** (admin-editable table; no admin UI yet) + **`worker_rewards`**:
    - Certificate numbers `MYL-YYYY-NNNNNN` (sequence `certificate_seq` starting at 1001).
    - Awarded automatically on session end (`on_session_ended`) and on feedback.

| slug | kind | threshold | min reviews |
|---|---|---|---|
| first_consult | sessions_served | 1 | – |
| first_five_star | five_stars | 1 | – |
| sessions_10 | sessions_served | 10 | – |
| streak_5 | positive_streak | 5 | – |
| top_rated | rating_avg | 4.5 | 10 |
| sessions_50 | sessions_served | 50 | – |
| streak_20 | positive_streak | 20 | – |
| sessions_100 | sessions_served | 100 | – |
| excellence | rating_avg | 4.8 | 25 |

  - **Moderation settings (`app_settings`):**
    - `good_rating_min` 4, `negative_rating_max` 2, `flag_clear_good_sessions` 3
    - `block_negatives` 3, `block_window_days` 30, `block_days` 7
  - **Rules:**
    - A complaint or a rating ≤ 2 sets `workers.flag_active`. 3 good sessions clear it.
    - 3 negatives within 30 days set `blocked_until` = now + 7 days. A blocked worker is hidden from search and the public profile, can't go online and can't be requested (`request_block_guard`, `worker_is_blocked`, `guard_worker_moderation`).
    - `strikes_reset_at` lets an admin reset the strike count.
  - **Admin RPCs:** `admin_moderation`, `admin_moderate` (unblock / extend / clear flag; note required), `admin_audit_log`, `admin_rate_cards`, `admin_set_rate`, `admin_delete_rate` (band and chat<voice<video validation; audited).
  - **Public RPCs:** `worker_public`, `my_worker_standing`, `my_feedback`, `feedback_config`.
- **UI:**
  - Feedback card in the session summary; badges on cards.
  - Public profile **`/w/:id`**.
  - Worker standing banners + rewards grid in the Worker tab.
  - Certificate dialog: canvas-drawn, EN/TA, PNG + PDF (built-in minimal PDF writer), share.
  - Admin tabs: Moderation, Rates, Audit.
- **Tests:** `m4_feedback.sql` (19 checks); `e2e/trust.spec.ts` (user, lawyer, doctor, admin logins).

### M5 — Voice agent (`3acb46e`)
- `…20261017030000_m5_agent_synonyms.sql`: EN/TA/Tanglish synonyms on 56 taxonomy nodes, e.g. "child doctor" / "குழந்தை மருத்துவர்" / "kuzhandhai doctor".
- **`services/agent` (FastAPI):**
  - **Endpoints:** `POST /agent/parse` (Supabase JWT required: JWKS ES256/RS256 or HS256 via `SUPABASE_JWT_SECRET`; ≤ 500 chars; rate limit `AGENT_RATE_PER_HOUR` default 120) and `GET /agent/health`.
  - **Lexicon:** loaded from Supabase REST with the anon key, cached for `AGENT_LEXICON_TTL` (600 s); fixture fallback `AGENT_LEXICON_FILE`.
  - **Rule parser (`parser.py`):**
    - clauses and exclusions (EN prefixes / TA suffixes)
    - the deepest-node rule
    - follow-up slots: profession, sub-category, node choice, district
    - refining the current list
    - stop / back / help commands
  - **LLM hook:** `AGENT_LLM_PROVIDER` (none by default; no external keys).
  - **Rule:** lawyers are never sorted by rating (`parser.py` line ~318).
- **Frontend `src/features/voice`:**
  - pluggable Recognizer (Web Speech en-IN/ta-IN) + TTS
  - `VoicePill` (listening/thinking/speaking states), `MicButton` in the top bar after login
  - follow-up questions spoken and shown as tappable options
- **WorkerList URL filters:** `online, sort, all, km, district, near, xn (exclude nodes), xw (exclude words)`, shown as removable chips. Browse shows the list for category nodes with `list=1`.
- **Tests:** pytest 107 + ruff; `e2e/voice.spec.ts` (mocked SpeechRecognition/speechSynthesis).

### M6 — Credits, payments, earnings, payouts (`43985a0`)
- `…20261017040000_m6_payments_payouts.sql`:
  - **Tables:** `credit_packs`, `payment_orders`, `payment_events` (webhook idempotency), `commission_rules` (per-category; table + logic exist, no UI), `worker_earnings`, `payout_requests`.
  - **Packs (`credit_packs`; credits + bonus):**

| id | price ₹ (GST incl.) | credits | bonus | total |
|---|---|---|---|---|
| starter | 99 | 99 | 0 | 99 |
| basic | 249 | 249 | 11 | 260 |
| value (popular) | 499 | 499 | 31 | 530 |
| pro | 999 | 999 | 81 | 1,080 |
| max | 1,999 | 1,999 | 201 | 2,200 |

  - **Settings:** `commission_new_pct` 15, `commission_new_days` 30, `commission_new_sessions` 20, `gst_pct` 18, `payout_min` 200, `payout_hold_hours` 72, `payments_mock` true (plus `commission_pct` 18 from M3).
  - **Crediting:**
    - `payment_mark_paid` is server-only and idempotent (it locks the order row; the payment id is unique). Also `payment_mark_failed`, `payment_order_new/attach/cancel`, `payment_event_once/outcome`, `payments_config`, `payments_mock_enabled`.
    - Client roles can't call the server-only ones.
  - **Billing → earnings:**
    - The worker's share goes to `worker_earnings`, held 72 h (not to a spendable wallet).
    - `commission_for()` order: the new-worker rate, then per-category `commission_rules`, then the default 18%.
  - **Worker:** `my_earnings`, `payout_request` (min ₹200, only released earnings). **User:** `my_wallet_ledger`.
  - **Admin:** `admin_upsert_pack`, `admin_payments`, `admin_refund` (unspent credits only; reason required), `admin_payouts`, `admin_payout_decide` (paid needs a UTR; reject needs a reason). All audited.
- **Edge Functions** (`supabase/functions`, shared module `_shared/payments.ts`; `verify_jwt = false` in config.toml because each function checks the user with `getUser`):
  - `payments-create-order`: the amount comes from the DB pack. GET = health check.
  - `payments-verify`: HMAC-SHA256 of `order_id|payment_id`; checks that the order belongs to the caller.
  - `payments-webhook`: signature over the raw body; de-duplicates by event id; handles `payment.captured`, `order.paid`, `payment.failed`, `refund.*`.
  - `payments-mock`: the local gateway; signs exactly like Razorpay.
  - **Provider switch:** Razorpay when `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` are set (`RAZORPAY_WEBHOOK_SECRET` for webhooks). Otherwise the mock, and only while `payments_mock` = true.
- **UI:**
  - `/wallet`: balance, pack grid with GST shown, checkout, result banner, ledger, failed/cancelled orders.
  - `/earnings`: available, on hold, fee %, weekly ledger, payout request/history.
  - Admin tabs: Packs, Payments (refunds), Payouts.
- **Tests:** `m6_payments.sql` (26 checks); `e2e/payments.spec.ts`: success, failure, cancel, bad signature, duplicate webhook, late capture after cancel, no client minting, chat with earnings at the 15% fee, payout request, admin mark paid, refunds view, packs editor.

### UI — Bottom navigation (`137cf8e`)
- `BottomNav`:
  - Home / Conversations (`/history`) / Profile, with a sliding active pill and animated icons; safe-area padding.
  - Floating under the centred column on desktop.
  - Hidden on login, location, session, worker registration and admin.
- The wallet moved into Profile as a balance card.
- The avatar menu (`UserMenu`) has only Settings, Admin (admins only) and Sign out.
- The voice pill sits above the bar.
- **Tests:** `e2e/bottomnav.spec.ts`.

### Storage buckets (summary)
| bucket | public | who |
|---|---|---|
| `avatars` | yes (read) | owner writes own folder |
| `worker-docs` | no | owner writes own folder; admin via signed URLs |
| `consult-files` | no | session parties; 20 MB limit |

### Legacy tables still present (from the Lovable migrations, hardened in M0)
`profiles`, `occupations`, `occupation_services`, `workers` (extended and reused), `worker_education`, `worker_experience`, `worker_portfolio`, `kyc_verification`, `service_requests`, `wallets` / `wallet_transactions` (reused as the credit wallet), `chat_messages`, `certificates`, `support_tickets`. The unused ones can be dropped in a cleanup migration.

---

## 4. Configuration, environment variables and providers

> **No secret values are in this file or the zip.** Variable **names** only. Real values live in git-ignored files on the build box:
> - `TNPH_Meiyiyal/.env.local` (frontend)
> - `TNPH_Meiyiyal/supabase/.env` (Google OAuth client id/secret + auth URLs)
> - the ngrok config (`~/.config/ngrok/ngrok.yml`, authtoken)
> - `/tmp/env.bak` (old live `.env` backup; delete after rotation)

### 4.1 Frontend (`.env.local`, Vite; copy from `.env.example`)
| Name | Purpose | Default when unset |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase API URL (local `http://127.0.0.1:54321`; preview uses `same-origin`) | `http://127.0.0.1:54321` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key (public by design; from `supabase status`) | — required |
| `VITE_USE_MOCKS` | legacy demo-mode flag; keep `false` | — |
| `VITE_AGENT_URL` | voice agent base URL (`http://127.0.0.1:8787`; empty = same origin `/agent`) | — |
| `VITE_HMS_TOKEN_URL` | turns on the 100ms provider (placeholder; falls back to WebRTC) | WebRTC P2P |
| `VITE_ICE_SERVERS` | JSON array of ICE servers (add TURN here) | `stun:stun.l.google.com:19302` only |
| `VITE_MAP_TILE_URL` | map tile template | OSM `tile.openstreetmap.org` |
| `VITE_NOMINATIM_URL` | geocoder base | public OSM Nominatim |
| `VITE_STT` | `server` = future server STT (commented out) | browser Web Speech |
| `VITE_GOOGLE_MAPS_API_KEY` | reserved for the Google map/places adapter (not wired yet) | — |
| `import.meta.env.DEV` | shows "Get test credits" only in dev builds | — |
| Legacy names in `.env.example`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | unused by current code | — |

### 4.2 Supabase local auth (`supabase/.env`, read by `config.toml` via `env(...)`)
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (a Google client secret; **never commit**)
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI`: today the ngrok `/auth/v1/callback`; for localhost-only use `http://127.0.0.1:54321/auth/v1/callback`
- `SUPABASE_AUTH_SITE_URL`: e.g. the ngrok URL or `http://localhost:8080`
- `SUPABASE_AUTH_PUBLIC_REDIRECT`: extra allow-listed redirect pattern (ngrok URL `/**`)
- Also referenced in config.toml: `OPENAI_API_KEY` (Studio only, Studio disabled) and `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` (Apple disabled). Both unused.
- `config.toml` also holds:
  - local test OTPs `[auth.sms.test_otp] <TEST_PHONE_1> = <TEST_OTP>, <TEST_PHONE_2> = <TEST_OTP_2>`
  - a dummy Twilio block (needed so phone auth is enabled locally; no SMS is sent)
  - `[functions.payments-*] verify_jwt = false`

### 4.3 Edge Functions (secrets via `supabase secrets set` in prod; env for `supabase functions serve` locally)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: injected automatically by Supabase
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: switch from mock to Razorpay
- `MOCK_PAYMENT_SECRET`, `MOCK_WEBHOOK_SECRET`: mock gateway signing (non-secret local defaults in code)

### 4.4 Voice agent (`services/agent`; `run.sh` reads the URL/key from `.env.local` without echoing them)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (HS256 fallback), `AGENT_PORT` (8787), `AGENT_CORS` (default `http://localhost:8080,http://localhost:8090`), `AGENT_RATE_PER_HOUR` (120), `AGENT_LEXICON_TTL` (600), `AGENT_LEXICON_FILE`, `AGENT_LLM_PROVIDER` (empty = rules only).

### 4.5 DB-side configuration (`app_settings`; admin-editable by SQL today)
| key | value | used by |
|---|---|---|
| kyc_provider / kyc_stub_otp / aadhaar_pepper | "stub" / "<TEST_OTP>" / random hex | Aadhaar OTP stub + hashing |
| commission_pct | 18 | default commission |
| commission_new_pct / _days / _sessions | 15 / 30 / 20 | new-worker commission |
| dev_test_credits | true | dev credits RPC (turn **false** in prod) |
| ring_seconds | 45 | request ring timeout |
| presence_seconds | 120 | online window (heartbeat 45 s) |
| good_rating_min / negative_rating_max | 4 / 2 | flags and streaks |
| flag_clear_good_sessions | 3 | flag recovery |
| block_negatives / block_window_days / block_days | 3 / 30 / 7 | auto temporary block |
| feedback_tags | JSON (5 positive, 5 negative, 5 complaint) | feedback form |
| gst_pct | 18 | GST shown inside pack prices |
| payout_min / payout_hold_hours | 200 / 72 | earnings release + payouts |
| payments_mock | true | allows the mock gateway (set **false** in prod) |

Other config tables: `rate_cards`, `credit_packs`, `commission_rules`, `reward_milestones`, `node_requirements`, `taxonomy_nodes` (+ synonyms), `tn_districts`, `tn_areas`.

### 4.6 Providers: pluggable status
| Capability | Interface / switch | Today (no keys) | Production provider | What's needed |
|---|---|---|---|---|
| Calls | `CallProvider` (`src/features/consult/call`), `VITE_HMS_TOKEN_URL`, `VITE_ICE_SERVERS` | P2P WebRTC, STUN only; may fail across NAT/mobile networks | **100ms** (or TURN, e.g. Cloudflare/Twilio/coturn) | 100ms app access key/secret + template id; implement the 100ms provider + `call-token` Edge Function. Or quick fix: TURN credentials in `VITE_ICE_SERVERS` |
| Push / ring when closed | `PushProvider` | in-app Realtime ring + 5 s poll | **FCM** web push | Firebase project, web config, VAPID key, service-account JSON (Edge secret); `push_tokens` table; SW handler |
| SMS OTP | Supabase phone auth | test OTPs only | **MSG91** via Supabase Send-SMS hook → Edge Function | MSG91 auth key, DLT entity + template id, sender id |
| Maps/geocoding | `MapFactory`, `geocoding.ts` | Leaflet + OSM tiles + Nominatim (dev only) | **Google Maps JS + Places + Geocoding** (or Ola/MapmyIndia) | `VITE_GOOGLE_MAPS_API_KEY` (HTTP-referrer restricted); implement the adapter |
| Payments | `_shared/payments.ts` provider | mock gateway | **Razorpay** | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`; set `payments_mock=false`; register webhook URL `…/functions/v1/payments-webhook` |
| Payouts | none yet (admin marks paid with UTR) | manual | **RazorpayX Payouts** + Fund Account Validation (penny-drop) | RazorpayX account (current account / Lite), API key, account number, webhook secret |
| Aadhaar / KYC | `AadhaarProvider` (`app_settings.kyc_provider`) | stub OTP <TEST_OTP> | v1: Aadhaar Secure QR offline (free); v2: Surepass / IDfy / Digio / HyperVerge | KYC provider business account (CIN/GST/PAN, DPA) |
| STT / LLM | `Recognizer`, `AGENT_LLM_PROVIDER` | Web Speech, rule parser | Google STT v2 (ta-IN/en-IN), an LLM with tool calling | API keys (Python service env) |
| Public preview | ngrok | `https://<your-ngrok-domain>` (only while the box runs) | real hosting | ngrok authtoken (already configured on the box) |

---

## 5. Local setup from scratch

Prerequisites: Linux/macOS, **Docker**, **Node 20** (box: v20.19.2), **Supabase CLI ≥ 2.x** (box: 2.121.0), **Python 3.11+** (box: 3.13.5), optional **ngrok v3** (box: 3.39.11).

1. **Restore the code**
   ```bash
   git clone -b meyiyal-v1 meyiyal-v1.bundle meiyiyal && cd meiyiyal
   ```
   Note: the bundle's history was rewritten to remove the old committed `.env`, so hashes differ from the build box (Appendix A).
2. **Docker** (Debian box): `sudo apt-get install -y docker.io && sudo dockerd &`, then `sudo chmod 666 /var/run/docker.sock`.
   - If containers can't reach each other (seen on the build box): `sudo iptables-legacy -P FORWARD ACCEPT && sudo iptables -P FORWARD ACCEPT`.
3. **Supabase CLI**:
   ```bash
   curl -sL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar xz && sudo mv supabase /usr/local/bin/
   ```
4. **Auth env**: `cp supabase/.env.example supabase/.env`, then add the five `SUPABASE_AUTH_*` names from §4.2.
   - Without Google, use `placeholder.apps.googleusercontent.com` / `placeholder`.
   - Without ngrok, use `SUPABASE_AUTH_SITE_URL=http://localhost:8080`, `SUPABASE_AUTH_PUBLIC_REDIRECT=http://localhost:8080/**` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI=http://127.0.0.1:54321/auth/v1/callback`.
5. **Start the stack**: `supabase start`, then `supabase db reset`.
   - This applies all 18 migrations and the seed data inside them (taxonomy, districts, areas, requirements, rates, synonyms, milestones, packs, settings). There is no separate `seed.sql`.
   - **Local only.** Never `supabase link` / `db push` to the old live project.
   - For an existing DB with data, use `supabase migration up` to apply only new migrations.
6. **Frontend env**: `cp .env.example .env.local`, then set:
   - `VITE_SUPABASE_URL=http://127.0.0.1:54321`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from supabase status>`
   - `VITE_USE_MOCKS=false`
   - `VITE_AGENT_URL=http://127.0.0.1:8787`
7. **Install + run the web app**: `npm ci && npm run dev`, then open http://localhost:8080.
8. **Edge Functions (payments)**: `supabase functions serve` (separate terminal). Mock payments work without keys.
9. **Voice agent**: `npm run agent:dev`. The first run creates `services/agent/.venv` and installs `requirements-dev.txt`. Health: `curl http://127.0.0.1:8787/agent/health`.
10. **Make yourself admin**: sign in once, then
    ```bash
    docker exec -i supabase_db_meyiyal-local psql -U postgres -c "INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM auth.users WHERE email='you@example.com' ON CONFLICT DO NOTHING;"
    ```
    For a phone login, use `WHERE phone='<TEST_PHONE_1>'`. Reload, and "Admin" appears in the avatar menu.
11. **Dummy workers**: run `npx playwright test e2e/marketplace.spec.ts --project=desktop`. It creates Dr. Kavitha Raman (Paediatrics), Adv. Senthil Kumar (Property & Land) and Er. Priya Selvam (Civil) through the real UI + admin approval.
    - `consult.spec`, `trust.spec`, `voice.spec` and `payments.spec` add more (e.g. Adv. Priya Natarajan, Dr. Arun Prakash, Dr. Murugan Siddhar).
    - These test workers sign in with generated `@meiyiyal.test` emails via Mailpit (http://127.0.0.1:54324).
    - The build-box DB currently has 7 approved workers.
12. **Public preview (optional)**: see §5.3.

### 5.1 Test accounts (local / preview only; no real SMS)
| Login | Value | OTP / how |
|---|---|---|
| Phone 1 | `<TEST_PHONE_1_LOCAL>` (10 digits; stored as `<TEST_PHONE_1>`) | `<TEST_OTP>` |
| Phone 2 | `<TEST_PHONE_2_LOCAL>` (10 digits; stored as `<TEST_PHONE_2>`) | `<TEST_OTP_2>` |
| Email | any address | open the link in Mailpit http://127.0.0.1:54324 (works on the ngrok URL too since `2c2d7f1`) |
| Google | the user's Gmail (verified 17 Oct on the ngrok URL) | needs the real OAuth client in `supabase/.env` |
| Aadhaar (worker wizard) | any 12 digits | stub OTP `<TEST_OTP>` |
| Admin | any account + the SQL in step 10 | e2e admins are `admin+…@meiyiyal.test` |
| Mock payment | Wallet → pack → mock checkout | buttons: success / failure / cancel |

### 5.2 Running the tests (current results, re-checked 18 Oct 2026, 9:30 AM IST)
| Suite | Command | Result |
|---|---|---|
| DB (SQL, psql in the DB container) | `npm run test:db` (runs `supabase/tests/*.sql`; needs the stack up) | **111 PASS** (m0…m6) |
| Browser e2e | `npx playwright install chromium` (once; `sudo npx playwright install-deps chromium` on fresh Linux), then `npx playwright test` (starts vite :8080, functions serve, agent :8787 automatically) | **32/32 passed** (16 tests × mobile + desktop; last full run at `137cf8e`, 17 Oct) |
| Voice agent | `npm run test:agent` (pytest + ruff) | **107 passed**, ruff clean |
| Lint | `npm run lint` | **11 problems (3 errors, 8 warnings) = pre-existing baseline** (shadcn empty interfaces + react-refresh warnings) |
| Types / build | `npm run typecheck` · `npm run build` | OK at `137cf8e` |

- A single spec: `npx playwright test e2e/payments.spec.ts --project=mobile`.
- Screenshots from specs go to `/workspace/meyiyal/screens` (paths in the specs).
- e2e helpers clean their own users (`DELETE FROM auth.users WHERE email LIKE 'w-%@meiyiyal.test'` …).

### 5.3 Preview + ngrok (how the user's phone link works)
1. `bash /workspace/tunnels/refresh-preview.sh <commit>`. It:
   - exports the commit into `/workspace/meyiyal-preview`
   - writes a preview `.env.local` (`VITE_SUPABASE_URL=same-origin`, anon key copied from the repo `.env.local`)
   - patches `client.ts` + `vite.config.ts` (proxy for `/auth|rest|storage|functions|graphql|realtime` → :54321 and `/agent` → :8787; SW denylist)
   - starts the agent and `supabase functions serve` if they're down
   - builds, then runs `vite preview` on **:8090**
2. `bash /workspace/tunnels/start-ngrok.sh [NGROK_AUTHTOKEN]`: the token is needed once (stored in the ngrok config). It starts `ngrok http 8090` and prints the public URL (ngrok's free static domain **`<your-ngrok-domain>`**).
3. For Google login on a new host:
   - add `https://<host>/auth/v1/callback` (redirect URI) and `https://<host>` (JS origin) to the Google Cloud OAuth client
   - set the three URL names in `supabase/.env`
   - run `supabase stop && supabase start`
4. Visitors see the ngrok interstitial first and must click **"Visit Site"**. The link works only while the box and these processes run.
5. Other free tunnels (cloudflared, localtunnel, tunnelmole) were blocked by the box network; only ngrok worked.

---

## 6. Known issues, limitations and security items

### 6.1 Security (do these first)
1. **🔴 Rotate the leaked Supabase key of the OLD live project.**
   - The original Lovable repo (`github.com/techman-bala96/TNPH_Meiyiyal`, branch `main`, public) has a committed `.env` with that project's URL and anon/publishable key, in commits `9b88d78` and `54b8d59`.
   - **Action:** Supabase dashboard → old TNPH project → Settings → API Keys:
     - create new publishable/secret keys
     - disable the legacy anon + service_role keys (or rotate the JWT secret)
     - or pause/delete the project if unused
   - Optionally rewrite the GitHub history.
   - The handoff bundle already has `.env` stripped from all history.
   - Old commits in the bundle still contain the old project's **ref id** in `supabase/config.toml`. That's an identifier, not a secret.
2. **Delete `/tmp/env.bak`** on the build box after rotation. It's a local copy of that old `.env`; it still exists today.
3. **Never push the build-box `meyiyal-v1` as is to a public remote:** its local history still contains the `.env` in the first 2 commits. The sanitised bundle history is what was pushed to GitHub on 18 Oct 2026 (see Appendix D). For further pushes, work from a clone of that GitHub branch, not from `/workspace/TNPH_Meiyiyal`.
4. `supabase/.env` (Google client secret) and the ngrok authtoken are on the box only and git-ignored. Rotate the Google client secret if the box is ever shared.
5. **Production must:**
   - set `payments_mock=false` and `dev_test_credits=false`
   - add a separate admin subdomain + MFA
   - add OTP rate limits + captcha
   - add a Razorpay webhook IP allow-list
6. The local anon key in the preview bundle is the standard local-dev key (not a secret), but the preview exposes the local stack through ngrok. Treat it as test-only data.

### 6.2 Functional limitations
| # | Issue | Impact | Fix (where) |
|---|---|---|---|
| 1 | **Calls are P2P WebRTC with STUN only** | Voice/video may not connect across different networks (CGNAT/mobile). Chat always works | TURN in `VITE_ICE_SERVERS` or implement 100ms (§7.4) |
| 2 | **No FCM push** | The ring only works while the app is open | §7.3 |
| 3 | **Nominatim/OSM public servers** | Usage policy forbids heavy production use; no autocomplete | Google Maps adapter (§7.6) or self-hosted Nominatim |
| 4 | **96 of 213 areas have no Tamil name** | Shows English in TA mode | Fill `tn_areas.name_ta` (migration) |
| 5 | **Lawyer advertising risk** (BCI Rule 36; Madras HC, P.N. Vignesh 2024) | Ratings/rankings for advocates may be seen as solicitation | Counsel review before scaling; admin kill switch recommended |
| 6 | **Voice agent never sorts lawyers by rating**, though lawyers are otherwise in full mode | Inconsistent with decision #16 (user was told; no reply) | One line in `services/agent/agent/parser.py` (~318) if the user wants it removed |
| 7 | **Bonus credits:** the 180-day expiry and "bonus spent first" are not implemented | Bonus behaves like paid credit | Split ledger (paid vs bonus buckets) |
| 8 | **Payouts are manual** (admin enters UTR) | Ops load | RazorpayX (§7.2) |
| 9 | **No admin UI for** reward milestones, moderation thresholds, commission rules, app_settings, taxonomy CMS, node_requirements | SQL needed | §7.9 |
| 10 | **Aadhaar is a stub**; registry checks manual | Fakes are possible | Verification engine (§7.1) |
| 11 | No real SMS (test OTPs only) | Real phones can't log in on prod | MSG91 (§7.5) |
| 12 | Email/Google login depend on the current public host config | Changing the host needs a Google console + `supabase/.env` update | Production domain |
| 13 | `src/integrations/supabase/types.ts` is the legacy generated file | Weak typing | `supabase gen types typescript --local > src/integrations/supabase/types.ts` |
| 14 | Lint baseline 11 (3 errors in shadcn files) | Cosmetic | Type aliases in `components/ui/command.tsx`, `textarea.tsx` |
| 15 | README is Lovable boilerplate; `supabase/pending-m1/` obsolete | Confusing | Rewrite / delete |
| 16 | Unused legacy tables | Clutter | Cleanup migration |
| 17 | Server STT and LLM not implemented (hooks only) | Web Speech quality varies; Chrome is best for the mic | Google STT v2 + LLM |
| 18 | No in-app prescription, consent capture (DPDP), data export/delete, privacy policy | Compliance | §7.11 |
| 19 | Preview link depends on the box running; ngrok free has an interstitial | Demo only | Real hosting |
| 20 | Naming: branch/folder/Docker id use "meyiyal" | Cosmetic | Optional rename |

---

## 7. Remaining work, in order

> Keep the gated-delivery rule for every item: build, then automated tests (DB + Playwright mobile/desktop + pytest where relevant), then screenshots EN/TA light/dark, then a commit, then a preview refresh. Only then start the next item.

### 7.1 Verification engine v1 (next; spec `docs/06-verification-engine.md` + the user's 17 Oct answers)
**Decisions to implement:**
- **Automate as much as possible. Auto-approve EVERY category, including doctors and lawyers**, when all of these hold:
  - the licence lookup matches (name + reg. no. + status active)
  - face match + liveness pass
  - the Aadhaar Secure QR signature is valid
  - degree checks pass
  - no duplicate/forensics flags
  - risk ≤ 20

  Otherwise: admin queue (24 h SLA). Risk > 60 or a hard fail → reject (appealable once within 30 days).

  Note: 06 §9 still says "doctors/lawyers always human-reviewed" for v1; the §0 decisions supersede that.
- **Council site lookups are automated score signals** (polite, rate-limited, cached in `registry_cache`, switchable), with **admin fallback** and a one-click deep link. Adapters are pluggable and mocked in tests.

  | Register | Lookup |
  |---|---|
  | TNMC | https://www.tamilnadumedicalcouncil.org/rmp/search |
  | NMC IMR | https://nmc.org.in/information-desk/indian-medical-register |
  | BCTNPY | https://www.bctnpy.org/l/verifyAdvocate |
  | CoA | https://coa.gov.in/ver_arch.php?lang=1 |
  | CMDA | https://cmdachennai.gov.in/RegiDevProfList/E1/2026.html |
  | RCI | https://rciregistration.nic.in/rehabcouncil/newsearchpage.jsp |
  | Others (TN Siddha, TN Board of Indian Medicine, TN Homoeopathy, TN Dental, TNSAHC, TNSVC, DTCP) | manual + upload until an adapter exists |
- **Two-tier badges:**
  - **"Licence verified"**: professions with a statutory register.
  - **"Degree verified"**: unregulated disciplines; degree + experience/portfolio required.

  A worker shows exactly one tier per profession. Handle "has a licence" vs "degree only" correctly in search filters, cards and the public profile.
- **Public profile shows** the badge + **"verified on <date>"** + **the verification selfie**. The worker gives explicit, separate consent at capture. The Aadhaar photo is never shown.
- **Expand Engineers** to every online-consultable discipline, each with discipline-correct licence rules:

  | Discipline | Licence rule |
  |---|---|
  | Software, IT, Data/AI-ML, Cyber security, Cloud/DevOps | Degree verified (+ optional certs: AWS/Azure/GCP, CISSP/CEH, etc. as extra evidence) |
  | Civil, Structural (building plans) | **CMDA/DTCP Registered Engineer** (TNCDBR 2019 R.23) for "Licence verified"; else Degree verified |
  | Electrical | Degree verified; the TN Electrical Licensing Board contractor/supervisor licence is an optional licence tier |
  | Mechanical, Electronics/ECE, Chemical, Instrumentation, Environmental, Biomedical, Aeronautical, Automobile, Agricultural, Mining, Marine, Solar & EV, Interior Design | Degree verified (+ optional IEI/AMIE chartered engineer) |
  | Architect | **CoA registration mandatory** (Licence verified) |
- **Expand Doctors**, each requiring **BOTH council registration AND degree verification**:

  | System | Register |
  |---|---|
  | Allopathy | TNMC / NMC IMR |
  | Siddha | TN Siddha Medical Council (or NCISM) |
  | Ayurveda, Unani, Yoga & Naturopathy | TN Board of Indian Medicine (or NCISM) |
  | Homoeopathy | TN Homoeopathy Medical Council (or NCH) |
  | Dental | TN Dental Council |
  | Physiotherapy / allied | TN State Allied & Healthcare Council (NCAHP Act) |
  | Clinical psychology | RCI CRR. Counsellors without RCI → Degree verified only, labelled "Counsellor" |
  | Nutrition/Dietetics | no statutory register → Degree verified (+ optional IDA RD) |
  | Veterinary (optional new category) | TN State Veterinary Council |

**Build tasks:**
1. **Migration `verification_*`:**
   - tables `verification_rules(category_slug, check, required, weight, params)` (inherited down the taxonomy), `verification_cases`, `verification_checks`, `verification_jobs` (`FOR UPDATE SKIP LOCKED`), `identity_fingerprints` (HMAC only), `verification_appeals`, `registry_cache`
   - worker columns `badge_tier ('licence'|'degree')`, `verified_at`, `public_selfie_path`, `selfie_consent_at`
   - RLS: workers can't read evidence or change status; only the service role writes checks; admin actions audited
2. **Taxonomy + `node_requirements` seed** for the new engineer/doctor nodes (EN + TA names, synonyms for the voice agent, rate cards inheriting the category bands).
3. **`services/verify` (FastAPI):**
   - `POST /verify/cases/{id}/run`, `GET /verify/health`; authenticates with the service role; never called by clients
   - Checks:
     - Aadhaar Secure QR decode + UIDAI signature, keeping only last4 + HMAC
     - liveness: random blink/turn challenge
     - face match: InsightFace/ArcFace ONNX on CPU, selfie vs QR photo
     - OCR: Tesseract eng+tam
     - forensics: EXIF/PDF producer/ELA/pHash
     - name matching: Tamil transliteration, initials, titles; Jaro-Winkler + token-set
     - duplicates
     - registry adapters
     - risk engine
4. **Client:**
   - an Aadhaar QR scan step + liveness capture step replace the stub OTP in the wizard
   - a case-status page ("Identity ✓, Licence checking…")
   - a selfie consent checkbox
5. **Admin:** side-by-side QR photo / selfie / registry link, scores, flags; approve / needs-info / reject with reason codes; SLA timers; appeals queue; re-verification scheduler (registry every 90 days, selfie every 180 days, immediately on a `fake_profile`/`wrong_advice` complaint, device or payout-account change).
6. **Public profile + cards:** badge tier, verified-on date, selfie.
7. **Retention jobs:**
   - raw selfies/ID images: decision + 30 days
   - provider raw responses: 90 days
   - hashes kept for rejected applicants
8. **Server pepper:** `VERIFY_HMAC_PEPPER` (new secret; keep in `supabase/.env` / service env).

### 7.2 Payout automation (RazorpayX + penny-drop)
- `PayoutProvider` interface (`razorpayx` | `mock`), like payments. New Edge Functions or a scheduled job:
  - `payout-fund-account` (create contact + fund account; **Fund Account Validation / penny-drop** name match vs the worker's KYC name)
  - `payout-run` (weekly cron + on-request when ≥ `payout_min` and no risk flags)
  - `payout-webhook` (`payout.processed/failed/reversed`, idempotent)
- **Tables:** `worker_payout_accounts` (bank/UPI, masked; hash for duplicate detection), with `payout_requests` extended with `provider_payout_id`, `status`, `failure_reason`.
- **Risk rules route a payout to admin review instead of paying automatically:** a new account < 7 days old, a recent complaint/flag, a name mismatch, a duplicate bank hash, or an amount > a threshold.
- **Env names:** `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`, `RAZORPAYX_WEBHOOK_SECRET`. New settings: `payouts_auto`, `payout_review_amount`, `payout_schedule`.
- TDS (194-O) / GST handling per CA advice; PAN capture later.

### 7.3 FCM push (ring when the app is closed)
- A Firebase project; the web SW handles `push` with vibrate, `requireInteraction` and Accept/Decline actions.
- `push_tokens` table + a register-token RPC.
- An Edge Function `push-send`, called from `request_create` (via a DB webhook/queue). It needs the FCM HTTP v1 service account.
- **Env names:** `VITE_FIREBASE_CONFIG` (public JSON), `VITE_FCM_VAPID_KEY`, `FCM_SERVICE_ACCOUNT_JSON` (secret).
- iOS works only for an installed PWA (16.4+).
- Later: Capacitor native for a true call screen.

### 7.4 TURN / 100ms
- **Quick:** add a TURN server (Cloudflare Calls TURN / Twilio NTS / coturn) to `VITE_ICE_SERVERS`, with short-lived credentials from an Edge Function.
- **Full:** implement the 100ms `CallProvider` with `@100mslive/hms-video-store` + a `call-token` Edge Function (checks the session party + balance). 100ms webhooks feed the meter.
- **Env:** `HMS_APP_ACCESS_KEY`, `HMS_APP_SECRET`, `HMS_TEMPLATE_ID`, `VITE_HMS_TOKEN_URL`.

### 7.5 MSG91 SMS OTP
- Supabase Auth **Send SMS hook** → Edge Function `sms-msg91` → MSG91 Flow/OTP API.
- DLT entity + template registration (TRAI).
- **Env:** `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`, `SEND_SMS_HOOK_SECRET`.
- Remove the test OTPs in production.

### 7.6 Google Maps / Places
- A `googleMap` implementation of `MapFactory` + a Places Autocomplete (session tokens) + Geocoding adapter in `geocoding.ts`.
- Keep Leaflet as a fallback.
- **Env:** `VITE_GOOGLE_MAPS_API_KEY` (referrer-restricted), and server-side `GOOGLE_MAPS_SERVER_KEY` if geocoding moves server-side.

### 7.7 Full test matrix
Every page × scenario × category/sub-category, on mobile + desktop, light + dark, EN + TA (§8.7).

### 7.8 UI polish
A consistent spacing/typography pass, skeletons, empty/error states, transitions, accessibility (≥ 44 px targets, large text), Tamil copy review, and a performance budget (first load < 2.5 s on 4G).

### 7.9 Admin editors
Reward milestones; moderation thresholds; commission rules (per category + new-worker); app_settings (typed form); taxonomy CMS (add/hide nodes, EN/TA names, synonyms); `node_requirements` editor; verification rules/weights; an admin user/role manager. Everything audited.

### 7.10 Remaining product items
Bonus-credit expiry; Tamil names for 96 areas; the lawyer-sort decision; README rewrite; types regeneration; legacy table cleanup; rename to "meiyiyal" if desired.

### 7.11 Production deploy
- **Supabase cloud:** a **new** project in ap-south-1 (Mumbai), Pro plan. `supabase link` → `db push` → `functions deploy` → secrets.
- **Auth:** Google OAuth prod redirect, email SMTP (Resend/SES), MSG91.
- **Hosting:** the PWA on Cloudflare Pages/Vercel.
- **Python services:** agent + verify on Cloud Run / Fly.io / a small VM in India. DigiLocker requires India-hosted servers.
- **Domain + TLS** (e.g. meiyiyal.in / app., admin.); admin on a separate subdomain with MFA.
- **Observability and resilience:** Sentry, uptime checks, backups/PITR, k6 load test, a pen-test of upload paths.
- **Compliance:**
  - **DPDP Act 2023 + Rules 2025** (most duties from 13 May 2027): consent per purpose, notices EN/TA, export/delete, breach runbook, grievance officer.
  - Privacy policy + Terms + worker T&Cs reviewed by counsel; telemedicine disclaimer ("Call 108").
  - CA review: GST/TDS, closed-loop wallet (RBI PPI).

---

## 8. Testing plan for each remaining item
| Item | DB / unit | E2E (Playwright, mobile + desktop, EN + TA) | Other |
|---|---|---|---|
| 8.1 Verification engine | RLS on cases/checks/evidence; only service writes; audit; SLA timestamps; appeal limit; retention purge; one reg. no. → one account. pytest: name normaliser (60+ cases incl. Tamil/initials), QR parser + tampered QR, forensics fixtures, OCR per template, risk engine table-driven, duplicate matcher, registry adapters with recorded HTML fixtures | genuine doctor auto-approved; doctor with registry mismatch → admin approves; forged certificate → flagged → rejected → appeal; reused reg. no. → hard reject; banned worker re-registers (same face/phone) → blocked; suspended status → reject; re-verification expiry → badge removed + can't go online; software engineer → "Degree verified"; civil engineer with CMDA → "Licence verified"; public profile shows badge + date + selfie only after consent | Accuracy set (~50 consented samples + synthetic forgeries): FAR < 1% at FRR < 10% before enabling auto-approve; SSRF tests on fetchers |
| 8.2 Payouts | idempotent webhook; no double payout; risk routing; min/hold rules; bank hash duplicates | penny-drop success/name mismatch; auto weekly run (mock clock); flagged payout → admin review; failure/reversal returns earnings | RazorpayX sandbox contract tests |
| 8.3 FCM | token register/unregister RLS | ring with app backgrounded (CDP/permission mocks), Accept from notification opens the session | Manual device matrix: Android Chrome, iOS installed PWA |
| 8.4 TURN/100ms | token function auth (party + balance) | call across two contexts with forced relay (`iceTransportPolicy: relay`) | Real-device test on two different mobile networks |
| 8.5 MSG91 | hook signature check | phone login with a mocked hook | Live OTP on a real number (staging) |
| 8.6 Google Maps | — | picker with a mocked Google loader; fallback to Leaflet when no key | Quota alerting |
| 8.7 Full matrix | — | For every route (`/login /location / /browse/:slug /w/:id /session/:id /history /profile /settings /wallet /earnings /worker/register /admin`) × {mobile, desktop} × {light, dark} × {EN, TA}: visual snapshot + no console errors + axe accessibility. For every taxonomy leaf (all doctor/lawyer/engineer sub-categories, auto-generated from the DB): browse → list → request → chat → end → feedback. Scenarios: low balance, ring timeout, decline, block, flag recovery, refund, payout | Lighthouse PWA/perf budgets |
| 8.8 Admin editors | RPC validation + audit for each editor | edit → effect visible (e.g. new milestone awarded, threshold change blocks earlier) | — |
| 8.9 Production | migrations replay on a fresh cloud project; secrets present | smoke suite against staging URL | k6 (search, ring, chat) at 2× expected peak; backup restore drill |

---

## 9. Cost estimates (ESTIMATES ONLY; verify on the vendor page before committing)
_Prices were checked on vendor or vendor-listing pages on 18 Oct 2026, unless marked "from docs" or "unsourced". USD→INR is taken as roughly ₹85–90. GST at 18% applies on most Indian service fees._

| Provider | What we'd use | Published price (estimate) | Example at early scale | Source |
|---|---|---|---|---|
| **Supabase** | Pro org + 1 project (Micro compute) in Mumbai | $25/month incl. $10 compute credit (Micro); Small ≈ $15, Medium ≈ $60/month compute; 100k MAU, 8 GB disk, 250 GB egress included | ≈ $25–40/month (₹2.2k–3.5k) | [supabase.com/pricing](https://supabase.com/pricing), [compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute) |
| **100ms** | voice/video calls | First 10,000 participant-minutes/month free, then $0.004/participant-min video, ~75% off audio-only (≈ $0.001) | 10-min 1:1 video = 20 p-min ≈ $0.08 (≈ ₹7); 1,000 such calls/month ≈ 20k p-min → ≈ $40 after the free 10k | [100ms.live/pricing](https://www.100ms.live/pricing), [100ms blog](https://www.100ms.live/blog/video-call-api-pricing) |
| TURN alternative | Cloudflare / Twilio / self-hosted coturn | not researched (unsourced) | coturn on a small VM ≈ $5–10/month (unsourced estimate) | — |
| **MSG91** | SMS OTP | ₹0.25/OTP at 5k → ₹0.18 at 8.5 lakh (+18% GST). DLT registration ≈ ₹5,900 one-time (third-party figure) | 10k OTP/month ≈ ₹2,500 + GST | [msg91.com/in/pricing/otp](https://msg91.com/in/pricing/otp), [DLT note (3rd party)](https://startmessaging.com/blog/cheapest-otp-api-india-2026) |
| **Razorpay** (collect) | Checkout for credit packs | 2% per domestic transaction + 18% GST on the fee (≈ 2.36%); no setup/AMC (standard rate card; negotiable) | ₹499 pack → ≈ ₹11.8 fee | [razorpay.com/pricing](https://razorpay.com/pricing/) |
| **RazorpayX** (payouts) | worker payouts + fund-account validation | IMPS/UPI ₹4 (< ₹1k), ₹6 (₹1k–25k), ₹9 (> ₹25k); NEFT ₹5; + GST. Plan/subscription fees may apply (a listing shows "BB+ Core ₹2,476/quarter"; verify). Penny-drop fee not confirmed | 500 weekly payouts ≈ ₹3,000 + GST/month | [razorpay.com/x/payouts_x](https://razorpay.com/x/payouts_x/), [docs](https://razorpay.com/docs/x/payouts) |
| **Google Maps Platform (India pricing)** | Dynamic Maps, Places Autocomplete, Geocoding | 70,000 free events/SKU/month (Essentials); then per 1,000: Dynamic Maps $2.10, Autocomplete requests $0.85 (sessions free with a token), Geocoding $1.50 | Likely ₹0 at pilot scale | [India pricing](https://developers.google.com/maps/billing-and-pricing/pricing-india), [India FAQ](https://developers.google.com/maps/billing-and-pricing/india) |
| **FCM** | push | No charge for Firebase Cloud Messaging (widely documented; verify) | ₹0 | [firebase.google.com/pricing](https://firebase.google.com/pricing) |
| **KYC provider** (v2) | Aadhaar OTP/QR, face match, PAN, DigiLocker | Mostly quote-based. Indicative: Aadhaar OTP/QR ≈ ₹5–6, face ≈ ₹15 per journey; planning budget **₹15–80 per completed worker verification** (from docs) | 200 workers ≈ ₹3k–16k one-time | `06-verification-engine.md` §7, [comparison (vendor-written)](https://hypersign.id/resources/blog/best-aadhaar-verification-api-providers) |
| Verification v1 (in-house) | QR, face, OCR, forensics on our server | ₹0 licence; compute only | a small CPU VM | `06` §9 |
| Google STT / LLM | voice agent upgrade | not priced in docs | — | [cloud.google.com/speech-to-text/pricing](https://cloud.google.com/speech-to-text/pricing) |
| Hosting (PWA) | Cloudflare Pages / Vercel | free tiers usually enough at pilot (unsourced) | ₹0–2k/month | — |
| Python services | agent + verify | small VM/container ≈ $5–20/month (unsourced estimate) | — | — |
| Domain | .in / .com | ≈ ₹800–1,500/year (unsourced estimate) | — | — |
| ngrok | preview only | free plan used now (1 static domain, interstitial) | ₹0 | [ngrok.com/pricing](https://ngrok.com/pricing) |

**Rough pilot total (estimate):** ≈ ₹5k–10k/month plus a one-time ≈ ₹6k (DLT) + KYC per-worker costs. Payment fees (≈ 2.36%) scale with revenue and are covered by the 15–18% commission.

---

## 10. User action items (balavenkatesh)
| Priority | Action | Why / where |
|---|---|---|
| 🔴 Now | **Rotate the old Supabase project's keys** (or pause/delete that project). Supabase dashboard → old TNPH project → Settings → API Keys → new publishable/secret keys, disable legacy anon + service_role (or JWT Keys → rotate) | The key is public in the old GitHub repo |
| 🔴 Now | Tell the team when it's done, so `/tmp/env.bak` can be deleted | Local copy of the old `.env` |
| High | Answer: should the voice agent also sort lawyers by rating (full mode)? | §6.2 #6 |
| High (before the verification build goes live) | Approve the low-rate automated council lookups (ToS review) | `06` §10 |
| High | Choose a **KYC provider** (shortlist Surepass + IDfy or HyperVerge); open a business account (CIN/GST/PAN, DPA) | Verification v2: Aadhaar OTP, face, PAN, DigiLocker |
| High | **RazorpayX** account (current account or Lite) + API keys; **Razorpay** live keys (or test keys first) | Payments go live; automatic payouts |
| Medium | **MSG91** account + **DLT** entity/template registration | Real SMS OTP |
| Medium | **Firebase** project (FCM) | Background ring |
| Medium | **100ms** account (or approve a TURN option) | Calls across networks |
| Medium | **Google Maps** API key (billing account; referrer restriction) | Production maps/search |
| Before launch | **Lawyer review** of advocate listings (BCI Rule 36) and the lawyer card wording | Legal risk |
| Before launch | **CA review**: GST on packs, TDS 194-O on payouts, closed-loop wallet | Tax/RBI |
| Before launch | Privacy policy + Terms + worker T&Cs (EN/TA), grievance officer (DPDP) | Compliance |
| Before launch | Domain name; decide the hosting account; new Supabase cloud project (Mumbai) | Production |
| Optional | Tamil names for the 96 missing areas (or approve machine transliteration + review) | TA polish |

---

## Appendix A: Commits (build box) and the bundle hash map
The bundle in the zip has the same final tree as the build box (verified identical `git ls-tree`), but `.env` was removed from all history with `git filter-branch`, so the hashes differ.

| Build box | Bundle | Commit |
|---|---|---|
| 9b88d78 | 94c3010 | Initial Lovable project (contained `.env`; removed in bundle) |
| 54b8d59 | fc6c94f | remove lovable componentTagger (contained `.env`; removed in bundle) |
| 3781e00 | 2572f9f | M0 security |
| a87945b | d4f1f69 | Login v1 |
| c4603ff | f4b081f | brand: new logo |
| 648b74b | 96e9d4a | M1a Location |
| c27a359 | 8488bbc | M1a Location v2 (map) |
| fa96a40 | 8532afe | M1b areas + browse |
| d8328ad | 0d373be | M2a profile/settings |
| e778052 | 5814d6f | fix lint |
| 1372c05 | c02df62 | M2b worker registration + admin |
| 95e07da | 1864a27 | M2c worker listing |
| 8f71b16 | def901b | M2 demo (3 dummy workers) |
| e53cb57 | da7a007 | Step A profession lock |
| 1714e1b | 87ea6e2 | M3 consult |
| ff1936d | 54bff82 | M4 trust |
| 3acb46e | 9cf2e2f | M5 voice agent |
| 2c2d7f1 | fc48aea | auth: public tunnel host |
| 7780ecf | 52b2325 | e2e Google redirect assert |
| 43985a0 | 90f2af7 | M6 payments/payouts |
| **137cf8e** | **e427ec3** | UI bottom navigation (HEAD) |

## Appendix B: Screenshot index (`screens/`, 179 PNG; `mobile-*` / `desktop-*` / numbered)
| Prefix | Feature |
|---|---|
| 01–07 | Login (EN/TA, phone, OTP, email) |
| 10 | Location list v1 |
| 11 | Map picker |
| 12 | Categories |
| 13 | Profile/Settings/dark |
| 14 | Worker registration + admin queue |
| 15 | Worker lists |
| 16 | Request/ring |
| 17 | Chat |
| 18 | Calls |
| 19 | History |
| 20 | Feedback |
| 21 | Rewards/certificates EN/TA |
| 22 | Flags/blocks/admin moderation/audit |
| 23 | Public worker profile |
| 24 | Admin rates |
| 25 | Voice agent |
| 26 | Wallet/checkout/admin packs & payments |
| 27 | Payouts |
| 28 | Bottom nav |
| google-signin.png | Google sign-in |

## Appendix C: Other documents in this package
- `docs/00-decisions.md`: final decisions (16 Oct), overriding 01–03 where they conflict.
- `docs/01-product-plan.md`: page-by-page flows. Its "lawyer compliance mode" section is superseded by decision #2 (full mode).
- `docs/02-architecture.md`: target architecture + data model. The implemented names differ (e.g. `consult_*`, `rate_cards`, `worker_earnings`); §3 here is the truth.
- `docs/03-implementation-plan.md`: plan + **progress log** (per-milestone evidence).
- `docs/04-credit-pricing.md`: pricing rationale (packs, bands, commission, payouts).
- `docs/05-requirements-checklist.md`: requirement checklist with status.
- `docs/06-verification-engine.md`: the verification engine spec + 17 Oct decisions (§0).
- `research.md`: online-occupation research, regulation (telemedicine, BCI, Aadhaar, RBI PPI, DPDP), taxonomy, verification metrics.
- `flow-notes.md`: the user's original 13-point flow.
- `tunnels/refresh-preview.sh`, `tunnels/start-ngrok.sh`: preview tooling (no tokens inside).

## Appendix D: GitHub branch (where the code lives now)

- **Repo:** `techman-bala96/TNPH_Meiyiyal` (public)
- **Branch:** [`meyiyal-v1`](https://github.com/techman-bala96/TNPH_Meiyiyal/tree/meyiyal-v1), HEAD `e427ec3` (= build-box `137cf8e`, same tree)
- **Pushed:** 18 Oct 2026 from the sanitised bundle `meyiyal-v1.bundle`, as a normal (non-force) push of a new branch. `main` (`9b88d78`) was not touched.
- **Checks before push:** `git log --all -- .env` is empty, and no `GOCSPX` (Google secret) or `sb_secret_` string is in any commit.
- **History:** the branch history was rewritten (`.env` stripped), so it shares no commits with `main`. It cannot be merged into `main` normally. To make it the main line later, set `meyiyal-v1` as the default branch in GitHub repo settings (or rename it), then delete or archive the old `main` after the old Supabase key is rotated.
- **`main` still exposes the old `.env`** (commits `9b88d78`, `54b8d59`). Key rotation (§6.1 item 1) is still required.

**Continue from GitHub:**
```bash
git clone -b meyiyal-v1 https://github.com/techman-bala96/TNPH_Meiyiyal.git meiyiyal
cd meiyiyal
# then follow §5 Local setup (supabase/.env is not in git; recreate it from §4)
```
