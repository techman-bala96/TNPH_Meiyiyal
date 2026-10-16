import { expect, test, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { WORKERS, adminApprove, grantAdmin, registerWorker, setProfile, signInAt } from "./workerFlow";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shotter = (page: Page) => (name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: p === "mobile" ? `${SHOTS}/14-worker-reg-${name}.png` : `${SHOTS}/desktop-14-worker-reg-${name}.png`, fullPage: false });
};

test("Doctor registers (Aadhaar OTP + docs) -> pending -> admin approves -> Go Online; non-admin blocked from /admin", async ({ browser }) => {
  const w = WORKERS[0];
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: w.at, permissions: ["geolocation"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await signInAt(page, page.request, "regdoc");
  await page.goto("/admin");
  await expect(page.getByTestId("find-panel")).toBeVisible(); // not admin -> bounced
  await setProfile(page, w.name, w.photo);
  await expect(page.getByTestId("go-online")).toHaveCount(0);
  await shotter(page)("00-worker-tab");
  await registerWorker(page, w, shotter(page));
  await shotter(page)("06-pending");

  const actx = await browser.newContext({ ...test.info().project.use, geolocation: w.at, permissions: ["geolocation"] });
  const admin = await actx.newPage(); await mockMapNetwork(admin);
  await admin.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  const aemail = await signInAt(admin, admin.request, "admin");
  grantAdmin(aemail); await admin.reload();
  await adminApprove(admin, [w.name], shotter(admin));

  await page.reload();
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
  await page.getByTestId("go-online").click();
  await expect(page.getByTestId("go-online")).toBeChecked();
  await shotter(page)("07-online");
  await page.reload();
  await expect(page.getByTestId("go-online")).toBeChecked();
  await page.getByTestId("go-online").click(); // offline again so other suites stay deterministic
  await expect(page.getByTestId("go-online")).not.toBeChecked();
  await ctx.close(); await actx.close();
});
