# Security Policy

## Supported versions

| Version | Status |
|---|---|
| `3.0.0-beta.x` and later | Actively maintained |
| `3.0.0-alpha.x` | Superseded by beta; please upgrade |
| `2.5.x` | Maintenance fixes only |
| `2.4.x` and earlier | End of life — no updates |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for vulnerabilities. Instead, report privately via one of:

- **GitHub Security Advisory** — recommended. Open <https://github.com/d-i-t-a/R2D2BC/security/advisories/new> to file a private report. Only repository maintainers will see it.
- **Email** — send details to <aferdita.muriqi@gmail.com> with the subject prefix `[security] DITA Toolkit`.

### What to include

- A description of the issue and the impact you observed.
- Steps to reproduce (a minimal repository, code snippet, or URL is ideal).
- Affected version(s) of `@d-i-t-a/reader`.
- Any suggested mitigation if you've identified one.

### What to expect

- **Acknowledgement** within 5 business days.
- **Triage and assessment** within 14 days — we'll confirm severity and timeline.
- **Coordinated disclosure** — once a fix is available, we'll publish a GitHub Security Advisory crediting the reporter (unless you prefer to remain anonymous) and release a patched version on npm.

## Scope

In-scope for this policy:

- The published `@d-i-t-a/reader` npm package.
- Demo viewers and examples in the repository (`viewer/`, `examples/`).
- Build outputs in `dist/`.

Out of scope:

- Vulnerabilities in third-party dependencies (please report those to the upstream project — we monitor advisories via Dependabot).
- Integrator-side wrapping code (your own application's handling of content, storage, or authentication).
- Issues that require physical access or compromised credentials on the user's device.
