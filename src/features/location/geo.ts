/**
 * Geocoding front door. VITE_MAPS_PROVIDER=google routes reverse/search/autocomplete through the `maps-geo`
 * Edge Function (server key); any error falls back to OpenStreetMap Nominatim. Default is Nominatim
 * (policy: 1 req/s, no autocomplete — so autocomplete is Google-only).
 */
import { nominatimReverse, nominatimSearch, type NominatimPlace } from "./nominatim";

export const MAPS_PROVIDER = import.meta.env.VITE_MAPS_PROVIDER === "google" ? "google" : "osm";
export const geoAutocompleteEnabled = MAPS_PROVIDER === "google";
export type Suggestion = { place_id: string; text: string };

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maps-geo`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
let session = crypto.randomUUID();

async function google<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`${FN}?${new URLSearchParams(params)}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`maps-geo ${res.status}`);
  return (await res.json()) as T;
}

export async function geoReverse(lat: number, lng: number, lang: string): Promise<NominatimPlace | null> {
  if (MAPS_PROVIDER === "google") {
    try { return await google<NominatimPlace | null>({ op: "reverse", lat: String(lat), lng: String(lng), lang }); } catch { /* fallback */ }
  }
  return nominatimReverse(lat, lng, lang);
}

export async function geoSearch(q: string, lang: string): Promise<NominatimPlace[]> {
  if (MAPS_PROVIDER === "google") {
    try { return await google<NominatimPlace[]>({ op: "search", q, lang }); } catch { /* fallback */ }
  }
  return nominatimSearch(q, lang);
}

export async function geoAutocomplete(q: string, lang: string): Promise<Suggestion[]> {
  if (!geoAutocompleteEnabled) return [];
  try { return await google<Suggestion[]>({ op: "autocomplete", q, lang, session }); } catch { return []; }
}

/** Resolve a suggestion; ends the Places billing session. */
export async function geoPlace(id: string, lang: string): Promise<NominatimPlace | null> {
  try { return await google<NominatimPlace | null>({ op: "place", id, lang, session }); } catch { return null; } finally { session = crypto.randomUUID(); }
}
