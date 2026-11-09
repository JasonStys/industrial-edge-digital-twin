/**
 * @file app.ts
 * @brief Validates telemetry, renders the HMI safely, and issues authenticated bounded commands.
 * @details Functions, module state, and exact lines are generated in docs/generated/symbol-index.md.
 */

import { SnapshotSchema, type ApiCommand, type Snapshot } from "../../gateway/src/contracts.js";
import {
  TRACE_BYTES,
  TraceRecorder,
  currentSegment,
  parseTrace,
  sampleMarkers,
  serializeTrace,
  trendPoints,
  type TraceRecording,
  type TrendSignal,
} from "./trace.js";

let commandToken = "";
const recorder = new TraceRecorder();
let latestSnapshot: Snapshot | undefined;
const liveHistory: Snapshot[] = [];
let recording: TraceRecording | undefined;
let recordingOrigin = "";
let reviewIndex: number | undefined;
let playback: ReturnType<typeof setInterval> | undefined;
let traceOperation = 0;

/** Return a required DOM element or fail early with an actionable developer error. */
function element<T extends Element = HTMLElement>(id: string): T {
  const match = document.querySelector<T>(`#${id}`);
  if (match === null) throw new Error(`Required element #${id} is missing`);
  return match;
}

/** Update text without interpreting telemetry or error strings as markup. */
function text(id: string, value: string): void {
  const target = element(id);
  if (target.textContent !== value) target.textContent = value;
}

/** Format finite engineering values consistently for scanning. */
function engineering(value: number, digits = 1): string {
  if (Math.abs(value) >= 10_000_000 || (value !== 0 && Math.abs(value) < 0.0001))
    return value.toExponential(3);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** Update one requested/actual actuator row and highlight discrepancies. */
function renderActuator(prefix: string, requested: number, actual: number): void {
  const meter = element<HTMLMeterElement>(`${prefix}-requested`);
  meter.value = requested;
  const requestedLabel = `${engineering(requested, 0)}%`;
  const actualLabel = `${engineering(actual, 0)}%`;
  text(`${prefix}-requested-label`, requestedLabel);
  text(`${prefix}-actual-label`, actualLabel);
  const difference = Math.abs(requested - actual) > 0.5;
  const delta = element(`${prefix}-delta`);
  delta.textContent = difference ? "Mismatch" : "Tracking";
  delta.dataset.mismatch = String(difference);
}

/** Render active boolean alarms with clear normal-state feedback. */
function renderAlarms(snapshot: Snapshot): void {
  const definitions: ReadonlyArray<readonly [boolean, string]> = [
    [snapshot.alarms.safe_state_active, "Safe-state outputs are active"],
    [snapshot.alarms.sensor_fault, "A control signal is stale, bad, or out of range"],
    [snapshot.alarms.heater_interlock, "Heater request was blocked by the level interlock"],
    [snapshot.alarms.low_level, "Tank level is at or below the low alarm threshold"],
    [snapshot.alarms.high_level, "Tank level is at or above the high alarm threshold"],
  ];
  const active = definitions.filter(([enabled]) => enabled);
  const list = element<HTMLUListElement>("alarm-list");
  list.replaceChildren();
  if (active.length === 0) {
    const item = document.createElement("li");
    item.className = "quiet";
    item.textContent = "No active process alarm or controller interlock";
    list.append(item);
  } else {
    for (const [, label] of active) {
      const item = document.createElement("li");
      item.textContent = label;
      list.append(item);
    }
  }
  text("alarm-count", `${active.length} active`);
}

/** Draw the selected signal against real simulation time, never connecting a reset discontinuity. */
function renderTrend(samples: readonly Snapshot[]): void {
  const signal = element<HTMLSelectElement>("trend-signal").value as TrendSignal;
  element<SVGPolylineElement>("level-trend").setAttribute("points", trendPoints(samples, signal));
  const segment = currentSegment(samples);
  text("trend-title", `Time-aligned ${signal.replaceAll("_", " ")} trend`);
  text(
    "trend-range",
    segment.length === 0
      ? "Waiting for valid samples."
      : `${engineering(segment[0]!.simulation_time_s)}–${engineering(segment.at(-1)!.simulation_time_s)} simulation seconds · ${segment.length} retained samples in this segment`,
  );
  text(
    "trend-description",
    `Time-aligned ${signal.replaceAll("_", " ")} in the latest contiguous simulation-time segment.`,
  );
}

/** Render one schema-validated snapshot into all live regions and visual indicators. */
export function renderSnapshot(snapshot: Snapshot): void {
  element("process-overview").removeAttribute("hidden");
  element<HTMLFieldSetElement>("command-surface").disabled = reviewIndex !== undefined;
  text("mode-value", snapshot.mode);
  text("controller-value", snapshot.controller_state.replaceAll("_", " "));
  text("sequence-value", String(snapshot.sequence));
  text("time-value", `${engineering(snapshot.simulation_time_s, 1)} s`);
  text("level-value", engineering(snapshot.signals.level.value, 1));
  text("temperature-value", engineering(snapshot.signals.temperature.value, 1));
  text(
    "age-value",
    engineering(snapshot.simulation_time_s - snapshot.signals.level.source_time_s, 1),
  );
  text("target-level-label", `Target ${engineering(snapshot.targets.level_l, 0)} L`);

  const quality = element("quality-badge");
  quality.dataset.quality = snapshot.signals.level.quality;
  quality.textContent = snapshot.signals.level.quality.replaceAll("_", " ");
  const fill = Math.max(0, Math.min(100, snapshot.plant.level_l / 10));
  element("tank-fill").style.setProperty("--fill", `${fill}%`);
  element("vessel-description").textContent =
    `Tank contains ${engineering(snapshot.plant.level_l, 1)} litres at ` +
    `${engineering(snapshot.plant.temperature_c, 1)} degrees Celsius.`;

  renderActuator("pump", snapshot.requested.pump_pct, snapshot.actual.pump_pct);
  renderActuator("outlet", snapshot.requested.outlet_valve_pct, snapshot.actual.outlet_valve_pct);
  renderActuator("heater", snapshot.requested.heater_pct, snapshot.actual.heater_pct);
  renderAlarms(snapshot);
}

/** Stop owned playback without disturbing live telemetry, the recorder or the plant. */
function pausePlayback(): void {
  if (playback !== undefined) clearInterval(playback);
  playback = undefined;
  text("trace-play", "Play recording · 5 samples/s");
}

/** Render one captured state with observable transition markers; commands stay disabled in review. */
function showRecorded(index: number): void {
  if (
    recording === undefined ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= recording.snapshots.length
  )
    return;
  reviewIndex = index;
  const snapshot = recording.snapshots[index]!;
  renderSnapshot(snapshot);
  renderTrend(recording.snapshots.slice(0, index + 1));
  element<HTMLFieldSetElement>("command-surface").disabled = true;
  const position = element<HTMLInputElement>("trace-position");
  position.max = String(recording.snapshots.length - 1);
  position.value = String(index);
  text(
    "trace-position-label",
    `Sample ${index + 1} of ${recording.snapshots.length} · simulation ${engineering(snapshot.simulation_time_s)} s · sequence ${snapshot.sequence}`,
  );
  const markers = sampleMarkers(recording.snapshots[index - 1], snapshot);
  text(
    "trace-markers",
    markers.length === 0
      ? "No observed mode, fault, alarm or quality transition at this sample."
      : markers.join(" · "),
  );
  text(
    "trace-mode",
    `RECORDED REVIEW · ${recordingOrigin}; live simulator is independent and commands are disabled.`,
  );
  text(
    "connection-label",
    `Recorded review · live source ${document.body.dataset.connection === "live" ? "connected" : "unavailable"}`,
  );
  element<HTMLButtonElement>("trace-play").disabled = false;
  element<HTMLButtonElement>("trace-live").disabled = false;
}

/** Restore actual live values before enabling controls; replay never issues process commands. */
function returnLive(): void {
  traceOperation += 1;
  pausePlayback();
  reviewIndex = undefined;
  element<HTMLFieldSetElement>("command-surface").disabled = latestSnapshot === undefined;
  element<HTMLButtonElement>("trace-play").disabled = true;
  element<HTMLButtonElement>("trace-live").disabled = true;
  if (latestSnapshot !== undefined) renderSnapshot(latestSnapshot);
  else element("process-overview").setAttribute("hidden", "");
  renderTrend(liveHistory);
  text(
    "trace-mode",
    latestSnapshot === undefined
      ? "LIVE VIEW · awaiting valid telemetry; recorded readings are hidden."
      : "LIVE VIEW · synthetic process only",
  );
  text(
    "connection-label",
    document.body.dataset.connection === "live" ? "Live telemetry" : "Reconnecting",
  );
}

/** Refresh capture actions without allocating full trace copies on every telemetry envelope. */
function recordingStatus(): void {
  text(
    "trace-status",
    recorder.active
      ? `Recording ${recorder.count} retained samples (maximum 1200).`
      : recording === undefined
        ? "No recording yet. Start after live telemetry arrives or import a trace."
        : `${recording.snapshots.length} recorded samples (${recordingOrigin}); ${recording.dropped} earlier samples evicted by the capacity limit.`,
  );
  element<HTMLButtonElement>("trace-start").disabled = recorder.active;
  element<HTMLButtonElement>("trace-stop").disabled = !recorder.active;
  for (const id of ["trace-review", "trace-export"])
    element<HTMLButtonElement>(id).disabled = recording === undefined || recorder.active;
  element<HTMLInputElement>("trace-import").disabled = recorder.active;
  element<HTMLInputElement>("trace-position").disabled = recording === undefined || recorder.active;
}

/** Parse unknown telemetry before it reaches rendering code. */
function acceptSnapshot(candidate: unknown): void {
  const parsed = SnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    text("connection-label", "Invalid telemetry");
    document.body.dataset.connection = "offline";
    return;
  }
  const snapshot = parsed.data;
  if (latestSnapshot === undefined || JSON.stringify(snapshot) !== JSON.stringify(latestSnapshot)) {
    if (
      latestSnapshot !== undefined &&
      snapshot.simulation_time_s < latestSnapshot.simulation_time_s
    )
      liveHistory.length = 0;
    if (liveHistory.length >= 90) liveHistory.shift();
    liveHistory.push(snapshot);
    recorder.append(snapshot);
  }
  latestSnapshot = snapshot;
  recordingStatus();
  if (reviewIndex === undefined) {
    renderSnapshot(snapshot);
    renderTrend(liveHistory);
    text("connection-label", "Live telemetry");
  }
  document.body.dataset.connection = "live";
}

/** Send a command with the in-memory bearer token and surface the server's decision. */
async function sendCommand(command: ApiCommand): Promise<void> {
  if (reviewIndex !== undefined) {
    text("command-status", "Return to live view before issuing a command.");
    return;
  }
  if (commandToken.length === 0) {
    text("command-status", "Enter and confirm the local command token first.");
    return;
  }
  if (latestSnapshot === undefined) {
    text("command-status", "Wait for valid live telemetry before issuing a command.");
    return;
  }
  try {
    const response = await fetch("/api/v1/commands", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${commandToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const detail =
        typeof body === "object" &&
        body !== null &&
        "detail" in body &&
        typeof body.detail === "string"
          ? body.detail
          : `Command failed with HTTP ${response.status}`;
      text("command-status", detail);
      return;
    }
    if (typeof body === "object" && body !== null && "result" in body) {
      const result = body.result as { message?: unknown; duplicate?: unknown };
      const message = typeof result.message === "string" ? result.message : "Command accepted";
      text("command-status", `${message}${result.duplicate === true ? " (duplicate)" : ""}.`);
    }
  } catch {
    text(
      "command-status",
      "Command response unavailable. Verify live state before retrying; no success is assumed.",
    );
  }
}

/** Create a wire-safe id for retry-safe command semantics. */
function commandId(): string {
  return crypto.randomUUID().replaceAll("-", "_");
}

/** Convert a number input to a finite value or report an inline error. */
function inputNumber(id: string): number | undefined {
  const value = element<HTMLInputElement>(id).valueAsNumber;
  if (!Number.isFinite(value)) {
    text("command-status", "Enter a finite numeric value.");
    return undefined;
  }
  return value;
}

element<HTMLFormElement>("access-form").addEventListener("submit", (event) => {
  event.preventDefault();
  commandToken = element<HTMLInputElement>("command-token").value;
  element<HTMLInputElement>("command-token").value = "";
  text("command-status", "Token loaded into page memory for this session.");
});

element<HTMLFormElement>("mode-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const mode = element<HTMLSelectElement>("mode-input").value as "stopped" | "manual" | "automatic";
  void sendCommand({ commandId: commandId(), type: "setMode", mode });
});

element<HTMLFormElement>("target-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const level = inputNumber("level-target");
  const temperature = inputNumber("temperature-target");
  if (level === undefined || temperature === undefined) return;
  void (async () => {
    await sendCommand({
      commandId: commandId(),
      type: "setTarget",
      field: "level_l",
      value: level,
    });
    await sendCommand({
      commandId: commandId(),
      type: "setTarget",
      field: "temperature_c",
      value: temperature,
    });
  })();
});

element<HTMLFormElement>("output-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = inputNumber("output-value");
  if (value === undefined) return;
  const field = element<HTMLSelectElement>("output-field").value as
    "pump_pct" | "outlet_valve_pct" | "heater_pct";
  void sendCommand({ commandId: commandId(), type: "setOutput", field, value });
});

element<HTMLFormElement>("fault-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const enabled = submitter instanceof HTMLButtonElement && submitter.dataset.enabled === "true";
  const fault = element<HTMLSelectElement>("fault-input").value as
    "freeze_level_sensor" | "level_sensor_out_of_range" | "pump_stuck_on" | "heater_stuck_on";
  void sendCommand({ commandId: commandId(), type: "injectFault", fault, enabled });
});

element<HTMLButtonElement>("safe-stop").addEventListener("click", () => {
  void sendCommand({ commandId: commandId(), type: "setMode", mode: "stopped" });
});
element<HTMLButtonElement>("clear-faults").addEventListener("click", () => {
  void sendCommand({ commandId: commandId(), type: "clearFaults" });
});

element<HTMLButtonElement>("trace-start").addEventListener("click", () => {
  if (latestSnapshot === undefined) {
    text("trace-status", "Wait for valid live telemetry before starting a recording.");
    return;
  }
  returnLive();
  text("trace-error", "");
  element<HTMLInputElement>("trace-import").value = "";
  recording = undefined;
  recordingOrigin = "";
  recorder.start();
  recorder.append(latestSnapshot);
  recordingStatus();
});
element<HTMLButtonElement>("trace-stop").addEventListener("click", () => {
  recorder.stop();
  if (recorder.count > 0) {
    recording = recorder.snapshot();
    recordingOrigin = "captured in this tab";
  }
  recordingStatus();
});
element<HTMLButtonElement>("trace-review").addEventListener("click", () => {
  pausePlayback();
  showRecorded(0);
});
element<HTMLButtonElement>("trace-live").addEventListener("click", returnLive);
element<HTMLInputElement>("trace-position").addEventListener("input", () => {
  pausePlayback();
  showRecorded(element<HTMLInputElement>("trace-position").valueAsNumber);
});
element<HTMLSelectElement>("trend-signal").addEventListener("change", () => {
  if (reviewIndex === undefined) renderTrend(liveHistory);
  else showRecorded(reviewIndex);
});
element<HTMLButtonElement>("trace-play").addEventListener("click", () => {
  if (playback !== undefined) return pausePlayback();
  if (recording === undefined || reviewIndex === undefined) return;
  if (reviewIndex === recording.snapshots.length - 1) showRecorded(0);
  text("trace-play", "Pause recording");
  playback = setInterval(() => {
    if (
      recording === undefined ||
      reviewIndex === undefined ||
      reviewIndex >= recording.snapshots.length - 1
    )
      return pausePlayback();
    showRecorded(reviewIndex + 1);
  }, 200);
});
element<HTMLButtonElement>("trace-export").addEventListener("click", () => {
  if (recording === undefined) return;
  const url = URL.createObjectURL(
    new Blob([serializeTrace(recording)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "heated-tank-recording.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element<HTMLInputElement>("trace-import").addEventListener("change", (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;
  if (recorder.active) {
    text("trace-error", "Stop recording before importing a different trace.");
    input.value = "";
    return;
  }
  const operation = ++traceOperation;
  text("trace-error", "");
  void (async () => {
    try {
      if (file.size > TRACE_BYTES) throw new Error("Trace exceeds the 2 MiB import limit.");
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > TRACE_BYTES) throw new Error("Trace exceeds the 2 MiB import limit.");
      const imported = parseTrace(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (operation !== traceOperation) return;
      pausePlayback();
      recording = imported;
      recordingOrigin = "imported, not authenticated";
      recordingStatus();
      showRecorded(0);
    } catch {
      if (operation !== traceOperation) return;
      text(
        "trace-error",
        "Import rejected: expected a bounded version-1 simulated trace with valid snapshots. Previous recording and live state are unchanged.",
      );
    } finally {
      if (operation === traceOperation) input.value = "";
    }
  })();
});
recordingStatus();

fetch("/api/v1/state")
  .then(async (response) => {
    if (!response.ok) throw new Error(`Initial state returned HTTP ${response.status}`);
    const body = (await response.json()) as { snapshot?: unknown };
    acceptSnapshot(body.snapshot);
  })
  .catch(() => {
    document.body.dataset.connection = "offline";
    text("connection-label", "Gateway unavailable");
  });

const events = new EventSource("/api/v1/events");
window.addEventListener(
  "pagehide",
  () => {
    events.close();
    pausePlayback();
  },
  { once: true },
);
events.addEventListener("telemetry", (event) => {
  try {
    acceptSnapshot(JSON.parse((event as MessageEvent<string>).data));
  } catch {
    document.body.dataset.connection = "offline";
    text("connection-label", "Invalid telemetry");
  }
});
events.onerror = () => {
  document.body.dataset.connection = "offline";
  text("connection-label", "Reconnecting");
};
