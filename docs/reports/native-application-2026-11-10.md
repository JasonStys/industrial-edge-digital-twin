# Native application candidate — 10 November 2026

The 1.1.0 candidate is based on `555db0f4d156aba45684e63694123a5088e84872` and currently records
`sourceDirty:true`. It packages the existing C++/gateway/HMI implementation with durable targets and
a saved read-only trace workflow. No public release, OS installation, desktop shortcut or real-user
data migration is claimed by this local record.

| Check                            | Observed result                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static MSVC C++ build            | Existing CTest suite passed 1/1, with Release build and static MSVC runtime; engine model/algorithm behavior remains the original implementation.                                                                                                                                                                                    |
| Gateway/HMI/native adapter tests | 51 tests passed, including ten new real-file/native-adapter cases. Original coverage scope: 88.62% lines,88.50% statements,90.15% branches,92.06% functions; native composition tests are additional and not included in that core coverage denominator.                                                                             |
| Original browser journeys        | 20 desktop/mobile Chromium tests passed with zero retries, including real engine faults, trace review/import/export, keyboard navigation, overflow and automated accessibility checks.                                                                                                                                               |
| Actual native candidate          | Electron 44.11.0, a real visible sandboxed packaged window, context isolation and disabled Node integration; actual C++ engine accepted 420L/55°C targets, automatic mode and out-of-range sensor fault.                                                                                                                             |
| Saved review and restart         | Trace contained the actual fault, malformed UI/API imports preserved its bytes, saved targets survived restart, plant restarted stopped without injected faults, saved trace reopened read-only and live control could be explicitly restored. Both application launches and their actual supervised C++ child PIDs exited normally. |
| Dependency audit                 | The current locked Node/Electron graph reported no known vulnerabilities at the local audit time. This is advisory evidence, not a guarantee of absence.                                                                                                                                                                             |

An initial browser assertion used `toBeDisabled` on a fieldset, although the browser had the
expected `disabled` attribute. The acceptance now checks a real command input's effective disabled
state, including the state after loading a saved trace. It did not weaken the app. Restricted-shell
download failures were diagnosed as missing network access; the identical build ran with scoped
normal-user network access. No tests were silently retried to pass.

The new Windows build workflow runs real source/native checks and preserves short-lived artifacts.
Its hosted status remains pending until the reviewed source is pushed by the coordinator. No Docker
or hardware test was performed on this PC. The visible Electron window and actual app UI were
tested; a clean-machine installer, signer trust and desktop-icon click are separate deployment
acceptance steps.

## Hosted finding follow-up

The first draft's hosted CodeQL scan reported three new high findings: a pre-open filesystem-check
pattern and missing rate limits on saved-trace reads/writes. The file reader now opens first with
no-follow/nonblocking flags where available, validates its actual regular single-link descriptor,
then checks the current pathname before any bounded read. Independent fixtures replace a real
pathname after opening and grow a real file after metadata validation; both are refused without
unbounded reading or changing the files.

The official Fastify rate limiter enforces actual request and file-route quotas. Real adapter tests
accept exactly12 writes and30 reads per minute, refuse the next request with429 and a bounded
Retry-After, keep the two quotas independent and preserve the exact saved bytes. The actual packaged
UI also reaches the write limit, explains the refusal and retains its trace. No CodeQL rule was
disabled, excluded or dismissed. Exact corrected-head hosted analysis is still required before
merge; a passing local regression is not a claim of zero hosted alerts.
