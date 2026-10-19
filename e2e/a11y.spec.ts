import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fresh } from "./shots";
import { grantAdmin, signInAt, sql } from "./workerFlow";

// WCAG 2.1 A/AA via axe-core. Serious and critical findings fail the test; moderate/minor are reported in the attachment.
async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important} *{transition:none!important;animation:none!important}" });
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await test.info().attach(`axe-${label}.json`, { body: JSON.stringify(r.violations, null, 2), contentType: "application/json" });
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)} → ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 200)}`).join(" | ")}`);
  expect(bad, `${label}: ${bad.join("\n")}`).toEqual([]);
}

test.setTimeout(240_000);

test("public pages pass axe (en + ta)", async ({ browser }) => {
  for (const lang of ["en", "ta"]) {
    const p = await fresh(browser, lang);
    for (const path of ["/login", "/privacy", "/terms"]) { await p.goto(path); await scan(p, `${lang}${path.replace(/\//g, "-")}`); }
    await p.goto("/login"); await p.getByTestId("btn-phone").click(); await scan(p, `${lang}-login-phone`);
    await p.context().close();
  }
});

test("signed-in user pages pass axe", async ({ browser }) => {
  const tag = test.info().project.name.slice(0, 1);
  sql(`DELETE FROM auth.users WHERE email LIKE 'a11y${tag}%@meiyiyal.test';`);
  const p = await fresh(browser);
  await signInAt(p, p.request, `a11y${tag}`);
  await scan(p, "home");
  for (const path of ["/profile", "/settings", "/wallet", "/history", "/notifications", "/messages", "/location", "/worker/register"]) {
    await p.goto(path); await scan(p, path.slice(1).replace(/\//g, "-"));
  }
  await p.goto("/browse/professionals"); await scan(p, "browse");
});

test("admin console passes axe", async ({ browser }) => {
  const tag = test.info().project.name.slice(0, 1);
  sql(`DELETE FROM auth.users WHERE email LIKE 'a11yadm${tag}%@meiyiyal.test';`);
  const p = await fresh(browser);
  const email = await signInAt(p, p.request, `a11yadm${tag}`); grantAdmin(email);
  await p.goto("/admin");
  for (const tab of ["queue", "districts", "referrals", "payments", "settings", "catalog", "milestones", "security", "audit"]) {
    await p.getByTestId(`admin-tab-${tab}`).click(); await scan(p, `admin-${tab}`);
  }
});
