// Payout webhook (mock gateway or RazorpayX). HMAC-SHA256 over the raw body in X-Razorpay-Signature;
// one row per event id. Handles payout.processed / failed / reversed and fund_account.validation.*.
import { hmacHex } from "../_shared/payments.ts";
import { admin, cors, json, pickPayoutProvider } from "../_shared/payouts.ts";
import { failureKind } from "../_shared/razorpayx.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const provider = await pickPayoutProvider();
  if (!provider) return json({ error: "payouts_unavailable" }, 503);
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!sig || !await provider.verifyWebhook(raw, sig)) return json({ error: "invalid signature" }, 401);
  type Entity = Record<string, unknown> & { status_details?: { reason?: string }; results?: { account_status?: string; registered_name?: string } };
  let ev: { event?: string; payload?: { payout?: { entity?: Entity }; "fund_account.validation"?: { entity?: Entity } } };
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const db = admin();
  if (ev.event?.startsWith("fund_account.validation.")) {
    const v = ev.payload?.["fund_account.validation"]?.entity ?? {};
    const { data, error } = await db.rpc("payout_validation_event", { _validation_ref: String(v.id ?? ""),
      _account_status: v.results?.account_status ?? (ev.event.endsWith("failed") ? "invalid" : null), _registered: v.results?.registered_name ?? null });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, outcome: data });
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? "body:" + await hmacHex("payout-event", raw);
  const entity = ev.payload?.payout?.entity ?? {};
  const providerId = typeof entity.id === "string" ? entity.id : null;
  const reference = typeof entity.reference_id === "string" && UUID.test(entity.reference_id) ? entity.reference_id : null;
  const utr = typeof entity.utr === "string" ? entity.utr : null;
  const rawReason = typeof entity.failure_reason === "string" ? entity.failure_reason : entity.status_details?.reason ?? null;
  // mock sends our own vocabulary (beneficiary / invalid_account); RazorpayX sends prose → classify
  const reason = provider.name === "mock" ? rawReason : rawReason ? failureKind(rawReason) : null;
  const { data, error } = await db.rpc("payout_apply_event", {
    _event_id: eventId, _type: ev.event ?? "unknown", _provider_payout_id: providerId,
    _payout_id: reference, _utr: utr, _reason: reason, _payload: ev,
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
});
