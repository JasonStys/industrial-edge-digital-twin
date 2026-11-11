# Native CI artifact retention — 10 November 2026

By Jason Stys. The native job still builds and exercises the actual Windows HMI, bundled gateway and
C++ kernel, including trace validation and durable restart. Successful pushes and pull requests
retain bounded synthetic acceptance receipts/screenshots for one day instead of uploading the
complete unpacked app.

The trusted-main manual workflow has a default-off `retain-package` input for a maintainer who needs
a short-lived tested unsigned package. Public distributions belong in reviewed Releases. No existing
run, artifact or cache is deleted. The application, native test, coverage gates and security
analyses are unchanged.
