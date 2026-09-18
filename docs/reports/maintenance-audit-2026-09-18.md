# Maintenance audit — 2026-09-18

## Result

The validated source baseline was `92b32b9`. The hosted
[CI run](https://github.com/JasonStys/industrial-edge-digital-twin/actions/runs/35385672147) passed
Linux sanitizer, Windows MSVC, Node 22/24, browser, accessibility, performance, repository, and
production-audit gates.

## Dependency decisions

- The pinned pnpm setup action update was reviewed, validated, and merged.
- A grouped TypeScript 7 update was rejected because the current typescript-eslint release does not
  support TypeScript 7.
- Node 26 type declarations were also deferred while Node 22–24 remains the tested runtime matrix.
- Dependabot ignore rules record those compatibility boundaries.

No open pull request or non-default maintenance branch remained when this report was prepared.
