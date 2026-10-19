// Weekly batch + live dispatch. Callers: an admin, the service role, or pg_cron/pg_net (x-payout-hook secret).
// Mock: payout_run + payout_dispatch_mock (all SQL). RazorpayX: payout_run (unless dispatch_only), then claim
// queued rows and POST /v1/payouts with the payout id as idempotency key; webhooks finish them.
import { admin, cors, json, pickPayoutProvider, requireAdmin, RazorpayXProvider } from "../_shared/payouts.ts";
import { failureKind, payoutEventType, RazorpayXError } from "../_shared/razorpayx.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const provider = await pickPayoutProvider();
  if (req.method === "GET") return json({ ok: true, provider: provider?.name ?? null });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!provider) return json({ error: "payouts_unavailable" }, 503);
  const db = admin();
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isService = service.length > 0 && req.headers.get("Authorization") === `Bearer ${service}`;
  const hook = req.headers.get("x-payout-hook");
  const isHook = !!hook && (await db.rpc("payout_hook_ok", { _secret: hook })).data === true;
  if (!isService && !isHook && !(await requireAdmin(req))) return json({ error: "admin only" }, 403);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  let run: unknown = null;
  if (body.dispatch_only !== true) {
    const r = await db.rpc("payout_run", { _force: false });
    if (r.error) return json({ error: r.error.message }, 500);
    run = r.data;
  }
  if (provider.name === "mock") {
    const { data: dispatch, error } = await db.rpc("payout_dispatch_mock", {});
    if (error) return json({ error: error.message }, 500);
    if (run) await db.rpc("push_payout_batch_done", { _run: run, _dispatch: dispatch });
    return json({ ok: true, run, dispatch });
  }

  const rx = (provider as RazorpayXProvider).rx;
  const out = { sent: 0, retry: 0, failed: 0 };
  for (let round = 0; round < 10; round++) {
    const { data: rows, error } = await db.rpc("payout_claim_live", { _limit: 20 });
    if (error) return json({ error: error.message }, 500);
    if (!rows?.length) break;
    for (const r of rows as { payout_id: string; amount: number; fund_account_id: string | null; kind: string }[]) {
      if (!r.fund_account_id) { await db.rpc("payout_send_error", { _id: r.payout_id, _reason: "no_fund_account", _retry: false }); out.failed++; continue; }
      try {
        const p = await rx.createPayout({ payoutId: r.payout_id, fundAccountId: r.fund_account_id, amountRupees: Number(r.amount), kind: r.kind === "upi" ? "upi" : "bank" });
        await db.rpc("payout_mark_sent", { _id: r.payout_id, _provider_payout_id: p.id });
        const ev = payoutEventType(p.status);
        if (ev) {
          await db.rpc("payout_apply_event", { _event_id: `sync:${p.id}:${p.status}`, _type: ev, _provider_payout_id: p.id, _payout_id: r.payout_id,
            _utr: p.utr, _reason: ev === "payout.failed" ? failureKind(p.failureReason) : null, _payload: { sync: true, status: p.status } });
        }
        out.sent++;
      } catch (e) {
        const retry = e instanceof RazorpayXError ? e.retryable : true;
        const reason = e instanceof RazorpayXError && !retry ? failureKind(e.message) : "provider_unavailable";
        const res = await db.rpc("payout_send_error", { _id: r.payout_id, _reason: reason, _retry: retry });
        if (res.data === "retry") out.retry++; else out.failed++;
      }
    }
  }
  if (run) await db.rpc("push_payout_batch_done", { _run: run, _dispatch: { processing: out.sent, failed: out.failed } });
  return json({ ok: true, run, dispatch: out });
});
