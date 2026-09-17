/**
 * @file playwright.config.ts
 * @brief Desktop/mobile browser, accessibility, and process-interaction test configuration.
 * @details Exact exported symbol lines are generated in docs/generated/symbol-index.md.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "hmi/test",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
