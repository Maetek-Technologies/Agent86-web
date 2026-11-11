import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the bridge runs on 8686 (`pnpm dev` starts both) and Vite proxies to it.
// The bridge is started with --dev-origin http://localhost:5173, so it accepts this origin.
const BRIDGE = "http://127.0.0.1:8686";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: BRIDGE, changeOrigin: true },
      "/acp": { target: BRIDGE, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // The bridge serves a strict CSP (no inline scripts), so keep everything in files.
    assetsInlineLimit: 0,
    // The app is served from localhost, so its size barely affects load time. Most of it is the
    // ACP SDK (with zod) and the Markdown parser; see docs/OPEN_QUESTIONS.md Q6.
    chunkSizeWarningLimit: 700,
  },
});
