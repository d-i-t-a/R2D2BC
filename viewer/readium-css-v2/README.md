# ReadiumCSS v2 — local patch overlay

This directory holds DITA Toolkit's **local DITA patch overlay** for ReadiumCSS v2. Upstream ReadiumCSS itself is no longer bundled here — since `3.0.0-alpha.23` the library consumes [`@readium/css`](https://www.npmjs.com/package/@readium/css) from npm. The patch files in this directory layer on top of upstream and are loaded last in the injectables chain.

## Contents

| File | Purpose |
|---|---|
| `ReadiumCSS-dita-patch.css` | DITA overrides for LTR / RTL / cjk-horizontal script modes |
| `cjk-vertical/ReadiumCSS-dita-patch.css` | DITA overrides specific to cjk-vertical (Japanese tategaki) |

The two patch files carry two long-standing customizations:

1. **Image / media no-stretch** — stock Readium sets `width: auto; height: auto` on `img / svg / video`, which lets the browser stretch publisher images to fill the layout box in paginated column layouts. The patch restores intrinsic-size behavior while respecting `max-width` / `max-height`.
2. **Line-height compensation formula** — stock `line-height: var(--USER__lineHeight)` doesn't account for font metrics (ex-height, ch-width) or base font-size differences. The patch factors these in and applies `--RS__lineHeightCompensation` for CJK / Indic scripts that need 15–20% more leading.

The patch file is compatible with the upstream v2.0.x cascade.

## Upstream source

`@readium/css` is declared in the library's `package.json` `dependencies` (see there for the pinned range). The base / RTL / cjk-horizontal / cjk-vertical files all live under `node_modules/@readium/css/css/dist/`:

```
node_modules/@readium/css/css/dist/
├── ReadiumCSS-before.css
├── ReadiumCSS-default.css
├── ReadiumCSS-after.css
├── ReadiumCSS-ebpaj_fonts_patch.css
├── rtl/
│   ├── ReadiumCSS-before.css
│   ├── ReadiumCSS-default.css
│   └── ReadiumCSS-after.css
├── cjk-horizontal/
│   ├── ReadiumCSS-before.css
│   ├── ReadiumCSS-default.css
│   └── ReadiumCSS-after.css
└── cjk-vertical/
    ├── ReadiumCSS-before.css
    ├── ReadiumCSS-default.css
    └── ReadiumCSS-after.css
```

This repo's demo viewers serve those files via the dev server's `/node_modules/@readium/css/css/dist/...` static mount. Integrators in production are free to copy, mount, or CDN-load the same files however they prefer (see `examples/*/README.md`).

## Injection order (last wins)

For LTR / RTL / cjk-horizontal publications:

1. `node_modules/@readium/css/css/dist/[rtl/|cjk-horizontal/]ReadiumCSS-before.css`
2. `node_modules/@readium/css/css/dist/[rtl/|cjk-horizontal/]ReadiumCSS-default.css`
3. `node_modules/@readium/css/css/dist/[rtl/|cjk-horizontal/]ReadiumCSS-after.css`
4. `viewer/readium-css-v2/ReadiumCSS-dita-patch.css` — must be last

For cjk-vertical publications, swap the patch on step 4 to `viewer/readium-css-v2/cjk-vertical/ReadiumCSS-dita-patch.css`.

A worked example covering all four script modes lives at `viewer/index_dita_v2.html`.

## Upgrading upstream

`npm update @readium/css` (or bump the version in `package.json`). Run `npm run lint:css-vars` afterward to confirm every CSS custom property DITA Toolkit writes is still consumed by the new upstream. Then run the manual test pass across LTR / RTL / CJK / iPadOS / DITA patches before releasing.

## Upgrading the patch overlay

These two files are owned here, not upstream. Edit in place. After changes, run `npm run lint:css-vars` to confirm no new TS-side writes are now orphaned. The patch must keep loading last in the cascade — otherwise upstream `!important` rules will win over patches.
