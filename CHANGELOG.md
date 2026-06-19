# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-3.0 entries below predate the convention.

## [3.0.0-beta.1] — 2026-06-18

The v3 line is a major architectural overhaul on top of v2.5. The public `D2Reader` load / navigate / event surface is stable; the breaking surface is concentrated in class names, constructor signatures, property casing, custom-module interfaces, and a set of CSS class renames. New functionality covers audiobooks, RTL, CJK vertical, ReadiumCSS v2, and client-side EPUB parsing.

The 2026-06-18 update on top of `3.0.0-alpha.23` lands the multi-user state-isolation contract, a PDF annotation api rework that matches EPUB's shape, and Readium-spec compliance for PDF locators. See [`MIGRATION.md`](./MIGRATION.md) for the upgrade path from `3.0.0-alpha.23`.

See [`MIGRATION.md`](./MIGRATION.md) `## 2.5.x -> 3.x` for the integrator upgrade guide.

### Added

#### Multi-user state isolation (2026-06-18)
- `null`-clear contract across every persistent settings/state field — pass `null` to wipe the local cache and fall back to library defaults. Closes the cross-user shared-browser leak where User 2's session inherited User 1's LocalStorage values. Applies to top-level `userSettings`, `lastReadingPosition`, `tts`, `mediaOverlays`.
- `initialAnnotations` is now treated as the canonical source of truth when present — even an empty `{ bookmarks: [], highlights: [] }` overwrites local storage. Previously, an empty list fell through and the prior user's data remained.
- `Annotator.clearLastReadingPosition()` method added to support the `lastReadingPosition: null` contract.

#### PDF view settings + audiobook playback settings (2026-06-18)
- `PdfViewSettingsModule` now accepts an `api.updateSettings(snapshot)` callback. Fires on every user-driven change (zoom, scroll mode, spread, rotation) with the full current snapshot. Integrators can persist server-side instead of relying on local `viewStore`.
- `AudiobookSettings` now accepts an `api.updateSettings(snapshot)` callback. Same shape — fires on every change (volume, rate, autoplay, intervals, timeline mode).
- Both modules accept format-shaped `initial` settings on construction, with the same `null`-clear semantic.

#### PDF locator (2026-06-18)
- `PDFNavigator.currentLocator()` now returns full Readium-shape `locations`: adds `position` (1-based publication-wide index) and `totalProgression` (0–1 across the publication, computed from the resource's reading-order index + within-resource progression).

### Added

#### Navigators
- `AudiobookNavigator` — `Navigator` implementation for Readium Audiobook Profile publications. `D2Reader.load()` dispatches to it when `manifest.conformsTo` includes `Profile.AUDIOBOOK`. Owns a persistent `AudioEngine` for its lifetime; track transitions go through `engine.changeSrc(source)`.
- `VisualNavigator` — abstract base class for visual-content navigators (EPUB + PDF). Separates visual-only concerns from the cross-navigator `Navigator` interface.
- `VerticalRenderer` — runs `cjk-vertical` and `mongolian-vertical` content. Horizontal scroll axis; iframe grows in width to fit content; always iframe-scroll regardless of `attributes.scrollContainer`; `verticalRtl: boolean` constructor flag.

#### Audiobook support
- Pluggable engine layer: `AudioEngine` interface, `EngineFactory`, `AudioSource` discriminated union (`url` / `drm` / `hls` / `vendor`). Default `WebAudioEngine` — `<audio>` fast path with lazy Web Audio worklet fallback for pitch preservation. Integrators wrap vendor / DRM / HLS sources via a custom factory.
- `PreservePitchProcessor` — Web Audio worklet (phase-vocoder pitch shifter). Loaded by URL only on browsers lacking native `HTMLMediaElement.preservesPitch`. Build copies it to `dist/`.
- `AudioPool` — hidden `<audio preload="auto">` for current ± 1 neighbor tracks (warm-cache pattern, not a guarantee of zero-latency transitions).
- Public surface: `play / pause / seek / jump / skipForward / skipBackward / nextChapter / previousChapter / setPlaybackRate / setVolume / setMuted`.
- Read-only state: `currentTime`, `duration`, `isPlaying`, `isPaused`, `isWaiting`, `isTrackStart`, `isTrackEnd`, `canGoForward`, `canGoBackward`, `currentLocator()`.
- `goTrack(index, time)` — single navigation entry point with `navigationId` supersession (rapid clicks don't pile up promises; older navigations abandon).
- `AudiobookSettings` persisted preferences module: `volume`, `playbackRate`, `preservePitch`, `skipForwardInterval`, `skipBackwardInterval`, `pollInterval`, `autoPlay`, `enableMediaSession`, `timelineMode` (`"chapter"` / `"book"` / `"both"`).
- `AudiobookBookmarkModule` — timestamped, persisted via `LocalAnnotator`. `findBookmarkAt` with ±1s tolerance. Optional integrator-rendered chapter-grouped list.
- `AudiobookCommentsModule` — point-anchored, time-stamped comments. `onEdit` integrator hook. Optional rendered list. Emits `comments.created` / `updated` / `deleted` / `active`.
- `AudiobookTimelineModule` — chapter-scoped + whole-book scrubber UI + timeline math API. Calls `prefetchResource` on drag.
- `SleepTimer` — minutes mode + end-of-chapter mode. Wall-clock based. Emits `sleeptimer.started` / `tick` / `expired` / `cancelled`.
- `MediaSessionController` — `navigator.mediaSession.metadata` + action handlers (lock screen, media keys, CarPlay / Android Auto). Gated by `enableMediaSession`.
- Reading-position auto-restore — debounced on `timeupdate`, flushed on pause / track change / visibility-hidden / stop.
- `Locator` extension — additive `time` (seconds) + `fragments` (Media Fragments URI tokens) on `Locations`. New helpers `locationsFromTime`, `getTimeFromLocations`, `mediaFragments.ts` parser + serializer. EPUB / PDF Locators round-trip unchanged.
- Audiobook color CSS custom properties: `--dita-audiobook-track`, `--accent`, `--accentFade`, `--comment`, `--boundary`.
- Consolidated `audiobook` field on `ReaderConfig`: `userSettings`, `timeline`, `bookmarks`, `comments`, `preservePitchWorkletUrl`, `chapterListContainer`, `colors`, `prefetch`.
- `ChapterPrefetcher` — head-of-chapter HTTP `Range: bytes=0-N` prefetch. Disabled by default; head-only caching doesn't satisfy the audio element's `HAVE_FUTURE_DATA` threshold, so on its own it doesn't shorten time-to-audible.

#### RTL & CJK support
- `ScriptMode` type: `"ltr" | "rtl" | "cjk-horizontal" | "cjk-vertical" | "mongolian-vertical"`. Derived once at construct time from `metadata.languages` + `readingProgression` via `getScriptMode(publication)`.
- Script mode propagation: `EpubNavigator.scriptMode` (readonly), `UserSettings.scriptMode` (drives renderer selection), `InjectableContext.scriptMode` (passed to `when` predicates), `D2Reader.scriptMode` (public getter).
- Renderer selection by `scriptMode` × layout:
  | scriptMode | Layout | Renderer |
  |---|---|---|
  | `cjk-vertical` | reflowable | `VerticalRenderer(verticalRtl=true)` |
  | `mongolian-vertical` | reflowable | `VerticalRenderer(verticalRtl=false)` |
  | `rtl` | reflowable + paginated | `ColumnRenderer(rtl=true)` |
  | `rtl` | reflowable + scroll | `ScrollRenderer` |
  | `ltr` / `cjk-horizontal` | reflowable + paginated | `ColumnRenderer(rtl=false)` |
  | `ltr` / `cjk-horizontal` | reflowable + scroll | `ScrollRenderer` |
  | any | fixed | `FixedRenderer` |
- RTL paginated math — `ColumnRenderer` supports RTL natively: `publicationRtl: boolean` constructor flag, `scrollLeft` sign normalization, RTL-corrected `goToElement`.
- Spacer system overhaul — `padOddColumns()` dispatches to 4 variants by direction × column-count: `padOddColumnsLtrSingle`, `padOddColumnsLtrMulti` (3+), `padOddColumnsRtlSingle`, `padOddColumnsRtl` (3+) with corresponding spacer-id schemes.
- Phantom-column rounding — LTR under-counts (`Math.ceil`), RTL over-counts (`Math.floor`) on `body.scrollWidth` sub-pixel drift.
- Page-aligned navigation — `atEnd()` and `goToNextPage()` gate on `(getPageCount() - 1) * getPageWidth()`, not rounded `scrollWidth`.
- Four-sided `safeArea` — `safeAreaInset(side, parent, attributes)` helper with position-based inset math (chrome bottom − parent top, etc.). Floors at 0.
- `computeIframeContentHeight` / `computeIframeContentWidth` — sum `safeAreaInset` for both axes. `applyIframeSafeAreaMargins` writes all four margin sides.
- Renderer-authoritative scroll surface — `Renderer.getScrollSurface()` returns `{ kind: "host"; element } | { kind: "iframe"; iframe }`.
- Iframe `dir` propagation — `EpubNavigator.applyScriptModeAttributes` sets `dir` on iframe `<html>` and `<body>` for LTR / RTL when the author hasn't.
- Body class tagging — `document.body` gets `script-<mode>` and `script-vertical` post-load.
- Mongolian vertical via `VerticalRenderer(verticalRtl=false)`.

#### ReadiumCSS v2 (v1 still supported)
- Both v1.1.x and v2.0.x cascade variants supported simultaneously; the same `injectables` config selects either.
- 17 new v2-only user settings: `lineLength`, `fontWeight`, `fontWidth`, `fontOpticalSizing`, `ligatures`, `linkColor`, `visitedColor`, `selectionBackgroundColor`, `selectionTextColor`, `blendImages`, `darkenImages`, `invertImages`, `invertGaiji`, `scrollPaddingTop`, `scrollPaddingBottom`, `scrollPaddingLeft`, `scrollPaddingRight`.
- Dual-applicator pattern — `UserSettings` writes both v1 and v2 CSS custom properties so the same settings work against either cascade.
- Pixel-perfect color presets against v1 — Day, Sepia, Night plus link / visited / selection colors.
- Auto column count — `UserSettings.applyProperties` computes 1–4 columns from viewport width (breakpoints `<600` / `600-1199` / `1200-1799` / `≥1800`).
- `pageMargins` → `lineLength` mapping with viewport breakpoints (replaces v1's direct page-margins var).
- CJK-horizontal conditional bundle — separate `before` / `default` / `after` files under `cjk-horizontal/` with CJK-appropriate defaults; loaded via `Injectable.when` predicate.
- CJK-vertical bundle + dita-patch (overflow rules + scroll-padding moved to `html`).
- `@readium/css` consumed from npm (`^2.0.5` as runtime dependency).
- `ReadiumCSS-dita-patch.css` overlay retained (image / svg / video no-stretch via `width: revert-layer` + line-height compensation formula for CJK / Indic scripts).
- iPadOS patch wired automatically — `isIPadOS()` detection (Mac UA + max touch points heuristic) writes `readium-iPadOSPatch-on` class.
- Language-specific font stacks via ReadiumCSS v2.0.5: ja / zh / ko / he / hi / th / ta / te / si / pa / or / ml / lo / kn / km / iu / hy + Japanese vertical variants.

#### Fetcher, Resource & Container
- Clear system boundaries: Fetcher (resource access), Modules (feature logic), Injectables (content-document injection). Zero raw `fetch()` calls from `Publication` or modules.
- `Container` interface (`entries`, `get`, `has`, `destroy`).
- `ZipContainer` implementation using `fflate` for in-browser ZIP decompression.
- Composable `Fetcher` chain: `Cache → Base64Decoding? → Content → Transform → Http / Zip`, each layer optional:
  - `HttpFetcher` — typed errors via `ReadError`.
  - `Base64DecodingFetcher` — gates on `requestConfig.encoded`.
  - `ContentFetcher` — wraps integrator's `api.getContent` callback.
  - `CacheFetcher` — request coalescing + predictive prefetch.
  - `TransformingFetcher` — applies `ResourceTransform` functions in order.
  - `ZipFetcher` — reads from `Container`.
- `Resource` interface — `text()`, `bytes()`, `headers()`, `mediaType`, `href`, `properties`.
- `ReadError` typed discriminated union — `access` / `decoding` / `cancelled`.
- `EpubParser` — full OPF parser (EPUB 2 + 3) → Readium RWPM manifest.
- `BlobUrlManager` — blob URL allocation + DOM rewriting before `document.write()` (for font deobfuscation + offline content).
- `FontDeobfuscator` — IDPF + Adobe deobfuscation algorithms, `encryption.xml` parsing.
- `mediaType.ts` — `guessMediaType` utility for content-type inference.
- Direct EPUB / Blob / File opening — no server required; client-side parsing including font deobfuscation. New `D2Reader.load({ url: epubBlob })` path.

#### Events
- Typed `ReaderEvent` constants + `ReaderEventMap` — type-safe event names with typed payloads. Old string-keyed listeners still work; the new constants are opt-in.
- Callbacks vs events distinction — callbacks are bidirectional (integrator can return values that influence behavior); events are one-way notifications.
- New event entries:
  - Bookmarks: `bookmark.created`, `bookmark.deleted`.
  - Annotations: `annotation.created`, `annotation.deleted`, `annotation.updated`, `annotation.selected`, `annotation.comment.added`.
  - Selection: `text.selected` (with `{ text, selection }`).
  - Citations: `citation.created`, `citation.failed`.
  - Location: `location.changed` (`ReadingPosition` payload).
  - Errors: `error` (`Error` payload).
  - Consumption: `consumption.action`, `consumption.idle`.
  - Read-along (Media Overlays): `readalong.started`, `readalong.stopped`, `readalong.paused`, `readalong.resumed`, `readalong.finished` (each with `href`).
  - Audiobook playback: `playback.started`, `playback.paused`, `playback.ended`, `playback.stalled`, `playback.error`, `playback.timeupdate`, `playback.trackchanged`, `playback.durationchanged`, `playback.ratechanged`, `playback.waiting`.
  - Sleep timer: `sleeptimer.started`, `sleeptimer.tick`, `sleeptimer.expired`, `sleeptimer.cancelled`.
  - Comments: `comments.created`, `comments.updated`, `comments.deleted`, `comments.active`.
- `playback.waiting` — single event covering cross-chapter navigation, cold-start before bytes arrive, and mid-playback rebuffer. Drives integrator's spinner UI.

#### Modules & registry
- Typed module registry — `registry.get(NavigatorFeature.X)` returns the concrete module type. No `any` casts, no `instanceof` dispatch.
- `NavigatorFeature` typed constants (15 entries): `Search`, `Annotations`, `Bookmarks`, `TTS`, `MediaOverlays`, `ContentProtection`, `Timeline`, `PageBreaks`, `Definitions`, `LineFocus`, `History`, `Citations`, `Consumption`, `Zoom`, `ViewSettings` (PDF-only).
- `supports(feature)` method on `Navigator` for capability queries (replaces `instanceof` patterns).
- `ModuleHost` hierarchy — `ModuleHost` (cross-navigator minimum: `fetcher`, lifecycle) → `VisualModuleHost` (`DOM`, `settings`) → `EpubModuleHost`, `PDFModuleHost`, `AudiobookModuleHost` (adds `prefetchResource`).
- `ReaderModule` lifecycle: `attach(host: ModuleHost): void`. Required fields `name` and `hostType`; optional `rightsKey` (`ReaderRights` gating) and `dependencies` (Kahn topological sort).
- Shared interface contracts — `IBookmarkModule`, `ISearchModule`, `IAnnotationModule`, `IHistoryModule` implemented by both EPUB and PDF flavors.
- Custom modules first-class — register via `ReaderConfig.modules`; registration validates `name`, `hostType`, optional `rightsKey`, optional `dependencies`.
- `Locations.page` — new 1-based page index for paginated formats. `getPageFromLocations()` migration helper.

#### Fixed-Layout (FXL)
- Zoom API: `zoomIn`, `zoomOut`, `fitToPage` on both `EpubNavigator` and `D2Reader`. Auto-activates pan mode when zoomed beyond fit.
- Pan API: `activateHand` / `deactivateHand` toggle GrabToPan. Pan overlay captures mouse events over iframes.
- Keyboard shortcuts: `+` (zoom in), `-` (zoom out), `0` (reset / fit to page).
- Dynamic scroll container bounds adapt to timeline (left edge) and info-bottom (bottom edge) when present.
- Viewer zoom/pan buttons — active state syncs with navigator state.
- Spread positioning from publication metadata — checks `properties.page` (`left` / `right` / `center`); respects `rendition:spread:"none"`. Center pages skip the second iframe.

#### Content Protection
- `viewportSlack` config — number or per-side object (`top`, `bottom`, `left`, `right`) for tuning pre-render slack when classifying rects as outside the viewport.

#### Architecture
- New `EpubParser` (full OPF parser EPUB 2 + 3 → Readium RWPM manifest).
- `Renderer` hierarchy: `Renderer` abstract → `ReflowableRenderer` abstract + `FixedRenderer`; `ReflowableRenderer` → `ColumnRenderer`, `ScrollRenderer`, `VerticalRenderer`.
- `Injectable` discriminated union (`style` / `script` / `style-inline` / `script-inline`) with pre-write head injection via `InjectableManager.injectStaticIntoDoc()`.
- `InjectableContext` passed to `when` predicates so modules select ReadiumCSS variants per script mode without re-walking metadata.

#### Performance
- `CacheFetcher` — request coalescing (deduplicates concurrent reads of the same href) + predictive prefetch.
- `ChapterPrefetcher` — head-of-chapter HTTP `Range` prefetch (audiobook only, disabled by default).

#### Examples & demo viewers
- Framework example projects: Vue, React, Angular, Next.js, Remix, Vanilla — each with its own README documenting the npm-based ReadiumCSS path.
- Audiobook demo viewers — full-featured (`viewer/index_audiobook.html`) and minimal template (`viewer/index_audiobook_minimal.html`).
- DITA reader v2 demo viewer (`viewer/index_dita_v2.html`) covering all four script modes (LTR / RTL / CJK-horizontal / CJK-vertical) with injectable `when` predicates.
- Small-window framed reader (`viewer/index_small_window.html`, 600 × 500) demonstrating four-sided `safeArea` and integrator-supplied `lastReadingPosition`.
- Bookmark drawer (list, jump, delete, toggle) in `viewer/index_epub_file.html` using `findBookmarkAt()` / `hasBookmarkAt()`.

#### Tooling
- `npm run lint:css-vars` — CSS variable validator: every TS-side ReadiumCSS write is consumed by upstream CSS (v1 in-tree, v2 from npm) or in the documented allow-lists.
- vitest test framework with starter coverage across model, `Locator`, `ReadiumCSS`, `LocalAnnotator`, `MemoryStore`, `CitationModule`.
- TypeScript strict mode enforced across new v3 code.

#### Dependencies
- `@readium/shared@^2.1.5` added as runtime dependency.
- `@readium/css@^2.0.5` added as runtime dependency.

### Changed

#### API shapes (2026-06-18)
- **PDF annotation api: snapshot → per-item.** `pdf.annotations.api.saveAnnotations(state)` removed. Replaced with `addAnnotation` / `updateAnnotation` / `deleteAnnotation` callbacks — same shape as EPUB highlights. Each callback receives an `Annotation` locator, awaits before local persist, and returns the (possibly server-stamped) locator. Server can refuse, mutate id, etc.
- **PDF annotations are now `Annotation` locators.** Stored on the wire + locally as proper `Annotation[]` with `href` (relative), `locations.page`, `id`, `created`, `text.highlight`, `highlight.color`, plus a `pdfHighlight?: Record<string, unknown>` field carrying the pdfjs editor blob (rects, quadPoints, color, opacity, etc.) needed for faithful restore. Drop-in compatibility with EPUB's `initialAnnotations.highlights` field — pass them through the same top-level config.
- **`Annotation.id` typed `string`** (was `any`). All callsites already used strings.
- **Top-level `userSettings` polymorphic by format.** One config field, the library routes to the matching settings class based on the publication format: EPUB → typography, PDF → scroll/spread/scale/rotation, Audiobook → volume/rate/autoplay. Top-level `api.updateSettings` receives the format-specific snapshot.
- **All persisted locator hrefs are relative.** Bookmarks, highlights, comments, and last reading position now write `href` relative to the publication root (e.g. `Texas.pdf`, not `https://yourhost/.../Texas.pdf`). Affects PDF bookmarks, audiobook bookmarks + comments, and the PDF last reading position. EPUB was already relative; matches that pattern across the board. `PDFNavigator.restoreLastReadingPosition` retains a backwards-compat path that resolves either shape so old saved positions still load.

#### Renames
- `IFrameNavigator` → `EpubNavigator`. `IFrameNavigatorConfig` → `EpubNavigatorConfig`. Deprecated aliases retained for one release.
- `BookView` → `Renderer` (abstract base). `ReflowableBookView` split into `ReflowableRenderer` (abstract) + `ColumnRenderer` + `ScrollRenderer` + `VerticalRenderer`. `FixedBookView` → `FixedRenderer`.
- `getColumnWidth` → `getPageWidth` across the `Renderer` interface (return value is `clientWidth`, not column width).
- `setIframeHeight` → `growIframeToContent` across `Renderer`, `ScrollRenderer`, `VerticalRenderer`, and `EpubNavigator` call sites.
- `BookView` decoupled from navigator — now consumes a `BookViewHost` interface instead of holding a navigator reference.
- Bookmark API:
  - `getCurrentBookmark()` → `findBookmarkAt(locator?)` (returns stored `Bookmark` with `id` or `null`).
  - `isCurrentBookmarked()` → `hasBookmarkAt(locator?)` (boolean).
  - `D2Reader.currentBookmark` (getter) → `D2Reader.findBookmarkAt(locator?)` (method).
  - `D2Reader.isCurrentBookmarked` (getter) → `D2Reader.hasBookmarkAt(locator?)` (method).
  - Both methods take an optional locator; default is the reader's current position; work on EPUB and PDF.
- `ContentProtectionModule.wrapper` → `ContentProtectionModule.scrollSurface` (set from `host.view.getScrollSurface()` in `initialize()`).

#### Constructor signatures
- `PDFNavigator` consolidated from 8 positional args to a single `PDFNavigatorConfig`. Integrators using `D2Reader.load()` are unaffected.
- All 5 PDF modules (`PdfBookmarkModule`, `PdfSearchModule`, `PdfAnnotationModule`, `PdfHistoryModule`, `PdfViewSettingsModule`) take static dependencies (`annotator`, `viewStore`, `publication`) via constructor injection — same shape as EPUB modules.

#### `Publication` / `Link` property casing
PascalCase → camelCase. Affects only code that reads them directly — most integrators using the `D2Reader` API don't see this:

| Before | After |
|---|---|
| `publication.Metadata` | `publication.metadata` |
| `publication.Metadata.Title` | `publication.metadata.title` (LocalizedString) |
| `publication.Metadata.Language` (singular) | `publication.metadata.languages` (Array) |
| `publication.Metadata.PublicationDate` | `publication.metadata.published` |
| `publication.Metadata.Direction2` | `publication.metadata.readingProgression` |
| `publication.Metadata.BelongsTo.Series` | `publication.metadata.belongsToSeries` |
| `publication.Spine` | `publication.readingOrder` |
| `publication.TOC` | `publication.tableOfContents` |
| `link.Href` | `link.href` |
| `link.HrefDecoded` | `link.hrefDecoded` |
| `link.TypeLink` | `link.type` |
| `link.Title` | `link.title` |
| `link.Children` (Array) | `link.children?.items` |
| `link.Rel` (Array) | `link.rels` (Set) or `link.relArray` (Array) |
| `link.Properties.MediaOverlay` | `link.mediaOverlay` (direct getter) |
| `link.MediaOverlays` | `link.mediaOverlayNode` |
| `metadata.Authors` | `publication.metadata.authors?.items` (Contributors wrapper) |
| `metadata.Publishers` | `publication.metadata.publishers?.items` |

JSON deserialization now uses `@readium/shared`'s `Manifest.deserialize()` instead of `ta-json-x` decorators.

#### CSS class renames (1 ID + 13 classes)
Reader-shell selectors now prefixed with `dita-` to avoid framework collisions (Bootstrap, Vuetify, MUI):

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

Distinctive-name selectors unchanged: `.bookmarks-view`, `.contents-view`, `.highlights-view`, `.landmarks-view`, `.pageList-view`, `.settings-view`, `.range-slider`, `.grab-to-pan-grab`, `.grab-to-pan-grabbing`, `.highlight-toolbox`, `.sidenav`, `.scrubber`, `.collection-item`, `.collection-header`.

#### `IFrameAttributes` config
- `margin` is now optional (was required).
- Iframe height formula changed to `parent − safeArea.top − safeArea.bottom − iframe.padding − margin` (was `viewport − 40 − margin`). Visually verify the reader after upgrading — all integrators' iframe heights are different.
- Default `verticalAlign: "top"` eliminates the inline-baseline gap.

#### Custom-module interface
- `ReaderModule` now requires `readonly name: string` and `readonly hostType: HostType` (`EPUB` / `PDF` / `AUDIOBOOK`).
- Optional fields: `readonly rightsKey?: keyof ReaderRights`, `readonly dependencies?: string[]`.
- Lifecycle method `attach(host: ModuleHost): void` replaces the prior `navigator` field. Modules access the navigator via `this.host`.
- 13 built-in EPUB and 5 built-in PDF modules already conform.

#### Custom-module host
- `ModuleHost` gains `fetcher` field so modules access resources through the chain.
- `Resource` interface gains `properties` field for per-resource transform metadata.
- `ModuleHost` hierarchy split: `ModuleHost` (cross-navigator minimum) → `VisualModuleHost` (adds `DOM`, `settings`) → `EpubModuleHost`, `PDFModuleHost`. `AudiobookModuleHost` extends `ModuleHost` directly with `prefetchResource`. Custom-module authors pick the host shape matching their `hostType`.

#### `Publication` API signatures (direct callers only)
- `Publication.fromUrl(url, requestConfig, fetcher)` — `Fetcher` required as third argument.
- `Publication.autoGeneratePositions(requestConfig, getContentBytesLength)` — callback required (replaces internal raw `fetch`).
- `Publication.fetchPositionsFromService(fetcher)` and `Publication.fetchWeightsFromService(fetcher)` — take a `Fetcher`.

#### Navigator lifecycle
- `EpubNavigator.stop()` now removes iframes from the DOM (was leaving them orphaned).

#### ReadiumCSS behavior (v2 cascade)
- `--USER__hyphens`, `--USER__lineHeight`, `--USER__wordSpacing` are now `var(...) !important` — reader-pref typography wins over publisher CSS unconditionally.
- Fonts no longer bundled — host via `@font-face`.
- Publisher heading colors get overridden by themes (more aggressive than v1).
- Publisher fonts fully overridden when `fontFamily` is set.
- Auto column count — library computes 1–4 columns from viewport width (breakpoints `<600` / `600-1199` / `1200-1799` / `≥1800`); v2 native responsive-column queries removed.
- `fontFamily: "Original"` clears the CSS var instead of setting it to the literal string `"Original"`.
- iPadOS patch — `EpubNavigator` auto-writes `readium-iPadOSPatch-on` class when iPadOS is detected.

#### ReadiumCSS file paths
The manually-copied snapshot under `viewer/readium-css-v2/` is gone. Integrators with forked demo viewers pointing at `/viewer/readium-css-v2/<upstream>.css` need to repoint to one of:
- `/node_modules/@readium/css/css/dist/<upstream>.css` (dev server serving `/node_modules/`).
- A copied-to-public path (production: `cp -r node_modules/@readium/css/css/dist <public>/readium-css-v2`).
- A CDN URL (e.g. `https://unpkg.com/@readium/css@<version>/css/dist/<upstream>.css`).

The two local DITA patch overlays stay at `viewer/readium-css-v2/ReadiumCSS-dita-patch.css` and `viewer/readium-css-v2/cjk-vertical/ReadiumCSS-dita-patch.css`.

#### Event payloads enriched
- `resource.ready` / `resource.start` / `resource.end` / `resource.fits` now carry `href`.
- `readaloud.*` events carry `locator`.
- `readalong.*` events carry `locator`.
- `toolbox.opened` carries `text`.

#### Module refactor
- 18 built-in modules refactored to typed registry (`attach()` lifecycle, `rightsKey` gating).
- 5 PDF modules extracted from `PDFNavigator` (1073 → 762 lines): `PdfBookmarkModule`, `PdfSearchModule`, `PdfAnnotationModule`, `PdfHistoryModule`, `PdfViewSettingsModule`.

#### Type safety
- pdfjs typing centralized — 7 prior `as any` workarounds consolidated in `pdfjs-workarounds.ts`; zero remaining `as any` casts in `PDFNavigator`.
- Return types fixed — `readingOrder`, `tableOfContents`, `landmarks`, `pageList`, `positions` migrated from `any` to typed.

#### CSS class prefixing
- Drop shadow on FXL pages — `box-sizing: content-box` so the shadow isn't cropped by the page box.

### Deprecated

- `IFrameNavigator`, `IFrameNavigatorConfig` — use `EpubNavigator`, `EpubNavigatorConfig`. Aliases retained for one release.
- `getCurrentBookmark()`, `isCurrentBookmarked()`, `D2Reader.currentBookmark`, `D2Reader.isCurrentBookmarked` — use `findBookmarkAt(locator?)` and `hasBookmarkAt(locator?)`.

### Removed

- `r2-shared-js` runtime dependency (replaced by `@readium/shared`).
- `ta-json-x` runtime dependency (replaced by `@readium/shared`'s native deserialization).
- `IFrameAttributes` fields: `navHeight`, `bottomInfoHeight`, `sideNavPosition` (compile error if passed).
- `isPDFNavigator()` and `isAudiobookNavigator()` type-guards (replaced by optional methods on `Navigator` with `?.()` chains).
- `host.viewStore` and `host.annotator` on `PDFModuleHost` (replaced by PDF-module constructor injection).
- `EpubServiceWorker` (replaced by client-side `ZipContainer`).
- `EncryptedFetcher` (replaced by `ContentFetcher`).
- `typeScale` from v2 ReadiumCSS cascade (write still happens for v1 compatibility; v2 ignores).
- v2 native responsive-column CSS queries (library now computes column count from viewport breakpoints).
- Upstream ReadiumCSS files from `viewer/readium-css-v2/` — base + RTL + cjk-horizontal + cjk-vertical files + EBPAJ fonts patch + upstream LICENSE (now sourced from `@readium/css` npm package).
- `viewer/index_dita_v2_cdn.html` (consolidated with `viewer/index_dita_v2.html`).
- RTL `:first-letter` selector in `rtl/ReadiumCSS-after.css` (upstream change; drop-cap rendering on RTL books may differ).
- Duplicate LTR-only `keydown` handlers in `viewer/index_epub_file.html`, `index_minimal.html`, `index_injectables.html`, `index_sampleread.html` (the navigator's own `KeyboardEventHandler` is RTL-aware).

### Fixed

#### Cross-user / persistence (2026-06-18)
- **Cross-user shared-browser leak.** When User 1 created bookmarks / highlights / comments on a shared browser, User 2's subsequent session inherited them via LocalStorage. Root cause: integrator-supplied initial-set blocks only overwrote local storage when truthy — empty arrays / missing fields fell through. Now treating `initialAnnotations` (and every per-module `initialAnnotations` carrier) as canonical when present, even with empty lists.
- **PDF highlight color change after creation now fires `updateAnnotation`.** pdfjs mutates the `HighlightEditor.color` property in place via `_updateColor` and does NOT trigger `annotationStorage.setValue` or `annotationeditorstateschanged`, so previous saves only fired with the original default color. Module now listens to `switchannotationeditorparams` + `annotationeditorparamschanged` and re-runs the diff so the new color reaches the integrator's `updateAnnotation` callback.
- **PDFNavigator.saveLastReadingPosition href** was absolute; now relative.
- **PdfBookmarkModule.makeBookmark href** was absolute; now relative.
- **AudiobookBookmarkModule.makeBookmark href** was absolute; now relative.
- **AudiobookCommentsModule.add / findAt / list rendering hrefs** were absolute; now relative.

#### Existing fixes

- `text.selected` event no longer floods on selection drag (moved to `selectionMenuOpened`).
- `readaloud.stopped` no longer fires without TTS active (added guard).
- `readalong.stopped` no longer fires on init (removed from `stopReadAloud`).
- `readalong.stopped` and `readalong.finished` no longer both fire (only `finished` for natural end).
- `definition.success` no longer spams empty results (emits only when results found).
- FXL `rendition.layout` detection — nested check for Snow White format.
- FXL `injectablesFixed` — `style.css` added for Media Overlay highlighting.
- Media Overlay click-to-jump after FXL page turn — re-bind after `resourceReady`.
- Annotation lifecycle race across document switches — fixed via module extraction + explicit lifecycle.
- `notifyResourceReady` was firing on every page change — removed from `pagechanging` handler.
- `pageMargins` increase/decrease was no-op — union type mishandled; now functional.
- Odd-column page refresh — spacers re-injected before position restore; refreshed page lands on the left column (matching first-visit behavior).
- LineFocus container creation — `prepareContainers` now called in `TextHighlighter.initialize`; `R2_ID_LINEFOCUS_CONTAINER` exists immediately on iframe load (previously a lazy `setTimeout` path could leave it null on first `enableLineFocus`, throwing on `undefined.style.top`).
- `UserSettings` deferred view assignment — `selectInitialRenderer()` picks the renderer based on final `layout` / `scriptMode` / `verticalScroll` after store reads + integrator-supplied initial settings resolve. No throwaway `ColumnRenderer` constructed before scroll-mode preference loaded.
- Viewer keyboard handlers (RTL fix) — removed duplicate LTR-only `keydown` handlers; navigator's own `KeyboardEventHandler` is RTL-aware.
- `atEnd()` / `goToNextPage()` no longer walk one page past real content into a phantom blank page (gate on page-aligned boundary, not rounded `scrollWidth`).
- `ScrollRenderer` debounce hoisted to constructor (was re-created per `growIframeToContent` call, so the 200 ms debounce never coalesced anything).
- `ScrollRenderer` height seed — engages always seed `this.height` from `computeIframeContentHeight`; previously direct-open in scroll mode rendered as a blank screen when `html.offsetHeight` resolved to 0.
- `NaN`-safe `lineHeight` in content protection (`parseInt("normal") || 10`) — elements with `line-height: normal` no longer poison slack math.
- `NaN`-safe iframe heights — partial `IFrameAttributes` objects no longer produce `NaN`.
- Content protection: stale listener cleanup after chapter navigation — each `initialize()` removes the previous listener before attaching fresh. Fixes silent-failure where the new `iframe.contentDocument` never received scroll events.
- Content protection: `setupEvents` lifted out of the `enableObfuscation` gate — copy / print / keyboard / contextmenu listeners attach unconditionally based on their own flags. Integrators wanting only `disableCopy` (no scrambling) now get the appropriate listeners.
- Content protection: FXL skips obfuscation (always-visible spreads don't fit the off-viewport scrambling model). FXL still gets copy / print / keyboard / contextmenu / `hideTargetUrl` / `disableDrag`.

### Security

No security fixes this release.

## 2.5.0

### New Features
- **6 new ReadiumCSS properties wired** — `bodyHyphens`, `paraSpacing`, `paraIndent`, `typeScale`, `backgroundColor`, `textColor` are now fully functional end-to-end (ReadiumCSS.ts, UserProperties.ts, UserSettings.ts)
- **CitationModule stubs implemented** — `contributorsFormatted` (editors/translators), `eBookVersionFormatted` (from Modified date), `seriesFormatted` (from BelongsTo.Series). Multi-author formatting follows Chicago, MLA 9th, and APA 7th standards
- **Search progression** — navigating to a search result in another chapter now carries correct `totalProgression` and `position` instead of 0
- **Search highlight default colors** — all results show yellow, selected result shows orange, no configuration required
- **Chapter title on currentLocator** — `currentLocator()` now populates `title` from `currentChapterLink`, so consumers get chapter name without TOC lookup

### ReadiumCSS
- Upgraded bundled ReadiumCSS from v1.x to v1.1.1 (CJK Latin/Cyrillic script fix)
- Custom patches preserved: image no-stretch and line-height compensation formula
- Added `ReadiumCSS-ebpaj_fonts_patch.css`

### Security
- **Popup.ts XSS** — 3 gaps closed: `showPopup`, `showPopover`, and `handleFootnote` now sanitize HTML via `sanitize-html`
- **ContentProtectionModule** — replaced deprecated `document.execCommand('copy')` with async Clipboard API + fallback. Removed IE/Netscape dead code. Eliminated all 5 `@ts-ignore` suppressions

### UI
- **index_dita.html** — compact modern settings panel: segmented controls, toggle switch, color swatches, value readout sliders, proper reset. Controls for all 6 new CSS properties
- **React example** — full rewrite: toolbar with page info, sidebar with TOC/settings/bookmarks/search tabs, React 18 createRoot, keyboard navigation, IE11 polyfills removed

### Tests
- 50 unit tests across 5 files: LocalAnnotator (21), MemoryStore (7), CitationModule (15), ReadiumCSS (3), Locator (4)
- Added vitest config and test tsconfig

### Bug Fixes
- **Definitions popup** — read `dataset.definition` and `dataset.order` from parent container element instead of clicked child area div
- **`LocalAnnotator` sort comparators** — `getBookmarks`, `getAnnotations`, `getAnnotationsByChapter` all returned `undefined` from their sort callbacks when entries had no progression value. Sort comparators must return a number; `undefined` produces unstable/undefined sort order. Fixed to return `0` (equal) instead.
- **`hasChildNodes` called as property** — `getAnnotationPosition` and `getAnnotationElement` checked `if (foundElement.hasChildNodes)` (always true — it's a function reference) instead of `if (foundElement.hasChildNodes())`. Fixed to call the method.
- **Duplicate `TTSModule2` `instanceof` check** — the module registration loop in `IFrameNavigator` checked `instanceof TTSModule2` twice in a row. Removed the dead duplicate.
- **`for...in` on array** — the module registration loop used `for (const index in modules)` which is an anti-pattern for arrays (iterates string keys, can pick up prototype properties). Replaced with `for...of` with an early `continue` guard for undefined entries.
- **`modules` array typed as non-nullable** — `IFrameNavigatorConfig.modules` was `ReaderModule[]` but the array passed from `reader.ts` contained `undefined` entries for disabled modules. Corrected type to `Array<ReaderModule | undefined>`.
- **`getTemporarySelectionInfo` null-safety** — callers passing `iframes[0].contentDocument` (which is `Document | null`) now handled correctly. `LocalAnnotator` returns `null` when `doc` is null; all call sites coerce `null` to `undefined` via `?? undefined`.
- **`element?.scrollIntoView`** — `AnnotationModule.scrollToHighlight` called `.scrollIntoView()` unconditionally on a potentially null element returned by `getAnnotationElement`. Added optional chaining.
- **`TTSModule2` — guard `selectionInfo` before `addRange`** — `selectionInfo.range` was accessed without a null check after the result of `getTemporarySelectionInfo`. Added `if (selectionInfo?.range)` guard.
- **`saveTemporarySelectionInfo` called with undefined** — `TextHighlighter` could call `saveTemporarySelectionInfo(selectionInfo)` when `selectionInfo` is `undefined`. Added explicit guard.
- **Viewport meta parsing `@ts-ignore`** — replaced `@ts-ignore` in fixed-layout viewport dimension parsing with a proper typed `Record<string, number | string>` approach and null-safe destructuring.

### Improvements
- Bumped version to 2.5.0 as the baseline for the v2.5 milestone
- Fixed `package.json` dependency classification:
  - Moved `@types/sass`, `@types/pdfjs-dist`, `sass`, `@babel/plugin-proposal-private-property-in-object` from `dependencies` → `devDependencies` (build-time only)
  - Moved `ta-json-x` from `devDependencies` → `dependencies` (used in production code: `Publication`, `Link`, `JsonUtil`)
- Updated esbuild browser targets from 2021-era (`chrome89/firefox88/safari14/edge90`) to 2025 baseline (`chrome109/firefox115/safari16/edge109`)
- Replaced `arguments[0], arguments[1]` anti-pattern in `D2Reader.addEventListener()` with typed parameters
- Removed jQuery type dependency from `IFrameNavigator` — replaced `JQuery.KeyDownEvent` with standard DOM `KeyboardEvent`
- Improved `Navigator` interface: replaced all `any` types with proper TypeScript types
- Improved `NavigatorAPI` interface: all fields now have proper callback signatures; `updateSettings` and `updateCurrentLocation` correctly typed as returning `Promise<void>`
- Improved `ReaderConfig` interface: `publication`, `userSettings`, `initialAnnotations`, `lastReadingPosition` now properly typed; new `InitialAnnotations` interface exported
- Added `stop(): void` to `ReaderModule` interface — enforced what all 14 modules already implemented
- `UserSettingsConfig.initialUserSettings` made optional (it was already handled as optional at runtime)
- `LocalStorageStoreConfig.prefix` now accepts `string | URL` (URL is coerced via `.toString()`)
- `Annotator` interface: all `any` types replaced with proper `Bookmark`, `Annotation`, `ISelectionInfo`, `Window`, `Document` types
- `positions()` return type in `IFrameNavigator` changed from `any` to `Locator[]`
- Expanded `index.ts` public API exports: added `Bookmark`, `Annotation`, `AnnotationMarker`, `Locations`, `LocatorText`, `ReaderConfig`, `ReaderRights`, `NavigatorAPI`, `IFrameAttributes`, `Injectable`, `RequestConfig`, `SampleRead`, `PublicationServices`, `InitialAnnotations`, `InitialUserSettings`, `LocalStorageStoreConfig`

## 2.4.x

### 2.4.10
- Removed polyfill.io script from sample viewer (`viewer/index_dita.html`) — replaced with direct MathJax 3 CDN inclusion

### 2.4.x (prior)
- Dependency updates via Dependabot (sass, @babel/helpers, image-size, base-x)

## 2.0.0

- `currentSettings` is now a property, so you don't call it as a function.
- The default export is now a class which you instantiate with `.build`, and then call all API methods on the returned instance