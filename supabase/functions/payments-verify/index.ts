// Checkout success handler → verify HMAC signature server-side → credit (idempotent). The client can never credit itself.
import { cors, json, admin, requireUser, pickProvider } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const provider = await pickProvider(); if (!provider) return json({ error: "payments_unavailable" }, 503);
  const u = await requireUser(req); if (!u) return json({ error: "unauthorized" }, 401);
  const b = await req.json().catch(() => ({}));
  const orderId = b.razorpay_order_id, paymentId = b.razorpay_payment_id, signature = b.razorpay_signature;
  if (![orderId, paymentId, signature].every((x) => typeof x === "string" && x.length > 0 && x.length < 200)) return json({ error: "bad request" }, 400);
  const { data: own } = await u.sb.from("payment_orders").select("id,provider").eq("provider_order_id", orderId).maybeSingle();  // RLS: own orders only
  if (!own) return json({ error: "order not found" }, 404);
  if (own.provider !== provider.name) return json({ error: "provider mismatch" }, 409);
  if (!(await provider.verifyPayment(orderId, paymentId, signature))) return json({ error: "invalid signature" }, 400);
  const { data, error } = await admin().rpc("payment_mark_paid", { _provider_order_id: orderId, _payment_id: paymentId, _source: "verify" });
  if (error) return json({ error: error.message }, 400);
  return json(data);
});
