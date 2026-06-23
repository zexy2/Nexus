import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local build/test artifacts. Keep these here because this config overrides
    // eslint-config-next's default ignore list.
    ".turbo/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "tsconfig.tsbuildinfo",
  ]),
  {
    rules: {
      // Allow intentionally-unused values when prefixed with "_" (standard
      // convention for required-but-unused callback params and placeholders).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
