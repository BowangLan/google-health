import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `pnpm dev` serves the UI with hot reload and forwards the API to the Python
// server, which is the only thing allowed to touch the record files.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
