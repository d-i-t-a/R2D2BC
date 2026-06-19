# Contributing to DITA Toolkit

Thank you for your interest in contributing to DITA Toolkit (formerly R2D2BC). This guide covers the development environment, the branching model, code style, testing, and how to submit a pull request. If you find something incorrect or missing, please open an issue or PR.

## Community

Before making significant contributions, please open a discussion or an issue on GitHub so we can align on direction. For small fixes (typos, dead links, minor bugs) a direct PR is fine.

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs / requesting features

Open an issue at [github.com/d-i-t-a/R2D2BC/issues](https://github.com/d-i-t-a/R2D2BC/issues/new). Include:

- A clear description of the problem or feature request.
- Steps to reproduce (for bugs) or a use case (for features).
- The version of `@d-i-t-a/reader` you're using.
- Browser / OS where the issue reproduces.
- A minimal reproduction (CodeSandbox / repo link) where possible.

For **security vulnerabilities**, do not open a public issue — see [SECURITY.md](SECURITY.md) for the private disclosure process.

## Development environment

### Prerequisites

- **Node.js 20+** (see `package.json` `engines` field).
- **npm 10+** (bundled with Node 20).
- Modern browser for testing (Chrome 109+ / Firefox 115+ / Safari 16+ / Edge 109+).

### Setup

```bash
# 1. Fork on GitHub, then clone your fork
git clone git@github.com:<your-username>/R2D2BC.git
cd R2D2BC

# 2. Add the upstream remote
git remote add upstream git@github.com:d-i-t-a/R2D2BC.git

# 3. Install dependencies
npm install

# 4. Build the library
npm run build

# 5. Start the demo viewer + examples server
npm run examples
# → opens http://localhost:4444/
```

### Useful scripts

| Command | Purpose |
|---|---|
| `npm run build` | Full production build (TypeScript → `dist/`, SCSS → `dist/`, asset copy). |
| `npm run dev` | Build + watch + serve the DITA demo viewer on `:4444`. |
| `npm run examples` | Streamer landing page on `:4444` listing all local EPUBs + viewers. |
| `npm run example:react` / `:vue` / `:angular` / `:nextjs` / `:remix` | Framework integration examples (Parcel, port 1234). |
| `npm run example:vanilla` | Vanilla JS reader (port 3000). |
| `npm run example:pdf` | Standalone PDF viewer (port 3001). |
| `npm run test` | Run vitest test suite. |
| `npm run lint` | TypeScript + eslint checks. |
| `npm run lint:css-vars` | Validate every TS-side ReadiumCSS custom-property write is consumed by upstream CSS or in the documented allow-list. |
| `npm run typecheck` | `tsc --noEmit` only. |

## Branching model

DITA Toolkit uses two long-lived branches:

- **`develop`** — the integration branch for v2.x stable maintenance and v2.x-only changes. Default branch on GitHub today.
- **`v3`** — the active integration branch for v3 work (currently in alpha / beta). All v3 workstreams branch from `v3` and merge back to `v3`.

Branch your work from whichever target your change applies to:

| Type of change | Branch from |
|---|---|
| v2.5.x bug fix | `develop` |
| v3 feature / fix / refactor | `v3` |
| Documentation that applies to both | usually `v3` (cherry-pick to `develop` if relevant) |

### Branch naming

Use forward slashes (not backslashes):

- `feature/<short-name>` — new features
- `fix/<short-name>` — bug fixes
- `refactor/<short-name>` — non-behavioral cleanup
- `docs/<short-name>` — documentation-only changes
- `chore/<short-name>` — build / dependencies / tooling
- `feature/v3-<workstream-name>` — v3 workstream branches (e.g. `feature/v3-audiobook`)

## Code style

- **TypeScript strict mode** is enforced across new v3 code. Run `npm run typecheck` before pushing.
- **eslint + prettier** — `npm run lint` must pass. Most projects use the format-on-save settings in `.vscode/settings.json` (provided in repo).
- **No `any` casts** in new code without a comment explaining why. The fetcher chain and module registry exist specifically to remove `any` from the codebase.
- **No `instanceof` for navigator-type dispatch** — use the typed `Navigator.supports(feature)` capability query.
- **Imports** — prefer named imports; use the package's public entry (`@d-i-t-a/reader`) inside examples, internal paths inside `src/`.
- **JSDoc** on public API and on anything non-obvious.

## Tests

- Tests live under `test/` and use [vitest](https://vitest.dev/).
- New code should land with tests where practical. The current suite covers model classes (`Locator`, `Link`, `Publication`), `LocalAnnotator`, `MemoryStore`, `ReadiumCSS`, and `CitationModule`.
- Run `npm run test` locally before pushing.
- Integration tests of viewer behaviour are run manually for now — the test plan in each `docs/v3/CHANGES-v3-*.md` workstream doc captures the manual test surface.

## Commits

- Use **imperative present tense** in commit subjects: "fix: handle null locator in goToElement" not "fixed handling of null locator".
- Prefix the subject with a [conventional-commits](https://www.conventionalcommits.org/) type when possible:
  - `feat:` new feature
  - `fix:` bug fix
  - `refactor:` non-behavioural change
  - `docs:` documentation only
  - `chore:` build / deps / tooling
  - `test:` test-only changes
- Keep the subject under 72 characters; wrap the body at ~80.
- One logical change per commit. Multi-purpose commits make review and revert harder.
- Reference issues / PRs in the body when relevant (`Closes #1234`, `Refs #5678`).

## Pull requests

1. **Sync with upstream first** — `git fetch upstream && git rebase upstream/<target-branch>`.
2. **Run the full check locally** — `npm run lint && npm run typecheck && npm run test && npm run lint:css-vars`.
3. **Push to your fork** — `git push origin <branch>`.
4. **Open the PR** against the right base branch (`develop` or `v3` — see the branching model above).
5. **Fill out the PR template** — title, summary, test plan, screenshots (UI changes only).
6. **Keep the PR focused** — split large changes into a series. Easier to review, lower bar to land.

After opening:

- A maintainer will review. Address feedback as new commits (don't force-push during review unless asked).
- Once approved, a maintainer will merge. Squash-merge is the default for small PRs; merge-commit for multi-commit workstreams.

## What's good to work on

- Issues labelled [`good first issue`](https://github.com/d-i-t-a/R2D2BC/issues?q=is%3Aopen+label%3A%22good+first+issue%22) — narrow scope, well-defined.
- Issues labelled [`help wanted`](https://github.com/d-i-t-a/R2D2BC/issues?q=is%3Aopen+label%3A%22help+wanted%22) — broader contributions welcome.
- v3 workstream-tagged issues — see the [v3 roadmap](docs/v3/) for the active surface.
- Documentation gaps — see the per-framework READMEs under `examples/` for integrator-facing docs that can always be improved.

## License

By contributing to DITA Toolkit you agree that your contributions are licensed under the project's [Apache-2.0 license](LICENSE).
