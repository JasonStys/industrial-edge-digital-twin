# Security policy

## Supported version

Security fixes are applied to the latest release and the default branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature. Do not open a public issue containing
an exploit, token, broker credential, private process trace, or deployment address.

Include the affected commit, boundary, reproduction, impact, and proposed mitigation if known. You
should receive an acknowledgement within five business days.

## Scope

In scope: command authorization bypass, schema/parser escape, injection, unbounded resource growth,
secret disclosure, dependency/build integrity, unsafe default network exposure, and faults that are
silently presented as normal state.

The repository is an educational simulator. Physical-equipment safety certification, real device
behavior, and shared-deployment identity infrastructure are explicitly outside its claims.
