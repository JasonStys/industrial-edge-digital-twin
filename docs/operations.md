# Operations and rollback runbook

## When to use this runbook

Use these steps for local demonstrations, CI diagnosis, dependency upgrades, or recovery from an
engine/gateway failure. It does not authorize a connection to physical equipment.

## Start

1. Build and test the C++ engine.
2. Install locked Node dependencies and build the gateway/HMI.
3. Export a command token of at least 12 characters.
4. Optionally start the loopback MQTT broker and set `MQTT_URL`.
5. Start `node gateway/dist/main.js`.
6. Confirm `/api/v1/health` reports `engine.running: true`.

## Health indicators

| Indicator                     | Meaning                                         | Action                                          |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| HTTP 200, status `ok`         | Engine is running                               | Continue                                        |
| HTTP 503, status `degraded`   | Engine exited or failed startup                 | Inspect local stderr; rebuild/restart           |
| `droppedTicks` increasing     | Engine cannot keep requested wall-clock cadence | Reduce tick rate; profile host                  |
| MQTT enabled but disconnected | Broker unavailable/auth failed                  | Check broker, TLS, ACL, URL                     |
| `replacedMessages` increasing | Publish slower than telemetry                   | Treat as freshness pressure; tune/repair broker |
| HMI says `Invalid telemetry`  | Browser rejected a schema-incompatible event    | Roll back gateway/engine pair                   |

The health endpoint intentionally excludes engine stderr and credentials.

## Safe stop

1. Request stopped mode and observe requested outputs reach 0%.
2. Remember that injected stuck-actuator faults can keep **actual** output nonzero.
3. Stop the gateway with SIGINT/SIGTERM. It stops tick requests, sends `QUIT` to the engine, closes
   network connections, and ends MQTT.
4. Stop the demo broker if used.

## Rollback

Artifacts are coupled by the validated snapshot schema. Roll back the engine, gateway, and HMI to
the same Git tag or commit; do not mix binaries from different revisions without contract testing.

1. Stop the current gateway.
2. Check out the last known-good tag/commit in a clean worktree.
3. Run C++ tests, `pnpm install --frozen-lockfile`, and `pnpm validate:web`.
4. Build both layers.
5. Start on loopback and run the health and browser smoke checks.
6. Record the rollback reason and affected commit in the release notes.

No persistent plant state is stored. Restart begins from the documented synthetic initial state.

## Common failures

### Engine executable not found

Build `twin-engine` or set `TWIN_ENGINE_PATH` to an absolute executable path.

### Commands return 401

Confirm the HMI token matches `TWIN_COMMAND_TOKEN`; the token is cleared from the input after it is
loaded into memory.

### Commands return 409

Read the result `code` and `message`. Common causes are wrong mode, out-of-range value, unknown
actuator/fault, or an intentionally rejected operation.

### Browser tests do not terminate

Use `pnpm test:e2e`, not a separately launched gateway. The repository runner owns the gateway and
ensures the C++ child process is reaped on Windows and Unix.
