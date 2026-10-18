import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { CHENNAI, cardOf, makeWorker, open } from "./consultFlow";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";

// Nearby search + Rapido-style auto request + paid messages + presence pause/reconnect (M10, decisions D1–D13).
const FAMILY = "professionals--lawyer--family-divorce";
const SHOTS = process.env.NEARBY_SHOTS ?? "/workspace/nearby-shots";
const at = (km: number) => ({ latitude: CHENNAI.latitude + km / 111.2, longitude: CHENNAI.longitude });
// let enter animations finish so screenshots aren't half-faded
const snap = async (page: Page, name: string, tag?: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${tag ?? test.info().project.name}-${name}.png` }); };
const trusted = (q: string) => sql(`SELECT set_config('meiyiyal.trusted','on',false); ${q}`);
const reset = () => {
  sql(`DELETE FROM auth.users WHERE email ~ '^n[a-z]-.*@meiyiyal\\.test$';`);
  // only this spec's lawyers may be found for the family-law specialty
  trusted(`UPDATE public.workers SET is_online = false WHERE primary_node = '${FAMILY}';`);
};
const credits = (email: string, n: number) => trusted(`UPDATE public.wallets SET balance = ${n} WHERE id = public.wallet_id_for((SELECT id FROM auth.users WHERE email='${email}'));`);
const balance = (email: string) => Number(sql(`SELECT balance FROM public.wallets WHERE id = public.wallet_id_for((SELECT id FROM auth.users WHERE email='${email}'))`).split("\n").pop());
async function user(browser: Browser, prefix: string, name: string) {
  const s = await open(browser); const email = await signInAt(s.page, s.page.request, prefix); await setProfile(s.page, name, IMG("user")); return { ...s, email };
}
/** Same signed-in user in another viewport (tablet / Tamil screenshots). */
async function twin(browser: Browser, ctx: BrowserContext, viewport: { width: number; height: number }, lang = "en") {
  const c = await browser.newContext({ storageState: await ctx.storageState(), viewport, geolocation: CHENNAI, permissions: ["geolocation"] });
  const p = await c.newPage(); await p.addInitScript((l) => localStorage.setItem("i18nextLng", l), lang); return { c, p };
}

test("search bar: typed + Tamil suggestions → nearest-first list, grouped by availability, rounded km", async ({ browser }) => {
  reset();
  const near = await makeWorker(browser, "ns-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  const far = await makeWorker(browser, "ns-law2", "Adv. Arun Prakash", IMG("lawyer"), FAMILY, at(5), "chennai");
  const off = await makeWorker(browser, "ns-law3", "Adv. Revathi Sundar", IMG("lawyer"), FAMILY, at(2), "chennai");
  await Promise.all([near.ctx.close(), far.ctx.close(), off.ctx.close()]);
  trusted(`UPDATE public.workers SET is_online = false WHERE id = '${off.id}';`);
  const u = await user(browser, "ns-user", "Priya Natarajan");

  // typed: instant suggestions from names + everyday words
  await u.page.goto("/");
  const input = u.page.getByTestId("search-input");
  await input.fill("civil lawyer for divorce case");
  await expect(u.page.getByTestId("search-panel")).toBeVisible();
  await expect(u.page.locator(`[data-testid="search-suggestion"][data-slug="${FAMILY}"]`)).toBeVisible();
  await snap(u.page, "01-search-suggestions");
  // Enter = same understanding as the mic (agent parser)
  await input.press("Enter");
  await expect(u.page).toHaveURL(new RegExp(`/browse/${FAMILY}`), { timeout: 15_000 });

  // nearest first inside available → busy → offline; distance shown only as "< 1 km" / whole km
  const cards = u.page.getByTestId("worker-card");
  await expect(cards).toHaveCount(3, { timeout: 15_000 });
  await expect(cards.nth(0)).toHaveAttribute("data-id", near.id);
  await expect(cards.nth(1)).toHaveAttribute("data-id", far.id);
  await expect(cards.nth(2)).toHaveAttribute("data-id", off.id);
  await expect(cards.nth(2)).toHaveAttribute("data-availability", "offline");
  await expect(cardOf(u.page, near.id).getByTestId("distance")).toHaveText("< 1 km");
  await expect(cardOf(u.page, far.id).getByTestId("distance")).toHaveText("5 km");
  await expect(cardOf(u.page, off.id).getByTestId("distance")).toHaveText("2 km");
  await expect(u.page.locator('[data-testid="availability-group"][data-group="available"]')).toBeVisible();
  await expect(u.page.getByTestId("lawyer-note")).toBeVisible();
  await expect(u.page.getByTestId("available-count")).toContainText("2");
  await snap(u.page, "02-nearest-first");

  // everyday words
  for (const [q, slug] of [["my dog is sick", "pet"], ["wall crack", "structural"]] as const) {
    await u.page.goto("/"); await u.page.getByTestId("search-input").fill(q);
    await expect(u.page.locator(`[data-testid="search-suggestion"][data-slug*="${slug}"]`).first()).toBeVisible();
  }

  // Tamil phrasing, Tamil UI
  const ta = await twin(browser, u.ctx, test.info().project.name === "mobile" ? { width: 412, height: 915 } : { width: 1366, height: 820 }, "ta");
  await ta.p.goto("/");
  await ta.p.getByTestId("search-input").fill("என் நாய்க்கு உடம்பு சரியில்லை");
  await expect(ta.p.locator('[data-testid="search-suggestion"][data-slug*="pet"]').first()).toBeVisible();
  await snap(ta.p, "03-search-suggestions", `tamil-${test.info().project.name}`);
  await ta.p.goto(`/browse/${FAMILY}`);
  await expect(ta.p.getByTestId("worker-card")).toHaveCount(3, { timeout: 15_000 });
  await expect(cardOf(ta.p, near.id).getByTestId("distance")).toHaveText("1 கி.மீ.க்குள்");
  await snap(ta.p, "04-nearest-first", `tamil-${test.info().project.name}`);
  await ta.c.close();

  // tablet (768) once
  if (test.info().project.name === "mobile") {
    const tab = await twin(browser, u.ctx, { width: 768, height: 1024 });
    await tab.p.goto("/"); await tab.p.getByTestId("search-input").fill("divorce");
    await expect(tab.p.getByTestId("search-panel")).toBeVisible();
    await snap(tab.p, "01-search-suggestions", "tablet");
    await tab.p.goto(`/browse/${FAMILY}`); await expect(tab.p.getByTestId("worker-card")).toHaveCount(3, { timeout: 15_000 });
    await snap(tab.p, "02-nearest-first", "tablet");
    await tab.c.close();
  }
  // signed out: no search, no list
  const anon = await open(browser); await anon.page.goto(`/browse/${FAMILY}`);
  await expect(anon.page.getByTestId("worker-card")).toHaveCount(0); await anon.ctx.close();
});

test("no answer → ask-again wait + suggestions; auto request cascades to the next nearest; paid message → worker 'available now' → connect", async ({ browser }) => {
  reset();
  const a = await makeWorker(browser, "na-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  const b = await makeWorker(browser, "na-law2", "Adv. Arun Prakash", IMG("lawyer"), FAMILY, at(5), "chennai");
  const u = await user(browser, "na-user", "Priya Natarajan");
  credits(u.email, 500);

  // ---- manual request, declined → non-blocking panel with "ask again" after a minute + nearby suggestions
  await u.page.goto(`/browse/${FAMILY}`);
  await cardOf(u.page, a.id).click();
  await u.page.getByTestId("request-sheet").getByTestId("req-chat").click();
  await expect(a.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await a.page.getByTestId("ring-decline").click();
  const panel = u.page.getByTestId("no-answer-panel");
  await expect(panel).toHaveAttribute("data-reason", "declined", { timeout: 10_000 });
  await expect(panel.getByTestId("ask-again")).toBeDisabled();
  await expect(panel.locator(`[data-testid="suggestion"][href*="${b.id}"]`)).toBeVisible();
  await snap(u.page, "05-no-answer-panel");
  await panel.getByTestId("no-answer-close").click();
  await expect(panel).toHaveCount(0);
  // the server enforces the wait too
  await cardOf(u.page, a.id).click(); await u.page.getByTestId("request-sheet").getByTestId("req-chat").click();
  await expect(u.page.getByText(/wait a minute/i).first()).toBeVisible({ timeout: 10_000 });
  await u.page.keyboard.press("Escape");
  await expect(u.page.getByText(/wait a minute/i)).toHaveCount(0, { timeout: 15_000 });

  // ---- auto request: mode asked once (Chat default), nearest first, decline → next, timeout → options
  await u.page.getByTestId("find-now").click();
  await expect(u.page.getByTestId("mode-sheet")).toBeVisible();
  await expect(u.page.getByTestId("mode-chat")).toHaveAttribute("aria-checked", "true");
  await u.page.getByTestId("mode-confirm").click();
  const scr = u.page.getByTestId("auto-search");
  await expect(scr).toHaveAttribute("data-status", "searching", { timeout: 10_000 });
  await expect(u.page.getByTestId("search-current")).toHaveText("Adv. Kavitha Raman", { timeout: 10_000 });
  await expect(a.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await expect(u.page.getByTestId("search-countdown")).toBeVisible();
  await snap(u.page, "06-auto-request-progress");
  await a.page.getByTestId("ring-decline").click();
  await expect(u.page.getByTestId("search-current")).toHaveText("Adv. Arun Prakash", { timeout: 10_000 });
  await expect(b.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  trusted(`UPDATE public.consult_requests SET expires_at = now() - interval '1 second' WHERE status='ringing' AND worker_id='${b.id}';`);
  await expect(scr).toHaveAttribute("data-status", "exhausted", { timeout: 20_000 });
  await expect(u.page.getByTestId("no-answer")).toBeVisible();
  await expect(b.page.getByTestId("incoming-ring")).toHaveCount(0, { timeout: 10_000 });
  await snap(u.page, "07-no-answer-options");

  // ---- paid message (5 credits, refunded in 24 h if no reply)
  const before = balance(u.email);
  await u.page.getByTestId("search-message").click();
  await u.page.locator(`[data-testid="message-pick-worker"][data-id="${a.id}"]`).click();
  const ms = u.page.getByTestId("message-sheet");
  await expect(ms).toBeVisible();
  await ms.getByTestId("message-body").fill("Vanakkam madam, I need advice on a mutual-consent divorce. Please call when free.");
  await snap(u.page, "08-message-sheet");
  await ms.getByTestId("message-send").click();
  await expect(ms).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => balance(u.email)).toBe(before - 5);

  // worker: Messages → "I'm available now"
  await a.page.goto("/messages");
  const row = a.page.getByTestId("message-row").first();
  await expect(row).toContainText("mutual-consent divorce");
  await snap(a.page, "09-worker-messages");
  await row.getByTestId("message-respond").click();
  await expect(row).toHaveAttribute("data-status", "responded", { timeout: 10_000 });

  // user: "Connect now" (reserved for this user) → request sheet opens straight away
  await u.page.goto("/messages");
  await expect(u.page.getByTestId("message-connect")).toBeVisible({ timeout: 10_000 });
  await snap(u.page, "10-messages-connect");
  await u.page.getByTestId("message-connect").click();
  await expect(u.page.getByTestId("request-sheet")).toBeVisible({ timeout: 10_000 });
});

test("network drop pauses billing, both say continue → resumes; long drop ends with reconnect + find someone else", async ({ browser }) => {
  reset();
  const w = await makeWorker(browser, "np-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  const u = await user(browser, "np-user", "Priya Natarajan");
  credits(u.email, 500);
  await u.page.goto(`/browse/${FAMILY}`);
  await cardOf(u.page, w.id).click();
  await u.page.getByTestId("request-sheet").getByTestId("req-chat").click();
  await w.page.getByTestId("ring-accept").click();
  await expect(u.page.getByTestId("session-page")).toBeVisible({ timeout: 10_000 });
  await expect(w.page.getByTestId("session-page")).toBeVisible();
  const sid = new URL(u.page.url()).pathname.split("/").pop()!;

  const drop = async () => {
    await u.page.goto("about:blank");
    trusted(`UPDATE public.consult_sessions SET user_seen_at = now() - interval '40 seconds' WHERE id='${sid}';`);
    await expect(w.page.getByTestId("session-paused")).toBeVisible({ timeout: 25_000 });
  };
  await drop();
  const usedAtPause = Number(sql(`SELECT credits_used FROM public.consult_sessions WHERE id='${sid}'`));
  await expect(w.page.getByTestId("resume-left")).toBeVisible();
  await snap(w.page, "11-session-paused");

  // user is back → both are asked to continue
  await u.page.goto(`/session/${sid}`);
  await expect(u.page.getByTestId("resume-ask")).toBeVisible({ timeout: 20_000 });
  await expect(w.page.getByTestId("resume-ask")).toBeVisible({ timeout: 20_000 });
  await snap(u.page, "12-resume-ask");
  await u.page.getByTestId("resume-yes").click();
  await expect(u.page.getByTestId("resume-waiting")).toBeVisible();
  await w.page.getByTestId("resume-yes").click();
  await expect(u.page.getByTestId("resume-ask")).toHaveCount(0, { timeout: 15_000 });
  await expect(w.page.getByTestId("session-paused")).toHaveCount(0, { timeout: 15_000 });
  expect(Number(sql(`SELECT credits_used FROM public.consult_sessions WHERE id='${sid}'`))).toBeGreaterThanOrEqual(usedAtPause);

  // long drop: nobody back within 3 minutes → ended at the pause, one-tap reconnect for 10 minutes
  await drop();
  trusted(`UPDATE public.consult_sessions SET started_at = started_at - interval '5 minutes', paused_at = paused_at - interval '4 minutes' WHERE id='${sid}';`);
  await expect.poll(() => sql(`SELECT end_reason FROM public.consult_sessions WHERE id='${sid}'`), { timeout: 20_000 }).toBe("dropped");
  await u.page.goto(`/session/${sid}`);
  await expect(u.page.getByTestId("end-title")).toHaveAttribute("data-reason", "dropped");
  await expect(u.page.getByTestId("reconnect")).toBeVisible();
  await expect(u.page.getByTestId("find-other")).toBeVisible();
  await snap(u.page, "13-reconnect-prompt");
  await u.page.getByTestId("reconnect").click();
  await expect(w.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await w.page.getByTestId("ring-decline").click();
});

/** User requests chat from the worker's card, the worker accepts; returns the session id. */
async function startChat(u: { page: Page }, w: { page: Page; id: string }) {
  await u.page.goto(`/browse/${FAMILY}`);
  await cardOf(u.page, w.id).click();
  await u.page.getByTestId("request-sheet").getByTestId("req-chat").click();
  await w.page.getByTestId("ring-accept").click();
  await expect(u.page.getByTestId("session-page")).toBeVisible({ timeout: 10_000 });
  await expect(w.page.getByTestId("session-page")).toBeVisible();
  return new URL(u.page.url()).pathname.split("/").pop()!;
}

test("low balance: warning with top up; continuing after a drop with too little ends it; top up + reconnect within 10 min", async ({ browser }) => {
  reset();
  const w = await makeWorker(browser, "nl-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  const u = await user(browser, "nl-user", "Priya Natarajan");
  credits(u.email, 100);
  const sid = await startChat(u, w);
  await expect(u.page.getByTestId("credits-used")).toHaveText("10");

  // one minute of balance left → warning with a Top up link (checked by the 10 s meter)
  credits(u.email, 15);
  await expect(u.page.getByTestId("low-balance")).toBeVisible({ timeout: 20_000 });
  await expect(u.page.getByTestId("low-topup")).toHaveAttribute("href", "/wallet");
  await snap(u.page, "14-low-balance");

  // network drop; on return the user says continue but has less than 2 minutes → ended, reconnect offered
  await u.page.goto("about:blank");
  trusted(`UPDATE public.consult_sessions SET user_seen_at = now() - interval '40 seconds' WHERE id='${sid}';`);
  await expect(w.page.getByTestId("session-paused")).toBeVisible({ timeout: 25_000 });
  await u.page.goto(`/session/${sid}`);
  await expect(u.page.getByTestId("resume-ask")).toBeVisible({ timeout: 20_000 });
  await u.page.getByTestId("resume-yes").click();
  await expect(u.page.getByTestId("end-title")).toHaveAttribute("data-reason", "low_balance", { timeout: 15_000 });
  await expect(u.page.getByTestId("reconnect-topup")).toBeVisible();
  await expect(u.page.getByTestId("reconnect")).toBeVisible();
  await expect(w.page.getByTestId("session-summary")).toBeVisible({ timeout: 15_000 });
  await snap(u.page, "15-low-balance-ended");

  // top up through the real (mock) checkout, come back, reconnect to the same worker
  await u.page.getByTestId("reconnect-topup").click();
  await expect(u.page).toHaveURL(/\/wallet/);
  await u.page.locator('[data-testid="pack"][data-id="value"]').click();
  await expect(u.page.getByTestId("mock-checkout")).toBeVisible();
  await u.page.getByTestId("mock-pay").click();
  await expect(u.page.getByTestId("pay-result")).toHaveAttribute("data-status", "paid", { timeout: 15_000 });
  await u.page.goBack();
  await expect(u.page.getByTestId("reconnect")).toBeVisible({ timeout: 10_000 });
  await u.page.getByTestId("reconnect").click();
  await expect(w.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await w.page.getByTestId("ring-accept").click();
  await expect(u.page).toHaveURL(/\/session\//, { timeout: 10_000 });
  await expect.poll(() => new URL(u.page.url()).pathname.split("/").pop()).not.toBe(sid);
  await expect(u.page.getByTestId("session-other")).toHaveText("Adv. Kavitha Raman");
});

test("worker ends within 2 minutes without helping → user fully refunded (note on both sides), no-show counted", async ({ browser }) => {
  reset();
  const w = await makeWorker(browser, "ne-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  const u = await user(browser, "ne-user", "Priya Natarajan");
  credits(u.email, 100);
  const sid = await startChat(u, w);
  await expect(u.page.getByTestId("credits-used")).toHaveText("10");
  expect(balance(u.email)).toBe(90);
  await w.page.getByTestId("end-session").click();
  await expect(u.page.getByTestId("end-title")).toHaveAttribute("data-reason", "early_end", { timeout: 15_000 });
  await expect(u.page.getByTestId("refund-note")).toContainText("10");
  await expect(u.page.getByTestId("find-other")).toBeVisible();
  await expect(u.page.getByTestId("reconnect")).toHaveCount(0);
  await expect(w.page.getByTestId("refund-note")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => balance(u.email)).toBe(100);
  expect(sql(`SELECT noshow_count FROM public.workers WHERE id='${w.id}'`)).toBe("1");
  expect(sql(`SELECT count(*) FROM public.notifications n JOIN public.consult_sessions s ON s.user_id=n.user_id WHERE s.id='${sid}' AND n.kind='session.early_end'`)).toBe("1");
  await snap(u.page, "16-early-end-refund"); await snap(w.page, "16-early-end-worker");
});

test("3 missed rings in a row → worker set Offline: switch flips live, banner + inbox say why; going online clears it", async ({ browser }) => {
  reset();
  const w = await makeWorker(browser, "no-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  const u = await user(browser, "no-user", "Priya Natarajan");
  credits(u.email, 500);
  await u.page.goto(`/browse/${FAMILY}`);
  for (let i = 1; i <= 3; i++) {
    await cardOf(u.page, w.id).click();
    await u.page.getByTestId("request-sheet").getByTestId("req-chat").click();
    await expect(w.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
    trusted(`UPDATE public.consult_requests SET expires_at = now() - interval '1 second' WHERE status='ringing' AND worker_id='${w.id}';`);
    await expect(u.page.getByTestId("no-answer-panel")).toHaveAttribute("data-reason", "timeout", { timeout: 15_000 });
    await expect(w.page.getByTestId("incoming-ring")).toHaveCount(0, { timeout: 10_000 });
    await u.page.getByTestId("no-answer-close").click();
    if (i < 3) {
      expect(sql(`SELECT is_online::text || '/' || missed_streak FROM public.workers WHERE id='${w.id}'`)).toBe(`true/${i}`);
      // step past the ask-again rules (1 min wait, 2 misses / 30 min) — covered in the test above
      trusted(`UPDATE public.consult_requests SET created_at = created_at - interval '31 minutes', responded_at = responded_at - interval '31 minutes', expires_at = expires_at - interval '31 minutes' WHERE worker_id='${w.id}';`);
    }
  }
  // worker side: no reload — the switch flips, a banner explains, and it's in the inbox
  await expect(w.page.getByTestId("go-online")).not.toBeChecked({ timeout: 15_000 });
  await expect(w.page.getByTestId("auto-offline-banner")).toBeVisible();
  await expect(w.page.getByTestId("auto-offline-banner")).toContainText("3");
  await snap(w.page, "17-auto-offline");
  await w.page.getByTestId("bell").click();
  await expect(w.page.locator('[data-testid="inbox-item"][data-kind="worker.auto_offline"]')).toBeVisible();
  await w.page.goto("/?tab=worker");
  await expect(w.page.getByTestId("auto-offline-banner")).toBeVisible();
  // user side: now shown as offline
  await u.page.reload();
  await expect(cardOf(u.page, w.id)).toHaveAttribute("data-availability", "offline", { timeout: 10_000 });
  // back online clears the banner and the streak
  await w.page.getByTestId("go-online").click();
  await expect(w.page.getByTestId("go-online")).toBeChecked();
  await expect(w.page.getByTestId("auto-offline-banner")).toHaveCount(0);
  expect(sql(`SELECT is_online::text || '/' || missed_streak FROM public.workers WHERE id='${w.id}'`)).toBe("true/0");
});

test("paid message not answered in 24 h → 5 credits back automatically, shown as refunded on both sides", async ({ browser }) => {
  reset();
  const w = await makeWorker(browser, "nm-law1", "Adv. Kavitha Raman", IMG("lawyer"), FAMILY, CHENNAI, "chennai");
  await w.page.getByTestId("go-online").click(); await expect(w.page.getByTestId("go-online")).not.toBeChecked();
  const u = await user(browser, "nm-user", "Priya Natarajan");
  credits(u.email, 100);
  await u.page.goto(`/w/${w.id}`);
  await u.page.getByTestId("wp-message").click();
  const ms = u.page.getByTestId("message-sheet");
  await ms.getByTestId("message-body").fill("Please call me tomorrow about a divorce petition.");
  await ms.getByTestId("message-send").click();
  await expect(ms).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => balance(u.email)).toBe(95);
  await u.page.goto("/messages");
  await expect(u.page.getByTestId("message-row").first()).toHaveAttribute("data-status", "sent");
  await expect(u.page.getByTestId("message-row").first().getByTestId("message-refund-on")).toBeVisible();

  // a day passes with no reply → the 5-second sweep refunds it
  trusted(`UPDATE public.worker_messages SET created_at = created_at - interval '25 hours' WHERE user_id = (SELECT id FROM auth.users WHERE email='${u.email}');`);
  await expect.poll(() => balance(u.email), { timeout: 20_000 }).toBe(100);
  await u.page.reload();
  const row = u.page.getByTestId("message-row").first();
  await expect(row).toHaveAttribute("data-status", "refunded");
  await expect(row.getByTestId("message-refunded")).toContainText("5");
  await expect(row.getByTestId("message-refund-on")).toHaveCount(0);
  await expect(row.getByTestId("message-connect")).toHaveCount(0);
  await snap(u.page, "18-message-refunded");
  await u.page.goto("/notifications");
  await expect(u.page.locator('[data-testid="inbox-item"][data-kind="worker.message_refunded"]')).toBeVisible();
  // worker: shown as refunded, nothing left to answer
  await w.page.goto("/messages");
  const wr = w.page.getByTestId("message-row").first();
  await expect(wr).toHaveAttribute("data-status", "refunded");
  await expect(wr.getByTestId("message-respond")).toHaveCount(0);
});
