# Engineering references

These primary references informed implementation decisions. Links were verified during repository
construction; external behavior and versions should be rechecked during upgrades.

- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines) — RAII, scoped
  enums, type/resource safety, bounded interfaces, and simplicity.
- [CMake documentation](https://cmake.org/cmake/help/latest/) — portable configuration, builds, and
  testing integration.
- [TypeScript strict option](https://www.typescriptlang.org/tsconfig/strict) — stronger static
  guarantees and explicit upgrade implications.
- [MQTT Version 5.0](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html) — QoS, retained
  messages, session state, and bounded flow-control concepts.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — keyboard, reflow, focus, contrast, names, and status
  communication requirements used by browser tests.
- [Node.js child process API](https://nodejs.org/api/child_process.html) — supervised process and
  standard-stream behavior.
- [Fastify documentation](https://fastify.dev/docs/latest/) — HTTP lifecycle, request bounds, and
  logging controls.
- [Playwright documentation](https://playwright.dev/docs/intro) — browser automation and device
  profiles.
- [Vitest coverage guide](https://vitest.dev/guide/coverage.html) — V8 coverage thresholds and
  reporting.
- [NIST SP 800-82 Rev. 3](https://csrc.nist.gov/pubs/sp/800/82/r3/final) — operational technology
  reliability and security context.
