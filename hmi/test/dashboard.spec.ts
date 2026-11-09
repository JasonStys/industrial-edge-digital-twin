/**
 * @file dashboard.spec.ts
 * @brief End-to-end keyboard, reflow, accessibility, control, and fault-visibility tests.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { snapshotFixture } from "../../gateway/test/fixtures.js";

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
  await expect(page.getByText("Live telemetry", { exact: true })).toBeVisible();
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

test("operator captures a real fault campaign, reviews without commanding and exports aligned evidence", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByText("Live telemetry", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start new recording", exact: true }).click();
  await command(request, { type: "setMode", mode: "automatic" });
  await command(request, { type: "injectFault", fault: "freeze_level_sensor", enabled: true });
  await expect(page.locator("#quality-badge")).toHaveText("stale", { timeout: 5000 });
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recording", exact: true }).click();
  const saved = await (await download).path();
  expect(saved).not.toBeNull();
  const exported = JSON.parse(await readFile(saved, "utf8")) as {
    snapshots: (typeof snapshotFixture)[];
  };
  expect(exported.snapshots.length).toBeGreaterThan(3);
  expect(
    exported.snapshots.some(
      (point) =>
        point.signals.level.quality === "stale" &&
        point.alarms.sensor_fault &&
        point.actual.heater_pct === 0,
    ),
  ).toBe(true);
  expect(JSON.stringify(exported)).not.toContain(token);
  const commands: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/v1/commands")) commands.push(r.url());
  });
  await page.getByRole("button", { name: "Review recording", exact: true }).click();
  await expect(page.locator("#trace-mode")).toContainText("RECORDED REVIEW");
  await expect(page.getByRole("button", { name: "Set mode", exact: true })).toBeDisabled();
  await page
    .locator("#mode-form")
    .evaluate((form) =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  await expect(page.locator("#command-status")).toHaveText(
    "Return to live view before issuing a command.",
  );
  expect(commands).toEqual([]);
  await page.getByLabel("Recorded sample", { exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.locator("#quality-badge")).toHaveText("stale");
  await page.getByLabel("Trend signal and scale").selectOption("temperature");
  await expect(page.locator("#level-trend")).not.toHaveAttribute("points", "");
  await page.getByRole("button", { name: "Play recording · 5 samples/s", exact: true }).click();
  await expect
    .poll(async () => Number(await page.locator("#trace-position").inputValue()))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause recording", exact: true }).click();
  await page.getByRole("button", { name: "Return to live", exact: true }).click();
  await expect(page.locator("#trace-mode")).toContainText("LIVE VIEW");
  await expect(page.getByRole("button", { name: "Set mode", exact: true })).toBeEnabled();
});

test("analyst imports a realistic quality-transition trace, rejects bad files and prevents stale import overwrites", async ({
  page,
}) => {
  const first = structuredClone(snapshotFixture);
  first.sequence = 0;
  first.simulation_time_s = 0;
  first.signals.level.source_time_s = 0;
  first.signals.temperature.source_time_s = 0;
  const frozen = structuredClone(first);
  frozen.sequence = 1;
  frozen.simulation_time_s = 2;
  frozen.plant.level_l = 518;
  frozen.faults.freeze_level_sensor = true;
  frozen.signals.level.quality = "stale";
  frozen.alarms.sensor_fault = true;
  frozen.alarms.safe_state_active = true;
  frozen.controller_state = "faulted";
  frozen.actual = { pump_pct: 0, outlet_valve_pct: 0, heater_pct: 0 };
  frozen.signals.temperature.source_time_s = 2;
  const data = Buffer.from(
    JSON.stringify({
      traceVersion: 1,
      scope: "simulated-heated-tank",
      capacity: 1200,
      dropped: 0,
      snapshots: [first, frozen],
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Import recording (JSON, maximum 2 MiB)")
    .setInputFiles({ name: "coolant-freeze.json", mimeType: "application/json", buffer: data });
  await expect(page.locator("#trace-mode")).toContainText("imported, not authenticated");
  await page.getByLabel("Recorded sample", { exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.locator("#trace-markers")).toContainText("Quality level: good → stale");
  await expect(page.locator("#trace-markers")).toContainText("Fault freeze_level_sensor: on");
  await expect(page.locator("#level-value")).toHaveText("510.0");
  await expect(page.locator("#pump-actual-label")).toHaveText("0%");
  await page.getByLabel("Import recording (JSON, maximum 2 MiB)").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"traceVersion":99}'),
  });
  await expect(page.locator("#trace-error")).toContainText("Import rejected");
  await expect(page.locator("#level-value")).toHaveText("510.0");
  await expect(page.locator("#trace-position-label")).toContainText("Sample 2 of 2");
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Delayed test read deliberately restores its File receiver with .call(this).
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      return new Promise<ArrayBuffer>((resolve) => {
        (window as unknown as { releaseTraceRead: () => void }).releaseTraceRead = () => {
          void original.call(this).then(resolve);
        };
      });
    };
  });
  await page
    .getByLabel("Import recording (JSON, maximum 2 MiB)")
    .setInputFiles({ name: "delayed.json", mimeType: "application/json", buffer: data });
  await page.getByRole("button", { name: "Start new recording", exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { releaseTraceRead: () => void }).releaseTraceRead(),
  );
  await expect(page.locator("#trace-mode")).toContainText("LIVE VIEW");
  await expect(page.locator("#trace-status")).toContainText("Recording");
  await expect(page.getByRole("button", { name: "Review recording", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
});

test("live command transport failure stays an explicit unknown outcome", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Local command token").fill(token);
  await page.getByRole("button", { name: "Use token", exact: true }).click();
  await page.route("**/api/v1/commands", (route) => route.abort("connectionfailed"));
  await page.getByRole("button", { name: "Set mode", exact: true }).click();
  await expect(page.locator("#command-status")).toContainText("no success is assumed");
  expect(errors).toEqual([]);
});

test("leaving imported review without a live sample never relabels historical readings as live", async ({
  page,
}) => {
  await page.route("**/api/v1/state", (route) =>
    route.fulfill({ status: 503, json: { detail: "Synthetic unavailable stream" } }),
  );
  await page.route("**/api/v1/events", (route) => route.abort());
  await page.goto("/");
  const data = Buffer.from(
    JSON.stringify({
      traceVersion: 1,
      scope: "simulated-heated-tank",
      capacity: 1200,
      dropped: 0,
      snapshots: [snapshotFixture],
    }),
  );
  await page
    .getByLabel("Import recording (JSON, maximum 2 MiB)")
    .setInputFiles({ name: "offline-review.json", mimeType: "application/json", buffer: data });
  await expect(page.locator("#trace-mode")).toContainText("RECORDED REVIEW");
  await expect(page.locator("#level-value")).toHaveText("510.0");
  await page.getByRole("button", { name: "Return to live", exact: true }).click();
  await expect(page.locator("#trace-mode")).toContainText("awaiting valid telemetry");
  await expect(page.locator("#process-overview")).toBeHidden();
  await expect(page.getByRole("button", { name: "Set mode", exact: true })).toBeDisabled();
  const boundary = structuredClone(snapshotFixture);
  boundary.signals.level.value = 1e30;
  boundary.signals.level.quality = "out_of_range";
  boundary.alarms.sensor_fault = true;
  boundary.alarms.safe_state_active = true;
  boundary.controller_state = "faulted";
  boundary.actual = { pump_pct: 0, outlet_valve_pct: 0, heater_pct: 0 };
  await page.getByLabel("Import recording (JSON, maximum 2 MiB)").setInputFiles({
    name: "numeric-boundary.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        traceVersion: 1,
        scope: "simulated-heated-tank",
        capacity: 1200,
        dropped: 0,
        snapshots: [boundary],
      }),
    ),
  });
  await expect(page.locator("#level-value")).toHaveText("1.000e+30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
