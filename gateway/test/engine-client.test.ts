/**
 * @file engine-client.test.ts
 * @brief Real-process integration tests for supervision, validation, and command correlation.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { EngineClient } from "../src/engine-client.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultEngine = path.join(
  repositoryRoot,
  "build",
  process.platform === "win32" ? "twin-engine.exe" : "twin-engine",
);
const enginePath = process.env.TWIN_ENGINE_PATH ?? defaultEngine;

let client: EngineClient | undefined;
afterEach(async () => {
  await client?.stop();
  client = undefined;
});

describe("EngineClient", () => {
  it("rejects commands before startup and permits an idempotent stop", async () => {
    client = new EngineClient(enginePath, 25);
    await expect(
      client.sendCommand({ commandId: "too_early", operation: "set-mode", arguments: ["stopped"] }),
    ).rejects.toThrow(/not running/);
    await expect(client.stop()).resolves.toBeUndefined();
  });

  it("surfaces process startup failures", async () => {
    client = new EngineClient(`${enginePath}.missing`, 25);
    await expect(client.start()).rejects.toThrow(/failed to start/);
  });

  it("starts with validated telemetry and correlates idempotent commands", async () => {
    client = new EngineClient(enginePath, 25);
    await client.start();
    await expect(client.start()).rejects.toThrow(/already started/);
    expect(client.latest()?.sequence).toBeGreaterThanOrEqual(0);
    expect(client.diagnostics().running).toBe(true);

    const pending = client.sendCommand({
      commandId: "parallel_mode",
      operation: "set-mode",
      arguments: ["stopped"],
    });
    await expect(
      client.sendCommand({
        commandId: "parallel_mode",
        operation: "set-mode",
        arguments: ["manual"],
      }),
    ).rejects.toThrow(/already awaiting/);
    await expect(pending).resolves.toMatchObject({ accepted: true });

    const first = await client.sendCommand({
      commandId: "integration_mode",
      operation: "set-mode",
      arguments: ["automatic"],
    });
    const duplicate = await client.sendCommand({
      commandId: "integration_mode",
      operation: "set-mode",
      arguments: ["manual"],
    });
    expect(first.accepted).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(client.latest()?.mode).toBe("automatic");
  });

  it("receives increasing fixed-step telemetry without an unbounded queue", async () => {
    client = new EngineClient(enginePath, 20);
    let received = 0;
    const unsubscribe = client.onSnapshot(() => {
      ++received;
    });
    await client.start();
    const initial = client.latest()?.sequence ?? 0;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(client.latest()?.sequence).toBeGreaterThan(initial);
    expect(received).toBeGreaterThan(0);
    expect(client.diagnostics().droppedTicks).toBeGreaterThanOrEqual(0);
    unsubscribe();
  });

  it("rejects excess concurrent commands at the configured queue bound", async () => {
    client = new EngineClient(enginePath, 25, 1);
    await client.start();
    const first = client.sendCommand({
      commandId: "bounded_1",
      operation: "set-mode",
      arguments: ["stopped"],
    });
    await expect(
      client.sendCommand({
        commandId: "bounded_2",
        operation: "set-mode",
        arguments: ["manual"],
      }),
    ).rejects.toThrow(/queue is full/);
    await expect(first).resolves.toMatchObject({ accepted: true });
  });
});
