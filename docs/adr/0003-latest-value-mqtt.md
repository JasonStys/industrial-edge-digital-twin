# ADR 0003: Latest-value MQTT publication

- Status: Accepted
- Date: 2026-09-16

## Context

Telemetry arrives every tick. If the broker is slow or disconnected, storing every pending snapshot
would make memory use and data staleness unbounded.

## Decision

Publish one retained current-state topic with QoS 1. While a publish is in flight, retain only the
newest snapshot and count replacements. Disable the MQTT library's QoS-zero offline queue.

## Consequences

Consumers can reconstruct current state quickly after subscription. They cannot use this topic as a
complete event history. QoS 1 may duplicate messages, so consumers should use sequence numbers for
ordering/idempotency. A future event stream would use a separate topic and bounded durable storage.

Reference: [MQTT Version 5.0](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html).
