# Testing strategy

## Risk-based pyramid

| Layer               | Scope                                 | Main risks covered                                        |
| ------------------- | ------------------------------------- | --------------------------------------------------------- |
| C++ unit/property   | Physics, controller, engine, protocol | Bounds, interlocks, deterministic state, malformed inputs |
| TypeScript unit     | Schemas, configuration, server, MQTT  | Validation, authorization, coalescing, failure mapping    |
| Process integration | Real gateway ↔ C++ executable         | Startup, schema compatibility, correlation, queue bounds  |
| Browser end-to-end  | Desktop and mobile Chromium           | User journeys, live faults, keyboard, reflow, WCAG checks |
| CI portability      | Linux and Windows                     | Compiler differences, sanitizers, supported Node versions |

## C++ cases

The dependency-free test executable runs 15 named cases. It includes a 2,000-step property loop for
level and finite-temperature bounds, a 1,000-step determinism comparison, manual/automatic
interlocks, signal fault campaigns, command idempotency, input limits, and JSON escaping.

Linux CI enables AddressSanitizer and UndefinedBehaviorSanitizer. Windows CI compiles with MSVC
`/W4 /WX /permissive-`; Linux uses `-Wall -Wextra -Wpedantic -Wconversion -Werror`.

## TypeScript cases

Vitest runs 41 unit and integration tests. Coverage thresholds are enforced globally at 85%
statements, 80% branches, 85% functions, and 85% lines. The real-process tests start the C++ engine,
validate the first snapshot, observe fixed-step telemetry, correlate commands, and exercise both the
configured queue bound and engine-level duplicate semantics.

## Browser cases

Ten scenarios run once at desktop size and once with a Pixel 7 profile:

1. Live telemetry plus axe rules tagged WCAG 2 A/AA, 2.1 AA, and 2.2 AA.
2. In-memory token entry and operating-mode change.
3. Frozen-sensor transition to stale quality, faulted state, and safe output request.
4. Requested/actual mismatch under a stuck pump.
5. Keyboard skip navigation.
6. Mobile reflow with no horizontal page overflow.
7. Real native-engine fault capture, JSON download, time-aligned replay, requested/actual quality
   evidence and no commands while reviewing.
8. Imported quality-transition trace, clear invalid-file rejection, preservation of prior review and
   superseded asynchronous import cancellation.
9. Command-network failure remains an explicit unknown outcome without an uncaught exception or
   presumed success.
10. Imported review without any live sample hides historical readings when returning to live;
    extreme sensor readouts stay compact and fit the viewport.

The stateful scenarios use one worker because both viewport projects intentionally share one twin
instance. Serialization prevents one project from clearing another project's injected fault.

Automated axe results are scoped evidence, not a claim of complete accessibility. Manual review
should include screen readers, zoom, high contrast, reduced motion, and domain-language clarity.

## Performance validation

`pnpm benchmark` runs five 10,000-step nominal scenarios, discards JSON Lines output at the parent,
and reports median steps per second. CI also completes a 10,000-step smoke campaign. The benchmark
does not claim hard real-time behavior; it detects major regression in deterministic compute and
serialization cost.

## Pass criteria

- All tests pass on clean checkout.
- No compiler warning is accepted.
- TypeScript coverage meets configured thresholds.
- Full dependency graph audit has no moderate/high/critical finding.
- Browser suite reports zero violations for its selected axe tags.
- Build output remains within documented budgets.
- Generated symbol index, internal links, file headers, and action pinning are current.

See the measured [validation report](reports/validation-report.md).

The [practical-workflow report](reports/practical-workflows-2026-11-09.md) records current local
results and scope. Live capture and playback use the actual C++ process/gateway. Imported-trace
fixtures test presentation/validation contracts, not measurements from physical equipment.

## CodeQL source-security evidence

The separate [CodeQL workflow](../.github/workflows/codeql.yml) creates genuine supported-language
databases and uses security-extended queries. Read [the analysis contract](codeql-analysis.md) for
each extraction mode and [the setup report](reports/codeql-setup-2026-11-09.md) for observations.
Existing runtime/property/fault/browser/sanitizer and dependency gates remain unchanged. Syntax
validation is not an executed scan; uploaded analyses and open findings must be inspected at the
exact current-main SHA. Missing or unauthorized analysis is reported as unavailable rather than
passing. Real findings require source-level triage and a regression reproducing the actual boundary.
