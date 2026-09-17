# ADR 0001: C++ engine and TypeScript integration boundary

- Status: Accepted
- Date: 2026-09-16

## Context

The project needs deterministic process/controller behavior, explicit memory/resource ownership,
portable compiler diagnostics, a web API, MQTT integration, and an accessible browser interface.

## Decision

Use C++20 for the deterministic engine and TypeScript for the gateway/HMI. Communicate through a
small bounded line protocol over child-process standard streams.

## Rationale

C++ fits fixed-step simulation, state machines, fixed-width counters, sanitizers, and direct control
over allocations. TypeScript fits HTTP/MQTT libraries, runtime schema validation, and browser UI.
The process boundary prevents web dependencies from entering the simulation core and makes engine
crashes/failures observable.

The implementation follows modern C++ guidance: scoped enums, RAII-owned standard containers, strong
types, no naked `new`/`delete`, explicit units, and centralized invariants. TypeScript uses
`strict`, exact optional properties, unchecked-index protection, and runtime validation at trust
boundaries.

## Alternatives

- **All TypeScript:** simplest deployment, but weaker evidence for native systems work and less
  separation between deterministic and network concerns.
- **All C++:** possible, but web/auth/MQTT presentation code would carry more complexity without
  improving the model.
- **Native addon:** lower serialization overhead, but tighter ABI/toolchain coupling and greater
  crash impact. The measured workload does not justify it.
- **HTTP inside C++:** adds networking and authentication dependencies to the deterministic core.

## Consequences

The schema and process lifecycle must be tested across languages. Serialization adds bounded cost.
The gateway must reap the child on all platforms; the end-to-end runner explicitly verifies this
path.

Reference: [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines).
