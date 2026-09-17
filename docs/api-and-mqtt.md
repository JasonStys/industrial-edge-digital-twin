# API and MQTT contracts

## HTTP conventions

- JSON request bodies are limited to 16 KiB.
- Commands use strict discriminated schemas; extra properties are rejected.
- Command IDs contain 1–64 letters, digits, underscores, or hyphens.
- Write requests require `Authorization: Bearer <token>`.
- Error responses use an RFC 9457-style `type`, `status`, `title`, and `detail` object.
- Security headers deny framing, object sources, external base URLs, and content sniffing.

The complete machine-readable contract is [openapi.yaml](openapi.yaml).

## Command examples

```bash
curl -sS http://127.0.0.1:8080/api/v1/commands \
  -H 'Authorization: Bearer local-demo-token' \
  -H 'Content-Type: application/json' \
  -d '{"commandId":"mode_001","type":"setMode","mode":"automatic"}'
```

```json
{
  "commandId": "fault_001",
  "type": "injectFault",
  "fault": "freeze_level_sensor",
  "enabled": true
}
```

Reusing `fault_001` returns the cached first result with `duplicate: true`; it does not reapply
different arguments. The C++ engine retains the newest 256 results. The gateway allows no more than
64 commands awaiting responses.

## Telemetry

`GET /api/v1/state` returns the latest validated snapshot. `GET /api/v1/events` streams the same
snapshot as a named `telemetry` Server-Sent Event. At most 32 SSE clients are accepted.

Fields use unit suffixes (`level_l`, `temperature_c`, `source_time_s`, `pump_pct`) so algorithms and
humans do not infer units from context. Every signal has quality; actual and requested outputs are
separate objects.

## MQTT

Set `MQTT_URL` to enable MQTT v5. The gateway publishes current state to:

```text
edge-twin/tank-01/state
```

The message is retained and uses QoS 1. QoS 1 provides at-least-once delivery, not exactly-once
business effects. Consumers must treat the snapshot sequence as an ordering/idempotency aid.

While one publish is in flight, the gateway retains only the newest pending snapshot and counts
replacements. This prevents an unavailable broker from creating an unbounded in-memory queue.
Transport credentials may be supplied in the broker URL for a local exercise, but shared systems
should use managed secrets and TLS client configuration.

## Local broker

`compose.yaml` binds the broker only to `127.0.0.1:1883`. Its anonymous configuration is for a
single-machine demo and must not be exposed to a network.

```bash
docker compose up broker
MQTT_URL=mqtt://127.0.0.1:1883 TWIN_COMMAND_TOKEN=local-demo-token node gateway/dist/main.js
```

The MQTT behavior follows the
[OASIS MQTT 5.0 standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html), especially its
separation of retained messages, session state, and QoS delivery flows.
