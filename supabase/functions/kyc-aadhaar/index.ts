// Aadhaar OTP for the worker wizard when app_settings.kyc_provider = 'edge'.
// POST {action:"send", aadhaar} → {masked, expires_in}; POST {action:"verify", otp} → {ok, masked?}
// GET → {ok, provider} (health). The caller's JWT is checked here; all writes go through service-role RPCs.
import { admin, cors, json, requireUser } from "../_shared/payments.ts";
import { pickKycProvider } from "../_shared/kyc.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const provider = pickKycProvider();
  if (req.method === "GET") return json({ ok: true, provider: provider?.name ?? null });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!provider) return json({ error: "kyc_unavailable" }, 503);
  const u = await requireUser(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = admin();
  if (body.action === "send") {
    const aadhaar = String(body.aadhaar ?? "").replace(/\D/g, "");
    if (!/^[2-9][0-9]{11}$/.test(aadhaar)) return json({ error: "invalid aadhaar" }, 400);
    const can = await db.rpc("kyc_edge_can_send", { _user: u.user.id });
    if (can.error) return json({ error: can.error.message }, 400);
    if (can.data === false) return json({ error: "too many OTP requests, try later" }, 429);
    let ref: string;
    try {
      ref = (await provider.sendOtp(aadhaar)).ref;
    } catch (e) {
      return json({ error: (e as Error).message || "provider_send_failed" }, 502);
    }
    const { data, error } = await db.rpc("kyc_edge_start", { _user: u.user.id, _aadhaar: aadhaar, _provider: provider.name, _ref: ref });
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }
  if (body.action === "verify") {
    const otp = String(body.otp ?? "").replace(/\D/g, "");
    const s = await db.rpc("kyc_edge_session", { _user: u.user.id });
    if (s.error) return json({ error: s.error.message }, 400);
    const sess = s.data as { provider: string; ref: string; expired: boolean; attempts: number } | null;
    if (!sess) return json({ error: "send OTP first" }, 400);
    if (sess.expired) return json({ error: "OTP expired" }, 400);
    if (sess.attempts >= 5) return json({ error: "too many attempts" }, 429);
    if (sess.provider !== provider.name) return json({ error: "send OTP again" }, 409);
    let res: { ok: boolean; legalName?: string | null };
    try {
      res = await provider.verifyOtp(sess.ref, otp);
    } catch {
      return json({ error: "provider_verify_failed" }, 502);
    }
    const { data, error } = await db.rpc("kyc_edge_confirm", { _user: u.user.id, _ok: res.ok, _legal_name: res.legalName ?? null });
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }
  return json({ error: "unknown action" }, 400);
});
