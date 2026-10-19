import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { IMG, WORKERS, grantAdmin, registerWorker, setProfile, signInAt, sql } from "./workerFlow";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shotter = (page: Page, tag: string) => (name: string) =>
  page.screenshot({ path: `${SHOTS}/${test.info().project.name}-m11-${tag}-${name}.png`, fullPage: true });

async function fresh(browser: Browser, at: { latitude: number; longitude: number }) {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: at, permissions: ["geolocation"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  return page;
}

test.setTimeout(180_000);
test("QR photo is decoded in the browser; no-camera selfie upload; reject → appeal → a different admin overturns (with media audit)", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  const w = { ...WORKERS[0], name: `Dr. Appeal ${tag.toUpperCase()}`, fields: { ...WORKERS[0].fields, reg_no: `TNMC 7${tag === "m" ? "1" : "2"}001` } };
  sql(`DELETE FROM auth.users WHERE email LIKE 'm11${tag}%@meiyiyal.test';`);
  const page = await fresh(browser, w.at);
  const email = await signInAt(page, page.request, `m11${tag}w`);
  await setProfile(page, w.name, w.photo);
  await registerWorker(page, w, undefined, { qrImage: IMG("aadhaar-qr").replace(".jpg", ".png"), uploadSelfie: true });
  const qrPath = sql(`SELECT c.qr_path FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${email}'`);
  expect(qrPath).toMatch(/\/qr-\d+\.txt$/);

  // Admin 1 rejects.
  const a1 = await fresh(browser, w.at);
  grantAdmin(await signInAt(a1, a1.request, `m11${tag}a1`)); await a1.goto("/admin");
  const card = a1.locator(`[data-testid="admin-card"][data-name="${w.name}"]`);
  await expect(card).toBeVisible();
  await card.getByTestId("case-media-open").click();
  await expect(card.getByTestId("case-media")).toBeVisible();
  await card.getByTestId("admin-note").fill("Council certificate is unreadable");
  await card.getByTestId("admin-reject").click();
  await expect(card).toHaveCount(0);

  // Worker appeals once.
  await page.goto("/?tab=worker");
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "rejected");
  await page.getByTestId("appeal-note").fill("I have uploaded a clearer certificate; please re-check.");
  await page.getByTestId("appeal-submit").click();
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "pending");

  // Admin 1 cannot decide their own rejection's appeal.
  await a1.getByTestId("admin-tab-appeals").click();
  const ac1 = a1.locator(`[data-testid="appeal-card"][data-name="${w.name}"]`);
  await expect(ac1).toBeVisible();
  await expect(ac1.getByTestId("appeal-other-admin")).toBeVisible();
  await expect(ac1.getByTestId("appeal-overturn")).toHaveCount(0);

  // Admin 2 reviews media and overturns.
  const a2 = await fresh(browser, w.at);
  grantAdmin(await signInAt(a2, a2.request, `m11${tag}a2`)); await a2.goto("/admin");
  await a2.getByTestId("admin-tab-appeals").click();
  const ac2 = a2.locator(`[data-testid="appeal-card"][data-name="${w.name}"]`);
  await expect(ac2.getByTestId("appeal-text")).toContainText("clearer certificate");
  await ac2.getByTestId("case-media-open").click();
  await expect(ac2.getByTestId("case-media").locator("img").first()).toBeVisible();
  await shotter(a2, tag)("admin-appeals");
  await expect(ac2.getByTestId("appeal-overturn")).toBeDisabled();
  await ac2.getByTestId("appeal-decision-note").fill("Clearer certificate matches TNMC record");
  await ac2.getByTestId("appeal-overturn").click();
  await expect(ac2).toHaveCount(0);
  await a2.getByTestId("appeals-filter-overturned").click();
  await expect(a2.locator(`[data-testid="appeal-card"][data-name="${w.name}"]`)).toBeVisible();
  expect(Number(sql(`SELECT count(*) FROM public.admin_audit a JOIN public.workers w ON w.id = a.target WHERE w.display_name = '${w.name}' AND a.action = 'verification.view_media'`))).toBeGreaterThanOrEqual(2);

  await page.reload();
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
});

test("Aadhaar OTP through the kyc-aadhaar Edge Function (mock adapter) when kyc_provider = edge", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  const w = { ...WORKERS[0], name: `Dr. Edge KYC ${tag.toUpperCase()}`, fields: { ...WORKERS[0].fields, reg_no: `TNMC 7${tag === "m" ? "3" : "4"}001` } };
  sql(`DELETE FROM auth.users WHERE email LIKE 'm11${tag}k%@meiyiyal.test';`);
  sql(`UPDATE public.app_settings SET value = '"edge"' WHERE key = 'kyc_provider';`);
  try {
    const page = await fresh(browser, w.at);
    const email = await signInAt(page, page.request, `m11${tag}k`);
    await setProfile(page, w.name, w.photo);
    const fnCalls: number[] = [];
    page.on("response", (r) => { if (r.url().includes("/functions/v1/kyc-aadhaar")) fnCalls.push(r.status()); });
    await registerWorker(page, w, undefined, { kycEdge: true, uploadSelfie: true });
    expect(fnCalls.filter((s) => s === 200).length).toBeGreaterThanOrEqual(2);
    expect(sql(`SELECT k.provider || ':' || k.aadhaar_last4 FROM public.kyc_verification k JOIN public.workers w ON w.id = k.worker_id JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${email}'`)).toBe("mock:1098");
  } finally {
    sql(`UPDATE public.app_settings SET value = '"stub"' WHERE key = 'kyc_provider';`);
  }
});
