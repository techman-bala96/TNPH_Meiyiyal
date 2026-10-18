import { supabase } from "@/integrations/supabase/client";

/** Result of resolving coordinates to a Tamil Nadu district/area. */
export type ResolvedPlace = {
  districtSlug: string;
  districtName: { en: string; ta?: string };
  areaId: number | null;
  areaName: string | null;
  areaNameTa: string | null;
  distanceKm: number;
  address?: string;
  provider: string;
};

/** Pluggable reverse-geocoder. Add Google Maps (or others) by implementing this. */
export interface GeocodingProvider {
  name: string;
  reverse(lat: number, lng: number): Promise<ResolvedPlace | null>;
}

/** Always-available fallback: nearest seeded district/area via PostGIS RPC. */
export const postgisProvider: GeocodingProvider = {
  name: "postgis",
  async reverse(lat, lng) {
    const { data, error } = await supabase.rpc("nearest_location", { _lat: lat, _lng: lng });
    if (error) throw error;
    const r = data?.[0];
    if (!r) return null;
    return {
      districtSlug: r.district_slug, districtName: r.district_name as ResolvedPlace["districtName"],
      areaId: r.area_id, areaName: r.area_name, areaNameTa: r.area_name_ta, distanceKm: r.distance_km, provider: "postgis",
    };
  },
};

const providers: GeocodingProvider[] = [];
/** Register a higher-priority provider (e.g. Google (see VITE_MAPS_PROVIDER in geo.ts)). */
export function registerGeocoder(p: GeocodingProvider) { providers.unshift(p); }

/** Try registered providers in order; PostGIS nearest-area is the final fallback. */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  for (const p of providers) {
    try { const r = await p.reverse(lat, lng); if (r) return r; } catch { /* fall through */ }
  }
  return postgisProvider.reverse(lat, lng);
}

export function getBrowserPosition(timeout = 10000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
  });
}
