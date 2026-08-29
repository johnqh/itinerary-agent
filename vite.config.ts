import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // The workspace talks to the harness through this origin, so the browser
    // never makes a cross-origin request and no credential reaches the page.
    proxy: {
      "/api": {
        target: process.env.TRUEFORGE_BASE_URL?.trim() || "http://localhost:8790",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
