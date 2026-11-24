/**
 * Bundles the collaboration server (src/server/collaboration.ts) and all of
 * its runtime imports into a single ESM file, so the `collaboration` Docker
 * target runs it with plain `node` (no tsx, no node_modules).
 *
 * Usage: node scripts/build-collab.mjs  ->  dist-collab/collaboration.mjs
 * Requires @nexus/database to be built first (it resolves to its dist).
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: webDir,
  entryPoints: ["src/server/collaboration.ts"],
  outfile: "dist-collab/collaboration.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  legalComments: "none",
  // Optional native accelerators of `ws`; it falls back to pure JS when they
  // are absent, so they stay unresolved instead of being bundled.
  external: ["bufferutil", "utf-8-validate"],
  // CommonJS dependencies (ws, ...) call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __nexusCreateRequire } from 'node:module'; const require = __nexusCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});
