# CHANGES — v3 Workstream 3.2: Navigator Refactor

Branch: `feature/v3-navigator-refactor` (based on `feature/v3-event-system`)

## Breaking Changes

### IFrameNavigator → EpubNavigator
- Class renamed from `IFrameNavigator` to `EpubNavigator`
- File renamed from `src/navigator/IFrameNavigator.ts` to `src/navigator/EpubNavigator.ts`
- Config interface renamed from `IFrameNavigatorConfig` to `EpubNavigatorConfig`
- **Migration:** `IFrameNavigator` and `IFrameNavigatorConfig` are exported as deprecated aliases — existing code continues to work but should be updated

### Navigation methods return `Promise<void>`
- `nextPage()`, `previousPage()`, `nextResource()`, `previousResource()`, `navigate()` now return `Promise<void>` instead of `void`
- Existing callers that don't `await` are unaffected (fire-and-forget still works)

## New Features

### VisualNavigator abstract class
- New base class: `Navigator` → `VisualNavigator` → `EpubNavigator` / `PDFNavigator`
- `NavigatorFeature` typed constants for capability queries (replaces `instanceof` checks)
- `supports(feature)` method — check capabilities at runtime without coupling to class hierarchy
- `goLeft()` / `goRight()` — RTL-aware spatial navigation

### FXL zoom/pan (#899)
- `zoomIn()` / `zoomOut()` / `fitToPage()` — exposed on both `EpubNavigator` and `D2Reader`
- Scrollable viewport: zoom container architecture with `margin: auto` centering and `overflow: auto` scrolling
- `activateHand()` / `deactivateHand()` — GrabToPan hand tool for panning (same API as PDF)
- Auto-activates pan when zoomed beyond fit, deactivates on fit-to-page
- Keyboard shortcuts: `+` / `-` / `0` keys for FXL books (attached to document + iframe docs)
- Pan overlay captures mouse events over iframes without blocking clicks at fit-to-page
- Dynamic scroll container bounds: adapts to timeline (left) and info-bottom (bottom) if present
- Drop shadow preserved with `box-sizing: content-box` for MUI/border-box compatibility
- Viewer: zoom/pan buttons shown for FXL books with active state sync

### Spine page-progression-direction
- `setDirection("auto")` now resolves from `readingProgression` and `rendition:spread-direction` metadata
- Falls back to `ltr` when auto and no metadata specified
- Applied for both FXL (spread flex order) and reflowable (keyboard RTL flag + direction event)
- CSS `writing-mode` support deferred to workstream 3.6

### FXL spread positioning
- Checks `properties.page` (left/right/center) from manifest before falling back to index parity
- Respects `rendition:spread: "none"` — forces single-page display for books that declare it
- Center pages (`page-spread-center`) skip loading the second iframe
- FXL-specific preferences (spread mode, fit mode, zoom persistence) deferred to workstream 3.12 (Preferences API)

## Bug Fixes

### MO click-to-jump after FXL page turn
- Media overlay click handler was only bound once in `startReadAloud()`
- After page turn, new iframe content documents lost the handlers
- Now re-binds after each `resourceReady` when MO is playing

### MO injectable fix
- Fixed FXL media overlay CSS injectable URL

## Architecture Changes

### BookView decoupled from navigator
- New `BookViewHost` interface replaces direct `EpubNavigator` back-reference
- `BookView`, `ReflowableBookView`, `FixedBookView` use `host: BookViewHost` instead of `navigator: EpubNavigator`
- Enables BookView reuse without navigator dependency

### Capability query system
- `NavigatorFeature` constants: `Search`, `Annotations`, `Bookmarks`, `TTS`, `MediaOverlays`, `ContentProtection`, `Timeline`, `PageBreaks`, `Definitions`, `LineFocus`, `History`, `Citations`, `Consumption`, `Zoom`
- `supports(feature: NavigatorFeatureName): boolean` — checks rights + module existence
- Navigator `instanceof` checks in `reader.ts` replaced with `supports()` or direct no-op calls

## Deferred

- **FXL search & annotations (#870)** — deferred to workstream 3.7 (TextHighlighter refactor)
- **Predictive spine prefetching** — moved to workstream 3.4 (Fetcher/Resource)
- **CSS writing-mode / vertical text (#1013)** — deferred to workstream 3.6 (ReadiumCSS v2)

## Migration Guide

```typescript
// Before
import { IFrameNavigator } from "@d-i-t-a/reader";

// After
import { EpubNavigator } from "@d-i-t-a/reader";
// Or keep using IFrameNavigator (deprecated alias, still works)

// Capability check — before
if (navigator instanceof IFrameNavigator && navigator.searchModule) { ... }

// Capability check — after
if (navigator.supports("search")) { ... }

// FXL zoom
d2reader.zoomIn();
d2reader.zoomOut();
d2reader.fitToPage();
d2reader.activateHand();   // enable pan
d2reader.deactivateHand(); // disable pan
```
