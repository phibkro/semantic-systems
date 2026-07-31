import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.CONTROL_ROOM_BASE ?? "/",
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Semantic Systems Control Room",
        short_name: "Control Room",
        description: "Read-only, content-addressed Semantic Systems observability.",
        theme_color: "oklch(0.289 0.063 232.7)",
        background_color: "oklch(0.969 0.009 123.5)",
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
