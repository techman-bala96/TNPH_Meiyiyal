import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";
import { CHENNAI, cardOf, makeWorker, open } from "./consultFlow";

// Push alerts (M9). Headless Chromium has no real push service, so the browser subscription is stubbed
// (PushManager.subscribe/getSubscription); everything after that is real: device saved via RPC, DB triggers,
// pg_net -> push-send (mock mode) -> push_status 'sent', and the service worker's push handler (fed via CDP).
const SHOTS = process.env.PUSH_SHOTS_DIR ?? process.env.SHOTS_DIR ?? "../meyiyal/screens";
const pshot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage });

async function stubPush(ctx: BrowserContext) {
  await ctx.grantPermissions(["geolocation", "camera", "microphone", "notifications"]);
  await ctx.addInitScript(() => {
    navigator.serviceWorker?.addEventListener("message", (e) => { const w = window as unknown as { __swMsgs?: unknown[] }; (w.__swMsgs ??= []).push(e.data); });
    if (typeof PushManager === "undefined") return;
    // headless Chromium reports Notification.permission "denied" even when granted; a real phone says "granted" after Allow
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    const keys = { p256dh: "B" + "Kp9Y2kGxL0fWq3zN5tV7rA1sD4hJ6mP8uE2cX0bI9oQwRyT3nM5vL7kH1gF4dS6aZ8xC0vB2nM4qW6eR8tY0uI", auth: "8kRtYv2wQx5zN1mB3cV7hA" };
    const mk = (endpoint: string) => ({
      endpoint, expirationTime: null, options: { userVisibleOnly: true },
      toJSON: () => ({ endpoint, expirationTime: null, keys }), getKey: () => null,
      unsubscribe: async () => { localStorage.removeItem("e2e.pushSub"); return true; },
    });
    PushManager.prototype.subscribe = async function () {
      const e = `https://fcm.googleapis.com/fcm/send/e2e-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("e2e.pushSub", e); return mk(e) as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      const e = localStorage.getItem("e2e.pushSub"); return (e ? mk(e) : null) as unknown as PushSubscription | null;
    };
  });
}
const uid = (email: string) => sql(`SELECT id FROM auth.users WHERE email='${email}'`);
const notes = (email: string, kind: string) => sql(`SELECT count(*) FROM public.notifications n JOIN auth.users u ON u.id=n.user_id WHERE u.email='${email}' AND n.kind='${kind}'`);
const noteStatus = (email: string, kind: string) => sql(`SELECT coalesce(string_agg(push_status,','),'') FROM public.notifications n JOIN auth.users u ON u.id=n.user_id WHERE u.email='${email}' AND n.kind='${kind}'`);
const devices = (email: string) => Number(sql(`SELECT count(*) FROM public.push_subscriptions s JOIN auth.users u ON u.id=s.user_id WHERE u.email='${email}'`));
const quietOff = (email: string) => sql(`UPDATE public.profiles SET prefs = jsonb_set(coalesce(prefs,'{}'::jsonb), '{notify}', coalesce(prefs->'notify','{}'::jsonb) || '{"quiet":{"on":false,"from":"22:00","to":"07:00"}}') WHERE user_id='${uid(email)}';`);

/** Feed a push message into the page's service worker (what the phone's push service would do). */
async function deliverPush(page: Page, payload: Record<string, unknown>) {
  const cdp = await page.context().newCDPSession(page);
  const regId = new Promise<string>((res) => cdp.on("ServiceWorker.workerRegistrationUpdated", (e: { registrations: { registrationId: string; scopeURL: string; isDeleted: boolean }[] }) => {
    const r = e.registrations.find((x) => !x.isDeleted && x.scopeURL === "http://localhost:8080/"); if (r) res(r.registrationId);
  }));
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: "http://localhost:8080", registrationId: await regId, data: JSON.stringify(payload) });
}
const shownTitles = (page: Page) => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.getNotifications())?.map((n) => `${n.title}|${n.body}|${n.tag}`) ?? [];
});

test.setTimeout(240_000);

test("worker alerts: no prompt on load, ask card after approval, device saved, ring + test alerts delivered, SW shows it, bell + inbox", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'p-%@meiyiyal.test';`);

  // a first visit never asks
  const first = await open(browser);
  await first.page.goto("/");
  await expect(first.page.getByTestId("worker-card").or(first.page.getByRole("heading").first())).toBeVisible();
  await expect(first.page.getByTestId("push-ask-card")).toHaveCount(0);
  expect(await first.page.evaluate(() => Notification.permission)).not.toBe("granted"); // never asked
  await first.ctx.close();

  const law = await makeWorker(browser, "p-lawyer", "Adv. Kavitha Raman", IMG("lawyer"), "professionals--lawyer--property-land", CHENNAI, "chennai");
  quietOff(law.email); // run at any hour of the day
  await stubPush(law.ctx);
  await law.page.reload();
  const ask = law.page.getByTestId("push-ask-card");
  await expect(ask).toBeVisible();
  await expect(ask).toHaveAttribute("data-reason", "worker");
  await expect(law.page.getByTestId("go-online")).toBeChecked(); // card sits in the page; nothing covers the switch
  await pshot(law.page, "01-worker-ask-card");
  await law.page.getByTestId("push-ask-allow").click();
  await expect(law.page.getByText("Alerts turned on")).toBeVisible({ timeout: 20_000 }); // first use registers the service worker
  await expect(ask).toHaveCount(0);
  await expect.poll(() => devices(law.email)).toBe(1);
  expect(sql(`SELECT lang||'/'||platform FROM public.push_subscriptions s JOIN auth.users u ON u.id=s.user_id WHERE u.email='${law.email}'`)).toMatch(/^en\/(android|desktop)$/);

  // service worker receives a push message and tells the open app (the phone banner itself is checked in the Chrome test below)
  await deliverPush(law.page, { id: "e2e-1", kind: "payout.paid", lang: "en", title: "Money sent", body: "₹1,500 sent to your bank ••1234.", url: "/earnings", tag: "e2e-pay", urgent: false });
  await expect.poll(() => law.page.evaluate(() => JSON.stringify((window as unknown as { __swMsgs?: unknown[] }).__swMsgs ?? []))).toContain('"title":"Money sent"');

  // client sends a request -> worker's phone alert is sent (mock push service)
  const u = await open(browser);
  await stubPush(u.ctx);
  const uEmail = await signInAt(u.page, u.page.request, "p-user");
  await setProfile(u.page, "Priya Natarajan", IMG("engineer"));
  await u.page.goto("/browse/professionals--lawyer--property-land");
  await cardOf(u.page, law.id).click();
  const sheet = u.page.getByTestId("request-sheet");
  await sheet.getByTestId("get-test-credits").click();
  await sheet.getByTestId("req-chat").click();
  await expect(law.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => noteStatus(law.email, "request.incoming"), { timeout: 20_000 }).toBe("sent");
  const payload = JSON.parse(sql(`SELECT push_payload FROM public.notifications n JOIN auth.users u ON u.id=n.user_id WHERE u.email='${law.email}' AND kind='request.incoming'`));
  expect(payload.title).toBe("New chat request");
  expect(payload.body).toContain("Priya wants to consult you");
  expect(payload.urgent).toBe(true);
  expect(payload.actions.map((a: { action: string }) => a.action)).toEqual(["accept", "decline"]);
  await law.page.getByTestId("ring-decline").click();
  await expect.poll(() => notes(uEmail, "request.declined"), { timeout: 10_000 }).toBe("1");

  // client: asked only after their first request; "Not now" hides it
  await u.page.goto("/");
  const cask = u.page.getByTestId("push-ask-card");
  await expect(cask).toBeVisible();
  await expect(cask).toHaveAttribute("data-reason", "client");
  await pshot(u.page, "02-client-ask-card");
  await u.page.getByTestId("push-ask-dismiss").click();
  await expect(cask).toHaveCount(0);
  await u.page.reload();
  await expect(u.page.getByTestId("bell")).toBeVisible();
  await expect(u.page.getByTestId("push-ask-card")).toHaveCount(0);

  // worker: test alert from Settings, then bell + inbox
  await law.page.goto("/settings");
  await expect(law.page.getByTestId("push-status")).toHaveAttribute("data-enabled", "true");
  await expect(law.page.getByTestId("push-mock-note")).toBeVisible();
  await law.page.getByTestId("push-test").click();
  await expect.poll(() => noteStatus(law.email, "test.ping"), { timeout: 20_000 }).toBe("sent");
  await law.page.goto("/");
  await expect(law.page.getByTestId("bell-count")).toBeVisible();
  const unread = Number(await law.page.getByTestId("bell").getAttribute("data-unread"));
  expect(unread).toBeGreaterThanOrEqual(2);
  await pshot(law.page, "03-bell-unread");
  await law.page.getByTestId("bell").click();
  await expect(law.page.getByTestId("inbox-page")).toBeVisible();
  const ring = law.page.locator('[data-testid="inbox-item"][data-kind="request.incoming"]');
  await expect(ring).toHaveAttribute("data-read", "false");
  await expect(ring).toContainText("New chat request");
  await pshot(law.page, "04-inbox", true);
  await ring.click();
  await expect(law.page).toHaveURL(/ring=/);
  await expect(law.page.getByTestId("incoming-ring")).toHaveCount(0); // an old ring link does not ring again
  await law.page.goto("/notifications");
  await expect(law.page.locator('[data-testid="inbox-item"][data-kind="request.incoming"]')).toHaveAttribute("data-read", "true");
  await law.page.getByTestId("inbox-mark-all").click();
  await expect(law.page.locator('[data-testid="inbox-item"][data-read="false"]')).toHaveCount(0);
  await law.page.goto("/");
  await expect(law.page.getByTestId("bell-count")).toHaveCount(0);
  await u.ctx.close(); await law.ctx.close();
});

test("settings: category switches + quiet hours persist, turn off removes the device; Tamil screen", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'p2-%@meiyiyal.test';`);
  const s = await open(browser);
  await stubPush(s.ctx);
  const email = await signInAt(s.page, s.page.request, "p2-user");
  await setProfile(s.page, "Arun Prakash", IMG("engineer"));
  await s.page.goto("/settings");
  const status = s.page.getByTestId("push-status");
  await expect(status).toHaveAttribute("data-enabled", "false");
  await expect(s.page.getByTestId("notify-promos")).not.toBeChecked(); // offers off by default
  await expect(s.page.getByTestId("notify-requests")).toBeChecked();
  await expect(s.page.getByTestId("quiet-on")).toBeChecked();         // quiet hours on by default
  await expect(s.page.getByTestId("quiet-from")).toHaveValue("22:00");
  await expect(s.page.getByTestId("quiet-to")).toHaveValue("07:00");
  await s.page.getByTestId("push-turn-on").click();
  await expect(status).toHaveAttribute("data-enabled", "true");
  await expect.poll(() => devices(email)).toBe(1);

  await s.page.getByTestId("notify-chat").click();
  await expect(s.page.getByTestId("notify-chat")).not.toBeChecked();
  await s.page.getByTestId("quiet-from").fill("23:30");
  await s.page.getByTestId("quiet-from").blur();
  await expect.poll(() => sql(`SELECT prefs->'notify'->'quiet'->>'from' FROM public.profiles WHERE user_id='${uid(email)}'`)).toBe("23:30");
  await expect.poll(() => sql(`SELECT prefs->'notify'->>'chat' FROM public.profiles WHERE user_id='${uid(email)}'`)).toBe("false");
  await pshot(s.page, "05-settings", true);
  await s.page.reload();
  await expect(s.page.getByTestId("notify-chat")).not.toBeChecked();
  await expect(s.page.getByTestId("quiet-from")).toHaveValue("23:30");

  // Tamil
  await s.page.evaluate(() => localStorage.setItem("i18nextLng", "ta"));
  await s.page.reload();
  await expect(s.page.getByTestId("push-settings")).toContainText("அரட்டை செய்திகள்");
  await expect.poll(() => sql(`SELECT lang FROM public.push_subscriptions s JOIN auth.users u ON u.id=s.user_id WHERE u.email='${email}'`)).toBe("ta");
  await pshot(s.page, "06-settings-tamil", true);
  await s.page.goto("/notifications");
  await expect(s.page.getByTestId("inbox-page")).toBeVisible();
  await pshot(s.page, "07-inbox-tamil");
  await s.page.goto("/settings");

  await s.page.getByTestId("push-turn-off").click();
  await expect(status).toHaveAttribute("data-enabled", "false");
  await expect.poll(() => devices(email)).toBe(0);
  await s.ctx.close();
});

test("iPhone in a Safari tab: shows 'Add to Home Screen' steps instead of a prompt", async ({ browser }) => {
  const s = await open(browser);
  await s.page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
    localStorage.setItem("myl.requestedOnce", "1");
  });
  await signInAt(s.page, s.page.request, "p3-user");
  await s.page.goto("/");
  await expect(s.page.getByTestId("push-install-card")).toBeVisible();
  await expect(s.page.getByTestId("push-ask-card")).toHaveCount(0);
  await pshot(s.page, "08-iphone-install-card");
  await s.page.goto("/settings");
  await expect(s.page.getByTestId("push-turn-on")).toHaveCount(0);
  await s.ctx.close();
});

test("service worker shows the phone notification with Accept / Decline, and stays quiet when the app is already open on that screen", async ({ browser: _b }, info) => {
  test.skip(info.project.name !== "desktop", "one browser is enough");
  // the headless test browser cannot display notifications; real Chrome (new headless) can. Skip where Chrome is not installed.
  let chrome: import("@playwright/test").Browser;
  try { chrome = await chromium.launch({ channel: "chrome" }); } catch { test.skip(true, "Google Chrome not installed"); return; }
  const ctx = await chrome.newContext({ permissions: ["notifications"], viewport: { width: 1366, height: 820 } });
  const page = await ctx.newPage();
  await page.goto("/settings");
  await page.evaluate(async () => { await navigator.serviceWorker.register("/dev-sw.js?dev-sw", { scope: "/", type: "module" }); await navigator.serviceWorker.ready; });
  // app closed (no Meiyiyal window open): a request arrives
  await page.goto("about:blank");
  const ring = { id: "e2e-ring", kind: "request.incoming", lang: "ta", title: "புதிய அரட்டை கோரிக்கை", body: "பிரியா உங்களிடம் ஆலோசனை கேட்கிறார். 45 வினாடிக்குள் பதில் சொல்ல தட்டுங்கள்.", url: "/?ring=1", tag: "req-1", urgent: true, actions: [{ action: "accept", title: "ஏற்கவும்" }, { action: "decline", title: "மறுக்கவும்" }] };
  await deliverPush(page, ring);
  await page.goto("/settings");
  await expect.poll(() => shownTitles(page)).toContain(`${ring.title}|${ring.body}|req-1`);
  const details = await page.evaluate(async () => { const n = (await (await navigator.serviceWorker.getRegistration("/"))!.getNotifications({ tag: "req-1" }))[0]; return { actions: n.actions.map((a) => a.title), sticky: n.requireInteraction, url: n.data.url }; });
  expect(details).toEqual({ actions: ["ஏற்கவும்", "மறுக்கவும்"], sticky: true, url: "/?ring=1" });
  // the app closes it when the ring is answered in the app
  await page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration("/"))!.getNotifications({ tag: "req-1" })).forEach((n) => n.close()));
  await expect.poll(() => shownTitles(page)).toEqual([]);
  // user is already looking at /settings: an alert for /settings is shown in the app only, no banner
  await page.bringToFront();
  if (await page.evaluate(() => document.hasFocus())) {
    await deliverPush(page, { id: "e2e-s", kind: "account.verified", title: "Bank verified", body: "x", url: "/settings", tag: "e2e-s" });
    await page.waitForTimeout(1500);
    expect(await shownTitles(page)).toEqual([]);
  }
  await chrome.close();
});
