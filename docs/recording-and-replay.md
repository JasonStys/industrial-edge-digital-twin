# Record and review a simulated process campaign

Created by Jason Stys. This workflow makes historical evidence useful without confusing it with
current command authority. It is a local educational simulator, with no physical-device control,
shared-user identity or certified process model.

## Operator: capture a frozen sensor

1. Launch the normal simulator and wait for valid live telemetry. Enter the local command token if
   you intend to command the simulated process. Read-only capture/review does not need the token.
2. Select **Start new recording** before changing mode or injecting a fault. This explicitly
   replaces the prior in-memory capture; export any earlier recording first.
3. Select Automatic and inject Freeze level sensor. Observe quality becoming stale, the controller
   fault, safe-state alarms and requested/actual outputs. Stop recording after the state of
   interest.
4. Select **Review recording**. Scrub **Recorded sample** or play at five samples per wall-clock
   second. The header shows retained sample position, original simulation seconds and sequence.
   Playback advances recorded samples; it does not rerun or rewind the engine.
5. Choose plant level, measured level, measured temperature or actual pump trend. Horizontal spacing
   follows simulation seconds rather than assuming uniformly spaced arrivals. The caption gives the
   exact displayed time range and sample count. Fixed axis scales retain stated units; out-of-scale
   data is clipped visually while the exact value and quality remain available.
6. Read observed mode, fault, alarm and quality-transition markers. A sequence gap means intervening
   states were not retained; it is not proof of packet loss or a fault cause. Time/sequence resets
   are explicit discontinuities. A plot never connects through a simulation-time reset.
7. Select **Return to live** before commanding. Review disables the command fieldset and the command
   handler independently refuses historical-view submissions. Existing server bearer validation
   remains mandatory. The live simulator/SSE stream continues independently of review.

If no valid live sample has ever arrived, returning to live hides historical readings and explicitly
waits for telemetry. A prior recorded value is never relabeled as live. Network failures while
commanding remain an unknown outcome: verify actual live state before retrying; no success or
automatic retry is invented.

## Analyst: keep and reopen evidence

**Export recording** downloads compact version-1 JSON: all validated snapshots, the capacity and the
exact number of earlier samples evicted during capture. Mode, faults, quality, timestamps, targets,
requested outputs and actual outputs remain synchronized in each snapshot. Token and account
settings are not part of the snapshot schema and cannot enter this export. Compact output shares the
2 MiB import budget, including full-capacity high-precision numeric-boundary cases.

Import a JSON file to open read-only review without sending it to the server. Imports are marked
**imported, not authenticated**: schema validity is not provenance, a hardware measurement or a
digital signature. Transition descriptions are recomputed from supplied values rather than trusting
arbitrary labels. A wrong version, wrong scope, unknown field, invalid UTF-8, malformed sample,
empty/oversized capture or non-finite value is rejected with a persistent error. The previous
recording and current live state remain. A delayed import cannot overwrite a newer capture or a
later return-to-live action. Import is unavailable during recording.

## Bounds, privacy and interpretation

- Live trend history retains 90 samples. Capture uses an O(1) circular buffer of 1,200 distinct
  snapshots; oldest samples are evicted with a count. Duration depends on actual sample timing.
- Export/import accepts at most 2 MiB and 1,200 snapshots. Original inputs must match the fixed
  simulated heated-tank contract; this is not an arbitrary archive or external telemetry parser.
- Capture exists in page memory only. It is not automatically persisted, uploaded or recovered after
  closing the page. Export explicitly to retain it. Playback timers and the owned stream stop when
  leaving the page.
- Very large/tiny readouts use scientific notation to preserve readable layout. Displayed numbers
  are formatted approximations; JSON retains the original numeric values.
- Imported contradictions remain review data. Schema validation does not establish physical
  consistency, identify root causes, certify safety or authenticate a source.
- The gateway remains loopback by default. A shared deployment still needs real identity, roles, TLS
  and engineering review; the local command token is not tenant isolation.

Browser tests use an owned, non-reused listener. Set `TWIN_E2E_PORT` to an unused port when 8080 is
occupied; the runner refuses occupied ports before any HTTP probe and reaps only its own process.
`TWIN_BROWSER_CHANNEL=msedge` selects an existing local Chromium-family browser for developer
testing; hosted CI uses its installed Playwright Chromium. No user service is killed or reused.

See [testing](testing.md), [complexity](big-o.md) and
[observed validation](reports/practical-workflows-2026-11-09.md).
