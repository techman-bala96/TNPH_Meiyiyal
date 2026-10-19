// Add / change the worker's bank account or UPI id.
// Mock: the SQL RPC does a simulated penny-drop (step-up code = kyc_stub_otp).
// RazorpayX: {action:"stepup"} texts a 6-digit code (SMS adapter); then {kind, account, ifsc, otp, pan}
//   → contact + fund account + validation (penny-drop / VPA lookup) → SQL applies name match + cooling.
import { admin, cors, json, pickPayoutProvider, requireUser, RazorpayXProvider } from "../_shared/payouts.ts";
import { sms } from "../_shared/smsSink.ts";

const str = (v: unknown) => (typeof v === "string" ? v : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const provider = await pickPayoutProvider();
  if (req.method === "GET") return json({ ok: true, provider: provider?.name ?? null });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!provider) return json({ error: "payouts_unavailable" }, 503);
  const u = await requireUser(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const kind = str(body.kind), account = str(body.account), ifsc = str(body.ifsc), otp = str(body.otp), pan = str(body.pan);

  if (provider.name === "mock") {
    if (body.action === "stepup") return json({ ok: true, mock: true });
    const { data, error } = await u.sb.rpc("payout_account_submit", { _kind: kind, _account: account, _ifsc: ifsc, _otp: otp, _pan: pan || null });
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  const db = admin();
  if (body.action === "stepup") {
    const { data, error } = await db.rpc("stepup_issue", { _user: u.user.id, _purpose: "payout_account" });
    if (error) return json({ error: error.message }, 400);
    const s = sms();
    if (!s) return json({ error: "sms_unavailable" }, 503);
    try { await s.send(data.phone, "stepup", { otp: data.code }); } catch (e) { return json({ error: (e as Error).message }, 502); }
    return json({ ok: true, masked: data.masked });
  }

  const prep = await db.rpc("payout_account_live_prepare", { _u: u.user.id, _kind: kind, _account: account, _ifsc: ifsc, _otp: otp });
  if (prep.error) return json({ error: prep.error.message }, 400);
  const p = prep.data as { name: string; email: string | null; phone: string | null; contact_id: string | null };
  const rx = (provider as RazorpayXProvider).rx;
  const norm = account.replace(/\s/g, "");
  try {
    const contactId = p.contact_id ?? await rx.createContact({ name: p.name, referenceId: u.user.id, email: p.email, phone: p.phone });
    const fa = await rx.createFundAccount(contactId, kind === "upi" ? { kind: "upi", vpa: norm } : { kind: "bank", name: p.name, ifsc: ifsc.toUpperCase().replace(/\s/g, ""), account: norm });
    const v = await rx.validateAndWait(fa, kind === "upi" ? "upi" : "bank", u.user.id);
    const { data, error } = await db.rpc("payout_account_live_record", {
      _u: u.user.id, _kind: kind, _account: account, _ifsc: ifsc, _pan: pan || null, _contact_id: contactId, _fund_account_id: fa,
      _validation_ref: v.id, _state: v.status, _account_status: v.accountStatus, _registered: v.registeredName,
    });
    if (error) return json({ error: error.message }, 400);
    return json(data);
  } catch (e) {
    return json({ error: "provider_error", detail: (e as Error).message }, 502);
  }
});
