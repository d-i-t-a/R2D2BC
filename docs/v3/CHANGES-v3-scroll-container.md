# CHANGES — v3 Workstream 3.5.2: Scroll Container Option

Published as: *pending (will ship as `3.0.0-alpha.20`)*
Branch: `feature/v3-scroll-container` (stacked on `v3`, which now includes the chapter-nav scroll-reset bugfix shipped as `3.0.0-alpha.19`)

Adds opt-in alternate viewport model for scroll mode. Default behaviour unchanged.

## What changed

### `IFrameAttributes.scrollContainer`

New optional field on `IFrameAttributes` controls which element provides the scrollbar in scroll mode:

```ts
attributes: {
  scrollContainer: "host" | "iframe",   // default "host"
}
```

- **`"host"` (default):** `#iframe-wrapper` scrolls. Iframe grows to its content's full height. Existing v2.x behaviour.
- **`"iframe"`:** iframe stays at viewport height (`wrapper.clientHeight − safeArea.bottom − iframe padding − margin`). The iframe's own document scrolls internally.

Only affects scroll mode. Paginated and fixed-layout are unchanged.

### Why `"iframe"` mode exists

Integrators who inject styles like `body { height: 100% }` (commonly seen on cover pages) trigger a 100%-height-chain in host mode: `iframe.height` is computed from content `scrollHeight`, but content height equals iframe height (because `body` is 100% of iframe), so each paint grows the iframe. Iframe-scroll mode breaks the loop because the iframe is fixed-size and its document overflows internally.

## Implementation

### `src/navigator/types.ts`

`scrollContainer?: "host" | "iframe"` added to `IFrameAttributes`.

### `src/views/ReflowableBookView.ts`

New private helpers route every scroll-mode read/write through one of two scroll containers:

- `scrollContainerMode` — getter, returns `"host"` or `"iframe"`.
- `getScrollOffset()` — reads `wrapper.scrollTop` (host) or `scrollingElement.scrollTop` (iframe).
- `setScrollOffset(n)` — writes the appropriate target.
- `getScrollExtent()` — `scrollingElement.scrollHeight` (same in both modes — iframe's internal document is the source of truth for content height).

Six scroll-mode call sites refactored to use the helpers:

- `getCurrentPosition()`
- `goToProgression()`
- `atStart()` / `atEnd()`
- `goToPreviousPage()` / `goToNextPage()`

Iframe sizing branched in `setSize()`:

- Paginated: iframe + `documentElement` constrained to `this.height`.
- Iframe-scroll: iframe at `this.height`; `documentElement` left unconstrained (so it overflows and scrolls).
- Host-scroll: iframe grows to `html.offsetHeight`.

`setIframeHeight()` (the debounced grow-to-content path) skips entirely in iframe-scroll mode.

`setMode(scroll)` computes `this.height = computeIframeContentHeight(...)` when entering scroll mode in iframe-scroll configuration, so `setSize()` has a target height to apply.

### `src/navigator/EpubNavigator.ts`

The scroll handler in `updateBookView()` is extracted into a single `onScroll` const, then attached to either `wrapper.onscroll` (host) or `iframe.contentWindow.onscroll` (iframe). Re-attached on every `updateBookView` call so chapter swaps (new `contentWindow`) get a fresh listener.

When iframe mode is active the wrapper handler is explicitly cleared (`wrapper.onscroll = null`) to avoid lingering reference if a previous load was in host mode.

### Module-level scroll reads (unchanged)

`TextHighlighter`, `Popup`, `LineFocusModule`, `ContentProtectionModule`, `TTSModule2` already read `iframe.contentDocument.scrollingElement.scrollTop`. In host mode that's always 0 (iframe doesn't scroll internally) so those reads behave as iframe-local positioning. In iframe mode they start returning meaningful values automatically. No code changes; behaviour becomes more consistent with what those modules were already written to assume.

## Not in this release

- **`ResizeObserver` alternate target** — there's no `ResizeObserver` in the codebase today, so no alternate to wire.
- **Explicit chapter-swap scroll reset** — `document.write` already resets the iframe's internal scroll to 0 on each chapter load.

## Integrator impact

| Change | Impact |
| --- | --- |
| `scrollContainer` added | Opt-in. Default `"host"` preserves existing behaviour byte-for-byte. |
| Iframe-scroll mode | Recommended when integrators inject styles that create a 100%-height chain on the iframe body, or whenever a fixed-viewport iframe makes more sense than a host-scrolling layout. |
| Locator portability | Position math computes the same ratio in both modes — saved positions transfer cleanly when an integrator switches modes. |
| Selection / annotations / TTS | Module code reading `iframe.contentDocument.scrollingElement.scrollTop` becomes more accurate in iframe mode (the iframe actually scrolls). No config change required. |

## Files changed

- `src/navigator/types.ts` — `scrollContainer` field added to `IFrameAttributes`.
- `src/views/ReflowableBookView.ts` — helpers + branched scroll-mode paths + iframe sizing branch + scroll-mode start setup.
- `src/navigator/EpubNavigator.ts` — scroll event source branch (`wrapper` vs `iframe.contentWindow`).
