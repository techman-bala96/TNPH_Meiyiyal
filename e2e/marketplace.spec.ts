import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { WORKERS, adminApprove, grantAdmin, registerWorker, setProfile, signInAt, sql } from "./workerFlow";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shot = (page: Page, name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: p === "mobile" ? `${SHOTS}/15-list-${name}.png` : `${SHOTS}/desktop-15-list-${name}.png`, fullPage: true });
};
async function open(browser: Browser, at: { latitude: number; longitude: number }) {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: at, permissions: ["geolocation"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  return { ctx, page };
}
const card = (page: Page, name: string) => page.locator(`[data-testid="worker-card"][data-name="${name}"]`).first();

test.setTimeout(240_000);
test("3 workers register via real flow, admin approves, go online; user in Kanniyakumari & Chennai finds them (online first, km, show all by district)", async ({ browser }) => {
  // remove earlier runs' demo workers so exactly one set of 3 exists
  sql(`DELETE FROM auth.users WHERE email LIKE 'w-%@meiyiyal.test' OR email LIKE 'regdoc+%@meiyiyal.test';`);

  const workers = [];
  for (const w of WORKERS) {
    const s = await open(browser, w.at);
    await signInAt(s.page, s.page.request, `w-${w.key}`);
    await setProfile(s.page, w.name, w.photo);
    await registerWorker(s.page, w);
    workers.push(s);
  }
  const a = await open(browser, WORKERS[0].at);
  grantAdmin(await signInAt(a.page, a.page.request, "admin"));
  await a.page.reload();
  await adminApprove(a.page, WORKERS.map((w) => w.name));
  for (const s of workers) {
    await s.page.reload();
    await expect(s.page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
    await s.page.getByTestId("go-online").click();
    await expect(s.page.getByTestId("go-online")).toBeChecked();
  }

  // ---- user in Kanniyakumari (Kanyakumari town)
  const u = await open(browser, { latitude: 8.0883, longitude: 77.5385 });
  await signInAt(u.page, u.page.request, "user-kk");
  await u.page.goto("/browse/professionals--doctor--allopathy--paediatrics");
  const doc = card(u.page, WORKERS[0].name);
  await expect(doc).toBeVisible();
  await expect(u.page.getByTestId("worker-card").first()).toHaveAttribute("data-online", "true");
  await expect(doc).toHaveAttribute("data-online", "true");
  await expect(doc.getByTestId("distance")).toHaveText("15.8 km");
  await expect(doc).toContainText("Paediatrics");
  await expect(doc).toContainText("12 yrs");
  await expect(doc.locator("img")).toBeVisible();
  await shot(u.page, "01-doctor-paediatrics");
  // also visible one level up (sub-category list includes specialties)
  await u.page.goto("/browse/professionals--doctor--allopathy");
  await expect(card(u.page, WORKERS[0].name)).toBeVisible();

  await u.page.goto("/browse/professionals--engineer--civil");
  const eng = card(u.page, WORKERS[2].name);
  await expect(eng).toHaveAttribute("data-online", "true");
  await expect(eng.getByTestId("distance")).toHaveText("0.0 km");
  await shot(u.page, "02-engineer-civil");

  await u.page.goto("/browse/professionals--lawyer--property-land");
  await expect(u.page.getByTestId("worker-list-section")).toBeVisible();
  await expect(card(u.page, WORKERS[1].name)).toHaveCount(0); // Chennai lawyer is not "near" Kanniyakumari
  await u.page.getByTestId("list-all").click();
  const chennai = u.page.locator('[data-testid="district-group"][data-district="Chennai"]');
  await expect(chennai.locator(`[data-name="${WORKERS[1].name}"]`).first()).toBeVisible();
  await shot(u.page, "03-lawyer-show-all-by-district");

  // dark mode + Tamil on the list
  await u.page.evaluate(() => { localStorage.setItem("meiyiyal-theme", "dark"); localStorage.setItem("i18nextLng", "ta"); });
  await u.page.goto("/browse/professionals--doctor--allopathy--paediatrics");
  await expect(u.page.locator("html")).toHaveClass(/dark/);
  await expect(card(u.page, WORKERS[0].name)).toContainText("குழந்தை நலம்");
  await shot(u.page, "04-doctor-dark-ta");
  await u.page.evaluate(() => { localStorage.setItem("meiyiyal-theme", "light"); localStorage.setItem("i18nextLng", "en"); });

  // ---- user in Chennai sees the lawyer nearby
  const c = await open(browser, { latitude: 13.0827, longitude: 80.2707 });
  await signInAt(c.page, c.page.request, "user-chn");
  await c.page.goto("/browse/professionals--lawyer--property-land");
  const law = card(c.page, WORKERS[1].name);
  await expect(law).toHaveAttribute("data-online", "true");
  await expect(c.page.getByTestId("worker-card").first()).toHaveAttribute("data-online", "true");
  await shot(c.page, "05-lawyer-chennai");
  await c.page.goto("/browse/professionals--doctor--allopathy--paediatrics");
  await expect(card(c.page, WORKERS[0].name)).toHaveCount(0); // Nagercoil doctor not near Chennai

  for (const s of [...workers, a, u, c]) await s.ctx.close();
});
