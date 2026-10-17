// Razorpay webhook (also used by the mock gateway). Signature over the raw body; idempotent on the event id; server-only crediting.
import { cors, json, admin, hmacHex, pickProvider } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const provider = await pickProvider(); if (!provider) return json({ error: "payments_unavailable" }, 503);
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!sig || !(await provider.verifyWebhook(raw, sig))) return json({ error: "invalid signature" }, 401);
  let ev: { event?: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const eventId = req.headers.get("x-razorpay-event-id") ?? "body:" + (await hmacHex("event", raw));
  const pay = ev.payload?.payment?.entity ?? {}; const ord = ev.payload?.order?.entity ?? {};
  const orderId = String(pay.order_id ?? ord.id ?? ""); const type = ev.event ?? "unknown";
  const db = admin();
  const { data: fresh, error } = await db.rpc("payment_event_once", { _event_id: eventId, _provider: provider.name, _type: type, _provider_order_id: orderId || null, _payload: ev });
  if (error) return json({ error: error.message }, 500);
  if (!fresh) return json({ ok: true, duplicate: true });
  let outcome = "ignored";
  if ((type === "payment.captured" || type === "order.paid") && orderId && pay.id) {
    const { data, error: e } = await db.rpc("payment_mark_paid", { _provider_order_id: orderId, _payment_id: String(pay.id), _source: "webhook" });
    outcome = e ? "error: " + e.message : data?.credited ? "credited" : "already_paid";
  } else if (type === "payment.failed" && orderId) {
    await db.rpc("payment_mark_failed", { _provider_order_id: orderId, _reason: String(pay.error_description ?? "payment failed") });
    outcome = "failed";
  } else if (type.startsWith("refund.")) outcome = "refund_noted";
  await db.rpc("payment_event_outcome", { _event_id: eventId, _outcome: outcome });
  return json({ ok: true, duplicate: false, outcome });
});
