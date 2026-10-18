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
  sql(`DELETE FROM auth.users WHERE email ~ '^n[sap]-.*@meiyiyal\\.test$';`);
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
