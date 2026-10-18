import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig(() => ({
  server: { host: "::", port: 8080 },
  plugins: [
    react(),
    VitePWA({
      // M9: our own worker (src/sw.ts) so it can show Web Push notifications; caching stays the same.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,          // registered in src/main.tsx (production) and on demand in dev (src/features/push/webPush.ts)
      devOptions: { enabled: true, type: "module", navigateFallback: "index.html" },
      includeAssets: ["favicon.png", "icon-180.png"],
      manifest: {
        name: "Meiyiyal",
        short_name: "Meiyiyal",
        description: "Verified professionals, online — Tamil Nadu",
        lang: "ta",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#0f9e86",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,png,svg,woff2}"] },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // The dev service worker (src/sw.ts) is only loaded when push is first turned on. Pre-bundle its imports up front,
  // otherwise Vite discovers them at that moment, re-optimizes and reloads the page mid-tap (the "Alerts turned on" flake).
  optimizeDeps: { include: ["workbox-precaching", "workbox-routing", "workbox-core"] },
}));
