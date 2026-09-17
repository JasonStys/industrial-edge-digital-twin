/**
 * @file engine-client.ts
 * @brief Supervised, bounded bridge between Node.js and the C++ line protocol.
 * @details Public methods, callbacks, and state variables are indexed in generated docs.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

import {
  ProtocolEnvelopeSchema,
  type CommandResult,
  type ProtocolCommand,
  type Snapshot,
} from "./contracts.js";

interface PendingCommand {
  readonly reject: (error: Error) => void;
  readonly resolve: (value: CommandResult) => void;
  readonly timeout: NodeJS.Timeout;
}

export interface EngineDiagnostics {
  readonly droppedTicks: number;
  readonly running: boolean;
  readonly stderrTail: string;
}

export interface EnginePort {
  diagnostics(): EngineDiagnostics;
  latest(): Snapshot | undefined;
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void;
  sendCommand(command: ProtocolCommand): Promise<CommandResult>;
}

/** Owns one child process and never permits an unbounded tick or command queue. */
export class EngineClient implements EnginePort {
  readonly #enginePath: string;
  readonly #tickMs: number;
  readonly #maximumPendingCommands: number;
  readonly #listeners = new Set<(snapshot: Snapshot) => void>();
  readonly #pending = new Map<string, PendingCommand>();
  #child: ChildProcessWithoutNullStreams | undefined;
  #latest: Snapshot | undefined;
  #tickTimer: NodeJS.Timeout | undefined;
  #tickInFlight = false;
  #droppedTicks = 0;
  #stderrTail = "";
  #startupError: Error | undefined;

  constructor(enginePath: string, tickMs: number, maximumPendingCommands = 64) {
    this.#enginePath = enginePath;
    this.#tickMs = tickMs;
    this.#maximumPendingCommands = maximumPendingCommands;
  }

  /** Start the child, validate its first snapshot, then begin fixed-rate requests. */
  async start(): Promise<void> {
    if (this.#child !== undefined) throw new Error("engine client is already started");
    const child = spawn(this.#enginePath, ["--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;
    child.once("error", (error) => {
      this.#startupError = error;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.#stderrTail = (this.#stderrTail + chunk).slice(-4096);
    });
    child.on("exit", () => this.#handleExit());

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.#handleLine(line));
    await this.#waitForInitialSnapshot();

    this.#tickTimer = setInterval(() => this.#requestTick(), this.#tickMs);
    this.#tickTimer.unref();
  }

  /** Gracefully stop the simulation, then force termination after a short bound. */
  async stop(): Promise<void> {
    if (this.#tickTimer !== undefined) clearInterval(this.#tickTimer);
    this.#tickTimer = undefined;
    const child = this.#child;
    if (child === undefined) return;
    child.stdin.write("QUIT\n");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      delay(1_000).then(() => {
        child.kill();
      }),
    ]);
    this.#child = undefined;
  }

  latest(): Snapshot | undefined {
    return this.#latest;
  }

  diagnostics(): EngineDiagnostics {
    return {
      droppedTicks: this.#droppedTicks,
      running: this.#child !== undefined && this.#child.exitCode === null,
      stderrTail: this.#stderrTail,
    };
  }

  onSnapshot(listener: (snapshot: Snapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Send one already-validated command and resolve only its matching response. */
  sendCommand(command: ProtocolCommand): Promise<CommandResult> {
    const child = this.#child;
    if (child === undefined || child.exitCode !== null) {
      return Promise.reject(new Error("engine is not running"));
    }
    if (this.#pending.size >= this.#maximumPendingCommands) {
      return Promise.reject(new Error("command queue is full"));
    }
    if (this.#pending.has(command.commandId)) {
      return Promise.reject(new Error("command is already awaiting a response"));
    }
    const line = ["COMMAND", command.commandId, command.operation, ...command.arguments].join(" ");
    return new Promise<CommandResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(command.commandId);
        reject(new Error("engine command timed out"));
      }, 2_000);
      this.#pending.set(command.commandId, { reject, resolve, timeout });
      child.stdin.write(`${line}\n`);
    });
  }

  #requestTick(): void {
    const child = this.#child;
    if (child === undefined || child.exitCode !== null || this.#tickInFlight) {
      ++this.#droppedTicks;
      return;
    }
    this.#tickInFlight = true;
    child.stdin.write("TICK 1\n");
  }

  #handleLine(line: string): void {
    if (line.length > 65_536) {
      this.#stderrTail = "engine emitted an oversized line";
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      this.#stderrTail = "engine emitted invalid JSON";
      return;
    }
    const parsed = ProtocolEnvelopeSchema.safeParse(decoded);
    if (!parsed.success) {
      this.#stderrTail = "engine emitted data that failed schema validation";
      return;
    }
    const envelope = parsed.data;
    if (envelope.type === "protocol_error") {
      this.#stderrTail = `${envelope.code}: ${envelope.message}`;
      return;
    }
    this.#latest = envelope.snapshot;
    if (envelope.type === "telemetry") this.#tickInFlight = false;
    for (const listener of this.#listeners) listener(envelope.snapshot);

    if (envelope.type === "command_result") {
      const pending = this.#pending.get(envelope.result.command_id);
      if (pending !== undefined) {
        clearTimeout(pending.timeout);
        this.#pending.delete(envelope.result.command_id);
        pending.resolve(envelope.result);
      }
    }
  }

  #handleExit(): void {
    if (this.#tickTimer !== undefined) clearInterval(this.#tickTimer);
    this.#tickTimer = undefined;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("engine exited before responding"));
    }
    this.#pending.clear();
  }

  async #waitForInitialSnapshot(): Promise<void> {
    const deadline = Date.now() + 3_000;
    while (
      this.#latest === undefined &&
      this.#startupError === undefined &&
      Date.now() < deadline
    ) {
      await delay(10);
    }
    if (this.#startupError !== undefined) {
      this.#child = undefined;
      throw new Error(`engine failed to start: ${this.#startupError.message}`);
    }
    if (this.#latest === undefined) {
      await this.stop();
      throw new Error("engine did not emit an initial snapshot");
    }
  }
}
