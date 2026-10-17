# Security Policy

## Supported versions

Security fixes are applied to the current supported release line. Use the
latest stable versions of Circulo and its dependencies. Older releases may not
receive security updates.

## Report a vulnerability

Please do not report security vulnerabilities in public issues or pull
requests. Use GitHub's private vulnerability reporting for this repository:

[Report a vulnerability](https://github.com/circulo-ai/circulo/security/advisories/new)

If private reporting is unavailable, contact the maintainers through the
[Circulo website](https://circulo-ai.com) and ask for a private reporting
channel before sending technical details. Include affected versions, impact,
and reproducible steps when it is safe to do so. Do not include real user data,
credentials, or production secrets.

Maintainers will acknowledge reports, assess the impact, coordinate a fix, and
publish an advisory when appropriate. Please allow time to investigate and
coordinate disclosure before making the report public.

## Dependency updates

Dependency security updates are handled through the repository lockfile and
GitHub Actions. A green build does not mean every transitive dependency is
free of known vulnerabilities; review security workflow findings and update
affected packages promptly.
