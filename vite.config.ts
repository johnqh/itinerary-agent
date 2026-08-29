import type { ProxyOptions } from "vite";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  // `.env` is not propagated into this process by the package runner, so it is
  // read explicitly. The empty prefix loads unprefixed variables too, which is
  // the point: the routing key must NOT be VITE_-prefixed, or it would be
  // inlined into the client bundle for anyone to read.
  const env = loadEnv(mode, process.cwd(), "");

  // The workspace talks to the harness through its own origin, so the browser
  // never makes a cross-origin request and no credential reaches the page. Both
  // `vite` and `vite preview` serve the app, so both proxy `/api`.
  const harnessProxy: Record<string, ProxyOptions> = {
    "/api": {
      target: env.TRUEFORGE_BASE_URL?.trim() || "http://localhost:8790",
      changeOrigin: true,
    },
  };

  // Google Routes is reached through this origin too, and for a stronger
  // reason: the API key is attached here, server-side, and never sent to the
  // browser. The field mask travels with each request and is not secret.
  const routingProxy: Record<string, ProxyOptions> = {
    "/gmaps": {
      target: "https://routes.googleapis.com",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/gmaps/, ""),
      configure: (proxy) => {
        proxy.on("proxyReq", (proxyReq) => {
          const key = env.GOOGLE_MAPS_API_KEY?.trim();
          if (key) proxyReq.setHeader("X-Goog-Api-Key", key);
        });
      },
    },
  };

  const proxy = { ...harnessProxy, ...routingProxy };

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { proxy },
    preview: { proxy },
    test: {
      globals: true,
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
