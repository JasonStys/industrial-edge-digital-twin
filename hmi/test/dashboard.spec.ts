/**
 * @file dashboard.spec.ts
 * @brief End-to-end keyboard, reflow, accessibility, control, and fault-visibility tests.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";

const token = "local-demo-token";

/** Send a retry-safe command directly to reset or prepare a browser scenario. */
async function command(request: APIRequestContext, body: Record<string, unknown>): Promise<void> {
  const response = await request.post("/api/v1/commands", {
    headers: { Authorization: `Bearer ${token}` },
    data: { commandId: crypto.randomUUID().replaceAll("-", "_"), ...body },
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ request }) => {
  await command(request, { type: "clearFaults" });
  await command(request, { type: "setMode", mode: "stopped" });
});

test("renders validated telemetry without automated WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Process state/ })).toBeVisible();
  await expect(page.getByText("Live telemetry")).toBeVisible();
  await expect(page.locator("#sequence-value")).not.toHaveText("—");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("accepts a token and changes operating mode", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Local command token").fill(token);
  await page.getByRole("button", { name: "Use token" }).click();
  await page.getByLabel("Mode", { exact: true }).selectOption("automatic");
  await page.getByRole("button", { name: "Set mode" }).click();
  await expect(page.locator("#mode-value")).toHaveText("automatic");
  await expect(page.locator("#command-status")).toContainText("controller mode updated");
});

test("makes stale sensor quality, fault state, and safe outputs visible", async ({
  page,
  request,
}) => {
  await command(request, { type: "setMode", mode: "automatic" });
  await command(request, { type: "injectFault", fault: "freeze_level_sensor", enabled: true });
  await page.goto("/");
  await expect(page.locator("#quality-badge")).toHaveText("stale", { timeout: 5_000 });
  await expect(page.locator("#controller-value")).toHaveText("faulted");
  await expect(page.locator("#alarm-list")).toContainText("Safe-state outputs are active");
});

test("distinguishes requested from fault-overridden actual output", async ({ page, request }) => {
  await command(request, { type: "injectFault", fault: "pump_stuck_on", enabled: true });
  await page.goto("/");
  await expect(page.locator("#pump-actual-label")).toHaveText("100%");
  await expect(page.locator("#pump-delta")).toHaveText("Mismatch");
});

test("supports keyboard skip navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to process overview" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("reflows without horizontal page overflow", async ({ page }) => {
  await page.goto("/");
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth + 1);
  await expect(page.getByRole("heading", { name: "Issue bounded commands" })).toBeVisible();
});
