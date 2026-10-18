// Weekly batch. Admin (or the service role, for the hosted schedule) only. Mock dispatch, no RazorpayX HTTP.
import { admin, cors, json, pickPayoutProvider, requireAdmin } from "../_shared/payouts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") {
    const provider = await pickPayoutProvider();
    return json({ ok: true, provider: provider?.name ?? null });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const provider = await pickPayoutProvider();
  if (!provider) return json({ error: "payouts_unavailable" }, 503);
  if (provider.name !== "mock") return json({ error: "live_payouts_not_in_this_build" }, 501);
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isService = service.length > 0 && req.headers.get("Authorization") === `Bearer ${service}`;
  if (!isService) {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return json({ error: "admin only" }, 403);
  }
  const db = admin();
  const { data: run, error } = await db.rpc("payout_run", { _force: false });
  if (error) return json({ error: error.message }, 500);
  const { data: dispatch, error: dispatchError } = await db.rpc("payout_dispatch_mock", {});
  if (dispatchError) return json({ error: dispatchError.message }, 500);
  await db.rpc("push_payout_batch_done", { _run: run, _dispatch: dispatch }); // A3: tell admins (best effort)
  return json({ ok: true, run, dispatch });
});
