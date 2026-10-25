import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Big Boss Finance",
        short_name: "Big Boss",
        description: "Private local finance",
        theme_color: "#16796b",
        background_color: "#f5f7f9",
        display: "standalone",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "validation", test: /node_modules[\\/]zod/ },
            {
              name: "database",
              test: /node_modules[\\/](dexie|dexie-react-hooks)/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    setupFiles: ["src/tests/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
