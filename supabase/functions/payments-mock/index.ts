// Local stand-in for Razorpay Checkout (no keys yet). Only works while the mock provider is active.
// success → returns a payment id + Razorpay-style HMAC signature for the client to pass to payments-verify (same path as real Checkout)
// failure → records the failure server-side, like the gateway's payment.failed.
import { cors, json, admin, requireUser, pickProvider, MockProvider } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const provider = await pickProvider();
  if (!(provider instanceof MockProvider)) return json({ error: "mock gateway disabled" }, 403);
  const u = await requireUser(req); if (!u) return json({ error: "unauthorized" }, 401);
  const { provider_order_id, outcome } = await req.json().catch(() => ({}));
  const { data: own } = await u.sb.from("payment_orders").select("id,status,provider").eq("provider_order_id", provider_order_id ?? "").maybeSingle();
  if (!own || own.provider !== "mock") return json({ error: "order not found" }, 404);
  if (outcome === "failure") {
    await admin().rpc("payment_mark_failed", { _provider_order_id: provider_order_id, _reason: "BAD_REQUEST_ERROR: Payment declined by bank (mock)" });
    return json({ error: { code: "BAD_REQUEST_ERROR", description: "Payment declined by bank (mock)" } });
  }
  const paymentId = "pay_mock_" + crypto.randomUUID().replaceAll("-", "").slice(0, 14);
  return json({ razorpay_order_id: provider_order_id, razorpay_payment_id: paymentId, razorpay_signature: await provider.sign(provider_order_id, paymentId) });
});
