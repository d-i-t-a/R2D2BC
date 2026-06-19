# CHANGES — v3 Workstream 3.5.1: Navigator Config Cleanup

Published as: `3.0.0-alpha.18`
Branch: `feature/v3-navigator-config` (stacked on `feature/v3-readiumcss-v2`)

Scoped to `IFrameAttributes`, the iframe-height formula used in reflowable
paginated mode, and the selection-toolbox placement logic. No other
navigator or module surface is touched.

## `IFrameAttributes`

Moved from `src/navigator/EpubNavigator.ts` into `src/navigator/types.ts`
alongside `NavigatorAPI`, `ReaderRights`, and the `Injectable` union.
`EpubNavigator.ts` re-exports the type for back-compat — integrators
importing `IFrameAttributes` from the navigator module are unaffected.

### Removed

| Field | Why |
| --- | --- |
| `navHeight` | The reader now measures the iframe's outer-viewport offset live via `getBoundingClientRect()` + content-box translation (border + padding). The integrator doesn't need to provide it. |
| `bottomInfoHeight` | The `#reader-info-bottom` element lives in the integrator's HTML. The integrator owns its CSS height (inline `style="height: Npx;"` or a stylesheet rule). The reader reads the element's rendered height live where it needs it. |
| `sideNavPosition` | Dead since May 2022 when MUI Sidenav was removed. No code was reading it. |

### Added

**`iframe.padding`** — reflowable iframe CSS padding. Not applied in fixed-layout publications.

```ts
attributes: {
  iframe: {
    padding: 20,                                   // same value on all four sides
    // or
    padding: { top: 20, bottom: 20, left: 0, right: 0 },
  }
}
```

Only sides the integrator explicitly specifies are written to the iframe's inline style — unspecified sides inherit from the stylesheet (no forced zero).

**`safeArea`** — integrator-provided callbacks returning the top/bottom chrome elements that the reader should avoid. Used for both selection-toolbox placement **and** iframe height sizing.

```ts
attributes: {
  safeArea: {
    top: () => document.querySelector('.my-navbar'),
    bottom: () => document.getElementById('my-progress-bar'),
  }
}
```

Each callback is invoked at measure time; the reader measures
`getBoundingClientRect().height`. Hidden elements (`display: none`,
`height: 0`) measure as `0`, so toggling chrome visibility reclaims the
space automatically without any further config changes.

### Changed

- **`margin` is now optional.** Previously required. Default behavior without it: iframe fills its parent container (minus `safeArea.bottom` and iframe padding). Omit it if you don't need extra slack beyond what `safeArea` and iframe padding already reserve.

### Deprecated

- `iframePaddingTop` — kept as fallback when `iframe.padding` is not set. Prefer `iframe.padding.top` (or `iframe.padding` with a number).

## Iframe-height formula

The paginated reflowable iframe-height formula changed from
`viewport − 40 − margin` to:

```
iframe.height = parent.clientHeight
              − safeArea.bottom.height
              − iframe padding
              − margin
```

Extracted into `BrowserUtilities.computeIframeContentHeight(iframe, attributes)`.
Called from four sites: paginated setup and resize in `EpubNavigator.ts`, and
paginated height + scroll-mode floor in `ReflowableBookView.ts`.

- The magic `40` offset is gone. It had no semantic meaning — historical
  residue from a prior hardcoded `100` split into `40 + margin`.
- The base is the iframe's parent container, not the viewport. Integrators
  size `#iframe-wrapper` via CSS; the reader reads that live and honors it.
- Iframe padding is subtracted from the target height so the element's
  outer rendered size (content-box + padding) matches the space we reserved.
  Without this, a padded iframe extends past its declared height into
  adjacent chrome.
- Hidden `safeArea` elements measure as 0, so toggling chrome visibility
  (progress bar, translation bar, etc.) resizes the iframe automatically.

**Consequence for integrators:** the `#iframe-wrapper` element must have a
CSS height. Every integrator's iframe height is different than before —
reload and verify layout.

## Iframe default display

The reader now sets `iframe.style.verticalAlign = "top"` on every iframe it
creates or claims (reflowable + FXL second iframe, claim path + create path).

Fixes the ~4–5px baseline-alignment gap below an inline-level iframe that
would otherwise push `wrapper.scrollHeight` past `clientHeight` and trigger
the forced `overflow: auto` wrapper scrollbar when the iframe fills its
parent exactly. Affects every framework example (React, Vue, Next.js,
Remix, Vanilla, Angular) where the integrator has no `attributes` block.

## Selection toolbox placement

Rewritten to remove the `navHeight` dependency and handle more cases cleanly.

- Translates selection coordinates from iframe-viewport to outer-viewport using the iframe's content-box origin (border-box top + border + padding). Works automatically regardless of iframe chrome.
- Uses `position: fixed` so `fit-content` width lays icons in one row even inside a narrow parent.
- Anchors the toolbox at the selection **focus** (where the user released the mouse) instead of the selection's bounding-box center. Direction detection via the Selection API:
  - Forward selection (top-to-bottom): toolbox below the focus, pointer up.
  - Backward selection (bottom-to-top): toolbox above the focus, pointer down.
- Single-line selections always place above (below would overlap the next text line).
- Adaptive clipping honors `safeArea` and viewport edges — flips to the other side when the preferred side would clip.
- Horizontal placement centers on the focus X, clamped inside the viewport; if the toolbox is wider than the viewport, it centers.
- CSS `.below` variant in `_toolbox.scss` flips `transform-origin` and repositions the pointer arrow.

## Fixes

- **Partial `attributes` objects no longer produce `NaN` iframe heights.** `margin` is now optional, and every read site uses `?? 0`. Passing `attributes: {}` or any object missing `margin` returns a concrete number from the formula. The navigator constructor and `applyAttributes()` resolve `this.attributes = attributes ?? {}` — no implicit `{ margin: 0 }` fallback needed.

## Integrator impact

| Change | Impact |
| --- | --- |
| `navHeight` removed | Compile error for TypeScript integrators passing it. Runtime: no change — the reader measures live. Remove from config. |
| `bottomInfoHeight` removed | Compile error for TS integrators passing it. Style the `#reader-info-bottom` element via inline `style` or CSS instead. |
| `sideNavPosition` removed | Compile error if set. No runtime effect to restore; it was dead. |
| `iframe.padding` added | Opt-in. Existing integrators unaffected. |
| `safeArea` added | Opt-in. `safeArea.bottom` now also shortens the iframe so content doesn't sit under fixed bottom chrome. Recommended wherever fixed chrome overlays the iframe area. |
| `iframePaddingTop` deprecated | Still works via fallback. IDEs show strikethrough; no compile error. Migrate to `iframe.padding.top` when convenient. |
| `margin` optional | No compile or runtime error for existing integrators. Optional omission enables zero-config layouts when `safeArea` + wrapper CSS cover the space. |
| Iframe-height formula change | Every integrator's iframe height is different after upgrade. Reload and verify. If `margin` was reserving space for fixed bottom chrome, switch to `safeArea.bottom` and drop the `margin` (they now both subtract if both set). |
| Iframe `verticalAlign: top` | Purely additive. Eliminates the baseline-gap scrollbar in zero-config integrators. No migration. |
| NaN fix | Purely additive. Integrators passing `{}` or partial objects and working around the resulting breakage can remove their workarounds. |
| Toolbox placement | Visible behavioral change. Toolbox now anchors at mouse-up position with direction-aware flip and adaptive clipping. No config needed. |

## Files changed

- `src/navigator/types.ts` — `IFrameAttributes` moved here from EpubNavigator.
- `src/navigator/EpubNavigator.ts` — re-exports `IFrameAttributes`; constructor + `applyAttributes` simplified to `attributes ?? {}`; iframe padding write logic; iframe `verticalAlign: top` at all claim/create sites; height formula delegated to helper; FXL scroll-container live measurement.
- `src/utils/BrowserUtilities.ts` — new `computeIframeContentHeight` helper.
- `src/views/ReflowableBookView.ts` — paginated + scroll-mode floor delegated to helper; default `attributes = {}`.
- `src/views/FixedBookView.ts` — default `attributes = {}`.
- `src/modules/highlight/TextHighlighter.ts` — toolbox placement rewrite.
- `src/styles/sass/reader/_toolbox.scss` — `.below` variant.
- `viewer/index_dita.html`, `index_dita_v2.html`, `index_dita_v2_cdn.html`, `index_sampleread.html` — `bottomInfoHeight` removed from config, inline height added to `#reader-info-bottom`, `safeArea` example wired in `index_dita.html`.
- `viewer/index_epub_file.html`, `viewer/index_injectables.html`, `viewer/index_api.html` — `bottomInfoHeight` / `navHeight` removed.
- `examples/README.md` — updated snippet.
- `.gitignore` — `demo_config*.html` ignored (local-only config showcase files).
