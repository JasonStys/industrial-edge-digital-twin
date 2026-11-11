# Windows simulation application

The 1.1.0 Windows candidate packages the real C++20 heated-tank engine, typed Fastify gateway,
existing HMI and Electron 44.11.0 into one portable application folder. Open
`IndustrialEdgeDigitalTwin.exe`; a browser IDE, Node, compiler and Docker are not required. Keep all
companion files with the executable. The application is currently unsigned; local packaged tests are
separate from publication, OS installation and desktop-shortcut acceptance.

## A complete first workflow

1. Read **Durable simulation workspace** and **Application → First-use help**. The application
   starts a new stopped synthetic plant and owns its private loopback gateway and C++ child. Native
   command access is managed in memory; no shared default password is supplied.
2. Set tank targets, such as 420L and 55°C, and apply them through the normal HMI. Select automatic
   mode. Start a recording and inject an out-of-range level sensor using the existing fault
   controls. Inspect real simulated quality, alarms, actual/requested outputs and controller state;
   no equipment is connected.
3. Stop the recording, review a sample and confirm that live controls are disabled during review.
   Navigate or play the retained samples, inspect the trend/quality transition and export the same
   validated JSON trace. Imports still use the original bounded trace parser.
4. Choose **Save current targets** and **Save reviewed recording**. Target settings and one at-most
   2MiB/1,200-sample trace persist separately in the OS user profile. Recording is not automatically
   saved, and saved traces remain unauthenticated simulated review evidence.
5. Quit through **Application → Quit application**, the window's close button, or the app's **Quit
   application** control. The owned service and engine close before the application exits.
6. Reopen: target settings are restored, but plant mode starts **stopped** with a fresh simulated
   state and no injected faults. **Load saved recording** restores a read-only review without
   replaying commands. Return to live before sending new commands.

## Data, trust and recovery

Electron's Windows user-data directory is normally `%APPDATA%/industrial-edge-digital-twin`,
separate from application files and Git. The app stores `targets.json` and `review-trace.json`;
Electron also maintains its normal local cache. These are OS-user protected local files, not
application-encrypted cloud accounts. Back up a closed profile. If saved files are malformed,
startup refuses them and preserves their bytes rather than silently resetting configuration. Restore
a reviewed closed-profile backup or retain a copy for manual recovery. The regular-file reader
bounds actual bytes, refuses links, checks descriptor identity and strict UTF-8. Saves use random
exclusive staging, flush and atomic replacement.

The native window has sandboxing/context isolation enabled and Node integration disabled. Its main
process attaches per-launch credentials only to the exact owned port-zero loopback origin.
Host/Origin/session checks protect native/API requests; unexpected remote resources, popups and
permissions are refused. Only the explicit author/contact links may open their fixed HTTPS
destination in an external browser after navigation. No MQTT broker or live device is enabled by
this native composition. The existing developer gateway retains its separately documented reference
behavior; it should not be exposed as a production identity boundary.

Native requests are limited to120 per minute. Saved-trace reads have a separate30-per-minute quota;
writes allow12 per minute. Exceeding a quota returns429/Retry-After before file access, and the UI
asks the user to wait without changing saved data. Counters are per process/IP and reset at launch;
they are resource bounds for this single-user app, not distributed abuse prevention.

This educational model is not a safety controller, calibrated physical twin or authorization to
connect real equipment. A saved target is not a saved live-controller state. A schema-valid trace is
not an authenticated measurement. Software already running as the same OS user and administrators
remain trusted. No automatic update, remote control or telemetry upload is added.

## Build and validation

Build-only tools are MSVC/CMake/Ninja and Node 24 with locked pnpm dependencies. Run
`pwsh -NoProfile -File scripts/build-native.ps1 -Output release/windows`; the script preserves
existing outputs, builds the kernel with the static MSVC runtime and runs CTest before packaging.
The output embeds the exact Git source identity and honest dirty-state flag in
`resources/SOURCE.json`.

`node scripts/native-acceptance.mjs release/windows/win-unpacked/IndustrialEdgeDigitalTwin.exe artifacts/native/windows`
tests the actual packaged sandboxed visible window, native C++ commands/faults, recording and
invalid-input preservation, private session/Origin refusals, durable targets, stopped restart,
read-only saved trace recovery and actual process exit. It uses an explicit disposable profile,
never a normal application account or device connection. See the
[observed native validation](reports/native-application-2026-11-10.md).
