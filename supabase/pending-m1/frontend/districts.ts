import data from "@/data/districts.json";
import type { I18nName } from "./i18nName";
export type District = { slug: string; name: I18nName; lat: number; lng: number; sort: number; areas: string[] };
export const DISTRICTS = data as District[];
export function nearestDistrict(lat: number, lng: number): District {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) { const x = (d.lat - lat) ** 2 + (d.lng - lng) ** 2; if (x < bd) { bd = x; best = d; } }
  return best;
}
