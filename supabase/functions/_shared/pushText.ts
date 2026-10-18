// Notification text in English and Tamil, shared by the push-send Edge Function (lock-screen text),
// the in-app bell (src/features/push) and the unit tests. Pure TypeScript: no Deno or browser APIs.
// Lock screens are public, so texts carry first names, amounts and dates only. Never message or case text.

export type Lang = "en" | "ta";
export type Params = Record<string, unknown>;
export type PushNote = { id?: string; kind: string; params?: Params | null; url?: string; tag?: string | null; count?: number; priority?: string };
export type Rendered = { title: string; body: string };
export type PushPayload = Rendered & { id?: string; kind: string; url: string; tag: string; urgent: boolean; lang: Lang; actions?: { action: string; title: string }[] };

const MODE: Record<Lang, Record<string, string>> = {
  en: { chat: "chat", voice: "voice call", video: "video call" },
  ta: { chat: "அரட்டை", voice: "குரல் அழைப்பு", video: "வீடியோ அழைப்பு" },
};
const SOMEONE: Record<Lang, string> = { en: "Someone", ta: "ஒருவர்" };

export function inr(n: unknown): string {
  const v = Number(n ?? 0);
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number.isFinite(v) ? v : 0);
}
export function istDate(iso: unknown, lang: Lang): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ta" ? "ta-IN" : "en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(d);
}
const acct = (p: Params, lang: Lang) => {
  const l4 = typeof p.last4 === "string" && p.last4 ? ` ••${p.last4}` : "";
  if (p.kind === "upi") return `UPI${l4}`;
  return lang === "ta" ? `வங்கிக் கணக்கு${l4}` : `bank account${l4}`;
};
const title18 = (t: unknown, lang: Lang) => {
  if (t && typeof t === "object") { const o = t as Record<string, string>; return o[lang] || o.en || ""; }
  return typeof t === "string" ? t : "";
};

type T = (p: Params, lang: Lang, n: number) => Rendered;
const L = (en: T, ta: T): Record<Lang, T> => ({ en, ta });

/** Every kind needs both languages. tests/unit/pushText.test.mjs checks that. */
export const TEXTS: Record<string, Record<Lang, T>> = {
  "request.incoming": L(
    (p) => ({ title: `New ${MODE.en[String(p.mode)] ?? "consult"} request`, body: `${p.name ?? SOMEONE.en} wants to consult you. Tap to answer within ${p.seconds ?? 45} seconds.` }),
    (p) => ({ title: `புதிய ${MODE.ta[String(p.mode)] ?? "ஆலோசனை"} கோரிக்கை`, body: `${p.name ?? SOMEONE.ta} உங்களிடம் ஆலோசனை கேட்கிறார். ${p.seconds ?? 45} வினாடிக்குள் பதில் சொல்ல தட்டுங்கள்.` })),
  "request.missed": L(
    (p) => ({ title: "Missed request", body: `You missed a ${MODE.en[String(p.mode)] ?? "consult"} request from ${p.name ?? SOMEONE.en}.` }),
    (p) => ({ title: "தவறிய கோரிக்கை", body: `${p.name ?? SOMEONE.ta} அனுப்பிய ${MODE.ta[String(p.mode)] ?? "ஆலோசனை"} கோரிக்கையை நீங்கள் எடுக்கவில்லை.` })),
  "request.accepted": L(
    (p) => ({ title: `${p.name ?? SOMEONE.en} accepted`, body: "Your consultation has started. Tap to open." }),
    (p) => ({ title: `${p.name ?? SOMEONE.ta} ஏற்றுக்கொண்டார்`, body: "உங்கள் ஆலோசனை தொடங்கிவிட்டது. திறக்க தட்டுங்கள்." })),
  "request.declined": L(
    (p) => ({ title: p.reason === "timeout" ? `No answer from ${p.name ?? SOMEONE.en}` : `${p.name ?? SOMEONE.en} couldn't take it`, body: "Please try another professional." }),
    (p) => ({ title: p.reason === "timeout" ? `${p.name ?? SOMEONE.ta} பதில் அளிக்கவில்லை` : `${p.name ?? SOMEONE.ta} இப்போது எடுக்க முடியவில்லை`, body: "வேறு ஒரு நிபுணரை முயற்சி செய்யுங்கள்." })),
  "call.incoming": L(
    (p) => ({ title: `${p.name ?? SOMEONE.en} is calling`, body: `Incoming ${MODE.en[String(p.mode)] ?? "call"}. Tap to answer.` }),
    (p) => ({ title: `${p.name ?? SOMEONE.ta} அழைக்கிறார்`, body: `${MODE.ta[String(p.mode)] ?? "அழைப்பு"} வருகிறது. பதில் சொல்ல தட்டுங்கள்.` })),
  "chat.message": L(
    (p, _l, n) => ({ title: `New message from ${p.name ?? SOMEONE.en}`, body: n > 1 ? `${n} new messages. Tap to read.` : "Tap to read." }),
    (p, _l, n) => ({ title: `${p.name ?? SOMEONE.ta} அனுப்பிய புதிய செய்தி`, body: n > 1 ? `${n} புதிய செய்திகள். படிக்க தட்டுங்கள்.` : "படிக்க தட்டுங்கள்." })),
  "session.credits_out": L(
    (p) => ({ title: "Consultation ended", body: `Your credits ran out. Add credits to continue with ${p.name ?? "your professional"}.` }),
    (p) => ({ title: "ஆலோசனை முடிந்தது", body: `உங்கள் கிரெடிட் தீர்ந்துவிட்டது. ${p.name ?? "நிபுணர்"} உடன் தொடர கிரெடிட் சேர்க்கவும்.` })),
  "payment.paid": L(
    (p) => ({ title: "Payment successful", body: `${inr(p.amount)} paid. ${p.credits ?? 0} credits added to your wallet.` }),
    (p) => ({ title: "பணம் செலுத்தப்பட்டது", body: `${inr(p.amount)} செலுத்தினீர்கள். உங்கள் wallet-ல் ${p.credits ?? 0} கிரெடிட் சேர்க்கப்பட்டது.` })),
  "payment.failed": L(
    (p) => ({ title: "Payment didn't go through", body: `Your ${inr(p.amount)} payment failed. Please try again.` }),
    (p) => ({ title: "பணம் செலுத்த முடியவில்லை", body: `உங்கள் ${inr(p.amount)} பணம் செலுத்தல் தோல்வியடைந்தது. மீண்டும் முயற்சி செய்யுங்கள்.` })),
  "payment.refunded": L(
    (p) => ({ title: "Refund processed", body: `${inr(p.amount)} has been refunded.` }),
    (p) => ({ title: "பணம் திருப்பி அனுப்பப்பட்டது", body: `${inr(p.amount)} உங்களுக்குத் திருப்பி அனுப்பப்பட்டது.` })),
  "payout.paid": L(
    (p, l) => ({ title: "Payout sent", body: `${inr(p.amount)} sent to your ${acct(p, l)}.` }),
    (p, l) => ({ title: "பணம் அனுப்பப்பட்டது", body: `${inr(p.amount)} உங்கள் ${acct(p, l)}-க்கு அனுப்பப்பட்டது.` })),
  "payout.failed": L(
    (p) => ({ title: "Payout didn't go through", body: `${inr(p.amount)} is back in your balance. Please check your payout account.` }),
    (p) => ({ title: "பணம் அனுப்ப முடியவில்லை", body: `${inr(p.amount)} உங்கள் இருப்பில் திரும்ப வந்துவிட்டது. உங்கள் கணக்கு விவரங்களைச் சரிபாருங்கள்.` })),
  "payout.review": L(
    (p) => ({ title: "Payout under review", body: `Your ${inr(p.amount)} payout is being checked. We'll send it soon.` }),
    (p) => ({ title: "பணம் சரிபார்ப்பில் உள்ளது", body: `உங்கள் ${inr(p.amount)} சரிபார்க்கப்படுகிறது. விரைவில் அனுப்புவோம்.` })),
  "payout.hold": L(
    () => ({ title: "Payouts paused", body: "Your payouts are on hold for now. Please contact support." }),
    () => ({ title: "பணம் வழங்கல் நிறுத்தப்பட்டது", body: "உங்கள் பணம் வழங்கல் தற்காலிகமாக நிறுத்தப்பட்டுள்ளது. உதவிக்கு எங்களைத் தொடர்பு கொள்ளுங்கள்." })),
  "payout.resumed": L(
    () => ({ title: "Payouts resumed", body: "Your earnings will go out in the next Monday payout." }),
    () => ({ title: "பணம் வழங்கல் மீண்டும் தொடங்கியது", body: "அடுத்த திங்கள்கிழமை உங்கள் வருமானம் அனுப்பப்படும்." })),
  "payout.cooled": L(
    (p, l) => ({ title: "Account ready for payouts", body: `Your ${acct(p, l)} is ready. Payouts go out every Monday.` }),
    (p, l) => ({ title: "கணக்கு தயார்", body: `உங்கள் ${acct(p, l)} தயார். ஒவ்வொரு திங்கள்கிழமையும் பணம் அனுப்பப்படும்.` })),
  "payout_account.verified": L(
    (p, l) => { const d = istDate(p.cooling_until, l); return { title: "Account verified", body: `Your ${acct(p, l)} is verified.${d ? ` Payouts start after ${d}.` : ""}` }; },
    (p, l) => { const d = istDate(p.cooling_until, l); return { title: "கணக்கு சரிபார்க்கப்பட்டது", body: `உங்கள் ${acct(p, l)} சரிபார்க்கப்பட்டது.${d ? ` ${d}-க்குப் பிறகு பணம் அனுப்பப்படும்.` : ""}` }; }),
  "payout_account.rejected": L(
    (p, l) => ({ title: "Account not verified", body: `We couldn't verify your ${acct(p, l)}. Please check the details and add it again.` }),
    (p, l) => ({ title: "கணக்கைச் சரிபார்க்க முடியவில்லை", body: `உங்கள் ${acct(p, l)}-ஐச் சரிபார்க்க முடியவில்லை. விவரங்களைச் சரிபார்த்து மீண்டும் சேர்க்கவும்.` })),
  "payout_account.review": L(
    (p, l) => ({ title: "Account under review", body: `We're checking your ${acct(p, l)}. We'll let you know when it's done.` }),
    (p, l) => ({ title: "கணக்கு சரிபார்ப்பில் உள்ளது", body: `உங்கள் ${acct(p, l)}-ஐச் சரிபார்க்கிறோம். முடிந்ததும் தெரிவிப்போம்.` })),
  "verify.approved": L(
    () => ({ title: "You're verified!", body: "Go online to start getting requests." }),
    () => ({ title: "நீங்கள் சரிபார்க்கப்பட்டீர்கள்!", body: "கோரிக்கைகள் பெற ஆன்லைனுக்கு வாருங்கள்." })),
  "verify.rejected": L(
    () => ({ title: "Application not approved", body: "Tap to see the reason and how to appeal." }),
    () => ({ title: "விண்ணப்பம் ஏற்கப்படவில்லை", body: "காரணத்தையும் மேல்முறையீடு செய்யும் வழியையும் பார்க்க தட்டுங்கள்." })),
  "verify.needs_info": L(
    () => ({ title: "One more step", body: "We need a little more information. Tap to update your application." }),
    () => ({ title: "இன்னும் ஒரு படி", body: "இன்னும் சில விவரங்கள் தேவை. உங்கள் விண்ணப்பத்தைப் புதுப்பிக்க தட்டுங்கள்." })),
  "appeal.upheld": L(
    () => ({ title: "Appeal reviewed", body: "After review, the decision stays the same. Tap for details." }),
    () => ({ title: "மேல்முறையீடு பரிசீலிக்கப்பட்டது", body: "பரிசீலனைக்குப் பிறகும் முடிவு மாறவில்லை. விவரங்களுக்கு தட்டுங்கள்." })),
  "account.blocked": L(
    (p, l) => { const d = istDate(p.until, l); return { title: "Account paused", body: d ? `You can't go online until ${d}. Tap for details.` : "Your account is paused. Tap for details." }; },
    (p, l) => { const d = istDate(p.until, l); return { title: "கணக்கு தற்காலிகமாக நிறுத்தப்பட்டது", body: d ? `${d} வரை நீங்கள் ஆன்லைனுக்கு வர முடியாது. விவரங்களுக்கு தட்டுங்கள்.` : "உங்கள் கணக்கு நிறுத்தப்பட்டுள்ளது. விவரங்களுக்கு தட்டுங்கள்." }; }),
  "account.unblocked": L(
    () => ({ title: "You can go online again", body: "Your account is active again." }),
    () => ({ title: "மீண்டும் ஆன்லைனுக்கு வரலாம்", body: "உங்கள் கணக்கு மீண்டும் செயல்படுகிறது." })),
  "reward.earned": L(
    (p, l) => ({ title: "🏅 New award", body: `You earned "${title18(p.title, l) || "a new award"}". Well done!` }),
    (p, l) => ({ title: "🏅 புதிய விருது", body: `"${title18(p.title, l) || "புதிய விருது"}" பெற்றீர்கள். வாழ்த்துகள்!` })),
  "feedback.reminder": L(
    (p) => ({ title: "How was your consultation?", body: `Rate your session with ${p.name ?? "your professional"}. It helps others choose.` }),
    (p) => ({ title: "ஆலோசனை எப்படி இருந்தது?", body: `${p.name ?? "நிபுணர்"} உடனான உங்கள் அனுபவத்தை மதிப்பிடுங்கள். இது மற்றவர்களுக்கு உதவும்.` })),
  "admin.payout_review": L(
    (p) => ({ title: "Payout needs review", body: `${inr(p.amount)} payout for ${p.name ?? "a worker"} is waiting for approval.` }),
    (p) => ({ title: "பணம் வழங்கல் சரிபார்க்க வேண்டும்", body: `${p.name ?? "ஒரு நிபுணர்"}-க்கான ${inr(p.amount)} ஒப்புதலுக்காகக் காத்திருக்கிறது.` })),
  "admin.account_review": L(
    (p) => ({ title: "Payout account needs review", body: `${p.name ?? "A worker"}'s payout account needs a manual check.` }),
    (p) => ({ title: "கணக்கு சரிபார்க்க வேண்டும்", body: `${p.name ?? "ஒரு நிபுணர்"} அவர்களின் கணக்கை நேரில் சரிபார்க்க வேண்டும்.` })),
  "admin.verify_queue": L(
    (_p, _l, n) => ({ title: "Verification waiting", body: n > 1 ? `${n} verification cases need review.` : "A verification case needs review." }),
    (_p, _l, n) => ({ title: "சரிபார்ப்பு காத்திருக்கிறது", body: n > 1 ? `${n} சரிபார்ப்புகள் பரிசீலனைக்குக் காத்திருக்கின்றன.` : "ஒரு சரிபார்ப்பு பரிசீலனைக்குக் காத்திருக்கிறது." })),
  "admin.payout_batch": L(
    (p) => ({ title: "Payout batch done", body: `${p.processing ?? 0} sent, ${p.failed ?? 0} failed, ${p.created ?? 0} new.` }),
    (p) => ({ title: "பணம் வழங்கல் முடிந்தது", body: `${p.processing ?? 0} அனுப்பப்பட்டது, ${p.failed ?? 0} தோல்வி, ${p.created ?? 0} புதியவை.` })),
  "admin.complaint": L(
    (_p, _l, n) => ({ title: "New complaint", body: n > 1 ? `${n} complaints to review.` : "A complaint needs review." }),
    (_p, _l, n) => ({ title: "புதிய புகார்", body: n > 1 ? `${n} புகார்கள் பரிசீலனைக்கு உள்ளன.` : "ஒரு புகார் பரிசீலனைக்கு உள்ளது." })),
  "test.ping": L(
    () => ({ title: "Notifications are working ✅", body: "This is how Meiyiyal alerts will look." }),
    () => ({ title: "அறிவிப்புகள் வேலை செய்கின்றன ✅", body: "மெய்யியல் அறிவிப்புகள் இப்படித்தான் வரும்." })),
  "summary.quiet": L(
    (p) => { const n = Number(p.count ?? 0); return { title: "While you were away", body: n === 1 ? "You have 1 new update." : `You have ${n} new updates.` }; },
    (p) => ({ title: "நீங்கள் இல்லாதபோது", body: `உங்களுக்கு ${Number(p.count ?? 0)} புதிய அறிவிப்புகள் உள்ளன.` })),
};
const FALLBACK = L(() => ({ title: "Meiyiyal", body: "You have a new update." }), () => ({ title: "மெய்யியல்", body: "உங்களுக்கு ஒரு புதிய அறிவிப்பு உள்ளது." }));

export function pickLang(...c: (string | null | undefined)[]): Lang {
  for (const x of c) { if (x === "en" || x === "ta") return x; if (x?.startsWith("en")) return "en"; if (x?.startsWith("ta")) return "ta"; }
  return "ta";   // Tamil Nadu first
}

export function renderText(n: PushNote, lang: Lang): Rendered {
  const p = (n.params ?? {}) as Params;
  const count = Number(p.count ?? n.count ?? 1) || 1;
  return (TEXTS[n.kind] ?? FALLBACK)[lang](p, lang, count);
}

const ACTIONS: Record<Lang, { accept: string; decline: string }> = { en: { accept: "Accept", decline: "Decline" }, ta: { accept: "ஏற்கவும்", decline: "மறுக்கவும்" } };

/** What the service worker receives. Keep it small (push services cap payloads at about 4 KB). */
export function buildPayload(n: PushNote, lang: Lang): PushPayload {
  const r = renderText(n, lang);
  const out: PushPayload = { ...r, id: n.id, kind: n.kind, url: n.url ?? "/", tag: n.tag ?? n.kind, urgent: n.priority === "urgent", lang };
  if (n.kind === "request.incoming") out.actions = [{ action: "accept", title: ACTIONS[lang].accept }, { action: "decline", title: ACTIONS[lang].decline }];
  return out;
}

// ---------- quiet hours (same rule as SQL push_quiet_now) ----------
export type Quiet = { on?: boolean; from?: string; to?: string };
export const QUIET_DEFAULT: Required<Quiet> = { on: true, from: "22:00", to: "07:00" };
const mins = (s: string | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); if (!m) return null; const h = +m[1], mm = +m[2]; return h < 24 && mm < 60 ? h * 60 + mm : null; };
/** Minutes since midnight in IST. */
export const istMinutes = (d: Date) => Math.floor(((d.getTime() / 60000) + 330) % 1440 + 1440) % 1440;
export function quietNow(q: Quiet | null | undefined, at: Date = new Date()): boolean {
  const on = q?.on ?? QUIET_DEFAULT.on; if (!on) return false;
  let f = mins(q?.from), t = mins(q?.to);
  if (f === null || t === null) { f = mins(QUIET_DEFAULT.from)!; t = mins(QUIET_DEFAULT.to)!; }
  if (f === t) return false;
  const m = istMinutes(at);
  return f < t ? m >= f && m < t : m >= f || m < t;
}
