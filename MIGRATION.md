# MIGRATION GUIDE

## 3.0.0-alpha.23 → 3.0.0-beta.1

Late-cycle changes between the last alpha and the first beta. All breaking surface is concentrated in the integrator config + per-format api shapes. Each step is **required** unless noted.

### Steps

1. [Set `initialAnnotations` and `lastReadingPosition` explicitly on every load](#1-set-initialannotations-and-lastreadingposition-explicitly) — **required** (multi-user scenarios)
2. [PDF annotation api: snapshot → per-item](#2-pdf-annotation-api-snapshot--per-item) — **required** (only if you use PDF annotations)
3. [PDF sidebar reads](#3-pdf-sidebar-reads) — **required** (only if you render a PDF highlights list)
4. [PDF locator hrefs are now relative](#4-pdf-locator-hrefs-are-now-relative) — **likely**
5. [Audiobook bookmark / comment hrefs are now relative](#5-audiobook-bookmark--comment-hrefs-are-now-relative) — **likely**
6. [PDF view settings + audiobook playback settings](#6-pdf-view-settings--audiobook-playback-settings) — **optional**
7. [TTS and Media Overlay null-clear](#7-tts-and-media-overlay-null-clear) — **optional**
8. [PDF currentLocator() shape change](#8-pdf-currentlocator-shape-change) — **likely** (only if you consume `api.updateCurrentLocation` for PDF)

---

### 1. Set `initialAnnotations` and `lastReadingPosition` explicitly

**Why:** every persistent field now follows a tri-state contract:

| value | meaning |
|---|---|
| `{...}` | Apply this set on top of local store |
| `null` | **Clear** local store, fall back to defaults |
| `undefined` | Leave local store untouched (previous default) |

If you don't set these fields explicitly, a prior user's LocalStorage data leaks into the next user's session on a shared browser.

```js
D2Reader.load({
  url: ...,
  userSettings:        serverState.userSettings        ?? null,
  lastReadingPosition: serverState.lastReadingPosition ?? null,
  initialAnnotations: {
    bookmarks:  serverState.bookmarks  ?? [],
    highlights: serverState.highlights ?? [],
  },
  tts:           serverState.tts           ?? null,
  mediaOverlays: serverState.mediaOverlays ?? null,
  api: { ... },
});
```

For multi-user shared-browser setups (e.g. a public reading kiosk), pass `null` whenever the user has no saved state on your server.

### 2. PDF annotation api: snapshot → per-item

The snapshot-style `pdf.annotations.api.saveAnnotations(state)` is **gone**. Replaced with per-item callbacks, same shape as EPUB highlights:

```js
pdf: {
  annotations: {
    api: {
      addAnnotation: async (annotation) => {
        const row = await post('/highlights', { locator: annotation });
        if (row?.id) annotation.id = row.id;
        return annotation;
      },
      updateAnnotation: async (annotation) => {
        if (annotation?.id) await patch('/highlights/' + annotation.id, { locator: annotation });
        return annotation;
      },
      deleteAnnotation: async (annotation) => {
        if (annotation?.id) await del('/highlights/' + annotation.id);
        return annotation;
      },
    },
  },
},
```

What gets stored is now an `Annotation` locator (same shape as EPUB highlights) with a `pdfHighlight` field carrying the pdfjs editor blob:

```json
{
  "id": "pdfjs_internal_editor_0",
  "href": "Texas.pdf",
  "type": "application/pdf",
  "locations": { "page": 7 },
  "text":      { "highlight": "selected text" },
  "highlight": { "id": "...", "color": "rgb(255, 213, 0)" },
  "created":   "2026-06-10T...",
  "pdfHighlight": { /* pdfjs editor blob for restore */ }
}
```

Pass them back through `initialAnnotations.highlights` on next load — same field EPUB already uses.

**Bonus fix:** color changes after creation now fire `updateAnnotation`. Previously pdfjs's in-place color mutation never reached your callback; the integrator's server kept the original color forever.

### 3. PDF sidebar reads

If you render a PDF highlights list, switch the fields you read from pdfjs blob shape to locator shape:

| Before | After |
|---|---|
| `a.color` (number array) | `a.highlight?.color` (CSS string) |
| `a.pageIndex` (0-based) | `a.locations?.page` (1-based) |
| `a.text` | `a.text?.highlight` |

### 4. PDF locator hrefs are now relative

`PDFNavigator.saveLastReadingPosition`, `PdfBookmarkModule.makeBookmark`, and `PDFNavigator.currentLocator()` all write **relative** hrefs now (e.g. `Texas.pdf`, not `https://yourhost/.../Texas.pdf`). Matches the EPUB pattern.

If your server stored absolute hrefs before, the PDF position restore has a one-shot back-compat match that resolves either shape — old data still loads. New writes are relative.

### 5. Audiobook bookmark / comment hrefs are now relative

Same as #4 — `AudiobookBookmarkModule` and `AudiobookCommentsModule` now write relative hrefs. Server-side queries that filter by absolute href won't match new writes — update to use the relative href.

### 6. PDF view settings + audiobook playback settings

New `api.updateSettings(snapshot)` callbacks fire on every user-driven change. Routes through the top-level `api.updateSettings`:

- **PDF:** scroll mode, spread, scale, rotation
- **Audiobook:** volume, rate, autoplay, intervals, timeline mode

The format-shaped initial settings ride through the top-level `userSettings` field (one field, library dispatches by publication format):

```js
D2Reader.load({
  url: ...,
  userSettings: serverState.userSettings ?? null,  // shape matches the loaded format
  api: {
    updateSettings: async (state) => { await put('/user-settings', { state }); },
    ...
  },
});
```

### 7. TTS and Media Overlay null-clear

Both config blocks now accept `null` to wipe their LocalStorage caches:

```js
tts:           serverState.tts           ?? null,
mediaOverlays: serverState.mediaOverlays ?? null,
```

Same multi-user reasoning as #1. Object shape unchanged when you do supply a config.

### 8. PDF currentLocator() shape change

`PDFNavigator.currentLocator()` now returns a fully Readium-shaped Locator. Two changes:

- `href` is now relative (no more `https://yourhost/...`)
- `locations` adds `position` (1-based; matches `page` for single-PDF publications) and `totalProgression` (0–1 across the publication)

```json
{
  "href": "Texas.pdf",
  "title": "Page 7",
  "locations": {
    "page": 7,
    "position": 7,
    "progression": 0.05,
    "totalProgression": 0.05
  },
  "type": "application/pdf"
}
```

Affects: `api.updateCurrentLocation(locator)` payload, server-side storage of PDF positions, any code that reads `d2reader.currentLocator()` for a PDF.

### Heads-up — PDF text selection gotchas

If a PDF highlight visually renders on the wrong line after selection, the cause is integrator-side CSS, not the library. Common culprits:

- `* { box-sizing: border-box }` (Tailwind preflight). pdfjs requires `content-box` on `.page` and its descendants — restore it for the PDF container.
- `* { border-width: 0 }` (Tailwind preflight). pdfjs's `.page` has a 9px transparent border the textLayer math depends on.
- `.pdfViewer .page { height: ...!important }` overrides — forcing a height that doesn't match pdfjs's viewport calculation breaks the textLayer offset.

The library doesn't touch the selection → highlight coordinate transform; that's all pdfjs.

---

## 2.5.x -> 3.x

v3 is a major architectural release. The `D2Reader` load / navigate / event API is stable across the transition; the breaking surface lives in class names, constructor signatures, `Publication` / `Link` property casing, custom-module interfaces, and a small set of CSS class renames.

Each step is tagged with one of:
- **required** — every integrator must do this on upgrade.
- **likely** — most integrators will see this; verify.
- **conditional** — only if you do X (noted on the step).
- **optional** — additive features; adopt when you want them.

### Steps

1. [Imports](#1-imports) — **required**
2. [Publication / Link property casing](#2-publication--link-property-casing) — **conditional** (only if reading these directly)
3. [CSS class renames](#3-css-class-renames) — **likely** (any custom CSS / DOM queries)
4. [`IFrameAttributes` config](#4-iframeattributes-config) — **required** (iframe height formula changed)
5. [Bookmark API](#5-bookmark-api) — **conditional** (only if you have a custom bookmark UI)
6. [`PDFNavigator` constructor](#6-pdfnavigator-constructor-only-if-you-construct-it-directly) — **conditional**
7. [Custom modules](#7-custom-modules) — **conditional** (only if you write custom modules)
8. [ReadiumCSS](#8-readiumcss-optional) — **optional** (v1 still works; v2 unlocks new settings)
   - 8a. [Script-aware ReadiumCSS injection (RTL / CJK)](#8a-script-aware-readiumcss-injection-rtl--cjk-only) — **conditional** (RTL / CJK content only)
   - 8b. [PDF module construction](#8b-pdf-module-construction-custom-integrations-only) — **conditional**
   - 8c. [`Publication` direct callers](#8c-publication-direct-callers-rare) — **conditional** (rare)
   - 8d. [`Renderer` / scroll surface subclasses](#8d-renderer--scroll-surface-subclass-authors-only) — **conditional** (subclass authors only)
   - 8e. [`EpubNavigator` lifecycle](#8e-epubnavigator-lifecycle) — **likely**
   - 8f. [Custom-module host shape](#8f-custom-module-host-shape-custom-modules-only) — **conditional**
9. [Audiobook support](#9-audiobook-support-optional) — **optional** (only if shipping audiobook content)
10. [Event payloads](#10-event-payloads-optional-no-breaking-change) — **optional** (no breaking change; typed constants opt-in)

### 1. Imports
**Severity: required**

The main navigator class is renamed.

```ts
// before
import { IFrameNavigator } from "@d-i-t-a/reader";

// after
import { EpubNavigator } from "@d-i-t-a/reader";
```

Deprecated aliases (`IFrameNavigator`, `IFrameNavigatorConfig`) remain exported for one release.

### 2. Publication / Link property casing
**Severity: conditional** — only if your code reads `Publication` or `Link` properties directly.

If you read `Publication` or `Link` properties directly, switch to camelCase. Most integrators use the D2Reader API exclusively and won't see this.

| Before | After |
|---|---|
| `publication.Metadata` | `publication.metadata` |
| `publication.Spine` | `publication.readingOrder` |
| `publication.TOC` | `publication.tableOfContents` |
| `link.Href` | `link.href` |
| `link.TypeLink` | `link.type` |
| `link.Title` | `link.title` |
| `link.Children` (Array) | `link.children?.items` |
| `link.Rel` (Array) | `link.rels` (Set) or `link.relArray` |

### 3. CSS class renames
**Severity: likely** — affects any custom CSS targeting the reader shell or any JS that queries the DOM by these selectors.

14 reader-shell selectors are now prefixed with `dita-` to avoid framework collisions (Bootstrap, Vuetify, MUI). Update custom CSS and JS DOM queries:

| Old | New |
|---|---|
| `#viewer` | `#dita-viewer` |
| `.info` | `.dita-info` |
| `.error` | `.dita-error` |
| `.loading` | `.dita-loading` |
| `.active` / `.inactive` | `.dita-active` / `.dita-inactive` |
| `.pagination` | `.dita-pagination` |
| `.thumb` | `.dita-thumb` |
| `.timeline` | `.dita-timeline` |
| `.collection` | `.dita-collection` |
| `.collapsible-header` | `.dita-collapsible-header` |
| `.color-option` | `.dita-color-option` |
| `.logo-container` | `.dita-logo-container` |
| `.search-wrapper` | `.dita-search-wrapper` |

### 4. IFrameAttributes config
**Severity: required** — three deprecated fields removed (compile error if passed); iframe height formula changed (visually verify after upgrade).

Remove the three deprecated fields and (optionally) adopt the new chrome-aware sizing fields:

```ts
// before
attributes: {
  navHeight: 50,
  bottomInfoHeight: 30,
  sideNavPosition: "left",
  margin: 16,
}

// after
attributes: {
  // navHeight / bottomInfoHeight / sideNavPosition removed — compile error if passed
  margin: 16,                  // now optional
  iframe: {                    // new, optional
    padding: { top: 16, bottom: 16 },
  },
  safeArea: {                  // new, optional — chrome-aware insets
    top:    () => document.getElementById("toolbar"),
    bottom: () => document.getElementById("statusbar"),
    left:   () => document.getElementById("left-sidebar"),
    right:  () => document.getElementById("right-sidebar"),
  },
}
```

The iframe height formula changed; visually verify your reader after upgrading.

### 5. Bookmark API
**Severity: conditional** — only if your integration has a custom bookmark UI calling these methods.

```ts
// before
const current        = await reader.currentBookmark;
const isBookmarked   = reader.isCurrentBookmarked;

// after
const current        = reader.findBookmarkAt();   // or pass an explicit locator
const isBookmarked   = reader.hasBookmarkAt();
```

Both methods take an optional `locator?` argument; defaults to the current position. Works for both EPUB and PDF.

### 6. PDFNavigator constructor (only if you construct it directly)
**Severity: conditional** — most integrators using `D2Reader.load({ rights, services, ... })` are unaffected.

```ts
// before
const nav = new PDFNavigator(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8);

// after
const nav = new PDFNavigator({ /* config object */ });
```

Integrators using `D2Reader.load({ rights, services, ... })` are unaffected — PDFNavigator construction is internal.

### 7. Custom modules
**Severity: conditional** — only if you write custom `ReaderModule` implementations.

If you write a custom `ReaderModule`:

```ts
// before
class MyModule implements ReaderModule {
  navigator: IFrameNavigator;
  // ...
}

// after
class MyModule implements ReaderModule {
  readonly name = "my-module";
  readonly hostType = NavigatorType.EPUB;        // EPUB | PDF | AUDIOBOOK
  readonly rightsKey?: keyof ReaderRights;       // optional — gate by integrator rights
  readonly dependencies?: string[];              // optional — module name dependencies

  private host!: EpubModuleHost;

  attach(host: EpubModuleHost): void {
    this.host = host;
  }

  // use this.host instead of this.navigator
}
```

The 13 built-in EPUB modules and 5 built-in PDF modules already follow this shape — refer to any of them for a working template.

### 8. ReadiumCSS (optional)
**Severity: optional** — v1.1.x continues to work unchanged. Adopt v2 only when you want the new settings / scripts / themes.

v1.1.x continues to work — no migration required if your integration is happy with v1. If you adopt v2:

1. Install: `npm install @readium/css`.
2. Update injectables URLs to point at `node_modules/@readium/css/css/dist/...` (or copy the files to your assets directory, or serve via CDN).
3. After the three base files (`-before` / `-default` / `-after`), add the dita-patch overlay: `viewer/readium-css-v2/ReadiumCSS-dita-patch.css` (copied from the `@d-i-t-a/reader` package — patches image no-stretch and line-height compensation).
4. For CJK / RTL publications, use `Injectable.when` predicates to switch between cascade variants by script mode (`isRtl`, `isCjkHorizontal`, `isCjkVertical`). `viewer/index_dita_v2.html` shows the full wiring.

**Behavior changes to test after upgrading to v2:**

Books may render visibly differently — verify against a representative sample before shipping:

- **User typography prefs now beat publisher CSS**: `--USER__hyphens`, `--USER__lineHeight`, `--USER__wordSpacing` are now `!important` in v2. Books that relied on publisher line-height / hyphens / word-spacing will respect the user's reader-pref instead.
- **Fonts no longer bundled** — host via your own `@font-face` declarations. If you relied on bundled v1 fonts, ship them yourself.
- **Publisher heading colors get overridden by themes** in v2 (more aggressive than v1).
- **Publisher fonts fully overridden when `fontFamily` is set** in v2.
- **`typeScale` removed in v2 cascade** — the write still happens for v1 compat, but v2 ignores it.
- **Auto column count** — library computes 1–4 columns from viewport width (`<600` / `600-1199` / `1200-1799` / `≥1800`). v2's own responsive-column queries removed. Visibly different if you depended on v2 native breakpoints.
- **iPadOS patch wired automatically** — `EpubNavigator` writes `readium-iPadOSPatch-on` class on iPad. Remove any manual iPadOS-detection CSS in your viewer to avoid conflict.

### 8a. Script-aware ReadiumCSS injection (RTL / CJK only)
**Severity: conditional — required for RTL / CJK content.**

If you publish RTL or CJK content, you **must** wire `Injectable.when` predicates so the right variant of ReadiumCSS loads per script mode. `viewer/index_dita_v2.html` is the worked example. Sketch:

```ts
const injectables = [
  // LTR — non-CJK only
  { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-before.css",  r2before:  true,
    when: (ctx) => ctx.scriptMode === "ltr" },
  { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-default.css", r2default: true,
    when: (ctx) => ctx.scriptMode === "ltr" },
  { type: "style", url: "/node_modules/@readium/css/css/dist/ReadiumCSS-after.css",   r2after:   true,
    when: (ctx) => ctx.scriptMode === "ltr" },

  // RTL
  { type: "style", url: "/node_modules/@readium/css/css/dist/rtl/ReadiumCSS-before.css",  r2before:  true,
    when: (ctx) => ctx.scriptMode === "rtl" },
  // ...cjk-horizontal, cjk-vertical similar

  // Patch always last
  { type: "style", url: "/viewer/readium-css-v2/ReadiumCSS-dita-patch.css" },
];
```

`InjectableContext.scriptMode` is derived once from the publication's `metadata.languages` + `readingProgression` and passed to every `when` predicate. The five values are `"ltr"`, `"rtl"`, `"cjk-horizontal"`, `"cjk-vertical"`, `"mongolian-vertical"`.

### 8b. PDF module construction (custom integrations only)
**Severity: conditional** — only if you construct PDF modules directly (rare).

If you construct PDF modules directly (rare — most integrators register modules via `D2Reader.load({ rights, services, ... })`), they now take static dependencies via constructor injection:

```ts
// before
const bookmarks = new PdfBookmarkModule();
host.viewStore = viewStore;
host.annotator = annotator;

// after
const bookmarks = new PdfBookmarkModule({ annotator, viewStore, publication });
// host.viewStore / host.annotator no longer exist
```

`host.viewStore` and `host.annotator` removed from `PDFModuleHost`. All 5 PDF modules (`PdfBookmarkModule`, `PdfSearchModule`, `PdfAnnotationModule`, `PdfHistoryModule`, `PdfViewSettingsModule`) follow the same shape.

### 8c. Publication direct callers (rare)
**Severity: conditional** — only if you call `Publication` methods directly instead of via `D2Reader.load()`.

If you call `Publication` methods directly instead of going through `D2Reader.load()`:

- `Publication.fromUrl(url, requestConfig, fetcher)` — `Fetcher` is required as the third argument. Pass an `HttpFetcher` instance, or any composed chain (e.g. `new CacheFetcher(new TransformingFetcher(new HttpFetcher()))`).
- `Publication.autoGeneratePositions(requestConfig, getContentBytesLength)` — provide a callback that returns the byte length for a given href.
- `Publication.fetchPositionsFromService(fetcher)` and `Publication.fetchWeightsFromService(fetcher)` — both take a `Fetcher`.

### 8d. Renderer / scroll surface (subclass authors only)
**Severity: conditional** — only if you wrote a custom `BookView` subclass.

If you wrote a custom `BookView` subclass:

- `BookView` renamed to `Renderer` (abstract base); `ReflowableBookView` split into `ReflowableRenderer` (abstract) + `ColumnRenderer` + `ScrollRenderer` + `VerticalRenderer`; `FixedBookView` → `FixedRenderer`.
- `getColumnWidth()` → `getPageWidth()` (renamed; returns `clientWidth`, not column width).
- `setIframeHeight()` → `growIframeToContent()` (renamed; describes what the method actually does — grow along the active scroll axis to fit content).
- `BookView` no longer holds a navigator reference. New `BookViewHost` interface; renderer reads what it needs through that.
- New required method: `getScrollSurface(): { kind: "host"; element } | { kind: "iframe"; iframe }`.

### 8e. EpubNavigator lifecycle
**Severity: likely** — `EpubNavigator.stop()` now removes iframes from the DOM. Adjust if you relied on iframes persisting after `stop()`.

`EpubNavigator.stop()` now removes iframes from the DOM. If your integration relied on iframes persisting after `stop()` (e.g. to read final scroll state), capture that state before calling `stop()` or hook the `unload` event instead.

### 8f. Custom-module host shape (custom modules only)
**Severity: conditional** — only if you implement custom `ModuleHost` instances.

`ModuleHost` got a `fetcher` field. If you have custom modules implementing their own `ModuleHost` (uncommon — typically you consume the navigator's), provide a `Fetcher` instance.

Host hierarchy:
- `ModuleHost` — cross-navigator minimum (`fetcher`, lifecycle).
- `VisualModuleHost extends ModuleHost` — adds `DOM`, `settings`.
- `EpubModuleHost extends VisualModuleHost` — EPUB-specific helpers.
- `PDFModuleHost extends VisualModuleHost` — PDF-specific helpers (no `viewStore` / `annotator` — see 8b).
- `AudiobookModuleHost extends ModuleHost` — `prefetchResource` for chapter prefetch.

Your custom module's `hostType` field must match the host shape you'll receive on `attach(host)`.

### 9. Audiobook support (optional)
**Severity: optional** — only if your integration handles audiobook content.

Audiobook publications need explicit wiring in `D2Reader.load()`:

```ts
D2Reader.load({
  url,
  audiobook: {
    chapterListContainer: document.getElementById("chapter-list"),
    preservePitchWorkletUrl: "/PreservePitchProcessor.js",  // optional, for browsers lacking native preservesPitch
    userSettings: { /* persisted prefs */ },
    timeline:  { /* scrubber options */ },
    bookmarks: { /* bookmark UI options */ },
    comments:  { /* comments UI options */ },
  },
});
```

EPUB and PDF integrators not handling audiobook content can ignore this field. `viewer/index_audiobook_minimal.html` shows the minimum viable wiring.

### 10. Event payloads (optional, no breaking change)
**Severity: optional** — old string-keyed listeners still work; the new typed `ReaderEvent` constants are opt-in.

`ReaderEvent` constants and typed payloads are new in v3 but the old string-keyed listener pattern still works — adopt incrementally:

```ts
// before — still works
reader.addEventListener("resource.ready", payload => { ... });

// after — typed
import { ReaderEvent } from "@d-i-t-a/reader";
reader.addEventListener(ReaderEvent.RESOURCE_READY, payload => { ... });
```

Old listeners receive enriched payloads automatically — every event now carries useful data (locator, href, text, etc.) where v2.5 sometimes carried only the event name.

## 1.x -> 2.0.x


Store instance for use of any reader api:
```let d2reader = undefined;
D2Reader.load({
    url: new URL('{!! $url !!}'),
}).then(instance => {
    d2reader = instance;
});
```



Accessors (if you use any of these as functions before, now these are all accessors)
- annotations
- atEnd
- atStart
- bookmarks
- currentLocator
- currentResource
- currentSettings
- mostRecentNavigatedTocItem (still find that a better name would be good, but didn’t come up with one 🙂 )
- positions
- publicationLanguage ( we might want to expose more metadata than just language )
- readingOrder
- tableOfContents
- totalResources


Replace any Static call with an Instance call:

change this:

    onclick="D2Reader.applyUserSettings({verticalScroll:false});">

to this:

    onclick="d2reader.applyUserSettings({verticalScroll:false});">

change this:

    D2Reader.currentSettings().then( result => {
        .....
    })

to this:

    let result = d2reader.currentSettings;

PLESE NOTE: the above two are just two examples, you should make sure that any of the accessors that were functions before, to migrate.



HTML & CSS adjustments:

no need for this anymore, remove it:

    <script> var exports = {}; </script>

remove the style from the following div:

    <div id="D2Reader-Container" style="width: 100%; height: 100%; position: relative;">

change:

    <main style="overflow: hidden" tabindex=-1 id="iframe-wrapper">

to:

    <main style="height: 100vh" tabindex=-1 id="iframe-wrapper">

or whatever the height is that you need, for example height minus navigation bars etc.
the reader works now even in a widget style so whatever the height or width set it for the container and/or the main element.

move the toolbox div into the main div and wrap it with the following div:
PLEASE NOTE: Make sure this div is further to the top in the main div.

```
<div style="height: 0px">
    <div id="highlight-toolbox" class="highlight-toolbox" >
        .....
    </div>
</div>
```


A Minimal Implementation example:
```
<!DOCTYPE html>
<html lang="en">

    <head>
        <title>D2 Reader</title>
        <meta charset="utf-8" />
        <meta name="author" content="Aferdita Muriqi" />
        <meta name="description" content="A viewer application for EPUB files." />
        <meta name="viewport"
              content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    
        <!-- R2 Reader CSS -->
        <link rel="stylesheet" href="reader.css" />
        <script src="reader.js"></script>
    </head>

    <body>
    
        <div class="content" id="root">
            <div id="D2Reader-Container">
                <main style="height: 100vh" tabindex=-1 id="iframe-wrapper">
                    <div id="reader-loading" class="loading"></div>
                    <div id="reader-error" class="error"></div>
                    <div style="height: 0px">
                        <div id="highlight-toolbox" class="highlight-toolbox" >
                            .....
                        </div>
                    </div>
                </main>
            </div>
        </div>
    
        <script>
    
            let injectables = [
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-before.css', r2before: true },
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-default.css', r2default: true },
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-after.css', r2after: true },
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-dita-patch.css' },
            ]
    
            let d2reader = undefined;
            D2Reader.load({
                url: new URL("...."),
                injectables: injectables,
                injectablesFixed: [],
            }).then(instance => {
                d2reader = instance
            });
    
        </script>
    
    </body>

</html>

```
