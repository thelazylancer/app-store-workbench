import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        competitor: resolve(process.cwd(), "competitor.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/competitor-assets": "http://localhost:3001",
    },
  },
});
