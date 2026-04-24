# Migration — v3 Workstream 3.5.1: Navigator Config Cleanup

## Breaking changes

The following `attributes` fields have been removed. TypeScript users will see compile errors. Remove them from your config:

- `navHeight` — the reader now measures the iframe's outer-viewport offset at runtime.
- `bottomInfoHeight` — the footer element's height is now owned by the integrator via inline `style` or CSS. The reader reads it live where needed.
- `sideNavPosition` — no longer referenced by the reader.

## Required

The `#iframe-wrapper` element must have a CSS height. The reader sizes the iframe based on its parent container. Example:

```html
<main id="iframe-wrapper" style="height: calc(100vh - 65px)"></main>
```

## Added

**`safeArea`** — integrator-provided callbacks returning the top/bottom chrome elements the reader should avoid. Used for both selection-toolbox placement and iframe sizing.

```js
attributes: {
  safeArea: {
    top: () => document.querySelector('.my-navbar'),
    bottom: () => document.getElementById('my-footer'),
  },
}
```

Each callback is invoked at measure time; the reader reads `getBoundingClientRect().height`. Hidden elements (`display: none`, `height: 0`) return 0 and the reader reclaims the space automatically — toggling chrome visibility works without any further config.

**`iframe.padding`** — reflowable iframe CSS padding (not applied to fixed-layout publications).

```js
attributes: {
  iframe: {
    padding: 20,                                           // all four sides
    // or
    padding: { top: 20, bottom: 0, left: 0, right: 0 },   // per-side
  },
}
```

Only sides explicitly specified are written to the iframe's inline style — unspecified sides inherit from your stylesheet.

## Changed

- **`margin` is now optional.** Previously required. Omit it if you don't need extra space beyond what `safeArea` and iframe padding already reserve.

- **Iframe-height formula.** Was `viewport − 40 − margin`. Now:

  ```
  iframe.height = wrapper.clientHeight − safeArea.bottom − iframe padding − margin
  ```

  The magic `40` offset is gone. The resulting iframe height will differ from before — reload and verify your layout.

- **Selection toolbox placement.** Rewritten. The toolbox now:
  - Anchors at the selection focus (mouse-release point) instead of the selection's bounding-box center.
  - Flips above/below based on selection direction (forward → below, backward → above).
  - Always places above for single-line selections.
  - Honors `safeArea` and viewport edges; flips when the preferred side would clip.
  - No config needed to get the new behavior.

## Fixed

- Partial `attributes` objects (e.g. `attributes: {}`) no longer produce `NaN` iframe heights.

## Deprecated (continues to work)

- `iframePaddingTop` — prefer `iframe.padding.top`, or `iframe.padding` as a single number for all four sides. The old field still works as a fallback when `iframe.padding` is not set.

## Recommended migration

- If you used `margin` to reserve space for fixed bottom chrome (footer, progress bar), switch to `safeArea.bottom: () => yourFooter` and remove that `margin`.
- If you have both `margin` and `safeArea.bottom` describing the same chrome, drop one — they are now both subtracted.
- Move `iframePaddingTop` configs to `iframe.padding.top` when convenient.
