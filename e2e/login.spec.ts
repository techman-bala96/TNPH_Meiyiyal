import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const MAILPIT = "http://127.0.0.1:54324";
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test("login page renders 3 options + Tamil toggle; unauthenticated / redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  for (const id of ["btn-google", "btn-email", "btn-phone"]) await expect(page.getByTestId(id)).toBeVisible();
  await shot(page, "01-login-en");
  await page.getByTestId("lang-toggle").click();
  await expect(page.getByTestId("btn-google")).toContainText("Google மூலம்");
  await shot(page, "02-login-ta");
});

test("phone OTP: send + verify signs in (local test_otp), sign out works", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("btn-phone").click();
  await page.getByTestId("input-phone").fill("12345");
  await page.getByTestId("btn-send-otp").click();
  await expect(page.getByTestId("auth-error")).toBeVisible();
  await page.getByTestId("input-phone").fill("9876543210");
  await shot(page, "03-phone");
  await page.getByTestId("btn-send-otp").click();
  await expect(page.getByTestId("btn-verify")).toBeVisible();
  await page.keyboard.type("000000");
  await page.getByTestId("btn-verify").click();
  await expect(page.getByTestId("auth-error")).toBeVisible(); // wrong OTP rejected
  await page.getByTestId("input-otp").focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type("123456");
  await shot(page, "04-otp");
  await page.getByTestId("btn-verify").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("signed-in-as")).toContainText("919876543210");
  await shot(page, "05-phone-signed-in");
  await page.reload(); // session persists
  await expect(page.getByTestId("signed-in-as")).toBeVisible();
  await page.getByTestId("btn-signout").click();
  await expect(page).toHaveURL(/\/login$/);
});

test("email magic link: link delivered to local Mailpit and signs in", async ({ page, request }) => {
  const email = `e2e+${test.info().project.name}-${Date.now()}@meiyiyal.test`;
  await page.goto("/login");
  await page.getByTestId("btn-email").click();
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("btn-send-link").click();
  await expect(page.getByTestId("email-sent")).toBeVisible();
  await shot(page, "06-email-sent");

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
  expect(link, "magic link email").toBeTruthy();
  expect(decodeURIComponent(link!)).toContain("redirect_to=http://localhost:8080/auth/callback");
  await page.goto(link!);
  await expect(page.getByTestId("signed-in-as")).toHaveText(email);
  await shot(page, "07-email-signed-in");
});

test("Google OAuth: redirects to accounts.google.com with our client + callback", async ({ page }) => {
  await page.goto("/login");
  const req = page.waitForRequest((r) => r.url().startsWith("https://accounts.google.com/"));
  await page.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, body: "google-stub" }));
  await page.getByTestId("btn-google").click();
  const url = new URL((await req).url());
  expect(url.pathname).toContain("/o/oauth2");
  expect(url.searchParams.get("client_id")).toBeTruthy();
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:54321/auth/v1/callback");
  expect(url.searchParams.get("scope")).toContain("email");
});
