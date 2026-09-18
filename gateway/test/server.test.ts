/**
 * @file server.test.ts
 * @brief HTTP authorization, validation, health, and telemetry API tests.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GatewayConfig } from "../src/config.js";
import { createServer, tokenMatches, type TelemetryPublisher } from "../src/server.js";
import { FakeEngine, snapshotFixture } from "./fixtures.js";

const config: GatewayConfig = {
  commandToken: "test-token-12345",
  enginePath: "/unused",
  host: "127.0.0.1",
  port: 8080,
  staticRoot: "/unused",
  tickMs: 100,
};

class FakePublisher implements TelemetryPublisher {
  readonly snapshots: Array<typeof snapshotFixture> = [];
  enqueue(snapshot: typeof snapshotFixture): void {
    this.snapshots.push(snapshot);
  }
  status() {
    return { connected: false, enabled: false, replacedMessages: 0 };
  }
}

let server: FastifyInstance | undefined;
let staticTestRoot: string | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  if (staticTestRoot !== undefined) {
    await rm(staticTestRoot, { force: true, recursive: true });
    staticTestRoot = undefined;
  }
});

describe("tokenMatches", () => {
  it("accepts only identical bearer token content", () => {
    expect(tokenMatches("correct-token", "correct-token")).toBe(true);
    expect(tokenMatches("wrong-token", "correct-token")).toBe(false);
  });
});

describe("gateway routes", () => {
  it("reports engine and MQTT health without leaking stderr", async () => {
    server = await createServer(config, new FakeEngine(), new FakePublisher(), false);
    const response = await server.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      engine: { running: true, droppedTicks: 2 },
      mqtt: { connected: false, enabled: false, replacedMessages: 0 },
    });
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
  });

  it("reports degraded health when the supervised engine is unavailable", async () => {
    const engine = new FakeEngine();
    engine.running = false;
    server = await createServer(config, engine, new FakePublisher(), false);
    const response = await server.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded", engine: { running: false } });
  });

  it("returns validated read-only state and a useful unavailable response", async () => {
    const engine = new FakeEngine();
    server = await createServer(config, engine, new FakePublisher(), false);
    const available = await server.inject({ method: "GET", url: "/api/v1/state" });
    expect(available.statusCode).toBe(200);
    expect(available.json()).toEqual({ snapshot: snapshotFixture });

    engine.snapshot = undefined;
    const unavailable = await server.inject({ method: "GET", url: "/api/v1/state" });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ title: "Unavailable" });
  });

  it("rejects missing auth and malformed commands", async () => {
    server = await createServer(config, new FakeEngine(), new FakePublisher(), false);
    const unauthorized = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      payload: { commandId: "mode_1", type: "setMode", mode: "automatic" },
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["www-authenticate"]).toContain("Bearer");

    const wrongToken = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      headers: { authorization: "Bearer definitely-wrong" },
      payload: { commandId: "mode_1", type: "setMode", mode: "automatic" },
    });
    expect(wrongToken.statusCode).toBe(401);

    const malformed = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      headers: { authorization: `Bearer ${config.commandToken}` },
      payload: { commandId: "bad id", type: "setMode", mode: "warp" },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("maps an authenticated API command to the engine", async () => {
    const engine = new FakeEngine();
    server = await createServer(config, engine, new FakePublisher(), false);
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      headers: { authorization: `Bearer ${config.commandToken}` },
      payload: { commandId: "mode_1", type: "setMode", mode: "automatic" },
    });
    expect(response.statusCode).toBe(200);
    expect(engine.commands).toEqual([
      { commandId: "mode_1", operation: "set-mode", arguments: ["automatic"] },
    ]);
    expect(response.json()).toMatchObject({ result: { accepted: true } });
  });

  it("preserves engine rejection and failure semantics", async () => {
    const engine = new FakeEngine();
    engine.nextResult = {
      accepted: false,
      duplicate: false,
      command_id: "mode_2",
      code: "rejected",
      message: "synthetic rejection",
    };
    server = await createServer(config, engine, new FakePublisher(), false);
    const rejected = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      headers: { authorization: `Bearer ${config.commandToken}` },
      payload: { commandId: "mode_2", type: "setMode", mode: "automatic" },
    });
    expect(rejected.statusCode).toBe(409);

    engine.nextError = new Error("synthetic engine outage");
    const unavailable = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      headers: { authorization: `Bearer ${config.commandToken}` },
      payload: { commandId: "mode_3", type: "setMode", mode: "stopped" },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ detail: "synthetic engine outage" });

    engine.nextError = "non-error rejection";
    const opaqueFailure = await server.inject({
      method: "POST",
      url: "/api/v1/commands",
      headers: { authorization: `Bearer ${config.commandToken}` },
      payload: { commandId: "mode_4", type: "setMode", mode: "stopped" },
    });
    expect(opaqueFailure.statusCode).toBe(503);
    expect(opaqueFailure.json()).toMatchObject({ detail: "Engine command failed." });
  });

  it("publishes emitted telemetry", async () => {
    const engine = new FakeEngine();
    const publisher = new FakePublisher();
    server = await createServer(config, engine, publisher, false);
    engine.emit(snapshotFixture);
    expect(publisher.snapshots).toEqual([snapshotFixture]);
  });

  it("serves the built HMI without exposing filesystem paths", async () => {
    staticTestRoot = await mkdtemp(join(tmpdir(), "edge-twin-static-"));
    await writeFile(
      join(staticTestRoot, "index.html"),
      "<!doctype html><html><body>Harbor Twin Lab</body></html>",
      "utf8",
    );
    server = await createServer(
      { ...config, staticRoot: staticTestRoot },
      new FakeEngine(),
      new FakePublisher(),
      true,
    );
    const response = await server.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Harbor Twin Lab");
    expect(response.body).not.toContain(staticTestRoot);
  });
});
