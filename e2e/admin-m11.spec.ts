import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { grantAdmin, signInAt, sql } from "./workerFlow";

const SHOTS = process.env.M11_SHOTS ?? "/workspace/m11-shots";
const AT = { latitude: 13.0317, longitude: 80.27 };
async function fresh(browser: Browser, lang = "en") {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: AT, permissions: ["geolocation"], acceptDownloads: true });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript((l) => localStorage.setItem("i18nextLng", l), lang);
  return page;
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });

test.setTimeout(180_000);

test("invite codes: personal link captured before login, claimed once, admin sees who referred whom; campaign codes", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  sql(`DELETE FROM auth.users WHERE email LIKE 'ref${tag}%@meiyiyal.test';`);
  sql(`DELETE FROM public.referral_codes WHERE code = 'E2E-${tag.toUpperCase()}';`);
  // A gets a personal code on Profile.
  const a = await fresh(browser);
  await signInAt(a, a.request, `ref${tag}a`);
  await a.getByTestId("nav-profile").click();
  await a.getByTestId("input-name").fill(`Anbu Ref ${tag}`); await a.getByTestId("btn-save-profile").click();
  const code = (await a.getByTestId("invite-code").textContent())!.trim();
  expect(code).toMatch(/^M[A-Z2-9]{6}$/);
  await expect(a.getByTestId("invite-link")).toContainText(`/?ref=${code}`);
  await expect(a.getByTestId("invite-joined")).toHaveAttribute("data-n", "0");
  // own code is refused
  await a.getByTestId("invite-enter").fill(code); await a.getByTestId("invite-apply").click();
  await expect(a.getByText("You can't use your own code")).toBeVisible();
  await shot(a, "invite-card");

  // B opens A's worker invite link as a guest → redirected to login with the invite banner → signs in → claimed.
  const b = await fresh(browser);
  await b.goto(`/worker/register?ref=${code.toLowerCase()}`);
  await expect(b.getByTestId("login-invite")).toContainText(code);
  await shot(b, "login-invite");
  await signInAt(b, b.request, `ref${tag}b`);
  await expect(b.getByText(`Invite code ${code} applied`)).toBeVisible();
  await b.getByTestId("nav-profile").click();
  await expect(b.getByTestId("invite-referred-by")).toContainText(code);
  await expect(b.getByTestId("invite-enter")).toHaveCount(0);
  expect(sql(`SELECT count(*) FROM public.referrals r JOIN auth.users u ON u.id = r.referred_user WHERE u.email LIKE 'ref${tag}b%' AND r.code = '${code}' AND r.landing = 'worker'`)).toBe("1");

  await a.reload();
  await expect(a.getByTestId("invite-joined")).toHaveAttribute("data-n", "1");

  // Admin: top referrers + who → whom + campaign code.
  const adm = await fresh(browser);
  grantAdmin(await signInAt(adm, adm.request, `ref${tag}adm`));
  await adm.goto("/admin#referrals");
  const row = adm.locator(`[data-testid="ref-code-row"][data-code="${code}"]`);
  await expect(row).toHaveAttribute("data-uses", "1");
  await expect(row).toContainText(`Anbu Ref ${tag}`);
  await row.getByTestId("ref-see").click();
  await expect(adm.locator(`[data-testid="ref-row"][data-code="${code}"]`)).toHaveCount(1);
  await adm.getByTestId("ref-view-campaign").click();
  await adm.getByTestId("campaign-label").fill("E2E Facebook post");
  await adm.getByTestId("campaign-code").fill(`e2e-${tag}`);
  await adm.getByTestId("campaign-create").click();
  await expect(adm.locator(`[data-testid="ref-code-row"][data-code="E2E-${tag.toUpperCase()}"]`)).toBeVisible();
  await shot(adm, "admin-referrals");
  // no money moved
  expect(sql(`SELECT count(*) FROM public.wallet_transactions t JOIN public.wallets w ON w.id = t.wallet_id JOIN auth.users u ON u.id = w.user_id WHERE u.email LIKE 'ref${tag}a%' AND t.description NOT LIKE 'Test credits%'`)).toBe("0");
});

test("admin editors: settings (validated + audited), per-category auto-approve, commission, milestone, profession; districts view + CSV", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  sql(`DELETE FROM auth.users WHERE email LIKE 'adm${tag}%@meiyiyal.test';`);
  sql(`DELETE FROM public.reward_milestones WHERE slug = 'e2e_${tag}'; DELETE FROM public.taxonomy_nodes WHERE slug = 'professionals--lawyer--e2e-${tag}';`);
  const before = sql(`SELECT value FROM public.app_settings WHERE key = 'worker_message_daily_max'`);
  const page = await fresh(browser);
  grantAdmin(await signInAt(page, page.request, `adm${tag}`));
  try {
    await page.goto("/admin");
    await page.getByTestId("admin-tab-settings").click();
    await page.getByTestId("settings-grp-consult").click();
    const row = page.locator('[data-testid="setting-row"][data-key="worker_message_daily_max"]');
    await row.getByTestId("setting-input").fill("99");
    await row.getByTestId("setting-save").click();
    await expect(page.getByText("must be between 0 and 20")).toBeVisible();
    await row.getByTestId("setting-input").fill("4");
    await row.getByTestId("setting-save").click();
    await expect.poll(() => sql(`SELECT value FROM public.app_settings WHERE key = 'worker_message_daily_max'`)).toBe("4");
    // secrets never reach the browser
    await page.getByTestId("settings-filter").fill("pepper");
    await expect(page.getByTestId("setting-row")).toHaveCount(0);
    await page.getByTestId("settings-filter").fill("");
    await page.getByTestId("settings-grp-verification").click();
    const eng = page.locator('[data-testid="auto-cat"][data-cat="professionals--engineer"]');
    await eng.getByTestId("auto-cat-off").click();
    await expect(eng).toHaveAttribute("data-state", "off");
    await shot(page, "admin-settings");
    await eng.getByTestId("auto-cat-inherit").click();
    await expect(eng).toHaveAttribute("data-state", "inherit");

    await page.getByTestId("admin-tab-audit").click();
    await expect(page.locator('[data-testid="audit-row"][data-action="setting.set"]').first()).toBeVisible();

    await page.getByTestId("admin-tab-commission").click();
    await page.getByTestId("commission-node").selectOption("professionals--lawyer");
    await page.getByTestId("commission-pct").fill("16");
    await page.getByTestId("commission-add").click();
    const cr = page.locator('[data-testid="commission-row"][data-node="professionals--lawyer"]');
    await expect(cr).toBeVisible();
    await cr.getByTestId("commission-remove").click();
    await expect(cr).toHaveCount(0);

    await page.getByTestId("admin-tab-milestones").click();
    await page.getByTestId("ms-add").click();
    const ms = page.locator('[data-testid="ms-card"][data-slug=""]');
    await ms.getByTestId("ms-slug").fill(`e2e_${tag}`);
    await ms.getByTestId("ms-title-en").fill("Helper"); await ms.getByTestId("ms-title-ta").fill("உதவியாளர்");
    await ms.getByTestId("ms-desc-en").fill("Served 3"); await ms.getByTestId("ms-desc-ta").fill("3 சேவை");
    await ms.getByTestId("ms-threshold").fill("3");
    await ms.getByTestId("ms-save").click();
    await expect(page.locator(`[data-testid="ms-card"][data-slug="e2e_${tag}"]`)).toBeVisible();

    await page.getByTestId("admin-tab-catalog").click();
    await page.getByTestId("catalog-filter").fill("lawyer");
    const law = page.locator('[data-testid="cat-node"][data-slug="professionals--lawyer"]');
    await law.getByTestId("cat-node-open").click();
    await law.getByTestId("cat-child-slug").fill(`e2e-${tag}`);
    await law.getByTestId("cat-child-en").fill("E2E Law"); await law.getByTestId("cat-child-ta").fill("சோதனைச் சட்டம்");
    await law.getByTestId("cat-child-add").click();
    await expect(page.locator(`[data-testid="cat-node"][data-slug="professionals--lawyer--e2e-${tag}"]`)).toBeVisible();
    // the mandatory council check cannot be switched off for lawyers
    await law.locator('[data-testid="rule-row"][data-check="registry"]').getByTestId("rule-required").click();
    await expect(page.getByText("Aadhaar and council registration stay mandatory")).toBeVisible();
    await shot(page, "admin-catalog");

    // Professionals by district
    await page.getByTestId("admin-tab-districts").click();
    await expect(page.locator('[data-testid="district-row"]:not([data-slug=""])')).toHaveCount(38);
    await page.getByTestId("districts-prof-veterinary").click();
    await page.getByTestId("districts-status-approved").click();
    await expect(page.getByTestId("districts-table")).toBeVisible();
    await shot(page, "admin-districts");
    const dl = page.waitForEvent("download");
    await page.getByTestId("districts-csv").click();
    const file = await (await dl).path();
    const csv = readFileSync(file!, "utf8");
    expect(csv.split("\r\n")[0]).toBe("\uFEFFdistrict,district_ta,total,submitted,pending,approved,rejected,doctor,veterinary,lawyer,engineer");
    expect(csv).toContain("Ariyalur,அரியலூர்");
    expect(csv.trim().split("\r\n").length).toBeGreaterThanOrEqual(40);
    await page.getByTestId("districts-hide-zero").check();
    await page.getByTestId("districts-search").fill("Chennai");
  } finally {
    sql(`UPDATE public.app_settings SET value = '${before}' WHERE key = 'worker_message_daily_max'; DELETE FROM public.commission_rules WHERE node_slug = 'professionals--lawyer';`);
  }
});

test("Tamil admin: districts and settings render in Tamil", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  sql(`DELETE FROM auth.users WHERE email LIKE 'admta${tag}%@meiyiyal.test';`);
  const page = await fresh(browser, "ta");
  grantAdmin(await signInAt(page, page.request, `admta${tag}`));
  await page.goto("/admin#districts");
  await expect(page.getByText("மாவட்ட வாரியான நிபுணர்கள்").first()).toBeVisible();
  await expect(page.getByTestId("districts-table")).toContainText("அரியலூர்");
  await shot(page, "admin-districts-ta");
  await page.getByTestId("admin-tab-settings").click();
  await expect(page.getByTestId("settings-editor")).toContainText("சரிபார்ப்பு");
  await shot(page, "admin-settings-ta");
  await page.getByTestId("admin-tab-referrals").click();
  await shot(page, "admin-referrals-ta");
});
