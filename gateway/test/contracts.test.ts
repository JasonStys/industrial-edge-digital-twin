/**
 * @file contracts.test.ts
 * @brief Schema boundary and public-to-engine command mapping tests.
 * @details Test line locations are generated in docs/generated/symbol-index.md.
 */

import { describe, expect, it } from "vitest";

import {
  ApiCommandSchema,
  ProtocolEnvelopeSchema,
  SnapshotSchema,
  toProtocolCommand,
} from "../src/contracts.js";
import { snapshotFixture } from "./fixtures.js";

describe("telemetry contracts", () => {
  it("accepts a complete bounded snapshot", () => {
    expect(SnapshotSchema.parse(snapshotFixture)).toEqual(snapshotFixture);
    expect(
      ProtocolEnvelopeSchema.parse({ type: "telemetry", snapshot: snapshotFixture }),
    ).toBeTruthy();
  });

  it("rejects impossible plant values and unknown properties", () => {
    expect(
      SnapshotSchema.safeParse({ ...snapshotFixture, plant: { level_l: 1001, temperature_c: 20 } })
        .success,
    ).toBe(false);
    expect(SnapshotSchema.safeParse({ ...snapshotFixture, unexpected: true }).success).toBe(false);
  });
});

describe("command contracts", () => {
  it.each([
    [
      { commandId: "mode_1", type: "setMode", mode: "automatic" } as const,
      { commandId: "mode_1", operation: "set-mode", arguments: ["automatic"] },
    ],
    [
      { commandId: "target_1", type: "setTarget", field: "level_l", value: 650 } as const,
      { commandId: "target_1", operation: "set-target", arguments: ["level_l", "650"] },
    ],
    [
      { commandId: "output_1", type: "setOutput", field: "heater_pct", value: 25 } as const,
      { commandId: "output_1", operation: "set-output", arguments: ["heater_pct", "25"] },
    ],
    [
      {
        commandId: "fault_1",
        type: "injectFault",
        fault: "freeze_level_sensor",
        enabled: true,
      } as const,
      {
        commandId: "fault_1",
        operation: "inject-fault",
        arguments: ["freeze_level_sensor", "on"],
      },
    ],
    [
      { commandId: "clear_1", type: "clearFaults" } as const,
      { commandId: "clear_1", operation: "clear-faults", arguments: [] },
    ],
  ])("maps %o to the bounded line protocol", (input, expected) => {
    const parsed = ApiCommandSchema.parse(input);
    expect(toProtocolCommand(parsed)).toEqual(expected);
  });

  it("rejects unsafe identifiers, out-of-range outputs, and extra fields", () => {
    expect(
      ApiCommandSchema.safeParse({ commandId: "bad id", type: "setMode", mode: "automatic" })
        .success,
    ).toBe(false);
    expect(
      ApiCommandSchema.safeParse({
        commandId: "output_2",
        type: "setOutput",
        field: "pump_pct",
        value: 101,
      }).success,
    ).toBe(false);
    expect(
      ApiCommandSchema.safeParse({
        commandId: "mode_2",
        type: "setMode",
        mode: "automatic",
        admin: true,
      }).success,
    ).toBe(false);
  });
});
