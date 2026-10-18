// Google Maps Platform geocoding for Tamil Nadu (Geocoding API + Places API (New)). Pure; fetch injectable.
// Output uses the Nominatim-like shape the app already renders: {lat, lon, display_name, name, place_id?}.
export type Place = { lat: string; lon: string; display_name: string; name?: string; place_id?: string; address?: Record<string, string> };
export type Suggestion = { place_id: string; text: string };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const TN = { low: { latitude: 8.0, longitude: 76.2 }, high: { latitude: 13.6, longitude: 80.4 } };
const inTN = (lat: number, lng: number) => lat >= TN.low.latitude && lat <= TN.high.latitude && lng >= TN.low.longitude && lng <= TN.high.longitude;

type GeoResult = { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components?: { long_name: string; types: string[] }[]; place_id?: string };
function fromGeocode(r: GeoResult): Place {
  const comp = (t: string) => r.address_components?.find((c) => c.types.includes(t))?.long_name;
  const address: Record<string, string> = {};
  const map: [string, string][] = [["route", "road"], ["sublocality", "suburb"], ["sublocality_level_1", "suburb"], ["neighborhood", "neighbourhood"], ["locality", "city"], ["administrative_area_level_3", "county"], ["administrative_area_level_2", "state_district"], ["administrative_area_level_1", "state"], ["postal_code", "postcode"]];
  for (const [g, o] of map) { const v = comp(g); if (v && !address[o]) address[o] = v; }
  return { lat: String(r.geometry.location.lat), lon: String(r.geometry.location.lng), display_name: r.formatted_address, name: comp("point_of_interest") ?? comp("premise") ?? comp("route"), place_id: r.place_id, address };
}

export class GoogleGeo {
  private key: string; private fetcher: FetchLike;
  constructor(key: string, fetcher: FetchLike = fetch) { this.key = key; this.fetcher = fetcher; }

  async reverse(lat: number, lng: number, lang: string): Promise<Place | null> {
    const u = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat.toFixed(6)},${lng.toFixed(6)}&language=${encodeURIComponent(lang)}&key=${this.key}`;
    const d = await (await this.fetcher(u)).json() as { status: string; results?: GeoResult[] };
    if (d.status !== "OK" || !d.results?.length) return null;
    return fromGeocode(d.results[0]);
  }

  async search(q: string, lang: string): Promise<Place[]> {
    const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:IN|administrative_area:TN&bounds=8.0,76.2|13.6,80.4&language=${encodeURIComponent(lang)}&key=${this.key}`;
    const d = await (await this.fetcher(u)).json() as { status: string; results?: GeoResult[] };
    if (d.status !== "OK") return [];
    return (d.results ?? []).map(fromGeocode).filter((p) => inTN(Number(p.lat), Number(p.lon))).slice(0, 6);
  }

  async autocomplete(input: string, lang: string, session: string): Promise<Suggestion[]> {
    const res = await this.fetcher("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": this.key },
      body: JSON.stringify({ input, languageCode: lang, includedRegionCodes: ["in"], locationRestriction: { rectangle: TN }, sessionToken: session }),
    });
    const d = await res.json() as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[] };
    return (d.suggestions ?? []).map((s) => s.placePrediction).filter(Boolean).map((p) => ({ place_id: p!.placeId, text: p!.text?.text ?? "" })).slice(0, 6);
  }

  async place(id: string, lang: string, session: string): Promise<Place | null> {
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return null;
    const res = await this.fetcher(`https://places.googleapis.com/v1/places/${id}?languageCode=${encodeURIComponent(lang)}&sessionToken=${encodeURIComponent(session)}`, {
      headers: { "X-Goog-Api-Key": this.key, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" },
    });
    if (!res.ok) return null;
    const d = await res.json() as { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } };
    if (!d.location || !inTN(d.location.latitude, d.location.longitude)) return null;
    return { lat: String(d.location.latitude), lon: String(d.location.longitude), display_name: d.formattedAddress ?? d.displayName?.text ?? "", name: d.displayName?.text, place_id: d.id };
  }
}
