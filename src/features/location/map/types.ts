export type LatLng = { lat: number; lng: number };
/** Pluggable map surface. Leaflet+OSM today; a Google Maps implementation can replace it. */
export interface MapHandle {
  setCenter(p: LatLng, zoom?: number, animate?: boolean): void;
  getCenter(): LatLng;
  destroy(): void;
}
export type MapEvents = {
  /** Fires after any pan/zoom settles. `byUser` is true when the user dragged/zoomed. */
  onMoveEnd: (center: LatLng, byUser: boolean) => void;
  onMoveStart?: (byUser: boolean) => void;
};
export type MapFactory = (el: HTMLElement, center: LatLng, zoom: number, ev: MapEvents) => MapHandle;
