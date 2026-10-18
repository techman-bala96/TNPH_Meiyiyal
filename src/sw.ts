/// <reference lib="webworker" />
// Meiyiyal service worker (vite-plugin-pwa injectManifest).
// Production: same offline caching as before (precache + SPA fallback). Everywhere: Web Push display and taps.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };
type Payload = { id?: string; kind?: string; title?: string; body?: string; url?: string; tag?: string; urgent?: boolean; lang?: string;
  actions?: { action: string; title: string }[] };

// registerType "autoUpdate": a new version takes over at once (as the generated worker did before)
self.skipWaiting();
clientsClaim();

const manifest = self.__WB_MANIFEST;
if (import.meta.env.PROD) {
  cleanupOutdatedCaches();
  precacheAndRoute(manifest);
  // API paths are never the app shell (they are proxied to Supabase / the voice agent on the local preview)
  registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/(auth\/v1|rest|storage|functions|graphql|realtime|agent)\//],
  }));
}

const isSafari = () => /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Android/.test(navigator.userAgent);

self.addEventListener("push", (event) => {
  let d: Payload;
  try { d = (event.data?.json() ?? {}) as Payload; } catch { d = { title: "Meiyiyal", body: event.data?.text() ?? "" }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) w.postMessage({ type: "meiyiyal:push", payload: d });
    const url = new URL(d.url || "/", self.location.origin);
    const focused = wins.find((w) => w.focused);
    // The user is already looking: the in-app ring / chat shows it. Safari must always show one, so it still does.
    const seen = focused && (d.kind === "request.incoming" || new URL(focused.url).pathname === url.pathname) && d.kind !== "test.ping";
    if (seen && !isSafari()) return;
    await self.registration.showNotification(d.title || "Meiyiyal", {
      body: d.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || d.kind || "meiyiyal",
      lang: d.lang,
      data: { url: url.pathname + url.search, id: d.id, kind: d.kind },
      requireInteraction: !!d.urgent,
      // not in the TS lib types for every target; browsers that do not support them ignore them (iPhone ignores most)
      ...({ renotify: true, vibrate: d.urgent ? [400, 200, 400, 200, 400] : [200], actions: d.actions ?? [], timestamp: Date.now() } as object),
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string; id?: string };
  const u = new URL(data.url || "/", self.location.origin);
  if (event.action === "accept" || event.action === "decline") u.searchParams.set("act", event.action);
  if (data.id) u.searchParams.set("nid", data.id);
  const target = u.pathname + u.search;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (w) { await w.focus().catch(() => undefined); w.postMessage({ type: "meiyiyal:navigate", url: target }); return; }
    await self.clients.openWindow(target);
  })());
});

// The browser rotated the subscription: tell open windows; the app re-registers it with the server on its next start.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) w.postMessage({ type: "meiyiyal:resubscribe" });
  })());
});
