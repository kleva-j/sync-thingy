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
      const swPath = resolve(outDir, "sw.js");
      const source = await readFile(swPath, "utf8");
      const next = source.replace(
        'const PRECACHE = ["/"];',
        `const PRECACHE = ${JSON.stringify(precache)};`,
      );

      if (next === source) {
        throw new Error("Service worker precache marker was not found");
      }

      await writeFile(swPath, next);
    },
  };
};

export default defineConfig({
  server: {
    port: 3001,
    proxy: {
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
