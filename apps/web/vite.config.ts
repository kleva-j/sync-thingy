import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite-plus";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const serviceWorkerPrecache = (): Plugin => {
  let outDir = "";

  return {
    name: "sync-disc-service-worker-precache",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = await readdir(resolve(outDir, "assets"));
      const precache = ["/", ...files.map((file) => `/assets/${file}`).sort()];
      const buildId = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      const swPath = resolve(outDir, "sw.js");
      const source = await readFile(swPath, "utf8");
      const precacheMarker = 'const PRECACHE = ["/"];';
      const cacheNameMarker = 'const CACHE_NAME = "sync-disc-shell-v1";';

      if (!source.includes(precacheMarker) || !source.includes(cacheNameMarker)) {
        throw new Error("Service worker build markers were not found");
      }

      const next = source
        .replace(precacheMarker, `const PRECACHE = ${JSON.stringify(precache)};`)
        .replace(cacheNameMarker, `const CACHE_NAME = "sync-disc-shell-${buildId}";`);

      await writeFile(swPath, next);
    },
  };
};

export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: true,
    globalSetup: ["./src/test/global-setup.ts"],
  },
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/electric": {
        target: "http://localhost:3006",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/electric/, ""),
      },
    },
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite-sync"],
  },
  worker: {
    format: "es",
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    serviceWorkerPrecache(),
  ],
});
