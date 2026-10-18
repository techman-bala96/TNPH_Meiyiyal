/**
 * Coverage-gap scenarios (UI only; the DB is used to verify, and once — marked — to make time pass).
 * G01 admin rate override add → edit → delete · G02 admin refunds a paid order · G03 credits run out mid-chat.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { IMG, grantAdmin, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, makeWorker, open } from "./consultFlow";
import { lang, snap, tag } from "./scenario";

const LAW = "professionals--lawyer--property-land";
test.setTimeout(240_000);
const clean = (id: string) => sql(`DELETE FROM auth.users WHERE email LIKE 'gp${tag()}-${id}%@meiyiyal.test';`);
async function admin(b: Browser, id: string, l = "en") {
  const s = await open(b); await s.page.addInitScript((x) => localStorage.setItem("i18nextLng", x), l);
  grantAdmin(await signInAt(s.page, s.page.request, `gp${tag()}-${id}-adm`)); return s;
}
async function client(b: Browser, id: string, name: string) {
  const s = await open(b); const email = await signInAt(s.page, s.page.request, `gp${tag()}-${id}-u`); await setProfile(s.page, name, IMG("engineer"));
  return { ...s, email };
}

test("[G01] admin adds a rate override for a sub-category, edits it, then deletes it (en + ta)", async ({ browser }) => {
  lang("en + ta"); clean("01");
  const a = await admin(browser, "01"); const p = a.page;
  await p.goto("/admin#rates");
  await expect(p.getByTestId("rates-editor")).toBeVisible();
  const opts = await p.getByTestId("rates-add-node").locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).filter(Boolean));
  const node = opts.find((v) => !v.includes("lawyer")) ?? opts[0]; expect(node).toBeTruthy();
  try {
    await p.getByTestId("rates-add-node").selectOption(node);
    await p.getByTestId("rates-add").click();
    const g = p.locator(`[data-testid="rate-group"][data-node="${node}"]`);
    await expect(g).toBeVisible();
    await expect.poll(() => sql(`SELECT count(*) FROM public.rate_cards WHERE node_slug='${node}'`)).not.toBe("0");
    const row = g.locator('[data-testid="rate-row"][data-mode="chat"]');
    await row.getByTestId("rate-input").fill("7"); await row.getByTestId("rate-save").click();
    await expect.poll(() => sql(`SELECT credits_per_min FROM public.rate_cards WHERE node_slug='${node}' AND mode='chat'`)).toMatch(/^7(\.0+)?$/);
    await snap(p, "G01", "edited");
    await row.getByTestId("rate-delete").click();
    await expect.poll(() => sql(`SELECT count(*) FROM public.rate_cards WHERE node_slug='${node}' AND mode='chat'`)).toBe("0");
    await p.evaluate(() => localStorage.setItem("i18nextLng", "ta")); await p.reload();
    await expect(p.getByTestId("rates-editor")).toBeVisible();
    await expect(p.locator("html")).toHaveAttribute("lang", "ta");
    await snap(p, "G01", "ta");
  } finally { sql(`DELETE FROM public.rate_cards WHERE node_slug='${node}';`); }
  await a.ctx.close();
});

test("[G02] admin refunds a paid order with a reason → credits taken back, client told (inbox + wallet)", async ({ browser }) => {
  lang("en"); clean("02");
  const u = await client(browser, "02", `Refund Client ${tag()}`);
  await u.page.goto("/wallet");
  await u.page.locator('[data-testid="pack"][data-id="starter"]').click();
  await u.page.getByTestId("mock-pay").click();
  await expect(u.page.getByTestId("pay-result")).toHaveAttribute("data-status", "paid");
  const bal = Number(await u.page.getByTestId("wallet-balance").first().innerText()); expect(bal).toBeGreaterThan(0);
  const a = await admin(browser, "02"); const p = a.page;
  await p.goto("/admin#payments");
  const row = p.locator('[data-testid="payment-row"][data-status="paid"]', { hasText: `Refund Client ${tag()}` });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("refund")).toBeDisabled();
  await row.getByTestId("refund-note").fill("Bought by mistake");
  await snap(p, "G02", "admin-refund");
  await row.getByTestId("refund").click();
  await expect(p.locator('[data-testid="payment-row"][data-status="refunded"]', { hasText: `Refund Client ${tag()}` })).toBeVisible();
  await u.page.reload();
  await expect(u.page.getByTestId("wallet-balance").first()).toHaveText("0");
  await u.page.goto("/notifications");
  await expect(u.page.locator('[data-testid="inbox-item"][data-kind="payment.refunded"]')).toBeVisible();
  await snap(u.page, "G02", "client-inbox");
  await a.ctx.close(); await u.ctx.close();
});

test("[G03] credits run out in the middle of a chat → session ends for both, client is told and offered a top-up", async ({ browser }) => {
  lang("en"); clean("03");
  const w = await makeWorker(browser, `gp${tag()}-03-law`, `Adv. Credits ${tag()}`, IMG("lawyer"), LAW, { latitude: 13.0317, longitude: 80.27 }, "chennai");
  const u = await client(browser, "03", `Low Balance ${tag()}`);
  await u.page.goto(`/browse/${LAW}`); await cardOf(u.page, w.id).click();
  if ((await u.page.getByTestId("wallet-balance").innerText()) === "0") await u.page.getByTestId("get-test-credits").click();
  await u.page.getByTestId("req-chat").click();
  await w.page.getByTestId("ring-accept").click();
  await u.page.waitForURL(/\/session\//); await w.page.waitForURL(/\/session\//);
  const sid = new URL(u.page.url()).pathname.split("/").pop()!;
  // TIME-TRAVEL (DB): the chat has been going for 30 minutes and the wallet is nearly empty
  sql(`UPDATE public.session_segments SET started_at = now() - interval '30 minutes' WHERE session_id='${sid}' AND ended_at IS NULL;
       UPDATE public.wallets SET balance = 3 WHERE user_id = (SELECT user_id FROM public.consult_sessions WHERE id='${sid}');`);
  await expect(u.page.getByTestId("end-title")).toHaveAttribute("data-reason", "credits_exhausted", { timeout: 40_000 });
  await expect(w.page.getByTestId("end-title")).toHaveAttribute("data-reason", "credits_exhausted", { timeout: 40_000 });
  await expect(u.page.getByTestId("reconnect-topup")).toBeVisible();
  await snap(u.page, "G03", "client-ended"); await snap(w.page, "G03", "pro-ended");
  expect(sql(`SELECT end_reason FROM public.consult_sessions WHERE id='${sid}'`)).toBe("credits_exhausted");
  await u.page.goto("/notifications");
  await expect(u.page.locator('[data-testid="inbox-item"][data-kind="session.credits_out"]')).toBeVisible();
  await snap(u.page, "G03", "client-inbox");
  await w.ctx.close(); await u.ctx.close();
});
