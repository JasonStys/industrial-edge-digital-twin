# Recorded fault-campaign workflow validation

Jason Stys · 2026-11-09 · local Windows x64, Node 24, pnpm 11.25, MSVC 19.51 Debug. The current C++
sources were rebuilt with the existing configured Visual Studio toolchain. No physical equipment,
MQTT broker, Docker repair, live provider or user dataset was involved. Hosted Linux sanitizers,
Node 22/24 and bundled-Chromium acceptance remain coordinated CI gates.

## Result and rationale

Operators can now capture complete synchronized process snapshots, review mode/fault/alarm/quality
transitions, select unit-labelled time-aligned trends, scrub/play original samples and retain a
portable trace. Analyst imports are strict, bounded and explicitly unauthenticated. Review cannot
send commands or overwrite live state. A missing live sample never relabels imported values as live.
Network command failures remain unknown outcomes rather than uncaught errors or assumed success.

| Check                          | Observed result                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native build and CTest         | Fresh current-source MSVC Debug build passed; the one CTest target runs all 15 named process/controller/protocol cases, all passed.                                                                            |
| Typed unit/process integration | 41 passed; real C++ bridge tests, finite/capacity/import/copy/sequence/unit-scale/precision oracles and owned-port refusal included.                                                                           |
| Global measured coverage       | 88.43% statements, 90.15% branches, 91.93% functions, 88.54% lines; existing 85/80/85/85 gates passed.                                                                                                         |
| Trace module                   | 98.48% lines, 98.07% branches, 100% functions; full-capacity high-precision compact export reimports successfully. The defensive export-byte rejection branch was not artificially mocked to inflate coverage. |
| Actual browser journeys        | 20 passed on local Microsoft Edge/Chromium-family desktop and Pixel 7 profiles; production HMI, real gateway/native engine and actual JSON download used.                                                      |
| Accessibility/reflow           | Zero axe violations for selected WCAG 2/2.1/2.2 A/AA tags on both profiles; no page overflow, including extreme sensor readout. Not a claim of complete screen-reader/accessibility conformance.               |
| Repository gates               | Prettier, typed ESLint, all TypeScript configurations, production build, 36-source symbol index and repository policy passed. Three existing stale formatting files were normalized; no gate was removed.      |
| Dependency audit               | Full graph has no known vulnerabilities after compatible Fastify/transitive patches and the narrow tested minimatch override. CI now rejects moderate-or-higher findings across the graph.                     |
| Existing throughput benchmark  | Five 10,000-step Debug runs: median 645.090 ms, 15,502 steps/s. Includes startup/serialization; this is local Debug evidence, not a release-build comparison or hard-real-time guarantee.                      |

Browser scenarios cover real frozen-sensor capture to stale quality, safe actual outputs, exported
synchronized values without the command token, replay command-handler refusal even after a synthetic
submit event, playback, returning to live, invalid-file retention, delayed-import/new recording
race, no-live-data review exit and scientific notation for extreme source values. Imported fixtures
exercise display/validation contracts, not physical measurement authenticity.

The independent numerical oracle checks nonuniform times 0/2/10 s map to x = 0/20/100, proper level,
temperature and percentage scales, clipping and disconnected reset segments. Circular-buffer oracles
verify exact retained ordering and 1,205 evictions after 2,405 samples, deep-copy isolation,
duplicate suppression and explicit restart. The owned-port sentinel observed zero HTTP requests
before the runner refused its occupied port. All existing process/security/queue tests remain.

## Reproduction and limits

```text
cmake --build build --parallel
ctest --test-dir build --output-on-failure
pnpm install --frozen-lockfile
pnpm symbols:check
pnpm validate:web
pnpm test:e2e
pnpm benchmark
pnpm audit --audit-level low
```

Use a configured compiler shell on Windows. `TWIN_E2E_PORT` selects an unused test-only port;
occupied listeners are never reused, probed or killed. Local browser checks set
`TWIN_BROWSER_CHANNEL=msedge`; CI uses its explicitly installed Playwright Chromium. All test
gateway/engine processes are owned and closed by the runner.

Primary dependency advisories: [fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg),
[glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249). No advisory suppression or forced
downgrade was used. A security audit records known advisories at check time, not proof of no flaws.

Capture remains page-memory-only, bounded to 1,200 samples / 2 MiB and fixed simulated-tank data. It
is not an authenticated hardware historian, a physical safety system, a general telemetry parser or
shared-user identity layer. No claim of arbitrary-duration retention, causality, certification or
universal process coverage is made. See [operation and interpretation](../recording-and-replay.md).
