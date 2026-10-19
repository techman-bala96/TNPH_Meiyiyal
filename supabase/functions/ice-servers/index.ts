// GET → { provider, ttl, iceServers } for the signed-in user. TURN credentials are short-lived (TURN REST API),
// so no long-lived TURN password ever ships in the web bundle.
import { cors, json, requireUser } from "../_shared/payments.ts";
import { iceServersFor } from "../_shared/ice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = await requireUser(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  return json(await iceServersFor(u.user.id, (k) => Deno.env.get(k)));
});
