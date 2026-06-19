# Vue 3 Integration Example

A minimal Vue 3 Single File Component that integrates the `@d-i-t-a/reader` EPUB reader.

## Prerequisites

- An existing Vue 3 project (Vite, Nuxt, Vue CLI, etc.)
- Node.js 18+

## Installation

Install the reader package in your Vue project:

```bash
npm install @d-i-t-a/reader
```

## Setup

### 1. Copy the component

Copy `ReaderComponent.vue` into your project's components directory:

```
src/
  components/
    ReaderComponent.vue
```

### 2. Install ReadiumCSS

```bash
npm install @readium/css
```

The reader's upstream CSS comes from the `@readium/css` npm package. The example imports the files directly via Parcel `url:` imports in `main.js`:

```js
import readiumBefore from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-before.css";
// …etc
```

If you're integrating into a Vue project that doesn't use Parcel, copy the files from `node_modules/@readium/css/css/dist/` into your project's `public/` directory (or configure your bundler to serve them at a URL) and update the `injectables` array in the component.

The DITA patch overlay (`viewer/readium-css-v2/ReadiumCSS-dita-patch.css`) is local to the DITA Toolkit repo — it's separate from the npm package and contains fixes layered on top of upstream. Copy it into your project alongside the upstream files if you want the same fixes.

### 3. Use the component

In a page or parent component:

```vue
<script setup lang="ts">
import ReaderComponent from "@/components/ReaderComponent.vue";
</script>

<template>
  <ReaderComponent />
</template>
```

The component takes the full viewport. Mount it in a route or full-page layout.

### 4. Configure the manifest URL

Edit the `MANIFEST_URL` constant at the top of `ReaderComponent.vue` to point to your EPUB's `manifest.json`:

```ts
const MANIFEST_URL = "https://your-server.com/publication/manifest.json";
```

## Required DOM structure

The reader expects this exact DOM hierarchy inside the component:

```html
<div id="D2Reader-Container">
  <main id="iframe-wrapper">
    <div id="reader-loading" />
    <div id="reader-error" />
  </main>
</div>
```

This is already set up in the component template. Do not restructure these elements.

## Customization

### Rights and features

Toggle reader features in the `rights` object:

```ts
const rights = {
  enableBookmarks: true,
  enableAnnotations: true,
  enableSearch: true,
  enableContentProtection: false,
  enableTTS: false,
  enableTimeline: false,
  enableDefinitions: false,
  enableMediaOverlays: false,
  enablePageBreaks: false,
  enableLineFocus: false,
  autoGeneratePositions: true,
};
```

### Injectables

If you need custom CSS injected into EPUB content iframes, add entries to the `injectables` array:

```ts
const injectables = [
  { type: "style", url: "/path/to/@readium/css/css/dist/ReadiumCSS-before.css", r2before: true },
  { type: "style", url: "/path/to/@readium/css/css/dist/ReadiumCSS-default.css", r2default: true },
  { type: "style", url: "/path/to/@readium/css/css/dist/ReadiumCSS-after.css", r2after: true },
  { type: "style", url: "/path/to/ReadiumCSS-dita-patch.css" },
  { type: "style", url: "/my-custom-styles.css" },
];
```

The paths depend on how your bundler / server exposes the npm package; the Parcel `url:` import pattern in `main.js` handles this in the example.

### Persistence

By default the reader uses `localStorage` for bookmarks and reading position. To use a custom store, pass `store` and `annotator` options to `D2Reader.load()`:

```ts
const r = await D2Reader.load({
  url: new URL(MANIFEST_URL),
  injectables,
  rights,
  store: myCustomStore,       // implements Store interface
  annotator: myCustomAnnotator, // implements Annotator interface
});
```

## Component API

The component is self-contained. The `reader` ref holds the `D2Reader` instance after mount and exposes the full reader API. To access it from a parent component, you can expose it via `defineExpose`:

```ts
// Inside ReaderComponent.vue
defineExpose({ reader });
```

```vue
<!-- Parent -->
<script setup>
import { ref } from "vue";
const readerRef = ref();

function jumpToChapter(href) {
  readerRef.value?.reader?.goTo({ href, locations: {} });
}
</script>

<template>
  <ReaderComponent ref="readerRef" />
</template>
```

## Features included

- Previous/next page navigation (buttons and arrow keys)
- Scroll/paginate layout toggle
- Page info display (chapter title, page X of Y, book percentage)
- Sidebar with four tabs: TOC, Settings, Bookmarks, Search
- Settings: font size, font family, theme (day/sepia/night), layout, line height, margins, word spacing, letter spacing, paragraph spacing, paragraph indent, text alignment, columns
- Bookmark create/delete/navigate
- Full-text search with result navigation
- Keyboard navigation (left/right arrow keys)
- Cleanup on unmount (`reader.stop()`)
