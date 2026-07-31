import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.CONTROL_ROOM_BASE ?? "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Semantic Systems Control Room",
        short_name: "Control Room",
        description: "Read-only, content-addressed Semantic Systems observability.",
        theme_color: "#082f49",
        background_color: "#f5f7f2",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
