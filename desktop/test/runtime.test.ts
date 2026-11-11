/**
 * @file runtime.test.ts
 * @brief Verify actual C++ native adapter, private file bounds and durable review semantics.
 * @details Jason Stys; all inputs and profiles are temporary synthetic fixtures.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  linkSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readPrivate, startNative, writePrivate } from "../src/runtime.js";

const roots: string[] = [];
const running: Awaited<ReturnType<typeof startNative>>[] = [];
function root(): string {
  const path = mkdtempSync(join(tmpdir(), "twin-adapter-"));
  roots.push(path);
  return path;
}
afterEach(async () => {
  for (const service of running.splice(0)) await service.close();
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

it("reads missing, exact-budget and strict UTF8 private files", () => {
  const path = join(root(), "bounded.json");
  expect(readPrivate(path, 4)).toBeUndefined();
  writePrivate(path, "1234");
  expect(readPrivate(path, 4)).toBe("1234");
  expect(() => readPrivate(path, 3)).toThrow("bounded");
  writeFileSync(path, Buffer.from([255]));
  expect(() => readPrivate(path, 4)).toThrow();
});

it("refuses directories and hardlinked saved records", () => {
  const directory = root();
  expect(() => readPrivate(directory, 10)).toThrow("regular");
  const path = join(directory, "original");
  writePrivate(path, "old");
  const alias = join(directory, "alias");
  linkSync(path, alias);
  expect(() => readPrivate(alias, 10)).toThrow("regular");
});

it("atomically replaces a valid private file and cleans its own staging bytes", () => {
  const directory = root(),
    path = join(directory, "record.json");
  writePrivate(path, "first");
  writePrivate(path, "replacement");
  expect(readFileSync(path, "utf8")).toBe("replacement");
  expect(readdirSync(directory)).toEqual(["record.json"]);
});

it("does not remove an existing directory when publication fails", () => {
  const directory = root(),
    path = join(directory, "record.json");
  mkdirSync(path);
  writeFileSync(join(path, "preserved"), "old");
  expect(() => writePrivate(path, "new")).toThrow();
  expect(readFileSync(join(path, "preserved"), "utf8")).toBe("old");
  expect(readdirSync(directory)).toEqual(["record.json"]);
});

it.each(["{bad", '{"schema":1,"targets":{"level_l":1,"temperature_c":55}}'])(
  "preserves malformed existing target configuration instead of resetting it (%s)",
  async (content) => {
    const directory = root();
    writeFileSync(join(directory, "targets.json"), content);
    await expect(
      startNative({
        profile: directory,
        enginePath: "never-start",
        staticRoot: directory,
        version: "1.1.0",
        source: "a".repeat(40),
        sourceDirty: true,
        stop() {},
      }),
    ).rejects.toThrow();
    expect(readFileSync(join(directory, "targets.json"), "utf8")).toBe(content);
  },
);

it("uses actual compiled simulation commands with private origin/session and saved read-only trace", async () => {
  const directory = root();
  let stopped = false;
  const enginePath =
    process.env.TWIN_ENGINE_PATH ??
    resolve("build", process.platform === "win32" ? "twin-engine.exe" : "twin-engine");
  const service = await startNative({
    profile: directory,
    enginePath,
    staticRoot: resolve("hmi"),
    version: "1.1.0",
    source: "a".repeat(40),
    sourceDirty: true,
    stop() {
      stopped = true;
    },
  });
  running.push(service);
  const headers = { host: new URL(service.origin).host, "x-twin-session": service.token };
  expect(
    (await service.server.inject({ url: "/api/v1/state", headers: { host: headers.host } }))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await service.server.inject({
        url: "/api/v1/state",
        headers: { ...headers, origin: "https://example.invalid" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await service.server.inject({
        url: "/api/v1/state",
        headers: { ...headers, host: "localhost:1234" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await service.server.inject({
        url: "/api/v1/state",
        headers: { ...headers, "x-twin-session": "wrong" },
      })
    ).statusCode,
  ).toBe(403);
  expect((await service.server.inject({ url: "/desktop/trace", headers })).statusCode).toBe(404);
  const command = await service.server.inject({
    method: "POST",
    url: "/api/v1/commands",
    headers: { ...headers, authorization: "Bearer " + service.commandToken },
    payload: { commandId: "real_target", type: "setTarget", field: "level_l", value: 420 },
  });
  expect(command.statusCode).toBe(200);
  const savedTargets = await service.server.inject({
    method: "POST",
    url: "/desktop/targets",
    headers,
  });
  expect(savedTargets.json()).toMatchObject({
    saved: true,
    targets: { level_l: 420 },
    startupMode: "stopped",
  });
  expect((await service.server.inject({ url: "/desktop/info", headers })).json()).toMatchObject({
    savedTargets: { level_l: 420 },
  });
  const trace = {
    traceVersion: 1,
    scope: "simulated-heated-tank",
    capacity: 1200,
    dropped: 0,
    snapshots: [service.engine.latest()],
  };
  expect(
    (
      await service.server.inject({
        method: "POST",
        url: "/desktop/trace",
        headers,
        payload: trace,
      })
    ).json(),
  ).toEqual({ saved: true, snapshots: 1, readOnly: true });
  const bytes = readFileSync(join(directory, "review-trace.json"));
  expect(
    (
      await service.server.inject({
        method: "POST",
        url: "/desktop/trace",
        headers,
        payload: { traceVersion: 999 },
      })
    ).statusCode,
  ).toBe(400);
  expect(readFileSync(join(directory, "review-trace.json"))).toEqual(bytes);
  expect((await service.server.inject({ url: "/desktop/trace", headers })).json()).toEqual(trace);
  expect((await service.server.inject({ url: "/desktop/info", headers })).json()).toMatchObject({
    savedTrace: true,
    version: "1.1.0",
  });
  expect(
    (
      await service.server.inject({ url: "/desktop/health", headers: { host: headers.host } })
    ).json(),
  ).toMatchObject({ engineRunning: true, mode: "offline-simulated-plant" });
  expect(
    (await service.server.inject({ method: "POST", url: "/desktop/quit", headers })).json(),
  ).toEqual({ stopping: true });
  expect(stopped).toBe(true);
});

it("rate-limits actual trace reads and writes independently before touching saved bytes", async () => {
  const directory = root();
  const service = await startNative({
    profile: directory,
    enginePath:
      process.env.TWIN_ENGINE_PATH ??
      resolve("build", process.platform === "win32" ? "twin-engine.exe" : "twin-engine"),
    staticRoot: resolve("hmi"),
    version: "1.1.0",
    source: "a".repeat(40),
    sourceDirty: true,
    stop() {},
  });
  running.push(service);
  const headers = { host: new URL(service.origin).host, "x-twin-session": service.token };
  const trace = {
    traceVersion: 1,
    scope: "simulated-heated-tank",
    capacity: 1200,
    dropped: 0,
    snapshots: [service.engine.latest()],
  };
  for (let index = 0; index < 12; index += 1)
    expect(
      (
        await service.server.inject({
          method: "POST",
          url: "/desktop/trace",
          headers,
          payload: trace,
        })
      ).statusCode,
    ).toBe(200);
  const original = readFileSync(join(directory, "review-trace.json"));
  const denied = await service.server.inject({
    method: "POST",
    url: "/desktop/trace",
    headers,
    payload: { traceVersion: 999 },
  });
  expect(denied.statusCode).toBe(429);
  expect(Number(denied.headers["retry-after"])).toBeGreaterThan(0);
  expect(Number(denied.headers["retry-after"])).toBeLessThanOrEqual(60);
  expect(readFileSync(join(directory, "review-trace.json"))).toEqual(original);
  for (let index = 0; index < 30; index += 1)
    expect((await service.server.inject({ url: "/desktop/trace", headers })).statusCode).toBe(200);
  expect((await service.server.inject({ url: "/desktop/trace", headers })).statusCode).toBe(429);
});
