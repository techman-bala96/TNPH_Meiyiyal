import { expect, test } from "@playwright/test";
import { fresh, shot } from "./shots";
import { grantAdmin, signInAt, sql } from "./workerFlow";

// Tablet screenshots of the M11 screens (mobile/desktop shots come from the feature specs). Output: $M11_SHOTS/tablet-*.png
test.setTimeout(180_000);

test("M11 screens on tablet (en + ta)", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'tabshot%@meiyiyal.test';`);
  const pub = await fresh(browser, "ta");
  await pub.goto("/privacy"); await expect(pub.getByTestId("legal-draft")).toBeVisible(); await shot(pub, "privacy-ta");
  await pub.goto("/terms"); await shot(pub, "terms-ta", "grievance");
  const p = await fresh(browser);
  const email = await signInAt(p, p.request, "tabshot");
  await p.getByTestId("nav-profile").click(); await expect(p.getByTestId("invite-card")).toBeVisible(); await shot(p, "invite-card", "invite-card");
  await p.goto("/wallet"); await shot(p, "wallet");
  await p.goto("/settings"); await p.getByTestId("delete-start").click(); await shot(p, "your-data", "your-data");
  grantAdmin(email);
  for (const tab of ["districts", "referrals", "settings", "catalog", "milestones", "commission", "security"]) {
    await p.goto(`/admin#${tab}`); await p.reload(); await expect(p.getByTestId("admin-page")).toBeVisible();
    await p.waitForLoadState("networkidle").catch(() => undefined); await shot(p, `admin-${tab}`);
  }
  const ta = await fresh(browser, "ta");
  await signInAt(ta, ta.request, "tabshotta"); grantAdmin(sql(`SELECT email FROM auth.users WHERE email LIKE 'tabshotta%' ORDER BY created_at DESC LIMIT 1`));
  await ta.goto("/admin#districts"); await ta.reload(); await expect(ta.getByTestId("admin-page")).toBeVisible();
  await ta.waitForLoadState("networkidle").catch(() => undefined); await shot(ta, "admin-districts-ta");
  await ta.goto("/settings"); await shot(ta, "settings-ta", "your-data");
});
