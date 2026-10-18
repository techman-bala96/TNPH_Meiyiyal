// Penny-drop a bank account or UPI id. Mock only: the database stores the mask and the hash.
import { cors, json, pickPayoutProvider, requireUser } from "../_shared/payouts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") {
    const provider = await pickPayoutProvider();
    return json({ ok: true, provider: provider?.name ?? null });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const provider = await pickPayoutProvider();
  if (!provider || provider.name !== "mock") return json({ error: provider ? "live_payouts_not_in_this_build" : "payouts_unavailable" }, provider ? 501 : 503);
  const u = await requireUser(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const kind = typeof body.kind === "string" ? body.kind : "";
  const account = typeof body.account === "string" ? body.account : "";
  const ifsc = typeof body.ifsc === "string" ? body.ifsc : "";
  const otp = typeof body.otp === "string" ? body.otp : "";
  const pan = typeof body.pan === "string" ? body.pan : "";
  const { data, error } = await u.sb.rpc("payout_account_submit", {
    _kind: kind, _account: account, _ifsc: ifsc, _otp: otp, _pan: pan || null,
  });
  if (error) return json({ error: error.message }, 400);
  return json(data);
});
