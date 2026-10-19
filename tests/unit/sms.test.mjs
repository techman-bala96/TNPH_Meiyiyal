import { test } from "node:test";
import assert from "node:assert/strict";
import { Msg91, msisdn, pickSms } from "../../supabase/functions/_shared/sms.ts";

test("msisdn normalises Indian mobiles only", () => {
  assert.equal(msisdn("+91 98765 43210"), "919876543210");
  assert.equal(msisdn("9876543210"), "919876543210");
  assert.equal(msisdn("09876543210"), "919876543210");
  assert.throws(() => msisdn("+1 415 555 0100"));
  assert.throws(() => msisdn("5876543210"));
});

test("MSG91 flow request carries template id, sender and otp var", async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ type: "success", request_id: "r1" })); };
  const m = new Msg91("AK", { login_otp: "T-LOGIN", stepup: "T-STEP" }, "MEIYAL", f);
  assert.deepEqual(await m.send("+919876543210", "stepup", { otp: "123456" }), { id: "r1" });
  assert.equal(seen.url, "https://control.msg91.com/api/v5/flow");
  assert.equal(seen.init.headers.authkey, "AK");
  assert.deepEqual(seen.body, { template_id: "T-STEP", short_url: "0", sender: "MEIYAL", recipients: [{ mobiles: "919876543210", otp: "123456" }] });
  const bad = new Msg91("AK", { login_otp: "", stepup: "T" }, undefined, async () => new Response(JSON.stringify({ type: "error", message: "DLT mismatch" })));
  await assert.rejects(() => bad.send("9876543210", "stepup", { otp: "1" }), /DLT mismatch/);
  await assert.rejects(() => bad.send("9876543210", "login_otp", { otp: "1" }), /template/);
});

test("pickSms: mock by default (writes to sink), msg91 needs a key", async () => {
  const rows = [];
  const s = pickSms(() => undefined, async (r) => { rows.push(r); });
  await s.send("9876543210", "login_otp", { otp: "4321" });
  assert.equal(s.name, "mock"); assert.equal(rows[0].vars.otp, "4321");
  assert.equal(pickSms((k) => (k === "SMS_PROVIDER" ? "msg91" : undefined), async () => {}), null);
  assert.equal(pickSms((k) => ({ SMS_PROVIDER: "msg91", MSG91_AUTH_KEY: "x" })[k], async () => {}).name, "msg91");
});
