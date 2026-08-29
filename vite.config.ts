import type { ProxyOptions } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The workspace talks to the harness through its own origin, so the browser
// never makes a cross-origin request and no credential reaches the page. Both
// `vite` and `vite preview` serve the app, so both proxy `/api`: without it the
// preview build sends harness calls to the static file server and reports live
// research unavailable. A build hosted anywhere else has no proxy in front of
// it and must be given `VITE_TRUEFORGE_BASE_URL` at build time instead.
const harnessProxy = {
  "/api": {
    target: process.env.TRUEFORGE_BASE_URL?.trim() || "http://localhost:8790",
    changeOrigin: true,
  },
};

// Google Routes is reached through this origin too, and for a stronger reason:
// the API key is injected here, server-side. A `VITE_`-prefixed key would be
// inlined into the client bundle and readable by anyone who opens the page.
// Requests carry their own field mask, which is not secret.
const routingProxy: Record<string, ProxyOptions> = {
  "/gmaps": {
    target: "https://routes.googleapis.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/gmaps/, ""),
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
        if (key) proxyReq.setHeader("X-Goog-Api-Key", key);
      });
    },
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { proxy: { ...harnessProxy, ...routingProxy } },
  preview: { proxy: { ...harnessProxy, ...routingProxy } },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
