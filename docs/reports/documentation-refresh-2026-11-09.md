# Documentation refresh — 2026-11-09

By Jason Stys.

This documentation-only edition describes source `b1562a941fd809b9dd58fcee1fec55081e327f9d`. It does
not change application behavior, accounts, private data, installers or published releases.

## Published editions and completed review

| File                                                 | Bytes | SHA-256                                                            | Reviewed scope                                                                                                                      |
| ---------------------------------------------------- | ----: | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [project-guide.docx](project-guide.docx)             | 44842 | `284e7aabcd81ce5ee1d48f06857b74871bb6ea4fb8f4bfa448529dd601c356f9` | 6 pages, each viewed individually                                                                                                   |
| [validation-review.docx](validation-review.docx)     | 45828 | `eae23ec567cc13039b3acbe54c7fa61e7bb93ca6b94d2a37bc8ea6ddfe1b4842` | 6 pages, each viewed individually                                                                                                   |
| [validation-evidence.xlsx](validation-evidence.xlsx) |  7422 | `4b0adcd8daf0874ccce286de0fe3008bec7b3047a5bda428a2f56056911aa646` | Both tab previews; two actual Excel Tables/autoFilters; four formulas; failure-change/restore recalculation and zero formula errors |

Word review checked plain black titles, readable pagination, whole table rows, source references,
practical limits and absence of clipping or overflow. Render receipts were matched to the current
DOCX digest before approval. Workbook review inspected both tab previews and actual exported
Table/autoFilter elements; recalculated success/failure summaries were compared independently with
workflow metadata. Static previews do not draw Excel dropdown arrows; the exported workbook contains
the actual filters.

## Evidence and change boundary

- Functional baseline: `b1562a941fd809b9dd58fcee1fec55081e327f9d`.
- Workflow observation: `2026-11-10T06:42:18.583808+00:00`; exact run URLs and source identities
  remain in [publications.json](publications.json).
- Local document-package validation verifies exact copied bytes, Office ZIP integrity, approved
  page/tab identities and internal documentation links. Repository-specific documentation and
  source-policy commands are run separately and recorded in the integration handoff.
- Source/index metadata is regenerated using the repository’s existing tools. Existing privacy,
  security, coverage and workflow gates are retained.
- PR and later main workflows must pass independently. This record does not claim future or unrun
  integration CI success.

## Interpretation

The Word files document the cited source; dated source reports retain their original execution
scope. A passing workflow is distinct from completed analysis with zero findings, and neither
establishes production suitability. The Excel source inventory is not a per-test execution report.
Checksums identify exact bytes, not a signature or publisher attestation.

Use the [handbook](../handbook.md) to choose usage, design, security and test documentation. Keep
editable Markdown and reviewed editions together; do not replace historical measurements with
undated claims.

## Integration-local checks

Observed at `2026-11-10T08:05:07.674581+00:00` on Windows with this repository’s existing
development tools. Python commands use its isolated development environment. The documentation
source baseline remains the immutable revision above; these checks validate this documentation
integration locally.

| Command             | Observed result |
| ------------------- | --------------- |
| `pnpm validate:web` | Passed, exit 0. |

The independent publication audit also matched every copied Office file to its approved SHA-256,
checked ZIP package integrity and current page/tab approvals, compared immutable workflow/source
metadata, and resolved every local handbook/report link within the repository. Hosted PR/main,
browser, platform and container jobs remain separate required checks; they are not inferred from
these local results.

The unchanged full pnpm validate:web gate passed formatting, typed lint, all TypeScript
configurations, 41 coverage-gated gateway/HMI tests, all 7 actual filesystem-reader regressions,
production build, exact symbol index and repository policy. This documentation integration does not
rerun or replace the separate native/compiler and real-browser hosted lanes.
