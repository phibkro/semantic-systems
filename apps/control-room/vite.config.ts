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
      registerType: "prompt",
      includeAssets: ["icon-source.svg"],
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
            src: "icon-source.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
