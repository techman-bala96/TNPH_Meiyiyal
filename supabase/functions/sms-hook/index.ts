// Supabase Auth "Send SMS" hook → MSG91 (DLT template) or the mock outbox.
// Dashboard: Authentication → Hooks → Send SMS → HTTPS → https://<project>.supabase.co/functions/v1/sms-hook,
// then put the generated secret in SEND_SMS_HOOK_SECRET. Auth posts {user:{phone}, sms:{otp}}.
import { verifyStandardWebhook } from "../_shared/standardWebhook.ts";
import { sms } from "../_shared/smsSink.ts";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Local stack only: with the mock SMS provider and no secret set, a fixed dev secret lets e2e sign hook calls.
// Never used once SEND_SMS_HOOK_SECRET is set or SMS_PROVIDER is a real provider.
export const LOCAL_DEV_SECRET = "v1,whsec_" + btoa("meiyiyal-local-sms-hook-secret");
const hookSecret = () => Deno.env.get("SEND_SMS_HOOK_SECRET")
  || ((Deno.env.get("SMS_PROVIDER") ?? "mock").toLowerCase() === "mock" && /^http:\/\/(kong|127\.0\.0\.1|localhost)[:/]/.test(Deno.env.get("SUPABASE_URL") ?? "") ? LOCAL_DEV_SECRET : "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: { http_code: 405, message: "method" } });
  const raw = await req.text();
  if (!await verifyStandardWebhook(hookSecret(), req.headers, raw)) {
    return reply(401, { error: { http_code: 401, message: "invalid signature" } });
  }
  let p: { user?: { phone?: string }; sms?: { otp?: string } };
  try { p = JSON.parse(raw); } catch { return reply(400, { error: { http_code: 400, message: "bad json" } }); }
  const phone = p.user?.phone ?? "", otp = p.sms?.otp ?? "";
  if (!phone || !/^\d{4,8}$/.test(otp)) return reply(400, { error: { http_code: 400, message: "phone and otp required" } });
  const provider = sms();
  if (!provider) return reply(503, { error: { http_code: 503, message: "sms provider not configured" } });
  try {
    await provider.send(phone, "login_otp", { otp });
  } catch (e) {
    return reply(502, { error: { http_code: 502, message: (e as Error).message } });
  }
  return reply(200, {});
});
