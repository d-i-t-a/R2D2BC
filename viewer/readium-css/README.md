# ReadiumCSS v1 demo bundle

These files are **demo assets only**. DITA Toolkit does not ship ReadiumCSS as part of the npm package — integrators supply their own ReadiumCSS via the injectables system. This bundle exists so that `viewer/index_dita.html` and the other v1 demo viewers have a working local copy to load.

> **v1 is legacy.** New integrations should target the [v2 bundle](../readium-css-v2/). v1 is retained for integrators who haven't migrated yet.

## Contents

| File | Upstream source | Upstream version | Upstream commit | Copied on |
|---|---|---|---|---|
| `ReadiumCSS-before.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v.1.1.1 | `0728ade3893ba9c07ae6cd64798e5ded7b37d777` | 2026-04-19 |
| `ReadiumCSS-default.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v.1.1.1 | `0728ade3893ba9c07ae6cd64798e5ded7b37d777` | 2026-04-19 |
| `ReadiumCSS-after.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v.1.1.1 | `0728ade3893ba9c07ae6cd64798e5ded7b37d777` | 2026-04-19 |
| `ReadiumCSS-ebpaj_fonts_patch.css` | [readium/css](https://github.com/readium/css) `css/dist/` | v.1.1.1 | `0728ade3893ba9c07ae6cd64798e5ded7b37d777` | 2026-04-19 |
| `ReadiumCSS-dita-patch.css` | (local — not from upstream) | n/a | n/a | 2026-04-19 |
| `LICENSE` | [readium/css](https://github.com/readium/css) | — | — | — |

All upstream files are **pristine** — byte-identical to upstream at the recorded commit. No inline modifications. All DITA Toolkit customizations live in `ReadiumCSS-dita-patch.css`, which is injected as a separate layer after the upstream cascade.

> **Note:** The version strings inside upstream file headers read `(v. 1.1.0)` because the Readium v.1.1.1 release did not bump the in-file version comments. The files are genuinely at the v.1.1.1 commit SHA recorded above.

## ReadiumCSS-dita-patch.css

Thin override layer carrying three long-standing DITA Toolkit customizations:

1. **Image / media no-stretch** — stock Readium sets `width: auto; height: auto` on `img/svg/video`, which lets the browser stretch publisher images to fill the layout box in paginated column layouts. The patch restores intrinsic-size behavior while respecting `max-width` / `max-height`.
2. **Line-height compensation formula** — stock `line-height: var(--USER__lineHeight)` doesn't account for font metrics (ex-height, ch-width) or base font-size differences. The patch factors these in and applies `--RS__lineHeightCompensation` for CJK / Indic scripts that need 15–20% more leading.
3. **Scroll-mode and single-column vertical page gutters** — upstream v1.1.x does not apply a vertical gutter in scroll mode or in single-column paginated layout. The patch adds a page-gutter-sized top/bottom margin in those two modes so the reading area has vertical breathing room matching the horizontal gutter.

Injection order for integrators (last wins):
1. `ReadiumCSS-before.css`
2. `ReadiumCSS-default.css`
3. `ReadiumCSS-after.css`
4. `ReadiumCSS-dita-patch.css` — must be last

The [v2 bundle](../readium-css-v2/) carries the first two patches; the third (vertical gutters) is v1-specific because upstream v2 dropped the scroll-mode vertical-gutter behavior.

## Optional: EBPAJ fonts patch

`ReadiumCSS-ebpaj_fonts_patch.css` is a font-fallback polyfill for Japanese books published using the EBPAJ template. EBPAJ's default stylesheet only references Windows font names (MS Gothic, MS Mincho); this patch adds Hiragino (macOS/iOS) and Android-side Japanese font fallbacks.

Upstream Readium docs recommend loading it **conditionally** — only when the book's OPF package declares EBPAJ metadata:

- v1: `<dc:description id="ebpaj-guide">ebpaj-guide-1.0</dc:description>`
- v1.1: `<meta property="ebpaj:guide-version">1.1</meta>`

DITA Toolkit does not auto-detect this metadata. Integrators serving EBPAJ-template Japanese books can inject this file manually via the injectables system when appropriate.

## Upgrade procedure

1. Find the current upstream v1.x release at https://github.com/readium/css/releases
2. Fetch each file from `https://raw.githubusercontent.com/readium/css/<tag>/css/dist/<path>` (note the Readium tag format uses `v.` dot prefix, e.g. `v.1.1.1`)
3. Drop into this directory, overwriting
4. Diff against the previous version to spot upstream behavior changes worth folding into `ReadiumCSS-dita-patch.css`
5. Update the version / commit SHA / copy date columns in the manifest above
