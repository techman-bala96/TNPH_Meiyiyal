import { expect, test, type Page } from "@playwright/test";
import { loginNewEmail, mockMapNetwork } from "./mocks";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shot = (page: Page, name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: p === "mobile" ? `${SHOTS}/13-profile-${name}.png` : `${SHOTS}/desktop-13-profile-${name}.png`, fullPage: true });
};
test.beforeEach(async ({ page, context, request }) => {
  await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 8.0883, longitude: 77.5385 });
  await loginNewEmail(page, request, "profile");
  await expect(page.getByTestId("sheet-place")).toBeVisible();
  await page.getByTestId("btn-confirm").click();
  await expect(page.getByTestId("find-panel")).toBeVisible();
});

test("avatar menu, profile edit + photo upload, saved locations, dark mode + Tamil persisted", async ({ page }) => {
  await expect(page.getByText("Sign out")).toHaveCount(0); // no bottom account row
  await page.getByTestId("avatar-btn").click();
  for (const id of ["menu-settings", "btn-signout"]) await expect(page.getByTestId(id)).toBeVisible();
  await shot(page, "01-menu");
  await page.keyboard.press("Escape");
  await page.getByTestId("nav-profile").click();
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await expect(page.getByTestId("input-email-ro")).toBeDisabled();

  // validation then save
  await page.getByTestId("input-name").fill("Bala Venkatesh");
  await page.getByTestId("input-phone-profile").fill("12345");
  await page.getByTestId("btn-save-profile").click();
  await expect(page.getByTestId("profile-error")).toBeVisible();
  await page.getByTestId("input-phone-profile").fill("9876501234");
  await page.getByTestId("input-dob").fill("1996-05-20");
  await page.getByTestId("btn-save-profile").click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  // photo upload (1200px JPEG -> 512px WebP in Storage)
  const up = page.waitForResponse((r) => r.url().includes("/storage/v1/object/avatars/") && r.request().method() === "POST");
  await page.getByTestId("input-photo").setInputFiles("e2e/fixtures/img/user.jpg");
  expect((await up).status()).toBe(200);
  const img = page.getByTestId("btn-photo").locator("img");
  await expect(img).toBeVisible();
  const dims = await img.evaluate(async (el: HTMLImageElement) => { await el.decode(); return [el.naturalWidth, el.naturalHeight]; });
  expect(Math.max(...dims)).toBeLessThanOrEqual(512);
  await expect(page.getByTestId("loc-current")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("input-name")).toHaveValue("Bala Venkatesh");
  await expect(page.getByTestId("input-dob")).toHaveValue("1996-05-20");
  await shot(page, "02-profile");

  // add a second location via map search, then switch back from saved list
  await page.getByTestId("add-location").click();
  await page.getByTestId("loc-search").fill("Mylapore");
  await page.getByTestId("area-hit").first().click();
  await expect(page.getByTestId("sheet-place")).toContainText("Mylapore");
  await page.getByTestId("btn-confirm").click();
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await expect(page.getByTestId("saved-locations").locator("li")).toHaveCount(2);
  await page.getByTestId("loc-use").click();
  await expect(page.getByTestId("saved-locations").locator("li").first()).toContainText("Kanniyakumari");

  // settings: dark + Tamil, persisted
  await page.getByTestId("page-back").click();
  await page.getByTestId("avatar-btn").click();
  await page.getByTestId("menu-settings").click();
  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByTestId("lang-ta").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("அமைப்புகள்");
  await shot(page, "03-settings-dark-ta");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByTestId("page-back").click();
  await expect(page.getByTestId("find-panel")).toBeVisible();
  await shot(page, "04-home-dark");
  await page.goto("/location");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "05-map-dark");
  await page.goto("/settings");
  await page.getByTestId("theme-light").click();
  await page.getByTestId("lang-en").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
