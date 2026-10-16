import { expect, test, type Page } from "@playwright/test";
import { loginNewEmail, mockMapNetwork } from "./mocks";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shot = (page: Page, name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: p === "mobile" ? `${SHOTS}/12-cat-${name}.png` : `${SHOTS}/desktop-12-cat-${name}.png`, fullPage: true });
};

test.beforeEach(async ({ page, context, request }) => {
  await mockMapNetwork(page);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 8.0883, longitude: 77.5385 });
  await loginNewEmail(page, request, "browse");
  await expect(page.getByTestId("loc-search").or(page.getByTestId("find-panel"))).toBeVisible();
  if (await page.getByTestId("loc-search").isVisible()) {
    await expect(page.getByTestId("sheet-place")).toBeVisible();
    await page.getByTestId("btn-confirm").click();
  }
  await expect(page.getByTestId("find-panel")).toBeVisible();
});

test("Find Worker: Professionals -> Doctor -> Allopathy -> Paediatrics, breadcrumbs, themes, empty worker list", async ({ page }) => {
  for (const c of ["doctor", "lawyer", "engineer"]) await expect(page.getByTestId(`cat-professionals--${c}`)).toBeVisible();
  await shot(page, "01-home");

  await page.getByTestId("cat-professionals--doctor").click();
  await expect(page.getByTestId("browse-hero")).toHaveAttribute("data-theme", "doctor");
  await expect(page.getByTestId("browse-title")).toHaveText("Doctor");
  await expect(page.getByTestId("node-professionals--doctor--siddha")).toBeVisible();
  await shot(page, "02-doctor");

  await page.getByTestId("node-professionals--doctor--allopathy").click();
  await expect(page.getByTestId("breadcrumb")).toContainText("Professionals");
  await expect(page.getByTestId("breadcrumb")).toContainText("Doctor");
  await expect(page.getByTestId("crumb-current")).toHaveText("Allopathy");
  await page.getByTestId("node-professionals--doctor--allopathy--paediatrics").click();
  await expect(page.getByTestId("worker-empty")).toContainText("Paediatrics");
  await expect(page).toHaveURL(/\/browse\/professionals--doctor--allopathy--paediatrics$/);
  await shot(page, "03-empty-workers");

  // breadcrumb back to Doctor, then back button to Professionals group, then Home
  await page.getByTestId("crumb-professionals--doctor").click();
  await expect(page.getByTestId("browse-title")).toHaveText("Doctor");
  await page.getByTestId("browse-back").click();
  await expect(page.getByTestId("browse-title")).toHaveText("Professionals");
  await expect(page.getByTestId("node-professionals--engineer")).toBeVisible();
  await page.getByTestId("browse-back").click();
  await expect(page.getByTestId("find-panel")).toBeVisible();
});

test("Lawyer + Engineer themes, deep link survives reload, Tamil labels, Worker tab", async ({ page }) => {
  await page.getByTestId("cat-professionals--lawyer").click();
  await expect(page.getByTestId("browse-hero")).toHaveAttribute("data-theme", "lawyer");
  await expect(page.getByTestId("node-professionals--lawyer--property-land")).toBeVisible();
  await shot(page, "04-lawyer");
  await page.goto("/");
  await page.getByTestId("cat-professionals--engineer").click();
  await expect(page.getByTestId("browse-hero")).toHaveAttribute("data-theme", "engineer");
  await shot(page, "05-engineer");
  await page.getByTestId("node-professionals--engineer--civil").click();
  await page.reload();
  await expect(page.getByTestId("crumb-current")).toHaveText("Civil");
  await page.getByTestId("lang-toggle").click();
  await expect(page.getByTestId("crumb-current")).toHaveText("கட்டுமானப் பொறியியல்");
  await expect(page.getByTestId("breadcrumb")).toContainText("பொறியாளர்");
  await shot(page, "06-ta");
  await page.goto("/browse/does-not-exist");
  await expect(page.getByTestId("find-panel")).toBeVisible();
  await page.getByTestId("tab-worker").click();
  await expect(page.getByTestId("worker-panel")).toBeVisible();
});
