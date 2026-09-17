/**
 * @file contracts.ts
 * @brief Runtime-validated wire contracts shared across process and HTTP boundaries.
 * @details Schemas reject unknown or malformed data; exact symbol lines are generated in docs.
 */

import { z } from "zod";

const finiteNumber = z.number().finite();
const percentage = finiteNumber.min(0).max(100);

export const SignalSchema = z.strictObject({
  value: finiteNumber,
  source_time_s: finiteNumber.nonnegative(),
  quality: z.enum(["good", "stale", "bad", "out_of_range"]),
});

export const ActuatorSchema = z.strictObject({
  pump_pct: percentage,
  outlet_valve_pct: percentage,
  heater_pct: percentage,
});

export const SnapshotSchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  simulation_time_s: finiteNumber.nonnegative(),
  mode: z.enum(["stopped", "manual", "automatic"]),
  controller_state: z.enum(["idle", "starting", "running", "faulted", "safe_shutdown"]),
  plant: z.strictObject({
    level_l: finiteNumber.min(0).max(1000),
    temperature_c: finiteNumber.min(-10).max(120),
  }),
  signals: z.strictObject({
    level: SignalSchema,
    temperature: SignalSchema,
  }),
  requested: ActuatorSchema,
  actual: ActuatorSchema,
  targets: z.strictObject({
    level_l: finiteNumber.min(50).max(950),
    temperature_c: finiteNumber.min(5).max(95),
  }),
  faults: z.strictObject({
    freeze_level_sensor: z.boolean(),
    level_sensor_out_of_range: z.boolean(),
    pump_stuck_on: z.boolean(),
    heater_stuck_on: z.boolean(),
  }),
  alarms: z.strictObject({
    low_level: z.boolean(),
    high_level: z.boolean(),
    sensor_fault: z.boolean(),
    heater_interlock: z.boolean(),
    safe_state_active: z.boolean(),
  }),
});

const CommandResultSchema = z.strictObject({
  accepted: z.boolean(),
  duplicate: z.boolean(),
  command_id: z.string(),
  code: z.string(),
  message: z.string(),
});

export const ProtocolEnvelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("telemetry"), snapshot: SnapshotSchema }),
  z.strictObject({
    type: z.literal("command_result"),
    result: CommandResultSchema,
    snapshot: SnapshotSchema,
  }),
  z.strictObject({
    type: z.literal("protocol_error"),
    code: z.string(),
    message: z.string(),
  }),
]);

const commandId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const ApiCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    commandId,
    type: z.literal("setMode"),
    mode: z.enum(["stopped", "manual", "automatic"]),
  }),
  z.strictObject({
    commandId,
    type: z.literal("setTarget"),
    field: z.enum(["level_l", "temperature_c"]),
    value: finiteNumber,
  }),
  z.strictObject({
    commandId,
    type: z.literal("setOutput"),
    field: z.enum(["pump_pct", "outlet_valve_pct", "heater_pct"]),
    value: percentage,
  }),
  z.strictObject({
    commandId,
    type: z.literal("injectFault"),
    fault: z.enum([
      "freeze_level_sensor",
      "level_sensor_out_of_range",
      "pump_stuck_on",
      "heater_stuck_on",
    ]),
    enabled: z.boolean(),
  }),
  z.strictObject({ commandId, type: z.literal("clearFaults") }),
]);

export type Snapshot = z.infer<typeof SnapshotSchema>;
export type ProtocolEnvelope = z.infer<typeof ProtocolEnvelopeSchema>;
export type ApiCommand = z.infer<typeof ApiCommandSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;

export interface ProtocolCommand {
  readonly commandId: string;
  readonly operation: string;
  readonly arguments: readonly string[];
}

/** Convert the public discriminated union into the narrow engine line protocol. */
export function toProtocolCommand(command: ApiCommand): ProtocolCommand {
  switch (command.type) {
    case "setMode":
      return { commandId: command.commandId, operation: "set-mode", arguments: [command.mode] };
    case "setTarget":
      return {
        commandId: command.commandId,
        operation: "set-target",
        arguments: [command.field, String(command.value)],
      };
    case "setOutput":
      return {
        commandId: command.commandId,
        operation: "set-output",
        arguments: [command.field, String(command.value)],
      };
    case "injectFault":
      return {
        commandId: command.commandId,
        operation: "inject-fault",
        arguments: [command.fault, command.enabled ? "on" : "off"],
      };
    case "clearFaults":
      return { commandId: command.commandId, operation: "clear-faults", arguments: [] };
  }
}
