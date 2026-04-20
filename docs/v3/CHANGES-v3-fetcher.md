# CHANGES — v3 Workstream 3.4: Fetcher / Resource / Container Abstraction

## Summary

All content loading now goes through a composable `Fetcher` / `Resource` / `Container` architecture. Zero raw `fetch()` calls remain outside Fetcher implementations. Modules no longer call `api.getContent` directly — everything flows through the Fetcher chain. Client-side EPUB file opening works without a server, including font deobfuscation, full OPF metadata parsing, and blob URL management.

## System Boundaries

The reader has three distinct systems. Understanding their boundaries is essential for integrators.

### Fetcher — content pipeline

All EPUB content flows through the Fetcher chain: chapter HTML, search content, media overlay manifests, popup footnotes, font bytes. The chain is composable (Cache → Content → Transform → Http/Zip). Modules and the navigator call `fetcher.get(link)` or `fetcher.getByHref(href)` and receive a `Resource` without knowing the content source.

### Modules — reader features

Modules implement reader features: bookmarks, annotations, search, TTS, media overlays, content protection, etc. They're registered on the navigator and receive a `ModuleHost` with access to the fetcher, publication, navigation state, DOM, events, and settings. Use a module when the feature needs to interact with the reader.

### Injectables — iframe CSS/JS injection

Injectables are integrator-supplied CSS/JS added to each chapter iframe's `<head>`. Inserted into the parsed chapter HTML *before* `document.write()` runs, so the browser loads them in parallel with the body — no flash of unstyled content, no second round-trip after the iframe loads.

`Injectable` is a discriminated union keyed on `type`:

| `type` | Purpose |
|--------|---------|
| `"style"` | External CSS via `url` or `blob`. Supports `r2before` / `r2default` / `r2after` cascade + `fontFamily` / `appearance` / `systemFont` registration. |
| `"script"` | External JS via `url` or `blob`. Optional `async` / `module`. |
| `"style-inline"` | Inline CSS via `source` string — no HTTP round-trip. Same r2* cascade as `style`. |
| `"script-inline"` | Inline JS via `source` string — no HTTP round-trip. Optional `async` / `module`. |

All variants share optional `when({ publication, resourceHref, doc }) => boolean` predicate (per-resource, per-publication, or content-gated via the parsed XHTML `doc`) and `attributes` passthrough for CSP `nonce`, SRI `integrity`, `crossorigin`, `media`, `data-*`, etc.

DOM behaviour (click listeners, popup UI, glossary, analytics) is handled by injecting an external `type: "script"` whose source attaches its own handlers inside the iframe — the existing v2.5 pattern (see `injectables/click/click.ts`, `injectables/mui/script.js`) continues to work unchanged.

`src/navigator/InjectableManager.ts` owns the pipeline:
- `injectStaticIntoDoc(doc, iframe, injectables, href)` — synchronous, mutates the parsed HTML before write.
- `cleanupForIframe(iframe)` — revokes any blob object URLs allocated during injection; called on chapter change and reader stop.

**When to use which:**
- Need to load/process EPUB content → **Fetcher**
- Need the reader's API (publication, navigation, events) → **Module**
- Static CSS/JS to run in every chapter iframe → **Injectable**

## Architecture

### Container

Separates data storage from content fetching. A Container holds entries and provides raw byte access. Fetchers wrap Containers to build Resources.

| File | Purpose |
|------|---------|
| `src/fetcher/Container.ts` | `Container` interface — `entries()`, `get()`, `has()`, `destroy()` |
| `src/fetcher/ZipContainer.ts` | ZIP implementation using `fflate` — EPUB, CBZ, audiobook archives |

### Fetcher Chain

Composable pipeline. Each layer wraps the next:

```
CacheFetcher → Base64DecodingFetcher? → ContentFetcher → TransformingFetcher → HttpFetcher / ZipFetcher
```

| File | Purpose |
|------|---------|
| `src/fetcher/Fetcher.ts` | `Fetcher` and `Resource` interfaces |
| `src/fetcher/HttpFetcher.ts` | HTTP `fetch()` with AbortController, typed errors. Returns raw response text. |
| `src/fetcher/Base64DecodingFetcher.ts` | Optional layer that base64-decodes text for HTML/XHTML/XML responses when `requestConfig.encoded` is set. Bypassed for non-document content types (JSON positions service, SMIL, etc.) and for already-decoded content (first non-whitespace char `<`). |
| `src/fetcher/ContentFetcher.ts` | Wraps integrator's `api.getContent` callback. Only delegates for hrefs that belong to the publication (readingOrder + resources); all other requests (positions service, external links, browser-chrome URLs) pass straight through. |
| `src/fetcher/CacheFetcher.ts` | In-memory cache with request coalescing + predictive prefetch |
| `src/fetcher/TransformingFetcher.ts` | Applies composable `ResourceTransform` functions to resources |
| `src/fetcher/ZipFetcher.ts` | Reads from a Container, resolves paths, builds Resources |

### Error Handling

| File | Purpose |
|------|---------|
| `src/fetcher/ReadError.ts` | Typed errors: `access` (not found, network), `decoding` (corrupt), `cancelled` (aborted) |

All Fetcher implementations throw `ReadError` instead of generic `Error`. Callers can branch on `error.type`.

### Resource

The `Resource` interface carries:
- `text` — string content (HTML, XML, JSON)
- `bytes` — raw binary content (images, fonts, PDF)
- `headers` — HTTP headers or equivalent
- `mediaType` — content type
- `href` — resolved URL
- `properties` — extensible metadata (`Record<string, unknown>`) for encryption info, filenames, custom data

### EPUB Parsing

| File | Purpose |
|------|---------|
| `src/fetcher/EpubParser.ts` | Full OPF parser (EPUB 2 + 3) → Readium RWPM manifest |
| `src/fetcher/BlobUrlManager.ts` | Blob URLs from Container, composable transforms, DOM rewriting |
| `src/fetcher/FontDeobfuscator.ts` | IDPF + Adobe font deobfuscation, encryption.xml parsing, `createDeobfuscationTransform` |

**EpubParser metadata:** title, language, identifier, authors, publisher, description, subjects, published date, modified date, numberOfPages, layout (EPUB3 + EPUB2), readingProgression, rendition:spread, rendition:orientation, media overlay active/playback classes.

**EpubParser spine:** page-progression-direction, page-spread properties, `linear="no"` filtering (non-linear items go to resources).

**EpubParser resources:** cover image detection (EPUB3 `cover-image` property + EPUB2 `meta name="cover"`).

**EpubParser TOC:** EPUB3 nav document with fallback to EPUB2 NCX. Recursive children.

**Font deobfuscation:** Parses `META-INF/encryption.xml`, applies IDPF (SHA-1 + XOR 1040 bytes) or Adobe (UUID + XOR 1024 bytes) deobfuscation. Works as a composable `ResourceTransform` via `createDeobfuscationTransform()`. Encryption info is stored on:
- `ZipFetcher` Resources (via `properties.encrypted`)
- `BlobUrlManager` Resources (via `setEncryptionMap`)
- Publication Links (via `link.properties`)

### Utilities

| File | Purpose |
|------|---------|
| `src/fetcher/mediaType.ts` | Shared `guessMediaType(path)` — single source for extension → media type mapping |

### Viewer

| File | Purpose |
|------|---------|
| `viewer/index_epub_file.html` | EPUB file viewer — drag-drop, file picker, URL input for hosted EPUBs, IndexedDB persistence, bookmark, annotations, scroll/paginate toggle |
| `viewer/index.html` | Publication library — EPUB 3 sample tiles with dynamic tag filters, filter persistence in URL |

## Modified Files

| File | Change |
|------|--------|
| `src/navigator/EpubNavigator.ts` | Loading rewritten to use Fetcher pipeline (~350→~60 lines); `stop()` removes iframes from DOM; ContentFetcher in chain |
| `src/navigator/PDFNavigator.ts` | `_fetcher` field for ModuleHost compliance |
| `src/modules/ModuleHost.ts` | Added `readonly fetcher: Fetcher` |
| `src/modules/epub/search/SearchModule.ts` | `fetch()` → `fetcher.getByHref()`; removed dual `api.getContent` path; removed dead `decodeBase64()` |
| `src/modules/epub/search/Popup.ts` | `fetch()` → `fetcher.getByHref()`; removed dual `api.getContent` path |
| `src/modules/epub/mediaoverlays/MediaOverlayModule.ts` | `fetch()` → `fetcher.getByHref()` |
| `src/modules/epub/AnnotationModule.ts` | Defensive null checks on `currentLocator()` |
| `src/model/v3/Publication.ts` | `fromUrl()`, position/weight services require Fetcher; dead `fetchContentBytesLength` removed |
| `src/reader.ts` | EPUB file path (File/Blob/ArrayBuffer/URL/string); encryption.xml; encryption on links; TransformingFetcher in chain; skip double position generation |
| `src/index.ts` | Exports all Fetcher, Container, ReadError, Transform, mediaType types |
| `viewer/index.html` | EPUB 3 sample tiles, dynamic tag filters from metadata, filter persistence in URL |
| `examples/server.ts` | `/api/fetch-epub` route for CORS-restricted EPUB URLs |

## Removed Files

| File | Reason |
|------|--------|
| `src/fetcher/EpubServiceWorker.ts` | `document.write()` iframes bypass service workers |
| `src/fetcher/epub-sw.js` | Same |
| `src/fetcher/EncryptedFetcher.ts` | Renamed to `ContentFetcher.ts` |

## Breaking Changes

These only affect code that calls `Publication` methods directly. The public `D2Reader.load()` API is unchanged.

### `Publication.fromUrl()` requires a `Fetcher`

```typescript
// Before
const pub = await Publication.fromUrl(url, requestConfig);

// After
const pub = await Publication.fromUrl(url, requestConfig, fetcher);
```

### `Publication.autoGeneratePositions()` requires a callback

```typescript
// Before — used internal raw fetch
await pub.autoGeneratePositions(requestConfig);

// After — caller provides the length function
await pub.autoGeneratePositions(requestConfig, getContentBytesLength);
```

### `Publication.fetchPositionsFromService()` / `fetchWeightsFromService()`

```typescript
// Before
await pub.fetchPositionsFromService(href, requestConfig);

// After
await pub.fetchPositionsFromService(href, fetcher);
```

### v3 interface changes (not breaking for 2.x integrators)

These interfaces were introduced in v3 alpha workstreams. No 2.x code uses them.

- `ModuleHost` gains `readonly fetcher: Fetcher`
- `EpubNavigator.stop()` now removes iframes from DOM
- `Resource` gains optional `properties` field

## New Capability: Open EPUBs Directly

```typescript
// Local file (drag-drop, file picker, IndexedDB)
const reader = await D2Reader.load({ epub: file, ... });

// Raw bytes already in memory
const reader = await D2Reader.load({ epub: arrayBuffer, ... });

// Hosted EPUB URL (fetched automatically, uses requestConfig for CORS/auth)
const reader = await D2Reader.load({ epub: "https://example.com/book.epub", ... });
const reader = await D2Reader.load({ epub: new URL("https://..."), ... });
```

Accepts `File`, `Blob`, `ArrayBuffer`, `URL`, or `string`. No server or streamer needed. The EPUB is parsed entirely client-side:
1. `ZipContainer` parses the archive
2. `ZipFetcher` wraps the container for resource access
3. `EpubParser` reads container.xml → OPF → Publication
4. `META-INF/encryption.xml` parsed for font obfuscation info
5. `BlobUrlManager` creates blob URLs with deobfuscation transform
6. DOM is rewritten to use blob URLs before `document.write()`
7. Encryption info stored on Publication links

## New Dependency

- `fflate` — fast ZIP decompression (used by `ZipContainer`)

## Fetcher Chain

```
CacheFetcher → Base64DecodingFetcher? → ContentFetcher → TransformingFetcher → HttpFetcher → Network
                                                                             → ZipFetcher  → ZipContainer
```

Each layer is optional. The navigator picks the right chain based on source:
- **Webpub (server):** `CacheFetcher → Base64DecodingFetcher? → ContentFetcher? → HttpFetcher`
- **EPUB file:** `CacheFetcher → TransformingFetcher? → ZipFetcher → ZipContainer`

`Base64DecodingFetcher` is inserted only when `requestConfig.encoded` is true, and sits *above* `ContentFetcher` so it decodes both integrator-supplied content and server-returned content uniformly.

## Migration Guide

### Integrators using `api.getContent()`

No changes needed. The `ContentFetcher` wraps your callback automatically. Modules no longer call `api.getContent` directly — all content goes through the Fetcher chain.

### Integrators using raw `Publication` methods

Pass a Fetcher instance to `fromUrl()`, `fetchPositionsFromService()`, and `fetchWeightsFromService()`. `HttpFetcher` is the drop-in replacement for raw `fetch()`.

### Module authors

Replace any `fetch()` calls with `this.host.fetcher.getByHref(href)`. The returned `Resource` has `.text` and `.bytes` — no need to call `.text()` or `.json()` on a Response. Errors are typed as `ReadError` with `.type`, `.href`, and `.statusCode`.

### Custom transforms

To add a content transform (e.g., accessibility adaptation):

```typescript
import { TransformingFetcher, ResourceTransform } from "@d-i-t-a/reader";

const myTransform: ResourceTransform = (resource) => {
  // modify resource.text or resource.bytes
  return { ...resource, text: modified };
};

// Insert in the Fetcher chain
const fetcher = new TransformingFetcher(innerFetcher, myTransform);
```
