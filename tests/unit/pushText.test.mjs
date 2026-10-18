// Push notification text, quiet hours and ask pacing. Run with `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEXTS, renderText, buildPayload, pickLang, quietNow, inr, istDate } from "../../supabase/functions/_shared/pushText.ts";
import { canAskFrom, snoozed, ASK_WAIT_MS } from "../../src/features/push/askPace.ts";

const ist = (s) => new Date(`${s}+05:30`);
const SAMPLE = { name: "Kavitha", mode: "video", seconds: 45, count: 3, amount: 1250.5, credits: 1300, kind: "upi", last4: "4321",
  cooling_until: "2026-10-21T10:30:00Z", until: "2026-10-25T04:30:00Z", reason: "timeout", title: { en: "First 10 consults", ta: "முதல் 10 ஆலோசனைகள்" },
  processing: 4, failed: 1, created: 5 };

test("every kind has natural text in English and Tamil, with no leftovers", () => {
  for (const kind of Object.keys(TEXTS)) for (const lang of ["en", "ta"]) {
    for (const params of [SAMPLE, {}]) {
      const r = renderText({ kind, params }, lang);
      assert.ok(r.title.trim() && r.body.trim(), `${kind}/${lang} empty`);
      for (const bad of ["undefined", "null", "NaN", "[object", "{"]) assert.ok(!(r.title + r.body).includes(bad), `${kind}/${lang}: "${bad}" in ${r.title} | ${r.body}`);
    }
    if (lang === "ta") assert.match(renderText({ kind, params: SAMPLE }, "ta").title + renderText({ kind, params: SAMPLE }, "ta").body, /[\u0B80-\u0BFF]/, `${kind} Tamil text has no Tamil letters`);
  }
});

test("every kind the database can create has a text", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261018120000_m9_push_notifications.sql", import.meta.url), "utf8");
  const kinds = new Set([...sql.matchAll(/notify(?:_admins)?\([^,]*?,?\s*'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]));
  for (const m of sql.matchAll(/INSERT INTO public\.notifications\([^)]*\)\s*VALUES \([^,]+, '([a-z_]+\.[a-z_]+)'/g)) kinds.add(m[1]);
  for (const k of ["request.incoming", "chat.message", "payout.failed", "admin.payout_batch", "test.ping", "summary.quiet", "payout.cooled", "feedback.reminder"]) assert.ok(kinds.has(k), `parser missed ${k}`);
  for (const k of kinds) assert.ok(TEXTS[k], `no text for ${k}`);
});

test("chat shows only the sender, never the message", () => {
  const r = renderText({ kind: "chat.message", params: { name: "Kavitha", body: "my BP is 180" } }, "en");
  assert.equal(r.title, "New message from Kavitha");
  assert.ok(!JSON.stringify(r).includes("180"));
  assert.equal(renderText({ kind: "chat.message", params: { name: "Kavitha", count: 3 } }, "en").body, "3 new messages. Tap to read.");
  assert.equal(renderText({ kind: "chat.message", params: { name: "கவிதா" } }, "ta").title, "கவிதா அனுப்பிய புதிய செய்தி");
});

test("ring payload is urgent with Accept / Decline in the device language", () => {
  const p = buildPayload({ id: "n1", kind: "request.incoming", params: SAMPLE, url: "/?ring=r1", tag: "req-r1", priority: "urgent" }, "ta");
  assert.equal(p.urgent, true); assert.equal(p.tag, "req-r1"); assert.equal(p.url, "/?ring=r1");
  assert.deepEqual(p.actions.map((a) => a.action), ["accept", "decline"]);
  assert.equal(p.actions[0].title, "ஏற்கவும்");
  assert.equal(p.title, "புதிய வீடியோ அழைப்பு கோரிக்கை");
  const q = buildPayload({ kind: "payout.paid", params: SAMPLE }, "en");
  assert.equal(q.urgent, false); assert.equal(q.actions, undefined);
  assert.equal(q.body, "₹1,250.5 sent to your UPI ••4321.");
  assert.ok(JSON.stringify(p).length < 3000, "payload stays well under the 4 KB push limit");
});

test("language: device, then profile, then Tamil", () => {
  assert.equal(pickLang("en", "ta"), "en");
  assert.equal(pickLang(null, "en"), "en");
  assert.equal(pickLang(undefined, null), "ta");
  assert.equal(pickLang("en-GB"), "en");
});

test("money and dates are Indian style, in IST", () => {
  assert.equal(inr(150000), "₹1,50,000");
  assert.equal(istDate("2026-10-25T20:00:00Z", "en"), "Mon, 26 Oct");   // 01:30 IST next day
  assert.equal(istDate("bad", "en"), "");
});

test("quiet hours 22:00–07:00 IST, across midnight", () => {
  const q = { on: true, from: "22:00", to: "07:00" };
  assert.equal(quietNow(q, ist("2026-10-18T21:59:00")), false);
  assert.equal(quietNow(q, ist("2026-10-18T22:00:00")), true);
  assert.equal(quietNow(q, ist("2026-10-19T03:00:00")), true);
  assert.equal(quietNow(q, ist("2026-10-19T06:59:00")), true);
  assert.equal(quietNow(q, ist("2026-10-19T07:00:00")), false);
  assert.equal(quietNow(undefined, ist("2026-10-19T23:30:00")), true, "default is on");
  assert.equal(quietNow({ on: false }, ist("2026-10-19T23:30:00")), false);
  assert.equal(quietNow({ on: true, from: "13:00", to: "15:00" }, ist("2026-10-19T14:00:00")), true, "same-day range");
  assert.equal(quietNow({ on: true, from: "09:00", to: "09:00" }, ist("2026-10-19T09:00:00")), false, "empty range");
  assert.equal(quietNow({ on: true, from: "x", to: "y" }, ist("2026-10-19T23:00:00")), true, "bad values use the default");
});

test("our ask card: first time, then 7 days after 'Not now', at most 3 times", () => {
  const t0 = Date.UTC(2026, 9, 18);
  assert.equal(canAskFrom(null, t0), true);
  let s = snoozed(null, t0);
  assert.equal(canAskFrom(s, t0 + ASK_WAIT_MS - 1), false);
  assert.equal(canAskFrom(s, t0 + ASK_WAIT_MS + 1), true);
  s = snoozed(snoozed(s, t0), t0);
  assert.equal(s.n, 3);
  assert.equal(canAskFrom(s, t0 + 100 * ASK_WAIT_MS), false);
});

test("English and Tamil have the same notification setting keys", () => {
  const en = JSON.parse(readFileSync(new URL("../../src/i18n/locales/en.json", import.meta.url), "utf8"));
  const ta = JSON.parse(readFileSync(new URL("../../src/i18n/locales/ta.json", import.meta.url), "utf8"));
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  for (const sec of ["push", "inbox"]) assert.deepEqual(keys(ta[sec]), keys(en[sec]), sec);
  assert.deepEqual(keys(ta.settings.notify), keys(en.settings.notify));
});
