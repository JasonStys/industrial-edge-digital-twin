/**
 * @file e2e-runner.test.ts
 * @brief Verify the browser runner never probes or reuses an unrelated listener.
 * @details Jason Stys; owned sentinel/process variables are indexed in docs/generated/symbol-index.md.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("refuses an occupied test port before sending HTTP or starting a gateway", async () => {
  let requests = 0;
  const sentinel = createServer((_request, response) => {
    requests += 1;
    response.end("unrelated");
  });
  await new Promise<void>((resolve) => sentinel.listen(0, "127.0.0.1", resolve));
  const address = sentinel.address();
  if (address === null || typeof address === "string")
    throw new Error("Expected owned TCP sentinel");
  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/run-e2e.mjs", import.meta.url))],
      {
        env: { ...process.env, TWIN_E2E_PORT: String(address.port) },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    const timeout = setTimeout(() => child.kill(), 4000);
    try {
      const result = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      expect(result).toBe(1);
      expect(requests).toBe(0);
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      sentinel.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
