# React 18 Integration Example

A complete React 18 reader app demonstrating the full `@d-i-t-a/reader` API.

## Running

```bash
npm run example:react
# Opens at http://localhost:1234
```

## Features

- Toolbar with navigation, scroll/paginate toggle, page info, bookmark button
- Sidebar with 4 tabs: TOC, Settings, Bookmarks, Search
- All user settings (font size, font family, appearance, layout, spacing, margins)
- Keyboard navigation (arrow keys)
- Appearance theme sync — toolbar and sidebar follow Day/Sepia/Night
- Page info from `currentLocator` (chapter title, page X of Y, book %)

## Key patterns

- `D2Reader.load()` in `useEffect` with cleanup via `reader.stop()`
- `api.updateSettings` callback to sync appearance theme immediately
- `api.updateCurrentLocation` for position persistence
- `reader.addEventListener("resource.ready", ...)` for page info updates
- `reader.tableOfContents` returns camelCase properties (`href`, `title`, not `Href`, `Title`)
- `reader.currentLocator.displayInfo.resourceScreenIndex` for chapter page number
- `reader.search(term, false)` returns results with `textBefore`, `textMatch`, `textAfter`, `href`, `uuid`

## File structure

```
examples/react/
  index.html       — Entry point with #root div
  index.tsx         — Full React app (single file)
  tsconfig.json     — Extends root tsconfig
  parcel.d.ts       — Parcel url: import types
```

ReadiumCSS v2 is imported via `url:../../viewer/readium-css-v2/*` — no per-example copy.
