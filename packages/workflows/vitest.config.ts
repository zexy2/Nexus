import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Workflow tests bundle workflow code and start the Temporal time-skipping
    // test server (downloaded and cached on first use), so allow generous time.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/*.test.ts"],
    },
  },
});
