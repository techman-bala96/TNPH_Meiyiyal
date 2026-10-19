/**
 * M11 journeys not covered elsewhere: ICE/TURN fetch, SMS hook contract, Google maps adapter + Nominatim fallback,
 * bonus expiry, and the language-model mock in the voice agent. Through the UI unless marked "API".
 */
import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, makeWorker, open } from "./consultFlow";
import { lang, mockSpeech, mode, say, snap, tag } from "./scenario";

const API = "http://127.0.0.1:54321";
const LAW = "professionals--lawyer--property-land";
test.setTimeout(240_000);

async function pair(browser: import("@playwright/test").Browser, id: string) {
  const T = tag();
  sql(`DELETE FROM auth.users WHERE email LIKE 'j${T}-${id}-%@meiyiyal.test';`);
  const law = await makeWorker(browser, `j${T}-${id}-law`, `Adv. Journey ${id.toUpperCase()}${T}`, IMG("lawyer"), LAW, { latitude: 13.0317, longitude: 80.27 }, "chennai");
  const u = await open(browser);
  await signInAt(u.page, u.page.request, `j${T}-${id}-user`); await setProfile(u.page, `Client ${id.toUpperCase()}${T}`, IMG("engineer"));
  await u.page.goto(`/browse/${LAW}`); await cardOf(u.page, law.id).click();
  await u.page.getByTestId("get-test-credits").click();
  await u.page.getByTestId("req-chat").click();
  await law.page.getByTestId("ring-accept").click();
  await law.page.waitForURL(/\/session\//); await u.page.waitForURL(/\/session\//);
  return { law, u, close: async () => { await law.ctx.close(); await u.ctx.close(); } };
}

test("[J01] video call: both sides fetch ICE servers from the ice-servers function, then connect → STUN list (TURN when keys are set) used", async ({ browser }) => {
  const { law, u, close } = await pair(browser, "j01");
  const iceU = u.page.waitForResponse((r) => r.url().includes("/functions/v1/ice-servers"));
  const iceL = law.page.waitForResponse((r) => r.url().includes("/functions/v1/ice-servers"));
  await u.page.getByTestId("start-video").click();
  await law.page.getByTestId("call-accept").click();
  for (const r of [await iceU, await iceL]) {
    expect(r.status()).toBe(200);
    const body = await r.json(); expect(Array.isArray(body.iceServers ?? body.servers)).toBe(true);
  }
  await expect(u.page.getByTestId("call-view")).toHaveAttribute("data-state", "connected", { timeout: 25_000 });
  await snap(u.page, "J01", "connected");
  await u.page.getByTestId("call-hangup").click();
  await close();
});

test("[J02] ice-servers down (500) → call still connects with the built-in STUN fallback", async ({ browser }) => {
  const { law, u, close } = await pair(browser, "j02");
  for (const p of [u.page, law.page]) await p.route("**/functions/v1/ice-servers**", (r) => r.fulfill({ status: 500, body: "{}" }));
  await u.page.getByTestId("start-voice").click();
  await law.page.getByTestId("call-accept").click();
  await expect(u.page.getByTestId("call-view")).toHaveAttribute("data-state", "connected", { timeout: 25_000 });
  await expect(law.page.getByTestId("call-view")).toHaveAttribute("data-state", "connected", { timeout: 25_000 });
  await snap(law.page, "J02", "connected-fallback");
  await law.page.getByTestId("call-hangup").click();
  await close();
});

// Supabase Auth signs Send-SMS hook calls with the Standard Webhooks scheme. Locally the hook is not wired into
// Auth (fixed test OTPs), so this checks the function's contract exactly as Auth will call it in production.
const LOCAL_SECRET = "v1,whsec_" + Buffer.from("meiyiyal-local-sms-hook-secret").toString("base64");
function signed(body: string, ts = Math.floor(Date.now() / 1000), secret = LOCAL_SECRET) {
  const id = `msg_${randomUUID()}`;
  const key = Buffer.from(secret.replace(/^v1,whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}`, "content-type": "application/json" };
}
test("[J03] SMS hook: unsigned / wrong secret / stale → 401, bad OTP → 400, signed → 200 and the OTP SMS is queued (mock MSG91)", async ({ request }) => {
  mode("API (Auth → hook contract)");
  const url = `${API}/functions/v1/sms-hook`;
  const phone = `91900${Date.now().toString().slice(-7)}`;
  const body = JSON.stringify({ user: { phone }, sms: { otp: "482913" } });
  expect((await request.post(url, { data: body, headers: { "content-type": "application/json" } })).status()).toBe(401);
  expect((await request.post(url, { data: body, headers: signed(body, undefined, "v1,whsec_" + Buffer.from("wrong").toString("base64")) })).status()).toBe(401);
  expect((await request.post(url, { data: body, headers: signed(body, Math.floor(Date.now() / 1000) - 3600) })).status()).toBe(401);
  const bad = JSON.stringify({ user: { phone }, sms: { otp: "12" } });
  expect((await request.post(url, { data: bad, headers: signed(bad) })).status()).toBe(400);
  const ok = await request.post(url, { data: body, headers: signed(body) });
  expect(ok.status()).toBe(200);
  expect(sql(`SELECT template || ':' || (vars->>'otp') FROM public.sms_outbox WHERE phone = '${phone}' ORDER BY id DESC LIMIT 1`)).toBe("login_otp:482913");
});

test("[J04] maps: Google adapter (dev switch) answers search + autocomplete; when it fails the app falls back to OpenStreetMap", async ({ browser }) => {
  lang("en + ta");
  const u = await open(browser); const p = u.page;
  await p.addInitScript(() => localStorage.setItem("meiyiyal-maps", "google"));
  let google = 0; let failGoogle = false;
  await p.route("**/functions/v1/maps-geo**", async (r) => {
    google++;
    if (failGoogle) return r.fulfill({ status: 503, body: "{}" });
    const op = new URL(r.request().url()).searchParams.get("op");
    if (op === "autocomplete") return r.fulfill({ json: [{ place_id: "g-anna", text: "Anna Nagar Tower Park, Chennai" }] });
    if (op === "place") return r.fulfill({ json: { lat: "13.0878", lon: "80.2101", name: "Anna Nagar Tower Park", display_name: "Anna Nagar Tower Park, Anna Nagar, Chennai, Tamil Nadu" } });
    if (op === "search") return r.fulfill({ json: [{ lat: "13.0878", lon: "80.2101", name: "Anna Nagar Tower Park", display_name: "Anna Nagar Tower Park, Anna Nagar, Chennai, Tamil Nadu" }] });
    if (op === "reverse") return r.fulfill({ json: { lat: "13.0878", lon: "80.2101", name: "Tower Park", display_name: "Tower Park, Anna Nagar, Chennai, Tamil Nadu", address: { suburb: "Anna Nagar", city: "Chennai", state: "Tamil Nadu" } } });
    return r.fulfill({ status: 404, body: "{}" });
  });
  await signInAt(p, p.request, `j${tag()}-j04`);
  await p.getByTestId("loc-chip").click();
  await p.getByTestId("loc-search").fill("Anna Nagar Tow");
  await expect(p.getByTestId("suggest-hit").first()).toContainText("Anna Nagar Tower Park");   // autocomplete is Google-only
  await snap(p, "J04", "google-autocomplete");
  await p.getByTestId("suggest-hit").first().click();
  await expect(p.getByTestId("sheet-place")).toContainText(/Anna Nagar/);
  expect(google).toBeGreaterThan(0);
  // Google down → search goes to Nominatim (fixture) and still finds the beach
  failGoogle = true;
  await p.getByTestId("loc-search").fill("Marina beach"); await p.getByTestId("loc-search").press("Enter");
  await expect(p.getByTestId("place-hit").first()).toContainText("Marina Beach");
  await snap(p, "J04", "fallback-osm");
  await p.getByTestId("lang-toggle").first().click();
  await expect(p.getByTestId("btn-confirm")).toContainText("உறுதிசெய்");
  await snap(p, "J04", "fallback-osm-ta");
  await u.ctx.close();
});

test("[J05] bonus credits: shown with expiry date; a week before → reminder in the inbox; after expiry → removed with a ledger line", async ({ browser }) => {
  const u = await open(browser); const p = u.page;
  const email = await signInAt(p, p.request, `j${tag()}-j05`);
  await p.goto("/wallet");
  await p.locator('[data-testid="pack"][data-id="value"]').click();
  await p.getByTestId("mock-pay").click();
  await expect(p.getByTestId("pay-result")).toHaveAttribute("data-status", "paid");
  await expect(p.getByTestId("wallet-balance")).toHaveText("530");
  await p.reload();
  await expect(p.getByTestId("wallet-bonus")).toContainText("31");
  await snap(p, "J05", "bonus-chip");
  // TIME TRAVEL (daily 00:30 IST job): the bonus now expires in 3 days → reminder
  const W = `(SELECT w.id FROM public.wallets w JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${email}')`;
  sql(`UPDATE public.bonus_grants SET expires_at = now() + interval '3 days' WHERE wallet_id = ${W}; SELECT public.bonus_expire();`);
  await p.goto("/notifications");
  await expect(p.getByTestId("inbox-item").filter({ hasText: /31/ }).first()).toBeVisible();
  await snap(p, "J05", "reminder");
  // TIME TRAVEL: expiry passed
  sql(`UPDATE public.bonus_grants SET expires_at = now() - interval '1 minute' WHERE wallet_id = ${W}; SELECT public.bonus_expire();`);
  await p.goto("/wallet");
  await expect(p.getByTestId("wallet-balance")).toHaveText("499");
  await expect(p.getByTestId("ledger-row").filter({ hasText: "Bonus credits expired" })).toBeVisible();
  await expect(p.getByTestId("wallet-bonus")).toHaveCount(0);
  await snap(p, "J05", "expired");
  await u.ctx.close();
});

test("[J06] voice agent through the language-model adapter (mock): 'I can't sleep at night' (unknown to the grammar) → counselling; Tamil vet request → Tamil reply", async ({ browser }) => {
  lang("en + ta");
  const u = await open(browser); const p = u.page; await mockSpeech(p);
  await signInAt(p, p.request, `j${tag()}-j06`);
  await p.goto("/");
  const parse = p.waitForResponse((r) => r.url().includes("/agent/parse"));
  await p.getByTestId("mic-toggle").click();
  await say(p, "I can't sleep at night");
  const body = await (await parse).json();
  expect(JSON.stringify(body)).toMatch(/psychology-counselling/);
  expect(body.source).toBe("llm:mock"); // the grammar alone did not know it; the language-model adapter answered
  await expect(p).toHaveURL(/\/browse\/professionals--doctor--psychology-counselling/);
  await snap(p, "J06", "sleep-counselling");
  await p.goto("/"); await p.getByTestId("lang-toggle").first().click();
  await p.getByTestId("mic-toggle").click();
  await say(p, "என் நாய்க்கு உடம்பு சரியில்லை");
  await expect(p).toHaveURL(/\/browse\/professionals--doctor--veterinary/);
  await expect(p.getByTestId("voice-reply")).toContainText(/[\u0B80-\u0BFF]/);
  await snap(p, "J06", "dog-vet-ta");
  await u.ctx.close();
});
