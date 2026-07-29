import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.CONTROL_ROOM_BASE ?? "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-source.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Semantic Systems Control Room",
        short_name: "Control Room",
        description: "Read-only accepted-commit semantic project observability.",
        theme_color: "#111827",
        background_color: "#f7f5ef",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icon-source.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // The content-addressed snapshot is cached explicitly only after the
        // client verifies its version and digest. Precache only the immutable
        // shell so an old service worker cannot hide a newer version document.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
