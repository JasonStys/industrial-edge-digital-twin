/**
 * @file fixtures.ts
 * @brief Typed test doubles and telemetry fixtures for gateway tests.
 * @details Exported symbol locations are generated in docs/generated/symbol-index.md.
 */

import type { CommandResult, ProtocolCommand, Snapshot } from "../src/contracts.js";
import type { EngineDiagnostics, EnginePort } from "../src/engine-client.js";

export const snapshotFixture: Snapshot = {
  sequence: 7,
  simulation_time_s: 1.2,
  mode: "automatic",
  controller_state: "running",
  plant: { level_l: 510, temperature_c: 22.5 },
  signals: {
    level: { value: 510, source_time_s: 1.2, quality: "good" },
    temperature: { value: 22.5, source_time_s: 1.2, quality: "good" },
  },
  requested: { pump_pct: 20, outlet_valve_pct: 0, heater_pct: 100 },
  actual: { pump_pct: 20, outlet_valve_pct: 0, heater_pct: 100 },
  targets: { level_l: 600, temperature_c: 45 },
  faults: {
    freeze_level_sensor: false,
    level_sensor_out_of_range: false,
    pump_stuck_on: false,
    heater_stuck_on: false,
  },
  alarms: {
    low_level: false,
    high_level: false,
    sensor_fault: false,
    heater_interlock: false,
    safe_state_active: false,
  },
};

/** In-memory engine port that records commands and permits deterministic telemetry emission. */
export class FakeEngine implements EnginePort {
  readonly commands: ProtocolCommand[] = [];
  readonly #listeners = new Set<(snapshot: Snapshot) => void>();
  snapshot: Snapshot | undefined = snapshotFixture;
  running = true;
  nextError: unknown;
  nextResult: CommandResult | undefined;

  diagnostics(): EngineDiagnostics {
    return { droppedTicks: 2, running: this.running, stderrTail: "" };
  }

  latest(): Snapshot | undefined {
    return this.snapshot;
  }

  onSnapshot(listener: (snapshot: Snapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  sendCommand(command: ProtocolCommand): Promise<CommandResult> {
    this.commands.push(command);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Tests the server's unknown rejection boundary.
    if (this.nextError !== undefined) return Promise.reject(this.nextError);
    if (this.nextResult !== undefined) return Promise.resolve(this.nextResult);
    return Promise.resolve({
      accepted: true,
      duplicate: false,
      command_id: command.commandId,
      code: "accepted",
      message: "test accepted",
    });
  }

  emit(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }
}
