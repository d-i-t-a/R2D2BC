# DITA Toolkit Documentation

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Configuration Reference](#configuration-reference)
- [D2Reader API Reference](#d2reader-api-reference)
- [Modules](#modules)
- [User Settings](#user-settings)
- [Events](#events)
- [Storage & Persistence](#storage--persistence)
- [Highlighting & Annotations](#highlighting--annotations)
- [Views & Layout](#views--layout)
- [CSS Theming & Injectables](#css-theming--injectables)
- [PDF Support](#pdf-support)
- [Integration Patterns](#integration-patterns)
- [Architecture Overview](#architecture-overview)
- [Browser Support](#browser-support)
- [Troubleshooting](#troubleshooting)

---

## Overview

**DITA Toolkit** (`@d-i-t-a/reader`, formerly **R2D2BC**) is a modular Readium v2 EPUB / PDF / Audiobook reader for the web. It is built as a configurable toolkit rather than a full-featured application: your app handles the UI and design, DITA Toolkit handles rendering, navigation, accessibility, and all reading-system concerns.

**The original name:** R2 = Readium v2, D2 = DITA (AM Consulting LLC), B = Bokbasen, C = CAST.

### What it supports

- Reflowable EPUB (paginated and scrolled)
- Fixed-layout EPUB (single and spread, with zoom and pan)
- PDF documents (via pdf.js)
- Audiobooks (Readium Audiobook Profile)
- RTL paginated content (Arabic, Hebrew, RTL CJK)
- CJK vertical writing (Japanese tategaki, vertical Chinese) and Mongolian vertical
- ReadiumCSS v1 and v2 cascade variants simultaneously
- Direct EPUB / Blob / File opening — no server required
- Full accessibility (TTS, media overlays, line focus)
- Annotations, bookmarks, highlights
- Full-text search
- Content protection
- Reading position persistence
- Custom CSS / JS injection into content documents
- Pluggable fetcher chain + custom resource transforms

### Who uses it

DITA Toolkit powers readers at NYPL, Bokbasen (Allbok.no), CAST (Clusive), Bibliotheca CloudLibrary, Bluefire, Edelweiss+, UNODC Fieldguides, Ekitabu, and others.

---

## Quick Start

### Minimal React example

```tsx
import D2Reader from "@d-i-t-a/reader";
import { useEffect, useState } from "react";

function ReaderApp() {
  const [reader, setReader] = useState<D2Reader | null>(null);

  useEffect(() => {
    D2Reader.load({
      url: new URL("https://example.com/publication/manifest.json"),
      injectables: [
        { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-before.css", r2before: true },
        { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-default.css", r2default: true },
        { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-after.css", r2after: true },
      ],
    }).then(setReader);

    return () => reader?.stop(); // cleanup on unmount
  }, []);

  if (!reader) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={reader.previousPage}>Previous</button>
      <button onClick={reader.nextPage}>Next</button>
      {/* The reader renders into these elements by convention */}
      <div id="D2Reader-Container">
        <main tabIndex={-1} id="iframe-wrapper" style={{ height: "100vh" }}>
          <div id="reader-loading" className="loading" />
          <div id="reader-error" className="error" />
        </main>
      </div>
    </div>
  );
}
```

### Minimal vanilla JS example

```html
<div id="D2Reader-Container">
  <main tabindex="-1" id="iframe-wrapper" style="height: 100vh">
    <div id="reader-loading" class="loading"></div>
    <div id="reader-error" class="error"></div>
  </main>
</div>

<script type="module">
  import { load } from "@d-i-t-a/reader";

  const reader = await load({
    url: new URL("https://example.com/publication/manifest.json"),
    injectables: [
      { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-before.css", r2before: true },
      { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-default.css", r2default: true },
      { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-after.css", r2after: true },
    ],
  });

  document.getElementById("prev").onclick = () => reader.previousPage();
  document.getElementById("next").onclick = () => reader.nextPage();
</script>
```

### Required HTML structure

The reader expects these DOM elements to exist before `D2Reader.load()` is called:

```html
<div id="D2Reader-Container">
  <main tabindex="-1" id="iframe-wrapper">
    <div id="reader-loading" class="loading"></div>
    <div id="reader-error" class="error"></div>
  </main>
</div>
```

| Element | Purpose |
|---------|---------|
| `#D2Reader-Container` | Outer container; the reader sizes itself within this |
| `#iframe-wrapper` | Where the content iframe is inserted; set `height` on this |
| `#reader-loading` | Shown while a resource is loading |
| `#reader-error` | Shown if a resource fails to load |

---

## Installation

```bash
npm install @d-i-t-a/reader
```

### ESM import (recommended)

```typescript
import D2Reader from "@d-i-t-a/reader";
// or named:
import { load } from "@d-i-t-a/reader";
```

### Script tag

```html
<script src="node_modules/@d-i-t-a/reader/dist/reader.js"></script>
<script>
  const reader = await D2Reader.load({ /* config */ });
</script>
```

### Readium CSS

You must provide ReadiumCSS files and pass them as injectables. The library declares [`@readium/css`](https://www.npmjs.com/package/@readium/css) as a runtime dependency, so the files arrive automatically with `npm install`:

```bash
npm install @d-i-t-a/reader
# @readium/css ships transitively under node_modules/@readium/css/css/dist/
```

At minimum provide:

- `ReadiumCSS-before.css` (`r2before: true`)
- `ReadiumCSS-default.css` (`r2default: true`)
- `ReadiumCSS-after.css` (`r2after: true`)

For production, you can serve from `node_modules/`, copy the files into your asset pipeline, or reference upstream via CDN (`https://unpkg.com/@readium/css@<version>/css/dist/...`). For RTL and CJK content, see the variant subdirectories: `rtl/`, `cjk-horizontal/`, `cjk-vertical/`. ReadiumCSS v1.1.x continues to work — both v1 and v2 cascades are supported simultaneously.

The library also bundles a thin DITA patch overlay at `viewer/readium-css-v2/ReadiumCSS-dita-patch.css` that fixes image stretching and line-height compensation for CJK / Indic scripts. Load it last in your injectables list.

### Running the examples

The project includes 7 runnable examples. See [`examples/README.md`](examples/README.md) for details.

```bash
npm run dev              # DITA viewer — build + watch + serve (port 4444)
npm run examples         # DITA viewer — streamer for local EPUBs
npm run example:react    # React 18 (Parcel, port 1234)
npm run example:vue      # Vue 3 (Parcel, port 1234)
npm run example:angular  # Angular (Parcel, port 1234)
npm run example:nextjs   # Next.js pattern (Parcel, port 1234)
npm run example:remix    # Remix pattern (Parcel, port 1234)
npm run example:vanilla  # Vanilla JS EPUB reader (port 3000)
npm run example:pdf      # Standalone PDF viewer (port 3001)
```

---

## Core Concepts

### Publication manifest

DITA Toolkit reads publications via a [Readium Web Publication Manifest](https://readium.org/webpub-manifest/) (JSON). The `url` in your config must point to this manifest. The manifest describes the reading order (spine), resources, metadata, and table of contents.

### Locator

A `Locator` identifies a precise position in a publication. It is the universal currency for navigation, bookmarks, annotations, and reading positions.

```typescript
interface Locator {
  href: string;           // Resource URL (spine item)
  type?: string;          // MIME type
  title?: string;         // Human-readable title
  locations: {
    fragment?: string;     // Fragment identifier (#id)
    progression?: number;  // 0.0 to 1.0 within the resource
    position?: number;     // Absolute position index
    totalProgression?: number; // 0.0 to 1.0 across entire publication
    remainingPositions?: number;
    totalRemainingPositions?: number;
  };
  text?: {
    before?: string;       // Text before the position
    highlight?: string;    // Text at the position
    after?: string;        // Text after the position
  };
}
```

### Rights (feature flags)

Every optional feature is gated by a boolean in `ReaderRights`. If a right is `false` (or omitted), the corresponding module is not loaded.

### Modules

DITA Toolkit is built around 14 optional modules, each self-contained. Modules are enabled via `ReaderRights` flags, configured via their own config section in `ReaderConfig`, and communicate with your app via callback APIs.

### Injectables

CSS and JavaScript files that get injected into the content iframe. This is how you apply Readium CSS, custom fonts, custom stylesheets, and scripts to the rendered publication content.

---

## Configuration Reference

### ReaderConfig

The full configuration object passed to `D2Reader.load()`:

```typescript
interface ReaderConfig {
  // ── Required ──────────────────────────────────────────────────
  url: URL;                    // URL to the Readium Web Publication Manifest
  injectables: Injectable[];   // CSS/JS to inject into content iframes

  // ── Optional: pre-parsed manifest ─────────────────────────────
  publication?: Record<string, unknown>;

  // ── Optional: feature flags ───────────────────────────────────
  rights?: Partial<ReaderRights>;

  // ── Optional: initial state ───────────────────────────────────
  userSettings?: Partial<InitialUserSettings>;
  lastReadingPosition?: ReadingPosition;
  initialAnnotations?: InitialAnnotations;

  // ── Optional: host callbacks ──────────────────────────────────
  api?: Partial<NavigatorAPI>;

  // ── Optional: module configs ──────────────────────────────────
  tts?: Partial<TTSModuleConfig>;
  search?: Partial<SearchModuleConfig>;
  define?: Partial<DefinitionsModuleConfig>;
  protection?: Partial<ContentProtectionModuleConfig>;
  mediaOverlays?: Partial<MediaOverlayModuleConfig>;
  pagebreak?: Partial<PageBreakModuleConfig>;
  annotations?: Partial<AnnotationModuleConfig>;
  bookmarks?: Partial<BookmarkModuleConfig>;
  lineFocus?: Partial<LineFocusModuleConfig>;
  citations?: Partial<CitationModuleConfig>;
  consumption?: Partial<ConsumptionModuleConfig>;
  highlighter?: Partial<TextHighlighterConfig>;

  // ── Optional: layout ──────────────────────────────────────────
  attributes?: IFrameAttributes;
  injectablesFixed?: Injectable[];

  // ── Optional: storage ─────────────────────────────────────────
  useLocalStorage?: boolean;
  useStorageType?: string;     // "local" | "session" | "memory"

  // ── Optional: services ────────────────────────────────────────
  services?: PublicationServices;
  sample?: SampleRead;

  // ── Optional: network ─────────────────────────────────────────
  requestConfig?: RequestConfig;

  // ── Optional: PDF ─────────────────────────────────────────────
  workerSrc?: string;          // Path to pdf.worker.min.mjs
}
```

### ReaderRights

Controls which features/modules are active:

```typescript
interface ReaderRights {
  enableBookmarks: boolean;          // Bookmark module
  enableAnnotations: boolean;        // Annotation/highlight module
  enableTTS: boolean;                // Text-to-speech
  enableSearch: boolean;             // Full-text search
  enableDefinitions: boolean;        // Dictionary/definitions lookup
  enableContentProtection: boolean;  // DRM, copy protection
  enableTimeline: boolean;           // Publication timeline/positions
  autoGeneratePositions: boolean;    // Auto-generate position list
  enableMediaOverlays: boolean;      // Read-along (SMIL audio)
  enablePageBreaks: boolean;         // Page numbers in margins
  enableLineFocus: boolean;          // Line focus (accessibility, beta)
  customKeyboardEvents: boolean;     // Custom keyboard handling
  enableHistory: boolean;            // Navigation history
  enableCitations: boolean;          // Citation generation
  enableConsumption: boolean;        // Content consumption tracking
}
```

All default to `false`. Enable only what you need.

### NavigatorAPI (host callbacks)

Your application provides these callbacks so the reader can communicate back to you:

```typescript
interface NavigatorAPI {
  // Content fetching (required for streamed/protected content)
  getContent: (href: string) => Promise<string>;
  getContentBytesLength: (href: string, requestConfig?: RequestConfig) => Promise<number>;

  // Lifecycle notifications
  resourceReady?(): void;                          // Content iframe loaded
  resourceAtStart?(): void;                        // User at beginning of resource
  resourceAtEnd?(): void;                          // User at end of resource
  resourceFitsScreen?(): void;                     // Entire resource fits on screen

  // Position tracking
  updateCurrentLocation?(locator: ReadingPosition): Promise<void>;
  positionInfo?(locator: Locator): void;             // Page position updated (no delay)
  chapterInfo?(title: string | undefined): void;     // Chapter title updated (no delay)

  // Settings sync
  updateSettings?(settings: Record<string, unknown>): Promise<void>;

  // Input passthrough
  keydownFallthrough?(event: KeyboardEvent | undefined): void;
  clickThrough?(event: MouseEvent | TouchEvent): void;
  direction?(dir: string): void;                   // "ltr" | "rtl" | "auto"

  // Error handling
  onError?(e: Error): void;
}
```

The most important callback is `updateCurrentLocation` -- implement this to persist reading position to your backend.

### Injectable

Describes a CSS or JS file (or inline string) to inject into content iframes. `Injectable` is a discriminated union on the `type` field:

```typescript
type Injectable =
  | { type: "style";        url: string;     /* ...injection-target flags... */ }
  | { type: "script";       url: string;     /* ...optional async... */ }
  | { type: "style-inline"; css: string;     /* ...injection-target flags... */ }
  | { type: "script-inline"; js:  string;    /* ...optional async... */ };

// Shared optional fields across variants:
//   r2before?:   boolean — inject before content styles (Readium CSS ordering)
//   r2default?:  boolean — default injection point
//   r2after?:    boolean — inject after content styles
//   fontFamily?: string  — font family name (font injectables)
//   systemFont?: boolean — system font marker
//   appearance?: string  — limit to a specific appearance mode (e.g. "night")
//   async?:      boolean — load script async
//   when?:       (ctx: InjectableContext) => boolean — predicate gate
```

`InjectableContext` carries the publication and its derived `scriptMode` so a `when` predicate can choose between LTR / RTL / cjk-horizontal / cjk-vertical / mongolian-vertical variants without re-walking metadata. See `viewer/index_dita_v2.html` for a worked example.

### IFrameAttributes

Controls the reader's layout dimensions and chrome-aware insets:

```typescript
interface IFrameAttributes {
  /** Left/right margin in pixels (was required; now optional). */
  margin?: number;

  /** Iframe padding (number applies to all sides; per-side object overrides). */
  iframe?: {
    padding?: number | { top?: number; bottom?: number; left?: number; right?: number };
  };

  /**
   * Chrome-aware sizing — each callback returns the chrome element occupying
   * that edge so the iframe reserves space for it. Floors at 0; collapses to
   * chrome dimension when the chrome is anchored at the parent edge.
   */
  safeArea?: {
    top?:    () => Element | null;
    bottom?: () => Element | null;
    left?:   () => Element | null;
    right?:  () => Element | null;
  };

  /** Where the scroll happens: host element wraps iframe (default) or iframe scrolls internally. */
  scrollContainer?: "host" | "iframe";

  /** FXL-specific. */
  fixedLayoutMargin?: number;   // FXL margin in pixels (default: 100)
  fixedLayoutShadow?: boolean;  // FXL drop shadow (default: true)
}
```

**Removed from v3** (compile error if passed): `navHeight`, `bottomInfoHeight`, `sideNavPosition` — replaced by `safeArea` callbacks and integrator-side CSS.

Iframe height formula in v3: `parent − safeArea.top − safeArea.bottom − iframe.padding − margin` (was `viewport − 40 − margin`).

### InitialAnnotations

Pre-load user-added data at startup. Each navigator's modules pick the field they care about and call `annotator.initBookmarks` / `initAnnotations` / `initComments` at construction:

```typescript
interface InitialAnnotations {
  bookmarks?: Bookmark[];   // EPUB + PDF + Audiobook
  highlights?: Annotation[]; // EPUB only
  comments?: Comment[];     // Audiobook only
}
```

---

## D2Reader API Reference

### Initialization

```typescript
// Create a reader instance (async)
const reader = await D2Reader.load(config: ReaderConfig): Promise<D2Reader>;

// Listen for events
reader.addEventListener(event: string, handler: (...args: any[]) => void): void;

// Destroy reader (important for SPA cleanup)
reader.stop(): void;
```

### Navigation

| Method | Description |
|--------|-------------|
| `goTo(locator: Locator)` | Navigate to a specific locator |
| `goToPosition(value: number)` | Navigate to a progression (0.0 - 1.0) |
| `goToPage(page: number)` | Navigate to a page number (from page list) |
| `nextResource()` | Jump to next spine item |
| `previousResource()` | Jump to previous spine item |
| `nextPage()` | Next page (paginated) or scroll forward |
| `previousPage()` | Previous page or scroll backward |
| `snapToSelector(selector: string)` | Navigate to a CSS selector within current resource |

### Publication information

| Property | Type | Description |
|----------|------|-------------|
| `currentResource` | `number \| undefined` | Current spine item index |
| `totalResources` | `number` | Total spine items |
| `currentLocator` | `Locator` | Current reading position |
| `positions` | `Locator[]` | All positions in the publication |
| `tableOfContents` | `Link[]` | Table of contents |
| `landmarks` | `Link[]` | Landmark navigation |
| `pageList` | `Link[]` | Page list |
| `readingOrder` | `Link[]` | Reading order (spine) |
| `publicationLayout` | `"fixed" \| "reflowable"` | Publication type |
| `publicationLanguage` | `string` | Publication language |
| `mostRecentNavigatedTocItem` | `string \| undefined` | Most recent TOC item navigated to |

### Bookmarks

```typescript
// Save a bookmark at the current position
await reader.saveBookmark(): Promise<boolean>;

// Save a bookmark with annotation data
await reader.saveBookmarkPlus(): Promise<void>;

// Delete a bookmark
await reader.deleteBookmark(bookmark: Bookmark): Promise<boolean>;

// Get all bookmarks
reader.bookmarks: Bookmark[];
```

### Annotations & Highlights

```typescript
// Add an annotation
await reader.addAnnotation(annotation: Annotation): Promise<boolean>;

// Update an existing annotation
await reader.updateAnnotation(annotation: Annotation): Promise<boolean>;

// Delete an annotation
await reader.deleteAnnotation(annotation: Annotation): Promise<boolean>;

// Change the active highlighter color (hex string)
reader.changeHighlighterColor(color: string): void;

// Show/hide the annotation layer
reader.showAnnotationLayer(): void;
reader.hideAnnotationLayer(): void;

// Show/hide a specific named layer
reader.showLayer(layerName: string): boolean;
reader.hideLayer(layerName: string): boolean;

// Activate/deactivate annotation markers
reader.activateMarker(id: string, position: string): boolean;
reader.deactivateMarker(): boolean;

// Get all annotations
reader.annotations: Annotation[] | undefined;
```

### Text-to-Speech (TTS)

Requires `rights.enableTTS: true`.

```typescript
reader.startReadAloud(): void;
reader.stopReadAloud(): void;
reader.pauseReadAloud(): void;
reader.resumeReadAloud(): void;
reader.resetTTSSettings(): void;
await reader.applyTTSSettings(settings: Partial<ITTSUserSettings>): void;
await reader.applyPreferredVoice(voiceName: string): void;
```

TTS settings include:

```typescript
interface ITTSUserSettings {
  rate: number;      // Speech rate (0.1 - 10.0, default 1.0)
  pitch: number;     // Pitch (0.0 - 2.0, default 1.0)
  volume: number;    // Volume (0.0 - 1.0, default 1.0)
  voice: SpeechSynthesisVoice;
}
```

### Media Overlays (Read Along)

Requires `rights.enableMediaOverlays: true`. For publications with SMIL-based audio narration.

```typescript
reader.startReadAlong(): void;
reader.stopReadAlong(): void;
reader.pauseReadAlong(): void;
reader.resumeReadAlong(): void;
reader.resetMediaOverlaySettings(): void;
await reader.applyMediaOverlaySettings(settings: Partial<IMediaOverlayUserSettings>): void;
reader.hasMediaOverlays: boolean;
```

**Click to advance:** While media overlays are playing, clicking on any text element jumps narration to the nearest SMIL sync point. This works across both pages in a two-page FXL spread. The granularity depends on the EPUB's SMIL structure (sentence-level, paragraph-level, etc.).

### Search

Requires `rights.enableSearch: true`.

```typescript
// Search the publication
const results = await reader.search(term: string, current: boolean): Promise<any[]>;
// current = true: search only current resource
// current = false: search entire publication

// Navigate to a search result
await reader.goToSearchIndex(href: string, index: number, current: boolean): Promise<void>;
await reader.goToSearchID(href: string, index: number, current: boolean): Promise<void>;

// Clear search highlights
await reader.clearSearch(): Promise<void>;
```

### Definitions

Requires `rights.enableDefinitions: true`.

```typescript
await reader.addDefinition(definition: any): Promise<void>;
await reader.clearDefinitions(): Promise<void>;
```

### User Settings

```typescript
// Get current settings
reader.currentSettings: UserSettings;

// Apply partial settings
await reader.applyUserSettings(settings: Partial<UserSettings>): Promise<void>;

// Reset to defaults
await reader.resetUserSettings(): Promise<void>;

// Increment/decrement a setting
await reader.increase(property: UserSettingsIncrementable): Promise<void>;
await reader.decrease(property: UserSettingsIncrementable): Promise<void>;

// Toggle scroll mode
await reader.scroll(enabled: boolean, direction?: string): Promise<void>;
```

### Line Focus (Beta)

Requires `rights.enableLineFocus: true`.

```typescript
await reader.enableLineFocus(): Promise<void>;
reader.disableLineFocus(): void;
await reader.lineFocus(active: boolean): Promise<void>;
reader.lineUp(): void;
reader.lineDown(): void;
await reader.applyLineFocusSettings(settings: any): Promise<void>;
```

### History

Requires `rights.enableHistory: true`.

```typescript
reader.history: any;                     // Full history
reader.historyCurrentIndex: number;      // Current position in history
await reader.historyBack(): Promise<void>;
await reader.historyForward(): Promise<void>;
```

### PDF-Specific Methods

These only work when viewing a PDF publication:

```typescript
reader.fitToPage(): void;
reader.fitToWidth(): void;
reader.zoomIn(): void;
reader.zoomOut(): void;
reader.activateHand(): void;      // Pan/grab tool
reader.deactivateHand(): void;
```

### Layout

```typescript
// Update layout attributes (margin, height, etc.)
reader.applyAttributes(attrs: IFrameAttributes): void;

// Copy text (respects content protection settings)
reader.copyToClipboard(text: string): void;
```

### Lifecycle

```typescript
// Destroy the reader and clean up all resources.
// IMPORTANT: Call this when unmounting in React/SPA frameworks.
reader.stop(): void;
```

---

## Modules

Each module is optional, gated by a `ReaderRights` flag, and has its own configuration section in `ReaderConfig`.

### BookmarkModule

**Flag:** `enableBookmarks: true`
**Config key:** `bookmarks`

Manages saving, deleting, and listing bookmarks. Bookmarks are `Locator` objects with a timestamp. Persistence is handled by the `Annotator` (see [Storage](#storage--persistence)).

### AnnotationModule

**Flag:** `enableAnnotations: true`
**Config key:** `annotations`

Manages text highlights and annotations. Supports multiple highlight types (highlight, underline, bookmark marker, comment, custom) and colors. Works with the `TextHighlighter` to render highlights in the content iframe.

Configuration:

```typescript
interface AnnotationModuleConfig {
  initialAnnotationColor?: string;     // Default highlight color (hex)
  hideLayer?: boolean;                 // Start with layer hidden
  // ... module-specific callbacks
}
```

### TextHighlighter

Always created (used by annotations and search). Provides the core selection and highlighting engine.

Configuration:

```typescript
interface TextHighlighterConfig {
  selectionMenuItems?: SelectionMenuItem[];  // Context menu items on text selection
}

interface SelectionMenuItem {
  id: string;
  label: string;
  icon?: string;
  callback: (selection: ISelectionInfo) => void;
}
```

### SearchModule

**Flag:** `enableSearch: true`
**Config key:** `search`

Full-text search across the publication. Returns results with surrounding text context.

Configuration:

```typescript
interface SearchModuleConfig {
  color?: string;    // Highlight color for all results (default: "#fff059" yellow)
  current?: string;  // Highlight color for selected result (default: "#ff6600" orange)
  hideLayer?: boolean;
}
```

### DefinitionsModule

**Flag:** `enableDefinitions: true`
**Config key:** `define`

Word/phrase definition lookups. You provide definitions through the API; the module handles display.

### TTSModule2

**Flag:** `enableTTS: true`
**Config key:** `tts`

Text-to-speech using the Web Speech API. Supports voice selection, rate/pitch/volume control, and word-level highlighting during playback.

### MediaOverlayModule

**Flag:** `enableMediaOverlays: true`
**Config key:** `mediaOverlays`

SMIL-based read-along. Synchronizes audio playback with text highlighting. Used for audiobook-enhanced EPUBs.

### ContentProtectionModule

**Flag:** `enableContentProtection: true`
**Config key:** `protection`

Copy protection, text selection control, and content obfuscation. Can disable copy/paste, prevent screenshots (CSS), and control clipboard access.

### PageBreakModule

**Flag:** `enablePageBreaks: true`
**Config key:** `pagebreak`

Displays print page numbers in the margins for reflowable content. Uses the EPUB page-list.

### TimelineModule

**Flag:** `enableTimeline: true`

Provides position information and timeline data for progress indicators.

### LineFocusModule (Beta)

**Flag:** `enableLineFocus: true`
**Config key:** `lineFocus`

Accessibility feature that dims all text except the current line, helping readers focus. Users navigate line-by-line.

### HistoryModule

**Flag:** `enableHistory: true`

Tracks navigation history, allowing back/forward navigation through previously visited positions.

### CitationModule

**Flag:** `enableCitations: true`
**Config key:** `citations`

Generates citation text from the current reading position or selection.

### ConsumptionModule

**Flag:** `enableConsumption: true`
**Config key:** `consumption`

Tracks content consumption metrics (time spent, pages read, etc.).

---

## User Settings

### Available settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fontSize` | `number` | `100` | Font size as percentage (100-200) |
| `fontOverride` | `boolean` | `false` | Override publication font |
| `fontFamily` | `number` | `0` | 0=Original, 1=Serif, 2=Sans-serif |
| `appearance` | `number` | `0` | 0=Default, 1=Sepia, 2=Night |
| `verticalScroll` | `boolean` | `false` | Scroll mode vs. pagination |
| `textAlignment` | `number` | `0` | 0=Auto, 1=Justify, 2=Start |
| `columnCount` | `number` | `0` | 0=Auto, 1=One column, 2=Two columns |
| `direction` | `number` | `0` | 0=Auto, 1=LTR, 2=RTL |
| `wordSpacing` | `number` | `0` | Word spacing adjustment |
| `letterSpacing` | `number` | `0` | Letter spacing adjustment |
| `pageMargins` | `number` | `1` | Page margin multiplier |
| `lineHeight` | `number` | `1` | Line height multiplier |
| `bodyHyphens` | `boolean` | `false` | Enable automatic hyphenation (`true` = auto, `false` = none) |
| `paraSpacing` | `number` | `0` | Paragraph spacing in rem (0–3, step 0.5) |
| `paraIndent` | `number` | `1` | Paragraph indent in em (0–3, step 0.5) |
| `typeScale` | `number` | `1.2` | Type scale factor (1.0–1.5, step 0.1). **v1 only**; v2 cascade ignores this. |
| `backgroundColor` | `string` | `undefined` | Custom background color (hex, e.g. `"#fefefe"`) |
| `textColor` | `string` | `undefined` | Custom text color (hex, e.g. `"#333333"`) |

#### v2-only settings (silently no-op on v1 cascade)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `lineLength` | `number` | `40` | Line length in `rem` (replaces v1's direct page-margins var). |
| `fontWeight` | `number` | `400` | Variable-font weight axis. |
| `fontWidth` | `number` | `100` | Variable-font width axis (percentage). |
| `fontOpticalSizing` | `boolean` | `true` | Toggle CSS `font-optical-sizing`. |
| `ligatures` | `string` | `"normal"` | `font-variant-ligatures` value. |
| `linkColor` | `string` | `undefined` | Custom link color (hex). |
| `visitedColor` | `string` | `undefined` | Custom visited-link color (hex). |
| `selectionBackgroundColor` | `string` | `undefined` | Custom selection background color (hex). |
| `selectionTextColor` | `string` | `undefined` | Custom selection text color (hex). |
| `blendImages` | `boolean` | `false` | Apply `mix-blend-mode: multiply` to images (auto-on in Sepia preset). |
| `darkenImages` | `boolean` | `false` | Reduce image brightness (useful in Night preset). |
| `invertImages` | `boolean` | `false` | Invert image colors (useful in Night preset). |
| `invertGaiji` | `boolean` | `false` | Invert gaiji glyph images specifically (Japanese rare-character workaround). |
| `scrollPaddingTop` | `number` | `0` | `scroll-padding-top` in pixels on the scroll container. |
| `scrollPaddingBottom` | `number` | `0` | `scroll-padding-bottom` in pixels. |
| `scrollPaddingLeft` | `number` | `0` | `scroll-padding-left` in pixels. |
| `scrollPaddingRight` | `number` | `0` | `scroll-padding-right` in pixels. |

UserSettings uses a dual-applicator pattern — it writes both v1 and v2 CSS custom properties on the iframe root so the same TypeScript config drives either cascade.

#### Audiobook settings (`AudiobookSettings`)

Persisted via the `AudiobookNavigator`'s settings module:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `volume` | `number` | `1.0` | 0.0 to 1.0. |
| `playbackRate` | `number` | `1.0` | 0.25 to 4.0. |
| `preservePitch` | `boolean` | `true` | Maintain pitch when playback rate changes. |
| `skipForwardInterval` | `number` | `30` | Seconds for `skipForward()`. |
| `skipBackwardInterval` | `number` | `30` | Seconds for `skipBackward()`. |
| `pollInterval` | `number` | `250` | Position-update poll interval in ms. |
| `autoPlay` | `boolean` | `false` | Start playing on track load. |
| `enableMediaSession` | `boolean` | `true` | Install `navigator.mediaSession` controller. |
| `timelineMode` | `string` | `"chapter"` | `"chapter"` / `"book"` / `"both"`. |

### Incrementable settings

These can be used with `reader.increase()` and `reader.decrease()`:

- `fontSize`
- `wordSpacing`
- `letterSpacing`
- `pageMargins`
- `lineHeight`
- `paraSpacing`
- `paraIndent`
- `typeScale`

### Providing initial settings

```typescript
D2Reader.load({
  url: manifestUrl,
  injectables: [...],
  userSettings: {
    fontSize: 120,
    fontFamily: 1,         // Serif
    appearance: 0,         // Default theme
    verticalScroll: false,  // Paginated
  },
});
```

### Changing settings at runtime

```typescript
await reader.applyUserSettings({
  fontSize: 150,
  appearance: 2,  // Night mode
});
```

---

## Events

### Reader events

Listen via `reader.addEventListener(event, handler)`. v3 introduced typed `ReaderEvent` constants and a `ReaderEventMap` for type-safe payloads — old string-keyed listeners still work, the constants are opt-in:

```typescript
import { ReaderEvent } from "@d-i-t-a/reader";
reader.addEventListener(ReaderEvent.RESOURCE_READY, payload => { /* payload typed via ReaderEventMap */ });
```

#### Resource & lifecycle events

| Event | Payload | Description |
|-------|---------|-------------|
| `"resource.ready"` | `{ href }` | Content iframe finished loading. |
| `"resource.start"` | `{ href }` | User is at the beginning of a resource. |
| `"resource.end"` | `{ href }` | User is at the end of a resource. |
| `"resource.fits"` | `{ href }` | Entire resource fits on screen. |
| `"resource.error"` | `Error` | Resource failed to load. |
| `"location.changed"` | `ReadingPosition` | Reading position changed. |
| `"error"` | `Error` | Generic error event. |
| `"click"` | `MouseEvent \| TouchEvent` | Click / tap in content area. |
| `"keydown"` | `KeyboardEvent` | Key press in content area. |
| `"direction"` | `string` | Text direction changed (`"ltr"` / `"rtl"` / `"auto"`). |
| `"toolbox.opened"` | `{ text }` | Selection toolbox opened. |
| `"text.selected"` | `{ text, selection }` | Selection finalized on mouse-up. |

#### Bookmarks / annotations / citations

| Event | Payload | Description |
|-------|---------|-------------|
| `"bookmark.created"` | `Bookmark` | Bookmark saved. |
| `"bookmark.deleted"` | `Bookmark` | Bookmark removed. |
| `"annotation.created"` | `Annotation` | Annotation created. |
| `"annotation.updated"` | `Annotation` | Annotation updated. |
| `"annotation.deleted"` | `Annotation` | Annotation removed. |
| `"annotation.selected"` | `Annotation` | Annotation activated (user click / programmatic). |
| `"annotation.comment.added"` | `Annotation` | Comment added to annotation. |
| `"citation.created"` | `string` | Citation generated. |
| `"citation.failed"` | `string` | Citation generation failed (error message). |

#### Read-aloud (TTS) and Read-along (Media Overlays)

| Event | Payload | Description |
|-------|---------|-------------|
| `"readaloud.started"` | `Locator` | TTS started. |
| `"readaloud.stopped"` | `Locator` | TTS stopped. |
| `"readaloud.paused"` | `Locator` | TTS paused. |
| `"readaloud.resumed"` | `Locator` | TTS resumed. |
| `"readalong.started"` | `{ href }` | Media Overlay started. |
| `"readalong.stopped"` | `{ href }` | Media Overlay stopped. |
| `"readalong.paused"` | `{ href }` | Media Overlay paused. |
| `"readalong.resumed"` | `{ href }` | Media Overlay resumed. |
| `"readalong.finished"` | `{ href }` | Media Overlay reached natural end. |

#### Audiobook playback (only on `AudiobookNavigator`)

| Event | Payload | Description |
|-------|---------|-------------|
| `"playback.started"` | `{ trackIndex }` | Playback started. |
| `"playback.paused"` | `{ trackIndex }` | Playback paused. |
| `"playback.ended"` | `{ trackIndex }` | Track ended (natural). |
| `"playback.stalled"` | `{ trackIndex }` | Buffer underrun. |
| `"playback.error"` | `AudioEngineError` | Playback error. |
| `"playback.waiting"` | `{ reason }` | Spinner state — cross-chapter load, cold-start, or rebuffer. |
| `"playback.timeupdate"` | `{ currentTime, duration }` | Periodic time update. |
| `"playback.trackchanged"` | `{ trackIndex, source }` | Track changed via `goTrack`. |
| `"playback.durationchanged"` | `{ duration }` | Track duration resolved. |
| `"playback.ratechanged"` | `{ playbackRate }` | Playback rate changed. |
| `"sleeptimer.started"` | `{ mode, minutes? }` | Sleep timer armed. |
| `"sleeptimer.tick"` | `{ secondsRemaining }` | Sleep-timer countdown tick. |
| `"sleeptimer.expired"` | `void` | Sleep timer fired. |
| `"sleeptimer.cancelled"` | `void` | Sleep timer cancelled. |
| `"comments.created"` | `Comment` | Audiobook comment created. |
| `"comments.updated"` | `Comment` | Audiobook comment edited. |
| `"comments.deleted"` | `Comment` | Audiobook comment deleted. |
| `"comments.active"` | `Comment \| null` | Active comment under the playhead changed. |

#### Consumption tracking

| Event | Payload | Description |
|-------|---------|-------------|
| `"consumption.action"` | `{ locator, action }` | User interaction recorded. |
| `"consumption.idle"` | `{ seconds }` | Idle interval ended. |

### NavigatorAPI callbacks

These are set in the `api` config and called by the reader:

| Callback | When called |
|----------|-------------|
| `resourceReady()` | Content loaded |
| `resourceAtStart()` | User at beginning |
| `resourceAtEnd()` | User at end |
| `resourceFitsScreen()` | Resource fits on screen |
| `updateCurrentLocation(locator)` | Reading position changed |
| `positionInfo(locator)` | Page position updated (immediate, no delay) |
| `chapterInfo(title)` | Chapter title updated (immediate, no delay) |
| `updateSettings(settings)` | User settings changed |
| `keydownFallthrough(event)` | Keyboard event not handled by reader |
| `clickThrough(event)` | Click not handled by reader |
| `direction(dir)` | Text direction determined |
| `onError(error)` | Error occurred |

### Typical event-driven setup

```typescript
const reader = await D2Reader.load({
  url: manifestUrl,
  injectables: [...],
  api: {
    getContent: async (href) => {
      const resp = await fetch(href);
      return resp.text();
    },
    getContentBytesLength: async (href) => {
      const resp = await fetch(href, { method: "HEAD" });
      return parseInt(resp.headers.get("content-length") || "0");
    },
    updateCurrentLocation: async (locator) => {
      // Persist to your backend
      await saveReadingPosition(userId, bookId, locator);
      // Update your UI
      updateProgressBar(locator.locations.totalProgression);
    },
    resourceReady: () => {
      hideLoadingSpinner();
    },
    onError: (err) => {
      showErrorMessage(err.message);
    },
  },
});
```

---

## Storage & Persistence

### Store interface

DITA Toolkit uses a simple key-value store internally:

```typescript
interface Store {
  get(key: string): any | null;
  set(key: string, value: any): void;
  remove(key: string): void;
}
```

### Storage types

Configure via `useStorageType` in `ReaderConfig`:

| Value | Implementation | Description |
|-------|---------------|-------------|
| `"local"` | `LocalStorageStore` | Uses `localStorage` (persists across sessions) |
| `"session"` | `LocalStorageStore` | Uses `sessionStorage` (cleared when tab closes) |
| `"memory"` | `MemoryStore` | In-memory only (cleared on page reload) |

Falls back automatically: `localStorage` -> `sessionStorage` -> `MemoryStore`.

### Annotator interface

For persisting bookmarks, annotations, and reading positions, DITA Toolkit uses an `Annotator`:

```typescript
interface Annotator {
  // Reading position
  initLastReadingPosition(position: ReadingPosition): void;
  getLastReadingPosition(): ReadingPosition | null;
  saveLastReadingPosition(position: ReadingPosition | string): void;

  // Bookmarks
  initBookmarks(list: Bookmark[] | string): Bookmark[];
  saveBookmark(bookmark: Bookmark): Bookmark;
  deleteBookmark(bookmark: Bookmark): Bookmark;
  getBookmarks(href?: string): Bookmark[];

  // Annotations
  initAnnotations(list: Annotation[] | string): Annotation[];
  saveAnnotation(annotation: Annotation): Annotation;
  deleteAnnotation(id: string): string;
  getAnnotations(): Annotation[];
  getAnnotationsByChapter(chapter: string): Annotation[];

  // Temporary selection (for context menus)
  saveTemporarySelectionInfo(selectionInfo: ISelectionInfo): void;
  getTemporarySelectionInfo(doc: Document | null): ISelectionInfo | null;
  deleteTemporarySelectionInfo(): void;
}
```

The built-in `LocalAnnotator` stores data in the configured `Store`. For server-side persistence, use the `NavigatorAPI.updateCurrentLocation` callback and provide `initialAnnotations` / `lastReadingPosition` in the config.

### Server-side persistence pattern

```typescript
// Load from your backend, then pass to the reader
const savedPosition = await api.getReadingPosition(bookId);
const savedAnnotations = await api.getAnnotations(bookId);

const reader = await D2Reader.load({
  url: manifestUrl,
  injectables: [...],
  lastReadingPosition: savedPosition,
  initialAnnotations: {
    bookmarks: savedAnnotations.bookmarks,       // EPUB + PDF + Audiobook
    highlights: savedAnnotations.highlights,     // EPUB only
    comments: savedAnnotations.comments,         // Audiobook only
  },
  api: {
    updateCurrentLocation: async (locator) => {
      await api.saveReadingPosition(bookId, locator);
    },
  },
});
```

---

## Highlighting & Annotations

### Highlight types

```typescript
enum HighlightType {
  Highlight = "highlight",
  Underline = "underline",
  Bookmark = "bookmark",
  Note = "note",
}
```

### Annotation structure

```typescript
interface Annotation extends Locator {
  id?: any;
  created: Date;
  highlight?: IHighlight;
}

interface IHighlight {
  id: string;
  href: string;
  type: HighlightType;
  color?: string;           // Hex color, e.g. "#FFFF00"
  textBefore?: string;
  textHighlight?: string;
  textAfter?: string;
  cfiRange?: string;        // EPUB CFI range
  cssSelector?: string;     // CSS selector
  createdAt: string;        // ISO timestamp
  note?: string;            // User note
}
```

### Adding custom selection menu items

When the user selects text, you can add custom actions to the context menu:

```typescript
const reader = await D2Reader.load({
  url: manifestUrl,
  injectables: [...],
  highlighter: {
    selectionMenuItems: [
      {
        id: "highlight-yellow",
        label: "Highlight",
        callback: (selection) => {
          reader.addAnnotation({
            ...reader.currentLocator,
            created: new Date(),
            highlight: {
              id: crypto.randomUUID(),
              href: selection.href,
              type: "highlight",
              color: "#FFFF00",
              textHighlight: selection.cleanText,
              cssSelector: selection.rangeInfo.startContainerElementCssSelector,
              createdAt: new Date().toISOString(),
            },
          });
        },
      },
    ],
  },
});
```

### Custom highlight colors

You can customize the highlight color palette via the `highlighter.colors` config:

```typescript
highlighter: {
  colors: ['#e2725b', '#00a693', '#87cefa', '#ffd700'],  // first color is the default
  // ...
}
```

When omitted, the built-in 7-color palette is used. You can also change the active color at runtime:

```typescript
reader.changeHighlighterColor('#ff0000');
```

### Layers

Annotations are organized into named layers. You can show/hide entire layers:

```typescript
reader.showLayer("highlights");
reader.hideLayer("highlights");
```

---

## Views & Layout

### Reflowable view

For reflowable EPUBs. Supports two modes:

- **Paginated** (default): Content is split into pages. Navigate with `nextPage()`/`previousPage()`.
- **Scrolled**: Content is one continuous scroll. Toggle with `reader.scroll(true)`.

Column layout: 1-column, 2-column, or auto (based on viewport width).

### Fixed-layout view

For fixed-layout EPUBs. Pages have fixed dimensions defined by the publisher. Supports single-page and spread (two-page) display. No scroll/pagination toggle.

### Controlling layout

```typescript
// Set margins and nav bar height
reader.applyAttributes({
  margin: 40,          // 40px left/right margins
  navHeight: 60,       // 60px top navigation bar
  bottomInfoHeight: 30 // 30px bottom info bar
});

// Switch between scroll and paginated
await reader.scroll(true);   // Enable scrolling
await reader.scroll(false);  // Enable pagination

// Column count
await reader.applyUserSettings({ columnCount: 2 }); // Two columns
```

---

## CSS Theming & Injectables

### Readium CSS variables

These CSS custom properties control the reader appearance. They are set by the `UserSettings` system, but you can also reference them in your injected CSS:

```css
--USER__fontSize        /* Font size (%) */
--USER__fontFamily      /* Font family name */
--USER__appearance      /* "readium-default-on", "readium-sepia-on", "readium-night-on" */
--USER__scroll          /* "readium-scroll-on" or "readium-scroll-off" */
--USER__textAlignment   /* Text alignment */
--USER__columnCount     /* Column count */
--USER__wordSpacing     /* Word spacing */
--USER__letterSpacing   /* Letter spacing */
--USER__pageMargins     /* Page margins */
--USER__lineHeight      /* Line height */
--USER__bodyHyphens     /* "readium-bodyHyphens-on" or "readium-bodyHyphens-off" */
--USER__paraSpacing     /* Paragraph spacing (rem) */
--USER__paraIndent      /* Paragraph indent (em) */
--USER__typeScale       /* Type scale factor */
--USER__backgroundColor /* Custom background color (hex) */
--USER__textColor       /* Custom text color (hex) */
```

### Injecting custom styles

```typescript
D2Reader.load({
  url: manifestUrl,
  injectables: [
    // Readium CSS (required, in order)
    { type: "style", url: "/css/ReadiumCSS-before.css", r2before: true },
    { type: "style", url: "/css/ReadiumCSS-default.css", r2default: true },
    { type: "style", url: "/css/ReadiumCSS-after.css", r2after: true },

    // Custom font
    {
      type: "style",
      url: "/fonts/open-dyslexic.css",
      fontFamily: "OpenDyslexic",
      r2after: true,
    },

    // Custom theme overrides
    { type: "style", url: "/css/my-overrides.css", r2after: true },

    // Custom script
    { type: "script", url: "/js/my-widget.js", r2after: true, async: true },
  ],
});
```

### Injecting fixed-layout styles

Use `injectablesFixed` for CSS/JS that should only be injected into fixed-layout publications:

```typescript
D2Reader.load({
  injectablesFixed: [
    { type: "style", url: "/css/fixed-overrides.css" },
  ],
});
```

### Appearance modes

Three built-in appearance modes:

| Value | Mode | Description |
|-------|------|-------------|
| `0` | Default | Light background, dark text |
| `1` | Sepia | Warm-toned background |
| `2` | Night | Dark background, light text |

Switch at runtime:

```typescript
await reader.applyUserSettings({ appearance: 2 }); // Night mode
```

---

## PDF Support

DITA Toolkit supports PDF documents via pdf.js. When the publication manifest indicates a PDF, `D2Reader.load()` dispatches to `PDFNavigator` instead of the default `EpubNavigator`.

### Setup

Provide the pdf.js worker path:

```typescript
D2Reader.load({
  url: new URL("https://example.com/pdf-manifest.json"),
  injectables: [],
  workerSrc: "/pdfjs/pdf.worker.min.mjs",
});
```

### PDF-specific methods

```typescript
reader.fitToPage();       // Fit entire page in view
reader.fitToWidth();      // Fit page width to viewport
reader.zoomIn();          // Zoom in
reader.zoomOut();         // Zoom out
reader.activateHand();    // Enable grab-to-pan tool
reader.deactivateHand();  // Disable grab-to-pan
```

### PDF annotations

PDF annotations (highlights) are supported via pdf.js's built-in annotation editor. The reader handles serialization and persistence of PDF annotations through the same `Annotator` interface used for EPUB annotations.

---

## Audiobook Support

DITA Toolkit supports Readium Audiobook Profile publications. `D2Reader.load()` dispatches to `AudiobookNavigator` when `manifest.conformsTo` includes `Profile.AUDIOBOOK`.

### Setup

```typescript
D2Reader.load({
  url: new URL("https://example.com/audiobook/manifest.json"),
  audiobook: {
    chapterListContainer: document.getElementById("chapter-list")!,
    preservePitchWorkletUrl: "/PreservePitchProcessor.js",  // optional — pitch worklet for browsers lacking native preservesPitch
    userSettings: { /* persisted preferences */ },
    timeline:  { /* scrubber options */ },
    bookmarks: { /* bookmark UI options */ },
    comments:  { /* comments UI options */ },
    prefetch:  { enabled: false },                          // chapter prefetcher (disabled by default)
  },
});
```

### Public surface

```typescript
// Playback
await reader.play();
reader.pause();
await reader.seek(seconds);
await reader.jump(deltaSeconds);
await reader.skipForward();
await reader.skipBackward();
await reader.nextChapter();
await reader.previousChapter();
await reader.setPlaybackRate(rate);
await reader.setVolume(0.0 to 1.0);
await reader.setMuted(boolean);

// Read-only state getters
reader.currentTime;     // seconds within current track
reader.duration;        // total seconds for current track
reader.isPlaying;
reader.isPaused;
reader.isWaiting;       // covers cross-chapter load / cold-start / rebuffer
reader.isTrackStart;
reader.isTrackEnd;
reader.canGoForward;
reader.canGoBackward;
reader.currentLocator();
```

### Pluggable audio engine

The default `WebAudioEngine` handles the common case: an `<audio>` fast path, plus a lazy Web Audio worklet (`PreservePitchProcessor`) for pitch preservation on browsers lacking native `HTMLMediaElement.preservesPitch`.

For DRM, HLS, or vendor SDK sources, implement `AudioEngine` + `EngineFactory` and pass it on the audiobook config:

```typescript
audiobook: {
  engineFactory: {
    create: ({ audioElement, source }) => new MyDrmEngine({ audioElement, source }),
    destroy: (engine) => engine.dispose(),
  },
  resolveSource: (link) => ({
    kind: "drm",                           // url | drm | hls | vendor
    contentKey: link.properties?.licenseKey,
    url: link.href,
  }),
}
```

### Sleep timer

Two modes — minutes (wall-clock based) and end-of-chapter:

```typescript
reader.startSleepTimer({ mode: "minutes", minutes: 30 });
reader.startSleepTimer({ mode: "endOfChapter" });
reader.cancelSleepTimer();

reader.addEventListener("sleeptimer.tick", ({ secondsRemaining }) => { /* UI */ });
reader.addEventListener("sleeptimer.expired", () => { /* fade-out, etc. */ });
```

### MediaSession integration

When `audiobook.userSettings.enableMediaSession` is on (default), the navigator installs `navigator.mediaSession` metadata + action handlers. Surfaces in:

- Lock-screen controls (iOS, Android, Windows)
- Media keys (volume, play / pause, prev / next track)
- CarPlay / Android Auto (when the integrator embeds the reader in a webview shell)

### Audiobook modules

| Module | Purpose |
|---|---|
| `AudiobookBookmarkModule` | Timestamped bookmarks, `findBookmarkAt` with ±1s tolerance, optional chapter-grouped list. |
| `AudiobookCommentsModule` | Point-anchored time-stamped comments with `onEdit` integrator hook. |
| `AudiobookTimelineModule` | Chapter-scoped + whole-book scrubber UI + timeline math API. Calls `prefetchResource` on drag. |

### Locator extension for audiobook positions

`Locator.locations` has been extended with `time` (seconds) and `fragments` (Media Fragments URI tokens):

```typescript
const locator: Locator = {
  href: "audio/chapter-03.mp3",
  type: "audio/mpeg",
  locations: {
    time: 1234.56,        // seconds within the track
    fragments: ["t=1234"], // Media Fragments URI
  },
};
```

EPUB and PDF Locators round-trip unchanged.

### ChapterPrefetcher

Optional head-of-chapter HTTP `Range` prefetch (`Range: bytes=0-N`). **Disabled by default**; head-only caching alone does not satisfy the audio element's `HAVE_FUTURE_DATA` threshold, so it does not by itself shorten time-to-audible. Enable when you have a known prefetch payoff (e.g. integrating with a CDN that benefits from priming).

---

## Integration Patterns

### React integration

```tsx
import D2Reader from "@d-i-t-a/reader";
import { useEffect, useRef, useState, useCallback } from "react";

function EpubReader({ manifestUrl, onLocationChange }) {
  const readerRef = useRef<D2Reader | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    D2Reader.load({
      url: new URL(manifestUrl),
      injectables: [
        { type: "style", url: "/readium-css/ReadiumCSS-before.css", r2before: true },
        { type: "style", url: "/readium-css/ReadiumCSS-default.css", r2default: true },
        { type: "style", url: "/readium-css/ReadiumCSS-after.css", r2after: true },
      ],
      rights: {
        enableBookmarks: true,
        enableAnnotations: true,
        enableTTS: true,
        enableSearch: true,
        enableHistory: true,
      },
      api: {
        getContent: async (href) => (await fetch(href)).text(),
        getContentBytesLength: async (href) => {
          const r = await fetch(href, { method: "HEAD" });
          return parseInt(r.headers.get("content-length") || "0");
        },
        updateCurrentLocation: async (locator) => {
          onLocationChange?.(locator);
        },
        resourceReady: () => setLoading(false),
      },
    }).then((r) => {
      readerRef.current = r;
    });

    return () => {
      readerRef.current?.stop();
      readerRef.current = null;
    };
  }, [manifestUrl]);

  return (
    <div id="D2Reader-Container">
      <main tabIndex={-1} id="iframe-wrapper" style={{ height: "100vh" }}>
        <div id="reader-loading" className="loading" />
        <div id="reader-error" className="error" />
      </main>
    </div>
  );
}
```

### Restoring reading position

```typescript
const savedPosition = await fetchFromBackend(`/api/position/${bookId}`);

const reader = await D2Reader.load({
  url: manifestUrl,
  injectables: [...],
  lastReadingPosition: savedPosition,  // Restore on load
  api: {
    updateCurrentLocation: async (locator) => {
      // Save whenever position changes
      await saveToBackend(`/api/position/${bookId}`, locator);
    },
  },
});
```

### Building a table of contents

```typescript
const reader = await D2Reader.load({ /* ... */ });

const toc = reader.tableOfContents;
// toc is an array of Link objects:
// [{ href: "chapter1.xhtml", title: "Chapter 1", children: [...] }, ...]

function renderTOC(links) {
  return links.map((link) => (
    <li key={link.href}>
      <a onClick={() => reader.goTo({ href: link.href, locations: {} })}>
        {link.title}
      </a>
      {link.children && <ul>{renderTOC(link.children)}</ul>}
    </li>
  ));
}
```

### Building a progress bar

```typescript
reader.addEventListener("resource.ready", () => {
  const locator = reader.currentLocator;
  const progress = locator.locations.totalProgression ?? 0;
  progressBar.style.width = `${progress * 100}%`;
});
```

### Sample read (preview mode)

Limit how much of a publication the user can read:

```typescript
D2Reader.load({
  url: manifestUrl,
  injectables: [...],
  sample: {
    isSample: true,
    limit: 0.1,  // Allow reading first 10%
  },
});
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
│  (UI, buttons, menus, settings panel, progress bar)      │
├──────────────────────┬──────────────────────────────────┤
│                      │                                    │
│    D2Reader          │  NavigatorAPI callbacks             │
│    (Public API)      │  (your app ← reader)               │
│                      │                                    │
├──────────────────────┴──────────────────────────────────┤
│                                                           │
│  Navigator (EpubNavigator | PDFNavigator | AudiobookNavigator) │
│  ├── EventEmitter (resource.ready, playback.*, etc.)      │
│  ├── Renderer (Column / Scroll / Vertical / Fixed)        │
│  ├── UserSettings (ReadiumCSS v1 + v2 dual-applicator)    │
│  ├── Fetcher chain (Cache → Transform → Http / Zip)       │
│  ├── Store (LocalStorage / Session / Memory)              │
│  └── Annotator (bookmarks, annotations, positions)        │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  Modules (optional, enabled via ReaderRights)             │
│  ├── BookmarkModule                                       │
│  ├── AnnotationModule + TextHighlighter                   │
│  ├── TTSModule2                                           │
│  ├── SearchModule                                         │
│  ├── DefinitionsModule                                    │
│  ├── MediaOverlayModule                                   │
│  ├── ContentProtectionModule                              │
│  ├── PageBreakModule                                      │
│  ├── TimelineModule                                       │
│  ├── LineFocusModule                                      │
│  ├── HistoryModule                                        │
│  ├── CitationModule                                       │
│  └── ConsumptionModule                                    │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  Content Rendering                                        │
│  ├── iframe (EPUB content + injected CSS/JS)              │
│  └── PDF.js viewer (PDF content)                          │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  @readium/shared (Readium shared models)                  │
│  (Publication, Metadata, Link, Contributor, etc.)         │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Data flow

1. **Initialization**: `D2Reader.load()` fetches the manifest, creates a `Publication`, initializes the appropriate `Navigator`, creates enabled modules, and renders the first resource.

2. **Navigation**: User actions (next page, TOC click, goTo) flow through `D2Reader` -> `Navigator` -> `BookView`. The view updates the iframe content and position.

3. **Position tracking**: After each navigation, the navigator calculates the new `Locator` and calls `NavigatorAPI.updateCurrentLocation()` so your app can persist it.

4. **User settings**: Changes flow through `UserSettings` which updates Readium CSS custom properties on the content iframe, triggering a re-layout.

5. **Module interaction**: Modules register with the navigator for events (text selection, page load, etc.) and expose their APIs through `D2Reader`'s facade methods.

---

## Browser Support

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 109+ (2023) |
| Firefox | 115+ (2023 ESR) |
| Safari | 16+ (2022) |
| Edge | 109+ (2023) |

---

## Troubleshooting

### Reader does not render

- Verify the HTML structure exists (`#D2Reader-Container`, `#iframe-wrapper`, `#reader-loading`, `#reader-error`) **before** calling `D2Reader.load()`.
- Set an explicit `height` on `#iframe-wrapper` (e.g., `height: 100vh`).
- Verify the manifest URL is accessible and returns valid JSON.

### Content styles look wrong

- Ensure all three Readium CSS files are provided as injectables in the correct order: `r2before`, `r2default`, `r2after`.
- Check that injectable URLs are accessible from the browser (not blocked by CORS).

### Reading position not restored

- Pass `lastReadingPosition` in the config, not after loading.
- The `ReadingPosition` must include a valid `href` that matches a spine item in the publication.

### TTS not working

- Ensure `rights.enableTTS: true` is set.
- Web Speech API requires user interaction before first use in most browsers.
- Check `window.speechSynthesis` is available.

### Memory leaks in SPA

- Always call `reader.stop()` when unmounting the reader component.
- In React, use a cleanup function in `useEffect`.

### PDF worker errors

- Provide the correct `workerSrc` path pointing to `pdf.worker.min.mjs`.
- The worker file must be served with the correct MIME type.

---

## Exported Types

The package exports these types for TypeScript consumers:

```typescript
// Main class
import D2Reader from "@d-i-t-a/reader";
import { load } from "@d-i-t-a/reader";

// Models
import { Link, Locator, Locations, LocatorText } from "@d-i-t-a/reader";
import { ReadingPosition, Bookmark, Annotation, AnnotationMarker } from "@d-i-t-a/reader";

// Configuration types
import type {
  ReaderConfig,
  ReaderRights,
  NavigatorAPI,
  IFrameAttributes,
  Injectable,
  RequestConfig,
  SampleRead,
  PublicationServices,
  InitialAnnotations,
} from "@d-i-t-a/reader";

// User settings
import type {
  IUserSettings,
  InitialUserSettings,
  UserSettingsIncrementable,
} from "@d-i-t-a/reader";

// Storage
import type { LocalStorageStoreConfig } from "@d-i-t-a/reader";
```

---

## License

Apache-2.0. See [LICENSE](LICENSE) for details.

Developed by [DITA (AM Consulting LLC)](https://dita.digital). Supported by NYPL, Bokbasen, and CAST.
