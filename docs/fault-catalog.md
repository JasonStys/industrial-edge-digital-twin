# Fault catalog

Faults are synthetic, independently switchable, visible in telemetry, and covered by tests.

| Fault                       | Injection point           | Observable effect                                                              | Controller response                       |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| `freeze_level_sensor`       | Sensor adapter            | Value and source timestamp stop advancing; quality becomes `stale` after 1.5 s | Faulted, requested outputs 0%             |
| `level_sensor_out_of_range` | Sensor adapter            | Level reads 1,100 L with `out_of_range` quality                                | Faulted immediately                       |
| `pump_stuck_on`             | Physical actuator adapter | Actual pump is 100% regardless of request                                      | Requested/actual mismatch remains visible |
| `heater_stuck_on`           | Physical actuator adapter | Actual heater is 100% regardless of request                                    | Requested/actual mismatch remains visible |

## Campaign procedure

1. Start in stopped mode and clear all faults.
2. Capture the sequence number and current signal timestamps.
3. Inject exactly one fault with a unique command ID.
4. Observe value, quality, controller state, alarms, requested output, and actual output.
5. Clear the fault and verify quality recovery on a subsequent tick.

Fault application occurs below controller output calculation. This is why a stuck actuator can
violate a requested safe state: software must show that failure rather than claim the command took
effect.
