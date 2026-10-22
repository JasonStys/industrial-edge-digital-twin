<!-- File: docs/reports/portfolio-sync-2026-10-22.md; Purpose: reviewed integration and validation trail by Jason Stys. -->

# Portfolio synchronization — 2026-10-22

By Jason Stys. Source baseline: `21347266b62f1d7158f73e23d2137a48bb0cef65`.

Reviewed original proposals:
[#11](https://github.com/JasonStys/industrial-edge-digital-twin/pull/11),
[#12](https://github.com/JasonStys/industrial-edge-digital-twin/pull/12). Their commit ancestry is
retained in a combined integration candidate; a normal merge is permitted only after that exact
candidate passes applicable native workflows. No branch protection, test threshold, security scan or
failing step is bypassed. Historical references and intentionally separate experiments are
preserved.

Dependency manifests are reconciled as the union of proposed dependency changes, not wholesale
replacement with an older branch. Overlapping locks are mechanically resolved with the registry
tools. Python package constraints and the actual installed CI/runtime locks are kept consistent;
Vitest/coverage providers and CodeQL steps are coordinated. Runtime/data directories are not
included in Git.

Validation is commit-specific: use this repository's
[Actions](https://github.com/JasonStys/industrial-edge-digital-twin/actions) and integration PR
checks. This record describes the reviewed work, not a claim that a future revision has already
passed. Default-branch checks are verified again after merge. Private full audit and Actions backups
stay on the owner's PC, outside public source.
