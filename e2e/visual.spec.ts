import { expect, test, type Page } from "@playwright/test";
import { fresh } from "./shots";
import { signInAt, sql } from "./workerFlow";

// Visual regression: stable screens compared with committed baselines (e2e/visual.spec.ts-snapshots/, per platform).
// Baselines are Linux renders (build box / CI); font rasterising differs on Windows/macOS, so it only runs on Linux.
// Refresh after an intended UI change:  npx playwright test e2e/visual.spec.ts --update-snapshots
test.skip(process.platform !== "linux", "visual baselines are Linux renders");

async function settle(p: Page) {
  await p.addStyleTag({ content: "[data-sonner-toaster]{display:none!important} *{caret-color:transparent!important}" });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
}

test("public screens look the same (en + ta)", async ({ browser }) => {
  for (const lang of ["en", "ta"]) {
    const p = await fresh(browser, lang);
    await p.goto("/login"); await expect(p.getByTestId("btn-google")).toBeVisible(); await settle(p);
    await expect(p).toHaveScreenshot(`login-${lang}.png`);
    await p.getByTestId("btn-phone").click(); await settle(p);
    await expect(p).toHaveScreenshot(`login-phone-${lang}.png`);
    await p.goto("/privacy"); await expect(p.getByTestId("legal-draft")).toBeVisible(); await settle(p);
    await expect(p).toHaveScreenshot(`privacy-${lang}.png`);
    await p.goto("/terms"); await expect(p.getByTestId("legal-draft")).toBeVisible(); await settle(p);
    await expect(p).toHaveScreenshot(`terms-${lang}.png`);
    await p.context().close();
  }
});

test("settings screen looks the same", async ({ browser }) => {
  const tag = test.info().project.name.slice(0, 1);
  sql(`DELETE FROM auth.users WHERE email LIKE 'vis${tag}%@meiyiyal.test';`);
  const p = await fresh(browser);
  await signInAt(p, p.request, `vis${tag}`);
  await p.goto("/settings"); await expect(p.getByTestId("your-data")).toBeVisible(); await settle(p);
  await expect(p).toHaveScreenshot("settings-en.png", { fullPage: false });
});
