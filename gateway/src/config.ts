/**
 * @file config.ts
 * @brief Environment parsing, secure defaults, and portable artifact discovery.
 * @details Configuration variables and exact function lines are listed in generated docs.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface GatewayConfig {
  readonly commandToken: string;
  readonly enginePath: string;
  readonly host: string;
  readonly mqttUrl?: string;
  readonly port: number;
  readonly staticRoot: string;
  readonly tickMs: number;
}

/** Resolve the first built engine artifact for the current platform. */
function discoverEnginePath(repositoryRoot: string): string {
  const executable = process.platform === "win32" ? "twin-engine.exe" : "twin-engine";
  const candidates = [
    path.join(repositoryRoot, "build", executable),
    path.join(repositoryRoot, "build", "Release", executable),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (match === undefined) {
    throw new Error("twin-engine was not found; build the C++ target or set TWIN_ENGINE_PATH");
  }
  return match;
}

/** Parse a bounded integer environment value. */
function integerSetting(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

/** Load and validate the complete gateway configuration. */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const host = environment.TWIN_HOST ?? "127.0.0.1";
  const production = environment.NODE_ENV === "production";
  const providedToken = environment.TWIN_COMMAND_TOKEN;
  if (production && providedToken === undefined) {
    throw new Error("TWIN_COMMAND_TOKEN is required when NODE_ENV=production");
  }
  const commandToken = providedToken ?? "local-demo-token";
  if (commandToken.length < 12 || commandToken.length > 256) {
    throw new Error("TWIN_COMMAND_TOKEN must contain 12-256 characters");
  }

  const mqttUrl = environment.MQTT_URL;
  if (mqttUrl !== undefined) {
    const parsed = new URL(mqttUrl);
    if (parsed.protocol !== "mqtt:" && parsed.protocol !== "mqtts:") {
      throw new Error("MQTT_URL must use mqtt:// or mqtts://");
    }
  }

  return {
    commandToken,
    enginePath: environment.TWIN_ENGINE_PATH ?? discoverEnginePath(repositoryRoot),
    host,
    ...(mqttUrl === undefined ? {} : { mqttUrl }),
    port: integerSetting("PORT", environment.PORT, 8080, 1024, 65_535),
    staticRoot: environment.TWIN_STATIC_ROOT ?? path.join(repositoryRoot, "hmi", "dist"),
    tickMs: integerSetting("TWIN_TICK_MS", environment.TWIN_TICK_MS, 100, 20, 5_000),
  };
}
