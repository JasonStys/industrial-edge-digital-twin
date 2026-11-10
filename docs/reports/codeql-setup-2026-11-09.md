# CodeQL setup validation — 2026-11-09

By Jason Stys. This report records a source-analysis setup change, not a claim that absent analysis
was clean.

## Baseline and configuration

Before this change the repository had no active CodeQL workflow; authenticated alerts and analyses
returned404/no analysis found. The repository is public and its authored languages are supported.
The new advanced workflow follows the [documented language/build contract](../codeql-analysis.md),
uses the official full-SHA4.39.3 action pin, security-extended queries and only SARIF-upload
permission in addition to source read. Existing CI/dependency tests remain separate and unchanged.
No application behavior, device access, signing material, release bytes or private local
configuration is changed.

## Observed local checks

Windows/Node24.18.1: a fresh CMake/Ninja Release build compiled all10 library/engine/test
objects/targets with the existing MSVC19.44 warnings-as-errors contract; CTest passed its native
executable (15 named cases). `pnpm install --frozen-lockfile` and the complete `pnpm validate:web`
passed:41 unit/process/trace tests,88.54% line/90.15% branch coverage, strict types, lint,
production gateway/HMI, generated symbol index and repository/header/link/pin policy. Original
coverage floors are unchanged. Official checksum-verified actionlint1.7.12 accepted the new
workflow. The20 actual desktop/mobile browser journeys also passed on the freshly built engine using
an owned test port, with no skipped/retried cases. The full moderate dependency audit returned0known
vulnerabilities and the bounded five-run nominal benchmark measured53851steps/second under local
conditions. These observations are not a local CodeQL execution claim.

## Validation scope

Local compiler/runtime tests, repository docs/index checks and workflow syntax are separate from
genuine hosted extraction/query analysis. The workflow itself and its actual language categories
must run successfully; reported issues then require source-level triage. A first PR scan cannot
establish current-main coverage before merge. The
[CodeQL workflow history](https://github.com/JasonStys/industrial-edge-digital-twin/actions/workflows/codeql.yml)
identifies the runnable contract; current hosted runs and Security findings remain the authoritative
dynamic records.

The acceptance handoff records exact local commands and hosted source/run results. No CodeQL pass,
rule count, zero-alert claim or operational-security guarantee is inferred solely from syntax checks
or the prior404 response. The fixed public demo data and all original safety/authorization limits
are preserved.
