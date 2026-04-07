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

## Still pending under 3.3 (Part 2 — PDF)

`PDFNavigator` (~1100 lines) still violates the same separation 3.3 just enforced for EPUB. The PDF rework is the unfinished half of this workstream and will ship in a later alpha:

- Flesh out `PDFModuleHost` with real primitives (`pdfDoc`, `pdfViewer`, `currentPage`, `totalPages`, `goToPage`, `findController`, page-change event hook)
- Extract `PDFSearchModule` (wraps pdfjs `findController`)
- Extract `PDFAnnotationModule` (the ~150 lines of inline storage / serialization / rebuild logic)
- Extract `PDFBookmarkModule` (page-based, not href-based)
- Fix locator semantics: `locations.position` = document-wide, `locations.progression` = page progress, add `page` field
- Route `pagesloaded` / `pagechanging` through the typed event bus
- Decide PDF history strategy (share `HistoryModule` with single-resource support, or `PDFHistoryModule`)
- Kill `as any` casts where pdfjs types actually exist
- Update `NavigatorFeatureMap` with PDF-specific keys
