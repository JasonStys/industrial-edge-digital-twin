/**
 * @file trace.test.ts
 * @brief Independent bounded capture, trace validation, time-axis and transition regression oracles.
 * @details Synthetic snapshots by Jason Stys; symbols and fixture variables: docs/generated/symbol-index.md.
 */
import { describe, expect, it } from "vitest";
import { snapshotFixture } from "../../gateway/test/fixtures.js";
import type { Snapshot } from "../../gateway/src/contracts.js";
import {
  TRACE_BYTES,
  TRACE_CAPACITY,
  TraceRecorder,
  parseTrace,
  sampleMarkers,
  serializeTrace,
  trendPoints,
} from "../src/trace.js";

/** Create independently timed process values for capture and plotting assertions. */
function sample(sequence: number, time = sequence, level = 500): Snapshot {
  const snapshot = structuredClone(snapshotFixture);
  snapshot.sequence = sequence;
  snapshot.simulation_time_s = time;
  snapshot.plant.level_l = level;
  return snapshot;
}

describe("bounded recording", () => {
  it("copies source state, ignores duplicates/stopped input, restarts explicitly and never exports tokens", () => {
    const recorder = new TraceRecorder();
    recorder.append(sample(0));
    expect(recorder.count).toBe(0);
    expect(() => recorder.snapshot()).toThrow("No telemetry");
    recorder.start();
    const original = sample(0);
    recorder.append(original);
    recorder.append(original);
    original.plant.level_l = 900;
    expect(recorder.snapshot().snapshots[0]!.plant.level_l).toBe(500);
    recorder.append(original);
    expect(recorder.count).toBe(2);
    recorder.stop();
    expect(recorder.active).toBe(false);
    recorder.append(sample(2));
    expect(recorder.count).toBe(2);
    const exported = recorder.snapshot();
    exported.snapshots[0]!.plant.level_l = 1;
    expect(recorder.snapshot().snapshots[0]!.plant.level_l).toBe(500);
    expect(JSON.stringify(exported)).not.toMatch(/token|authorization/i);
    recorder.start();
    expect(recorder.active).toBe(true);
    expect(recorder.count).toBe(0);
  });

  it("retains exact chronological order and eviction count through multiple circular-buffer wraps", () => {
    const recorder = new TraceRecorder();
    recorder.start();
    for (let sequence = 0; sequence < 2405; sequence += 1) recorder.append(sample(sequence));
    recorder.stop();
    const exported = recorder.snapshot();
    expect(exported.dropped).toBe(1205);
    expect(exported.snapshots.map((point) => point.sequence)).toEqual(
      Array.from({ length: TRACE_CAPACITY }, (_, index) => index + 1205),
    );
    const json = JSON.stringify(exported, null, 2);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThan(TRACE_BYTES);
    expect(parseTrace(json)).toEqual(exported);
  });
});

it("rejects malformed/oversize/foreign trace data rather than silently accepting a different contract", () => {
  const recorder = new TraceRecorder();
  recorder.start();
  recorder.append(sample(1));
  const exported = recorder.snapshot();
  for (const input of [
    "{",
    "null",
    JSON.stringify({ ...exported, capacity: 9 }),
    JSON.stringify({ ...exported, scope: "physical-plant" }),
    JSON.stringify({ ...exported, snapshots: [] }),
    JSON.stringify({ ...exported, extra: "ignored" }),
    JSON.stringify({
      ...exported,
      snapshots: [{ ...sample(1), plant: { level_l: NaN, temperature_c: 20 } }],
    }),
    JSON.stringify({ ...exported, snapshots: Array(1201).fill(sample(1)) }),
  ])
    expect(() => parseTrace(input)).toThrow();
  expect(() => parseTrace(" ".repeat(TRACE_BYTES + 1))).toThrow("2 MiB");
  expect(() => serializeTrace({ ...exported, snapshots: [] })).toThrow();
});

it("full-capacity high-precision boundary values remain downloadable and reimportable", () => {
  const recorder = new TraceRecorder();
  recorder.start();
  const boundary = sample(0, Number.MAX_VALUE, 513.1234567890123);
  boundary.plant.temperature_c = 22.1234567890123;
  boundary.signals.level = {
    value: -Number.MAX_VALUE,
    source_time_s: Number.MAX_VALUE,
    quality: "out_of_range",
  };
  boundary.signals.temperature = {
    value: Number.MAX_VALUE,
    source_time_s: Number.MAX_VALUE,
    quality: "out_of_range",
  };
  boundary.targets = { level_l: 600.1234567890123, temperature_c: 45.1234567890123 };
  for (const field of ["pump_pct", "outlet_valve_pct", "heater_pct"] as const) {
    boundary.requested[field] = 99.12345678901234;
    boundary.actual[field] = 99.12345678901234;
  }
  for (let index = 0; index < TRACE_CAPACITY; index += 1)
    recorder.append({ ...boundary, sequence: index });
  const recording = recorder.snapshot();
  const content = serializeTrace(recording);
  expect(new TextEncoder().encode(content).byteLength).toBeLessThanOrEqual(TRACE_BYTES);
  expect(parseTrace(content)).toEqual(recording);
});

it("marks observed mode, fault, alarm, quality and stream discontinuities without inferring cause", () => {
  const previous = sample(4, 4);
  expect(sampleMarkers(undefined, previous)).toEqual(["First retained sample"]);
  expect(sampleMarkers(previous, sample(5, 5))).toEqual([]);
  const current = sample(3, 2);
  current.mode = "manual";
  current.faults.freeze_level_sensor = true;
  current.alarms.sensor_fault = true;
  current.signals.level.quality = "stale";
  const markers = sampleMarkers(previous, current);
  expect(markers).toContain("Stream discontinuity; sequence/time reset or same-position update");
  expect(markers).toContain("Mode automatic → manual");
  expect(markers).toContain("Fault freeze_level_sensor: on");
  expect(markers).toContain("Alarm sensor_fault: on");
  expect(markers).toContain("Quality level: good → stale");
  const reversed = sampleMarkers(current, previous);
  expect(reversed).toContain("Fault freeze_level_sensor: off");
  expect(reversed).toContain("Alarm sensor_fault: off");
  expect(sampleMarkers(previous, sample(9, 9))).toContain(
    "Sequence gap; intervening states not retained",
  );
  expect(sampleMarkers(previous, sample(5, 1))[0]).toMatch(/discontinuity/);
});

it("uses simulation-time spacing, declared unit scales and disconnected reset segments", () => {
  expect(trendPoints([], "plant_level")).toBe("");
  expect(
    trendPoints([sample(0, 0, 0), sample(1, 2, 500), sample(2, 10, 1000)], "plant_level"),
  ).toBe("0.00,100.00 20.00,50.00 100.00,0.00");
  expect(
    trendPoints(
      [sample(0, 5, 0), sample(1, 10, 100), sample(2, 1, 500), sample(3, 3, 1000)],
      "plant_level",
    ),
  ).toBe("0.00,50.00 100.00,0.00");
  const first = sample(0),
    last = sample(1);
  first.signals.temperature.value = -10;
  last.signals.temperature.value = 120;
  expect(trendPoints([first, last], "temperature")).toBe("0.00,100.00 100.00,0.00");
  first.actual.pump_pct = 0;
  last.actual.pump_pct = 100;
  expect(trendPoints([first, last], "pump")).toBe("0.00,100.00 100.00,0.00");
  first.signals.level.value = -100;
  last.signals.level.value = 2000;
  expect(trendPoints([first, last], "sensor_level")).toBe("0.00,100.00 100.00,0.00");
  expect(
    trendPoints([first, { ...last, simulation_time_s: first.simulation_time_s }], "pump"),
  ).toBe("0.00,0.00");
});
