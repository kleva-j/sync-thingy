import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: true,
    globalSetup: ["./tests/support/global-setup.ts"],
    testTimeout: 15_000,
  },
});
