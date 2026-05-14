# CHANGES — v3 Workstream 3.5.4: ReadiumCSS via npm

Published as: `3.0.0-alpha.23`
Branch: `feature/v3-readiumcss-npm` (based on `v3`)
Closes: *no issue filed*

## At a glance

R2D2BC used to ship ReadiumCSS as a manually-copied snapshot under `viewer/readium-css-v2/` — base files at one upstream version, RTL and CJK-vertical variants at a lower one, upstream itself had moved on. The snapshot had drifted.

This workstream replaces the snapshot with [`@readium/css`](https://www.npmjs.com/package/@readium/css) from npm. Upstream catches up via `npm update`; the manifest of "which files came from which commit at which version" goes away; integrators consuming the published package get the same dependency surface.

The local DITA patch overlay (`ReadiumCSS-dita-patch.css` + `cjk-vertical/ReadiumCSS-dita-patch.css`) stays where it is, owned in-tree. Upstream files are served from `node_modules/@readium/css/css/dist/` in this repo's demo viewers; integrators in production are free to copy, mount, or CDN-load the same files however they prefer.

v1 (`viewer/readium-css/`) is not touched — Readium does not publish v1 on npm.

---

## Summary of changes

### Dependency

- `@readium/css` is now declared in `package.json` `dependencies` (not devDependencies — integrators consuming the published library opt into the same path).

### Upstream files no longer in-tree

Removed from `viewer/readium-css-v2/`:

- `ReadiumCSS-before.css`, `ReadiumCSS-default.css`, `ReadiumCSS-after.css`, `ReadiumCSS-ebpaj_fonts_patch.css`
- `rtl/{ReadiumCSS-before,ReadiumCSS-default,ReadiumCSS-after}.css` (whole dir gone)
- `cjk-horizontal/{ReadiumCSS-before,ReadiumCSS-default,ReadiumCSS-after}.css` (whole dir gone)
- `cjk-vertical/{ReadiumCSS-before,ReadiumCSS-default,ReadiumCSS-after}.css`
- `LICENSE` (upstream Apache 2.0 — travels with the npm package now)

What remains is patch-overlay-only:

- `viewer/readium-css-v2/ReadiumCSS-dita-patch.css` (LTR / RTL / cjk-horizontal patches)
- `viewer/readium-css-v2/cjk-vertical/ReadiumCSS-dita-patch.css` (cjk-vertical patches)
- `viewer/readium-css-v2/README.md` (rewritten to reflect new shape)

### Upstream drift picked up by this workstream

- ~3.4 KB per `-before.css` of language-specific font stacks (ja / zh / ko / he / hi / th / ta / te / si / pa / or / ml / lo / kn / km / iu / hy + Japanese vertical variants).
- `-after.css`: upstream switched `hyphens` / `line-height` / `word-spacing` from `inherit` to `var(...) !important` — user typography preferences now beat publisher CSS where they previously cascaded with publisher rules.
- `rtl/ReadiumCSS-after.css`: upstream removed a `:first-letter` selector.

### Validator script

`scripts/check-readium-css-vars.ts` now reads upstream CSS from `node_modules/@readium/css/css/dist/` (replacing the in-tree v2 paths). It still reads `viewer/readium-css/` for v1 (frozen) and `viewer/readium-css-v2/` for the local patch overlay. `npm run lint:css-vars` continues to pass against the new layout.

### Files we do not wire (deferred — placeholders on roadmap)

- **`webPub/ReadiumCSS-webPub.css`** — ships under `node_modules/@readium/css/css/dist/webPub/` since this workstream. Carries text-align + hyphens rules for the WebPub profile, including `experimentalHeaderFiltering-on` aware selectors. Our viewers serve EPUB content; wiring WebPub CSS into EPUB viewers would apply rules meant for a different content profile. Placeholder on roadmap as **3.X.2 — WebPub navigator (generic WebPub support)**.
- **`vars/*.json`** — 6 machine-readable variable manifests under `node_modules/@readium/css/css/vars/`. Originally scoped as a replacement for the validator's grep-based variable discovery, but inspection showed these are mode-aware settings manifests (disabled/added settings per script mode; pagination defaults; fontStacks; i18n; colors; experiments), not a canonical CSS-variable-name list. Useful for a different kind of validation than the current "is every TS write consumed" check. Available for future use; no roadmap slot yet.

---

## Demo viewer changes

- **12 viewer HTML files** had their ReadiumCSS injectables repointed:
  - `viewer/index_api.html`, `index_epub_file.html`, `index_sampleread.html`, `index_dita_v2.html`, `index_minimal.html`, `index_injectables.html`, `index_small_window.html`, `demo_config_demo.html`, `demo_config_hide.html`, `demo_config_cloudlibrary.html`, `demo_config_clusive.html` — base path swapped from `/viewer/readium-css-v2/...` to `/node_modules/@readium/css/css/dist/...`. Patch URLs (`/viewer/readium-css-v2/ReadiumCSS-dita-patch.css`, `/viewer/readium-css-v2/cjk-vertical/ReadiumCSS-dita-patch.css`) unchanged.
- **`viewer/index_dita_v2_cdn.html` removed.** The CDN-specific demo viewer is redundant once the canonical npm path is wired: integrators wanting CDN derive the URL pattern (e.g. `https://unpkg.com/@readium/css@<version>/css/dist/...`) from the standard viewer themselves. One v2 viewer (`viewer/index_dita_v2.html`), not two.
- **`examples/server.ts`** — added `/node_modules` static mount so the dev landing-page demos can resolve `/node_modules/@readium/css/css/dist/...` URLs from the served HTML. Reader-list entries renamed: "DITA Reader (ReadiumCSS v2 local)" → "DITA Reader (ReadiumCSS v2)"; "DITA Reader (ReadiumCSS v2 CDN)" entries removed.

---

## Framework examples

Each Parcel-based example bundle (`vue`, `react`, `nextjs`, `remix`) was rewired:

- Upstream `url:` imports repoint from `url:../../viewer/readium-css-v2/<file>.css` to `url:../../node_modules/@readium/css/css/dist/<file>.css`.
- Patch `url:` imports stay at `url:../../viewer/readium-css-v2/ReadiumCSS-dita-patch.css` (the patches live in-tree).

Angular's runtime-served assets are different — the example uses `angular.json` `assets` mappings, not Parcel imports. `examples/angular/reader.component.ts` now references seven `/node_modules/@readium/css/css/dist/...` runtime paths (the patch stays at `/assets/readium-css-v2/ReadiumCSS-dita-patch.css`).

The vanilla example's express dev server (`examples/vanilla/serve.ts`) mounts `node_modules/@readium/css/css/dist/` alongside the existing `viewer/readium-css-v2/` mount; `examples/vanilla/index.html` splits `cssBase` and `patchBase` so upstream CSS resolves to the npm path while the patch resolves locally.

All per-framework READMEs (`examples/{vue,react,angular,nextjs,remix}/README.md` and `examples/README.md`) now document the npm-based approach: `npm install @readium/css`, then copy / mount / serve files from `node_modules/@readium/css/css/dist/`.

---

## Migration

This section is scoped to **alpha.22 → alpha.23**. Integrators upgrading from **2.5.x → 3.x** were never on `viewer/readium-css-v2/...` URLs (that path is internal to the v3 alpha series). If you're still on the v1 ReadiumCSS cascade from 2.5.x, `viewer/readium-css/` (v1.1.0 snapshot) is untouched here and continues to work — Readium does not publish v1 on npm. The decision to migrate from v1 cascade → v2 cascade is the separate **3.5.2 (`CHANGES-v3-readiumcss-v2.md`)** workstream, not this one.

### Dev viewers in this repo

No action — viewers are wired against `/node_modules/@readium/css/css/dist/...` already. Anyone running the dev server gets it for free after `npm install`.

### Integrators with their own viewer

If you forked one of the demo viewer HTMLs (or wrote your own) and pointed `injectables` URLs at `/viewer/readium-css-v2/<upstream>.css`, those URLs break on `npm update` to alpha.23 — the upstream files are no longer in that directory. Repoint to either:

- **node_modules path** (if your dev server serves `/node_modules/`):
  ```js
  injectables: [
    { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-before.css",  r2before:  true },
    { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-default.css", r2default: true },
    { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-after.css",   r2after:   true },
    // patches stay local
    { type: "style", url: "/viewer/readium-css-v2/ReadiumCSS-dita-patch.css" },
  ],
  ```
- **copy step** (production):
  ```bash
  cp -r node_modules/@readium/css/css/dist /path/to/public/readium-css-v2
  cp node_modules/@d-i-t-a/reader/viewer/readium-css-v2/ReadiumCSS-dita-patch.css /path/to/public/readium-css-v2/
  ```
  then point `injectables` URLs at `/readium-css-v2/...`.
- **CDN**:
  ```js
  injectables: [
    { type: "style", url: "https://unpkg.com/@readium/css@<version>/css/dist/ReadiumCSS-before.css",  r2before:  true },
    // ...
  ],
  ```

### Behavior changes (no API change, but rendering may shift)

Adopting current upstream picks up the accumulated changes since the lowest version that was in the old snapshot:

- **User-preference upgrades to `!important`** — `--USER__hyphens`, `--USER__lineHeight`, `--USER__wordSpacing` now win over publisher CSS unconditionally (they previously inherited / could be overridden by publisher rules). Books that depended on publisher line-height / hyphens / word-spacing now respect the user's reader-pref instead. Surface this in your reader-pref UI if relevant.
- **Language-specific font stacks** — `-before.css` files now carry CJK / Hebrew / Hindi / Thai / Tamil / Telugu / Sinhala / Punjabi / Oriya / Malayalam / Lao / Kannada / Khmer / Inuktitut / Armenian font stacks plus Japanese vertical variants. Affects any book whose `lang` attribute matches one of these scripts.
- **RTL `:first-letter` removed** — upstream dropped a selector for the RTL `-after.css` file. Drop cap rendering on RTL books may differ.

### v1 untouched

Integrators on `viewer/readium-css/` (v1.1.0 snapshot) — no change. Readium does not publish v1 on npm, so the local snapshot stays in-tree.
