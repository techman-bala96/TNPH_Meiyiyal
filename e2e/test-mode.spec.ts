import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { grantAdmin, signInAt, sql } from "./workerFlow";

// VITE_TEST_MODE: the normal dev server (flag off) must show nothing; a second dev server started here with
// VITE_TEST_MODE=true must show the bar + noindex on every screen without covering headers or the bottom nav.
const ON_PORT = 8091;
const ON = `http://localhost:${ON_PORT}`;
const EN = "Test version — payments and OTP are not real";
const TA = "சோதனைப் பதிப்பு — பணம் செலுத்துதலும் OTP-யும் உண்மையானவை அல்ல";
const SIZES = { phone: { width: 412, height: 839 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1366, height: 820 } };
let server: ChildProcess | undefined;

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  server = spawn("npx", ["vite", "--port", String(ON_PORT), "--strictPort"], { env: { ...process.env, VITE_TEST_MODE: "true" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(ON + "/login")).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("test-mode dev server did not start");
});
test.afterAll(() => { if (server?.pid) try { process.kill(-server.pid); } catch { /* gone */ } });

/** The bar sits above everything it must not cover, and the page doesn't scroll sideways. */
async function layoutOk(page: Page, label: string, scrolled = false) {
  const bar = page.getByTestId("test-mode-banner");
  await expect(bar, label).toBeVisible();
  const b = (await bar.boundingBox())!;
  expect(b.y, label).toBe(0);
  expect(b.height, `${label}: slim`).toBeLessThanOrEqual(30);
  const header = page.locator("main header").first();
  if (await header.count()) expect((await header.boundingBox())!.y, `${label}: header below the bar`).toBeGreaterThanOrEqual(b.y + b.height - 0.5);
  const nav = page.getByTestId("bottom-nav");
  if (await nav.count()) expect((await nav.boundingBox())!.y, `${label}: bottom nav clear of the bar`).toBeGreaterThan(b.y + b.height);
  const main = page.locator("main").first();
  if (!scrolled && await main.count()) expect((await main.boundingBox())!.y, `${label}: content below the bar`).toBeGreaterThanOrEqual(b.y + b.height - 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways scroll`).toBe(true);
}

test("test mode OFF (normal build): no bar, no noindex, no html class", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("btn-email")).toBeVisible();
  await expect(page.getByTestId("test-mode-banner")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("test-mode"))).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingTop)).toBe("0px");
});

test("test mode ON: bar in en/ta on every screen (login, legal, 404, home, settings, admin), noindex, layout on phone/tablet/desktop", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  sql(`DELETE FROM auth.users WHERE email LIKE 'tm${tag}%@meiyiyal.test';`);
  // sign in on the normal server, then carry the session over to the test-mode server (same Supabase project)
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: { latitude: 13.0317, longitude: 80.27 }, permissions: ["geolocation"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  grantAdmin(await signInAt(page, page.request, `tm${tag}`));
  const store = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) if (!localStorage.getItem(k)) localStorage.setItem(k, v as string); }, store);

  await page.goto(ON + "/login?x=1");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(await page.evaluate(() => document.documentElement.classList.contains("test-mode"))).toBe(true);
  // not dismissable: no button inside, still there after a tap and a reload
  const bar = page.getByTestId("test-mode-banner");
  await expect(bar).toHaveText(EN);
  await expect(bar.locator("button")).toHaveCount(0);
  await bar.click(); await expect(bar).toBeVisible();

  for (const [size, vp] of Object.entries(SIZES)) {
    await page.setViewportSize(vp);
    for (const path of ["/", "/settings", "/privacy", "/no-such-page", "/admin"]) {
      await page.goto(ON + path);
      if (path === "/") await expect(page.getByTestId("bottom-nav")).toBeVisible();
      if (path === "/settings" || path === "/privacy") await expect(page.locator("main header").first()).toBeVisible();
      if (path === "/no-such-page") await expect(page.getByTestId("not-found")).toBeVisible();
      if (path === "/admin") await expect(page.getByTestId("admin-nav")).toBeVisible();
      await layoutOk(page, `${size} ${path}`);
      if (size === "phone" && path === "/") await page.screenshot({ path: `test-results/test-mode-${tag}-home.png` });
    }
  }
  // Tamil
  await page.setViewportSize(SIZES.phone);
  await page.evaluate(() => localStorage.setItem("i18nextLng", "ta"));
  await page.goto(ON + "/");
  await expect(bar).toHaveText(TA);
  await layoutOk(page, "phone ta /");
  await page.screenshot({ path: `test-results/test-mode-${tag}-home-ta.png` });
  // the sticky header is pushed below the bar when the page scrolls
  await page.goto(ON + "/settings");
  await page.evaluate(() => window.scrollTo(0, 400));
  await layoutOk(page, "phone ta /settings scrolled", true);
  await ctx.close();
});
