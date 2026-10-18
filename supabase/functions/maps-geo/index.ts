// Google geocoding proxy (keeps the server key off the client). GET ?op=reverse|search|autocomplete|place.
// GOOGLE_MAPS_SERVER_KEY unset → 503 and the app stays on OpenStreetMap Nominatim.
// Restrict the key in Google Cloud to: Geocoding API + Places API (New), and an app-quota cap.
import { cors, json } from "../_shared/payments.ts";
import { GoogleGeo } from "../_shared/googleGeo.ts";

const lang = (v: string | null) => (v === "ta" ? "ta" : "en");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
  if (!key) return json({ error: "maps_not_configured" }, 503);
  const u = new URL(req.url); const op = u.searchParams.get("op");
  const g = new GoogleGeo(key);
  const l = lang(u.searchParams.get("lang")); const session = (u.searchParams.get("session") ?? "").slice(0, 64);
  try {
    if (op === "reverse") {
      const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "bad coords" }, 400);
      return json(await g.reverse(lat, lng, l));
    }
    const q = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
    if (op === "search") return json(q.length >= 3 ? await g.search(q, l) : []);
    if (op === "autocomplete") return json(q.length >= 2 ? await g.autocomplete(q, l, session) : []);
    if (op === "place") return json(await g.place(u.searchParams.get("id") ?? "", l, session));
    return json({ error: "unknown op" }, 400);
  } catch (e) {
    return json({ error: "upstream", detail: (e as Error).message }, 502);
  }
});
