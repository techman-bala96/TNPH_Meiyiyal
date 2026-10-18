// Optional 100ms media: POST {session_id} → {token, room_id} for a party of an active consult session.
// Needs HMS_ACCESS_KEY, HMS_APP_SECRET and HMS_ROOM_ID (or one room per session created via the 100ms API — not in v1).
import { admin, cors, json, requireUser } from "../_shared/payments.ts";
import { hmsAppToken } from "../_shared/ice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const accessKey = Deno.env.get("HMS_ACCESS_KEY"), secret = Deno.env.get("HMS_APP_SECRET"), roomId = Deno.env.get("HMS_ROOM_ID");
  if (req.method === "GET") return json({ ok: true, configured: !!(accessKey && secret && roomId) });
  if (!accessKey || !secret || !roomId) return json({ error: "hms_not_configured" }, 503);
  const u = await requireUser(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sid = typeof body.session_id === "string" ? body.session_id : "";
  const { data } = await admin().from("consult_sessions").select("id,user_id,worker_user_id,status").eq("id", sid).maybeSingle();
  if (!data || data.status !== "active" || (data.user_id !== u.user.id && data.worker_user_id !== u.user.id)) return json({ error: "not a party" }, 403);
  const token = await hmsAppToken({ accessKey, secret, roomId, userId: u.user.id, role: Deno.env.get("HMS_TEMPLATE_ROLE") ?? "guest" });
  return json({ token, room_id: roomId, session_id: sid });
});
