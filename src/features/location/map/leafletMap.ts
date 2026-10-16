import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapFactory } from "./types";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const createLeafletMap: MapFactory = (el, center, zoom, ev) => {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  }).addTo(map);
  let userMove = false;
  map.on("dragstart zoomstart", (e) => {
    // zoomstart from setView has no originalEvent; treat pinch/scroll/drag as user moves
    if (e.type === "dragstart" || userMove) { userMove = true; ev.onMoveStart?.(true); }
  });
  map.getContainer().addEventListener("wheel", () => (userMove = true), { passive: true });
  map.getContainer().addEventListener("touchstart", () => (userMove = true), { passive: true });
  map.on("moveend", () => {
    const c = map.getCenter();
    ev.onMoveEnd({ lat: c.lat, lng: c.lng }, userMove);
    userMove = false;
  });
  return {
    setCenter: (p, z, animate = true) => map.setView([p.lat, p.lng], z ?? map.getZoom(), { animate }),
    getCenter: () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
    destroy: () => map.remove(),
  };
};
