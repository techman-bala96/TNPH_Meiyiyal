/**
 * Click crawl + screen checks for every role and route (mobile / tablet / tablet landscape / desktop, en + ta).
 * Every visible clickable is clicked once on a fresh copy of the screen; results go to
 * .cache/crawl/*.json and docs/TEST-SCENARIOS.md ("Button coverage"). Screens → /workspace/scenario-shots/CRAWL-*.png
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { IMG, WORKERS, adminApprove, grantAdmin, registerWorker, setProfile, signInAt, sql } from "./workerFlow";
import { Recorder, assertClean, checkScreen, crawl, doubleTap, shotScreen } from "./crawl";

// runs in file order on one worker; later roles reuse the worker created earlier
test.setTimeout(90 * 60_000);

const P = () => test.info().project.name;
const TAG = () => ({ mobile: "m", desktop: "d", tablet: "t", "tablet-land": "l" } as Record<string, string>)[P()] ?? "x";
const CLICK_LANGS = () => (["mobile", "desktop"].includes(P()) ? ["en", "ta"] : ["en"]);
const AT = { latitude: 13.0317, longitude: 80.27 };

async function ctx(browser: Browser) {
  const c = await browser.newContext({ ...test.info().project.use, geolocation: AT, permissions: ["geolocation", "camera", "microphone"], acceptDownloads: true });
  const page = await c.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  return page;
}
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
  await page.waitForTimeout(300);
}
/** Switch language the way a person does: the EN | தமிழ் toggle (saved to the profile when signed in). */
async function setLang(page: Page, lang: string) {
  const cur = await page.evaluate(() => localStorage.getItem("i18nextLng") || "en");
  if (cur.startsWith(lang)) return;
  const t = page.getByTestId("lang-toggle").first();
  if (await t.count()) { await t.click(); await page.waitForTimeout(400); }
  else { await page.evaluate((l) => localStorage.setItem("i18nextLng", l), lang); await page.reload(); }
  await expect.poll(() => page.evaluate(() => `${localStorage.getItem("i18nextLng")}|${document.documentElement.lang}`)).toBe(`${lang}|${lang}`);
}

async function run(page: Page, rec: Recorder, routes: { path: string; open?: () => Promise<void>; dbl?: string[] }[]) {
  for (const lang of ["en", "ta"]) {
    await page.goto(routes[0].path); await settle(page); await setLang(page, lang);
    const seen = new Set<string>();
    for (const r of routes) {
      const open = r.open ?? (async () => { await page.goto(r.path); await settle(page); });
      await open();
      await shotScreen(page, rec, r.path, lang);
      await checkScreen(page, rec, r.path, lang);
      if (P() === "mobile" && lang === "en" && r === routes[0]) { // dark mode once per role
        await page.emulateMedia({ colorScheme: "dark" }); await open(); await shotScreen(page, rec, r.path, lang, "dark"); await checkScreen(page, rec, r.path + " (dark)", lang); await page.emulateMedia({ colorScheme: "light" });
      }
      if (CLICK_LANGS().includes(lang)) {
        await crawl(page, rec, r.path, lang, open, seen);
        if (r.dbl?.length && lang === "en") await doubleTap(page, rec, r.path, lang, r.dbl, open);
      }
    }
  }
}

let workerName = ""; let workerEmail = ""; let workerId = "";

test("crawl: guest (signed out)", async ({ browser }) => {
  const page = await ctx(browser); const rec = new Recorder("guest");
  await run(page, rec, [
    { path: "/login" }, { path: "/privacy" }, { path: "/terms" }, { path: "/no-such-page" },
    { path: "/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" },
  ]);
  // protected screens bounce to /login
  for (const p of ["/", "/wallet", "/admin", "/settings"]) { await page.goto(p); await expect(page).toHaveURL(/\/login$/); }
  assertClean(rec);
});

test("crawl: worker pending (registered through the real wizard)", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'crawl${TAG()}-%@meiyiyal.test';`);
  const page = await ctx(browser); const rec = new Recorder("worker-pending");
  workerEmail = await signInAt(page, page.request, `crawl${TAG()}-worker`);
  const w = { ...WORKERS[0], name: `Dr. Meena Crawl${TAG().toUpperCase()}`, at: AT };
  workerName = w.name;
  await setProfile(page, w.name, IMG("doctor"));
  await registerWorker(page, w);
  await run(page, rec, [{ path: "/?tab=worker" }, { path: "/worker/register" }, { path: "/earnings" }, { path: "/messages" }]);
  // pending worker cannot go online or be found
  await page.goto("/?tab=worker"); await expect(page.getByTestId("go-online")).toHaveCount(0);
  assertClean(rec);
});

test("crawl: admin console (every tab)", async ({ browser }) => {
  const page = await ctx(browser); const rec = new Recorder("admin");
  const email = await signInAt(page, page.request, `crawl${TAG()}-admin`);
  grantAdmin(email); await page.reload();
  await adminApprove(page, [workerName]);
  workerId = sql(`SELECT w.id FROM public.workers w JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${workerEmail}'`);
  const tabs = ["queue", "appeals", "districts", "moderation", "referrals", "payments", "payouts", "packs", "rates", "commission", "settings", "catalog", "milestones", "security", "audit"];
  await run(page, rec, tabs.map((t) => ({ path: `/admin#${t}`, open: async () => { await page.goto(`/admin#${t}`); await page.reload(); await settle(page); } })));
  assertClean(rec);
});

test("crawl: worker approved", async ({ browser }) => {
  const page = await ctx(browser); const rec = new Recorder("worker-approved");
  // same person signs in again on a new device (magic link)
  const { loginNewEmail } = await import("./mocks");
  await loginNewEmail(page, page.request, workerEmail.split("@")[0], workerEmail);
  await settle(page);
  if (page.url().includes("/location")) { await page.getByTestId("btn-confirm").click(); }
  await run(page, rec, [{ path: "/?tab=worker" }, { path: "/earnings" }, { path: "/messages" }, { path: "/notifications" }, { path: "/settings" }, { path: `/w/${workerId}` }]);
  assertClean(rec);
});

test("crawl: client", async ({ browser }) => {
  const page = await ctx(browser); const rec = new Recorder("client");
  const clientEmail = await signInAt(page, page.request, `crawl${TAG()}-client`);
  await setProfile(page, "Karthik Crawl", IMG("user"));
  // a finished consultation to open read-only (the live session screen is driven end to end by consult/nearby/consult-live specs)
  const { endedSession } = await import("./consultFlow");
  const sid = endedSession(clientEmail, workerEmail);
  await run(page, rec, [
    { path: "/" }, { path: "/?tab=worker" }, { path: "/browse/professionals" }, { path: "/browse/professionals--doctor--allopathy--paediatrics", dbl: ["worker-card"] },
    { path: `/w/${workerId}` }, { path: "/profile", dbl: ["btn-save-profile"] }, { path: "/settings" }, { path: "/wallet", dbl: ["pack"] },
    { path: "/history" }, { path: "/notifications" }, { path: "/messages" }, { path: "/location" }, { path: "/worker/register" }, { path: `/session/${sid}` }, { path: "/no-such-page" },
  ]);
  assertClean(rec);
});
