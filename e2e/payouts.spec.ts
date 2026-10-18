import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { IMG, grantAdmin, signInAt, sql } from "./workerFlow";
import { makeWorker, open } from "./consultFlow";

const API = "http://127.0.0.1:54321";
const WEBHOOK_SECRET = "mock_webhook_secret_local";
const ART = "/opt/cursor/artifacts";
const NODE = "professionals--doctor--allopathy";
const shot = (page: Page, name: string) => page.screenshot({ path: `${ART}/${test.info().project.name}_${name}.png`, fullPage: true });
async function runBatch(page: Page) {
  const done = page.waitForResponse((r) => r.url().includes("/functions/v1/payout-run") && r.request().method() === "POST");
  await page.getByTestId("payout-run").click();
  expect((await done).ok()).toBe(true);
}
const available = (email: string) => sql(`SELECT (COALESCE(sum(e.net),0) = 250)::text FROM public.worker_earnings e JOIN auth.users u ON u.id = e.worker_user_id WHERE u.email = '${email}' AND e.payout_id IS NULL AND e.available_at <= now()`);

test.setTimeout(240_000);
test("payouts: penny-drop success, name mismatch, weekly run, flagged worker skipped, failure returns the balance", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'po-%@meiyiyal.test';
       UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'payouts_auto';`);
  try {
    const w = await makeWorker(browser, "po-kavitha", "Dr. Kavitha Raman", IMG("doctor"), NODE, { latitude: 13.0317, longitude: 80.27 }, "chennai");
    sql(`SELECT set_config('meiyiyal.trusted','on', false);
      INSERT INTO public.kyc_verification(worker_id, legal_name, aadhaar_verified, status)
      SELECT w.id, 'Kavitha Raman', true, 'verified' FROM public.workers w JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${w.email}'
      ON CONFLICT (worker_id) DO UPDATE SET legal_name = 'Kavitha Raman', aadhaar_verified = true;
      SELECT set_config('meiyiyal.trusted','off', false);`);
    const admin = await open(browser);
    const adminEmail = await signInAt(admin.page, admin.page.request, "po-admin");
    grantAdmin(adminEmail);

    await w.page.goto("/earnings");
    await expect(w.page.getByTestId("earnings-page")).toBeVisible();
    await expect(w.page.getByTestId("payout-account")).toHaveAttribute("data-status", "none");
    await expect(w.page.getByTestId("payout-request")).toBeVisible();
    await w.page.getByTestId("payout-account-number").fill("5010012345678");
    await w.page.getByTestId("payout-ifsc").fill("HDFC0001234");
    await w.page.getByTestId("payout-otp").fill("123456");
    await w.page.getByTestId("payout-save").click();
    await expect(w.page.getByTestId("payout-account")).toHaveAttribute("data-status", "verified");
    await expect(w.page.getByTestId("payout-mask")).toContainText("5678");
    await expect(w.page.getByTestId("payout-registered")).toContainText("Kavitha Raman");
    await expect(w.page.getByTestId("payout-wait")).toHaveAttribute("data-reason", "cooling");
    await expect(w.page.getByTestId("payout-next")).toBeVisible();
    await expect(w.page.getByTestId("payout-request")).toHaveCount(0);
    await shot(w.page, "earnings_payout_account");

    await w.page.getByTestId("payout-change").click();
    await w.page.getByTestId("payout-account-number").fill("5010011110000");
    await w.page.getByTestId("payout-ifsc").fill("HDFC0001234");
    await w.page.getByTestId("payout-otp").fill("123456");
    await w.page.getByTestId("payout-save").click();
    await expect(w.page.getByTestId("payout-account")).toHaveAttribute("data-status", "rejected");
    await expect(w.page.getByTestId("payout-wait")).toHaveAttribute("data-reason", "account_rejected");
    await shot(w.page, "earnings_name_mismatch");

    await w.page.getByTestId("payout-account-number").fill("5010012345678");
    await w.page.getByTestId("payout-ifsc").fill("HDFC0001234");
    await w.page.getByTestId("payout-otp").fill("123456");
    await w.page.getByTestId("payout-save").click();
    await expect(w.page.getByTestId("payout-account")).toHaveAttribute("data-status", "verified");

    sql(`INSERT INTO public.worker_earnings(worker_user_id, mode, minutes, gross, commission_pct, commission, net, available_at)
      SELECT id, 'video', 20, 400, 18, 72, 328, now() - interval '1 day' FROM auth.users WHERE email = '${w.email}';`);
    await admin.page.goto("/admin");
    await admin.page.getByTestId("admin-tab-payouts").click();
    await expect(admin.page.getByTestId("payouts-admin")).toBeVisible();
    const card = () => admin.page.locator('[data-testid="payout-account-admin"][data-name="Dr. Kavitha Raman"]');
    await expect(card()).toHaveAttribute("data-status", "verified");
    await card().getByTestId("payout-release").click();
    await expect(admin.page.getByTestId("payout-auto")).toHaveAttribute("data-paused", "true");
    await admin.page.getByTestId("payout-pause").click();
    await expect(admin.page.getByTestId("payout-run")).toBeEnabled();
    await runBatch(admin.page);
    const pout = sql(`SELECT p.provider_payout_id FROM public.payout_requests p JOIN auth.users u ON u.id = p.worker_user_id WHERE u.email = '${w.email}' AND p.status = 'processing' ORDER BY p.requested_at DESC LIMIT 1`);
    expect(pout.startsWith("pout_mock_")).toBe(true);
    const raw = JSON.stringify({ event: "payout.processed", payload: { payout: { entity: { id: pout, utr: "UTRMOCK123", status: "processed" } } } });
    const paid = await admin.page.request.post(`${API}/functions/v1/payout-webhook`, {
      data: raw,
      headers: { "content-type": "application/json", "x-razorpay-event-id": `po_${Date.now()}`, "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex") },
    });
    expect(paid.ok()).toBe(true);
    expect(await paid.json()).toMatchObject({ outcome: "paid", duplicate: false });
    await w.page.reload();
    await expect(w.page.locator('[data-testid="payout-row"][data-status="paid"]')).toContainText("UTRMOCK123");

    sql(`SELECT set_config('meiyiyal.trusted','on', false);
      UPDATE public.workers SET flag_active = true FROM auth.users u WHERE workers.user_id = u.id AND u.email = '${w.email}';
      INSERT INTO public.worker_earnings(worker_user_id, mode, minutes, gross, commission_pct, commission, net, available_at)
      SELECT id, 'chat', 10, 300, 18, 50, 250, now() - interval '2 days' FROM auth.users WHERE email = '${w.email}';
      SELECT set_config('meiyiyal.trusted','off', false);`);
    await runBatch(admin.page);
    expect(available(w.email)).toBe("true");
    expect(sql(`SELECT count(*) FROM public.payout_requests p JOIN auth.users u ON u.id = p.worker_user_id WHERE u.email = '${w.email}' AND p.status IN ('queued','review','processing')`)).toBe("0");

    sql(`SELECT set_config('meiyiyal.trusted','on', false);
      UPDATE public.workers SET flag_active = false FROM auth.users u WHERE workers.user_id = u.id AND u.email = '${w.email}';
      SELECT set_config('meiyiyal.trusted','off', false);`);
    await w.page.getByTestId("payout-change").click();
    await w.page.getByTestId("payout-account-number").fill("5010012340002");
    await w.page.getByTestId("payout-ifsc").fill("HDFC0001234");
    await w.page.getByTestId("payout-otp").fill("123456");
    await w.page.getByTestId("payout-save").click();
    await expect(w.page.getByTestId("payout-account")).toHaveAttribute("data-status", "verified");
    await admin.page.reload();
    await admin.page.getByTestId("admin-tab-payouts").click();
    await card().getByTestId("payout-release").click();
    await runBatch(admin.page);
    expect(sql(`SELECT status FROM public.payout_requests p JOIN auth.users u ON u.id = p.worker_user_id WHERE u.email = '${w.email}' ORDER BY p.requested_at DESC LIMIT 1`)).toBe("failed");
    expect(available(w.email)).toBe("true");

    await w.page.getByTestId("payout-change").click();
    await w.page.getByTestId("payout-account-number").fill("5010099988877");
    await w.page.getByTestId("payout-ifsc").fill("HDFC0001234");
    await w.page.getByTestId("payout-otp").fill("123456");
    await w.page.getByTestId("payout-save").click();
    await expect(w.page.getByTestId("payout-account")).toHaveAttribute("data-status", "verified");
    sql(`INSERT INTO public.worker_earnings(worker_user_id, mode, minutes, gross, commission_pct, commission, net, available_at)
      SELECT id, 'video', 40, 14000, 18, 2000, 12000, now() - interval '4 days' FROM auth.users WHERE email = '${w.email}';`);
    await admin.page.reload();
    await admin.page.getByTestId("admin-tab-payouts").click();
    await card().getByTestId("payout-release").click();
    await runBatch(admin.page);
    const review = admin.page.locator('[data-testid="payout-admin-row"][data-name="Dr. Kavitha Raman"][data-status="review"]');
    await expect(review).toBeVisible();
    await expect(review).toHaveAttribute("data-reason", "amount");
    await shot(admin.page, "admin_payouts");
    await admin.ctx.close();
    await w.ctx.close();
  } finally {
    sql(`UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'payouts_auto';`);
  }
});
