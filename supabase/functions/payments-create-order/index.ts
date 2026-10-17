import { cors, json, admin, requireUser, pickProvider } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const provider = await pickProvider();
  if (req.method === "GET") return json({ ok: true, provider: provider?.name ?? null });
  if (!provider) return json({ error: "payments_unavailable" }, 503);
  const u = await requireUser(req); if (!u) return json({ error: "unauthorized" }, 401);
  const { pack_id } = await req.json().catch(() => ({}));
  if (typeof pack_id !== "string") return json({ error: "pack_id required" }, 400);
  // amount/credits come from the DB pack, created as the user (RLS + rate limit in the RPC)
  const { data: order, error } = await u.sb.rpc("payment_order_new", { _pack: pack_id, _provider: provider.name });
  if (error) return json({ error: error.message }, 400);
  let providerOrder: { id: string };
  try { providerOrder = await provider.createOrder(order.amount_paise, order.id); }
  catch (e) { await admin().rpc("payment_mark_failed", { _provider_order_id: `none:${order.id}`, _reason: String(e) }); return json({ error: "gateway_error" }, 502); }
  const { error: e2 } = await admin().rpc("payment_order_attach", { _id: order.id, _provider_order_id: providerOrder.id });
  if (e2) return json({ error: e2.message }, 500);
  return json({ order_id: order.id, provider: provider.name, key_id: provider.keyId, provider_order_id: providerOrder.id,
    amount: order.amount_paise, currency: order.currency, credits: order.credits, bonus: order.bonus, email: u.user.email ?? null, phone: u.user.phone ?? null });
});
