/**
 * @file benchmark-engine.mjs
 * @brief Measures deterministic engine throughput without retaining its JSON Lines output.
 * @details Main variables: enginePath, steps, samplesMs, and reportPath.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const executable = process.platform === "win32" ? "twin-engine.exe" : "twin-engine";
const candidates = [
  process.env.TWIN_ENGINE_PATH,
  path.join(repositoryRoot, "build", executable),
  path.join(repositoryRoot, "build", "Release", executable),
].filter(Boolean);
const enginePath = candidates.find((candidate) => existsSync(candidate));
if (enginePath === undefined) throw new Error("Build twin-engine or set TWIN_ENGINE_PATH first.");

const steps = 10_000;
const samplesMs = [];
for (let run = 0; run < 5; ++run) {
  const started = process.hrtime.bigint();
  const result = spawnSync(enginePath, ["--scenario", "nominal", "--steps", String(steps)], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString("utf8"));
  samplesMs.push(Number(process.hrtime.bigint() - started) / 1_000_000);
}
samplesMs.sort((left, right) => left - right);
const medianMs = samplesMs[Math.floor(samplesMs.length / 2)];
const report = {
  benchmark: "fixed-step nominal simulation with JSON serialization discarded by the parent",
  engine: path.relative(repositoryRoot, enginePath).replaceAll("\\", "/"),
  measuredAt: new Date().toISOString(),
  runs: samplesMs.length,
  stepsPerRun: steps,
  simulatedSecondsPerRun: steps * 0.1,
  samplesMs: samplesMs.map((value) => Number(value.toFixed(3))),
  medianMs: Number(medianMs.toFixed(3)),
  medianStepsPerSecond: Number(((steps * 1_000) / medianMs).toFixed(0)),
};
await writeFile(
  path.join(repositoryRoot, "reports", "performance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${report.medianStepsPerSecond} simulation steps/second (median).\n`);
