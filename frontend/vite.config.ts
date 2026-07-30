import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    // Proxy API calls to the FastAPI backend during development.
    proxy: {
      // ws: true so the /api/ws WebSocket is proxied too.
      "/api": { target: "http://localhost:8000", changeOrigin: true, ws: true },
    },
  },
});
