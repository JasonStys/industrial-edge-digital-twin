# Contributing

## Development flow

1. Open an issue describing the behavior, engineering units, safety implications, and evidence.
2. Keep the process engine deterministic; do not read wall-clock time inside the C++ model.
3. Add or update tests before changing an invariant, public command, telemetry field, or fault.
4. Update documentation and run `pnpm symbols` after source changes.
5. Run C++ tests, `pnpm validate:web`, and `pnpm test:e2e` before requesting review.

## Code expectations

- Use unit suffixes in engineering variables and API fields.
- Prefer scoped enums, standard containers, RAII, and bounded inputs in C++.
- Keep TypeScript strict and validate unknown input at every process/network boundary.
- Avoid implicit retries for state-changing commands.
- Give errors a stable code, a consequence, and a remediation path.
- Keep comments focused on constraints and reasoning; let names explain mechanics.
- Add the required file header and API comments to new source files.

## Changes requiring an ADR

Add an architecture decision record for a new language/runtime, persistent state, protocol, public
schema compatibility break, authentication model, broker-delivery model, or simulation timing
strategy.

## Safety and data

Use only synthetic process data. Never submit credentials, customer information, proprietary
interfaces, real plant traces, or claims that the simulator is suitable for equipment control.
