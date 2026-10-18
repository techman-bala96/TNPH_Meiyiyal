import { expect, test, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { WORKERS, adminApprove, grantAdmin, registerWorker, setProfile, signInAt, sql } from "./workerFlow";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shotter = (page: Page) => (name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: `${SHOTS}/${p}-worker-reg-${name}.png`, fullPage: true });
};

/** Checks the worker and admin screens read. Written through the service RPC, not the UI. */
function seedQueueChecks(displayName: string) {
  const name = displayName.replace(/'/g, "");
  sql(`
    SELECT public.verification_write_check(c.id, v.chk, 'e2e', v.st, 1, '{}'::jsonb)
    FROM public.verification_cases c
    JOIN public.workers w ON w.id = c.worker_id
    CROSS JOIN (VALUES
      ('aadhaar','pass'), ('qr','review'), ('liveness','pass'),
      ('documents','pass'), ('registry','review'), ('duplicates','pass')
    ) AS v(chk, st)
    WHERE w.display_name = '${name}';
  `);
}

test.setTimeout(120_000);
test("Doctor registers (Aadhaar OTP + docs) -> pending -> admin approves -> Go Online; non-admin blocked from /admin", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'w-%@meiyiyal.test' OR email LIKE 'regdoc+%@meiyiyal.test' OR id = '00000000-0000-0000-0000-00000000e2e1';`);
  const w = WORKERS[0];
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: w.at, permissions: ["geolocation"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  const email = await signInAt(page, page.request, "regdoc");
  await page.goto("/admin");
  await expect(page.getByTestId("find-panel")).toBeVisible(); // not admin -> bounced
  await setProfile(page, w.name, w.photo);
  await expect(page.getByTestId("go-online")).toHaveCount(0);
  await shotter(page)("00-worker-tab");
  await registerWorker(page, w, shotter(page));
  seedQueueChecks(w.name);
  await page.reload();
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("verify-checks")).toBeVisible();
  await expect(page.getByTestId("verify-check").first()).toBeVisible();
  await shotter(page)("06-status");

  const actx = await browser.newContext({ ...test.info().project.use, geolocation: w.at, permissions: ["geolocation"] });
  const admin = await actx.newPage(); await mockMapNetwork(admin);
  await admin.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  const aemail = await signInAt(admin, admin.request, "admin");
  grantAdmin(aemail); await admin.reload();
  await adminApprove(admin, [w.name], async (name) => {
    if (name === "06-admin-queue") await expect(admin.getByTestId("admin-checks").first()).toBeVisible();
    await shotter(admin)(name);
  });

  await page.reload();
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
  await page.getByTestId("go-online").click();
  await expect(page.getByTestId("go-online")).toBeChecked();
  await shotter(page)("07-online");
  // profession shown + locked in Profile & Settings
  await page.goto("/profile");
  await expect(page.getByTestId("worker-badge")).toHaveAttribute("data-status", "approved");
  await expect(page.getByTestId("worker-badge-profession")).toContainText("Doctor");
  await expect(page.getByTestId("worker-badge-profession").locator("svg")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("worker-badge")).toContainText("Paediatrics");
  await page.goto("/?tab=worker");
  await page.reload();
  await expect(page.getByTestId("go-online")).toBeChecked();
  await page.getByTestId("go-online").click(); // offline again so other suites stay deterministic
  await expect(page.getByTestId("go-online")).not.toBeChecked();
  const wid = sql(`SELECT w.id FROM public.workers w JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${email.replace(/'/g, "")}';`);
  await page.goto(`/w/${wid}`);
  await expect(page.getByTestId("badge-tier")).toHaveAttribute("data-tier", "licence");
  await expect(page.getByTestId("verified-on")).toBeVisible();
  await shotter(page)("08-public-licence");
  const degreeId = seedDegreeProfile();
  await page.goto(`/w/${degreeId}`);
  await expect(page.getByTestId("badge-tier")).toHaveAttribute("data-tier", "degree");
  await expect(page.getByTestId("verified-on")).toBeVisible();
  await shotter(page)("09-public-degree");
  await ctx.close(); await actx.close();
  sql(`DELETE FROM auth.users WHERE email LIKE 'regdoc+%@meiyiyal.test' OR id = '00000000-0000-0000-0000-00000000e2e1';`);
});

/** Approved civil engineer so the public profile can show the degree badge. */
function seedDegreeProfile() {
  const out = sql(`
    INSERT INTO auth.users(id, email, aud, role) VALUES
      ('00000000-0000-0000-0000-00000000e2e1','degree-badge@meiyiyal.test','authenticated','authenticated')
    ON CONFLICT (id) DO NOTHING;
    SELECT set_config('meiyiyal.trusted','on', false);
    INSERT INTO public.workers(user_id, category, primary_node, display_name, years_experience, about, reg_data, status, is_active, is_verified, badge_tier, verified_at, decided_at)
    VALUES ('00000000-0000-0000-0000-00000000e2e1','professional','professionals--engineer--civil','Er. Degree Badge',7,'Plan review',
      '{"degree":"BE","discipline":"Civil","institution":"Anna University"}'::jsonb,
      'approved', true, true, 'degree', now(), now())
    ON CONFLICT (user_id) DO UPDATE SET status='approved', is_active=true, is_verified=true, badge_tier='degree', verified_at=now(), display_name=EXCLUDED.display_name;
    SELECT set_config('meiyiyal.trusted','off', false);
    SELECT id FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000e2e1';
  `);
  const id = out.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  if (!id) throw new Error("degree profile was not created");
  return id;
}
