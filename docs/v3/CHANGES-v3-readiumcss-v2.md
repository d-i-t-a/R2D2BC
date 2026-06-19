# CHANGES — v3 Workstream 3.5: ReadiumCSS v2.0 + CSS Overhaul

Published as: `3.0.0-alpha.17`
Branch: `feature/v3-readiumcss-v2` (based on `feature/v3-fetcher`)
Closes: [#641](https://github.com/d-i-t-a/R2D2BC/issues/641)

## At a glance

DITA Toolkit now understands ReadiumCSS **v1.1.x AND v2.0.x** simultaneously. An integrator can inject either version (or switch between them) without changing their TypeScript config — UserSettings writes both v1 and v2 CSS custom properties on the iframe's `<html>` element, and the active stylesheet picks up what it understands.

DITA Toolkit itself never bundles ReadiumCSS — the files in `viewer/readium-css-v2/` are demo assets only. Integrators continue to supply their own ReadiumCSS via the injectables system.

Three demo viewers now ship:
- `viewer/index_dita.html` — ReadiumCSS v1.1.0 baseline (reader shell updated for `dita-` class prefix)
- `viewer/index_dita_v2.html` — ReadiumCSS v2.0.1 served locally + our patch layer
- `viewer/index_dita_v2_cdn.html` — ReadiumCSS v2.0.1 from unpkg CDN + our patch layer

---

## Summary of changes

### New TypeScript settings (v2-only, silently no-op on v1)

```typescript
interface InitialUserSettings {
  // ...existing fields...

  // Body max-width — direct override for the value derived from pageMargins.
  lineLength?: string                          // e.g. "70%", "40rem"

  // Variable font axes (requires the font to expose the axis).
  fontWeight?: number                          // 100..900, default 400
  fontWidth?: number                           // 50..200 (font-stretch %)
  fontOpticalSizing?: boolean                  // true → "auto", false → "none"

  // Typography
  ligatures?: "none" | "common-ligatures"

  // v2 theme colours (paired with existing backgroundColor / textColor).
  linkColor?: string                           // CSS colour
  visitedColor?: string
  selectionBackgroundColor?: string
  selectionTextColor?: string

  // Image filters. Boolean toggles the v2 flag; number (0..1) sets the
  // filter amount directly.
  blendImages?: boolean                        // boolean only
  darkenImages?: boolean | number              // true or 0..1
  invertImages?: boolean | number              // true or 0..1
  invertGaiji?: boolean | number               // true or 0..1 (gaiji images only)

  // Scroll-view padding (replaces v1 pageGutter in scroll mode).
  scrollPaddingTop?: string
  scrollPaddingBottom?: string
  scrollPaddingLeft?: string
  scrollPaddingRight?: string
}
```

### Appearance auto-wires image filters per theme

v1 ReadiumCSS implicitly applies `mix-blend-mode: multiply` to all images in Sepia so they blend with the warm background. v2 does not; DITA Toolkit now drives `blendImages` from the preset to match.

| Theme | Auto-applied filters |
|---|---|
| Day | all off |
| Sepia | `blendImages: true` |
| Night | all off |

v1 does NOT auto-invert images in Night mode (except gaiji and titlepage images, which v1 handles via its own CSS rules). Regular images keep their original colours in Night. Integrators who want night-mode image inversion (old convention using `readium-darken-on` / `readium-invert-on` alongside `readium-night-on`) must set `darkenImages` / `invertImages` explicitly.

Integrator explicit filter values (set via `applyUserSettings`) always override the preset.

### Appearance color presets match v1 exactly

When v2 is the active stylesheet, `appearance: "day" / "sepia" / "night"` now writes individual colour CSS vars to match v1's visual output pixel-perfect:

- Day: `#ffffff` background / `#121212` text (or: publisher CSS flows through when unchanged)
- Sepia: `#faf4e8` / `#121212` / `#0000EE` link / `#551A8B` visited
- Night: `#000000` / `#fefefe` / `#63caff` link / `#0099E5` visited
- Selection: `#b4d8fe` background in all themes

Day mode **removes** colour vars so publisher CSS flows through — v2's `:root[style*="--USER__textColor"] *:not(a) { color: inherit }` rule otherwise wipes publisher heading colours.

### Auto column count resolves to 1–4 based on viewport

v2 ReadiumCSS removed the responsive-column media queries that v1 shipped. UserSettings now resolves `columnCount: "auto"` in JavaScript based on viewport width:

| Viewport width | Columns |
|---|---|
| < 600px | 1 |
| 600–1199px | 2 |
| 1200–1799px | 3 |
| ≥ 1800px | 4 |

A debounced window-resize listener re-applies on viewport change so columns respond live.

### `pageMargins` bug fix

`UserSettings.increase("pageMargins")` and `.decrease("pageMargins")` previously silently no-op'd — there was no case in the switch despite `pageMargins` being registered as Incremental with min/max/step. Now works. The `UserSettingsIncrementable` union was also missing `"pageMargins"` — added.

### Page-refresh odd-column spacer fix

On first visit to the last page of a chapter, the odd column sat on the left (correct). On refresh, it jumped to the right because `goToProgression` ran before the odd-column spacer was injected. Spacer is now injected before position restoration in both the initial-load and per-locator navigation paths.

### `pageMargins` → `lineLength` mapping

When v2 is the active stylesheet, `pageMargins` (v1 semantics, 0.5..4) is translated to `lineLength` percent via:

```
lineLength = 100 - (pageMargins - 0.5) * 20
```

| pageMargins | lineLength |
|---|---|
| 0.5 | 100% |
| 2 (default) | 70% |
| 4 | 30% |

Integrators can override directly with `lineLength: "40rem"` or similar.

### `fontFamily: "Original"` now removes the CSS var

v2 has a rule `:root[style*="--USER__fontFamily"] * { font-family: revert !important }` that wipes publisher fonts on all descendants whenever the var is present. When the user picks the Publisher font (`fontFamily: 0 / "Original"`), we now call `removeProperty()` instead of setting the value to the literal `"Original"`. Publisher fonts flow through as expected.

### CSS class prefix — `dita-` on reader shell

14 selectors renamed to avoid framework collisions (see Migration section):

| Old | New |
|---|---|
| `#viewer` | `#dita-viewer` |
| `.info` | `.dita-info` |
| `.error` | `.dita-error` |
| `.loading` | `.dita-loading` |
| `.active` | `.dita-active` |
| `.inactive` | `.dita-inactive` |
| `.pagination` | `.dita-pagination` |
| `.thumb` | `.dita-thumb` |
| `.timeline` | `.dita-timeline` |
| `.collection` | `.dita-collection` |
| `.collapsible-header` | `.dita-collapsible-header` |
| `.color-option` | `.dita-color-option` |
| `.logo-container` | `.dita-logo-container` |
| `.search-wrapper` | `.dita-search-wrapper` |

Distinctive classes (`.bookmarks-view`, `.range-slider`, `.grab-to-pan-*`, `.highlight-toolbox`, `.sidenav-*`) are kept as-is — they don't collide and renaming them is just churn.

### Dita patch CSS layer

`viewer/readium-css-v2/ReadiumCSS-dita-patch.css` — thin override stylesheet injected **after** Readium's `ReadiumCSS-after.css` to fix two long-standing issues without editing Readium's files:

1. **Image no-stretch** — reverts stock `width: auto; height: auto` on `img/svg/video` so publisher images display at their intrinsic size (capped by `max-width`/`max-height`).
2. **Line-height compensation formula** — replaces stock `line-height: var(--USER__lineHeight)` with a calc that accounts for font metrics and `--RS__lineHeightCompensation` for CJK/Indic scripts.

Works with ReadiumCSS v1.1.x and v2.0.x.

### v1 bundle restructure — pristine upstream + separate patch layer

`viewer/readium-css/` (the v1 bundle) previously carried two inline modifications baked into the upstream files — image no-stretch in `before.css` and the line-height compensation in `after.css`. That pattern required re-applying the patches on every upstream upgrade and was fragile.

The v1 bundle now matches v2's architecture:
- `ReadiumCSS-before.css`, `-default.css`, `-after.css` — pristine at upstream v.1.1.1 (commit `0728ade3893ba9c07ae6cd64798e5ded7b37d777`)
- `ReadiumCSS-dita-patch.css` — thin override carrying the customizations (image no-stretch, line-height compensation, and v1-only scroll/single-column vertical page gutter rules that v2 upstream dropped natively)

Integrators copying v1 files into their project must now **also copy and inject `ReadiumCSS-dita-patch.css`** — see the migration note under *Migration guide for integrators* below.

### Provenance READMEs

Both bundles now carry a `README.md` manifest — file-by-file upstream URL, upstream version, commit SHA, and copy date. Adds a consistent upgrade procedure so the next Readium release can be pulled in cleanly and drift can be spotted at a glance.

### CJK-horizontal stylesheet bundling + conditional loading

`viewer/readium-css-v2/cjk-horizontal/` — pristine CJK-horizontal variant stylesheets at upstream v2.0.1 (Chinese, Japanese, Korean horizontal-writing typography defaults: no word-spacing, CJK font stacks, different line-break rules). Not available via unpkg — fetched from the `readium/css` GitHub repo.

Loading uses the `Injectable.when` predicate shipped in alpha.16 (workstream 3.4). No navigator code changes. When the publication's `metadata.languages` contains a CJK language (`ja`, `zh`, or `ko`, optionally region-tagged), the CJK-horizontal variant loads instead of the base. Worked examples live in `viewer/index_dita_v2.html`, `viewer/index_epub_file.html`, and the framework examples (`examples/react`, `examples/nextjs`, `examples/remix`, `examples/angular`, `examples/vue`).

CJK-vertical and RTL are separate workstreams (not in this release).

### Examples consolidation — single ReadiumCSS source of truth

`examples/react/readium-css/` (previously a duplicate of `viewer/readium-css/` with its own inline patches) removed. All framework examples now import from `viewer/readium-css-v2/` via Parcel `url:` imports, eliminating two parallel bundles that had drifted apart.

### iPadOS patch wiring (automatic)

DITA Toolkit now detects iPadOS at runtime (legacy iPad UA + iPadOS 13+ Macintosh-reporting path via `navigator.maxTouchPoints > 1`) and sets `--readium-iPadOSPatch-on` on the iframe `<html>` element. The v2 `:root[style*="readium-iPadOSPatch-on"]` rules then disable Safari's `-webkit-text-size-adjust` and `-webkit-text-zoom` so they don't compound with v2's `zoom`-based font sizing. No integrator code changes.

Files: `src/utils/BrowserUtilities.ts` (new `isIPadOS()` helper), `src/model/user-settings/UserSettings.ts` (toggle in `applyProperties()`).

### CSS variable validator

`scripts/check-readium-css-vars.ts` + `npm run lint:css-vars`. Cross-checks every `--USER__*` / `--RS__*` custom property written from `src/model/user-settings/ReadiumCSS.ts` against the bundled v1 + v2 CSS to catch silent drift after upstream syncs. Documents seven known dual-applicator writes (v1-compat substring matches) in an allow-list; orphaned writes outside the allow-list fail the check. Exits 0 today.

### Demo fixes

- `viewer/index_epub_file.html` — fetch spinner overlay shown during URL load and file-drop parsing, replacing the empty-viewport state that made long loads look broken.

### Not included in this release

The CJK-vertical + horizontal-RTL stylesheet bundling and per-language injection wiring are parked pending the navigator multi-mode refactor. This release supports CJK-horizontal but not vertical-rl or RTL-horizontal content at the navigator layer.

---

## Breaking changes

This workstream covers both DITA Toolkit changes and ReadiumCSS v2 support. There are two independent sets of breaking changes — read both.

### 1. DITA Toolkit changes

Apply to every integrator upgrading to v3, regardless of which ReadiumCSS version they inject.

#### 1a. CSS class rename (action required)

14 CSS selectors on the reader shell got a `dita-` prefix to avoid collisions with generic class names commonly found in integrator codebases. **Any integrator custom CSS or JS that targeted the old bare class names must be updated.**

| Old | New |
|---|---|
| `#viewer` | `#dita-viewer` |
| `.info` | `.dita-info` |
| `.error` | `.dita-error` |
| `.loading` | `.dita-loading` |
| `.active` | `.dita-active` |
| `.inactive` | `.dita-inactive` |
| `.pagination` | `.dita-pagination` |
| `.thumb` | `.dita-thumb` |
| `.timeline` | `.dita-timeline` |
| `.collection` | `.dita-collection` |
| `.collapsible-header` | `.dita-collapsible-header` |
| `.color-option` | `.dita-color-option` |
| `.logo-container` | `.dita-logo-container` |
| `.search-wrapper` | `.dita-search-wrapper` |

See *Migration guide → 1. CSS class rename* below for find-and-replace instructions.

#### 1b. Behaviour changes (no API break, but different result)

- **`pageMargins.increase()` / `decrease()` now works.** Previously silently no-op'd.
- **Odd-column page refresh now lands on the left column** (matching first-visit behaviour). Fixed the spacer-injection order on position restore.

#### 1c. What stays the same

- **All existing v2.5 TypeScript settings keep the same names and semantics.** `fontSize`, `fontFamily`, `appearance`, `pageMargins`, `lineHeight`, `wordSpacing`, `letterSpacing`, `textAlignment`, `columnCount`, `direction`, `bodyHyphens`, `paraSpacing`, `paraIndent`, `typeScale`, `backgroundColor`, `textColor`, `verticalScroll`, `fontOverride` — unchanged.
- **New v2-only settings are purely additive.** Silently no-op on v1 CSS.
- **v2 ReadiumCSS support is opt-in.** Integrators who keep injecting v1.1.x see no change in rendering. Section 2 below only applies if you choose to swap CSS versions.

---

### 2. ReadiumCSS v1 → v2 changes

Apply **only** if the integrator changes their injected ReadiumCSS files from v1.1.x to v2.0.x. These are Readium's changes, not DITA Toolkit's — they apply to any reader library using ReadiumCSS.

#### 2a. Handled automatically by DITA Toolkit (no action needed)

- **Default `lineLength` is `100%`** (v1 was `40rem`). Without `pageMargins`, text fills the viewport in v2. DITA Toolkit writes both `--USER__pageMargins` and `--USER__lineLength` using a translation formula, so the default `pageMargins: 2` gives comfortable line length on v2.
- **Responsive columns removed from v2 CSS.** DITA Toolkit resolves `columnCount: "auto"` in JavaScript with a debounced resize listener — v1 auto-column behaviour is preserved and extended (1–4 columns based on viewport width).
- **`--USER__appearance` flag does not exist in v2.** DITA Toolkit writes individual v2 colour vars (`--USER__backgroundColor`, `--USER__textColor`, `--USER__linkColor`, `--USER__visitedColor`, `--USER__selectionBackgroundColor`, `--USER__selectionTextColor`) with values matching v1's built-in palette.
- **`advancedSettings` and `fontOverride` flags are removed.** v2 applies these settings directly. DITA Toolkit still writes the v1 flags (harmless on v2).
- **Image blending in Sepia.** v1 implicitly set `mix-blend-mode: multiply` on images in Sepia so they blend with the warm background. v2 doesn't. DITA Toolkit auto-wires `blendImages: true` from the Sepia preset to match v1.
- **`fontFamily: "Original"` now removes the CSS var** instead of setting it, to avoid v2's `* { font-family: revert !important }` rule that wipes publisher fonts.
- **iPadOS font-size patch flag.** v2's `zoom`-based font-sizing compounds with Safari's native `text-size-adjust` / `text-zoom` on iPad, producing double-scaled text. DITA Toolkit now detects iPadOS (legacy iPad UA plus iPadOS 13+ that reports as Macintosh with `maxTouchPoints > 1`) and sets the `readium-iPadOSPatch-on` flag on the iframe `<html>` element automatically. v2 ReadiumCSS rules gated on the flag then neutralise Safari's scalers.

#### 2b. Integrator-facing (action required)

- **`typeScale` is removed in v2.** DITA Toolkit still writes `--USER__typeScale` for v1 compatibility; v2 ignores it. Remove the control from your UI if you've moved to v2-only. Integrators who exposed a type-scale slider should either drop it, map it to `fontSize`, or keep it for v1 users only.
- **Fonts are no longer bundled.** AccessibleDfA, iA Writer Duospace, and Android FXL fonts are not in the v2 package. Host the font files yourself and register via `@font-face` in an injectable CSS:

  ```css
  @font-face {
    font-family: 'AccessibleDfA';
    src: url('/fonts/AccessibleDfA.woff2') format('woff2');
  }
  ```

- **Publisher heading colours get overridden by themes.** v2's `:root[style*="--USER__textColor"] *:not(a) { color: inherit !important }` wipes publisher-declared colours on all non-anchor elements. v1 excluded h1-h6 and pre. Accept this as v2 design, or add a custom override in your own CSS layer after ReadiumCSS.
- **Publisher fonts are fully overridden when `fontFamily` is set to a non-default.** v2's `:root[style*="--USER__fontFamily"] * { font-family: revert !important }` is more aggressive than v1. DITA Toolkit handles the "Publisher" default by removing the var; custom fonts override everything. Matches v2 design intent.

#### 2c. Third-party CSS risk (action required if affected)

Your own CSS that reads any of these v1-only things will silently stop matching:

- `@media` rules matching v1's column breakpoints
- Rules keyed on `--USER__advancedSettings`, `--USER__fontOverride`, `--USER__typeScale`, `--USER__pageMargins`
- Rules using v1's `--RS__pageGutter` in scroll mode (removed in v2, replaced by `--RS__scrollPaddingTop/Bottom/Left/Right`)

---

## Migration guide for integrators

### 1. CSS class rename (required)

If your application has **custom CSS** targeting the reader shell by bare class name, update to the `dita-` prefix.

**Find-and-replace in your stylesheets / Tailwind config / component CSS:**

```diff
- .info { ... }
+ .dita-info { ... }

- .error { ... }
+ .dita-error { ... }

- .loading { ... }
+ .dita-loading { ... }

- .active { ... }
+ .dita-active { ... }

- .inactive { ... }
+ .dita-inactive { ... }

- .pagination { ... }
+ .dita-pagination { ... }

- .thumb { ... }
+ .dita-thumb { ... }

- .timeline { ... }
+ .dita-timeline { ... }

- .collection { ... }
+ .dita-collection { ... }

- .collapsible-header { ... }
+ .dita-collapsible-header { ... }

- .color-option { ... }
+ .dita-color-option { ... }

- .logo-container { ... }
+ .dita-logo-container { ... }

- .search-wrapper { ... }
+ .dita-search-wrapper { ... }

- #viewer { ... }
+ #dita-viewer { ... }
```

If your JS queries these classes, rename the selectors too:

```diff
- document.querySelector(".info")
+ document.querySelector(".dita-info")

- el.classList.add("active")
+ el.classList.add("dita-active")
```

Classes NOT renamed (no action needed):
`#iframe-wrapper`, `#reader-info-bottom`, `.bookmarks-view`, `.contents-view`, `.highlights-view`, `.landmarks-view`, `.pageList-view`, `.settings-view`, `.range-slider`, `.range-slider__range`, `.grab-to-pan-grab`, `.grab-to-pan-grabbing`, `.highlight-toolbox`, `.sidenav`, `.sidenav-annotations`, `.sidenav-toc`, `.scrubber`, `.collection-item`, `.collection-header`

### 2. ReadiumCSS upgrade (optional but recommended)

If you want to move to ReadiumCSS v2.0.x (currently v2.0.1), change your injectables URLs from v1 to v2. The reader will adapt automatically — no TypeScript changes required.

**Before (v1.1.x):**

```javascript
injectables: [
  { type: "style", url: "/path/to/ReadiumCSS-before.css", r2before: true },
  { type: "style", url: "/path/to/ReadiumCSS-default.css", r2default: true },
  { type: "style", url: "/path/to/ReadiumCSS-after.css", r2after: true },
]
```

**After (v2.0.x, pristine from npm):**

```javascript
injectables: [
  { type: "style", url: "https://unpkg.com/@readium/css@2.0.1/css/dist/ReadiumCSS-before.css", r2before: true },
  { type: "style", url: "https://unpkg.com/@readium/css@2.0.1/css/dist/ReadiumCSS-default.css", r2default: true },
  { type: "style", url: "https://unpkg.com/@readium/css@2.0.1/css/dist/ReadiumCSS-after.css", r2after: true },
  // Optional Dita patch layer — fixes image stretching and line-height issues.
  // Must come AFTER the three Readium files so its rules take precedence.
  { type: "style", url: "/path/to/ReadiumCSS-dita-patch.css" },
]
```

Get the patch file from `viewer/readium-css-v2/ReadiumCSS-dita-patch.css` in this repository or mirror it in your own asset pipeline.

See *Breaking changes → 2. ReadiumCSS v1 → v2* above for the full list of things that change when you swap v1 for v2.

### 3. New TypeScript settings (optional)

Any v2-only capability you want to expose to end users can be passed through `applyUserSettings` — each silently no-ops if v1 is injected.

```javascript
await reader.applyUserSettings({
  // Explicit body width (overrides the pageMargins-derived value).
  lineLength: "70%",

  // Variable font axes — only affect text if the loaded font supports the axis.
  fontWeight: 600,
  fontWidth: 100,
  fontOpticalSizing: true,

  // Typography
  ligatures: "common-ligatures",

  // Theme colours — these override the appearance preset.
  linkColor: "#ff6600",
  visitedColor: "#aa0000",
  selectionBackgroundColor: "#ffeb3b",
  selectionTextColor: "#000000",

  // Image filters — wire to your appearance/theme logic.
  // Boolean: use v2 flag selectors (readium-*-on).
  // Number 0..1: set precise amount (brightness / invert percentage).
  blendImages: true,
  darkenImages: 0.6,
  invertImages: true,
  invertGaiji: 1,

  // Scroll-view padding (scroll mode only; replaces v1 pageGutter).
  scrollPaddingTop: "16px",
  scrollPaddingBottom: "16px",
  scrollPaddingLeft: "0",
  scrollPaddingRight: "0",
})
```

### 4. No other API changes

All existing v2.5 settings (`fontSize`, `fontFamily`, `appearance`, `verticalScroll`, `columnCount`, `pageMargins`, `lineHeight`, `wordSpacing`, `letterSpacing`, `textAlignment`, `direction`, `bodyHyphens`, `paraSpacing`, `paraIndent`, `typeScale`, `backgroundColor`, `textColor`) keep the same names and semantics.

### 5. If you copied our v1 ReadiumCSS bundle into your project (behavior change)

Integrators who copied files from `viewer/readium-css/` into their own `public/readium-css/` (or similar) will see a behavior change: the old v1 bundle carried the image-no-stretch and line-height-compensation patches **inline** in `ReadiumCSS-before.css` and `ReadiumCSS-after.css`. The restructured v1 bundle has pristine upstream files; the patches now live in a separate `ReadiumCSS-dita-patch.css` layer.

To keep the same behavior after the upgrade:

1. Re-copy the v1 bundle (or just the new file) into your project:
   ```bash
   cp -r viewer/readium-css public/readium-css
   ```
2. Add `ReadiumCSS-dita-patch.css` to your injectables **after** `ReadiumCSS-after.css`:
   ```ts
   { type: "style", url: "/readium-css/ReadiumCSS-before.css", r2before: true },
   { type: "style", url: "/readium-css/ReadiumCSS-default.css", r2default: true },
   { type: "style", url: "/readium-css/ReadiumCSS-after.css", r2after: true },
   { type: "style", url: "/readium-css/ReadiumCSS-dita-patch.css" },
   ```

Without the patch, images may stretch to fill the column (not just cap at max-width) and line-height will use the stock `var()` formula instead of the compensated calc. Neither is visually catastrophic, but the behavior differs from v2.5 and prior alphas.

### 6. CJK-horizontal integrators: conditional injectables

If your publications include Chinese, Japanese, or Korean content, use the `when` predicate to load the CJK-horizontal variant stylesheets instead of the base. Pattern:

```ts
const CJK_LANG_RE = /^(ja|zh|ko)(\b|-)/i;
const isCJK = (pub) => {
  const langs = pub?.metadata?.languages;
  return Array.isArray(langs) && langs.some((l) => CJK_LANG_RE.test(l ?? ""));
};

injectables: [
  { type: "style", url: "/readium-css-v2/ReadiumCSS-before.css", r2before: true,
    when: (ctx) => !isCJK(ctx.publication) },
  // ... (base default.css, after.css with same !isCJK guard)
  { type: "style", url: "/readium-css-v2/cjk-horizontal/ReadiumCSS-before.css", r2before: true,
    when: (ctx) => isCJK(ctx.publication) },
  // ... (cjk-horizontal default.css, after.css with same isCJK guard)
  { type: "style", url: "/readium-css-v2/ReadiumCSS-dita-patch.css" },
]
```

Bundle the CJK-horizontal files from `viewer/readium-css-v2/cjk-horizontal/` into your project the same way as the base files. **Not available on unpkg** — fetch from the `readium/css` GitHub repo if you don't want to bundle. See `viewer/readium-css-v2/README.md` for the full manifest and upgrade procedure.

---

## Testing guide

### How to run the demos locally

```bash
npm install
npm run build
npm run examples
```

Open [http://localhost:4444/viewer/index.html](http://localhost:4444/viewer/index.html) — the library lists your local EPUBs and PDFs. Each reflowable EPUB card exposes three viewer variants; fixed-layout EPUBs (FXL) show just the baseline DITA Toolkit.

### What each demo tests

| Demo | CSS injected | Purpose |
|---|---|---|
| DITA Toolkit (ReadiumCSS v1) | Local v1.1.0 files | Regression test: rendering should match v2.5 baseline; only class attribute renames (e.g. `.dita-active`) changed |
| DITA Toolkit (ReadiumCSS v2 local) | Local v2.0.1 files + our dita-patch.css | Primary v2 test, matches v1 visually |
| DITA Toolkit (ReadiumCSS v2 CDN) | unpkg @readium/css@2.0.1 + our dita-patch.css | Integrator pattern test — proves the patch layer works over pristine CDN files |

### Per-demo checklist

Open each viewer and verify:

**Common controls (all three demos):**
- [ ] Font size slider changes text size across the book
- [ ] Font family: "Publisher" — lets book's own font flow through (no override)
- [ ] Font family: Serif / Sans-serif / Open Dyslexic — overrides publisher font
- [ ] Day / Sepia / Night theming — visually identical across v1 and v2 (compare side-by-side)
- [ ] Scroll / Paginated toggle
- [ ] Columns Auto / 1 / 2 / 3 / 4
- [ ] Direction Auto / LTR / RTL (test with an RTL book if available)
- [ ] Text alignment Auto / Justify / Start
- [ ] Word spacing, Letter spacing, Page margins, Line height sliders
- [ ] Paragraph spacing, Paragraph indent sliders
- [ ] Hyphens toggle (test with paginated mode on a narrow column; long words should break with `-`)
- [ ] Background and Text colour pickers

**v2-only controls (v2 local + v2 CDN):**
- [ ] Line Length text input — enter `"50%"` or `"30rem"`, body narrows
- [ ] Ligatures toggle — when off, `fi` / `ffi` / `Tt` render as separate glyphs
- [ ] Link / Visited colour pickers — links in the book change colour
- [ ] Selection BG / Text colour pickers — select some text, selection colour changes
- [ ] Scroll padding (Top / Bottom / Left / Right) — switch to scroll mode, type `20px`, body shifts

**Auto-applied image filters (v2 demos):**
- [ ] Switch to Sepia — images blend with the warm background (mix-blend-mode: multiply)
- [ ] Switch to Night — images keep their original colours (matches v1 default)

**Regression fixes:**
- [ ] Refresh on last page of a chapter with odd-column layout — the final column stays on the **left**, matching a first-visit navigation
- [ ] `reader.increase("pageMargins")` (via API or a slider that maps to it) — actually changes the margin

**Responsive columns:**
- [ ] Set columns to Auto
- [ ] Resize the browser window slowly from narrow to wide — watch the column count switch from 1 to 2 to 3 to 4 as it crosses ~600, 1200, and 1800px thresholds

### CSS prefix regression check

Pick a demo and open DevTools in the iframe's parent document. Confirm:

- [ ] No elements with bare `class="info"`, `class="error"`, `class="loading"`, `class="active"`, etc. — all should be `dita-*`
- [ ] Settings panel active-state highlight works on segmented buttons (Day/Sepia/Night, column count, etc.) — classes applied via `classList.add("dita-active")`
- [ ] Loading spinner shows and hides (`.dita-loading`)
- [ ] Error state shows if you navigate to a bad URL (`.dita-error`)

### CDN demo verification

Open the v2 CDN demo (`index_dita_v2_cdn.html`) with DevTools Network tab:

- [ ] Three CSS files fetched from `unpkg.com/@readium/css@2.0.1/css/dist/` with 200 status
- [ ] `ReadiumCSS-dita-patch.css` fetched from localhost (served by our example server) with 200 status
- [ ] Images display at intrinsic size (the patch layer's image no-stretch rule works)
- [ ] Line height looks correct (the patch layer's compensation formula works)

---

## Files affected

**TypeScript (core reader):**
- `src/model/user-settings/ReadiumCSS.ts` — new v2 constants + helpers
- `src/model/user-settings/UserSettings.ts` — dual applicator, v2 fields, pageMargins fix
- `src/model/user-settings/UserProperties.ts` — incrementable union expansion
- `src/navigator/EpubNavigator.ts` — odd-column spacer ordering fix

**TypeScript (other):**
- `src/modules/epub/search/SearchModule.ts` — dita-pagination, dita-active
- `src/modules/epub/TimelineModule.ts` — dita-active
- `src/navigator/PDFNavigator.ts` — dita-loading

**SCSS:**
- `src/styles/sass/reader.scss`
- `src/styles/sass/reader/{_global,_error,_loading,_timeline,_toc,_toolbox,_tts,_settings,_bookmarks}.scss`

**Demo viewers:**
- `viewer/index.html` — FXL filter, max-width removed
- `viewer/index_dita.html` — `dita-*` renames
- `viewer/index_dita_v2.html` — new (local v2)
- `viewer/index_dita_v2_cdn.html` — new (CDN v2)
- `viewer/index_api.html`, `index_minimal.html`, `index_sampleread.html`, `index_epub_file.html` — class renames
- `viewer/readium-css-v2/` — pristine v2 files + `ReadiumCSS-dita-patch.css`

**Examples:**
- `examples/server.ts` — three viewer links per EPUB
- `examples/angular/reader.component.ts` — class renames
- `examples/vue/ReaderComponent.vue` — class renames
- `examples/README.md` — DOM examples aligned
