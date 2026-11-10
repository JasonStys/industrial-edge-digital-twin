# Industrial Edge Digital Twin handbook

By Jason Stys.

Investigate a deterministic heated-tank process through a C++ engine, typed gateway and browser HMI.
Capture and replay synchronized signals, quality and actuator behavior while keeping historical
review read-only and separate from live synthetic state.

Capture and replay synchronized signals, requested/actual outputs, quality, faults and alarms;
import/export bounded traces and scrub time-aligned trends with commands blocked in review.

Creates a practical simulated-process investigation workflow with recorded and live state clearly
distinguished.

## Read the documentation

| Edition                                                      | Audience and contents                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [project-guide.docx](reports/project-guide.docx)             | User and developer guide: purpose, current usage, design, boundaries and source references.                        |
| [validation-review.docx](reports/validation-review.docx)     | Reviewer edition: exact tested baseline, observed workflows, dated local results and remaining limits.             |
| [validation-evidence.xlsx](reports/validation-evidence.xlsx) | Two filterable Excel Tables for observed workflows and test-source inventory, with recalculating outcome formulas. |

The editable Markdown remains the maintenance source. The Word files are readable editions. The
workbook is an evidence index rather than a test runner. See
[publication identities and review](reports/publications.json) and the
[documentation refresh record](reports/documentation-refresh-2026-11-09.md).

## Current usage and help

[README quick start](../README.md) is the entry point. Use the project-specific guides below before
changing inputs, operating modes or deployment assumptions.

### Usage and operations

- [operations](operations.md)

### Design and contracts

- [adr/0001 language boundaries](adr/0001-language-boundaries.md)
- [adr/0002 deterministic fixed step](adr/0002-deterministic-fixed-step.md)
- [adr/0003 latest value mqtt](adr/0003-latest-value-mqtt.md)
- [api and mqtt](api-and-mqtt.md)
- [architecture](architecture.md)
- [plant model](plant-model.md)

### Security and validation

- [safety and security](safety-and-security.md)
- [testing](testing.md)

## Historical results and reproduction

The reviewed source is
[`b1562a941fd809b9dd58fcee1fec55081e327f9d`](https://github.com/JasonStys/industrial-edge-digital-twin/tree/b1562a941fd809b9dd58fcee1fec55081e327f9d).
The observed functional workflow baseline is `b1562a941fd809b9dd58fcee1fec55081e327f9d`; those
observations are recorded at `2026-11-10T06:42:18.583808+00:00`. They do not certify an unrun later
revision.

- [Detailed recorded validation](reports/practical-workflows-2026-11-09.md)
- [Current Actions](https://github.com/JasonStys/industrial-edge-digital-twin/actions) records later
  integration checks separately.
- Preserve dated measurements and follow the existing testing guide to reproduce them; a test-source
  inventory alone does not establish execution.

## Practical boundaries

- Local simulated plant, not physical control or a certified process model.
- Trace capture is bounded page memory with explicit export, not a durable authenticated historian.
- Imported schema-valid traces do not establish provenance or physical consistency; review mode
  blocks commands rather than controlling equipment.

## Maintaining these editions

Update the editable usage/design/test documents first. Rebuild and visually review every Word page
and workbook tab before replacing an edition; verify the exact binary digests and evidence source in
publications.json. Keep account data, logs with secrets, installed-app state and private test stores
out of documentation. Source and release assets retain their existing security and licensing
boundaries.
