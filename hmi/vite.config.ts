/**
 * @file vite.config.ts
 * @brief Reproducible static HMI build configuration.
 * @details Exact exported symbols are listed in docs/generated/symbol-index.md.
 */

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
