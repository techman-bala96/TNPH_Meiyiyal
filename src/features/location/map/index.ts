import { createLeafletMap } from "./leafletMap";
import type { MapFactory } from "./types";
export * from "./types";
/** Swap this for a Google Maps factory once a key is configured. */
export const createMap: MapFactory = createLeafletMap;
