/**
 * @file run-e2e.mjs
 * @brief Owns the gateway process while Playwright runs so its C++ child is always reaped.
 * @details Process variables and function locations are generated in docs/generated/symbol-index.md.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.TWIN_E2E_PORT ?? 8080);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid TWIN_E2E_PORT");
const origin = `http://127.0.0.1:${port}`;
// Refuse an occupied port before starting a gateway or probing any HTTP listener.
const reservation = net.createServer();
await new Promise((resolve, reject) =>
  reservation.once("error", reject).listen(port, "127.0.0.1", resolve),
);
await new Promise((resolve) => reservation.close(resolve));
const server = spawn(process.execPath, [path.join(repositoryRoot, "gateway", "dist", "main.js")], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
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
      if (serverOutput.includes(`Edge twin available at ${origin}`)) {
        const response = await globalThis.fetch(`${origin}/api/v1/health`, {
          signal: globalThis.AbortSignal.timeout(1000),
        });
        if (response.ok && server.exitCode === null) return;
      }
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
