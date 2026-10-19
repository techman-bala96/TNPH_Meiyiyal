import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStandardWebhook } from "../../supabase/functions/_shared/standardWebhook.ts";

const secretBytes = Buffer.from("super-secret-hook-key-for-tests!");
const secret = "v1,whsec_" + secretBytes.toString("base64");
const sign = (id, ts, body) => "v1," + createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64");

test("accepts a valid Standard Webhooks signature, rejects tampering and stale timestamps", async () => {
  const body = JSON.stringify({ user: { phone: "+919876543210" }, sms: { otp: "123456" } });
  const now = 1_800_000_000;
  const h = (sig, ts = String(now)) => new Headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sig });
  assert.equal(await verifyStandardWebhook(secret, h(sign("msg_1", now, body)), body, now), true);
  assert.equal(await verifyStandardWebhook(secret, h("v1,bogus " + sign("msg_1", now, body)), body, now), true);
  assert.equal(await verifyStandardWebhook(secret, h(sign("msg_1", now, body)), body + " ", now), false);
  assert.equal(await verifyStandardWebhook(secret, h(sign("msg_1", now - 600, body), String(now - 600)), body, now), false);
  assert.equal(await verifyStandardWebhook("", h(sign("msg_1", now, body)), body, now), false);
});
