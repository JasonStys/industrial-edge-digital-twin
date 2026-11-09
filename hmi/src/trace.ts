/**
 * @file trace.ts
 * @brief Bounded simulated-telemetry recording, portable trace validation and time-aligned trends.
 * @details Jason Stys; immutable copies contain no command tokens. Symbols/variables: docs/generated/symbol-index.md.
 */

import { z } from "zod";
import { SnapshotSchema, type Snapshot } from "../../gateway/src/contracts.js";

export const TRACE_CAPACITY = 1200;
export const TRACE_BYTES = 2 * 1024 * 1024;
const TraceSchema = z.strictObject({
  traceVersion: z.literal(1),
  scope: z.literal("simulated-heated-tank"),
  capacity: z.literal(TRACE_CAPACITY),
  dropped: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  snapshots: z.array(SnapshotSchema).min(1).max(TRACE_CAPACITY),
});
export type TraceRecording = z.infer<typeof TraceSchema>;
export type TrendSignal = "plant_level" | "sensor_level" | "temperature" | "pump";

/** Keep the latest 1,200 distinct validated samples in O(1) insertion space/time per fixed-size snapshot. */
export class TraceRecorder {
  #samples: Snapshot[] = [];
  #next = 0;
  #dropped = 0;
  #previous = "";
  #active = false;

  /** Expose capture status without allowing callers to change the recorder lifecycle. */
  get active(): boolean {
    return this.#active;
  }

  /** Begin an explicitly new recording, clearing the previous bounded in-memory capture. */
  start(): void {
    this.#samples = [];
    this.#next = 0;
    this.#dropped = 0;
    this.#previous = "";
    this.#active = true;
  }

  /** Freeze capture; telemetry can continue independently in the live view. */
  stop(): void {
    this.#active = false;
  }

  /** Ignore duplicate envelopes, copy each accepted sample and count exact capacity evictions. */
  append(snapshot: Snapshot): void {
    if (!this.active) return;
    const encoded = JSON.stringify(snapshot);
    if (encoded === this.#previous) return;
    this.#previous = encoded;
    const copy = structuredClone(snapshot);
    if (this.#samples.length < TRACE_CAPACITY) this.#samples.push(copy);
    else {
      this.#samples[this.#next] = copy;
      this.#next = (this.#next + 1) % TRACE_CAPACITY;
      this.#dropped += 1;
    }
  }

  /** Report retained sample count without allocating a copy of the capture. */
  get count(): number {
    return this.#samples.length;
  }

  /** Export chronological immutable copies; an empty recording has no evidence to export. */
  snapshot(): TraceRecording {
    if (this.count === 0) throw new Error("No telemetry has been recorded yet.");
    const samples = [...this.#samples.slice(this.#next), ...this.#samples.slice(0, this.#next)];
    return {
      traceVersion: 1,
      scope: "simulated-heated-tank",
      capacity: TRACE_CAPACITY,
      dropped: this.#dropped,
      snapshots: structuredClone(samples),
    };
  }
}

/** Parse bounded strict trace JSON; unknown fields or malformed/non-finite samples fail closed. */
export function parseTrace(content: string): TraceRecording {
  if (new TextEncoder().encode(content).byteLength > TRACE_BYTES)
    throw new Error("Trace exceeds the 2 MiB import limit.");
  return TraceSchema.parse(JSON.parse(content) as unknown);
}

/** Export compact validated JSON within the same byte budget that import accepts. */
export function serializeTrace(recording: TraceRecording): string {
  const content = JSON.stringify(TraceSchema.parse(recording)) + "\n";
  if (new TextEncoder().encode(content).byteLength > TRACE_BYTES)
    throw new Error("Trace exceeds the 2 MiB export limit.");
  return content;
}

/** Describe observable mode/fault/alarm/quality transitions without inferring fault causes. */
export function sampleMarkers(previous: Snapshot | undefined, current: Snapshot): string[] {
  if (previous === undefined) return ["First retained sample"];
  const markers: string[] = [];
  if (
    current.sequence <= previous.sequence ||
    current.simulation_time_s < previous.simulation_time_s
  )
    markers.push("Stream discontinuity; sequence/time reset or same-position update");
  if (current.sequence > previous.sequence + 1)
    markers.push("Sequence gap; intervening states not retained");
  if (previous.mode !== current.mode) markers.push(`Mode ${previous.mode} → ${current.mode}`);
  for (const field of Object.keys(current.faults) as (keyof Snapshot["faults"])[])
    if (previous.faults[field] !== current.faults[field])
      markers.push(`Fault ${field}: ${current.faults[field] ? "on" : "off"}`);
  for (const field of Object.keys(current.alarms) as (keyof Snapshot["alarms"])[])
    if (previous.alarms[field] !== current.alarms[field])
      markers.push(`Alarm ${field}: ${current.alarms[field] ? "on" : "off"}`);
  for (const field of ["level", "temperature"] as const)
    if (previous.signals[field].quality !== current.signals[field].quality)
      markers.push(
        `Quality ${field}: ${previous.signals[field].quality} → ${current.signals[field].quality}`,
      );
  return markers;
}

/** Select the latest increasing-time segment so a reset never draws a false connecting line. */
export function currentSegment(samples: readonly Snapshot[]): readonly Snapshot[] {
  let start = 0;
  for (let index = 1; index < samples.length; index += 1)
    if (samples[index]!.simulation_time_s <= samples[index - 1]!.simulation_time_s) start = index;
  return samples.slice(start);
}

/** Plot the latest contiguous simulation-time segment, retaining real time spacing and declared units. */
export function trendPoints(samples: readonly Snapshot[], signal: TrendSignal): string {
  const segment = currentSegment(samples);
  const first = segment[0]?.simulation_time_s ?? 0;
  const duration = (segment.at(-1)?.simulation_time_s ?? first) - first;
  return segment
    .map((sample) => {
      const value =
        signal === "plant_level"
          ? sample.plant.level_l
          : signal === "sensor_level"
            ? sample.signals.level.value
            : signal === "temperature"
              ? sample.signals.temperature.value
              : sample.actual.pump_pct;
      const minimum = signal === "temperature" ? -10 : 0;
      const maximum = signal === "temperature" ? 120 : signal === "pump" ? 100 : 1000;
      const x = duration === 0 ? 0 : ((sample.simulation_time_s - first) / duration) * 100;
      const y = 100 - Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
