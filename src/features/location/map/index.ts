import { createGoogleMap } from "./googleMap";
import { createLeafletMap } from "./leafletMap";
import type { MapFactory } from "./types";
export * from "./types";
/** Leaflet + OSM tiles by default. VITE_MAPS_PROVIDER=google + VITE_GOOGLE_MAPS_BROWSER_KEY switches tiles to Google (OSM fallback). */
export const createMap: MapFactory =
  import.meta.env.VITE_MAPS_PROVIDER === "google" && import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ? createGoogleMap : createLeafletMap;
