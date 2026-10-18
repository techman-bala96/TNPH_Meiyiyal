/** First open from scratch: fresh browser profile, no account, Tamil chosen on the first screen, phone OTP sign-up, onboarding, install card. */
import { expect, test } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { sql } from "./workerFlow";
import { lang, snap } from "./scenario";

test("[FS01] first open on a new phone: Tamil chosen → phone OTP sign-up → location → name → Home with the install card → Install opens the browser prompt", async ({ browser }) => {
  lang("en + ta");
  sql(`DELETE FROM auth.users WHERE phone = '919000000001';`); // this test number is reused by every run
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: { latitude: 13.0317, longitude: 80.27 }, permissions: ["geolocation"] });
  const p = await ctx.newPage(); await mockMapNetwork(p);
  const errors: string[] = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(() => {
    // Chrome fires beforeinstallprompt when the PWA is installable; simulate it a moment after load
    (window as unknown as { __prompted: number }).__prompted = 0;
    setTimeout(() => { const e = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => { (window as unknown as { __prompted: number }).__prompted++; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); }, 300);
  });
  await p.goto("/");
  await expect(p).toHaveURL(/\/login$/);
  await snap(p, "FS01", "01-first-open");
  await p.getByTestId("lang-toggle").first().click();
  await expect(p.locator("html")).toHaveAttribute("lang", "ta");
  await snap(p, "FS01", "02-tamil");
  await p.getByTestId("btn-phone").click();
  await p.getByTestId("input-phone").fill("9000000001");
  await p.getByTestId("btn-send-otp").click();
  await p.getByTestId("input-otp").focus(); await p.keyboard.type("654321");
  await snap(p, "FS01", "03-otp-ta");
  await p.getByTestId("btn-verify").click();
  await expect(p).toHaveURL(/\/location$/);
  await expect(p.getByTestId("sheet-place")).toBeVisible();
  await snap(p, "FS01", "04-location-ta");
  await p.getByTestId("btn-confirm").click();
  await expect(p.getByTestId("find-panel")).toBeVisible();
  await expect(p.getByTestId("install-card")).toBeVisible();
  await expect(p.getByTestId("install-card")).toContainText(/[\u0B80-\u0BFF]/);
  await snap(p, "FS01", "05-home-install-ta");
  await p.getByTestId("install-go").click();
  await expect.poll(() => p.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  await expect(p.getByTestId("install-card")).toHaveCount(0);
  await p.getByTestId("nav-profile").click();
  await p.getByTestId("input-name").fill("முதல் பயனர்");
  await expect(p.getByTestId("input-phone-profile")).toHaveValue("9000000001"); // the number used to sign up, without +91
  await p.getByTestId("btn-save-profile").click();
  await expect(p.getByTestId("profile-error")).toHaveCount(0);
  await expect(p.getByText("சுயவிவரம் சேமிக்கப்பட்டது").or(p.getByText("Profile saved"))).toBeVisible();
  await snap(p, "FS01", "06-profile-ta");
  await p.reload();
  await expect(p.locator("html")).toHaveAttribute("lang", "ta"); // language remembered
  await expect(p.getByTestId("input-name")).toHaveValue("முதல் பயனர்");
  // "Not now" hides the card for 30 days
  await p.goto("/"); await p.evaluate(() => localStorage.removeItem("meiyiyal-install-dismissed"));
  await p.reload(); await expect(p.getByTestId("install-card")).toBeVisible();
  await p.getByTestId("install-later").click(); await p.reload();
  await p.waitForTimeout(800); await expect(p.getByTestId("install-card")).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});
