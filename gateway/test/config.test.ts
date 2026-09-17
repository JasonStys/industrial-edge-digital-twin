/**
 * @file config.test.ts
 * @brief Secure-default and environment-boundary tests for gateway configuration.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const required = {
  TWIN_COMMAND_TOKEN: "test-token-12345",
  TWIN_ENGINE_PATH: "/tmp/twin-engine",
};

describe("loadConfig", () => {
  it("uses loopback, bounded ticks, and optional MQTT by default", () => {
    const config = loadConfig(required);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8080);
    expect(config.tickMs).toBe(100);
    expect(config.mqttUrl).toBeUndefined();
  });

  it("discovers the platform engine and permits a documented development token", () => {
    const config = loadConfig({});
    expect(config.enginePath).toMatch(/build[\\/]twin-engine(?:\.exe)?$/);
    expect(config.commandToken).toBe("local-demo-token");
  });

  it("parses explicit valid settings", () => {
    const config = loadConfig({
      ...required,
      PORT: "9090",
      TWIN_TICK_MS: "250",
      MQTT_URL: "mqtts://broker.example.test:8883",
    });
    expect(config.port).toBe(9090);
    expect(config.tickMs).toBe(250);
    expect(config.mqttUrl).toBe("mqtts://broker.example.test:8883");
  });

  it("requires a token in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", TWIN_ENGINE_PATH: "/tmp/engine" })).toThrow(
      /TWIN_COMMAND_TOKEN/,
    );
  });

  it.each([
    [{ ...required, PORT: "1" }, /PORT/],
    [{ ...required, TWIN_TICK_MS: "not-a-number" }, /TWIN_TICK_MS/],
    [{ ...required, MQTT_URL: "https://broker.example.test" }, /MQTT_URL/],
    [{ ...required, TWIN_COMMAND_TOKEN: "short" }, /TWIN_COMMAND_TOKEN/],
  ])("rejects invalid environment %o", (environment, expected) => {
    expect(() => loadConfig(environment)).toThrow(expected);
  });
});
