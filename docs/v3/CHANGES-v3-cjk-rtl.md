# CHANGES — v3 Workstream 3.5.3: CJK Vertical & RTL Support

Published as: `3.0.0-alpha.21`
Branch: `feature/v3-cjk-rtl` (based on `feature/v3-readiumcss-v2`)
Closes: [#1013](https://github.com/d-i-t-a/R2D2BC/issues/1013)

## At a glance

DITA Toolkit now first-class-supports three reading flows beyond plain LTR:

- **RTL paginated** (Arabic, Hebrew, RTL CJK) — `scrollLeft` is negated, multi-column spacer math is direction-aware, and the spacer count for partial-last-pages is correct in 2-col, 3-col, and N-col layouts.
- **CJK vertical** (Japanese tategaki, vertical Chinese) — a new `VerticalRenderer` runs vertical-rl content with a horizontal scroll axis. Scroll-only by design (no in-resource pagination).
- **Mongolian vertical** — same renderer path as cjk-vertical (vertical writing mode, horizontal scroll axis).

Script mode is derived once at construct time from `metadata.languages` + `readingProgression` via `getScriptMode(publication)` and propagated through `EpubNavigator`, `UserSettings`, `InjectableManager`, and the `InjectableContext` so `when` predicates can select ReadiumCSS variants without re-walking metadata per chapter.

`IFrameAttributes.safeArea` was extended from top/bottom to all four sides with position-based inset math, and the renderers now route iframe sizing through it consistently.

---

## Summary of changes

### Script mode propagation

```typescript
type ScriptMode =
  | "ltr"
  | "rtl"
  | "cjk-horizontal"
  | "cjk-vertical"
  | "mongolian-vertical";
```

- `EpubNavigator.scriptMode` — readonly, set in constructor from `getScriptMode(publication)`.
- `UserSettings.scriptMode` — set by the navigator after construct; drives renderer selection in `swapRenderer`.
- `InjectableContext.scriptMode` — passed to `when` predicates so integrators select the right ReadiumCSS bundle (rtl, cjk-horizontal, cjk-vertical) per publication.
- `D2Reader.scriptMode` — new public getter, returns the publication's derived script mode (or `undefined` when unavailable, e.g. PDF without an EPUB-shaped publication).
- `D2Reader.load` passes `getScriptMode(publication)` into `UserSettings.create` so the *initial* renderer is constructed with correct flags — no throwaway `ColumnRenderer(rtl=false)` for an RTL/vertical publication.

### New renderer: `VerticalRenderer`

Runs `cjk-vertical` and `mongolian-vertical` content. Vertical writing mode means the scroll axis is X, not Y — so the renderer's `getScrollOffset`, `getScrollExtent`, `setScrollOffset` operate on horizontal scroll, and `growIframeToContent` grows iframe **width** to fit content.

- Constructor takes `verticalRtl: boolean` — `true` for Japanese/Chinese (right-to-left scroll progression), `false` for Mongolian.
- Always runs in iframe-scroll mode regardless of `attributes.scrollContainer`. Host-scroll on vertical-rl is unreliable (negative `scrollLeft` semantics, scroll-position invalidation when iframe.width is rewritten, visible flicker on the reading axis when iframe resizes), so the integrator's `scrollContainer: "host"` setting is ignored for vertical scripts.
- `scrolling="auto"` is baked into the iframe at creation time in `EpubNavigator` for vertical scripts; the post-load attribute change is unreliable on already-loaded iframes, and `scrolling="no"` overrides any document-level CSS overflow.

### Renderer selection

`UserSettings.swapRenderer` now picks the target class by script mode and constructor flags, with a flag-aware re-engage shortcut:

| scriptMode             | Layout              | View                |
|-----------------------|---------------------|---------------------|
| `cjk-vertical`        | reflowable          | `VerticalRenderer(verticalRtl=true)`   |
| `mongolian-vertical`  | reflowable          | `VerticalRenderer(verticalRtl=false)`  |
| `rtl`                 | reflowable + paginated | `ColumnRenderer(rtl=true)`          |
| `rtl`                 | reflowable + scroll | `ScrollRenderer`     |
| `ltr` / `cjk-horizontal` | reflowable + paginated | `ColumnRenderer(rtl=false)`      |
| `ltr` / `cjk-horizontal` | reflowable + scroll | `ScrollRenderer`                 |
| any                   | fixed               | `FixedRenderer`     |

The vertical-script gate is `unconditional` — vertical books always use `VerticalRenderer`; the user-set `verticalScroll` toggle is ignored (vertical is scroll-only by design).

`UserSettings.isPaginated()` short-circuits to `false` for vertical scripts (`isVerticalScript === true`) so navigator chrome doesn't fall back to paginated state from a prior book's setting. `currentSettings.verticalScroll` likewise reports `true` for vertical regardless of the persisted value, keeping the integrator's UI toggle in sync with the actual renderer.

### Vertical-script settings gates

Several CSS-property writes in `UserSettings.applyProperties` are now skipped for vertical scripts (`isVerticalScript === true`):

- **`COLUMN_COUNT`** — cjk-vertical bundle forces `columns: auto auto !important` on `:root`; writing `--USER__colCount` has no effect.
- **`PAGE_MARGINS` / `LINE_LENGTH`** — cjk-vertical uses `--RS__defaultLineLength: 100%` for body's max-width and `--RS__pageGutter` for its own padding; these horizontal-axis values don't apply to vertical-rl layout.
- **`FONT_OPTICAL_SIZING` / `LIGATURES`** — typography fine-tuning that doesn't apply meaningfully to vertical CJK.

The `data-viewer-theme` attribute (used by reader UI SCSS for toc, settings, error, loading, bookmarks, timeline panels) was lifted out of the appearance var-write block into its own unconditional block, so theme switching (sepia/night) still works for vertical books.

### Vertical-script ReadiumCSS triggers

For vertical scripts, `applyProperties` writes:

```css
--USER__scroll: readium-scroll-on
--RS__disablePagination: readium-noVerticalPagination-on
--RS__overflow: readium-noOverflow-on
```

The first two are independent CSS-rule triggers in the cjk-vertical bundle that set `:root { columns: auto auto !important; max-width: none !important; }` — the layout that lets vertical-rl content extend horizontally. The third (`--RS__overflow`) defeats body's `overflow: hidden / clip` rules (gated on `:not([style*="readium-noOverflow-on"])`); without it, body would clip multicol fragments.

### RTL paginated math

`ColumnRenderer` now natively supports RTL.

- **`publicationRtl: boolean`** constructor parameter — `true` for RTL publications. Drives the *initial* assumption before content loads.
- **`rtl` getter** — trusts `publicationRtl` first; falls back to computed `direction === "rtl"` only when the flag is false (handles integrators who inject an RTL stylesheet without flagging the publication).
- **`scrollLeft` normalization** — `getLeftColumnsWidth` uses `Math.abs(scrollLeft)` because RTL paginated documents have negative `scrollLeft`. `setLeftColumnsWidth` flips sign for RTL (`scrollLeft = rtl ? -width : width`).
- **`goToElement`** — uses `Math.abs(scrollLeft) - width` for the diff term (was `scrollLeft - width`, broken for RTL).

### Spacer system overhaul (paginated multi-column)

Multi-column layouts (`column-count > 1`) need spacer columns appended when content doesn't fill a whole page. Single-column LTR was the only case with working math before; this workstream extends to N-column LTR + RTL.

`padOddColumns()` dispatches to one of four variants by direction × column count:

| direction | column-count | function                    | spacer ids                           |
|-----------|--------------|-----------------------------|--------------------------------------|
| LTR       | 1            | (no-op)                     | —                                    |
| LTR       | 2            | `padOddColumnsLtrSingle`    | `r2d2bc-column-spacer`               |
| LTR       | 3+           | `padOddColumnsLtrMulti`     | `r2d2bc-column-spacer-{i}`           |
| RTL       | 1            | (no-op)                     | —                                    |
| RTL       | 2            | `padOddColumnsRtlSingle`    | `r2d2bc-column-spacer-rtl`           |
| RTL       | 3+           | `padOddColumnsRtl`          | `r2d2bc-column-spacer-rtl-{i}`       |

**Phantom-column rounding (multi-col only):**

`body.scrollWidth` has sub-pixel drift relative to `columnCount × oneColumnWidth` — and the drift direction differs by direction:

- LTR: `body.scrollWidth` UNDER-counts (e.g. 14 real cols read as 13.999) → use `Math.ceil`
- RTL: `body.scrollWidth` OVER-counts (e.g. 19 real cols read as 19.999) → use `Math.floor`

```ts
const visibleCols = (rtl ? Math.floor : Math.ceil)(body.scrollWidth / oneColumnWidth);
const totalPagesNeeded = Math.ceil(visibleCols / columnCount);
const spacersNeeded = totalPagesNeeded * columnCount - visibleCols;
```

Spacers are appended in a single batch (compute upfront from initial scrollWidth, not iteratively — iterative reads were non-deterministic across browser sync layout passes).

**Column-count change re-padding:**

`ColumnRenderer.clearSpacers()` removes all `[id^="r2d2bc-column-spacer"]` and forces a layout flush. `EpubNavigator.handleResize` calls `clearSpacers()` + `padOddColumns()` for paginated views in its +100ms timeout, before the +150ms `goToProgression(oldPosition)` restore. This handles window resize, settings slider 2→3 col, and other paginated layout changes — without it, stale spacers from the old column count would block the existing-spacer guards from re-padding for the new count.

`ScrollRenderer.engage` strips the same selector so toggling scroll mode cleans up paginated-mode spacers.

### Page-aligned navigation (atEnd / goToNextPage)

`atEnd()` and `goToNextPage()` previously gated on `this.scrollWidth` (the rounded ceil-getter), which over-estimates total scroll extent by up to a full page when content has trailing whitespace, padding, or sub-pixel layout drift. This let navigation walk one page past real content into a blank phantom page.

Both now gate on the page-aligned last-page boundary:

```ts
const lastPageStart = (this.getPageCount() - 1) * this.getPageWidth();
// atEnd
return this.getLeftColumnsWidth() >= lastPageStart - 1;
// goToNextPage
if (offset <= lastPageStart) setLeftColumnsWidth(offset);
else setLeftColumnsWidth(lastPageStart);
```

`getPageCount()` derives from raw `scrollWidth` with floor (`floor((raw - pageWidth) / pageWidth) + 1`) — phantom-tolerant for drift up to <1 page, which covers all observed cases.

### safeArea — left/right + position-based inset math

`IFrameAttributes.safeArea` was top/bottom only. Added `left` and `right` callbacks (same shape — function returning the chrome element to reserve space for).

```ts
safeArea?: {
  top?:    () => Element | null;
  bottom?: () => Element | null;
  left?:   () => Element | null;
  right?:  () => Element | null;
};
```

`safeAreaInset(side, parent, attributes)` — new helper in `BrowserUtilities`. Position-based:

- `top:    chrome.bottom − parent.top`
- `bottom: parent.bottom − chrome.top`
- `left:   chrome.right  − parent.left`
- `right:  parent.right  − chrome.left`

Floors at 0; treats `display:none` / detached chrome (zero-rect) as no inset. Collapses to chrome dimension when chrome is anchored at the parent edge; accounts for the gap when offset (e.g. timeline at `left: 2.5rem`).

`computeIframeContentHeight` now subtracts `safeAreaInset("top")` + `safeAreaInset("bottom")`. New `computeIframeContentWidth` subtracts left + right.

`applyIframeSafeAreaMargins(iframe, attributes)` — new helper. Writes `marginTop`, `marginBottom`, `marginLeft`, and `marginRight` from the corresponding `safeAreaInset` values. Combined with the dimension shrink, total margins + iframe dimensions = parent box, so the iframe lands flush against each safeArea edge regardless of how its parent lays out children (flex, grid, RTL inline direction, etc.).

`ScrollRenderer.setSize`, `ColumnRenderer.setSize`, and `VerticalRenderer.setSize` all route iframe sizing through these helpers. `ScrollRenderer.atEnd`, `VerticalRenderer.atEnd`, `VerticalRenderer.goToPreviousPage` / `goToNextPage` (page step), `LineFocusModule.lineFocus` (`--USER__maxMediaHeight`), and `UserSettings.applyProperties` auto-column resolution all use `computeIframeContent{Height,Width}` so end-detection, page-flip step, max media height, and auto-column breakpoints correctly account for safeArea.

### Bookmark API

Bookmark UIs need a "is the current position bookmarked?" check that returns the *stored* bookmark (with `id`) so toggle-to-delete works.

- **`IBookmarkModule.findBookmarkAt(locator?): Bookmark | null`** + **`IBookmarkModule.hasBookmarkAt(locator?): boolean`** — new interface methods. Optional locator argument; defaults to the reader's current locator. Implemented for both EPUB and PDF.
- **EPUB**: extracted `getCurrentChapterHref()` and `getCurrentPositionLocator()` private helpers from `saveBookmark`; `findBookmarkAt(locator?)` reuses them so lookup matches what was actually stored. Page-based match when positions exist (stable across all scroll positions within the same page); raw-progression tolerance fallback otherwise.
- **PDF**: matches on page index from `locations`.
- **`LocalAnnotator.locatorExists`**: returns the stored locator (`filteredLocators[0]`), not the input synthetic — so callers receive usable data with `id` for deletion/jump.
- **`D2Reader.findBookmarkAt(locator?)` / `D2Reader.hasBookmarkAt(locator?)`**: new public methods, work for both EPUB and PDF.

Naming follows ecosystem conventions (`find*` for "object-or-null", `has*` for boolean; locator argument as the key — analogous to `chrome.bookmarks.search({url})`).

### Misc

- **`getColumnWidth` → `getPageWidth`** — rename. The method returns `clientWidth` (page width), not column width. Internal-only, no public API impact.
- **`setIframeHeight` → `growIframeToContent`** — rename across `Renderer` interface, `ScrollRenderer`, `VerticalRenderer`, and `EpubNavigator` call sites. The new name describes what the method actually does (grow along the active scroll axis to fit content) and disambiguates from `setSize()`.
- **`ScrollRenderer` debounce hoisted** — was re-created per `growIframeToContent` call (so the 200ms debounce never coalesced anything); now defined once in the constructor.
- **`ScrollRenderer` height seed** — engages always seed `this.height` from `computeIframeContentHeight`. Without this, when `ScrollRenderer` was the first renderer to engage (direct open in scroll mode), `html.offsetHeight` resolved to 0 and the screen rendered empty.
- **Iframe `dir` propagation** — `EpubNavigator.applyScriptModeAttributes` sets `dir` on iframe `<html>` and `<body>` from script mode (LTR/RTL only; vertical scripts skip — they use CSS `writing-mode` and the author retains `dir` control), only when the document author hasn't already set it.
- **Vertical-script body class** — viewer JS post-load tags `document.body` with `script-<mode>` and `script-vertical` (for cjk-vertical / mongolian-vertical), enabling chrome reorientation via CSS.

### Renderer-authoritative scroll surface

- **`Renderer.getScrollSurface()`** — new interface method returning `{ kind: "host"; element: HTMLElement } | { kind: "iframe"; iframe: HTMLIFrameElement }`. Lets modules (e.g. `ContentProtectionModule`) ask the active renderer where the scroll happens instead of inferring from `attributes.scrollContainer`.
- ScrollRenderer / ColumnRenderer / FixedRenderer branch on `attributes.scrollContainer` (`"host"` → `#iframe-wrapper`, `"iframe"` → the iframe element).
- VerticalRenderer always returns `iframe` — vertical scripts are iframe-scroll by design regardless of the integrator's `scrollContainer` setting.

### Content protection

- **Renderer-authoritative wrapper** — `ContentProtectionModule.scrollSurface` (renamed from `wrapper`) is set in `initialize()` from `host.view.getScrollSurface()`. For `iframe` kind, wraps in a proxy: scroll position from `iframe.contentDocument.scrollingElement`, dimensions from same scrolling element, listener target on `iframe.contentDocument` (BCR on iframe nodes returns post-scroll viewport coords, so `windowLeft/Top` stay 0 — viewport-frame origin).
- **Stale listener after chapter nav** — old code's `hasEventListener` guard prevented re-attach after first init; new chapter's `iframe.contentDocument` would never receive scroll events. Each `initialize()` now removes the previous listener (stored handler/target references) and attaches fresh.
- **`setupEvents` lifted out of `enableObfuscation` gate** — copy / print / keyboard / contextmenu listeners now attach unconditionally based on their own flags. Previously, integrators wanting only `disableCopy` (no scrambling) got no listeners at all.
- **FXL skips obfuscation** — both spread iframes are always visible, so the off-viewport scrambling model doesn't apply. FXL still gets copy / print / keyboard / contextmenu / hideTargetUrl / disableDrag.
- **`viewportSlack` config** — new `ContentProtectionModuleProperties.viewportSlack: number | { top?, bottom?, left?, right? }`. Number applies to all sides; object overrides per side (omitted sides keep historical defaults: `lineHeight` top, `0` bottom, `window.innerWidth` left/right). Each side clamped to `>= 0`.
- **NaN-safe lineHeight** — `parseInt("normal") || 10` so elements with `line-height: normal` no longer poison the slack math.

### LineFocus container creation

- **`TextHighlighter.initialize` now calls `prepareContainers`** — so `R2_ID_LINEFOCUS_CONTAINER` (and the rest) exist in the iframe document immediately on iframe load. Previously, `prepareContainers` was only invoked from `updateRenderer`'s gated `setTimeout(200ms)` block (`if (!skipDrawingAnnotations)`), and `handleIFrameLoad` called `updateRenderer({ skipDrawingAnnotations: true })` — so on initial load the containers were never created until a scroll-mode toggle or annotation draw lazily made them. First `enableLineFocus` would find a null container, the marker loop was skipped, `this.lines` stayed empty, and `currentLine()` threw on `undefined.style.top`.

### UserSettings — deferred view assignment

- **No more throwaway renderer** on first load. The constructor previously instantiated `ColumnRenderer` (or VerticalRenderer / FixedRenderer) before async store reads or integrator-supplied `initialUserSettings.verticalScroll` resolved. If the final scroll preference was scroll-mode, `applyProperties` immediately swapped to a fresh `ScrollRenderer` — the original was throwaway.
- New `selectInitialRenderer()` method picks the renderer based on final `layout` / `scriptMode` / `verticalScroll`. The factory `create()` calls it after `initialise()` + `initialUserSettings` have settled. Constructor leaves `view` unassigned (definite-assignment `view!: Renderer`).
- ScrollRenderer is the default fallback (matches the class-field default `verticalScroll = true`).

### Viewer keyboard handlers (RTL fix)

- Removed duplicate, LTR-only `document.addEventListener('keydown', ...)` handlers from `index_epub_file.html`, `index_minimal.html`, `index_injectables.html`, `index_sampleread.html`. The navigator's own `KeyboardEventHandler` is RTL-aware and attaches to host `document` already; the viewer-level handlers were calling `previousPage()` / `nextPage()` without flipping for RTL, breaking arrow-key navigation in RTL paginated mode.

---

## Demo viewer changes

- **`viewer/index_dita_v2.html`**: full ReadiumCSS v2 migration with script-mode predicate injectables (`isLtr`, `isRtl`, `isCjkHorizontal`, `isCjkVertical`); body class tagging post-load (`script-<mode>` / `script-vertical`); chapter-arrow icon swap + position CSS for vertical mode; chapter-axis swap for horizontal-bottom timeline (chapter inline `height: X%` → `width: X%`); settings panel reload populates v2 fields; scrollPadding inputs.
- **`viewer/index_epub_file.html`**: bookmark drawer (list, jump, delete, toggle button using `findBookmarkAt()` / `hasBookmarkAt()`); cjk-vertical injectable wired; `overscroll-behavior-x: contain` on `#iframe-wrapper` and the iframe to prevent browser back-swipe from interfering with horizontal scroll on vertical/RTL books.
- **`viewer/index_api.html`**, **`viewer/index_injectables.html`**, **`viewer/index_sampleread.html`**, **`viewer/index_minimal.html`**: ReadiumCSS v2 migration with script-mode predicates; `overscroll-behavior-x: contain` rules.
- **`viewer/index_dita.html`** intentionally remains on v1 ReadiumCSS for v1 reference.
- **`viewer/index_pdf.html`**: bookmark toggle updated to `hasBookmarkAt()`.
- **`viewer/readium-css-v2/cjk-vertical/`** — bundled v2 ReadiumCSS variant + dita-patch (html overflow rules, scroll-padding moved to html, scrollbar hiding) (demo asset).
- **`viewer/readium-css-v2/rtl/`** — bundled v2 ReadiumCSS variant (demo asset).
- **`src/styles/sass/reader/_timeline.scss`** — `body.script-vertical` overrides reorient the timeline as a horizontal strip at the bottom (row-reverse so chapter order matches vertical-rl reading), chapters fill the strip's full height with `box-sizing: border-box`.
- **`viewer/index_dita_v2.html`**: flex-root layout (`#root` is now `display: flex; flex-direction: column; height: 100vh`); `#D2Reader-Container` is `flex: 1; min-height: 0`; `#iframe-wrapper` is `height: 100%`. Removes the hardcoded `calc(100vh - 65px)` magic number and adapts if the top app-bar height changes.
- **`viewer/index_dita_v2.html`**, **`viewer/index_dita.html`**, **`viewer/index_dita_v2_cdn.html`**: `direction()` callback null-checks for missing `#positionSlider` (avoids `Cannot set properties of null` when integrators ship without the position slider element).
- **`viewer/index_small_window.html`** (new): boxed reader inside a 600×500 frame with `safeArea` chrome on all four sides (toolbar, statusbar, left/right sidebars). Demonstrates the four-margin write and integrator-supplied `lastReadingPosition` (localStorage-persisted, keyed by manifest URL — stands in for a server-sourced position).

---

## Migration

No public API breaking changes for LTR publications. New optional config:

- `UserSettingsConfig.scriptMode?: ScriptMode` — pass `getScriptMode(publication)` so the initial renderer is constructed with correct direction flags. Defaults to `"ltr"` if omitted (back-compat).
- `IFrameAttributes.safeArea` gained `left?` and `right?` callbacks alongside the existing `top?` / `bottom?`. Existing top/bottom usage is unchanged; integrators that supply `left` / `right` will see the iframe sized and offset accordingly. `applyIframeSafeAreaMargins` writes all four margin sides (was top/left only).
- `ContentProtectionModuleProperties.viewportSlack?: number | { top?, bottom?, left?, right? }` — pixels of slack on each side when classifying rects as outside the viewport (and thus scrambled). Number applies to all sides; per-side object overrides per side, omitted sides keep historical defaults (`lineHeight` top, `0` bottom, `window.innerWidth` left/right). Each side clamped to `>= 0`. Set to `0` for strict viewport-edge classification, increase for more pre-render slack.

For RTL/vertical publications, integrators must:

1. Pass a publication whose `metadata.languages` and `readingProgression` resolve to a non-LTR script mode via `getScriptMode`.
2. Inject a matching ReadiumCSS bundle (rtl, cjk-horizontal, or cjk-vertical) using `Injectable.when` predicates that gate on `scriptMode`.

Bookmark API consumers:

- `IBookmarkModule.getCurrentBookmark()` → `findBookmarkAt(locator?)`
- `IBookmarkModule.isCurrentBookmarked()` → `hasBookmarkAt(locator?)`
- `D2Reader.currentBookmark` (getter) → `D2Reader.findBookmarkAt(locator?)` (method)
- `D2Reader.isCurrentBookmarked` (getter) → `D2Reader.hasBookmarkAt(locator?)` (method)

Demo viewers (`viewer/index_dita_v2.html`, `viewer/index_epub_file.html`) show the wiring.
