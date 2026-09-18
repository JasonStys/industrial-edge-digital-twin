/**
 * @file run-e2e.mjs
 * @brief Owns the gateway process while Playwright runs so its C++ child is always reaped.
 * @details Process variables and function locations are generated in docs/generated/symbol-index.md.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const server = spawn(process.execPath, [path.join(repositoryRoot, "gateway", "dist", "main.js")], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: "8080",
    TWIN_COMMAND_TOKEN: "local-demo-token",
  },
  stdio: ["ignore", "pipe", "inherit"],
  windowsHide: true,
});

let serverOutput = "";
server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  serverOutput = (serverOutput + chunk).slice(-4096);
});

/** Wait until the real health endpoint responds or startup fails. */
async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`test gateway exited during startup: ${serverOutput}`);
    }
    try {
      const response = await globalThis.fetch("http://127.0.0.1:8080/api/v1/health");
      if (response.ok) return;
    } catch {
      // The listener is not ready yet; retry within the explicit deadline.
    }
    await delay(100);
  }
  throw new Error(`test gateway did not become healthy: ${serverOutput}`);
}

/** Ask the gateway to reap the engine, then enforce a short shutdown deadline. */
async function stopServer() {
  if (server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  const outcome = await Promise.race([exited.then(() => "exited"), delay(3_000, "timeout")]);
  if (outcome === "timeout" && server.exitCode === null) {
    server.kill("SIGKILL");
    await exited;
  }
}

let exitCode;
try {
  await waitForServer();
  const playwrightCli = path.join(repositoryRoot, "node_modules", "@playwright", "test", "cli.js");
  const runner = spawn(process.execPath, [playwrightCli, "test"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  exitCode = await new Promise((resolve) => runner.once("exit", (code) => resolve(code ?? 1)));
} finally {
  await stopServer();
}

process.exitCode = exitCode;
