/**
 * @file main.ts
 * @brief Gateway composition root and bounded graceful-shutdown coordination.
 * @details Startup variables and function locations are generated in the symbol index.
 */

import { loadConfig } from "./config.js";
import { EngineClient } from "./engine-client.js";
import { MqttPublisher } from "./mqtt-publisher.js";
import { createServer } from "./server.js";

/** Start dependencies in order and stop them in reverse order on termination. */
async function main(): Promise<void> {
  const config = loadConfig();
  const engine = new EngineClient(config.enginePath, config.tickMs);
  const mqtt = new MqttPublisher(config.mqttUrl);
  mqtt.start();
  await engine.start();
  const server = await createServer(config, engine, mqtt);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await engine.stop();
    server.server.closeAllConnections();
    await server.close();
    await mqtt.stop();
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  await server.listen({ host: config.host, port: config.port });
  process.stdout.write(`Edge twin available at http://${config.host}:${config.port}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  process.stderr.write(`Gateway startup failed: ${message}\n`);
  process.exitCode = 1;
});
