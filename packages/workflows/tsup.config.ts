import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/activities.ts",
    "src/workflows.ts",
    "src/worker.ts",
    "src/client.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@temporalio/workflow"],
});
