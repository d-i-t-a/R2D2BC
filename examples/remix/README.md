# Remix (React Router v7) Integration Example for @d-i-t-a/reader

This example shows how to integrate the R2D2BC EPUB reader into a Remix application using React Router v7 conventions.

## Key Gotchas

### 1. The reader MUST only load on the client

`@d-i-t-a/reader` accesses `window` and `document` at import time. Remix renders routes on the server by default, where these globals do not exist. You **must** prevent the reader from being imported during SSR.

The recommended approach is `React.lazy()` with `<Suspense>`:

```tsx
// app/routes/reader.tsx
import { lazy, Suspense } from "react";

const EpubReader = lazy(() => import("./EpubReader"));

export default function ReaderRoute() {
  return (
    <Suspense fallback={<div>Loading reader...</div>}>
      <EpubReader manifestUrl="https://example.com/manifest.json" />
    </Suspense>
  );
}
```

`React.lazy()` defers the `import()` call until the component first renders in the browser. Since Remix streams SSR HTML with `<Suspense>` boundaries, the server sends the fallback markup and the client picks up the lazy load after hydration.

An alternative is the `ClientOnly` component from `remix-utils`:

```tsx
import { ClientOnly } from "remix-utils/client-only";

export default function ReaderRoute() {
  return (
    <ClientOnly fallback={<div>Loading reader...</div>}>
      {() => <EpubReader manifestUrl="https://example.com/manifest.json" />}
    </ClientOnly>
  );
}
```

A bare `import EpubReader from "./EpubReader"` at the top level will crash during server rendering.

### 2. Use a loader to pass the manifest URL from the server

Remix loaders run on the server and feed data to the route component. This is the right place to resolve which book to display (from a database, CMS, or URL parameter):

```tsx
import type { Route } from "./+types/route";

export function loader({ params }: Route.LoaderArgs) {
  // Look up the book manifest from a route parameter
  return { manifestUrl: `https://example.com/books/${params.bookId}/manifest.json` };
}

export default function ReaderRoute({ loaderData }: Route.ComponentProps) {
  const { manifestUrl } = loaderData;
  // ...
}
```

### 3. ReadiumCSS files must be served statically

The reader injects CSS into content iframes via URL references. Install ReadiumCSS from npm and copy the upstream files plus the local DITA patch overlay into your Remix `public/` directory:

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

Call `reader.stop()` when the component unmounts. Without this, navigating away and back creates a second reader instance that conflicts with the first:

```tsx
useEffect(() => {
  let mounted = true;

  async function init() {
    const { default: D2Reader } = await import("@d-i-t-a/reader");
    const reader = await D2Reader.load({ /* config */ });
    if (!mounted) { reader.stop(); return; }
    readerRef.current = reader;
  }
  init();

  return () => {
    mounted = false;
    readerRef.current?.stop();
    readerRef.current = null;
  };
}, []);
```

### 6. File-based routing

With Remix / React Router v7 file-based routing, place the files in your routes directory. Depending on your route convention:

**Flat routes (default):**
```
app/
  routes/
    reader.tsx          # Route at /reader — imports EpubReader
  components/
    EpubReader.tsx      # Client-only reader component
```

**Folder routes:**
```
app/
  routes/
    reader/
      route.tsx         # Route at /reader
      EpubReader.tsx    # Co-located reader component
```

## Setup

1. Install the reader in your Remix project:

```bash
npm install @d-i-t-a/reader
```

2. Install ReadiumCSS and copy the files into `public/readium-css-v2/`:

```bash
npm install @readium/css
cp -r node_modules/@readium/css/css/dist public/readium-css-v2
# Add the DITA patch overlay (local to the R2D2BC repo, not in the npm package):
cp node_modules/@d-i-t-a/reader/viewer/readium-css-v2/ReadiumCSS-dita-patch.css public/readium-css-v2/
```

3. Copy the example files into your app (folder route style):

```
app/
  routes/
    reader/
      route.tsx           # <-- from examples/remix/route.tsx
      EpubReader.tsx      # <-- from examples/remix/EpubReader.tsx
```

4. Run your Remix dev server:

```bash
npm run dev
```

5. Navigate to `/reader` to see the EPUB reader.

## Files

| File | Purpose |
|------|---------|
| `route.tsx` | Remix route with server loader and `React.lazy()` client-only wrapper |
| `EpubReader.tsx` | Client-only component with toolbar, TOC, settings, and page info |

## What the Example Includes

- **Server loader**: Demonstrates passing the manifest URL from the server via `useLoaderData`
- **Client-only loading**: Uses `React.lazy()` + `<Suspense>` to prevent SSR hydration issues
- **Navigation**: Previous/next page buttons
- **Scroll/Paginate toggle**: Switch between scrolling and paginated modes
- **Bookmarks**: Save bookmark at current position
- **Table of Contents**: Slide-out sidebar with nested chapter navigation
- **Settings panel**: Font size adjustment, appearance modes (day/sepia/night), reset
- **Page info footer**: Chapter title, page X of Y, book progress percentage
- **Event listeners**: Updates page info on `resource.ready`, `resource.start`, `resource.end`, `resource.fits`, and `updateCurrentLocation`
- **Proper cleanup**: Calls `reader.stop()` on component unmount
