# CHANGES — v3 Workstream 3.3: Module Architecture (Part 1 — EPUB)

Branch: `feature/v3-module-architecture` (stacked on `feature/v3-navigator-refactor`)
Published as: `3.0.0-alpha.11`

> **Status:** Part 1 (EPUB module system) is complete. Part 2 (PDF rework — extracting `PDFSearchModule`, `PDFAnnotationModule`, `PDFBookmarkModule`, fleshing out `PDFModuleHost`, fixing locator semantics) is still pending under the same workstream and will ship in a later alpha.

---

## What Changed

The module system is replaced end-to-end with a typed, capability-keyed registry. The 13 `instanceof` checks in `EpubNavigator` are gone. Modules no longer receive a concrete navigator class — they bind to an abstract `EpubModuleHost` interface. Third-party custom modules are first-class.

### New core files

- `src/modules/ReaderModule.ts` — base interface, `HostType` const, `RightsKey` const
- `src/modules/ModuleHost.ts` — `ModuleHost` / `EpubModuleHost` / `PDFModuleHost` interface hierarchy
- `src/modules/ModuleRegistry.ts` — typed registry with rights gating and topological setup ordering
- `src/modules/ModuleAccessors.ts` — single source of truth for typed module getters
- `src/modules/NavigatorFeatureMap.ts` — typed mapping `NavigatorFeature.X → concrete module class`

### Key design points

- **Typed lookups via `NavigatorFeatureMap`** — `registry.get(NavigatorFeature.Bookmarks)` returns `BookmarkModule | undefined` natively. No `<any>` leaks through the public API.
- **`ModuleAccessors` single source of truth** — both `EpubNavigator` and `D2Reader` expose modules via `navigator.modules.bookmarks` etc. Adding a new built-in module = 1 getter in `ModuleAccessors` + 1 entry in `NavigatorFeatureMap`. No more 3-place edits.
- **`attach(host)` injection** — modules no longer expose a public mutable `host` field. The registry calls `module.attach(host)` during `register()`, and modules store the reference privately. Host is not observable from outside the module.
- **`rightsKey` on each module** — modules declare their gating flag (`RightsKey.Bookmarks` etc.). The registry filters disabled modules transparently. `EpubNavigator.supports()` shrunk from 30 lines + a 14-line static map to 8 lines.
- **`dependencies` field + topological `setupAll()`** — modules can declare dependencies on other modules; the registry uses Kahn's algorithm to order setup. Cycles warn and fall back to insertion order.
- **Typed `emit()` and `getModule()` on `ModuleHost`** — `host.emit(ReaderEvent.BookmarkCreated, bookmark)` is enforced against `ReaderEventMap`. `host.getModule(NavigatorFeature.X)` infers the concrete return type from `NavigatorFeatureMap`.
- **`HostType` and `RightsKey` constants** — typed literals (`as const satisfies Record<string, keyof ReaderRights>`) instead of bare strings. Renaming a `ReaderRights` field flags compile errors in `RightsKey`.
- **`VisualNavigator` base owns the registry** — both `EpubNavigator` and `PDFNavigator` inherit `registry` and `modules` from the abstract base. No subclass duplication.
- **Custom user modules** — `ReaderConfig.modules` accepts an array of `ReaderModule` instances. The navigator validates `hostType` at registration and rejects mismatches with a `log.warn`.

### Public API additions (exported from `index.ts`)

- `ReaderModule`, `HostTypeName`, `RightsKeyName` (types)
- `HostType`, `RightsKey` (consts)
- `ModuleHost`, `EpubModuleHost`, `PDFModuleHost` (types)
- `NavigatorFeatureMap`, `NavigatorFeatureKey` (types)
- `ModuleRegistry`, `ModuleAccessors` (classes)

### Cleanups bundled in

- 13 modules updated: `private host!`, `attach()`, `hostType = HostType.X`, `rightsKey = RightsKey.X`
- Stale `as TTSModule2` casts removed (6 sites — 4 in EpubNavigator, 2 in TextHighlighter); typed `modules.tts` getter eliminated the need
- 21 redundant `getModule<X>(NavigatorFeature.X)` explicit type generics removed across 8 module files; the typed `getModule` infers via the FeatureMap
- Per-module `private rights: Partial<ReaderRights>` field removed from `BookmarkModule`, `AnnotationModule`, `TTSModule2` — modules now read from `this.host.rights` directly (the pattern `TimelineModule` already used). The `rights` constructor parameter and `Config` interface field are also removed (the `Config` interfaces are not exported, only used internally)
- `customKeyboardEvents` and `autoGeneratePositions` (the two non-module-gating `ReaderRights` fields) continue to be read directly from the host
- Inline `import("./X")` uglies in `ModuleRegistry` and `ModuleHost` signatures replaced with top-of-file imports
- `VisualNavigator.supports()` made `abstract` — no silent `false` default
- Bare `"epub"` / `"pdf"` strings in registration sites (`EpubNavigator`, `reader.ts` PDF path) replaced with `HostType.Epub` / `HostType.PDF`

## Examples

- `viewer/index_dita.html` — `VocabularyBuilder` (custom EPUB module): double-click words in the book → adds them to a vocabulary list, logs to console
- `viewer/index_pdf.html` — `PageTimeTracker` (custom PDF module): tracks time spent per page
- `examples/custom-module.ts` — TypeScript reference for both, with `attach(host)`, `HostType.Epub`/`HostType.PDF`

## What Breaks

### For integrators consuming D2Reader API

**Nothing breaks.** The `D2Reader.load()` API, all reader methods (`saveBookmark`, `addAnnotation`, `search`, etc.), event subscriptions, and module config objects (`bookmarks: { ... }`, `annotations: { ... }`) continue to work exactly as before.

### For integrators writing custom `ReaderModule` implementations

The `ReaderModule` interface changed shape. If you have a class implementing `ReaderModule`:

**Before (v2.5):**
```ts
class MyModule implements ReaderModule {
  navigator: IFrameNavigator;
  // ... your fields
  async stop() { /* ... */ }
}
// Registered via instanceof check inside EpubNavigator
```

**After (3.0.0-alpha.11):**
```ts
import { ReaderModule, HostType, EpubModuleHost } from "@d-i-t-a/reader";

class MyModule implements ReaderModule<EpubModuleHost> {
  readonly name = "my-module";
  readonly hostType = HostType.Epub;
  // optional: readonly rightsKey = "enableMyFeature";
  // optional: readonly dependencies = [NavigatorFeature.Bookmarks];

  private host!: EpubModuleHost;
  attach(host: EpubModuleHost): void { this.host = host; }

  async setup() { /* one-time init */ }
  onResourceReady() { /* called on each new resource */ }
  stop() { /* cleanup */ }
}

// Pass the instance through ReaderConfig.modules:
D2Reader.load({ ..., modules: [new MyModule()] });
```

Migration checklist for custom modules:
1. Add `readonly name`, `readonly hostType`, and (optionally) `readonly rightsKey` and `readonly dependencies`
2. Replace public `navigator: IFrameNavigator` with `private host!: EpubModuleHost` + `attach(host)` method
3. Migrate `this.navigator.X` references to `this.host.X` (the host interface exposes the same EPUB-specific properties)
4. Pass the module via `D2Reader.load({ modules: [...] })` instead of any prior manual registration

## Part 2 — PDF Navigator Rework (3.0.0-alpha.13)

PDFNavigator slimmed from 1073 to 762 lines. All `as any` / `as unknown` casts removed (0 remaining). Five PDF modules extracted, four shared interface contracts added.

### Shared interface contracts

Four interfaces define the lowest-common-denominator API that both EPUB and PDF modules implement. Integrator code using these interfaces works regardless of navigator type.

- `IBookmarkModule` — `save()`, `delete(bookmark)`, `list()`, `isCurrentBookmarked()`
- `ISearchModule` — `search(query, ...args)`, `clear()`
- `IAnnotationModule` — `getAll()`, `clear()`
- `IHistoryModule` — `back()`, `forward()`, `push(locator)`, `canGoBack()`, `canGoForward()`

EPUB modules (`BookmarkModule`, `SearchModule`, `AnnotationModule`, `HistoryModule`) implement the interfaces with backwards-compatible aliases for existing method names (`saveBookmark` -> `save`, `clearSearch` -> `clear`, `historyBack` -> `back`, etc.).

`NavigatorFeatureMap` values for these four keys changed from concrete EPUB classes to the shared interfaces. `ModuleAccessors` is now generic so EpubNavigator gets concrete EPUB types internally while D2Reader sees the interface types.

### PDF modules extracted

| Module | Replaces | Lines moved |
|---|---|---|
| `PdfBookmarkModule` | `PDFNavigator.saveBookmark/deleteBookmark/getBookmarks/isCurrentPageBookmarked` | ~45 |
| `PdfSearchModule` | `PDFNavigator.find/findNext/findPrevious` + pdfjs `PDFFindController` state tracking | ~37 |
| `PdfAnnotationModule` | Annotation persistence (~230 LOC): save/restore lifecycle, pending queue, debounced save, `onSetModified` wiring, `toJsonSafe` TypedArray conversion | ~230 |
| `PdfHistoryModule` | New — stack-based page history with `back()`/`forward()` (distinct from pdfjs `PDFHistory` browser integration) | ~85 |
| `PdfViewSettingsModule` | Zoom, scroll mode, spread mode, rotation + persistence via viewStore | ~150 |

All registered under the same `NavigatorFeatureMap` keys as their EPUB counterparts (except `PdfViewSettingsModule` which has a new `viewSettings` key).

### PDFModuleHost fleshed out

`PDFModuleHost` expanded from empty marker to a real interface exposing: `pdfDoc`, `pdfViewer`, `findController`, `eventBus`, `linkService`, `currentPage`, `totalPages`, `fingerprint`, `goToPage()`, `viewStore`, `annotator`, `currentResourceLink`. PDFNavigator implements all fields via getters.

### Locator semantics fix

- New `Locations.page` field — 1-based page number for paginated formats (PDF, fixed-layout EPUB)
- `PDFNavigator.currentLocator()` now returns `locations.page` instead of incorrectly using `locations.position` as a page number
- `getPageFromLocations()` migration helper — reads `page` if present, falls back to `position` for backwards compatibility with pre-rework bookmarks and reading positions
- Bookmarks and reading positions now write `locations.page` on save; reads accept either field

### Bug fixes

- **`notifyResourceReady` on every page change** — removed the `registry.notifyResourceReady()` call from the `pagechanging` event handler. Resources don't change on page turn; resource-ready fires only from `pagesloaded`. This was the bug behind `PageTimeTracker` firing on every page in the Part 1 example.
- **Annotation lifecycle race across document switches** — fixed naturally by moving the pending queue into `PdfAnnotationModule` with an explicit `onResourceReady` lifecycle hook that resets state for the new fingerprint.

### Cast cleanups

- `src/types/pdfjs-workarounds.ts` — typed helper functions centralizing 7 pdfjs typing gaps (`onSetModified`, `setDocument(null)`, `findController.state`). All call sites use the helpers; zero `as any` on pdfjs APIs elsewhere.
- Remaining 4 casts in PDFNavigator (locator fake, TypedArray conversion, bitmap check, annotation value) addressed via the locator fix, type guards, and module extraction.
- PDFNavigator final state: **0 `as any` casts, 0 `any` types** in the entire file.

### Hardcoded values and untyped returns

- `readingOrder()`, `tableOfContents()`, `landmarks()`, `pageList()` return types fixed from `any` to `Link[]`
- `positions()` return type fixed from `any` to `Locator[]`

### Navigator zoom delegation

PDFNavigator zoom methods (`fitToWidth`, `fitToPage`, `zoomIn`, `zoomOut`) and `scroll()` now delegate to `PdfViewSettingsModule` instead of duplicating the logic. The module handles persistence; the navigator methods stay as thin pass-throughs because `D2Reader` calls them via `this.navigator.fitToPage()`.

### New `NavigatorFeature` and `RightsKey` entries

- `NavigatorFeature.ViewSettings: "viewSettings"` — PDF-only for now

### Registration flow

`reader.ts` constructs the 5 built-in PDF modules and passes them through `PDFNavigator.create({ modules: [...builtIns, ...userModules] })`. PDFNavigator's constructor validates `hostType` and registers via the same `registry.register(module, this)` path as EpubNavigator.

### Examples updated

- `viewer/index_pdf.html` `PageTimeTracker` — uses `currentLocator().locations.page` instead of `locations.position`
- `examples/custom-module.ts` PDF example — same fix
