# Workstream 3.0 — Replace r2-shared-js with @readium/shared

## What Changed

- `r2-shared-js` and `ta-json-x` dependencies removed
- `@readium/shared@2.1.5` added
- New model layer at `src/model/v3/` (Publication, Link, Locator, MediaOverlayNode)
- All internal property access migrated from PascalCase to camelCase (90+ occurrences)
- Publication uses composition over @readium/shared Manifest instead of class inheritance
- JSON deserialization uses `Manifest.deserialize()` instead of ta-json-x decorators

## What Breaks

### For integrators consuming D2Reader API

**Nothing breaks.** The D2Reader public API (load, goTo, nextPage, bookmarks, annotations, settings, etc.) is unchanged.

### For integrators accessing Publication/Link objects directly

If you access properties on objects returned by `tableOfContents`, `readingOrder`, `bookmarks`, etc.:

| Before (v2.5) | After (v3) | Notes |
|---|---|---|
| `link.Href` | `link.href` | camelCase |
| `link.TypeLink` | `link.type` | Renamed |
| `link.Title` | `link.title` | camelCase |
| `link.HrefDecoded` | `link.hrefDecoded` | camelCase |
| `link.Children` | `link.children?.items` | Wrapped in Links object |
| `link.Rel` | `link.rels` (Set) or `link.relArray` (Array) | Type changed from Array to Set |
| `link.Properties?.MediaOverlay` | `link.mediaOverlay` | Direct getter |
| `link.MediaOverlays` | `link.mediaOverlayNode` | Renamed |
| `publication.Metadata.Language` | `publication.metadata?.languages` | Plural, camelCase |
| `publication.Metadata.Title` | `publication.metadata?.title` | camelCase, LocalizedString |
| `publication.Metadata.Rendition?.Layout` | `publication.isFixedLayout` | Use the getter |
| `publication.Metadata.ConformsTo` | `publication.metadata?.conformsTo` | camelCase |
| `publication.Metadata.Direction2` | `publication.metadata?.readingProgression` | Renamed |
| `publication.Metadata.Author` | `publication.metadata?.authors?.items` | Contributors object |
| `publication.Metadata.Publisher` | `publication.metadata?.publishers?.items` | Contributors object |
| `publication.Metadata.Modified` | `publication.metadata?.modified` | camelCase |
| `publication.Metadata.PublicationDate` | `publication.metadata?.published` | Renamed |
| `publication.Metadata.BelongsTo?.Series` | `publication.metadata?.belongsToSeries` | Flattened |
| `publication.Spine` | `publication.readingOrder` | Use camelCase getter |
| `publication.TOC` | `publication.tableOfContents` | Use camelCase getter |

### For integrators passing Publication JSON in config

If you pass `initialConfig.publication` as a pre-parsed object, it still works through the `TaJsonDeserialize` compatibility wrapper.

## How to Migrate

Most integrators only use `D2Reader.load()` and the public API methods — **no changes needed**.

If you access Link/Publication properties directly (e.g., in custom `api.getContent` implementations or event handlers), do a find-and-replace:

```
// Before
const href = link.Href;
const type = link.TypeLink;
const isFixed = publication.Metadata.Rendition?.Layout === "fixed";

// After
const href = link.href;
const type = link.type;
const isFixed = publication.isFixedLayout;
```

The old model files (`src/model/Link.ts`, `src/model/Locator.ts`, `src/model/Publication.ts`) re-export from `src/model/v3/` so existing import paths still work.
