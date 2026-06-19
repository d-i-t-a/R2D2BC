# Next.js Integration Example for @d-i-t-a/reader

This example shows how to integrate the DITA Toolkit EPUB reader into a Next.js application.

## Key Gotchas

### 1. The reader MUST be dynamically imported (no SSR)

`@d-i-t-a/reader` accesses `window` and `document` at import time. Next.js renders pages on the server by default, where these globals do not exist. You **must** use `next/dynamic` with `ssr: false`:

```tsx
// app/reader/page.tsx
import dynamic from "next/dynamic";

const EpubReader = dynamic(() => import("./EpubReader"), {
  ssr: false,
  loading: () => <div>Loading reader...</div>,
});

export default function ReaderPage() {
  return <EpubReader />;
}
```

A regular `import EpubReader from "./EpubReader"` will crash during server-side rendering.

### 2. The reader component must be a Client Component

The component that calls `D2Reader.load()` needs React hooks and browser APIs, so it must be marked with `"use client"` at the top of the file.

### 3. ReadiumCSS files must be served statically

The reader injects CSS into content iframes via URL references. Install ReadiumCSS from npm and copy the upstream files plus the local DITA patch overlay into your Next.js `public/` directory:

```bash
npm install @readium/css

# Copy upstream CSS from the npm package
cp -r node_modules/@readium/css/css/dist public/readium-css-v2

# Copy the DITA patch overlay from this repo (not in the npm package)
cp viewer/readium-css-v2/ReadiumCSS-dita-patch.css public/readium-css-v2/
```

Reference them as absolute paths in the injectables config:

```ts
injectables: [
  { type: "style", url: "/readium-css-v2/ReadiumCSS-before.css", r2before: true },
  { type: "style", url: "/readium-css-v2/ReadiumCSS-default.css", r2default: true },
  { type: "style", url: "/readium-css-v2/ReadiumCSS-after.css", r2after: true },
  { type: "style", url: "/readium-css-v2/ReadiumCSS-dita-patch.css" },
],
```

### 4. Required DOM structure

The reader looks for specific element IDs on initialization. Your component must render this exact structure before `D2Reader.load()` is called:

```html
<div id="D2Reader-Container">
  <main id="iframe-wrapper" tabindex="-1">
    <div id="reader-loading"></div>
    <div id="reader-error"></div>
  </main>
</div>
```

### 5. Cleanup on unmount

Call `reader.stop()` when the component unmounts. Without this, revisiting the page creates a second reader instance that conflicts with the first:

```tsx
useEffect(() => {
  let reader: D2Reader | null = null;

  async function init() {
    const { default: D2Reader } = await import("@d-i-t-a/reader");
    reader = await D2Reader.load({ /* config */ });
  }
  init();

  return () => {
    reader?.stop();
  };
}, []);
```

## Setup

1. Install the reader in your Next.js project:

```bash
npm install @d-i-t-a/reader
```

2. Install ReadiumCSS and copy the files into `public/readium-css-v2/`:

```bash
npm install @readium/css
cp -r node_modules/@readium/css/css/dist public/readium-css-v2
# Add the DITA patch overlay (local to the DITA Toolkit repo, not in the npm package):
cp node_modules/@d-i-t-a/reader/viewer/readium-css-v2/ReadiumCSS-dita-patch.css public/readium-css-v2/
```

3. Copy the example files into your app:

```
app/
  reader/
    page.tsx          # <-- from examples/nextjs/page.tsx
    EpubReader.tsx    # <-- from examples/nextjs/EpubReader.tsx
```

4. Run your Next.js dev server:

```bash
npm run dev
```

5. Navigate to `/reader` to see the EPUB reader.

## Files

| File | Purpose |
|------|---------|
| `page.tsx` | Page route that dynamically imports the reader with `ssr: false` |
| `EpubReader.tsx` | Client component with toolbar, TOC, settings, and page info |

## What the Example Includes

- **Navigation**: Previous/next page buttons
- **Scroll/Paginate toggle**: Switch between scrolling and paginated modes
- **Bookmarks**: Save bookmark at current position
- **Table of Contents**: Slide-out sidebar with nested chapter navigation
- **Settings panel**: Font size adjustment, appearance modes (day/sepia/night), reset
- **Page info footer**: Chapter title, page X of Y, book progress percentage
- **Event listeners**: Updates page info on `resource.ready`, `resource.start`, `resource.end`, `resource.fits`, and `updateCurrentLocation`
- **Proper cleanup**: Calls `reader.stop()` on component unmount
