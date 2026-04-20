# ReadiumCSS v2 demo bundle

These files are **demo assets only**. R2D2BC does not ship ReadiumCSS as part of the npm package — integrators supply their own ReadiumCSS via the injectables system. This bundle exists so that `viewer/index_dita_v2.html` and the library examples have a working local copy to load.

## Contents

| File | Upstream source | Upstream version | Upstream commit | Copied on |
|---|---|---|---|---|
| `ReadiumCSS-before.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `ReadiumCSS-default.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `ReadiumCSS-after.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `ReadiumCSS-ebpaj_fonts_patch.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `cjk-horizontal/ReadiumCSS-before.css` | [readium/css](https://github.com/readium/css) `css/dist/cjk-horizontal/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `cjk-horizontal/ReadiumCSS-default.css` | [readium/css](https://github.com/readium/css) `css/dist/cjk-horizontal/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `cjk-horizontal/ReadiumCSS-after.css` | [readium/css](https://github.com/readium/css) `css/dist/cjk-horizontal/` | v2.0.1 | `a6d74efe4f7285bca3841c72f81afbf248c97fdc` | 2026-04-19 |
| `ReadiumCSS-dita-patch.css` | (local — not from upstream) | n/a | n/a | 2026-04-19 |
| `LICENSE` | [readium/css](https://github.com/readium/css) | — | — | — |

All upstream files are **pristine** — byte-identical to upstream at the recorded commit. No inline modifications. Any customizations live in `ReadiumCSS-dita-patch.css`, which is injected as a separate layer after the upstream cascade.

## Why files are bundled locally

The upstream npm package `@readium/css@2.0.x` (served via unpkg / jsdelivr) ships only the **4 base files** (`before` / `default` / `after` / `ebpaj_fonts_patch`). The language-variant stylesheets (`cjk-horizontal/`, `cjk-vertical/`, `rtl/`) exist only in the `readium/css` GitHub repo under `css/dist/<variant>/` subdirectories.

If Readium publishes these variants to their npm package, integrators can switch to CDN and we can drop the local copies.

## ReadiumCSS-dita-patch.css

Thin override layer carrying two long-standing customizations:

1. **Image / media no-stretch** — stock Readium sets `width: auto; height: auto` on `img/svg/video`, which lets the browser stretch publisher images to fill the layout box in paginated column layouts. The patch restores intrinsic-size behavior while respecting `max-width` / `max-height`.
2. **Line-height compensation formula** — stock `line-height: var(--USER__lineHeight)` doesn't account for font metrics (ex-height, ch-width) or base font-size differences. The patch factors these in and applies `--RS__lineHeightCompensation` for CJK / Indic scripts that need 15–20% more leading.

Injection order for integrators (last wins):
1. `ReadiumCSS-before.css`
2. `ReadiumCSS-default.css`
3. `ReadiumCSS-after.css`
4. `ReadiumCSS-dita-patch.css` — must be last

The patch file is compatible with both v1.1.x and v2.0.x upstream cascades.

## CJK-horizontal injection (conditional)

The `cjk-horizontal/` subdirectory ships separate `before.css` / `default.css` / `after.css` with CJK-appropriate defaults (no word-spacing, CJK font stacks, different line-break rules). Integrators use the injectables `when` predicate to swap base for CJK when the publication is Chinese / Japanese / Korean:

```ts
const CJK_LANG_RE = /^(ja|zh|ko)(\b|-)/i;
const isCJK = (pub) => {
  const langs = pub?.metadata?.languages;
  return Array.isArray(langs) && langs.some((l) => CJK_LANG_RE.test(l ?? ""));
};

const injectables = [
  // Base — non-CJK only
  { type: "style", url: "/readium-css-v2/ReadiumCSS-before.css", r2before: true,
    when: (ctx) => !isCJK(ctx.publication) },
  { type: "style", url: "/readium-css-v2/ReadiumCSS-default.css", r2default: true,
    when: (ctx) => !isCJK(ctx.publication) },
  { type: "style", url: "/readium-css-v2/ReadiumCSS-after.css", r2after: true,
    when: (ctx) => !isCJK(ctx.publication) },
  // CJK-horizontal — CJK only
  { type: "style", url: "/readium-css-v2/cjk-horizontal/ReadiumCSS-before.css", r2before: true,
    when: (ctx) => isCJK(ctx.publication) },
  { type: "style", url: "/readium-css-v2/cjk-horizontal/ReadiumCSS-default.css", r2default: true,
    when: (ctx) => isCJK(ctx.publication) },
  { type: "style", url: "/readium-css-v2/cjk-horizontal/ReadiumCSS-after.css", r2after: true,
    when: (ctx) => isCJK(ctx.publication) },
  // dita-patch always
  { type: "style", url: "/readium-css-v2/ReadiumCSS-dita-patch.css" },
];
```

Worked example lives at `viewer/index_dita_v2.html`.

**Not available via unpkg:** the CJK (and CJK-vertical, RTL) variants exist only in the `readium/css` GitHub repo, not in the `@readium/css@2.0.x` npm package. Integrators using the CDN route for base files must bundle CJK locally or source from `raw.githubusercontent.com`.

## Optional: EBPAJ fonts patch

`ReadiumCSS-ebpaj_fonts_patch.css` is a font-fallback polyfill for Japanese books published using the EBPAJ template. EBPAJ's default stylesheet only references Windows font names (MS Gothic, MS Mincho); this patch adds Hiragino (macOS/iOS) and Android-side Japanese font fallbacks.

Upstream Readium docs recommend loading it **conditionally** — only when the book's OPF package declares EBPAJ metadata:

- v1: `<dc:description id="ebpaj-guide">ebpaj-guide-1.0</dc:description>`
- v1.1: `<meta property="ebpaj:guide-version">1.1</meta>`

R2D2BC does not auto-detect this metadata. Integrators serving EBPAJ-template Japanese books can inject this file manually via the injectables system when appropriate.

## Upgrade procedure

1. Find the current upstream release at https://github.com/readium/css/releases
2. Fetch each file from `https://raw.githubusercontent.com/readium/css/<tag>/css/dist/<path>`
3. Drop into this directory, overwriting
4. Update the version / commit SHA / copy date columns in the manifest above
5. Diff the old vs new to spot upstream behavior changes worth flagging
