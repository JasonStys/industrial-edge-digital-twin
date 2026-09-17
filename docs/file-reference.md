# File reference

Every source file starts with a purpose header. C++ classes/functions and TypeScript/JavaScript
interfaces/functions receive local API comments. Exact declaration lines are regenerated in the
[symbol index](generated/symbol-index.md), avoiding stale hand-maintained line numbers.

## Root and automation

| File                       | Responsibility                                                         |
| -------------------------- | ---------------------------------------------------------------------- |
| `CMakeLists.txt`           | Builds C++ core, CLI, tests, warnings, sanitizer, and coverage options |
| `package.json`             | Exact Node dependencies and repeatable validation commands             |
| `pnpm-lock.yaml`           | Complete dependency resolution                                         |
| `pnpm-workspace.yaml`      | Supply-chain policy and only allowed dependency build script           |
| `compose.yaml`             | Loopback-only optional MQTT demo broker                                |
| `.clang-format`            | C++ formatting policy                                                  |
| `.clang-tidy`              | Static-analysis policy                                                 |
| `eslint.config.js`         | Type-aware TypeScript/JavaScript lint policy                           |
| `vitest.config.ts`         | Test discovery and coverage thresholds                                 |
| `playwright.config.ts`     | Desktop/mobile browser projects and evidence settings                  |
| `.github/workflows/ci.yml` | Linux/Windows/Node/browser validation                                  |
| `.github/dependabot.yml`   | Grouped dependency update proposals                                    |

## C++ engine

| File                                      | Responsibility                                       |
| ----------------------------------------- | ---------------------------------------------------- |
| `cpp/include/edge_twin/types.hpp`         | Strong enums and unit-bearing data contracts         |
| `cpp/include/edge_twin/process_model.hpp` | Process-model public interface                       |
| `cpp/include/edge_twin/controller.hpp`    | Controller and interlock public interface            |
| `cpp/include/edge_twin/engine.hpp`        | Orchestration and command interface                  |
| `cpp/include/edge_twin/protocol.hpp`      | Bounded line parser and JSON serializer interface    |
| `cpp/src/types.cpp`                       | Stable enum wire names                               |
| `cpp/src/process_model.cpp`               | Fixed-step mass and energy balance                   |
| `cpp/src/controller.cpp`                  | Mode logic, alarms, and centralized interlocks       |
| `cpp/src/engine.cpp`                      | Sensing, faults, ticks, validation, idempotency      |
| `cpp/src/protocol.cpp`                    | Defensive parsing and JSON escaping/serialization    |
| `cpp/src/main.cpp`                        | Interactive line protocol and reproducible scenarios |
| `cpp/tests/test_main.cpp`                 | Fifteen unit, property, protocol, and campaign cases |

## Gateway

| File                                  | Responsibility                                     |
| ------------------------------------- | -------------------------------------------------- |
| `gateway/src/contracts.ts`            | Zod schemas, public command union, engine mapping  |
| `gateway/src/config.ts`               | Environment validation and artifact discovery      |
| `gateway/src/engine-client.ts`        | Child supervision, schema validation, queue bounds |
| `gateway/src/mqtt-publisher.ts`       | MQTT v5 connection and latest-value coalescing     |
| `gateway/src/server.ts`               | HTTP auth, REST, SSE, headers, and static HMI      |
| `gateway/src/main.ts`                 | Composition root and graceful shutdown             |
| `gateway/test/fixtures.ts`            | Typed test fixtures and fake engine port           |
| `gateway/test/contracts.test.ts`      | Schema and mapping tests                           |
| `gateway/test/config.test.ts`         | Secure configuration tests                         |
| `gateway/test/engine-client.test.ts`  | Real C++ process integration tests                 |
| `gateway/test/mqtt-publisher.test.ts` | Publish/coalescing/failure tests                   |
| `gateway/test/server.test.ts`         | Authorization, API, error, and static-host tests   |

## HMI

| File                         | Responsibility                                                     |
| ---------------------------- | ------------------------------------------------------------------ |
| `hmi/index.html`             | Semantic page regions, forms, live regions, and SVG trend          |
| `hmi/src/styles.css`         | Responsive visual system, focus, quality, and reduced motion       |
| `hmi/src/app.ts`             | Runtime validation, safe rendering, commands, SSE lifecycle        |
| `hmi/test/dashboard.spec.ts` | Desktop/mobile interaction, accessibility, fault, and reflow tests |
| `hmi/vite.config.ts`         | Static production build                                            |

## Scripts and infrastructure

| File                                | Responsibility                                                       |
| ----------------------------------- | -------------------------------------------------------------------- |
| `scripts/run-e2e.mjs`               | Owns and reaps gateway/engine during browser tests                   |
| `scripts/generate-symbol-index.mjs` | Generates exact source declaration line links                        |
| `scripts/check-repository.mjs`      | Checks headers, docs, links, pins, exact versions, and naming policy |
| `scripts/benchmark-engine.mjs`      | Measures five bounded 10,000-step campaigns                          |
| `infra/mosquitto.conf`              | Loopback demonstration broker behavior                               |

## Documentation and reports

`docs/` contains architecture, model, API, faults, complexity, safety/security, testing, operations,
sources, ADRs, exact symbol locations, and the current validation report. `reports/` contains the
machine-readable repository check, performance samples, and committed test summary; detailed local
coverage HTML remains untracked.
