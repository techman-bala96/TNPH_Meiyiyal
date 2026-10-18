// Delivers pending notifications as standard Web Push (VAPID), or records them when app_settings.push_mock is true.
//   GET                → { ok, mock, publicKey }   (the VAPID public key the browser subscribes with)
//   POST {kick:true}   → send what is pending. Callers: the pg_net hook (x-push-hook), the service role, or any signed-in user.
//   POST {sweep:true}  → service role / hook only: expire rings, release quiet hours, timed notices, then send.
import { buildPushHTTPRequest } from "npm:@pushforge/builder@2.0.5";
import { admin, cors, json, requireUser } from "../_shared/payments.ts";
import { buildPayload, pickLang, type PushNote } from "../_shared/pushText.ts";

type Device = { id: string; endpoint: string; p256dh: string; auth: string; lang: string };
type Claimed = PushNote & { id: string; user_id: string; prefs_lang: string | null; devices: Device[] };

const b64u = (s: string) => s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function vapid(): { jwk: JsonWebKey; publicKey: string } | null {
  const raw = Deno.env.get("VAPID_PRIVATE_KEY_JWK");
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw) as JsonWebKey;
    if (!jwk.x || !jwk.y || !jwk.d) return null;
    const dec = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((v.length + 3) % 4)), (c) => c.charCodeAt(0));
    const pt = new Uint8Array(65); pt[0] = 4; pt.set(dec(jwk.x), 1); pt.set(dec(jwk.y), 33);
    return { jwk, publicKey: b64u(btoa(String.fromCharCode(...pt))) };
  } catch { return null; }
}

async function isMock(): Promise<boolean> {
  const { data } = await admin().from("app_settings").select("value").eq("key", "push_mock").maybeSingle();
  return data?.value !== false && data?.value !== "false";
}

async function callerKind(req: Request): Promise<"service" | "hook" | "user" | null> {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (service && req.headers.get("Authorization") === `Bearer ${service}`) return "service";
  const hook = req.headers.get("x-push-hook");
  if (hook) { const { data } = await admin().rpc("push_hook_ok", { _secret: hook }); if (data === true) return "hook"; }
  if (await requireUser(req)) return "user";
  return null;
}

async function deliver(n: Claimed, mock: boolean, keys: ReturnType<typeof vapid>) {
  const db = admin();
  if (!n.devices?.length) { await db.rpc("push_record", { _id: n.id, _status: "no_device", _result: { devices: 0 } }); return "no_device"; }
  let ok = 0, gone = 0, failed = 0; const errors: string[] = []; let first: unknown = null;
  for (const d of n.devices) {
    const payload = buildPayload(n, pickLang(d.lang, n.prefs_lang));
    first ??= payload;
    if (mock) { ok++; continue; }
    if (!keys) { failed++; errors.push("no_vapid_key"); continue; }
    try {
      const urgent = n.priority === "urgent";
      const r = await buildPushHTTPRequest({
        privateJWK: keys.jwk, subscription: { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
        message: { payload, adminContact: Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@meiyiyal.in",
          options: { ttl: urgent ? 60 : 86400, urgency: urgent ? "high" : "normal", topic: String(payload.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined } },
      });
      const res = await fetch(r.endpoint, { method: "POST", headers: r.headers, body: r.body });
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) { gone++; await db.rpc("push_device_result", { _sub: d.id, _ok: false, _gone: true }); }
      else if (res.ok) { ok++; await db.rpc("push_device_result", { _sub: d.id, _ok: true, _gone: false }); }
      else { failed++; errors.push(`http_${res.status}`); await db.rpc("push_device_result", { _sub: d.id, _ok: false, _gone: false }); }
    } catch (e) { failed++; errors.push(String((e as Error)?.message ?? e).slice(0, 120)); }
  }
  const status = ok > 0 ? "sent" : failed === 0 && gone > 0 ? "no_device" : "pending";
  await db.rpc("push_record", { _id: n.id, _status: status, _result: { mock, ok, gone, failed, errors: errors.slice(0, 5) }, _payload: first });
  return status;
}

async function drain(): Promise<Record<string, number>> {
  const mock = await isMock(); const keys = vapid(); const counts: Record<string, number> = {};
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const { data, error } = await admin().rpc("push_claim", { _limit: 50 });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Claimed[];
    if (!rows.length) break;
    const res = await Promise.all(rows.map((n) => deliver(n, mock, keys)));
    for (const s of res) counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") {
    const keys = vapid();
    return json({ ok: true, mock: await isMock(), publicKey: keys?.publicKey ?? Deno.env.get("VAPID_PUBLIC_KEY") ?? null });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const who = await callerKind(req);
  if (!who) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as { sweep?: boolean };
  try {
    let sweep: unknown = null;
    if (body.sweep && who !== "user") {
      const { data, error } = await admin().rpc("push_sweep");
      if (error) return json({ error: error.message }, 500);
      sweep = data;
    }
    return json({ ok: true, sweep, sent: await drain() });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
