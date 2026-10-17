import { expect, test } from "@playwright/test";
import { signInAt, sql } from "./workerFlow";
import { open, shot } from "./consultFlow";

test("bottom nav: Home / Conversations / Profile with active state; wallet inside Profile; not duplicated in the avatar menu; hidden in full-screen flows", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'bn-%@meiyiyal.test';`);
  const { ctx, page } = await open(browser);
  await page.goto("/login"); await expect(page.getByTestId("bottom-nav")).toHaveCount(0);
  await signInAt(page, page.request, "bn-user");
  const nav = page.getByTestId("bottom-nav");
  await expect(nav).toBeVisible();
  await expect(page.getByTestId("nav-home")).toHaveAttribute("data-active", "true");
  // nav sits at the bottom of the viewport and doesn't cover content
  const box = (await nav.boundingBox())!; const vh = page.viewportSize()!.height;
  expect(box.y + box.height).toBeGreaterThan(vh - 24);
  await shot(page, "28-bottomnav-home");

  // avatar menu no longer duplicates Profile / Conversations / Wallet
  await page.getByTestId("avatar-btn").click();
  for (const id of ["menu-profile", "menu-history", "menu-wallet"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId("menu-settings")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("nav-conversations").click();
  await expect(page).toHaveURL(/\/history$/); await expect(page.getByTestId("history-page")).toBeVisible();
  await expect(page.getByTestId("nav-conversations")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("nav-home")).toHaveAttribute("data-active", "false");
  await page.waitForTimeout(400); await shot(page, "28-bottomnav-conversations");

  await page.getByTestId("nav-profile").click();
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await expect(page.getByTestId("nav-profile")).toHaveAttribute("data-active", "true");
  await page.waitForTimeout(400); await shot(page, "28-bottomnav-profile");
  await page.getByTestId("profile-wallet").click();
  await expect(page.getByTestId("wallet-page")).toBeVisible();
  await expect(page.getByTestId("nav-profile")).toHaveAttribute("data-active", "true"); // wallet lives under Profile

  // browsing keeps Home active; full-screen flows hide the bar
  await page.getByTestId("nav-home").click(); await page.goto("/browse/professionals");
  await expect(page.getByTestId("nav-home")).toHaveAttribute("data-active", "true");
  await page.goto("/location"); await expect(page.getByTestId("bottom-nav")).toHaveCount(0);

  // Tamil labels
  await page.evaluate(() => localStorage.setItem("i18nextLng", "ta")); await page.goto("/history");
  await expect(page.getByTestId("nav-conversations")).toContainText("உரையாடல்கள்");
  await page.waitForTimeout(400); await shot(page, "28-bottomnav-tamil");
  await ctx.close();
});
