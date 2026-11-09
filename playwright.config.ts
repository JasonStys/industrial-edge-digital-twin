/**
 * @file playwright.config.ts
 * @brief Desktop/mobile browser, accessibility, and process-interaction test configuration.
 * @details Exact exported symbol lines are generated in docs/generated/symbol-index.md.
 */

import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.TWIN_E2E_PORT ?? 8080);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid TWIN_E2E_PORT");

export default defineConfig({
  testDir: "hmi/test",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: "list",
  use: {
    ...(process.env.TWIN_BROWSER_CHANNEL === undefined
      ? {}
      : { channel: process.env.TWIN_BROWSER_CHANNEL }),
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
