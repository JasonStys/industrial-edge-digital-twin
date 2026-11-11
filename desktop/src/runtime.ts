/**
 * @file runtime.ts
 * @brief Own the actual C++ simulation gateway and bounded durable local review files.
 * @details Jason Stys; symbols and important variables appear in docs/generated/symbol-index.md.
 */
import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import rateLimit from "@fastify/rate-limit";
import { EngineClient } from "../../gateway/src/engine-client.js";
import { createServer, tokenMatches } from "../../gateway/src/server.js";
import { toProtocolCommand } from "../../gateway/src/contracts.js";
import { parseTrace, serializeTrace, TRACE_BYTES } from "../../hmi/src/trace.js";

const Targets = z.strictObject({
  level_l: z.number().finite().min(50).max(950),
  temperature_c: z.number().finite().min(5).max(95),
});
const Settings = z.strictObject({ schema: z.literal(1), targets: Targets });

/** Node exposes platform-specific open flags; missing flags remain zero on Windows. */
function optionalFlag(name: string): number {
  const value: unknown = Reflect.get(constants, name);
  return typeof value === "number" ? value : 0;
}

/** Read one private regular file with a real byte cap and no final symlink/hardlink. */
export function readPrivate(path: string, limit: number): string | undefined {
  try {
    const descriptor = openSync(
      path,
      constants.O_RDONLY | optionalFlag("O_NOFOLLOW") | optionalFlag("O_NONBLOCK"),
    );
    try {
      const actual = fstatSync(descriptor);
      const named = lstatSync(path);
      if (
        !actual.isFile() ||
        actual.nlink !== 1 ||
        actual.size > limit ||
        !named.isFile() ||
        named.isSymbolicLink() ||
        actual.dev !== named.dev ||
        actual.ino !== named.ino
      )
        throw new Error("Saved workspace must retain a bounded regular file identity");
      const buffer = Buffer.alloc(limit + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length > limit) throw new Error("Saved workspace exceeds byte limit");
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Write a validated value atomically without deleting an older workspace on failure. */
export function writePrivate(path: string, content: string): void {
  const temporary = path + "." + randomBytes(16).toString("hex") + ".new";
  const descriptor = openSync(temporary, "wx", 0o600);
  let opened = true;
  try {
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    opened = false;
    renameSync(temporary, path);
  } catch (error) {
    try {
      if (opened) closeSync(descriptor);
    } catch {
      /* Already closed after successful flush. */
    }
    throw error;
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* A failed removal leaves only this private, randomly named staging file. */
    }
  }
}

export interface NativeConfig {
  profile: string;
  enginePath: string;
  staticRoot: string;
  version: string;
  source: string;
  sourceDirty: boolean;
  stop(): void;
}

/** Reuse the real gateway and engine; no MQTT publisher or device configuration is enabled here. */
export async function startNative(config: NativeConfig) {
  mkdirSync(config.profile, { recursive: true, mode: 0o700 });
  if (!lstatSync(config.profile).isDirectory() || lstatSync(config.profile).isSymbolicLink())
    throw new Error("Private workspace must be a directory");
  const settingsPath = join(config.profile, "targets.json");
  const tracePath = join(config.profile, "review-trace.json");
  const saved = readPrivate(settingsPath, 4096);
  let settings = saved === undefined ? undefined : Settings.parse(JSON.parse(saved));
  const oldTrace = readPrivate(tracePath, TRACE_BYTES);
  if (oldTrace !== undefined) parseTrace(oldTrace);
  const token = randomBytes(32).toString("hex");
  const commandToken = randomBytes(32).toString("hex");
  const instance = randomBytes(32).toString("hex");
  const engine = new EngineClient(config.enginePath, 100);
  await engine.start();
  let origin = "";
  let closing = false;
  try {
    if (settings !== undefined) {
      for (const [field, value] of Object.entries(settings.targets)) {
        const result = await engine.sendCommand(
          toProtocolCommand({
            commandId: "restore_" + field,
            type: "setTarget",
            field: field as "level_l" | "temperature_c",
            value,
          }),
        );
        if (!result.accepted)
          throw new Error("Saved targets were refused; existing files preserved");
      }
    }
    const publisher = {
      enqueue() {},
      status: () => ({ connected: false, enabled: false, replacedMessages: 0 }),
    };
    const server = await createServer(
      {
        commandToken,
        enginePath: config.enginePath,
        host: "127.0.0.1",
        port: 0,
        staticRoot: config.staticRoot,
        tickMs: 100,
      },
      engine,
      publisher,
      true,
      async (application) => {
        await application.register(rateLimit, {
          global: true,
          max: 120,
          timeWindow: 60000,
          cache: 8,
        });
        application.addHook("onRequest", (request, reply, done) => {
          const requestedOrigin = request.headers.origin;
          const session = request.headers["x-twin-session"];
          if (
            request.headers.host !== origin.slice(7) ||
            request.ip !== "127.0.0.1" ||
            (requestedOrigin !== undefined && requestedOrigin !== origin)
          )
            return reply.code(403).send({ error: "Local origin required" });
          if (request.url.startsWith("/api/") || request.url.startsWith("/desktop/")) {
            if (
              request.url !== "/desktop/health" &&
              (typeof session !== "string" || !tokenMatches(session, token))
            )
              return reply.code(403).send({ error: "Owned application session required" });
            if (closing && request.url !== "/desktop/health")
              return reply.code(503).send({ error: "Workspace is closing" });
          }
          return done();
        });
        application.get("/desktop/health", () => ({
          version: config.version,
          source: config.source,
          sourceDirty: config.sourceDirty,
          instance,
          mode: "offline-simulated-plant",
          engineRunning: engine.diagnostics().running,
          engineProcessId: engine.processId(),
        }));
        application.get("/desktop/info", () => ({
          version: config.version,
          savedTargets: settings?.targets ?? null,
          savedTrace: readPrivate(tracePath, TRACE_BYTES) !== undefined,
          mode: "offline-simulated-plant",
        }));
        application.post("/desktop/targets", () => {
          const current = engine.latest();
          if (current === undefined) throw new Error("No validated snapshot");
          const targets = Targets.parse(current.targets);
          writePrivate(settingsPath, JSON.stringify({ schema: 1, targets }) + "\n");
          settings = { schema: 1, targets };
          return { saved: true, targets, startupMode: "stopped" };
        });
        application.get(
          "/desktop/trace",
          { config: { rateLimit: { max: 30, timeWindow: 60000 } } },
          (_request, reply) => {
            const content = readPrivate(tracePath, TRACE_BYTES);
            if (content === undefined)
              return reply.code(404).send({ error: "No saved review trace" });
            return parseTrace(content);
          },
        );
        application.post(
          "/desktop/trace",
          { bodyLimit: TRACE_BYTES + 1, config: { rateLimit: { max: 12, timeWindow: 60000 } } },
          (request, reply) => {
            try {
              const content = JSON.stringify(request.body);
              if (Buffer.byteLength(content, "utf8") > TRACE_BYTES)
                return reply.code(413).send({ error: "Trace exceeds2MiB" });
              const validated = parseTrace(content);
              writePrivate(tracePath, serializeTrace(validated));
              return { saved: true, snapshots: validated.snapshots.length, readOnly: true };
            } catch {
              return reply
                .code(400)
                .send({ error: "Invalid trace; previous saved review preserved" });
            }
          },
        );
        application.post("/desktop/quit", (_request, reply) => {
          reply.raw.once("finish", () => config.stop());
          return { stopping: true };
        });
      },
    );
    origin = await server.listen({ host: "127.0.0.1", port: 0 });
    return {
      origin,
      token,
      commandToken,
      instance,
      server,
      engine,
      async close() {
        closing = true;
        await engine.stop();
        server.server.closeAllConnections();
        await server.close();
      },
    };
  } catch (error) {
    await engine.stop();
    throw error;
  }
}
