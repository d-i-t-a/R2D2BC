# CHANGES — v3 Workstream 3.9: Audiobook Support

Published as: `3.0.0-alpha.22`
Branch: `feature/v3-audiobook` (based on `v3`, which has 3.5.3 + alpha.21 at tip `80b5f01`)
Closes: none filed (aligns with [Readium Audiobook profile](https://readium.org/webpub-manifest/profiles/audiobook.html))

## At a glance

DITA Toolkit gains first-class support for Readium Audiobook Profile publications. `D2Reader.load()` detects `Profile.AUDIOBOOK` in `publication.metadata.conformsTo` and dynamic-imports an `AudiobookNavigator` parallel to the existing `EpubNavigator` / `PDFNavigator` dispatch.

The audiobook stack is pluggable end-to-end. One persistent `AudioEngine` per navigator lifetime; track transitions go through `engine.changeSrc(source)` on the engine's `<audio>` element — RemotePlayback session, MediaSession bindings, and event listener wiring survive every track change. The `AudioSource` discriminated union (`url` / `drm` / `hls` / `vendor`) carries source-specific configuration so integrators can substitute the default `WebAudioEngine` with a vendor SDK wrapper without widening the navigator contract.

Three audiobook modules ship: `AudiobookBookmarkModule` (timestamped bookmarks, optional chapter-grouped rendered list), `AudiobookCommentsModule` (point-anchored time-stamped comments + `onEdit` integrator hook), `AudiobookTimelineModule` (chapter-scoped + whole-book scrubber UI + timeline math API).

Cross-cutting normalization between EPUB and PDF folded in: PDF modules now take static deps via constructor injection (mirrors EPUB), `PDFNavigator` migrated from 8 positional args to single config, type-guard functions deleted, dead code removed.

ChapterPrefetcher (head-of-chapter HTTP prefetch) ships disabled by default — head-only caching does not satisfy the audio element's `HAVE_FUTURE_DATA` threshold, so user-perceived time-to-audible doesn't shorten by enabling this alone.

---

## Summary of changes

### Audio engine layer

One persistent `AudioEngine` instance per navigator lifetime, owning a single `<audio>` element. Track changes call `engine.changeSrc(source)` — no element swap, no event listener re-attach. Matches Readium ts-toolkit's `WebAudioEngine` pattern.

New files in `src/navigator/audio/`:

- `AudioEngine.ts` — interface, `AudioEngineEvent` union, `AudioEngineEventMap` payload typing
- `AudioTypes.ts` — engine-boundary types (`AudioSource` discriminated union, `TimeRange`, `AudioMetadata`, `AudioTextTrack`, `AudioReadyState`, `AudioNetworkState`, `AudioEngineError`)
- `WebAudioEngine.ts` — default implementation. Plain `HTMLAudioElement` fast path; lazy Web Audio graph + preserve-pitch worklet activate only when needed for `preservesPitch` on browsers lacking native support. CORS rollback if Web Audio activation hits a host without `Access-Control-Allow-Origin`
- `AudioPool.ts` — hidden `<audio preload="auto">` neighbor prefetch (current ± 1). `setCurrentAudio(index)` is the only mutation entry — drives engine src switch + refreshes the prefetch window
- `EngineFactory.ts` — factory interface; one `create()` per navigator + optional `destroy()`
- `SleepTimer.ts` — minutes mode + end-of-chapter mode (wall-clock based; pausing mid-timer doesn't extend it)
- `MediaSessionController.ts` — `navigator.mediaSession.metadata` + action handlers (lock screen, media keys, CarPlay/Android Auto via integrator webview). Gated by `audiobook.userSettings.enableMediaSession`
- `PreservePitchProcessor.ts` + `.js` — Web Audio worklet (phase-vocoder pitch shifter). The `.js` file loads as a plain module; the `.ts` side exports the worklet name constant + message type

### Pluggable engine factory + AudioSource union

Integrators substitute `WebAudioEngineFactory` with their own `EngineFactory` to wrap vendor SDKs (DRM, HLS, proprietary streaming). The `AudioSource` union (`{ kind: "url" | "drm" | "hls" | "vendor"; ... }`) carries source-specific config (URLs, license info, manifest URLs, vendor IDs) — default `WebAudioEngine` handles `"url"`; other kinds are integrator-engine territory.

`ResolveSourceFn` maps a reading-order `Link` to an `AudioSource`. Default returns `{ kind: "url", url: publication.getAbsoluteHref(link.href) }`; integrators override when sources need DRM keys, HLS manifest URLs, vendor IDs, etc.

### AudiobookNavigator

`src/navigator/AudiobookNavigator.ts` — implements the base `Navigator` interface, owns single persistent engine + pool + settings + sleep timer + MediaSession + modules.

`goTrack(index, time)` is the single navigation entry point. Same-track navigation collapses to a pure `engine.seek` — no src change, no `canplay` wait, no spurious UI events. Cross-track navigation uses a `navigationId` supersession counter so rapid clicks don't pile up promises: the latest call wins; older in-flight navigations detect supersession via the counter and silently abandon.

Public surface: `play / pause / seek / jump / skipForward / skipBackward / nextChapter / previousChapter / setPlaybackRate / setVolume / setMuted`. Read-only state: `currentTime / duration / isPlaying / isPaused / isWaiting / isTrackStart / isTrackEnd / canGoForward / canGoBackward / currentLocator()`.

### D2Reader audiobook dispatch

`D2Reader.audiobookNavigatorClass` static field populated on first dynamic load. `D2Reader.load()` branches on `Profile.AUDIOBOOK` in `publication.metadata.conformsTo` before the EPUB path. `D2Reader` gains audiobook playback methods that delegate to the active navigator (no-op for non-audiobook): `play / pause / seek / jump / skipForward / skipBackward / nextChapter / previousChapter / setPlaybackRate / setVolume / setMuted`. Read-only getters: `currentTime`, `duration`, `isPlaying`, `isPaused`, `isWaiting`, `audiobookSettings`, `audiobookTimeline`.

### Locator extension (time + fragments)

`Locations.time?: number` and `Locations.fragments?: string[]` — additive optional fields. Existing EPUB / PDF Locators continue to round-trip unchanged. New helpers `locationsFromTime(t, base)` + `getTimeFromLocations(loc)` round-trip through the `fragments` array so deep-links (e.g. `t=120`) survive JSON serialization.

New `src/utils/mediaFragments.ts` — Media Fragments URI parser + serializer (`t=`, `xywh=`, `track=`).

### AudiobookSettings

`src/model/user-settings/AudiobookSettings.ts` — persisted preferences module parallel to `UserSettings`. Fields: `volume`, `playbackRate`, `preservePitch`, `skipForwardInterval`, `skipBackwardInterval`, `pollInterval`, `autoPlay`, `enableMediaSession`, `timelineMode`. Field names match Readium ts-toolkit's `AudioPreferences`.

Bounds: `volume [0,1]`, `playbackRate [0.5,4.0]`, skip intervals `[5,60]`s. `onChange` listener for navigator integration — the navigator subscribes and pushes per-field changes into the engine (volume, playbackRate, preservesPitch) or routes them (enableMediaSession routes through `applyMediaSessionSetting`).

### AudiobookBookmarkModule

`src/modules/audiobook/AudiobookBookmarkModule.ts` — implements `ReaderModule<HostType.Audiobook>`. Timestamped bookmarks persisted via the existing `LocalAnnotator`. Optional chapter-grouped rendered list when integrator supplies a `listContainer`; data-only otherwise. Gated by `rights.enableBookmarks`. `findBookmarkAt(locator?)` returns the stored bookmark within ±1s tolerance — symmetry with EPUB / PDF bookmark modules.

### AudiobookCommentsModule

`src/modules/audiobook/AudiobookCommentsModule.ts` — point-anchored time-stamped comments with optional rendered list. `onEdit` integrator hook delivers the comment to edit; without the hook the edit button is hidden. Gated by `rights.enableComments`. Emits `comments.created`, `comments.updated`, `comments.deleted`, and `comments.active` (the active set at current playback time).

Replaces the planned `AudiobookAnnotationModule` — comments cover the user-facing "timestamped notes" surface; range-based audio annotations don't yet have a real demand.

### AudiobookTimelineModule

`src/modules/audiobook/AudiobookTimelineModule.ts` — scrubber UI (chapter-scoped + whole-book) + timeline math API for integrator-built UIs. Renders into integrator containers; math-only mode without containers. The chapter scrubber follows the user's `audiobookSettings.timelineMode` (`"chapter"` | `"book"` | `"both"`); the whole-book strip is always whole-book and shown only when `timelineMode === "both"` via integrator-controlled row visibility.

During book-scrubber drags, the module calls `host.prefetchResource(index)` for each chapter the cursor crosses — pool warms the audio cache so the post-release seek lands without paying the cold-fetch latency.

### SleepTimer

Two modes: minutes-based (`startMinutes(n)`) and end-of-chapter (`startEndOfChapter()`). Minutes mode is wall-clock based — pausing mid-timer doesn't extend it. End-of-chapter mode wins over `autoPlay`: when the chapter ends, playback pauses instead of advancing. Replaces any active timer when re-armed.

Emits `playback.sleeptimer.started`, `tick`, `expired`, `cancelled`. Navigator's `onExpire` callback pauses playback first (so the OS lock-screen + UI flip immediately) and then emits the expiry event.

### MediaSessionController

`navigator.mediaSession.metadata` + action handlers (`play`, `pause`, `seekto`, `previoustrack`, `nexttrack`, `seekbackward`, `seekforward`). Updated on every `TrackChanged`. Surfaces in CarPlay / Android Auto when integrator embeds DITA Toolkit in a webview shell. Gated by `audiobook.userSettings.enableMediaSession` (toggling the setting installs / tears down the controller live).

### Reading-position auto-restore

On reload, the navigator restores the last reading position from `config.initialLastReadingPosition` or the annotator's stored position (whichever resolves first). Persisted on `timeupdate` (debounced via `audiobookSettings.pollInterval`, default 1000ms), flushed immediately on `pause`, `goTrack`, `stop`, and `visibilitychange → hidden`.

The integrator's `api.updateCurrentLocation` runs first; the local `annotator.saveLastReadingPosition` chains after it resolves so the local store stays in sync with whatever the integrator persisted remotely.

### Audiobook playback events

New entries in `ReaderEvent` and `ReaderEventMap`:

| Event | Payload |
|---|---|
| `playback.started` | `{ locator, currentTime }` |
| `playback.paused` | `{ locator, currentTime }` |
| `playback.ended` | `{ locator }` |
| `playback.stalled` | `{ locator, currentTime }` |
| `playback.error` | `{ error: unknown, locator }` (the value at runtime is an `AudioEngineError` from the engine; the event map types it as `unknown` for forward-compat with engines that emit different error shapes) |
| `playback.timeupdate` | `{ locator, currentTime, duration }` |
| `playback.trackchanged` | `{ previous: Locator \| null, current: Locator }` |
| `playback.durationchanged` | `{ duration, locator }` |
| `playback.ratechanged` | `{ rate }` |
| `playback.waiting` | `{ waiting: boolean, locator }` — see next section |
| `playback.sleeptimer.started` | `SleepTimerSnapshot` |
| `playback.sleeptimer.tick` | `SleepTimerSnapshot` |
| `playback.sleeptimer.expired` | `SleepTimerSnapshot` |
| `playback.sleeptimer.cancelled` | `void` |
| `comments.created` | `Comment` |
| `comments.updated` | `Comment` |
| `comments.deleted` | `{ id }` |
| `comments.active` | `{ active: Comment[], currentTime }` |

### `playback.waiting` event + spinner state

Single state event covering three cases that look identical to the user: cross-chapter navigation (between `engine.pause()` and `canplay` on the new src), cold-start (user pressed play but engine isn't yet `HaveFutureData`), and mid-playback buffer exhaustion (browser's `waiting` event). Cleared by `playing` / `canplay` / `pause` / `ended` / `error`.

`navigator.isWaiting` getter mirrors the same state. Drives integrator's spinner UI without forcing them to wire three different signals.

### Chapter list rendering

When integrator supplies `audiobook.chapterListContainer`, the navigator renders a chapter list inside it. Source is `publication.tableOfContents` (recursive `Link` tree from the manifest, with parts / sections nested via `Link.children`); falls back to `readingOrder` when the manifest declares no TOC. Click → `goTo(target)` for the chapter; the navigator's `goTrack` machinery handles cross-chapter activation + optional `#t=N` seek from the TOC link fragment.

Current-chapter highlight via `data-current="true"` dataset attribute; updated on every `TrackChanged` event. Cheap — no re-render, just dataset toggle on existing DOM.

### Audiobook color overrides

`AudiobookColors` typed shape (exported from `AudiobookNavigator.ts` alongside `AudiobookConfig`). Field set: `track`, `accent`, `accentFade`, `comment`, `boundary`. Applied as inline CSS custom properties (`--dita-audiobook-*`) on `document.documentElement` so all library-rendered audiobook DOM (scrubber, chapter list, bookmark list, comment list) inherits them. Any CSS color value works (`"#1db954"`, `"rgb(...)"`, `"var(--my-token)"`).

### Consolidated `audiobook` ReaderConfig field

All audiobook-specific options live under a single top-level `audiobook?` field on `ReaderConfig`:

```ts
audiobook?: {
  userSettings?: InitialAudiobookSettings;
  timeline?:    Partial<AudiobookTimelineModuleConfig>;
  bookmarks?:   Partial<AudiobookBookmarkModuleConfig>;
  comments?:    Partial<AudiobookCommentsModuleConfig>;
  preservePitchWorkletUrl?: string | URL;
  chapterListContainer?:    HTMLElement | null;
  colors?:      AudiobookColors;
  prefetch?:    { enabled?: boolean; bytes?: number; concurrency?: number };
};
```

EPUB and PDF configs keep their existing flat top-level shape; only audiobook nests under a namespace. `ReaderConfig.ts` extracted from `EpubNavigator.ts` into its own file so all three navigators can coexist without sideways imports.

### ChapterPrefetcher (head-of-chapter HTTP prefetch, off by default)

`src/navigator/audio/ChapterPrefetcher.ts` — walks the publication reading order on book open and issues `Range: bytes=0-262143` GETs for each track, bounded by a concurrency cap (default 3). Skips the current track (engine owns it) and the pool's immediate ±1 neighbors (already warm via `<audio preload="auto">`).

Disabled by default. Head-only caching does not satisfy the audio element's `HAVE_FUTURE_DATA` threshold, so user-perceived time-to-audible doesn't shorten by enabling this alone. Enable via `audiobook.prefetch = { enabled: true, bytes, concurrency }`. The class lives in its own file + commit so disabling or reverting the prefetch path is mechanical.

CORS-safelisted closed-byte `Range` header (`bytes=0-N` with small N) — no custom headers, no preflight on browsers that honor the spec safelist. On `200` responses (server ignored Range) or non-`206` responses, the URL is marked bad and skipped on retry; the engine remains unaffected.

### Audio worklet for pitch preservation

`src/navigator/audio/PreservePitchProcessor.js` is a Web Audio `AudioWorkletProcessor` (phase-vocoder pitch shifter). Loaded by URL — browsers don't accept inline worklets — so the build script copies it into `dist/`. Integrators point `ReaderConfig.audiobook.preservePitchWorkletUrl` at the deployed copy.

The default `WebAudioEngine` activates the worklet path **only as a fallback** for browsers lacking native `HTMLMediaElement.preservesPitch` (Chromium / Firefox / Safari ≥ 13.1 all have native support — the worklet rarely fires in practice). When activation triggers a CORS reload of the audio element and the host doesn't allow CORS, the engine rolls back to non-CORS playback and silently disables pitch correction for that source.

### PDF/EPUB normalization (folded in)

Building audiobook surfaced architectural drift between EPUB and PDF; the cross-module deltas were small enough to fix in this workstream:

- PDF modules take static deps (`annotator`, `viewStore`, `publication`) via constructor injection — same shape as EPUB modules. `host.viewStore` / `host.annotator` removed from `PDFModuleHost`.
- `isPDFNavigator` and `isAudiobookNavigator` type-guard functions deleted. D2Reader uses optional methods on the `Navigator` interface (`play?(): Promise<void>`, etc.) with `?.()` chains.
- Underscore-prefixed private fields dropped where they no longer back a public getter.
- `PDFNavigator` constructor migrated from 8 positional args to a single `PDFNavigatorConfig` — matches `EpubNavigator`.
- `isPDF` marker removed (no remaining users after type-guard deletion).
- Dead code removed (`ReaderUI` interface, leftover `links*` field declarations).
- `ModuleHost` interface trimmed to the cross-navigator minimum (publication, rights, api, navigation, `getModule`). DOM / settings / fetcher concerns moved to a new `VisualModuleHost` extension that `PDFModuleHost` and `EpubModuleHost` both extend. New `AudiobookModuleHost` extends the base with a single `prefetchResource` hook for timeline-driven cache warming.

---

## Demo viewer changes

- **`viewer/index_audiobook.html`** (new): full-featured audiobook demo — cover, scrubber, transport controls, speed selector, volume + mute, sleep timer UI, comments list with edit / delete, bookmark list, MediaSession lock-screen metadata, settings panel, playback-waiting spinner.
- **`viewer/index_audiobook_minimal.html`** (new): minimal integrator template — single-screen layout, every option commented for an integrator reading it as a starting point. Demonstrates the consolidated `audiobook` ReaderConfig field including the `prefetch` sub-field (enabled here for dev testing with 4MB head — library default is disabled).
- **`viewer/index.html`**: audiobook filter button + 🎧 icon + `badge-audiobook` class on the publication grid.
- **`src/styles/sass/player.scss`** + `src/styles/sass/player/` (`_bookmarks`, `_chapters`, `_comments`, `_timeline`) — audiobook player UI styles, namespaced separately from `reader.scss`. Built to `dist/player.css` by the existing sass build (`build.ts`).
- **`build.ts`**: compiles `player.scss` to `dist/player.css`; copies `PreservePitchProcessor.js` to `dist/` (worklets can't be inlined in the bundle — they load by URL).
- **`examples/server.ts`**: audiobook content route alongside the existing manifest/EPUB routes so the audiobook viewers can consume cached IA archive audiobooks locally.
- **`examples/audiobookFromArchive.ts`** (new): converts an archive.org IA audiobook page into a Readium Audiobook Profile manifest + downloads the audio files into a local cache.
- **`examples/buildAudiobookFromArchive.ts`** (new): packager script (wired to `npm run build:audiobook`) that produces a `.audiobook` file ready to drop into the dev viewer.

---

## Migration

There is no audiobook API to migrate from — audiobook is new functionality, additive at the `D2Reader.load()` dispatch branch. EPUB integrators see no API changes.

### PDF integrator impact (from the EPUB/PDF normalization folded into this workstream)

These are real API changes for integrators who construct `PDFNavigator` or PDF modules directly. Most integrators register modules via `ReaderConfig` and aren't affected.

- `PDFNavigator` now takes a single `PDFNavigatorConfig` argument instead of 8 positional args. Wrap existing args in a config object.
- PDF modules constructed directly take `annotator`, `viewStore`, `publication` via constructor injection rather than reading them from `PDFModuleHost`. The `viewStore` and `annotator` fields are no longer on `PDFModuleHost`.

### Audiobook setup (new feature — wiring instructions, not migration)

- **Manifest**: must declare the [Audiobook profile](https://readium.org/webpub-manifest/profiles/audiobook.html) via `metadata.conformsTo`. D2Reader dispatches on this — non-audiobook manifests fall through to the EPUB / PDF paths unchanged.
- **Config**: pass an `audiobook?` field on `D2Reader.load()`. Sub-fields: `userSettings` (initial preferences — volume, playbackRate, etc.), `timeline` / `bookmarks` / `comments` (module configs, including optional `listContainer` for rendered UI), `preservePitchWorkletUrl` (worklet URL — required only when host bundler doesn't expose `import.meta.url` and the browser lacks native `preservesPitch`), `chapterListContainer` (DOM container for the chapter list), `colors` (CSS custom property overrides), `prefetch` (head-of-chapter HTTP prefetch — disabled by default).
- **Worklet**: the build script copies `PreservePitchProcessor.js` to `dist/`. Self-host it and point `preservePitchWorkletUrl` at the deployed copy. Required only on browsers lacking native `HTMLMediaElement.preservesPitch`.
- **Sample audiobook**: `examples/buildAudiobookFromArchive.ts` packages an archive.org IA audiobook into a `.audiobook` file, suitable as a local test fixture.

The minimal viewer (`viewer/index_audiobook_minimal.html`) is the integrator starting template. The full viewer (`viewer/index_audiobook.html`) demonstrates the optional surfaces (settings panel, sleep timer UI, comments form, etc.) that integrators wire if they want them.
