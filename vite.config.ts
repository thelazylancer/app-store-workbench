import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  server: {
    proxy: {
      // 端口 3001 的 0.0.0.0 绑定常被本机幽灵监听占用，dev 时用 API_PORT 换口
      "/api": `http://localhost:${process.env.API_PORT ?? 3001}`,
      "/competitor-assets": `http://localhost:${process.env.API_PORT ?? 3001}`,
    },
  },
});
