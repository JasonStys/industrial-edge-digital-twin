/**
 * @file server.ts
 * @brief Authenticated command API, read-only telemetry API, SSE fan-out, and static HMI host.
 * @details Route handlers and shared state locations are generated in the symbol index.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { ServerResponse } from "node:http";

import fastifyStatic from "@fastify/static";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { ApiCommandSchema, toProtocolCommand, type Snapshot } from "./contracts.js";
import type { EnginePort } from "./engine-client.js";
import type { GatewayConfig } from "./config.js";
import type { MqttStatus } from "./mqtt-publisher.js";

export interface TelemetryPublisher {
  enqueue(snapshot: Snapshot): void;
  status(): MqttStatus;
}

const maximumSseClients = 32;

/** Compare bearer tokens through fixed-length hashes to avoid content-dependent timing. */
export function tokenMatches(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

/** Return a consistent RFC 9457-style error payload. */
function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", status, title, detail };
}

/** Authenticate only state-changing requests; telemetry stays intentionally read-only. */
function requireCommandToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string,
): boolean {
  const authorization = request.headers.authorization;
  const prefix = "Bearer ";
  if (
    authorization === undefined ||
    !authorization.startsWith(prefix) ||
    !tokenMatches(authorization.slice(prefix.length), expectedToken)
  ) {
    void reply
      .header("WWW-Authenticate", 'Bearer realm="edge-twin-command"')
      .code(401)
      .send(problem(401, "Unauthorized", "A valid command bearer token is required."));
    return false;
  }
  return true;
}

/** Build the server with injectable engine and publisher ports for deterministic tests. */
export async function createServer(
  config: GatewayConfig,
  engine: EnginePort,
  publisher: TelemetryPublisher,
  serveStatic = true,
): Promise<FastifyInstance> {
  const server = Fastify({
    bodyLimit: 16_384,
    logController: new LogController({ disableRequestLogging: true }),
    logger: false,
    trustProxy: false,
  });
  const clients = new Set<ServerResponse>();

  server.addHook("onSend", async (_request, reply) => {
    void reply
      .header(
        "Content-Security-Policy",
        "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      )
      .header("Cross-Origin-Opener-Policy", "same-origin")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY");
  });

  server.get("/api/v1/health", async (_request, reply) => {
    const diagnostics = engine.diagnostics();
    const status = diagnostics.running ? "ok" : "degraded";
    return reply.code(diagnostics.running ? 200 : 503).send({
      status,
      engine: { running: diagnostics.running, droppedTicks: diagnostics.droppedTicks },
      mqtt: publisher.status(),
    });
  });

  server.get("/api/v1/state", async (_request, reply) => {
    const snapshot = engine.latest();
    if (snapshot === undefined) {
      return reply
        .code(503)
        .send(problem(503, "Unavailable", "No validated telemetry is available."));
    }
    return { snapshot };
  });

  server.get("/api/v1/events", async (_request, reply) => {
    if (clients.size >= maximumSseClients) {
      return reply
        .code(503)
        .send(problem(503, "Capacity reached", "The telemetry stream is full."));
    }
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    clients.add(response);
    const current = engine.latest();
    if (current !== undefined)
      response.write(`event: telemetry\ndata: ${JSON.stringify(current)}\n\n`);
    response.on("close", () => clients.delete(response));
  });

  server.post("/api/v1/commands", async (request, reply) => {
    if (!requireCommandToken(request, reply, config.commandToken)) return reply;
    const parsed = ApiCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(
          problem(400, "Invalid command", parsed.error.issues[0]?.message ?? "Malformed body."),
        );
    }
    try {
      const result = await engine.sendCommand(toProtocolCommand(parsed.data));
      return reply.code(result.accepted ? 200 : 409).send({ result, snapshot: engine.latest() });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Engine command failed.";
      return reply.code(503).send(problem(503, "Engine unavailable", detail));
    }
  });

  const unsubscribe = engine.onSnapshot((snapshot) => {
    publisher.enqueue(snapshot);
    const event = `event: telemetry\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const client of clients) {
      if (!client.write(event)) {
        client.end();
        clients.delete(client);
      }
    }
  });

  server.addHook("onClose", () => {
    unsubscribe();
    for (const client of clients) client.end();
    clients.clear();
  });

  if (serveStatic) {
    await server.register(fastifyStatic, {
      root: config.staticRoot,
      prefix: "/",
      redirect: false,
      wildcard: true,
    });
  }
  return server;
}
