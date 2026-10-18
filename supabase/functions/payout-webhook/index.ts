// Payout webhook. Signature over the raw body; one row per event id. Mock only in this build.
import { hmacHex } from "../_shared/payments.ts";
import { admin, cors, json, pickPayoutProvider } from "../_shared/payouts.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const provider = await pickPayoutProvider();
  if (!provider) return json({ error: "payouts_unavailable" }, 503);
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  let signed = false;
  try { signed = !!sig && await provider.verifyWebhook(raw, sig); }
  catch { return json({ error: "live_payouts_not_in_this_build" }, 501); }
  if (!signed) return json({ error: "invalid signature" }, 401);
  let ev: { event?: string; payload?: { payout?: { entity?: Record<string, unknown> } } };
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const eventId = req.headers.get("x-razorpay-event-id") ?? "body:" + await hmacHex("payout-event", raw);
  const entity = ev.payload?.payout?.entity ?? {};
  const providerId = typeof entity.id === "string" ? entity.id : null;
  const reference = typeof entity.reference_id === "string" && UUID.test(entity.reference_id) ? entity.reference_id : null;
  const utr = typeof entity.utr === "string" ? entity.utr : null;
  const reason = typeof entity.failure_reason === "string" ? entity.failure_reason : null;
  const { data, error } = await admin().rpc("payout_apply_event", {
    _event_id: eventId, _type: ev.event ?? "unknown", _provider_payout_id: providerId,
    _payout_id: reference, _utr: utr, _reason: reason, _payload: ev,
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
});
