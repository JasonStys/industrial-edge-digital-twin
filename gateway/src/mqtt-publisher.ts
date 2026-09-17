/**
 * @file mqtt-publisher.ts
 * @brief Optional MQTT v5 publisher with latest-value coalescing and bounded work.
 * @details State variables and method locations are indexed in generated docs.
 */

import { connect, type IClientOptions, type IClientPublishOptions } from "mqtt";

import type { Snapshot } from "./contracts.js";

export interface MqttStatus {
  readonly connected: boolean;
  readonly enabled: boolean;
  readonly replacedMessages: number;
}

export interface MqttPort {
  readonly connected: boolean;
  end(force: boolean, options: object, callback: (error?: Error) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  publish(
    topic: string,
    message: string,
    options: IClientPublishOptions,
    callback: (error?: Error) => void,
  ): void;
}

export type MqttConnector = (url: string, options: IClientOptions) => MqttPort;

/** Publishes retained current state without accumulating an offline memory queue. */
export class MqttPublisher {
  readonly #url: string | undefined;
  readonly #connector: MqttConnector;
  #client: MqttPort | undefined;
  #pending: Snapshot | undefined;
  #publishing = false;
  #replacedMessages = 0;

  constructor(url: string | undefined, connector: MqttConnector = connect) {
    this.#url = url;
    this.#connector = connector;
  }

  /** Connect with MQTT v5 and disable the library's QoS-zero offline queue. */
  start(): void {
    if (this.#url === undefined || this.#client !== undefined) return;
    this.#client = this.#connector(this.#url, {
      clean: true,
      connectTimeout: 5_000,
      protocolVersion: 5,
      queueQoSZero: false,
      reconnectPeriod: 1_000,
    });
    this.#client.on("error", () => undefined);
  }

  /** Retain only the newest pending state while a QoS 1 publish is in flight. */
  enqueue(snapshot: Snapshot): void {
    if (this.#client === undefined) return;
    if (this.#pending !== undefined) ++this.#replacedMessages;
    this.#pending = snapshot;
    if (!this.#publishing) void this.#drain();
  }

  status(): MqttStatus {
    return {
      connected: this.#client?.connected ?? false,
      enabled: this.#url !== undefined,
      replacedMessages: this.#replacedMessages,
    };
  }

  /** End the connection without publishing a fabricated final state. */
  async stop(): Promise<void> {
    const client = this.#client;
    this.#client = undefined;
    if (client === undefined) return;
    await new Promise<void>((resolve, reject) =>
      client.end(false, {}, (error) => (error === undefined ? resolve() : reject(error))),
    );
  }

  async #drain(): Promise<void> {
    const client = this.#client;
    if (client === undefined || this.#publishing) return;
    this.#publishing = true;
    try {
      while (this.#pending !== undefined && this.#client === client) {
        const snapshot = this.#pending;
        this.#pending = undefined;
        await new Promise<void>((resolve, reject) => {
          client.publish(
            "edge-twin/tank-01/state",
            JSON.stringify(snapshot),
            { qos: 1, retain: true },
            (error) => (error === undefined ? resolve() : reject(error)),
          );
        });
      }
    } catch {
      // Connection events expose availability; the next snapshot replaces stale pending work.
    } finally {
      this.#publishing = false;
    }
  }
}
