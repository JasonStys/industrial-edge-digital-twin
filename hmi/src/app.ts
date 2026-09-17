/**
 * @file app.ts
 * @brief Validates telemetry, renders the HMI safely, and issues authenticated bounded commands.
 * @details Functions, module state, and exact lines are generated in docs/generated/symbol-index.md.
 */

import { SnapshotSchema, type ApiCommand, type Snapshot } from "../../gateway/src/contracts.js";

let commandToken = "";
let latestSequence = -1;
const levelHistory: number[] = [];

/** Return a required DOM element or fail early with an actionable developer error. */
function element<T extends Element = HTMLElement>(id: string): T {
  const match = document.querySelector<T>(`#${id}`);
  if (match === null) throw new Error(`Required element #${id} is missing`);
  return match;
}

/** Update text without interpreting telemetry or error strings as markup. */
function text(id: string, value: string): void {
  element(id).textContent = value;
}

/** Format finite engineering values consistently for scanning. */
function engineering(value: number, digits = 1): string {
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

/** Draw a bounded, capacity-normalized trend using an SVG polyline. */
function renderTrend(levelLitres: number): void {
  if (levelHistory.length >= 90) levelHistory.shift();
  levelHistory.push(levelLitres);
  const points = levelHistory.map((level, index) => {
    const x = levelHistory.length <= 1 ? 0 : (index / (levelHistory.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, level / 10));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  element<SVGPolylineElement>("level-trend").setAttribute("points", points.join(" "));
}

/** Render one schema-validated snapshot into all live regions and visual indicators. */
export function renderSnapshot(snapshot: Snapshot): void {
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
  if (snapshot.sequence !== latestSequence) {
    latestSequence = snapshot.sequence;
    renderTrend(snapshot.plant.level_l);
  }
}

/** Parse unknown telemetry before it reaches rendering code. */
function acceptSnapshot(candidate: unknown): void {
  const parsed = SnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    text("connection-label", "Invalid telemetry");
    document.body.dataset.connection = "offline";
    return;
  }
  renderSnapshot(parsed.data);
  text("connection-label", "Live telemetry");
  document.body.dataset.connection = "live";
}

/** Send a command with the in-memory bearer token and surface the server's decision. */
async function sendCommand(command: ApiCommand): Promise<void> {
  if (commandToken.length === 0) {
    text("command-status", "Enter and confirm the local command token first.");
    return;
  }
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
window.addEventListener("pagehide", () => events.close(), { once: true });
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
