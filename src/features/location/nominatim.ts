/**
 * OpenStreetMap Nominatim client that follows the usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/):
 * max 1 request/second (serialised queue), results cached, no autocomplete
 * (search runs only on explicit submit), attribution shown on the map.
 */
const BASE = import.meta.env.VITE_NOMINATIM_URL || "https://nominatim.openstreetmap.org";
// Tamil Nadu bounding box (lon_min, lat_max, lon_max, lat_min)
const TN_VIEWBOX = "76.2,13.6,80.4,8.0";

let chain: Promise<unknown> = Promise.resolve();
let last = 0;
const cache = new Map<string, unknown>();

function queued<T>(url: string): Promise<T> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) as T);
  const run = async () => {
    const wait = Math.max(0, last + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const json = (await res.json()) as T;
    cache.set(url, json);
    return json;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

export type NominatimPlace = { lat: string; lon: string; display_name: string; name?: string; address?: Record<string, string> };

export function shortAddress(p: NominatimPlace): string {
  const a = p.address ?? {};
  const parts = [p.name || a.road || a.neighbourhood, a.suburb || a.village || a.hamlet, a.town || a.city || a.county, a.state_district].filter(Boolean) as string[];
  const uniq = parts.filter((v, i) => parts.indexOf(v) === i);
  return uniq.length ? uniq.join(", ") : p.display_name;
}

export function nominatimReverse(lat: number, lng: number, lang: string) {
  const u = `${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&accept-language=${lang}`;
  return queued<NominatimPlace & { error?: string }>(u).then((r) => (r && !r.error ? r : null));
}

export function nominatimSearch(q: string, lang: string) {
  const u = `${BASE}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&viewbox=${TN_VIEWBOX}&bounded=1&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  return queued<NominatimPlace[]>(u);
}
