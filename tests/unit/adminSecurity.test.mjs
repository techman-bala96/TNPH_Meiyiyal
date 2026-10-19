import test from "node:test";
import assert from "node:assert/strict";
import { cleanCode, groupSecret, idleMs, adminHostRedirect } from "../../src/features/admin/security/totp.ts";
import { resolveCaptcha } from "../../src/features/captcha/provider.ts";

test("TOTP helpers", () => {
  assert.equal(cleanCode(" 12 34-56 7"), "123456");
  assert.equal(groupSecret("ABCDEFGHIJ"), "ABCD EFGH IJ");
  assert.equal(idleMs(undefined), 30 * 60_000); assert.equal(idleMs(1), 5 * 60_000); assert.equal(idleMs(9999), 240 * 60_000);
});
test("admin host redirect", () => {
  const loc = (host, pathname = "/admin") => ({ host, pathname, protocol: "https:" });
  assert.equal(adminHostRedirect("", loc("meiyiyal.com")), null);
  assert.equal(adminHostRedirect("admin.meiyiyal.com", loc("admin.meiyiyal.com")), null);
  assert.equal(adminHostRedirect("admin.meiyiyal.com", loc("meiyiyal.com", "/admin")), "https://admin.meiyiyal.com/admin");
  assert.equal(adminHostRedirect("Admin.Meiyiyal.com ", loc("ADMIN.meiyiyal.com")), null);
});
test("captcha provider resolution", () => {
  assert.deepEqual(resolveCaptcha(undefined, undefined, null, false), { provider: "none", siteKey: "" });
  assert.equal(resolveCaptcha("turnstile", "", null, false).provider, "none", "no site key → off, not a lockout");
  assert.equal(resolveCaptcha("turnstile", "0xKEY", null, false).provider, "turnstile");
  assert.equal(resolveCaptcha("none", "", "mock", true).provider, "mock", "dev override");
  assert.equal(resolveCaptcha("none", "", "mock", false).provider, "none", "no override in production builds");
  assert.equal(resolveCaptcha("bogus", "", null, false).provider, "none");
});
