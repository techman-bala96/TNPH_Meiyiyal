import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { fresh, shot } from "./shots";
import { grantAdmin, signInAt, sql } from "./workerFlow";

function totp(secret: string, at = Date.now()) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alpha.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

test("admin needs an authenticator: enrol with QR/secret, wrong code refused, then the console opens", async ({ browser }) => {
  const tag = test.info().project.name.endsWith("mobile") ? "m" : "d";
  sql(`DELETE FROM auth.users WHERE email LIKE 'mfa${tag}%@meiyiyal.test';`);
  sql(`UPDATE public.app_settings SET value = 'true' WHERE key = 'admin_mfa_required'`);
  try {
    const p = await fresh(browser);
    const email = await signInAt(p, p.request, `mfa${tag}`);
    grantAdmin(email);
    await p.goto("/admin");
    await expect(p.getByTestId("admin-mfa")).toBeVisible();
    await expect(p.getByTestId("mfa-qr")).toBeVisible();
    // the database refuses admin work before the second factor, whatever the UI does
    const before = await p.evaluate(async () => { const { supabase } = await import("/src/integrations/supabase/client.ts"); const r = await supabase.rpc("admin_settings"); return r.error?.message ?? "ok"; });
    expect(before).toMatch(/admin only/);
    await shot(p, "admin-mfa-enrol");
    const secret = (await p.getByTestId("mfa-secret").getAttribute("data-secret"))!;
    const good = totp(secret); const bad = good === "000000" ? "111111" : "000000";
    await p.getByTestId("mfa-code").fill(bad); await p.getByTestId("mfa-verify").click();
    await expect(p.getByTestId("mfa-error")).toBeVisible();
    await p.getByTestId("mfa-code").fill(totp(secret)); await p.getByTestId("mfa-verify").click();
    await expect(p.getByTestId("admin-page")).toBeVisible();
    await expect(p.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await p.getByTestId("admin-tab-security").click();
    await expect(p.getByTestId("admins-card")).toBeVisible();
    await shot(p, "admin-security");
    expect(sql(`SELECT count(*) FROM public.admin_audit a JOIN auth.users u ON u.id = a.actor WHERE u.email = '${email}' AND a.action IN ('admin.mfa.enrolled','admin.mfa.verified')`)).toBe("2");
    // reload keeps the aal2 session
    await p.reload(); await expect(p.getByTestId("admin-page")).toBeVisible();
  } finally {
    sql(`UPDATE public.app_settings SET value = 'false' WHERE key = 'admin_mfa_required'`);
  }
});

test("sign-in captcha adapter: mock widget must be ticked before a link is sent", async ({ browser }) => {
  const p = await fresh(browser);
  await p.addInitScript(() => localStorage.setItem("meiyiyal-captcha", "mock"));
  await p.goto("/login");
  await p.getByTestId("btn-email").click();
  await p.getByTestId("input-email").fill("captcha-e2e@meiyiyal.test");
  await expect(p.getByTestId("btn-send-link")).toBeDisabled();
  await p.getByTestId("captcha-mock").click();
  await expect(p.getByTestId("btn-send-link")).toBeEnabled();
  await shot(p, "login-captcha");
  await p.getByTestId("btn-send-link").click();
  await expect(p.getByTestId("email-sent")).toBeVisible();
});
