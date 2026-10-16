import { expect, test, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const MAILPIT = "http://127.0.0.1:54324";
const KANNIYAKUMARI = { latitude: 8.0883, longitude: 77.5385 }; // Kanyakumari town
const shot = (page: Page, name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: p === "mobile" ? `${SHOTS}/11-map-${name}.png` : `${SHOTS}/desktop-11-map-${name}.png`, fullPage: true });
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
  await mockMapNetwork(page);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});
const tilesLoaded = (page: Page) => page.waitForFunction(() => {
  const t = [...document.querySelectorAll<HTMLImageElement>(".leaflet-tile")];
  return t.length > 0 && t.every((i) => i.complete);
});

test("Map: auto-detects GPS on open, pin + reverse address, drag adjusts, confirm saves exact lat/lng", async ({ page, context, request }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(KANNIYAKUMARI);
  await loginNewEmail(page, request);
  await expect(page).toHaveURL(/\/location$/);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByTestId("center-pin")).toBeVisible();
  await expect(page.getByTestId("sheet-place")).toHaveText("Kanniyakumari"); // town area, not Nagercoil
  await expect(page.getByTestId("sheet-address")).toContainText("Kanyakumari");
  // EN|தமிழ் toggle fully inside the viewport (was clipped)
  const tb = (await page.getByTestId("lang-toggle").boundingBox())!;
  expect(tb.x + tb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  await tilesLoaded(page);
  await shot(page, "01-gps-pin-sheet");

  // drag the map a little -> pin moves, still resolves
  const box = (await page.getByTestId("map").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 3 + 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("btn-confirm")).toBeEnabled();
  await expect(page.getByTestId("sheet-place")).toContainText("Kanniyakumari");
  await page.getByTestId("btn-confirm").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("loc-chip-label")).toContainText("Kanniyakumari");
  await page.reload();
  await expect(page.getByTestId("loc-chip-label")).toContainText("Kanniyakumari");
});

test("Map: GPS denied -> message; seeded + Nominatim search moves map; change from header; Tamil", async ({ page, request }) => {
  await loginNewEmail(page, request);
  await expect(page).toHaveURL(/\/location$/);
  await expect(page.getByTestId("loc-error")).toBeVisible(); // permission not granted
  await page.goto("/"); // guard: Home requires a location
  await expect(page).toHaveURL(/\/location$/);

  await page.getByTestId("loc-search").fill("Nager");
  await page.getByTestId("area-hit").filter({ hasText: "Nagercoil" }).click();
  await expect(page.getByTestId("sheet-place")).toContainText("Nagercoil, Kanniyakumari");
  await page.getByTestId("btn-confirm").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("loc-chip-label")).toContainText("Nagercoil, Kanniyakumari");

  await page.getByTestId("loc-chip").click();
  await expect(page).toHaveURL(/\/location$/);
  await page.getByTestId("loc-search").fill("Marina beach");
  await expect(page.getByTestId("place-hit")).toHaveCount(0); // no autocomplete calls to Nominatim
  await page.getByTestId("loc-search").press("Enter");
  await expect(page.getByTestId("place-hit").first()).toContainText("Marina Beach");
  await shot(page, "02-search-results");
  await page.getByTestId("place-hit").first().click();
  await expect(page.getByTestId("sheet-place")).toHaveText("Mylapore, Chennai"); // nearest seeded area by real coords
  await expect(page.getByTestId("sheet-address")).toContainText("Marina Beach");
  await tilesLoaded(page);
  await shot(page, "03-confirm-sheet");
  await page.getByTestId("btn-confirm").click();
  await expect(page.getByTestId("loc-chip-label")).toContainText("Chennai");

  await page.getByTestId("loc-search").waitFor({ state: "detached" });
  await page.getByTestId("lang-toggle").click();
  await expect(page.getByTestId("loc-chip-label")).toContainText("சென்னை");
  await page.getByTestId("loc-chip").click();
  await expect(page.getByTestId("btn-confirm")).toContainText("உறுதிசெய்");
  await tilesLoaded(page);
  await shot(page, "04-ta");
  await page.getByTestId("loc-back").click();
  await expect(page).toHaveURL(/\/$/);
});
