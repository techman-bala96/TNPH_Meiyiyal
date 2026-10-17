import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { IMG, grantAdmin, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, makeWorker, open, shot } from "./consultFlow";

const API = "http://127.0.0.1:54321";
const ANON = readFileSync(".env.local", "utf8").match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)![1].replace(/"/g, "").trim();
const WEBHOOK_SECRET = "mock_webhook_secret_local";  // mock gateway default (local only)
const LAW = "professionals--lawyer--property-land";
const token = (p: Page) => p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("sb-") && x.endsWith("-auth-token"))!; return JSON.parse(localStorage.getItem(k)!).access_token as string; });
const balance = async (p: Page) => Number(await p.getByTestId("wallet-balance").first().innerText());
async function webhook(p: Page, eventId: string, body: object, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  const r = await p.request.post(`${API}/functions/v1/payments-webhook`, { data: raw, headers: { "content-type": "application/json", "x-razorpay-event-id": eventId, "x-razorpay-signature": createHmac("sha256", secret).update(raw).digest("hex") } });
  return { status: r.status(), body: await r.json() };
}
const captured = (orderId: string, payId: string) => ({ event: "payment.captured", payload: { payment: { entity: { id: payId, order_id: orderId, status: "captured" } } } });

test.setTimeout(180_000);
test("wallet: packs (GST incl.), mock checkout success / failure / cancel, idempotent webhook, no client minting; worker earnings → payout → admin marks paid", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'pm-%@meiyiyal.test';`);
  const law = await makeWorker(browser, "pm-lawyer", "Adv. Priya Natarajan", IMG("lawyer"), LAW, { latitude: 13.0317, longitude: 80.27 }, "chennai");
  const u = await open(browser); const p = u.page;
  const uEmail = await signInAt(p, p.request, "pm-user"); await setProfile(p, "Karthik Subramanian", IMG("engineer"));

  // ---- wallet + packs from DB
  await p.getByTestId("nav-profile").click(); await p.getByTestId("profile-wallet").click();
  await expect(p.getByTestId("wallet-page")).toBeVisible();
  await expect(p.getByTestId("pack")).toHaveCount(5);
  const value = p.locator('[data-testid="pack"][data-id="value"]');
  await expect(value.getByTestId("pack-price")).toHaveText("₹499");
  await expect(value.getByTestId("pack-credits")).toHaveText("530");
  await expect(value.getByTestId("pack-gst")).toContainText("₹76.12");
  expect(await balance(p)).toBe(0);
  await shot(p, "26-wallet-packs");

  // ---- success: Checkout → server signature → verify → credited
  await value.click();
  await expect(p.getByTestId("mock-checkout")).toBeVisible();
  await expect(p.getByTestId("mock-amount")).toHaveText("₹499");
  await p.waitForTimeout(500); await shot(p, "26-wallet-checkout");
  await p.getByTestId("mock-pay").click();
  await expect(p.getByTestId("pay-result")).toHaveAttribute("data-status", "paid");
  await expect(p.getByTestId("wallet-balance")).toHaveText("530");
  await expect(p.getByTestId("ledger-row")).toHaveCount(2);
  await shot(p, "26-wallet-success");

  // ---- failure: nothing credited, order recorded as failed
  await p.locator('[data-testid="pack"][data-id="starter"]').click();
  await p.getByTestId("mock-fail").click();
  await expect(p.getByTestId("pay-result")).toHaveAttribute("data-status", "failed");
  await expect(p.getByTestId("wallet-balance")).toHaveText("530");
  await expect(p.locator('[data-testid="order-row"][data-status="failed"]')).toHaveCount(1);
  await shot(p, "26-wallet-failed");

  // ---- cancel: user closes the checkout
  await p.locator('[data-testid="pack"][data-id="basic"]').click();
  await p.getByTestId("mock-cancel").click();
  await expect(p.getByTestId("pay-result")).toHaveAttribute("data-status", "cancelled");
  await expect(p.locator('[data-testid="order-row"][data-status="cancelled"]')).toHaveCount(1);
  await expect(p.getByTestId("wallet-balance")).toHaveText("530");

  // ---- webhooks: bad signature rejected; duplicate events processed once; webhook after verify doesn't double-credit
  const paidOrder = sql(`SELECT provider_order_id FROM public.payment_orders o JOIN auth.users u ON u.id=o.user_id WHERE u.email='${uEmail}' AND status='paid'`);
  const lateOrder = sql(`SELECT provider_order_id FROM public.payment_orders o JOIN auth.users u ON u.id=o.user_id WHERE u.email='${uEmail}' AND status='cancelled'`);
  expect((await webhook(p, "evt_bad", captured(lateOrder, "pay_x"), "wrong-secret")).status).toBe(401);
  const again = await webhook(p, `evt_${Date.now()}_a`, captured(paidOrder, "pay_dup"));
  expect(again.body).toMatchObject({ ok: true, duplicate: false, outcome: "already_paid" });
  const evt = `evt_${Date.now()}_late`;
  const first = await webhook(p, evt, captured(lateOrder, "pay_late_1"));   // money captured after the user closed the modal → still credited, once
  const dup = await webhook(p, evt, captured(lateOrder, "pay_late_1"));
  expect(first.body).toMatchObject({ duplicate: false, outcome: "credited" });
  expect(dup.body).toMatchObject({ duplicate: true });
  await p.reload();
  await expect(p.getByTestId("wallet-balance")).toHaveText("790");  // 530 + 260 (Basic 249 + 11)

  // ---- no client minting: direct RPC / table writes / forged signature all refused
  const tk = await token(p); const h = { apikey: ANON, authorization: `Bearer ${tk}`, "content-type": "application/json" };
  expect((await p.request.post(`${API}/rest/v1/rpc/payment_mark_paid`, { headers: h, data: { _provider_order_id: lateOrder, _payment_id: "pay_forged", _source: "client" } })).ok()).toBe(false);
  expect((await p.request.post(`${API}/rest/v1/rpc/dev_grant_test_credits`, { headers: h })).ok()).toBe(true);  // dev-only, capped (balance ≥ 200 → no-op)
  expect((await p.request.patch(`${API}/rest/v1/wallets?user_id=not.is.null`, { headers: h, data: { balance: 99999 } })).ok()).toBe(false);
  expect((await p.request.post(`${API}/rest/v1/wallet_transactions`, { headers: h, data: { wallet_id: "00000000-0000-0000-0000-000000000000", type: "top_up", amount: 999 } })).ok()).toBe(false);
  const forged = await p.request.post(`${API}/functions/v1/payments-verify`, { headers: h, data: { razorpay_order_id: paidOrder, razorpay_payment_id: "pay_forged", razorpay_signature: "deadbeef".repeat(8) } });
  expect(forged.status()).toBe(400);
  expect((await p.request.post(`${API}/functions/v1/payments-verify`, { headers: { "content-type": "application/json" }, data: {} })).status()).toBe(401);
  await p.reload(); await expect(p.getByTestId("wallet-balance")).toHaveText("790");

  // ---- spend: real chat with the lawyer → worker earnings (15% new-worker fee), held 72h
  await p.goto(`/browse/${LAW}`); await cardOf(p, law.id).click();
  await p.getByTestId("req-chat").click();
  await law.page.getByTestId("ring-accept").click();
  await expect(p.getByTestId("session-page")).toBeVisible({ timeout: 10_000 });
  await p.getByTestId("end-session").click();
  await expect(p.getByTestId("feedback-card")).toBeVisible();
  const earned = sql(`SELECT e.commission_pct || '|' || (e.available_at > now() + interval '71 hours') FROM public.worker_earnings e JOIN auth.users u ON u.id=e.worker_user_id WHERE u.email='${law.email}'`);
  expect(earned).toBe("15.00|true");
  await p.goto("/wallet");
  await expect(p.locator('[data-testid="ledger-row"][data-type="debit"]')).toHaveCount(1);

  // ---- worker: earnings page, payout below minimum disabled; after hold (simulated) request payout
  await law.page.goto("/?tab=worker"); await law.page.getByTestId("btn-earnings").click();
  await expect(law.page.getByTestId("earnings-page")).toBeVisible();
  await expect(law.page.getByTestId("earn-commission")).toHaveText("15%");
  await expect(law.page.getByTestId("payout-request")).toBeDisabled();
  sql(`UPDATE public.worker_earnings e SET available_at = now() - interval '1 hour' FROM auth.users u WHERE u.id=e.worker_user_id AND u.email='${law.email}';
       INSERT INTO public.worker_earnings(worker_user_id,mode,minutes,gross,commission_pct,commission,net,available_at,created_at)
       SELECT id,'video',25,300,15,45,255, now() - interval '3 days', now() - interval '8 days' FROM auth.users WHERE email='${law.email}';`);
  await law.page.reload();
  await expect(law.page.getByTestId("payout-request")).toBeEnabled();
  await expect(law.page.getByTestId("earn-week")).toHaveCount(2);
  await shot(law.page, "27-payout-earnings");
  await law.page.getByTestId("payout-request").click();
  await expect(law.page.locator('[data-testid="payout-row"][data-status="requested"]')).toBeVisible();
  await expect(law.page.getByTestId("payout-request")).toBeDisabled();
  await shot(law.page, "27-payout-requested");

  // ---- admin: payouts (mark paid w/ UTR), payments view, packs editor
  grantAdmin(uEmail);
  await p.goto("/admin"); await p.getByTestId("admin-tab-payouts").click();
  const row = p.locator('[data-testid="payout-admin-row"][data-name="Adv. Priya Natarajan"]');
  await expect(row).toHaveAttribute("data-status", "requested");
  await expect(row.getByTestId("payout-paid")).toBeDisabled();
  await row.getByTestId("payout-ref").fill("UTR-2026101700042");
  await shot(p, "27-payout-admin");
  await row.getByTestId("payout-paid").click();
  await expect(row).toHaveAttribute("data-status", "paid");
  await p.getByTestId("admin-tab-payments").click();
  await expect(p.locator(`[data-testid="payment-row"][data-order="${lateOrder}"]`)).toHaveAttribute("data-status", "paid");
  await expect(p.locator('[data-testid="payment-row"][data-status="failed"]').first()).toBeVisible();
  await shot(p, "26-wallet-admin-payments");
  await p.getByTestId("admin-tab-packs").click();
  const starter = p.locator('[data-testid="pack-edit"][data-id="starter"]');
  await starter.getByTestId("pack-bonus").fill("5"); await starter.getByTestId("pack-save").click();
  await expect(starter.getByTestId("pack-save")).toHaveCount(0);
  await shot(p, "26-wallet-admin-packs");
  await p.goto("/wallet");
  await expect(p.locator('[data-testid="pack"][data-id="starter"]').getByTestId("pack-credits")).toHaveText("104");
  sql(`UPDATE public.credit_packs SET bonus=0 WHERE id='starter';`);

  await law.page.reload();
  await expect(law.page.locator('[data-testid="payout-row"][data-status="paid"]')).toContainText("UTR-2026101700042");
  await expect(law.page.getByTestId("earn-paid")).not.toHaveText("₹0");
  await shot(law.page, "27-payout-paid");
  for (const s of [u, law]) await s.ctx.close();
});
