# Repository reader race correction

By Jason Stys. Reviewed source baseline: 254c367fd01ea3e1b5367610e29a3bd5c9ee5e2a.

## Actual full main observation

The first push-main
[CodeQL run 42766207534](https://github.com/JasonStys/industrial-edge-digital-twin/actions/runs/42766207534)
completed successfully, but its JavaScript/TypeScript security-extended analysis reported
[alert 1](https://github.com/JasonStys/industrial-edge-digital-twin/security/code-scanning/1),
`js/file-system-race` (CWE-367, security severity high) at `scripts/check-repository.mjs:114`. The
earlier PR scans used GitHub's diff-informed result filtering and did not establish a clean full
baseline. This finding was not suppressed, dismissed or excluded.

The main analysis used CodeQL 2.27.4 and evaluated 95 C/C++ rules, 103 JavaScript/TypeScript rules
and 23 Actions rules. Actual extraction reported 12/12 C++ files, 20/20 TypeScript files, 5/5
JavaScript files,1/1 HTML file and2/2 Actions files. The other two categories had zero reported
results; the JavaScript/TypeScript category had one. A green job means that analysis completed, not
that findings are absent.

## Cause and correction

The original guard called `stat(file)`, skipped files larger than 2,000,000 bytes, then called
`readFile(file)`. Replacing the pathname or growing its file between those operations could change
what was read or defeat the intended read budget. Its error catch returned empty text, which could
also hide an unsuccessful inspection.

`scripts/repository-reader.mjs` now opens once, inspects that descriptor, performs positional reads
from that descriptor into a buffer of at most limit+1 bytes, and always closes it. The extra byte
detects growth beyond the inclusive budget. Large files remain intentionally unscanned by this
particular naming check; all other repository checks retain their behavior. Real I/O failures stop
validation. No runtime application or dependency changed.

## Regression evidence and publication boundary

Seven independent Node tests cover real file replacement, interleaved same-file growth after
descriptor metadata inspection, exact byte and multibyte boundaries, short reads, missing or
nonregular inputs, actual read failure and invalid budgets. They run in both existing Node CI lanes
as `pnpm test:repository` and in the full local validation command. Existing native, 41 gateway/HMI
tests, coverage floors, browser journeys, audit and lint gates remain required.

Observed locally on Windows with Node 24.18.1: all seven new Node tests passed, with zero skips. The
complete `pnpm validate:web` command passed formatting, lint, strict types, all 41 existing
gateway/HMI tests, the new reader suite, production builds, exact source maps and repository policy.
Existing runtime coverage remained 88.54% lines and 90.15% branches. The configured MSVC build and
CTest passed; direct native execution reported all 15 named cases passed. All 20 actual
desktop/mobile browser journeys passed against the real owned gateway/C++ engine in 23.6 seconds,
including accessibility, trace downloads, faults and command boundaries. Actionlint accepted both
workflows. The complete unchanged dependency graph audit reported no known vulnerabilities; no
dependency or ignore was changed.

The initial sandboxed browser health probe was denied despite the child announcing its owned URL;
the unchanged suite passed with scoped loopback permission. The initial dependency audit could not
resolve its registry in the sandbox and was stopped, then passed with scoped network access. Neither
unavailable attempt was counted as passing, and no OS/browser protection was weakened.

The first repair PR scan also identified three pathname-based operations in the new race-test
fixture itself. These fixtures now create the replacement with exclusive `wx` semantics, append and
inspect growth through the same real descriptor, and create a separate exclusive interrupted-read
file. The tests still exercise actual rename/growth/error interleavings; an independent `EEXIST`
assertion proves replacement creation cannot clobber an existing file. No fixture path or scanner
rule is excluded from analysis.

The first-main alert above remains a real historical observation. Only a new exact-main full scan
after merge can establish automatic closure; a PR check or this source change alone cannot claim
that it has been resolved. No release asset is replaced by this source-only correction.

## Limits

Descriptor identity prevents pathname replacement from redirecting this read; bounded reads prevent
post-inspection growth from exhausting the intended byte budget. Concurrent edits to the same open
file can still produce mixed-time bytes. This validator is not a transactional filesystem snapshot,
no-symlink sandbox, production host scanner or proof of no vulnerabilities.
