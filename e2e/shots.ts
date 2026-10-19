import { test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";

export const SHOTS = process.env.M11_SHOTS ?? "/workspace/m11-shots";
export const AT = { latitude: 13.0317, longitude: 80.27 };
export async function fresh(browser: Browser, lang = "en") {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: AT, permissions: ["geolocation"], acceptDownloads: true });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript((l) => localStorage.setItem("i18nextLng", l), lang);
  return page;
}
/** Viewport screenshot with toasts hidden; `focus` is scrolled to just under the sticky header. */
export async function shot(page: Page, name: string, focus?: string) {
  const hide = await page.addStyleTag({ content: "[data-sonner-toaster]{visibility:hidden!important}" });
  if (focus) await page.getByTestId(focus).first().evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: "instant" as ScrollBehavior }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
  await hide.evaluate((el) => el.remove());
}
