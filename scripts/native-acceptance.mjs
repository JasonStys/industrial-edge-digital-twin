/**
 * @file native-acceptance.mjs
 * @brief Exercise the actual packaged HMI/C++ engine, persisted targets, strict traces and restart.
 * @details Jason Stys; only owned synthetic profiles and native windows are used.
 */
import { _electron as electron, expect } from "@playwright/test";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const executable = resolve(process.argv[2]);
const output = resolve(process.argv[3] ?? "artifacts/native");
const temporary = await mkdtemp(join(tmpdir(), "twin-native-"));
const profile = join(temporary, "private-profile");
const cwd = join(temporary, "unrelated-cwd");
await mkdir(cwd);
await mkdir(output, { recursive: true });
const receipt = { schema: 1, version: "1.1.0", acceptance: "running", stages: [] };
let application;
const errors = [];

/** Start the actual packaged app with isolated profile and no developer runtime on PATH. */
async function launch() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(?:TWIN_|MQTT_|ELECTRON_RUN_AS_NODE$)/u.test(key),
    ),
  );
  Object.assign(env, {
    TWIN_DESKTOP_TEST: "1",
    TWIN_DESKTOP_PROFILE: profile,
    PATH: join(process.env.SystemRoot ?? "C:\\Windows", "System32"),
  });
  application = await electron.launch({ executablePath: executable, cwd, env, timeout: 45000 });
  const page = await application.firstWindow();
  page.on("pageerror", () => errors.push("renderer-error"));
  await expect(page.locator("#native-workspace")).toBeVisible();
  await expect(page.locator("#native-version")).toContainText("1.1.0");
  const proof = await application.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    visible: BrowserWindow.getAllWindows().some((window) => window.isVisible()),
    sandbox: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox,
    nodeIntegration:
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().nodeIntegration,
    electron: process.versions.electron,
  }));
  expect(proof).toEqual({
    packaged: true,
    version: "1.1.0",
    visible: true,
    sandbox: true,
    nodeIntegration: false,
    electron: "44.11.0",
  });
  const ready = JSON.parse(await readFile(join(profile, "desktop-ready.json"), "utf8"));
  expect(ready.nativeWindowVisible).toBe(true);
  expect(ready.version).toBe("1.1.0");
  const health = await page.request.get(ready.origin + "/desktop/health");
  expect(await health.json()).toMatchObject({
    instance: ready.instance,
    engineRunning: true,
    mode: "offline-simulated-plant",
  });
  ready.engineProcessId = (await health.json()).engineProcessId;
  expect(Number.isSafeInteger(ready.engineProcessId)).toBe(true);
  return { page, ready };
}

/** Check actual supervised child disappearance without terminating an unrelated process. */
function isGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code === "ESRCH") return true;
    throw error;
  }
}

/** Only explicit API probes receive a test header; normal renderer requests use Electron's exact-origin boundary. */
async function probe(page, ready, path, options = {}) {
  return page.request.fetch(ready.origin + path, {
    ...options,
    headers: { "X-Twin-Session": ready.testSession, ...options.headers },
  });
}

try {
  let { page, ready } = await launch();
  receipt.source = ready.source;
  receipt.sourceDirty = ready.sourceDirty;
  await expect(page.locator("#access-form")).toBeHidden();
  const secondOwner = spawn(executable, [], {
    cwd,
    env: { ...process.env, TWIN_DESKTOP_TEST: "1", TWIN_DESKTOP_PROFILE: profile },
    stdio: "ignore",
    windowsHide: true,
  });
  await expect.poll(() => secondOwner.exitCode, { timeout: 10000 }).toBe(2);
  expect((await page.request.get(ready.origin + "/api/v1/state")).status()).toBe(403);
  expect(
    (
      await probe(page, ready, "/api/v1/state", { headers: { Origin: "https://example.invalid" } })
    ).status(),
  ).toBe(403);
  await page.locator("#level-target").fill("420");
  await page.locator("#temperature-target").fill("55");
  await page.locator("#target-form button").click();
  await expect
    .poll(async () => (await (await probe(page, ready, "/api/v1/state")).json()).snapshot.targets)
    .toEqual({ level_l: 420, temperature_c: 55 });
  await page.locator("#native-save-targets").click();
  await expect(page.locator("#native-status")).toContainText("Saved current targets");
  await page.locator("#trace-start").click();
  await page.locator("#mode-input").selectOption("automatic");
  await page.locator("#mode-form button").click();
  await expect
    .poll(async () => (await (await probe(page, ready, "/api/v1/state")).json()).snapshot.mode)
    .toBe("automatic");
  await page.locator("#fault-input").selectOption("level_sensor_out_of_range");
  await page.locator('#fault-form button[data-enabled="true"]').click();
  await expect
    .poll(
      async () =>
        (await (await probe(page, ready, "/api/v1/state")).json()).snapshot.alarms.sensor_fault,
    )
    .toBe(true);
  await page.locator("#trace-stop").click();
  await page.locator("#trace-review").click();
  await expect(page.locator("#mode-input")).toBeDisabled();
  await page.locator("#native-save-trace").click();
  await expect(page.locator("#native-status")).toContainText("validated review samples");
  const traceResponse = await probe(page, ready, "/desktop/trace");
  const trace = await traceResponse.json();
  expect(trace.snapshots.length).toBeGreaterThan(1);
  expect(trace.snapshots.some((snapshot) => snapshot.faults.level_sensor_out_of_range)).toBe(true);
  const bytes = await readFile(join(profile, "review-trace.json"));
  expect(
    (
      await probe(page, ready, "/desktop/trace", { method: "POST", data: { traceVersion: 1 } })
    ).status(),
  ).toBe(400);
  expect(await readFile(join(profile, "review-trace.json"))).toEqual(bytes);
  await page.locator("#trace-import").setInputFiles({
    name: "invalid-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"traceVersion":999}'),
  });
  await expect(page.locator("#trace-error")).toContainText("Import rejected");
  await page.locator("#trace-review").click();
  await page.locator("#trace-position").fill(String(trace.snapshots.length - 1));
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({ path: join(output, "native-workspace.png") });
  await page
    .locator("section")
    .filter({ has: page.locator("#trace-title") })
    .screenshot({ path: join(output, "native-recording-review.png") });
  receipt.stages.push(
    "actual-sandboxed-native-window-cpp-control-fault-recording-and-invalid-preservation",
  );
  const previous = ready.instance;
  const firstProcess = application.process();
  await page.locator("#native-quit").click();
  await expect.poll(() => firstProcess.exitCode, { timeout: 15000 }).toBe(0);
  await expect.poll(() => isGone(ready.engineProcessId)).toBe(true);
  application = undefined;
  ({ page, ready } = await launch());
  expect(ready.instance).not.toBe(previous);
  const state = (await (await probe(page, ready, "/api/v1/state")).json()).snapshot;
  expect(state.mode).toBe("stopped");
  expect(state.targets).toEqual({ level_l: 420, temperature_c: 55 });
  expect(Object.values(state.faults).every((value) => value === false)).toBe(true);
  await page.locator("#native-load-trace").click();
  await expect(page.locator("#native-status")).toContainText(
    `Loaded ${trace.snapshots.length} saved samples`,
  );
  await expect(page.locator("#mode-input")).toBeDisabled();
  expect(await readFile(join(profile, "review-trace.json"))).toEqual(bytes);
  await page.locator("#trace-live").click();
  await expect(page.locator("#mode-input")).toBeEnabled();
  expect(errors).toEqual([]);
  const secondProcess = application.process();
  await page.locator("#native-quit").click();
  await expect.poll(() => secondProcess.exitCode, { timeout: 15000 }).toBe(0);
  await expect.poll(() => isGone(ready.engineProcessId)).toBe(true);
  application = undefined;
  receipt.stages.push(
    "durable-targets-stopped-startup-readonly-trace-recovery-and-owned-process-exit",
  );
  receipt.acceptance = "passed";
  receipt.savedSamples = trace.snapshots.length;
  receipt.savedTargets = state.targets;
  receipt.actualEngineExitBothLaunches = true;
  receipt.scope =
    "Actual unsigned Windows portable app; isolated synthetic profile; no OS installation or hardware/MQTT integration";
  console.log("Actual packaged twin application acceptance passed.");
} catch (error) {
  receipt.acceptance = "failed";
  receipt.failure = String(error.message).slice(0, 3000);
  console.error(receipt.failure);
  process.exitCode = 1;
} finally {
  await application?.close();
  await writeFile(join(output, "native-acceptance.json"), JSON.stringify(receipt, null, 2) + "\n");
}
