# CHANGES — v3 Workstream 3.1: Event System

## What Changed

- New `src/utils/Events.ts` — typed `ReaderEvent` constants and `ReaderEventMap` payload types
- `ReaderEvent`, `ReaderEventName`, and `ReaderEventMap` exported from `index.ts`
- Every emit uses `ReaderEvent` constants — no raw strings anywhere in the codebase
- Every notification callback now has a matching event
- Both paths are intentional: callbacks for two-way (integrator returns data), events for one-way (notifications)
- Pattern: callback fires first, event emits after
- MediaOverlay API callbacks (`started`, `stopped`, `paused`, `resumed`, `finished`) were defined but never wired — now connected
- All events carry useful payload data (locator, href, text, etc.) as additional arguments

### New Events Added

| Event | Module | Payload |
|-------|--------|---------|
| `readalong.started` | MediaOverlay | "started", { href } |
| `readalong.stopped` | MediaOverlay | "stopped", { href } |
| `readalong.paused` | MediaOverlay | "paused", { href } |
| `readalong.resumed` | MediaOverlay | "resumed", { href } |
| `readalong.finished` | MediaOverlay | "finished", { href } |
| `bookmark.created` | Bookmark | Bookmark object |
| `bookmark.deleted` | Bookmark | Bookmark object |
| `annotation.created` | Annotation | Annotation object |
| `annotation.deleted` | Annotation | Annotation object |
| `annotation.updated` | Annotation | Annotation object |
| `annotation.selected` | TextHighlighter | Annotation object |
| `annotation.comment.added` | TextHighlighter | Annotation object |
| `text.selected` | TextHighlighter | { text, selection } |
| `citation.created` | Citation | message string |
| `citation.failed` | Citation | message string |
| `location.changed` | Both navigators | ReadingPosition object |
| `error` | IFrameNavigator | Error object |
| `consumption.action` | Consumption | { locator, action } |
| `consumption.idle` | Consumption | seconds (number) |

### Enriched Existing Event Payloads

| Event | Before | After (backwards compat) |
|-------|--------|--------------------------|
| `resource.ready` | no payload | { href } |
| `resource.start` | no payload | { href } |
| `resource.end` | no payload | { href } |
| `resource.fits` | no payload | { href } |
| `readaloud.started` | "started" | "started", { locator } |
| `readaloud.stopped` | "stopped" | "stopped", { locator } |
| `readaloud.paused` | "paused" | "paused", { locator } |
| `readaloud.resumed` | "resumed" | "resumed", { locator } |
| `readaloud.finished` | "finished" | "finished", { locator } |
| `toolbox.opened` | "opened" | "opened", { text } |

### Bugs Fixed During This Workstream

- **text.selected flooding** — was firing dozens of times per selection via `selectionchange` events. Moved to `selectionMenuOpened` where `isSelectionMenuOpen` guard ensures it fires once.
- **readaloud.stopped firing without TTS active** — `cancel()` was emitting stopped even when TTS was never started. Added `this.speaking` guard.
- **readalong.stopped firing without MO active** — `stopReadAloud()` was emitting stopped during initialization. Removed events from `stopReadAloud()`, only callers emit based on context.
- **readalong.stopped + readalong.finished both firing** — natural end of book was emitting stopped then finished. Now only `finished` fires for natural end, `stopped` for autoTurn-off chapter end.
- **readalong.finished end-of-book detection** — checks if next spine item exists. If no next resource and autoTurn is on, emits `finished`.
- **definition.success spam** — was emitting for empty results on every settings change. Now only emits when results are found.
- **FXL rendition.layout detection** — added nested `rendition.layout` check (Snow White format). *(Committed to 3.0 branch)*
- **FXL injectablesFixed** — added style.css to viewer injectablesFixed for MO highlighting in FXL content. *(Viewer config)*

## What Breaks

**Nothing breaks.** All existing event strings still work. First argument on TTS/MO events unchanged ("started", "stopped", etc.). New data added as additional arguments that existing listeners can ignore.

## How to Migrate

No migration needed. Optionally adopt typed events and enriched payloads:

```typescript
import { ReaderEvent } from "@d-i-t-a/reader";

// Old (still works)
reader.addEventListener("resource.ready", () => { ... });
reader.addEventListener("readaloud.started", (detail) => { ... });

// New — typed constant
reader.addEventListener(ReaderEvent.ResourceReady, (data) => {
  console.log("Resource ready:", data.href);
});

// New — enriched payloads
reader.addEventListener(ReaderEvent.ReadAloudStarted, (detail, data) => {
  console.log("TTS started at:", data.locator);
});

reader.addEventListener(ReaderEvent.BookmarkCreated, (bookmark) => {
  console.log("Bookmark at:", bookmark.href);
});

reader.addEventListener(ReaderEvent.LocationChanged, (position) => {
  console.log("Now at:", position.locations.progression);
});
```

## Important: Callbacks vs Events

**Callbacks** can return data — the integrator processes and returns a result (e.g., `addBookmark` returns a bookmark with a server-assigned ID). **Events** are one-way notifications. They are complementary, not interchangeable.
