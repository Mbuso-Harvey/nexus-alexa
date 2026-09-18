import { defineConfig } from "vitest/config";

export default defineConfig({
  // Prevent Vite from discovering an unrelated postcss.config.js higher up the tree.
  css: { postcss: {} },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
