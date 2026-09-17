/**
 * @file mqtt-publisher.test.ts
 * @brief Disabled-mode behavior tests for optional MQTT integration.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import { describe, expect, it } from "vitest";

import type { IClientPublishOptions } from "mqtt";

import { MqttPublisher, type MqttConnector, type MqttPort } from "../src/mqtt-publisher.js";
import { snapshotFixture } from "./fixtures.js";

describe("MqttPublisher", () => {
  it("is a no-op with observable disabled status when no broker is configured", async () => {
    const publisher = new MqttPublisher(undefined);
    publisher.start();
    publisher.enqueue(snapshotFixture);
    expect(publisher.status()).toEqual({ connected: false, enabled: false, replacedMessages: 0 });
    await expect(publisher.stop()).resolves.toBeUndefined();
  });

  it("publishes retained QoS 1 state and coalesces pending updates", async () => {
    const publications: Array<{ topic: string; message: string; options: IClientPublishOptions }> =
      [];
    const callbacks: Array<(error?: Error) => void> = [];
    const fake: MqttPort = {
      connected: true,
      end(_force, _options, callback) {
        callback();
      },
      on() {},
      publish(topic, message, options, callback) {
        publications.push({ topic, message, options });
        callbacks.push(callback);
      },
    };
    const connector: MqttConnector = () => fake;
    const publisher = new MqttPublisher("mqtt://broker.example.test", connector);
    publisher.start();
    publisher.start();
    publisher.enqueue(snapshotFixture);
    publisher.enqueue({ ...snapshotFixture, sequence: 8 });
    publisher.enqueue({ ...snapshotFixture, sequence: 9 });

    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      topic: "edge-twin/tank-01/state",
      options: { qos: 1, retain: true },
    });
    expect(publisher.status()).toEqual({ connected: true, enabled: true, replacedMessages: 1 });
    callbacks.shift()?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(publications).toHaveLength(2);
    expect(JSON.parse(publications[1]?.message ?? "{}")).toMatchObject({ sequence: 9 });
    callbacks.shift()?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await publisher.stop();
    expect(publisher.status().connected).toBe(false);
  });

  it("bounds publish failures and accepts newer telemetry afterward", async () => {
    let attempts = 0;
    const fake: MqttPort = {
      connected: false,
      end(_force, _options, callback) {
        callback();
      },
      on(_event, listener) {
        listener(new Error("synthetic connection error"));
      },
      publish(_topic, _message, _options, callback) {
        ++attempts;
        callback(new Error("synthetic publish failure"));
      },
    };
    const publisher = new MqttPublisher("mqtt://broker.example.test", () => fake);
    publisher.start();
    publisher.enqueue(snapshotFixture);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    publisher.enqueue({ ...snapshotFixture, sequence: 8 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(attempts).toBe(2);
    await publisher.stop();
  });

  it("surfaces broker shutdown errors to the lifecycle owner", async () => {
    const fake: MqttPort = {
      connected: true,
      end(_force, _options, callback) {
        callback(new Error("synthetic shutdown failure"));
      },
      on() {},
      publish() {},
    };
    const publisher = new MqttPublisher("mqtt://broker.example.test", () => fake);
    publisher.start();
    await expect(publisher.stop()).rejects.toThrow(/shutdown failure/);
  });
});
