/**
 * @file vitest.config.ts
 * @brief Unit and integration test discovery plus enforceable coverage thresholds.
 * @details Exact exported symbols are listed in docs/generated/symbol-index.md.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["gateway/test/**/*.test.ts", "hmi/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "reports/coverage",
      include: ["gateway/src/**/*.ts", "hmi/src/**/*.ts"],
      exclude: ["gateway/src/main.ts", "hmi/src/app.ts"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
    testTimeout: 10_000,
  },
});
