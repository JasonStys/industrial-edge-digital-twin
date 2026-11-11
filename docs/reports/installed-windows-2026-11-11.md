# Installed Windows application validation · 11 November 2026

By Jason Stys. This report records actual published **1.1.0** installed bytes from
`b93914513ccf751eab2a2c0f7a5aa8225d9fe336`. Earlier Office editions retain their historical
baselines and bytes.

## Observed results

Actual installed Electron/C++ control, fault and trace workflows passed; four samples and 420 L / 55
°C targets persisted with the engine stopped on restart.

All required main workflows for the runtime revision passed; processed CodeQL analyses reported zero
open main alerts before release.

All 2 assets matched provider/checksum identities; all 79 installed files remained unchanged during
acceptance.

New per-user version folder and individual links verified. Synthetic profiles only; existing data
and Docker were not used or changed.

## Illustrated user workflow and implementation

The [four-page guide](windows-application-guide-1.1.0.docx) contains two actual
installed-application screenshots, a worked user journey, important immutable-source code excerpts,
validation observations and practical limits. Every final page content was individually inspected
and the OOXML schema passed. The [review manifest](windows-application-guide-1.1.0.json) binds the
Word, screenshot, source and rendered-page identities. Prepared examples are inputs to the full
application, never separate demo apps.

## Installation, data and limits

Keep the complete extracted ZIP together and launch IndustrialEdgeDigitalTwin.exe. No system runtime
or terminal setup is needed.

Open the verified Desktop icon. Help describes supported inputs and workflow limits; close through
the app's owner controls and back up its external data directory after a normal exit.

Unsigned Windows portable folder; no signed installer or cross-OS native acceptance. This is an
educational synthetic plant, with no hardware or MQTT connection and no production safety or control
authorization.

Prepared inputs and acceptance used synthetic data only; normal profiles were not opened and Docker
was unchanged. Local plaintext is trusted-OS-owner data, not protection against that OS user or
administrator.

Desktop and Start-menu link targets were verified. The full installed-executable acceptance is
distinct from normal shortcut activation; no additional manual shortcut-button test is claimed.
Existing accounts and Docker were unchanged. This documentation revision must pass its own complete
hosted checks; earlier runtime results do not certify future source changes.
