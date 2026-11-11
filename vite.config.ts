import { existsSync, readFileSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// dev のポートは .dev.vars の DEV_PORT から読む。無ければ 5173。
function readDevPort(): number {
  const fallback = 5173;
  if (!existsSync(".dev.vars")) return fallback;
  const line = readFileSync(".dev.vars", "utf8")
    .split("\n")
    .find((l) => l.startsWith("DEV_PORT="));
  const port = Number(line?.slice("DEV_PORT=".length).trim());
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "./app/routes",
      generatedRouteTree: "./app/routeTree.gen.ts",
      routeFileIgnorePattern: "\\.test\\."
    }),
    react(),
    tailwindcss(),
    cloudflare()
  ],
  resolve: {
    tsconfigPaths: true
  },
  server: {
    port: readDevPort(),
    strictPort: true
  }
});
