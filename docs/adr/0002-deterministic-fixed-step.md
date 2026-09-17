# ADR 0002: Deterministic fixed-step simulation

- Status: Accepted
- Date: 2026-09-16

## Context

Using elapsed wall-clock time directly makes tests sensitive to host load and couples physical state
to scheduling jitter. A portfolio simulator should produce reproducible traces and make its timing
assumptions explicit.

## Decision

Each `TICK` advances exactly 0.1 simulated seconds. The gateway requests at most one tick at a time
and counts scheduling opportunities it cannot service. The model never reads a clock.

## Consequences

Identical initial state and command sequences produce identical state. Slow hosts reduce the ratio
of simulated time to wall time but do not change equations. This is not a hard-real-time claim.

Variable-step integration and real-time catch-up were rejected because they complicate validation
and can create unsafe bursts after a stall.
