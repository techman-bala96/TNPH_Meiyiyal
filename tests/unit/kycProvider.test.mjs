import { test } from "node:test";
import assert from "node:assert/strict";
import { MockKyc, SurepassKyc, pickKycProvider } from "../../supabase/functions/_shared/kyc.ts";

test("picks no provider unless configured (production default is unavailable, not mock)", () => {
  assert.equal(pickKycProvider(() => undefined), null);
  assert.equal(pickKycProvider((k) => (k === "KYC_PROVIDER" ? "surepass" : undefined)), null);
  assert.equal(pickKycProvider((k) => (k === "KYC_PROVIDER" ? "mock" : undefined)).name, "mock");
  assert.equal(pickKycProvider((k) => ({ KYC_PROVIDER: "surepass", SUREPASS_TOKEN: "t" })[k]).name, "surepass");
});

test("mock: configured OTP only", async () => {
  const p = new MockKyc("654321");
  const { ref } = await p.sendOtp("900000000001");
  assert.match(ref, /^mock-/);
  assert.equal((await p.verifyOtp(ref, "123456")).ok, false);
  assert.equal((await p.verifyOtp(ref, "654321")).ok, true);
  await assert.rejects(() => p.sendOtp("900000000000"));
});

test("surepass: request shape, client_id round trip, legal name", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    if (url.endsWith("/generate-otp")) return new Response(JSON.stringify({ data: { client_id: "c-1", otp_sent: true }, success: true }));
    const body = JSON.parse(init.body);
    if (body.otp === "111111") return new Response(JSON.stringify({ data: { full_name: "Kavya R" }, success: true }));
    return new Response(JSON.stringify({ success: false }), { status: 422 });
  };
  const p = new SurepassKyc("tok", "https://example.test/api/v1", fetcher);
  assert.deepEqual(await p.sendOtp("900000000001"), { ref: "c-1" });
  assert.equal(calls[0].url, "https://example.test/api/v1/aadhaar-v2/generate-otp");
  assert.deepEqual(calls[0].body, { id_number: "900000000001" });
  assert.equal(calls[0].auth, "Bearer tok");
  assert.deepEqual(await p.verifyOtp("c-1", "111111"), { ok: true, legalName: "Kavya R" });
  assert.equal((await p.verifyOtp("c-1", "000000")).ok, false);
});
