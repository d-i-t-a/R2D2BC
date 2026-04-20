# R2D2BC Examples

Eight example implementations are included to demonstrate how to integrate `@d-i-t-a/reader` across different frameworks and environments.

| Example | Framework | Description |
|---------|-----------|-------------|
| [`viewer/index_dita.html`](../viewer/index_dita.html) | Vanilla (full) | Full-featured EPUB dev viewer with all modules |
| [`viewer/index_pdf.html`](../viewer/index_pdf.html) | Vanilla (full) | Full-featured PDF viewer with annotations, TOC, search |
| [`vanilla/`](vanilla/) | Vanilla JS | Minimal EPUB reader, single-file, no build tools |
| [`pdf/`](pdf/) | Vanilla JS | Minimal PDF viewer, standalone |
| [`react/`](react/) | React 18 | Complete reader app with sidebar |
| [`angular/`](angular/) | Angular 16+ | Standalone component (drop-in) |
| [`vue/`](vue/) | Vue 3 | Composition API SFC (drop-in) |
| [`nextjs/`](nextjs/) | Next.js | SSR-safe with dynamic import |
| [`remix/`](remix/) | Remix / React Router v7 | Client-only with loader pattern |

### Publication Library (Streamer)

`npm run examples` starts a streamer server with a landing page at `http://localhost:4444/viewer/index.html` that lists all local EPUB and PDF files from `examples/epubs/`. Publications show cover images, titles, and viewer links. Includes built-in Alice demos (hosted EPUB + PDF).

---

## Running the examples

From the project root:

```bash
# Install dependencies
npm install

# DITA Viewer — full-featured dev viewer (builds + watches + serves on port 4444)
npm run dev

# Publication Library — streamer with landing page (port 4444)
npm run examples

# Framework examples (each auto-clears Parcel cache before starting)
npm run example:react    # React 18 (Parcel, port 1234)
npm run example:vue      # Vue 3 (Parcel, port 1234)
npm run example:angular  # Angular (Parcel, port 1234)
npm run example:nextjs   # Next.js pattern (Parcel, port 1234)
npm run example:remix    # Remix pattern (Parcel, port 1234)

# Standalone examples (build + serve)
npm run example:vanilla  # Vanilla JS EPUB reader (port 3000)
npm run example:pdf      # Standalone PDF viewer (port 3001)
```

> **Parcel examples** share port 1234 — run one at a time.
> **Standalone examples** each have their own port.
> Each `example:*` script auto-clears the Parcel cache before starting.
> The DITA viewer (`npm run dev`) and vanilla example require a build step;
> the other examples import directly from source via Parcel.

---

## DITA Viewer (`viewer/index_dita.html`)

A full-featured vanilla JS/HTML viewer that exercises every reader capability. This is the primary test harness for development.

```bash
# Build + watch + serve on http://localhost:4444
npm run dev

# Streamer server for local EPUBs (serves files from examples/epubs/)
npm run examples
```

`npm run dev` builds the library (`dist/`), compiles SASS, and starts the esbuild watcher. The viewer loads the built library from `dist/` and uses its own ReadiumCSS from `viewer/readium-css-v2/`.

`npm run examples` starts a streamer server (`dita-streamer-js`) that serves local EPUB files from `examples/epubs/` through multiple viewer variants:

| Viewer | Path | Description |
|--------|------|-------------|
| DITA Example | `viewer/index_dita.html` | Full-featured viewer with all modules |
| Sample Read | `viewer/index_sampleread.html` | Preview/sample mode with read limits |
| Minimal | `viewer/index_minimal.html` | Minimal EPUB viewer |
| API Example | `viewer/index_api.html` | API callback demonstration |
| PDF | `viewer/index_pdf.html` | PDF document viewer (via pdf.js) |

The PDF viewer is a separate viewer for PDF publications, not an EPUB viewer variant. It uses `PDFNavigator` instead of `IFrameNavigator` and supports annotations, zoom, fit-to-page/width, and grab-to-pan.

### What it demonstrates

- **Reader Settings panel** with controls for all user settings:
  - Font size (slider, 100%–300%)
  - Font family (select: Publisher, Serif, Sans-serif, Open Dyslexic)
  - Appearance (Day / Sepia / Night segmented control)
  - Layout (Scroll / Paginated)
  - Text alignment (Auto / Justify / Start)
  - Column count (Auto / Single / Double)
  - Text direction (Auto / LTR / RTL)
  - Word spacing, letter spacing, page margins, line height (sliders with value readout)
  - Paragraph spacing and paragraph indent (sliders, 0–3, step 0.5)
  - Type scale (slider, 1.0–1.5)
  - Hyphenation (toggle switch)
  - Background color and text color (color pickers)
  - Reset button that restores all controls to defaults
- **TTS** with rate, pitch, and volume sliders
- **Layers panel** for toggling highlights, definitions, search, and page breaks
- **Built-in header menu** for search, bookmarks, annotations, and TOC (when `headerMenu` is provided)
- **Page info** via navigator-managed DOM elements (`.book-title`, `.chapter-title`, `.chapter-position`)
- **Position slider** for scrubbing through the publication
- **NavigatorAPI callbacks** for all lifecycle events

### Configuration highlights

```javascript
D2Reader.load({
    url: new URL(defined_defined),
    injectables: [...],
    injectablesFixed: [...],
    attributes: {
        margin: 5,
        navHeight: 65,
        iframePaddingTop: 0,
        bottomInfoHeight: 75,
    },
    rights: {
        enableBookmarks: false,
        enableAnnotations: false,
        enableTTS: false,
        enableSearch: false,
        enableDefinitions: true,
        enableContentProtection: false,
        enableTimeline: false,
        enableMediaOverlays: false,
        enablePageBreaks: false,
        enableLineFocus: false,
        autoGeneratePositions: true,
    },
    // userSettings can override defaults:
    userSettings: {
        // fontSize: 120,
        // bodyHyphens: true,
        // paraSpacing: 1.0,
        // paraIndent: 1.0,
        // typeScale: 1.2,
        // backgroundColor: "#fefefe",
        // textColor: "#333333",
    },
    api: {
        updateCurrentLocation: function(location) { ... },
        resourceReady: function() { ... },
        resourceAtStart: function() { ... },
        resourceAtEnd: function() { ... },
        onError: function(e) { ... },
    },
});
```

### Required DOM structure

```html
<main id="iframe-wrapper">
    <div id="reader-loading" class="dita-loading"></div>
    <div id="reader-error" class="dita-error"></div>
    <div id="reader-info-top" class="dita-info top">
        <span class="book-title"></span>
    </div>
    <div id="reader-info-bottom" class="dita-info bottom">
        <span class="chapter-position"></span>
        <span class="chapter-title"></span>
        <input type="range" id="positionSlider" />
    </div>
</main>
```

The navigator automatically populates `.book-title`, `.chapter-title`, and `.chapter-position` when these elements exist.

---

## React Example (`examples/react/`)

A modern React 18 single-page reader app with a complete UI.

### What it demonstrates

- **React 18** with `createRoot` (no legacy `ReactDOM.render`)
- **Toolbar** with navigation arrows, scroll/paginate toggle, bookmark button, and live page info (chapter title, page X of Y, book progress %)
- **Sliding sidebar** with four tabs:
  - **TOC** — clickable table of contents from `reader.tableOfContents`
  - **Settings** — all user settings as compact controls (sliders, selects, segmented buttons)
  - **Bookmarks** — add/delete/navigate bookmarks via `reader.saveBookmark()` / `reader.deleteBookmark()`
  - **Search** — text input with results list, navigate via `reader.goToSearchID()`
- **Keyboard navigation** — arrow keys for page turns
- **Event-driven page info** — listens to `resource.ready` and `click` events to update position display from `reader.currentLocator`
- **Rights configuration** — enables bookmarks, annotations, search, and auto position generation

### Running

```bash
npm run example:react
# Opens at http://localhost:1234
```

### Key code patterns

**Initialization with rights:**

```tsx
D2Reader.load({
  url: new URL("https://alice.dita.digital/manifest.json"),
  injectables,
  injectablesFixed: [],
  rights: {
    enableBookmarks: true,
    enableAnnotations: true,
    enableSearch: true,
    autoGeneratePositions: true,
    // ... other flags false
  },
}).then(setReader);
```

**Reading page info from currentLocator:**

```tsx
const locator = reader.currentLocator;
// locator.title          — chapter title
// locator.displayInfo.resourceScreenIndex — page number in chapter
// locator.displayInfo.resourceScreenCount — total pages in chapter
// locator.locations.totalProgression      — 0.0–1.0 book progress
```

**Listening for navigation events:**

```tsx
reader.addEventListener("resource.ready", () => {
  // Update UI with new position info
  const locator = reader.currentLocator;
  setPageInfo({ ... });
});
```

**TOC navigation** (properties are camelCase via `convertAndCamel`):

```tsx
const toc = reader.tableOfContents;
// toc[i].href  (not .Href)
// toc[i].title (not .Title)
reader.goTo({ href: item.href, locations: {}, title: item.title });
```

**Search:**

```tsx
const results = await reader.search("alice", false);
// results[i].textBefore, .textMatch, .textAfter, .href, .uuid
await reader.goToSearchID(result.href, result.uuid, false);
await reader.clearSearch();
```

### File structure

```
examples/react/
  index.html       — Entry point with #root div
  index.tsx         — Full React app (single file)
  tsconfig.json     — Extends root tsconfig
```

ReadiumCSS is imported from `viewer/readium-css-v2/` via relative Parcel `url:` imports; no per-example CSS copy is needed.

---

## Vanilla JS Example (`examples/vanilla/`)

A single `index.html` file — no build tools, no framework, no bundler. Shows the simplest possible integration using ESM `<script type="module">` imports.

Features: toolbar, TOC sidebar, settings, bookmarks, page info, keyboard navigation.

```bash
# Serve from project root (needs the dist/ build)
npx serve .
# Open http://localhost:3000/examples/vanilla/
```

---

## Angular Example (`examples/angular/`)

A standalone Angular 16+ component (`reader.component.ts`) designed to be dropped into an existing Angular project. Uses `OnPush` change detection with manual `detectChanges()` for reader events.

See [`examples/angular/README.md`](angular/README.md) for integration instructions.

---

## Vue Example (`examples/vue/`)

A Vue 3 Single File Component (`ReaderComponent.vue`) using Composition API (`<script setup>`). Uses reactive refs for reader state and scoped styles.

See [`examples/vue/README.md`](vue/README.md) for integration instructions.

---

## Next.js Example (`examples/nextjs/`)

Shows the critical SSR gotcha: the reader requires `window`/`document` so it must be dynamically imported with `ssr: false`. Includes `EpubReader.tsx` (client component) and `page.tsx` (using `next/dynamic`).

See [`examples/nextjs/README.md`](nextjs/README.md) for integration instructions.

---

## Remix Example (`examples/remix/`)

Shows the Remix/React Router v7 integration pattern using `React.lazy()` + `<Suspense>` for client-only loading, and typed loaders to pass the manifest URL from the server.

See [`examples/remix/README.md`](remix/README.md) for integration instructions.

---

## Comparison

| Feature | DITA Viewer | Vanilla | React | Angular | Vue | Next.js | Remix |
|---------|------------|---------|-------|---------|-----|---------|-------|
| Build tools needed | No | No | Parcel | Angular CLI | Vite | Next.js | Remix |
| Settings UI | Full | Basic | Full | Basic | Full | Basic | Basic |
| TOC | Built-in | Yes | Yes | Yes | Yes | Yes | Yes |
| Bookmarks | Built-in | Yes | Yes | Yes | Yes | Yes | Yes |
| Search | Built-in | No | Yes | No | Yes | No | No |
| Page info | Navigator DOM | Yes | Yes | Yes | Yes | Yes | Yes |
| TTS | Yes | No | No | No | No | No | No |
| SSR safe | N/A | N/A | N/A | N/A | N/A | Yes | Yes |

The DITA viewer exercises all features. The framework examples show the integration pattern for each ecosystem.
