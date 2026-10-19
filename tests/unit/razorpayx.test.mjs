import { test } from "node:test";
import assert from "node:assert/strict";
import { RazorpayX, RazorpayXError, failureKind, payoutEventType } from "../../supabase/functions/_shared/razorpayx.ts";

function fake(routes) {
  const calls = [];
  const fetcher = async (url, init) => {
    const path = url.replace("https://rx.test/v1", "");
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const h = routes[`${init.method} ${path}`];
    if (!h) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", description: "no route" } }), { status: 404 });
    const [status, body] = typeof h === "function" ? h(calls.at(-1)) : h;
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, rx: new RazorpayX({ keyId: "rzp_test_k", keySecret: "s", accountNumber: "2323230000000000", base: "https://rx.test/v1", fetcher }) };
}

test("contact → bank fund account → penny drop: request shapes and basic auth", async () => {
  const { calls, rx } = fake({
    "POST /contacts": [200, { id: "cont_1" }],
    "POST /fund_accounts": [200, { id: "fa_1" }],
    "POST /fund_accounts/validations": [200, { id: "fav_1", status: "created" }],
    "GET /fund_accounts/validations/fav_1": [200, { id: "fav_1", status: "completed", results: { account_status: "active", registered_name: "KAVITHA RAMAN" } }],
  });
  const c = await rx.createContact({ name: "Kavitha Raman", referenceId: "u1", phone: "9000000000" });
  const fa = await rx.createFundAccount(c, { kind: "bank", name: "Kavitha Raman", ifsc: "HDFC0000001", account: "123456789012" });
  const v = await rx.validateAndWait(fa, "bank", "u1", 5000, 1000, async () => {});
  assert.deepEqual(v, { id: "fav_1", status: "completed", accountStatus: "active", registeredName: "KAVITHA RAMAN" });
  assert.equal(calls[0].headers.authorization, "Basic " + Buffer.from("rzp_test_k:s").toString("base64"));
  assert.deepEqual(calls[0].body, { name: "Kavitha Raman", type: "vendor", reference_id: "u1", contact: "9000000000" });
  assert.deepEqual(calls[1].body.bank_account, { name: "Kavitha Raman", ifsc: "HDFC0000001", account_number: "123456789012" });
  assert.deepEqual(calls[2].body, { account_number: "2323230000000000", fund_account: { id: "fa_1" }, amount: 100, currency: "INR", notes: { reference: "u1" } });
});

test("UPI fund account and validation carry no amount", async () => {
  const { calls, rx } = fake({
    "POST /fund_accounts": [200, { id: "fa_2" }],
    "POST /fund_accounts/validations": [200, { id: "fav_2", status: "completed", results: { account_status: "invalid" } }],
  });
  await rx.createFundAccount("cont_1", { kind: "upi", vpa: "kavi@okhdfc" });
  const v = await rx.validate("fa_2", "upi", "u1");
  assert.equal(v.accountStatus, "invalid");
  assert.deepEqual(calls[0].body, { contact_id: "cont_1", account_type: "vpa", vpa: { address: "kavi@okhdfc" } });
  assert.equal(calls[1].body.amount, undefined);
});

test("payout: paise, mode, idempotency header, errors classified", async () => {
  const { calls, rx } = fake({
    "POST /payouts": (c) => c.body.amount === 123450 ? [200, { id: "pout_1", status: "processing" }] : [400, { error: { code: "BAD_REQUEST_ERROR", description: "bad" } }],
  });
  const r = await rx.createPayout({ payoutId: "p-1", fundAccountId: "fa_1", amountRupees: 1234.5, kind: "upi" });
  assert.equal(r.id, "pout_1");
  assert.equal(calls[0].body.mode, "UPI");
  assert.equal(calls[0].body.reference_id, "p-1");
  assert.equal(calls[0].headers["X-Payout-Idempotency"], "p-1");
  await assert.rejects(() => rx.createPayout({ payoutId: "p-2", fundAccountId: "fa_1", amountRupees: 1, kind: "bank" }), (e) => e instanceof RazorpayXError && !e.retryable);
  assert.equal(new RazorpayXError(503, null, "x").retryable, true);
  assert.equal(new RazorpayXError(0, "network", "x").retryable, true);
});

test("status and failure mapping", () => {
  assert.equal(payoutEventType("processed"), "payout.processed");
  assert.equal(payoutEventType("rejected"), "payout.failed");
  assert.equal(payoutEventType("processing"), null);
  assert.equal(failureKind("Beneficiary account is closed"), "beneficiary");
  assert.equal(failureKind("Beneficiary bank is offline"), "provider:beneficiary bank is offline");
  assert.equal(failureKind("Invalid account number"), "beneficiary");
  assert.equal(failureKind("Payout failed due to insufficient balance"), "provider:payout failed due to insufficient balance");
});
