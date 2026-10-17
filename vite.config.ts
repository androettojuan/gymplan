import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        id: "/",
        name: "GymPlan",
        short_name: "GymPlan",
        description: "Planes de entrenamiento de tu gimnasio y el registro de tus pesos.",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#141011",
        theme_color: "#9f1c22",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,mjs}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "CacheFirst", options: { cacheName: "fonts" } },
        ],
      },
    }),
  ],
});
