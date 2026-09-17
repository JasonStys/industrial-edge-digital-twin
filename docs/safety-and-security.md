# Safety, security, and threat model

## Safety statement

This repository is an educational simulator. It does not implement functional safety, certified
controls, electrical protection, equipment limits, or a validated process model. Do not connect it
to physical equipment without a qualified engineering review and independent safety controls.

## Protected invariants

- Simulated level remains between 0 and 1,000 L.
- The requested heater output is zero below its 150 L permissive.
- Non-good control signals force all requested outputs to zero.
- Stopped mode requests all outputs at zero.
- Fault-overridden actual output remains observable and is never relabeled as requested output.
- Repeated command IDs do not repeat side effects.
- Queues, clients, input lines, tokens, request bodies, and command history are bounded.

## Threat model

| Threat                    | Boundary           | Control                                                       | Residual risk                                                  |
| ------------------------- | ------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Unauthorized control      | HTTP command route | Bearer authentication; SHA-256 digest comparison              | Demo token has no user identity or roles                       |
| Malformed/oversized body  | HTTP parser        | 16 KiB limit; strict Zod schemas                              | Authorized users can still issue allowed hazardous simulations |
| Command replay            | Gateway/engine     | Caller ID plus 256-entry result cache                         | Replay beyond eviction window is possible                      |
| Protocol injection        | Engine stdin       | Printable ASCII, 512-byte, 16-token bounds                    | Protocol is local, not cryptographically authenticated         |
| Malicious engine output   | Child stdout       | 65,536-byte line bound; JSON parse; strict schema             | Repeated bad output degrades service rather than restarts it   |
| Browser content injection | HMI                | Variable content assigned with `textContent`; restrictive CSP | Third-party browser extensions are outside scope               |
| Slow SSE consumer         | Streaming response | 32-client cap; close on backpressure                          | No per-identity quota                                          |
| Broker outage             | MQTT adapter       | One pending latest state; QoS-zero queue disabled             | QoS 1 library state and broker storage remain broker-dependent |
| Secret disclosure         | Logs/health        | Token never logged; stderr excluded from health               | URL credentials can appear in host process inspection          |
| Dependency compromise     | Build              | Exact versions, lockfile, audit, pinned actions               | Registry and transitive package trust remains                  |

## Secure defaults

- Listen on loopback.
- Keep MQTT disabled unless configured.
- Require an explicit command token in production.
- Treat read endpoints as intentionally public only within the deployment boundary.
- Do not expose C++ stdin or gateway diagnostics remotely.
- Do not retry physical write commands implicitly.

## Shared-deployment requirements

Before exposing the service beyond localhost, add TLS, managed secrets, real authentication,
role-based authorization, per-device scopes, broker ACLs, CSRF/origin policy appropriate to the
client model, audit retention, rate limits, monitoring, and a domain hazard analysis. Replace the
demo token rather than adding meaning to it.

## Dependency and disclosure process

Production dependencies are audited in CI. Report vulnerabilities privately according to
[SECURITY.md](../SECURITY.md). Never include credentials, customer data, proprietary device details,
or real process traces in an issue.

General OT security context is available in
[NIST SP 800-82 Rev. 3](https://csrc.nist.gov/pubs/sp/800/82/r3/final).
