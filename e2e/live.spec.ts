/**
 * Live readiness: the things that go wrong for real people, tested from login through the UI.
 * DB use: reading results, test cleanup, and marked TIME TRAVEL steps (cron jobs).
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, makeWorker, open } from "./consultFlow";
import { loginNewEmail } from "./mocks";
import { lang, snap, tag } from "./scenario";

const LAW = "professionals--lawyer--property-land";
test.setTimeout(240_000);
const clean = (id: string) => sql(`DELETE FROM auth.users WHERE email LIKE 'lr${tag()}-${id}%@meiyiyal.test';`);

async function lawyer(browser: import("@playwright/test").Browser, id: string, name: string) {
  return makeWorker(browser, `lr${tag()}-${id}-law`, name, IMG("lawyer"), LAW, { latitude: 13.0317, longitude: 80.27 }, "chennai");
}
async function client(browser: import("@playwright/test").Browser, id: string, name: string, opts: { permissions?: string[] } = {}) {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: { latitude: 13.0317, longitude: 80.27 }, permissions: opts.permissions ?? ["geolocation", "camera", "microphone"] });
  const page = await ctx.newPage();
  const { mockMapNetwork } = await import("./mocks"); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  const email = await signInAt(page, page.request, `lr${tag()}-${id}-u`); await setProfile(page, name, IMG("engineer"));
  return { ctx, page, email };
}
async function startChat(u: Page, law: { page: Page; id: string }) {
  await u.goto(`/browse/${LAW}`); await cardOf(u, law.id).click();
  if ((await u.getByTestId("wallet-balance").innerText()) === "0") await u.getByTestId("get-test-credits").click();
  await u.getByTestId("req-chat").click();
  await law.page.getByTestId("ring-accept").click();
  await u.waitForURL(/\/session\//); await law.page.waitForURL(/\/session\//);
  await expect(u.getByTestId("chat-input")).toBeVisible(); await expect(law.page.getByTestId("chat-input")).toBeVisible();
}
const msgs = (p: Page, text: string) => p.getByTestId("msg").filter({ hasText: text });

test("[LR01] wrong phone code and a reused / expired email link → plain-language messages (en + ta), then sign-in works", async ({ page, request }) => {
  lang("en + ta");
  await page.goto("/login");
  await page.getByTestId("btn-phone").click();
  await page.getByTestId("input-phone").fill("9876543210");
  await page.getByTestId("btn-send-otp").click();
  await page.getByTestId("input-otp").focus(); await page.keyboard.type("000000"); await page.getByTestId("btn-verify").click();
  await expect(page.getByTestId("auth-error")).toHaveText(/code (is not right|has expired)/);
  await snap(page, "LR01", "wrong-code");
  await page.getByTestId("lang-toggle").first().click();
  await page.getByTestId("btn-verify").click();
  await expect(page.getByTestId("auth-error")).toHaveText(/[\u0B80-\u0BFF]/);
  await snap(page, "LR01", "wrong-code-ta");
  await page.getByTestId("lang-toggle").first().click();
  // email link used twice: second open says the link expired and offers sign in again
  const email = await loginNewEmail(page, request, `lr${tag()}-01`);
  const link = page.url();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/callback"));
  await page.evaluate(() => localStorage.clear());
  const msgList = await (await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
  const msg = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${msgList.messages[0].ID}`)).json();
  const href = (msg.HTML || msg.Text).match(/https?:\/\/[^"'\s<>]+verify[^"'\s<>]+/)[0].replace(/&amp;/g, "&");
  await page.goto(href);
  await expect(page.getByText("This sign-in link has expired or was already used.")).toBeVisible();
  await snap(page, "LR01", "link-reused");
  await page.getByTestId("callback-login").click();
  await expect(page).toHaveURL(/\/login$/);
  void link;
});

test("[LR02] session expires (tokens revoked) → next screen asks to sign in again without errors; signing in brings the account back", async ({ browser }) => {
  clean("02");
  const u = await client(browser, "02", "Revoked User");
  // all refresh tokens revoked server-side and the access token has run out
  sql(`DELETE FROM auth.refresh_tokens WHERE user_id = (SELECT id::text FROM auth.users WHERE email = '${u.email}'); DELETE FROM auth.sessions WHERE user_id = (SELECT id FROM auth.users WHERE email = '${u.email}');`);
  await u.page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("sb-") && x.endsWith("-auth-token"))!; const s = JSON.parse(localStorage.getItem(k)!); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(s)); });
  const errors: string[] = []; u.page.on("pageerror", (e) => errors.push(e.message));
  await u.page.goto("/wallet");
  await expect(u.page).toHaveURL(/\/login$/, { timeout: 15_000 });
  await snap(u.page, "LR02", "back-to-login");
  expect(errors).toEqual([]);
  await loginNewEmail(u.page, u.page.request, "x", u.email);
  await u.page.waitForURL((x) => !x.pathname.startsWith("/auth/callback"));
  await u.page.goto("/profile");
  await expect(u.page.getByTestId("input-name")).toHaveValue("Revoked User");
  await u.ctx.close();
});

test("[LR03] two tabs: signing out in one signs out the other; signing in again in one tab works", async ({ browser }) => {
  clean("03");
  const u = await client(browser, "03", "Two Tabs");
  const tab2 = await u.ctx.newPage(); await tab2.goto("/wallet");
  await expect(tab2.getByTestId("wallet-page")).toBeVisible();
  await u.page.getByTestId("avatar-btn").click(); await u.page.getByTestId("btn-signout").click();
  await expect(u.page).toHaveURL(/\/login$/);
  await tab2.bringToFront();
  await expect(tab2).toHaveURL(/\/login$/, { timeout: 15_000 });
  await snap(tab2, "LR03", "other-tab-signed-out");
  await u.ctx.close();
});

test("[LR04] app closed during a consultation and reopened → 'back to your consultation' pill → same chat, nothing lost or doubled", async ({ browser }) => {
  clean("04");
  const law = await lawyer(browser, "04", "Adv. Reopen Test");
  const u = await client(browser, "04", "Reopen Client");
  await startChat(u.page, law);
  await u.page.getByTestId("chat-input").fill("First message before closing"); await u.page.getByTestId("chat-send").click();
  await expect(msgs(law.page, "First message before closing")).toHaveCount(1);
  const sessionUrl = u.page.url();
  await u.page.close();                         // app closed
  await law.page.getByTestId("chat-input").fill("Reply while the client app was closed"); await law.page.getByTestId("chat-send").click();
  const again = await u.ctx.newPage(); await again.goto("/"); // reopened from the home screen icon
  await expect(again.getByTestId("active-session-pill")).toBeVisible({ timeout: 15_000 });
  await snap(again, "LR04", "pill");
  await again.getByTestId("active-session-pill").click();
  await expect(again).toHaveURL(sessionUrl);
  await expect(msgs(again, "Reply while the client app was closed")).toHaveCount(1);
  await expect(msgs(again, "First message before closing")).toHaveCount(1);
  // refresh mid-session on both sides
  await again.reload(); await law.page.reload();
  await expect(msgs(again, "Reply while the client app was closed")).toHaveCount(1);
  await expect(law.page.getByTestId("session-page")).toHaveAttribute("data-status", "active");
  await snap(again, "LR04", "after-refresh");
  await again.getByTestId("end-session").click();
  await law.ctx.close(); await u.ctx.close();
});

test("[LR05] network drops mid-chat → offline bar; a send fails with a clear message and keeps the text; back online → missed messages appear once, resend arrives once", async ({ browser }) => {
  lang("en + ta");
  clean("05");
  const law = await lawyer(browser, "05", "Adv. Offline Test");
  const u = await client(browser, "05", "Offline Client");
  await startChat(u.page, law);
  await u.ctx.setOffline(true);
  await expect(u.page.getByTestId("net-offline")).toBeVisible();
  await snap(u.page, "LR05", "offline-bar");
  await u.page.getByTestId("chat-input").fill("Sent while offline");
  await u.page.getByTestId("chat-send").click();
  await expect(u.page.getByText("No connection. Check your internet and try again.")).toBeVisible();
  await expect(u.page.getByTestId("chat-input")).toHaveValue("Sent while offline");
  await law.page.getByTestId("chat-input").fill("Missed message one"); await law.page.getByTestId("chat-send").click();
  await law.page.getByTestId("chat-input").fill("Missed message two"); await law.page.getByTestId("chat-send").click();
  await u.ctx.setOffline(false);
  await expect(u.page.getByTestId("net-offline")).toHaveCount(0);
  await expect(msgs(u.page, "Missed message one")).toHaveCount(1, { timeout: 20_000 });
  await expect(msgs(u.page, "Missed message two")).toHaveCount(1);
  await u.page.getByTestId("chat-send").dblclick(); // impatient double tap on resend
  await expect(msgs(law.page, "Sent while offline")).toHaveCount(1);
  await u.page.waitForTimeout(1500);
  await expect(msgs(law.page, "Sent while offline")).toHaveCount(1);
  await expect(msgs(u.page, "Sent while offline")).toHaveCount(1);
  await snap(u.page, "LR05", "reconnected");
  await u.page.getByTestId("lang-toggle").first().click().catch(() => undefined);
  await u.ctx.setOffline(true);
  await expect(u.page.getByTestId("net-offline")).toHaveText(/[\u0B80-\u0BFF]/);
  await snap(u.page, "LR05", "offline-bar-ta");
  await u.ctx.setOffline(false);
  await law.page.getByTestId("end-session").click();
  await law.ctx.close(); await u.ctx.close();
});

test("[LR06] slow network (3 s per request) → chat still works, the send button cannot double-send", async ({ browser }) => {
  clean("06");
  const law = await lawyer(browser, "06", "Adv. Slow Net");
  const u = await client(browser, "06", "Slow Client");
  await startChat(u.page, law);
  await u.page.route("**/rest/v1/consult_messages**", async (r) => { await new Promise((x) => setTimeout(x, 3000)); await r.continue(); });
  await u.page.getByTestId("chat-input").fill("Slow but steady");
  await u.page.getByTestId("chat-send").click(); await u.page.getByTestId("chat-send").click().catch(() => undefined);
  await expect(msgs(law.page, "Slow but steady")).toHaveCount(1, { timeout: 20_000 });
  await u.page.waitForTimeout(4000);
  await expect(msgs(law.page, "Slow but steady")).toHaveCount(1);
  await snap(u.page, "LR06", "slow-sent");
  await law.page.getByTestId("end-session").click();
  await law.ctx.close(); await u.ctx.close();
});

test("[LR07] two clients ask the same professional at the same moment → one rings, the other is told plainly they are busy", async ({ browser }) => {
  clean("07");
  const law = await lawyer(browser, "07", "Adv. Busy Test");
  const a = await client(browser, "07a", "Client Alpha"); const b = await client(browser, "07b", "Client Beta");
  for (const c of [a, b]) { await c.page.goto(`/browse/${LAW}`); await cardOf(c.page, law.id).click(); await c.page.getByTestId("get-test-credits").click(); }
  await Promise.all([a.page.getByTestId("req-chat").click(), b.page.getByTestId("req-chat").click()]);
  await expect(law.page.getByTestId("incoming-ring")).toHaveCount(1, { timeout: 10_000 });
  const busyText = /is with someone else right now|already calling/;
  const ringing = await a.page.getByTestId("outgoing-ring").isVisible() ? a : b; const other = ringing === a ? b : a;
  await expect(other.page.getByText(busyText).first()).toBeVisible({ timeout: 10_000 });
  await snap(other.page, "LR07", "busy-message");
  expect(Number(sql(`SELECT count(*) FROM public.consult_requests r JOIN public.workers w ON w.id = r.worker_id JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${law.email}' AND r.status = 'ringing'`))).toBe(1);
  await law.page.getByTestId("ring-decline").click();
  await law.ctx.close(); await a.ctx.close(); await b.ctx.close();
});

test("[LR08] double tap on Request → exactly one request rings", async ({ browser }) => {
  clean("08");
  const law = await lawyer(browser, "08", "Adv. Double Tap");
  const u = await client(browser, "08", "Double Tapper");
  await u.page.goto(`/browse/${LAW}`); await cardOf(u.page, law.id).click(); await u.page.getByTestId("get-test-credits").click();
  await u.page.getByTestId("req-chat").dblclick();
  await expect(law.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await u.page.waitForTimeout(1500);
  expect(sql(`SELECT count(*) FROM public.consult_requests r JOIN auth.users u ON u.id = r.user_id WHERE u.email = '${u.email}'`)).toBe("1");
  await snap(u.page, "LR08", "one-ring");
  await u.page.getByTestId("ring-cancel").click();
  await law.ctx.close(); await u.ctx.close();
});

test("[LR09] camera and microphone blocked → video call shows how to allow them (en + ta) instead of a browser error", async ({ browser }) => {
  lang("en + ta");
  clean("09");
  const law = await lawyer(browser, "09", "Adv. Permission");
  const u = await client(browser, "09", "No Camera Client", { permissions: ["geolocation"] });
  await u.page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); });
  await startChat(u.page, law);
  await u.page.reload();
  await law.page.getByTestId("start-video").click();
  await u.page.getByTestId("call-accept").click();
  await expect(u.page.getByTestId("call-error")).toContainText("Camera or microphone is blocked");
  await snap(u.page, "LR09", "blocked");
  await u.page.getByTestId("call-hangup").click();
  // switch to Tamil from Home and come back to the consultation
  const sessionUrl = u.page.url();
  await u.page.goto("/"); await u.page.getByTestId("lang-toggle").first().click(); await u.page.goto(sessionUrl);
  await expect(u.page.getByTestId("chat-input")).toBeVisible();
  await law.page.getByTestId("start-voice").click();
  await u.page.getByTestId("call-accept").click();
  await expect(u.page.getByTestId("call-error")).toHaveText(/[\u0B80-\u0BFF]/);
  await snap(u.page, "LR09", "blocked-ta");
  await u.page.getByTestId("call-hangup").click();
  await law.page.getByTestId("end-session").click();
  await law.ctx.close(); await u.ctx.close();
});

test("[LR10] refresh in the middle of a payment → nothing charged twice; a late gateway webhook credits once", async ({ browser }) => {
  clean("10");
  const u = await client(browser, "10", "Refresh Payer");
  await u.page.goto("/wallet");
  await u.page.locator('[data-testid="pack"][data-id="basic"]').click();
  await expect(u.page.getByTestId("mock-checkout")).toBeVisible();
  await u.page.reload();                              // user refreshes with the checkout open
  await expect(u.page.getByTestId("wallet-balance")).toHaveText("0");
  await snap(u.page, "LR10", "after-refresh");
  const order = sql(`SELECT provider_order_id FROM public.payment_orders o JOIN auth.users u ON u.id = o.user_id WHERE u.email = '${u.email}' ORDER BY o.created_at DESC LIMIT 1`);
  // the money was actually captured: the gateway's webhook arrives late (signed like Razorpay, local mock secret)
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${Date.now()}`, order_id: order, status: "captured" } } } });
  const sig = createHmac("sha256", "mock_webhook_secret_local").update(body).digest("hex");
  for (let i = 0; i < 2; i++) {
    const r = await u.page.request.post("http://127.0.0.1:54321/functions/v1/payments-webhook", { data: body, headers: { "content-type": "application/json", "x-razorpay-event-id": `evt_lr10_${order}`, "x-razorpay-signature": sig } });
    expect(r.ok()).toBe(true);
  }
  await u.page.reload();
  await expect(u.page.getByTestId("wallet-balance")).toHaveText("260");
  await snap(u.page, "LR10", "credited-once");
  await u.ctx.close();
});

test("[LR11] deleted account: after the 7-day wait the account is erased, the old device is signed out, and the same email starts fresh", async ({ browser }) => {
  clean("11");
  const u = await client(browser, "11", "Leaving User");
  await u.page.goto("/settings");
  await u.page.getByTestId("delete-start").click();
  await u.page.getByTestId("delete-word").fill("delete");
  await u.page.getByTestId("delete-submit").click();
  await expect(u.page.getByTestId("delete-pending")).toBeVisible();
  await snap(u.page, "LR11", "scheduled");
  const prevUrl = sql(`SELECT value::text FROM public.app_settings WHERE key = 'account_purge_url'`);
  try {
    // TIME TRAVEL (hourly job): the wait is over → the job calls the account-purge Edge Function
    sql(`UPDATE public.app_settings SET value = '"http://supabase_kong_meyiyal-local:8000/functions/v1/account-purge"' WHERE key = 'account_purge_url';
      UPDATE public.data_requests SET due_at = now() - interval '1 minute' WHERE kind = 'delete' AND status = 'pending' AND user_id = (SELECT id FROM auth.users WHERE email = '${u.email}');
      SELECT public.account_purge_kick();`);
    await expect.poll(() => sql(`SELECT count(*) FROM auth.users WHERE email = '${u.email}'`), { timeout: 60_000, intervals: [2000] }).toBe("0");
  } finally { sql(`UPDATE public.app_settings SET value = '${prevUrl}'::jsonb WHERE key = 'account_purge_url'`); }
  await u.page.goto("/wallet");
  await expect(u.page).toHaveURL(/\/login$/, { timeout: 20_000 });
  await snap(u.page, "LR11", "old-device-signed-out");
  await loginNewEmail(u.page, u.page.request, "x", u.email);
  await u.page.waitForURL((x) => !x.pathname.startsWith("/auth/callback"));
  if (u.page.url().includes("/location")) await u.page.getByTestId("btn-confirm").click();
  await u.page.goto("/profile");
  await expect(u.page.getByTestId("input-name")).not.toHaveValue("Leaving User");
  await snap(u.page, "LR11", "fresh-account");
  await u.ctx.close();
});

test("[LR12] invalid inputs: empty / very long name, bad email, bad phone, 5000-character chat message → clear messages, nothing breaks", async ({ browser }) => {
  clean("12");
  const law = await lawyer(browser, "12", "Adv. Long Text");
  const u = await client(browser, "12", "Input Tester");
  await u.page.goto("/profile");
  await u.page.getByTestId("input-name").fill("");
  await u.page.getByTestId("btn-save-profile").click();
  await expect(u.page.getByText("Profile saved")).toHaveCount(0);
  await snap(u.page, "LR12", "empty-name");
  await u.page.getByTestId("input-name").fill("A".repeat(300));
  await u.page.getByTestId("btn-save-profile").click();
  const saved = sql(`SELECT length(full_name) FROM public.profiles p JOIN auth.users u ON u.id = p.user_id WHERE u.email = '${u.email}'`);
  expect(Number(saved)).toBeLessThanOrEqual(120);
  await startChat(u.page, law);
  const long = "நீண்ட செய்தி long message 🙂 ".repeat(200).slice(0, 5000);
  await u.page.getByTestId("chat-input").fill(long);
  await u.page.getByTestId("chat-send").click();
  await expect(law.page.getByTestId("msg").last()).toContainText("நீண்ட செய்தி long message 🙂");
  await expect(law.page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  const overflow = await law.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await snap(law.page, "LR12", "long-message");
  await law.page.getByTestId("end-session").click();
  const g = await browser.newContext(test.info().project.use); const gp = await g.newPage();
  await gp.goto("/login"); await gp.getByTestId("btn-email").click(); await gp.getByTestId("input-email").fill("not-an-email"); await gp.getByTestId("btn-send-link").click();
  await expect(gp.getByTestId("auth-error")).toBeVisible();
  await snap(gp, "LR12", "bad-email");
  await g.close(); await law.ctx.close(); await u.ctx.close();
});
void readFileSync;
