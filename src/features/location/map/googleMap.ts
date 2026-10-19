import type { MapFactory, MapHandle } from "./types";
import { createLeafletMap } from "./leafletMap";

/* Google Maps JS tiles behind VITE_GOOGLE_MAPS_BROWSER_KEY (restrict the key to meiyiyal.com referrers + Maps JavaScript API).
   The factory is synchronous: it shows Leaflet/OSM until Google loads, swaps in Google, and stays on OSM if loading fails. */
type GMap = { setCenter(p: { lat: number; lng: number }): void; setZoom(z: number): void; getZoom(): number; panTo(p: { lat: number; lng: number }): void;
  getCenter(): { lat(): number; lng(): number }; addListener(ev: string, cb: () => void): void };
type GoogleNS = { maps: { Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap } };
let loading: Promise<GoogleNS> | null = null;

function loadGoogle(key: string): Promise<GoogleNS> {
  const w = window as unknown as { google?: GoogleNS };
  if (w.google?.maps) return Promise.resolve(w.google);
  loading ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&region=IN&language=${document.documentElement.lang === "ta" ? "ta" : "en"}`;
    s.async = true; s.onerror = () => { loading = null; rej(new Error("google maps failed to load")); };
    s.onload = () => (w.google?.maps ? res(w.google) : rej(new Error("google maps missing")));
    document.head.appendChild(s);
    setTimeout(() => rej(new Error("google maps timeout")), 8000);
  });
  return loading;
}

export const createGoogleMap: MapFactory = (el, center, zoom, ev) => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  let inner: MapHandle = createLeafletMap(el, center, zoom, ev);
  let dead = false;
  if (key) {
    loadGoogle(key).then((g) => {
      if (dead) return;
      const c = inner.getCenter(); inner.destroy();
      const holder = document.createElement("div"); holder.style.cssText = "position:absolute;inset:0"; el.appendChild(holder);
      const m = new g.maps.Map(holder, { center: c, zoom, disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false });
      let byUser = false;
      m.addListener("dragstart", () => { byUser = true; ev.onMoveStart?.(true); });
      m.addListener("idle", () => { const p = m.getCenter(); ev.onMoveEnd({ lat: p.lat(), lng: p.lng() }, byUser); byUser = false; });
      inner = {
        setCenter: (p, z, animate = true) => { if (z != null) m.setZoom(z); if (animate) m.panTo(p); else m.setCenter(p); },
        getCenter: () => { const p = m.getCenter(); return { lat: p.lat(), lng: p.lng() }; },
        destroy: () => holder.remove(),
      };
    }).catch(() => { /* stay on OSM */ });
  }
  return {
    setCenter: (p, z, a) => inner.setCenter(p, z, a),
    getCenter: () => inner.getCenter(),
    destroy: () => { dead = true; inner.destroy(); },
  };
};
