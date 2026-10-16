import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const MAILPIT = "http://127.0.0.1:54324";
const KANNIYAKUMARI = { latitude: 8.0883, longitude: 77.5385 }; // Kanyakumari town
const shot = (page: Page, name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: p === "mobile" ? `${SHOTS}/10-location-${name}.png` : `${SHOTS}/desktop-10-location-${name}.png`, fullPage: true });
};

async function loginNewEmail(page: Page, request: import("@playwright/test").APIRequestContext) {
  const email = `loc+${test.info().project.name}-${Date.now()}@meiyiyal.test`;
  await page.goto("/login");
  await page.getByTestId("btn-email").click();
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("btn-send-link").click();
  await expect(page.getByTestId("email-sent")).toBeVisible();
  let link: string | undefined;
  for (let i = 0; i < 20 && !link; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + email)}`);
    const id = (await res.json()).messages?.[0]?.ID;
    if (id) {
      const msg = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      link = (msg.HTML || msg.Text).match(/https?:\/\/[^"'\s<>]+verify[^"'\s<>]+/)?.[0]?.replace(/&amp;/g, "&");
    }
    if (!link) await page.waitForTimeout(500);
  }
  expect(link).toBeTruthy();
  await page.goto(link!);
  return email;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test("GPS: new user is sent to /location, current location resolves to Kanniyakumari and is saved", async ({ page, context, request }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(KANNIYAKUMARI);
  await loginNewEmail(page, request);
  await expect(page).toHaveURL(/\/location$/);
  await expect(page.getByTestId("district-kanniyakumari")).toBeVisible();
  await shot(page, "01-picker");
  await page.getByTestId("btn-use-gps").click();
  await expect(page.getByTestId("gps-place")).toContainText("Kanniyakumari");
  await shot(page, "02-gps-detected");
  await page.getByTestId("btn-confirm-gps").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("loc-chip-label")).toContainText("Kanniyakumari");
  await shot(page, "03-home-chip");
  await page.reload(); // persisted server-side, guard passes
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("loc-chip-label")).toContainText("Kanniyakumari");
});

test("Manual: denied GPS shows message; search + district -> area pick; change from Home header; Tamil", async ({ page, request }) => {
  await loginNewEmail(page, request);
  await expect(page).toHaveURL(/\/location$/);
  await page.getByTestId("btn-use-gps").click(); // no permission granted -> denied
  await expect(page.getByTestId("loc-error")).toBeVisible();
  await page.goto("/"); // guard: Home requires a location
  await expect(page).toHaveURL(/\/location$/);
  await page.getByTestId("district-kanniyakumari").click();
  await expect(page.getByTestId("loc-breadcrumb")).toContainText("Kanniyakumari");
  await expect(page.getByTestId("area-item").first()).toBeVisible();
  await shot(page, "04-areas");
  await page.getByTestId("area-item").filter({ hasText: "Nagercoil" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("loc-chip-label")).toContainText("Nagercoil, Kanniyakumari");

  // change from header via search
  await page.getByTestId("loc-chip").click();
  await expect(page).toHaveURL(/\/location$/);
  await page.getByTestId("loc-search").fill("chenn");
  await expect(page.getByTestId("district-chennai")).toBeVisible();
  await shot(page, "05-search");
  await page.getByTestId("loc-search").fill("zzzz");
  await expect(page.getByTestId("loc-empty")).toBeVisible();
  await page.getByTestId("loc-search").fill("");
  await page.getByTestId("district-chennai").click();
  await page.getByTestId("area-item").first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("loc-chip-label")).toContainText("Chennai");

  await page.getByTestId("lang-toggle").click();
  await expect(page.getByTestId("loc-chip-label")).toContainText("சென்னை");
  await page.getByTestId("loc-chip").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("இருப்பிடத்தை");
  await shot(page, "06-ta");
  await page.getByTestId("loc-back").click();
  await expect(page).toHaveURL(/\/$/);
});
