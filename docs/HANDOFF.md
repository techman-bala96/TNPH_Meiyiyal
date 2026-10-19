# Meiyiyal (மெய்யியல்) — Engineering Handoff

_Rewritten for M11 (19 Oct 2026, IST). Branch `meyiyal-v1`. This file replaces the earlier milestone diary: one section per
feature — what it does, where the code is, what is **mock** today, which settings control it, and how it is tested._

- **Go-live steps**: `docs/GO-LIVE.md` · **Admin subdomain + MFA**: `docs/admin-subdomain.md` · **Env names**: `.env.example`
- **Readiness report** on any database: `psql "$DB_URL" -f deploy/production/check.sql`

## தமிழ் சுருக்கம்
மெய்யியல் — தமிழ்நாட்டு மக்களைச் சரிபார்க்கப்பட்ட மருத்துவர், கால்நடை மருத்துவர், வழக்கறிஞர், பொறியாளர்களுடன் அரட்டை / குரல் / வீடியோ
ஆலோசனைக்கு இணைக்கும் இருமொழிச் செயலி. எல்லா அம்சங்களும் கட்டப்பட்டு சோதிக்கப்பட்டுள்ளன. வெளிக் கணக்குகள் தேவைப்படும் பகுதிகள் (பணம் செலுத்துதல்,
பணம் அனுப்புதல், SMS, ஆதார் KYC, வரைபடம், TURN, குரல்-உரை) “போலி” (mock) முறையில் வேலை செய்கின்றன; சாவிகள் கிடைத்ததும்
`docs/GO-LIVE.md` படி ஒவ்வொன்றாக இயக்கலாம். இறுதியில் உள்ள **“Bala தர வேண்டியவை”** பட்டியலைப் பாருங்கள்.

## Contents
1. Principles & architecture · 2. Sign-in · 3. Location & areas · 4. Professions catalogue · 5. Profile & settings ·
6. Professional registration & verification · 7. Search & nearby · 8. Consultations (request, ring, chat, calls, billing) ·
9. Calls: TURN / 100ms · 10. Feedback, rewards, moderation · 11. Voice agent (STT / LLM) · 12. Wallet, packs, payments ·
13. Bonus-credit expiry · 14. Earnings & payouts (RazorpayX) · 15. SMS (MSG91) · 16. Push notifications · 17. Referrals / invite codes ·
18. Admin console & editors · 19. Professionals by district · 20. Admin security (MFA, captcha, hardening) · 21. Privacy (DPDP) & legal pages ·
22. PWA, accessibility, visual tests · 23. Cleanup & data quality · 24. Every setting · 25. Tests · 26. Known limitations ·
27. **What Bala must provide**

---

## 1. Principles & architecture
- **Stack**: React 18 + Vite + TS + Tailwind/shadcn PWA (`src/`), Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions,
  pg_cron + pg_net), two FastAPI services (`services/agent`, `services/verify`).
- **Rules everywhere**: RLS on every table; the browser never writes money, status, rating, reward or verification fields —
  those go through `SECURITY DEFINER` RPCs (guarded by `meiyiyal.trusted` triggers) or Edge Functions with the service role.
  Settings live in `public.app_settings` (`setting()` / `setting_num()`), are edited in **Admin → Settings**, validated by
  `setting_specs`, and every admin write is in `public.admin_audit` (old → new).
- **Adapters with mocks**: each outside service has an interface and a mock that the tests use. Turning a provider on = secrets +
  one setting (GO-LIVE §5). Nothing calls a paid API until its secret exists.
- **Decisions kept** (user, Oct 2026): Aadhaar mandatory for professionals; council registration number mandatory, physiotherapy
  included; production auto-approve **off**, switchable per category; raw selfie deleted after 30 days, consented portrait kept;
  veterinary included; no automatic referral rewards in v1; Web Push without Firebase.
- **Folders**: `src/pages` (routes), `src/features/<area>` (logic + components), `supabase/migrations` (schema + SQL API, in order),
  `supabase/functions` (+ `_shared` adapters), `supabase/tests` (SQL suites), `e2e/` (Playwright), `tests/unit` (Node),
  `deploy/` (Hostinger, production SQL, coturn), `docs/`.

## 2. Sign-in
- Google OAuth, email magic link, phone OTP (+91). `src/hooks/useAuth.tsx`, `src/pages/Login.tsx`, guards in `components/app/Guards.tsx`.
- **Mock today**: phone OTP uses fixed test numbers in `supabase/config.toml [auth.sms.test_otp]`; email goes to Mailpit locally.
- **Live**: SMS via the Send-SMS hook → MSG91 (§15); SMTP sender in the dashboard; Google OAuth client.
- Captcha adapter on the email/phone forms (§20). Links to `/privacy` and `/terms` on the login screen.
- Tests: `e2e/login.spec.ts`, `e2e/admin-mfa.spec.ts` (captcha mock).

## 3. Location & areas
- Full-screen map (`src/pages/LocationPage.tsx`, `features/location`), GPS + drag pin + search; saved locations; `RequireLocation`.
- **Providers**: `VITE_MAPS_PROVIDER=osm` (default: Leaflet + OSM tiles + Nominatim, 1 req/s queue + cache) or `google`
  (Google tiles in the browser with `VITE_GOOGLE_MAPS_BROWSER_KEY`; geocode/reverse/autocomplete through the `maps-geo` Edge
  Function with `GOOGLE_MAPS_SERVER_KEY`). Any Google failure falls back to Nominatim.
- Data: 38 districts, 213 areas with OSM coordinates; **208 areas have Tamil names**, 5 left empty on purpose (§23).
- Tests: `m1_location.sql`, `m1b_areas_taxonomy.sql`, `e2e/location.spec.ts` (tiles/Nominatim fixtures), `tests/unit/googleGeo.test.mjs`.

## 4. Professions catalogue (taxonomy)
- `taxonomy_nodes` (117 nodes, en/ta + synonyms): Doctor (Allopathy specialties, Siddha, Ayurveda, Unani, Homoeopathy, Yoga &
  Naturopathy, Dental, Physiotherapy, Psychology, Nutrition), **Veterinary**, Lawyer (12 areas), Engineer (8 incl. Architect).
- Per node: requirements form (`node_requirements`), verification rules (`verification_rules`), rate cards, commission.
- **Admin → Professions** edits names, synonyms, order, visibility, requirements and rules. Guards: no new top-level
  categories; a council certificate can't be removed once required; identity is never optional; a required registry check
  can't be downgraded.
- Tests: `m1b_areas_taxonomy.sql`, `m7_verification.sql`, `m11_admin.sql`.

## 5. Profile & settings
- `/profile`: photo (512 px WebP to the public `avatars` bucket), name, phone, DOB, saved locations, wallet card, invite card.
- `/settings`: language, theme (light/dark/system), notifications (§16), **Your data** (§21).
- Tests: `m2a_profile.sql`, `e2e/profile.spec.ts`, `e2e/privacy.spec.ts`.

## 6. Professional registration & verification
- Wizard `/worker/register`: profession (locked after first submit) → details (config-driven per node) → **Aadhaar** (OTP via the
  `kyc-aadhaar` function, or UIDAI Secure QR scan) → documents (private `worker-docs`) → selfie + active liveness → review.
- **Engine** (`services/verify` + SQL in `m7_verification` / `m11_verification`): council registration-number adapters
  (TNMC, NMC, RCI, CoA, Bar Council TN & Puducherry, CMDA — `registries` in `/verify/health`), UIDAI QR signature, name match,
  face match, liveness, OCR, document forensics, duplicate fingerprints, risk score → approve / review / reject. A missing
  adapter or timeout means **review**, never a silent pass. Re-checks of council registrations every night (03:00 IST).
- **Auto-approve**: global `verify_auto_approve` + per-category switches (Admin → Settings → "Auto-approve per profession":
  inherit / on / off). Production: **off** (`deploy/production/settings.sql`).
- **Retention**: raw selfies / QR photos deleted 30 days after the decision (`verify_retain_days`, paused during an appeal);
  the consented portrait stays as the profile photo.
- Admin: Queue (24 h SLA badge, checks, registry deep link, approve / need info / reject with note), Appeals (audited media viewer).
- **Mock today**: `kyc_provider=stub` locally (fixed OTP), `KYC_PROVIDER=mock` in the function; face/OCR/liveness providers
  `mock`/`heuristic` in `services/verify`. **Live**: Surepass (`KYC_PROVIDER=surepass`, `SUREPASS_TOKEN`, then
  `kyc_provider=edge`); optional `FACE_PROVIDER=insightface` (`requirements-face.txt`), `OCR_PROVIDER=tesseract`, vendor liveness.
- Only the last 4 Aadhaar digits + a peppered hash are stored.
- Tests: `m2b_worker.sql`, `m2d_lock.sql`, `m7_verification.sql`, `m11_verification.sql`, `tests/unit/kycProvider.test.mjs`, `npm run test:verify`,
  `e2e/worker-reg.spec.ts`, `e2e/verify-m11.spec.ts`.

## 7. Search & nearby
- `search_workers`: approved, unblocked, reachable professionals at the chosen node; online first, then nearest within
  `search_radius_km` (50); "show all" = whole state by district. Lawyers are never ranked by rating (BCI caution).
- **Auto-request** (M10): one tap tries up to `auto_request_max` (5) nearby professionals, `auto_ring_seconds` (30) each;
  paid messages to an offline professional (`worker_message_*`); missed rings set a professional offline after 3.
- Tests: `m2c_search.sql`, `m10_nearby.sql`, `tests/unit/nearbyMatch.test.mjs`, `e2e/marketplace.spec.ts`, `e2e/nearby.spec.ts`.

## 8. Consultations
- Request → ring (`ring_seconds` 45, Web Audio + vibration + push) → session `/session/:id`: chat, files (`consult-files`, 20 MB),
  voice/video, mode switch; billed **per started minute** from rate cards; ends at 0 balance.
- Presence: billing pauses when one side drops (`session_drop_seconds` 30), resume within 3 min; early end without a reply →
  full refund (`early_end_refund_minutes` 2); one-tap reconnect for 10 min.
- Rate cards: Admin → Rates (band + chat < voice < video validation).
- Tests: `m3_consult.sql`, `m10a_billing_gap.sql`, `e2e/consult.spec.ts` (3 browser contexts, fake camera/mic).

## 9. Calls: TURN / 100ms
- P2P WebRTC (`features/consult/call`), signalling on a private Realtime channel; ICE restart fallback.
- ICE servers come from the `ice-servers` function: `ICE_PROVIDER=stun` (default, public STUN — may fail on mobile CGNAT),
  `coturn` (TURN REST credentials signed with `TURN_SECRET`, config in `deploy/coturn/turnserver.conf`), or `static`
  (`ICE_SERVERS_JSON` from a managed vendor).
- Optional 100ms: `VITE_CALL_PROVIDER=hms` + `HMS_*` secrets + `npm i @100mslive/hms-video-store`; falls back to WebRTC.
- **Mock today**: STUN only. Tests: `tests/unit/ice.test.mjs`, `e2e/consult.spec.ts`.

## 10. Feedback, rewards, moderation
- One feedback per session (tags from `feedback_tags`), server-side rating aggregates, public profile `/w/:id`.
- Reward milestones (Admin → Milestones) with certificates `MYL-YYYY-NNNNNN` (PNG/PDF, en/ta).
- Moderation: complaint or rating ≤ 2 flags; 3 negatives in 30 days block for 7 days; Admin → Moderation (unblock / extend /
  clear, note required).
- Tests: `m4_feedback.sql`, `e2e/trust.spec.ts`.

## 11. Voice agent (STT / LLM)
- `services/agent` FastAPI: `POST /agent/parse` (JWT, rate-limited), `POST /agent/stt`, `GET /agent/health`. Rule parser
  (EN / TA / Tanglish, follow-up questions) + optional LLM fallback.
- **STT**: `VITE_STT=browser` (Web Speech, default) | `server` | `auto`. Server: `AGENT_STT_PROVIDER` = "" (off → 503) |
  `mock` | `google` (`AGENT_STT_KEY`) | `openai` (any OpenAI-compatible Whisper endpoint: URL/KEY/MODEL). Max 1 MB audio.
  The browser side records with a voice-activity gate (`speechGate.ts`).
- **LLM**: `AGENT_LLM_PROVIDER` = "" (grammar only) | `mock` | `openai` (OpenAI-compatible chat endpoint); output is validated
  against the catalogue before use.
- **Mock today**: grammar only; e2e uses `AGENT_STT_PROVIDER=mock`. Docker image: `services/agent/Dockerfile`.
- Tests: `npm run test:agent` (pytest + ruff), `tests/unit/speechGate.test.mjs`, `e2e/voice.spec.ts`.

## 12. Wallet, packs, payments
- `/wallet`: balance, packs (GST shown), checkout, ledger. Packs: Admin → Packs. 1 credit = ₹1, consultations only.
- Edge Functions `payments-create-order` (amount from DB), `payments-verify` (HMAC), `payments-webhook` (signature + idempotent),
  `payments-mock` (local gateway signing exactly like Razorpay).
- **Mock today**: `payments_mock=true`. **Live**: `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, webhook URL, then `payments_mock=false`.
- Refunds: Admin → Payments (unspent credits only, reason required).
- Tests: `m6_payments.sql`, `e2e/payments.spec.ts`.

## 13. Bonus-credit expiry
- Pack bonus credits become `bonus_grants`; spending uses **bonus first** (FIFO); a daily job (00:30 IST) expires what is left
  after `bonus_expiry_days` (90) and warns `bonus_expiry_warn_days` (7) before by push. Refunds void their grant.
- Wallet shows "N bonus credits expire on …" and the rule text. Paid credits never expire.
- Tests: `m11_bonus.sql`, `e2e/payments.spec.ts`.

## 14. Earnings & payouts (RazorpayX)
- Earnings held `payout_hold_hours` (72); commission: new-professional rate (15% for 30 days / 20 sessions), then per-category
  rules (Admin → Commission, 15–20%), then default 18%.
- Payout accounts: bank or UPI, penny-drop + name match against the Aadhaar name, SMS step-up code for changes, 3-day cool-off.
- **Weekly batch Monday 10:00 IST** (`payout-weekly`, only when `payouts_auto`), ₹200 minimum, retries every 10 min, webhooks.
- **Mock today**: `payouts_mock=true` (suffix rules for tests). **Live**: `RAZORPAYX_*` secrets → `payouts_mock=false` →
  test ₹1 → `payouts_auto=true`. TDS off until the CA confirms (`tds_enabled`).
- Admin → Payouts: review queue, pause, per-professional hold, break-glass mark-paid with UTR.
- Tests: `m6_payments.sql`, `m8_payouts.sql`, `m11_payouts.sql`, `tests/unit/razorpayx.test.mjs`, `payoutSchedule.test.mjs`, `e2e/payouts.spec.ts`.

## 15. SMS (MSG91)
- `_shared/sms.ts`: `SMS_PROVIDER=mock` (writes `public.sms_outbox`, sends nothing) | `msg91` (Flow API, DLT templates
  `MSG91_TEMPLATE_LOGIN_OTP`, `MSG91_TEMPLATE_STEPUP`, sender `MSG91_SENDER_ID`).
- Sign-in OTP goes through the Auth **Send-SMS hook** → `sms-hook` function (Standard Webhooks signature,
  `SEND_SMS_HOOK_SECRET`); commented `[auth.hook.send_sms]` block in `config.toml`. Outbox trimmed hourly.
- Tests: `m11_payouts.sql` (step-up + outbox), `tests/unit/sms.test.mjs`, `standardWebhook.test.mjs`.

## 16. Push notifications
- Own Web Push with VAPID (no Firebase). `notifications` inbox + push queue, `push-send` function via pg_net, `push-sweep`
  every 30 s, quiet hours 22:00–07:00 IST, categories, collapse windows; chat pushes never include message text.
- **Mock today**: `push_mock=true`. **Live**: `VAPID_*` secrets (`node scripts/gen-vapid-keys.mjs`), `push_send_url` (settings.sql),
  `push_mock=false`. iPhone: only from the Home Screen app (iOS 16.4+).
- Tests: `m9_push.sql`, `tests/unit/pushText.test.mjs`, `e2e/push.spec.ts`.

## 17. Referrals / invite codes
- Every user gets a personal code (`M` + 6 chars) and links `/?ref=CODE` and `/worker/register?ref=CODE`; the code is captured
  before sign-in and claimed once after (`ReferralClaimer`), or typed on Profile within `referral_claim_days` (30).
- Refused: own code, a second code, two-way loops, expired / full / inactive campaign codes.
- Admin → Referrals: top referrers, who referred whom, campaign codes (create, limit, expiry, deactivate), CSV.
- **No rewards in v1**: `referral_rewards.enabled` is locked to false server-side until rules are decided.
- Tests: `m11_referrals.sql`, `tests/unit/referral.test.mjs`, `e2e/admin-m11.spec.ts`.

## 18. Admin console & editors
- `/admin` (separate lazy chunk, `noindex`), grouped nav: Review (Queue, Appeals, Districts) · People (Moderation, Referrals) ·
  Money (Payments, Payouts, Packs, Rates, Commission) · Setup (Settings, Professions, Milestones, Security) · Records (Audit).
- **Settings editor**: every non-secret setting with type/range/enum validation and cross-field rules; secrets (peppers, hook
  secrets, service key, stub OTP) have no spec row and are never shown. Audit log shows old → new.
- Tests: `m11_admin.sql`, `e2e/admin-m11.spec.ts`.

## 19. Professionals by district
- Admin → Districts: all 38 districts (zeros included) + "unassigned", split by status (submitted / pending / approved /
  rejected; pending includes "needs info") and profession (doctor — includes veterinary, also shown separately — lawyer,
  engineer). Filters, search, hide-zero, sort, totals, CSV (UTF-8 BOM, formula-safe). Sticky district column on phones.
- Tests: `m11_referrals.sql` (district RPC), `e2e/admin-m11.spec.ts`.

## 20. Admin security
- **TOTP MFA** (`admin_mfa_required`, default on): enforced inside `has_role()` — the signed-in admin has no admin powers
  (RPCs or RLS) until the session is `aal2`. `/admin` shows enrol (QR + manual key) or a code prompt. Turning MFA **off** is
  refused from the app (SQL only). Admin → Security lists admins and resets a colleague's lost authenticator (reason
  required, audited). Events `admin.mfa.enrolled/verified`, `admin.idle.signout` in the audit log.
- Idle sign-out after `admin_idle_minutes` (30). Optional `VITE_ADMIN_HOST=admin.meiyiyal.com` redirect (docs/admin-subdomain.md).
- **Captcha adapter** (`features/captcha`): `VITE_CAPTCHA_PROVIDER` none | mock | turnstile | hcaptcha + site key; token
  passed to Supabase Auth, verified server-side when `[auth.captcha]` is enabled. A provider without a site key falls back to
  none (no lock-out).
- Local tests switch MFA off for the run (`scripts/test-db.sh`, `e2e/global-setup.ts`) and restore it.
- Tests: `m11_admin_security.sql`, `tests/unit/adminSecurity.test.mjs`, `e2e/admin-mfa.spec.ts` (real TOTP).

## 21. Privacy (DPDP) & legal pages
- **Your data** (Settings): download a JSON export of everything about the user (account, profile, locations, wallet, payments,
  consultations + messages, feedback, notifications, referral, professional records with documents/identity masked),
  `data_export_per_day` (3).
- **Delete account**: typed confirm (`DELETE` / `நீக்கு`), grace `account_delete_grace_days` (7), cancel any time; waits for
  blockers (active consultation, payout in progress, unpaid earnings, admin role). The hourly `account-purge` job + function
  deletes the user's files in every bucket, anonymises personal rows (profile, locations, push devices, notifications,
  messages → "[deleted]", professional profile → "Deleted professional"), scrubs and bans the auth user and drops its
  identities. **Payment / tax records are kept** without the name. Wallet balance left at deletion is lost (shown in the dialog).
- `/privacy` and `/terms` (en/ta), public, marked **DRAFT**, Grievance Officer from `VITE_GRIEVANCE_*` or "To be appointed".
  Text in `src/features/legal/content.ts` — must be reviewed by a lawyer.
- Tests: `m11_privacy.sql`, `tests/unit/legal.test.mjs`, `e2e/privacy.spec.ts`; purge function smoke-tested on the local edge runtime.

## 22. PWA, accessibility, visual tests
- PWA: manifest (192/512/maskable icons), `src/sw.ts` (precache, SPA fallback, push). `npm run test:pwa` builds and checks
  manifest, service worker control, offline load, and Lighthouse budgets (performance ≥ 60, accessibility ≥ 95, best-practices
  ≥ 90, SEO ≥ 90) on `/login` and `/privacy`; reports in `test-results/lighthouse/`.
- **axe** (`e2e/a11y.spec.ts`): WCAG 2.1 A/AA on public pages (en + ta), signed-in pages and every admin tab, on mobile,
  desktop and tablet; serious/critical findings fail. Fixes made: brand teal darkened to `hsl(168 80% 25%)` (#0c725e) and
  red to `hsl(0 72% 44%)` for AA text contrast; low-contrast green/amber utilities darkened; accessible names that hid visible text.
- **Visual** (`e2e/visual.spec.ts`): login, phone login, privacy, terms (en/ta) and settings compared with Linux baselines in
  `e2e/visual.spec.ts-snapshots/` (skipped on Windows/macOS). Update after an intended change: `--update-snapshots`.
- **Tablet** project (iPad Mini size, Chromium) runs a11y, visual and the screenshot tour `e2e/screens.spec.ts`.

## 23. Cleanup & data quality
- Guarded migration `20261019090000_m11_legacy_cleanup.sql` dropped the unused Lovable tables (`certificates`, `chat_messages`,
  `occupation_services`, `occupations`, `service_requests`, `support_tickets`, `worker_education`, `worker_experience`,
  `worker_portfolio`), the columns `workers.occupation_id` / `wallet_transactions.request_id` and two orphan enums. It aborts
  without changes if any of them holds data.
- `supabase/pending-m1/` removed; README rewritten; `.env.example` complete (unit test keeps it in sync with the code).
- **Tamil area names**: 91 added (`20261019100000_m11_tamil_area_names.sql`). **Left empty on purpose — please confirm the
  Tamil spelling** (update `tn_areas.name_ta`; Admin UI does not edit areas):

  | area (district) | question |
  | --- | --- |
  | Madurai City (Madurai) | "மதுரை நகரம்" or "மதுரை மாநகர்"? |
  | Trichy City (Tiruchirappalli) | "திருச்சி நகரம்" or "திருச்சி மாநகர்"? |
  | Kumarapalayam (Namakkal) | official spelling Komarapalayam: "குமாரபாளையம்" or "கொமாரபாளையம்"? |
  | Denkanikottai (Krishnagiri) | "தேன்கனிக்கோட்டை" or "டெங்கனிக்கோட்டை"? |
  | Sholingur (Ranipet) | "சோளிங்கர்" or "சோழிங்கர்"? |

## 24. Every setting (Admin → Settings)
Secrets in `app_settings` (`aadhaar_pepper`, `payout_account_pepper`, `verify_hmac_pepper`, `verify_service_key`,
`payout_hook_secret`, `push_hook_secret`, `account_hook_secret`, `kyc_stub_otp`) are random per database and never shown;
`payout_schedule` / `payout_fee_bearer` are fixed (weekly / platform). Production values: `deploy/production/settings.sql`.

**consult**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `ring_seconds` | number 10–120 | `45` | Ring time for a direct request (seconds) | — |
| `auto_ring_seconds` | number 10–120 | `30` | Ring time per professional in auto-request (seconds) | — |
| `auto_request_max` | number 1–10 | `5` | Professionals tried per auto-request | — |
| `ask_again_wait_seconds` | number 0–600 | `60` | Wait before asking the same professional again (seconds) | — |
| `missed_rings_offline` | number 1–10 | `3` | Missed rings before a professional is set offline | — |
| `presence_seconds` | number 30–600 | `120` | Online heartbeat timeout (seconds) | — |
| `search_radius_km` | number 1–500 | `50` | Default search radius (km) | — |
| `session_drop_seconds` | number 5–300 | `30` | Connection drop grace (seconds) | — |
| `session_resume_minutes` | number 1–30 | `3` | Resume window after a drop (minutes) | — |
| `reconnect_window_minutes` | number 1–60 | `10` | Reconnect window (minutes) | — |
| `low_balance_resume_minutes` | number 1–30 | `2` | Top-up window when credits run out (minutes) | — |
| `early_end_refund_minutes` | number 0–10 | `2` | Refund if the professional ends within (minutes) | — |
| `worker_message_credits` | number 0–100 | `5` | Credits for a message to an offline professional | — |
| `worker_message_daily_max` | number 0–20 | `3` | Offline messages per user per day | — |
| `worker_message_refund_hours` | number 1–168 | `24` | Refund unanswered messages after (hours) | — |
| `worker_message_reserve_minutes` | number 1–60 | `5` | Minutes reserved when a message is answered | — |

**dev**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `dev_test_credits` | bool | `true` | Local test credits button | false |

**moderation**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `block_negatives` | number 1–20 | `3` | Negative reviews that trigger a block | — |
| `block_window_days` | number 1–365 | `30` | …counted within (days) | — |
| `block_days` | number 1–365 | `7` | Automatic block length (days) | — |
| `flag_clear_good_sessions` | number 1–20 | `3` | Good sessions that clear a flag | — |
| `good_rating_min` | number 1–5 | `4` | Lowest rating counted as good | — |
| `negative_rating_max` | number 1–5 | `2` | Highest rating counted as negative | — |
| `feedback_tags` | json | `{"negative": [{"en": "Rude behaviour"…` | Feedback tags (en/ta) | — |

**money**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `gst_pct` | number 0–28 | `18` | GST on credit packs (%) | — |
| `commission_pct` | number 15–20 | `18` | Platform commission (%) | — |
| `commission_new_pct` | number 15–20 | `15` | Commission for new professionals (%) | — |
| `commission_new_days` | number 0–365 | `30` | New-professional period (days) | — |
| `commission_new_sessions` | number 0–1000 | `20` | …or until this many sessions | — |
| `payout_min` | number 1–100000 | `200` | Minimum payout (₹) | — |
| `payout_hold_hours` | number 0–720 | `72` | Earnings hold before payout (hours) | — |
| `payout_cooling_days` | number 0–30 | `3` | Cooling period after a new payout account (days) | — |
| `payout_review_amount` | number 0–10000000 | `10000` | Payouts above this need admin approval (₹) | — |
| `payout_max_attempts` | number 1–10 | `3` | Payout retry attempts | — |
| `payouts_auto` | bool | `false` | Weekly automatic payouts (Mon 10:00 IST) | — |
| `payouts_mock` | bool | `true` | Payouts in mock mode (no real money) | false after RazorpayX keys are set |
| `payments_mock` | bool | `true` | Payments in mock mode | false after Razorpay keys are set |
| `tds_enabled` | bool | `false` | Deduct TDS on payouts | — |
| `bonus_expiry_days` | number 0–3650 | `90` | Bonus credits expire after (days, 0 = never) | — |
| `bonus_expiry_warn_days` | number 0–60 | `7` | Warn before bonus expiry (days) | — |
| `payout_run_url` | text | `""` | payout-run function URL | https://<project>.supabase.co/functions/v1/payout-run |

**notifications**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `push_enabled` | bool | `true` | Push notifications on | — |
| `push_mock` | bool | `true` | Push in mock mode | false after VAPID keys are set |
| `push_quiet_default` | json | `{"on": true, "to": "07:00", "from": "…` | Default quiet hours (IST) | — |
| `push_reach_minutes` | number 1–1440 | `480` | Drop undelivered pushes after (minutes) | — |
| `push_chat_collapse_seconds` | number 0–3600 | `120` | Group chat pushes within (seconds) | — |
| `push_admin_collapse_seconds` | number 0–86400 | `3600` | Group admin pushes within (seconds) | — |
| `push_feedback_reminder_minutes` | number 0–1440 | `30` | Feedback reminder after (minutes) | — |
| `push_send_url` | text | `"http://kong:8000/functions/v1/push-s…` | push-send function URL | https://<project>.supabase.co/functions/v1/push-send |

**referrals**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `referral_claim_days` | number 1–365 | `30` | New accounts can add an invite code within (days) | — |
| `referral_rewards` | json | `{"note": "Not active in v1. Rules to …` | Referral reward rules (disabled in v1) | keep enabled=false until rewards are decided |

**security**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `account_delete_grace_days` | number 1–30 | `7` | Account deletion grace period (days) | — |
| `data_export_per_day` | number 1–20 | `3` | Data downloads per user per day | — |
| `account_purge_url` | text | `""` | account-purge function URL | https://<project>.supabase.co/functions/v1/account-purge |
| `admin_mfa_required` | bool | `true` | Admins must use an authenticator app (TOTP) | true (can only be turned off from SQL) |
| `admin_idle_minutes` | number 5–240 | `30` | Sign admins out after idle minutes | 30 |
| `captcha_provider` | enum (none/mock/turnstile/hcaptcha) | `"none"` | Sign-in captcha (informational; set the matching VITE_CAPTCHA_PROVIDER and [auth.captcha]) | turnstile |

**verification**

| key | type / range | default (local DB) | meaning | production |
|---|---|---|---|---|
| `verify_auto_approve` | bool | `true` | Auto-approve clean cases (all categories) | false |
| `verify_auto_approve_categories` | json | `{}` | Per-category auto-approve switch | — |
| `verify_risk_approve` | number 0–100 | `20` | Auto-approve only at or below this risk | — |
| `verify_risk_reject` | number 0–100 | `60` | Reject above this risk | — |
| `verify_name_pass` | number 0.5–1 | `0.92` | Name match: pass at | — |
| `verify_name_review` | number 0.5–1 | `0.80` | Name match: review at | — |
| `verify_registry_live` | bool | `true` | Look up council registers live | — |
| `verify_registry_days` | number 1–3650 | `90` | Re-check council registration every (days) | — |
| `verify_selfie_days` | number 30–3650 | `180` | Ask for a fresh selfie every (days) | — |
| `verify_retain_days` | number 1–30 | `30` | Delete raw selfies/frames after (days, max 30) | — |
| `verify_liveness_window_seconds` | number 60–900 | `180` | Liveness challenge time limit (seconds) | — |
| `verify_job_max_attempts` | number 1–20 | `5` | Verification job retries | — |
| `kyc_provider` | enum (stub/edge) | `"stub"` | Aadhaar OTP provider (stub = local test) | edge |
| `kyc_edge_sends_per_hour` | number 1–20 | `5` | Aadhaar OTP sends per hour | — |
| `verify_service_url` | text | `""` | Verify service URL | https URL of the verify service |
| `verify_registry_adapters` | json | `{}` | Council register adapters | — |

## 25. Tests
| suite | command | result (19 Oct 2026, IST) |
| --- | --- | --- |
@@TESTS@@

**Scenario checklist:** every scenario (steps, expected, actual pass/fail per device, language, spec, screenshots), the coverage matrix of every route / RPC / Edge Function / cron job / setting / admin tool / notification, the Button coverage table from the click-crawl, the live-readiness list and the real-phone / production-only checks are in **[TEST-SCENARIOS.md](TEST-SCENARIOS.md)** (regenerate with `node scripts/test-scenarios.mjs` after a full run; see the header there).

Notes: `test:db` turns admin MFA off for the run and restores it; Playwright's global setup/teardown does the same.
`test:e2e` starts Vite :8080, `supabase functions serve` and the agent :8787 itself; the local stack must be up.

## 26. Known limitations
| # | item | impact | what to do |
| --- | --- | --- | --- |
| 1 | Providers in mock (payments, payouts, SMS, KYC, push, maps on OSM, STUN-only calls, STT/LLM off) | no real money / SMS / push | GO-LIVE §5, one provider at a time |
| 2 | STUN-only WebRTC | voice/video may fail on mobile CGNAT; chat always works | coturn (`deploy/coturn`) or 100ms |
| 3 | Public Nominatim/OSM servers | usage policy limits; no heavy production use | `VITE_MAPS_PROVIDER=google` or a paid tile/geocoder |
| 4 | Legal text is a DRAFT | not legal advice | lawyer review; Grievance Officer details |
| 5 | Lawyer listings and ratings (BCI Rule 36) | advertising risk | counsel review; lawyers are never ranked by rating |
| 6 | Tax: GST on packs, TDS 194-O on payouts, closed-loop wallet | compliance | CA review; `tds_enabled` stays off until then |
| 7 | Face / OCR / liveness run on heuristics or mocks | more manual review | `FACE_PROVIDER=insightface`, `OCR_PROVIDER=tesseract` or a vendor |
| 8 | 5 Tamil area names unconfirmed | English shown for those 5 in Tamil mode | §23 table |
| 9 | Visual baselines are Linux-only | skipped on Windows | run `test:e2e` on Linux/CI for visual checks |
| 10 | Old Lovable project key leaked in the old public repo (`main`) | anyone can call that old project | rotate / pause the old Supabase project (if not done yet) |
| 11 | Wallet money left at account deletion is forfeited | user loss if they forget | dialog warns; decide whether to auto-refund instead |

## 27. What Bala must provide
**Status (19 Oct 2026): every key-dependent feature is ON HOLD until you send the keys.** Each one runs on its mock
adapter today and is covered by mock tests only; nothing calls a paid API until its secret exists. When a key arrives:
put it where the table says → test with your own account → flip the setting (GO-LIVE §5).

Where values go: **Edge secrets** = `supabase secrets set NAME=value` on the Mumbai project · **Web build** =
`.env.production.local` before `npm run build` (public values only) · **VM env** = the agent / verify env files on the VM (names in `.env.example`, GO-LIVE §4) · **Setting** = Admin → Settings (or `deploy/production/settings.sql`) · **Dashboard** = Supabase dashboard page named.
Never put real values in git or chat.

| # | What (on hold → mock today) | Goes into (exact names) | Where to get it |
| --- | --- | --- | --- |
| 1 | **Hosted Supabase, Mumbai** (local Supabase today) | Web build `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; VM env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (verify), `SUPABASE_JWT_SECRET` (agent); DB password for `supabase link` / `db push` | supabase.com → new org (Pro) → New project, region **Mumbai (ap-south-1)** → Project Settings → API / Database |
| 2 | **Hostinger DNS + hosting** (none today) | DNS records in GO-LIVE §3 (`@`/`www` → hosting, `admin`, `agent`/`verify`/`turn` → VM IP, SPF/DKIM TXT); `dist/` → `public_html` | hPanel → Domains → meiyiyal.com → DNS Zone; Hosting → File Manager |
| 3 | **Razorpay** payments (mock gateway, `payments_mock=true`) | Edge secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; webhook URL `https://<ref>.supabase.co/functions/v1/payments-webhook`; then setting `payments_mock=false` | dashboard.razorpay.com → Account & Settings → API Keys (Live) and → Webhooks (events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`) |
| 4 | **RazorpayX** payouts (mock, `payouts_mock=true`) | Edge secrets `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`, `RAZORPAYX_WEBHOOK_SECRET`; webhook `…/functions/v1/payout-webhook`; settings `payouts_mock=false`, later `payouts_auto=true` | x.razorpay.com → Settings → Developer Controls (API keys, webhooks); current-account number on the RazorpayX home |
| 5 | **MSG91 + DLT** SMS (mock → `sms_outbox`, test OTPs in `config.toml`) | Edge secrets `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_LOGIN_OTP`, `MSG91_TEMPLATE_STEPUP`, `SEND_SMS_HOOK_SECRET`; Dashboard → Auth → Hooks → Send SMS → `…/functions/v1/sms-hook` | msg91.com → API → Auth key; DLT entity + 6-letter sender ID + 2 templates on a DLT portal (Jio/Vodafone/Airtel), then map them in MSG91 → Templates |
| 6 | **Aadhaar e-KYC provider**, e.g. Surepass (stub, fixed OTP) | Edge secrets `KYC_PROVIDER=surepass`, `SUREPASS_TOKEN` (`SUREPASS_BASE_URL` only if they give a different host); setting `kyc_provider="edge"` | surepass.io → sign up as a business → dashboard → API token (sign their DPA) |
| 7 | **Council lookups** (fixture register in tests; live adapters unconfirmed) | No key for the public TNMC / NMC / RCI / CoA / Bar Council TN&P / CMDA search pages. Confirm each request in a browser's network tab, then setting `verify_registry_adapters` (`confirmed: true` per adapter) and `verify_registry_live=true`. If a council gives you API credentials, send them and they go into VM env for verify | Each council's website / office; CoA has a captcha → stays manual review |
| 8 | **TURN relay** (STUN only today) | VM: `deploy/coturn/turnserver.conf` `static-auth-secret`; Edge secrets `ICE_PROVIDER=coturn`, `TURN_URLS` (e.g. `turn:turn.meiyiyal.com:3478,turns:turn.meiyiyal.com:5349`), `TURN_SECRET` (same value), optional `TURN_TTL` | You generate the secret (`openssl rand -hex 32`); coturn on the Mumbai VM + certbot for `turn.meiyiyal.com` |
| 9 | Optional **100ms** calls (built-in WebRTC today) | Edge secrets `HMS_ACCESS_KEY`, `HMS_APP_SECRET`, `HMS_TEMPLATE_ROLE` (optional `HMS_ROOM_ID`); Web build `VITE_CALL_PROVIDER=hms` | dashboard.100ms.live → Developer → Access key / App secret; Templates → role name |
| 10 | Optional **Google Maps** (OSM + Nominatim today) | Web build `VITE_MAPS_PROVIDER=google`, `VITE_GOOGLE_MAPS_BROWSER_KEY` (HTTP-referrer restricted to meiyiyal.com); Edge secret `GOOGLE_MAPS_SERVER_KEY` (Geocoding + Places only) | console.cloud.google.com → APIs & Services → Credentials; enable Maps JavaScript, Geocoding, Places |
| 11 | **Captcha** (provider `none` today) | Web build `VITE_CAPTCHA_PROVIDER=turnstile`, `VITE_CAPTCHA_SITE_KEY`; Dashboard → Auth → Bot and Abuse Protection → Turnstile + **secret**; setting `captcha_provider="turnstile"` | dash.cloudflare.com → Turnstile → Add site (meiyiyal.com, admin.meiyiyal.com) — free |
| 12 | **Voice search STT / LLM** (browser speech + mock LLM today) | VM env (agent) `AGENT_STT_PROVIDER` (`google` / `openai`), `AGENT_STT_KEY` (+ `AGENT_STT_URL`, `AGENT_STT_MODEL` for an OpenAI-compatible endpoint); `AGENT_LLM_PROVIDER` (`openai`-compatible), `AGENT_LLM_KEY`, `AGENT_LLM_URL`, `AGENT_LLM_MODEL`; Web build `VITE_AGENT_URL=https://agent.meiyiyal.com`, `VITE_STT=auto` | Google Cloud Speech-to-Text key (ta-IN) or any OpenAI-compatible provider's API page |
| 13 | **Production VAPID** push (`push_mock=true`, local dev keys) | Edge secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_JWK`, `VAPID_SUBJECT=mailto:you@meiyiyal.com`; Web build `VITE_VAPID_PUBLIC_KEY` (same public key); setting `push_mock=false` | Run `node scripts/gen-vapid-keys.mjs` yourself (keep the private key off git) |
| 14 | **SMTP sender** for sign-in e-mails (Mailpit locally) | Dashboard → Auth → SMTP Settings (host, port, user, password, from `no-reply@meiyiyal.com`); SPF/DKIM TXT in Hostinger DNS | Resend / Amazon SES / Zoho Mail → SMTP credentials + DNS records they show |
| 15 | **Google sign-in** (works locally without it) | Dashboard → Auth → Providers → Google (client ID + secret); redirect `https://<ref>.supabase.co/auth/v1/callback` | console.cloud.google.com → Credentials → OAuth client (Web) |
| 16 | **Small Linux VM** for agent, verify, coturn | Public IP → DNS (`agent`, `verify`, `turn`); setting `verify_service_url=https://verify.meiyiyal.com`; VM env `VERIFY_SERVICE_KEY` = setting `verify_service_key`, `VERIFY_HMAC_PEPPER` | Any Mumbai VM (2 vCPU / 4 GB), e.g. Hostinger VPS / AWS Lightsail |

**Reviews & decisions (not keys)**
| # | What | Where it lands | Who |
| --- | --- | --- | --- |
| 17 | **Lawyer review** of `/privacy`, `/terms` (en + ta) and advocate listings (BCI rules) | `src/features/legal/content.ts` (shown by `src/pages/Legal.tsx`); then remove the DRAFT banner | Your lawyer |
| 18 | **Grievance Officer** name, e-mail, phone, address | Web build `VITE_GRIEVANCE_NAME`, `VITE_GRIEVANCE_EMAIL`, `VITE_GRIEVANCE_PHONE`, `VITE_GRIEVANCE_ADDRESS` | You |
| 19 | **CA review**: GST on packs, **TDS on payouts**, wallet terms | settings `tds_enabled`, pack prices (Admin → Packs) | Your CA |
| 20 | **Real-phone test** (list in `docs/TEST-SCENARIOS.md` → "Real-phone and production-only checks": install, push, ring sound/vibration, mic/camera, calls over 4G + TURN, SMS OTP, payments) | Tick each row there | You, on Android + iPhone, after keys 3–13 |
| 21 | **5 Tamil area names** left empty on purpose: Denkanikottai (Krishnagiri), Madurai City (Madurai), Kumarapalayam (Namakkal), Sholingur (Ranipet), Trichy City (Tiruchirappalli) | `public.tn_areas.name_ta` (one UPDATE each, or tell me and I add a migration) | You |
| 22 | Which professions may ever auto-approve (all **off** at launch) | Admin → Settings → Auto-approve per profession | You |
| 23 | Referral reward rules (rewards disabled until then) | §19 | You |
| 24 | Wallet balance at account deletion: forfeit (current) or auto-refund | §21 | You |
| 25 | Rotate / pause the old Lovable Supabase project | Supabase dashboard | You |

**At launch (you, in the app)**
- [ ] Make yourself admin (SQL in README), open `/admin`, enrol an authenticator; add a second admin for recovery.
- [ ] Run `deploy/production/settings.sql`, then `deploy/production/check.sql` until only intended TODOs remain.
