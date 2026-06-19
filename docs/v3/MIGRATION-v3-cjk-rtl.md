# Migration — v3 Workstream 3.5.3: CJK Vertical & RTL Support

Baseline: 2.5.x (production). All items below describe what's new or changed since 2.5.x relevant to this workstream.

## Breaking changes

None.

## Required

If your publication is RTL or CJK-vertical, you must inject matching ReadiumCSS bundles. See [Added → ReadiumCSS bundles](#readiumcss-bundles-for-non-ltr-scripts).

LTR-only integrators: no required changes.

## Added

### `D2Reader.scriptMode`

Runtime getter for the publication's derived script mode:

```ts
d2reader.scriptMode;
// "ltr" | "rtl" | "cjk-horizontal" | "cjk-vertical" | "mongolian-vertical" | undefined
```

Derived from `metadata.languages` + `readingProgression`. `undefined` for non-EPUB publications (PDFs).

### Bookmark — `findBookmarkAt(locator?)` / `hasBookmarkAt(locator?)`

New methods on both `D2Reader` and `IBookmarkModule`. Optional `locator` argument; defaults to current position.

```ts
const bm = d2reader.findBookmarkAt();           // current position
const isMarked = d2reader.hasBookmarkAt();
const bm2 = d2reader.findBookmarkAt(someLocator); // arbitrary position
```

Returns the *stored* bookmark (with `id`) so toggle-to-delete works. Both EPUB and PDF.

### `IFrameAttributes.safeArea.left` / `.right`

`safeArea` now accepts `left` and `right` callbacks alongside the existing `top` / `bottom`:

```ts
attributes: {
  safeArea: {
    top:    () => document.querySelector(".header"),
    bottom: () => document.querySelector(".footer"),
    left:   () => document.querySelector(".left-rail"),   // new in 3.5.3
    right:  () => document.querySelector(".right-rail"),  // new in 3.5.3
  },
}
```

`applyIframeSafeAreaMargins` writes margins on all four sides — iframe positioning is deterministic regardless of how the parent lays out children (flex, grid, RTL inline direction).

### `ContentProtectionModuleProperties.viewportSlack`

Pixels of slack added to viewport bounds when classifying rects as outside (and thus scrambled):

```ts
protection: {
  enableObfuscation: true,
  // Single number → applies to all four sides
  viewportSlack: 100,
  // Or per-side, with omitted sides keeping historical defaults
  viewportSlack: { top: 24, bottom: 24, left: 0, right: 0 },
}
```

Each side clamped to `>= 0`. Defaults preserve historical behavior (`lineHeight` top, `0` bottom, `window.innerWidth` left/right).

### ReadiumCSS bundles for non-LTR scripts

Bundled at `viewer/readium-css-v2/{rtl,cjk-horizontal,cjk-vertical}/`. Use `Injectable.when` predicates to gate per script mode:

```ts
const isLtr            = (ctx) => ctx.scriptMode === "ltr";
const isRtl            = (ctx) => ctx.scriptMode === "rtl";
const isCjkHorizontal  = (ctx) => ctx.scriptMode === "cjk-horizontal";
const isCjkVertical    = (ctx) =>
  ctx.scriptMode === "cjk-vertical" ||
  ctx.scriptMode === "mongolian-vertical";

const injectables = [
  // LTR — Latin / non-CJK
  { type: "style", url: ".../ReadiumCSS-before.css",  r2before:  true, when: isLtr },
  { type: "style", url: ".../ReadiumCSS-default.css", r2default: true, when: isLtr },
  { type: "style", url: ".../ReadiumCSS-after.css",   r2after:   true, when: isLtr },

  // RTL — Arabic, Hebrew, Persian
  { type: "style", url: ".../rtl/ReadiumCSS-before.css",  r2before:  true, when: isRtl },
  { type: "style", url: ".../rtl/ReadiumCSS-default.css", r2default: true, when: isRtl },
  { type: "style", url: ".../rtl/ReadiumCSS-after.css",   r2after:   true, when: isRtl },

  // CJK-horizontal — Chinese / Japanese / Korean (horizontal)
  { type: "style", url: ".../cjk-horizontal/ReadiumCSS-before.css",  r2before:  true, when: isCjkHorizontal },
  { type: "style", url: ".../cjk-horizontal/ReadiumCSS-default.css", r2default: true, when: isCjkHorizontal },
  { type: "style", url: ".../cjk-horizontal/ReadiumCSS-after.css",   r2after:   true, when: isCjkHorizontal },

  // CJK-vertical — Japanese tategaki, vertical Chinese, Mongolian
  { type: "style", url: ".../cjk-vertical/ReadiumCSS-before.css",  r2before:  true, when: isCjkVertical },
  { type: "style", url: ".../cjk-vertical/ReadiumCSS-default.css", r2default: true, when: isCjkVertical },
  { type: "style", url: ".../cjk-vertical/ReadiumCSS-after.css",   r2after:   true, when: isCjkVertical },
];
```

Demo viewers (`viewer/index_dita_v2.html`, `viewer/index_epub_file.html`, `viewer/index_small_window.html`) show the full wiring.

### `Renderer.getScrollSurface()`

Interface method telling modules where the active mode scrolls:

```ts
getScrollSurface():
  | { kind: "host";   element: HTMLElement }
  | { kind: "iframe"; iframe: HTMLIFrameElement };
```

Only relevant if you implement a custom `Renderer`. Built-in Scroll / Column / Vertical / Fixed renderers implement it.

### `VerticalRenderer`

New built-in renderer for `cjk-vertical` and `mongolian-vertical` script modes. Vertical writing mode means the scroll axis is X, not Y. Selected automatically based on script mode — no integrator action needed beyond passing the right CSS bundle and the publication's metadata.

## Changed

- **ContentProtection: FXL skips the obfuscation pipeline.** Both spread iframes are always visible; the off-viewport scrambling model doesn't apply. Other protection features (`disableCopy`, `disableKeys`, `disablePrint`, `disableContextMenu`, `hideTargetUrl`, `disableDrag`) still apply unchanged.

## Fixed

- **Content protection works in all modes** — scroll, paginated, vertical (and both `scrollContainer: "host"` / `"iframe"`). Renderer-authoritative scroll-surface routing now picks the right scroll source for each mode.
- **`enableObfuscation: false` + `disableCopy` / `disableKeys` / `disablePrint` / `disableContextMenu`.** Previously, integrators using only those flags got nothing — listener attachment was gated behind `enableObfuscation`. Now those listeners attach unconditionally based on each feature's own flag.
- **LineFocus first-enable race.** First `enableLineFocus()` would crash because the iframe-side container hadn't been created yet. Container creation is now part of `TextHighlighter.initialize`, runs reliably on every iframe load.
- **Stale ContentProtection scroll listener after chapter navigation in iframe-scroll mode.** First chapter's listener leaked across; scroll-mode obfuscation stopped updating after first chapter. Now re-attaches per chapter.
- **RTL paginated keyboard navigation in built-in viewers.** Several built-in demo viewers had duplicate, LTR-only `document.addEventListener('keydown', ...)` handlers that called `previousPage()` / `nextPage()` without flipping for RTL. Removed; the navigator's RTL-aware keyboard handler is the sole listener.
- **No throwaway initial renderer.** `UserSettings.create()` now picks the renderer once after store reads + integrator overrides have settled. Default (when nothing is configured) is `ScrollRenderer`. Visible only if you reach into `settings.view` between `await UserSettings.create(...)` resolving and `applyProperties()` running — `view` is now guaranteed final.

## Recommended migration

- **RTL or CJK publications:** add the matching ReadiumCSS bundle entries to `injectables` with `when` predicates as shown above. Demo viewers are working references.
- **Boxed-reader UIs (reader inside a small container with chrome around it):** add `safeArea.left` / `right` callbacks if your layout has rails alongside the iframe.
- **ContentProtection users:** if you previously set `disableCopy` / `disableKeys` / `disablePrint` / `disableContextMenu` and noticed they didn't work without `enableObfuscation: true`, those flags now actually apply. If you don't want them, set them explicitly to `false`.
- **Custom `Renderer` implementations:** add `getScrollSurface()` returning the appropriate `{ kind: "host" | "iframe", ... }` for your renderer's mode.
