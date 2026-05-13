/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Developed on behalf of: DITA (AM Consulting LLC)
 */

import Navigator from "./Navigator";
import {
  Locator,
  Publication,
  Link,
  ReadingPosition,
  locationsFromTime,
} from "../model/v3";
import { ReaderEvent } from "../utils/Events";
import { AudioEngine } from "./audio/AudioEngine";
import type { AudioEngineEventMap } from "./audio/AudioEngine";
import { AudioReadyState } from "./audio/AudioTypes";
import { AudioPool, ResolveSourceFn } from "./audio/AudioPool";
import { ChapterPrefetcher } from "./audio/ChapterPrefetcher";
import type { EngineFactory } from "./audio/EngineFactory";
import { WebAudioEngineFactory } from "./audio/WebAudioEngine";
import type Annotator from "../store/Annotator";
import type { NavigatorAPI, ReaderRights } from "./types";
import type { AudiobookModuleHost } from "../modules/ModuleHost";
import { HostType } from "../modules/ReaderModule";
import type { ReaderModule } from "../modules/ReaderModule";
import { NavigatorFeature } from "./NavigatorFeature";
import type { AudiobookTimelineModule } from "../modules/audiobook/AudiobookTimelineModule";
import type { AudiobookCommentsModule } from "../modules/audiobook/AudiobookCommentsModule";
import type {
  AudiobookSettings,
  AudiobookSettingsKey,
} from "../model/user-settings/AudiobookSettings";
import { SleepTimer, type SleepTimerSnapshot } from "./audio/SleepTimer";
import { MediaSessionController } from "./audio/MediaSessionController";

/**
 * Configuration for the AudiobookNavigator.
 */
export interface AudiobookConfig {
  publication: Publication;
  /**
   * Reader rights flags. Audiobook-relevant fields: `enableBookmarks`,
   * `enableAnnotations`, `enableHistory`, `enableConsumption`,
   * `enableSearch`, `enableTimeline`, `enableContentProtection`. Each
   * gates whether the corresponding module's features are exposed via
   * `supports()` / `modules.*`.
   */
  rights?: Partial<ReaderRights>;
  /**
   * Override the default engine factory. Pass in a factory implementing
   * `EngineFactory` to plug in DRM, HLS, or vendor-SDK engines. Default:
   * `WebAudioEngineFactory` (single persistent `HTMLAudioElement` with
   * a lazy Web Audio graph for the pitch-preservation worklet fallback).
   * The factory's `create()` is called exactly once at construction; the
   * resulting engine is reused for every track via `engine.changeSrc()`.
   *
   * If your factory only supports a subset of source kinds (e.g., only
   * `"drm"` sources), supply a `resolveSource` function that maps reading
   * order links to the appropriate source kind, and combine factories
   * with a router-style EngineFactory if you need to mix.
   */
  engineFactory?: EngineFactory;
  /**
   * Optional per-resource source-resolver. Maps a reading-order `Link`
   * (or one of its alternates) to the `AudioSource` the engine should
   * consume. Default returns a plain `{ kind: "url", url }` from the
   * link's absolute href. Override when sources need DRM keys, HLS
   * manifest URLs, vendor IDs, etc. — supply alongside an `engineFactory`
   * that handles those source kinds.
   */
  resolveSource?: ResolveSourceFn;
  /** Pool capacity. Default 3 (current + adjacent neighbors). */
  poolCapacity?: number;
  /**
   * Head-of-chapter prefetch. When enabled, the navigator pre-warms
   * the browser's HTTP cache with the first ~256KB of every track in
   * the reading order on book load. Disabled by default — head-only
   * caching does not satisfy the audio element's HAVE_FUTURE_DATA
   * threshold, so the UX impact is marginal until a Service-Worker
   * full-file caching layer ships and reuses these warmed bytes. Set
   * `enabled: true` to opt in. Defaults: `{ enabled: false, bytes:
   * 262144, concurrency: 3 }`.
   */
  prefetch?: {
    enabled?: boolean;
    bytes?: number;
    concurrency?: number;
  };
  /**
   * Typed playback settings (volume, playbackRate, preservePitch,
   * skip intervals, pollInterval, autoPlay, enableMediaSession).
   * The navigator subscribes to its `onChange` and pushes relevant
   * fields into the active engine. Skip-interval and pollInterval
   * values are read live from settings — change them via the settings
   * setters and the navigator picks them up on the next call.
   *
   * Construct via `AudiobookSettings.create({ store, ... })`. D2Reader
   * does this automatically from `ReaderConfig.audiobookSettings`.
   */
  settings: AudiobookSettings;
  /**
   * URL of the deployed `PreservePitchProcessor.js` AudioWorklet file.
   *
   * Consulted ONLY as a fallback: the default `WebAudioEngine` uses the
   * native `HTMLMediaElement.preservesPitch` attribute on every modern
   * browser (Chromium, Firefox, Safari ≥ 13.1) and never touches Web
   * Audio. The worklet is only loaded when the user enables pitch
   * preservation on a browser that lacks the native attribute.
   *
   * When this URL isn't supplied AND the worklet fallback is reached,
   * the engine logs a warning and plays without pitch correction — the
   * audiobook continues to stream normally; only the pitch-preservation
   * feature is silently disabled for that source.
   */
  preservePitchWorkletUrl?: string | URL;
  /**
   * Integrator callbacks. `updateCurrentLocation` receives the
   * playback position whenever it should be persisted (debounced
   * during playback, immediate on pause / chapter change / page
   * visibility change). Other `NavigatorAPI` fields are unused by
   * the audiobook navigator — `Partial` so callers can pass the
   * same `api` they pass to other navigators without filling in
   * EPUB-specific callbacks like `getContent`.
   */
  api?: Partial<NavigatorAPI>;
  /**
   * Local-storage hook. When provided, the navigator auto-persists
   * the reading position to it (matches EPUB and PDF behaviour) so
   * the page survives reloads even without an integrator-supplied
   * `api.updateCurrentLocation`. Default: pass the same
   * `LocalAnnotator` D2Reader builds for EPUB/PDF.
   */
  annotator?: Annotator;
  /**
   * Position to seek to on load. The href must match a resource in
   * the publication's `readingOrder`; if not, the navigator falls
   * back to the annotator's stored position (if any), then to
   * `initialIndex`.
   */
  initialLastReadingPosition?: Locator;
  /**
   * Modules to register at construction. Includes built-in audiobook
   * modules (AudiobookBookmarkModule, etc.) plus integrator-supplied
   * custom modules. Module `hostType` must be `"audiobook"` —
   * mismatches are logged and skipped (mirrors EPUB / PDF).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules?: Array<ReaderModule<any> | undefined>;
  /**
   * Container the navigator renders the chapter list inside. Optional.
   * When provided, the navigator builds a chapter list from
   * `publication.timeline` (readingOrder cross-referenced with the
   * table of contents — top-level entries become chapters, TOC
   * fragments become flat sub-section rows under them) and keeps it
   * in sync with the current playback position. Without a container
   * the integrator can still build their own list from
   * `publication.timeline.items`.
   */
  chapterListContainer?: HTMLElement | null;
  /**
   * Color overrides for every audiobook UI surface — scrubber,
   * chapter list, and any future bookmark / comment lists. Applied
   * as inline CSS custom properties on the document root, so any
   * library-rendered DOM under this navigator inherits them. Omit
   * any field to fall back to the SCSS default.
   */
  colors?: AudiobookColors;
}

/**
 * Color overrides for all audiobook UI rendered by the library.
 * Applied as inline CSS custom properties; defaults live in
 * `src/styles/sass/player/_*.scss`. Any CSS color value works
 * (`"#1db954"`, `"rgb(...)"`, `"var(--my-token)"`).
 */
export interface AudiobookColors {
  /** Background track behind the scrubber fill. CSS var `--dita-audiobook-track`. */
  track?: string;
  /** Fill, thumb, bookmark marker, current chapter row. CSS var `--dita-audiobook-accent`. */
  accent?: string;
  /** Hovered chapter band background on the scrubber. CSS var `--dita-audiobook-accent-fade`. */
  accentFade?: string;
  /** Comment marker on the scrubber. CSS var `--dita-audiobook-comment`. */
  comment?: string;
  /** Chapter divider line on the scrubber. CSS var `--dita-audiobook-boundary`. */
  boundary?: string;
}

/**
 * AudiobookNavigator — `Navigator` implementation for Readium Audiobook
 * Profile publications.
 *
 * Architecture (matches Readium ts-toolkit's audiobook player):
 * - One persistent `AudioEngine` is created at construction and reused
 *   for every track. Track transitions go through `engine.changeSrc()`
 *   on the engine's single `<audio>` element — no element swap, no
 *   listener re-attach, RemotePlayback session + MediaSession bindings
 *   stay intact across navigation.
 * - An `AudioPool` of hidden `<audio preload="auto">` elements warms
 *   the current track's neighbors so adjacent-chapter scrubs land
 *   without paying a fresh CDN round-trip.
 * - `goTrack(index, time)` is the single entry point for navigation.
 *   Same-track requests collapse to a pure `engine.seek`; cross-track
 *   requests use a `navigationId` counter so rapid clicks supersede
 *   in-flight loads instead of queueing.
 *
 * Public API mirrors the de facto names used across the audiobook web
 * ecosystem (ts-toolkit, Speechify, Audible web SDK): `play / pause /
 * seek / jump / skipForward / skipBackward / goForward / goBackward`,
 * plus `currentTime / duration / isPlaying` queries and boundary
 * predicates. Plus the `Navigator` interface methods (`goTo`,
 * `goToPosition`, `nextResource`, etc.) for interop with `D2Reader`.
 */
export class AudiobookNavigator
  extends Navigator
  implements AudiobookModuleHost
{
  readonly publication: Publication;
  readonly settings: AudiobookSettings;
  readonly rights: Partial<ReaderRights>;

  /**
   * The single persistent audio engine. Created once at construction
   * via the configured factory; its `src` is mutated on every track
   * change via `pool.setCurrentAudio()` (which calls `engine.changeSrc`).
   * Never swapped — the underlying media element, attached listeners,
   * RemotePlayback session, and MediaSession bindings live for the
   * navigator's full lifetime. Matches Readium ts-toolkit's pattern.
   */
  private readonly engine: AudioEngine;
  private readonly pool: AudioPool;
  /**
   * Head-of-chapter HTTP prefetcher. On book load it walks the reading
   * order and warms the browser's cache with the first ~256KB of every
   * track. Far-chapter scrubs hit cache for their first audible byte
   * instead of paying a cold CDN round-trip. Optional —
   * `prefetch.enabled = false` disables.
   */
  private readonly prefetcher: ChapterPrefetcher;
  private readonly engineFactory: EngineFactory;
  private settingsUnsubscribe: (() => void) | null = null;
  readonly api?: Partial<NavigatorAPI>;
  private readonly annotator?: Annotator;
  private lrpTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sleepTimer: SleepTimer;
  private mediaSession: MediaSessionController | null = null;
  private readonly visibilityHandler: () => void;

  private currentIndex = -1;
  /**
   * Container the chapter list renders inside, when supplied via
   * `AudiobookConfig.chapterListContainer`. The navigator owns the
   * inner DOM (chapter rows, sub-section rows, current-chapter
   * highlighting) and re-renders on `TrackChanged`.
   */
  private chapterListContainer?: HTMLElement | null;
  /**
   * Monotonic counter incremented on every navigation request. The
   * latest `goTrack` invocation wins; older in-flight navigations
   * detect supersession by comparing their captured id against this
   * counter and silently abandon their post-load work. Replaces the
   * previous `activating: Promise` gate which could hang the navigator
   * when a load stalled (no escape without a full page refresh).
   */
  private navigationId = 0;
  /**
   * True while a navigation is in flight. Engine event listeners
   * (play / pause / timeupdate / ended / stalled) check this and skip
   * forwarding to the navigator's emit stream while it's true, so the
   * transient browser events fired during a src change don't reach the
   * UI as spurious state transitions.
   */
  private isNavigating = false;
  /**
   * True when playback is waiting on audio data. Goes true on cross-
   * chapter navigation (when the user was playing), cold-start of a
   * track (play before bytes arrive), and mid-playback buffer
   * exhaustion. Goes false on `playing` / `canplay` / `pause` / `ended`
   * / `error`. Drives the integrator's spinner via
   * `ReaderEvent.PlaybackWaiting`.
   */
  private _isWaiting = false;
  private stopped = false;

  constructor(config: AudiobookConfig) {
    super();
    this.publication = config.publication;
    this.rights = config.rights ?? {};
    this.settings = config.settings;
    this.api = config.api;
    this.annotator = config.annotator;
    this.chapterListContainer = config.chapterListContainer;
    this.applyColors(config.colors);

    // Push settings → engine on every change. Skip intervals + pollInterval
    // are read live (no push needed). autoPlay is consumed in onEnded.
    // enableMediaSession routes through `applyMediaSessionSetting` instead
    // of `applySettingToEngine` (it controls a controller, not the engine).
    this.settingsUnsubscribe = this.settings.onChange((key) => {
      if (key === "enableMediaSession") {
        this.applyMediaSessionSetting();
      } else {
        this.applySettingToEngine(key);
      }
    });

    // Sleep timer is always present; the work is gated on `isActive`. The
    // navigator owns it because end-of-chapter mode needs to interpose
    // ahead of the autoPlay-advance branch in `onEnded`.
    this.sleepTimer = new SleepTimer({
      onStart: (snap) => this.emit(ReaderEvent.SleepTimerStarted, snap),
      onTick: (snap) => this.emit(ReaderEvent.SleepTimerTick, snap),
      onCancel: () => this.emit(ReaderEvent.SleepTimerCancelled, undefined),
      onExpire: (snap) => {
        // Pause first so the OS lock-screen + UI flip immediately.
        // Then publish the expiry so subscribers know it fired (vs.
        // user-cancelled).
        this.pause();
        this.emit(ReaderEvent.SleepTimerExpired, snap);
      },
    });

    // Build the single persistent engine. The factory creates it once;
    // the navigator reuses it for every track via the pool's
    // `setCurrentAudio`. No `AudioContext` is created here — the engine
    // builds one lazily only if the Web Audio worklet path is needed
    // (i.e., pitch preservation on a browser without native support).
    this.engineFactory =
      config.engineFactory ??
      new WebAudioEngineFactory({
        preservePitchWorkletUrl: config.preservePitchWorkletUrl,
      });
    this.engine = this.engineFactory.create();
    this.attachEngineListeners();

    // The pool holds prefetch elements only (`<audio preload="auto">`),
    // not engine instances. It tells the engine to switch tracks via
    // `pool.setCurrentAudio(index)`, which calls `engine.changeSrc()`
    // under the hood.
    this.pool = new AudioPool({
      engine: this.engine,
      publication: this.publication,
      resolveSource: config.resolveSource,
    });

    // Head-of-chapter HTTP prefetcher (Phase A of the audiobook
    // prefetch & caching roadmap). Constructs the prefetcher but
    // doesn't start it — `create()` calls `start()` after the initial
    // position is committed so the skip set is meaningful.
    this.prefetcher = new ChapterPrefetcher({
      publication: this.publication,
      engine: this.engine,
      resolveSource: config.resolveSource,
      bytes: config.prefetch?.bytes,
      concurrency: config.prefetch?.concurrency,
      enabled: config.prefetch?.enabled,
    });

    // Flush the reading position when the page goes hidden — covers
    // tab close on most browsers more reliably than `beforeunload`.
    this.visibilityHandler = () => {
      if (typeof document !== "undefined" && document.hidden) {
        this.flushReadingPositionSave();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    this.registerModules(config.modules, HostType.Audiobook);

    // Initial Media Session wiring. The same path runs on settings toggle.
    this.applyMediaSessionSetting();

    // Navigator-driven dispatch for the timeline module's rendering.
    // Bookmark / comment events are emitted by the bookmark / comment
    // modules via `host.emit()` (which fans out through `this.emit` —
    // the navigator extends EventEmitter); the navigator subscribes to
    // its own emits and forwards to the timeline module's hooks.
    // TimeUpdated / TrackChanged / DurationChanged are dispatched at
    // their emit sites directly (see `goTrack` and `attachEngineListeners`).
    this.on(ReaderEvent.BookmarkCreated, () =>
      this.getTimelineModule()?.onBookmarkChanged()
    );
    this.on(ReaderEvent.BookmarkDeleted, () =>
      this.getTimelineModule()?.onBookmarkChanged()
    );
    this.on(ReaderEvent.CommentCreated, () =>
      this.getTimelineModule()?.onCommentChanged()
    );
    this.on(ReaderEvent.CommentDeleted, () =>
      this.getTimelineModule()?.onCommentChanged()
    );

    // Chapter list — initial render + re-highlight on every track
    // change. Built once from `publication.timeline`; only the
    // current-chapter highlight moves between renders.
    if (this.chapterListContainer) {
      this.renderChapterList();
      this.on(ReaderEvent.TrackChanged, () => this.refreshChapterHighlight());
    }
  }

  /**
   * Apply integrator-supplied color overrides as inline CSS custom
   * properties on `document.documentElement`. Setting them globally
   * (rather than on each rendered scrubber/list root) means any
   * library-rendered audiobook UI under this navigator inherits them
   * regardless of where the integrator placed its container. Only one
   * audiobook publication is open per reader at a time, so the global
   * scope is safe.
   */
  private applyColors(colors: AudiobookColors | undefined): void {
    if (!colors) return;
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const set = (name: string, value: string | undefined) => {
      if (value !== undefined) root.style.setProperty(name, value);
    };
    set("--dita-audiobook-track", colors.track);
    set("--dita-audiobook-accent", colors.accent);
    set("--dita-audiobook-accent-fade", colors.accentFade);
    set("--dita-audiobook-comment", colors.comment);
    set("--dita-audiobook-boundary", colors.boundary);
  }

  /**
   * Look up the audiobook timeline module. Used by navigator-driven
   * dispatch — the navigator calls `onTimeUpdate` / `onTrackChanged` /
   * etc. on the module at the same sites it emits matching reader
   * events. Returns `undefined` when the module isn't registered
   * (timeline rights disabled).
   */
  private getTimelineModule(): AudiobookTimelineModule | undefined {
    return this.getModule(NavigatorFeature.Timeline) as
      | AudiobookTimelineModule
      | undefined;
  }

  private getCommentsModule(): AudiobookCommentsModule | undefined {
    return this.getModule(NavigatorFeature.Comments) as
      | AudiobookCommentsModule
      | undefined;
  }

  /**
   * Build the chapter list inside `chapterListContainer` from
   * `publication.tableOfContents`. The TOC is a hierarchical Link
   * tree (each Link may have `.children`); the renderer recurses,
   * producing nested rows for parts/sections. Falls back to
   * `readingOrder` when the manifest declares no TOC.
   * Click a row → navigate to that position; the navigator's existing
   * `goTo` machinery handles cross-chapter activation and seek.
   */
  private renderChapterList(): void {
    const host = this.chapterListContainer;
    if (!host) return;
    host.innerHTML = "";
    const root = document.createElement("ol");
    root.className = "dita-audiobook-chapters";
    const toc = this.publication.tableOfContents;
    const source =
      toc.length > 0
        ? toc
        : // No TOC declared — render readingOrder as a flat chapter list.
          this.publication.readingOrder;
    for (const link of source) {
      this.appendChapterRow(root, link, 0);
    }
    host.appendChild(root);
    this.refreshChapterHighlight();
  }

  /**
   * Recurse a Link (and its `.children`, depth-first) into the parent
   * `<ol>`. Top-level rows are rendered as chapter rows; deeper levels
   * as section rows; nested children get nested `<ol>` wrappers so
   * tree depth is preserved. The data attribute `data-chapter-index`
   * stores the reading-order index of the underlying resource so
   * `refreshChapterHighlight` can match by current track.
   */
  private appendChapterRow(
    parent: HTMLElement,
    link: import("../model/v3/Link").Link,
    depth: number
  ): void {
    const row = document.createElement("li");
    row.className =
      depth === 0
        ? "dita-audiobook-chapters-chapter"
        : "dita-audiobook-chapters-section";
    const chapterIndex = this.indexForHref(link.href);
    if (chapterIndex >= 0) row.dataset.chapterIndex = String(chapterIndex);
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    const title = document.createElement("span");
    title.className = "dita-audiobook-chapters-title";
    title.textContent =
      link.title ||
      (chapterIndex >= 0 ? `Track ${chapterIndex + 1}` : link.href);
    row.appendChild(title);
    const target = this.locatorForTocLink(link);
    if (target) {
      const onActivate = (event: Event) => {
        event.preventDefault();
        void this.goTo(target);
      };
      row.addEventListener("click", onActivate);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") onActivate(event);
      });
    }
    parent.appendChild(row);
    const children = link.children?.items as
      | ReadonlyArray<import("../model/v3/Link").Link>
      | undefined;
    if (children && children.length > 0) {
      const sub = document.createElement("ol");
      sub.className = "dita-audiobook-chapters-sub";
      for (const child of children) {
        this.appendChapterRow(sub, child, depth + 1);
      }
      parent.appendChild(sub);
    }
  }

  /**
   * Index of the reading-order entry that matches `tocHref` after
   * normalizing both sides to their absolute form. Strips any
   * `#fragment` first, so a TOC entry like `"track-03.mp3#t=60"`
   * still resolves to the track's index. Returns -1 when nothing
   * matches (e.g. a TOC parent that points outside readingOrder).
   */
  private indexForHref(tocHref: string | undefined): number {
    if (!tocHref) return -1;
    const bare = tocHref.split("#")[0];
    const absTocHref = this.publication.getAbsoluteHref(bare);
    const order = this.publication.readingOrder;
    return order.findIndex(
      (l) => this.publication.getAbsoluteHref(l.href) === absTocHref
    );
  }

  /**
   * Convert a TOC Link (which may carry a `#t=N` audio cue) into a
   * `Locator` the navigator's `goTo` understands. Both sides are
   * normalized to absolute hrefs before comparison so the match is
   * robust to relative-vs-absolute storage differences between the
   * manifest's TOC and readingOrder. Returns `undefined` when the
   * link doesn't reference a known reading-order resource.
   */
  private locatorForTocLink(
    link: import("../model/v3/Link").Link
  ): import("../model/v3/Locator").Locator | undefined {
    if (!link.href) return undefined;
    const [bare, fragment] = link.href.split("#");
    const targetIndex = this.indexForHref(bare);
    if (targetIndex < 0) return undefined;
    const target = this.publication.readingOrder[targetIndex];
    let time: number | undefined;
    if (fragment) {
      const match = /(?:^|&)t=([0-9.]+)/.exec(fragment);
      if (match) time = Number(match[1]);
    }
    return {
      href: target.href,
      type: target.type,
      title: target.title,
      locations: time !== undefined ? { time } : {},
    };
  }

  /**
   * Set `[data-current="true"]` on the chapter row whose chapter index
   * matches `currentIndex`. Cheap — just updates dataset on existing
   * DOM, no re-render. Called on every `TrackChanged` and once on
   * initial mount.
   */
  private refreshChapterHighlight(): void {
    const host = this.chapterListContainer;
    if (!host) return;
    const current = String(this.currentIndex);
    for (const row of host.querySelectorAll<HTMLElement>(
      "[data-chapter-index]"
    )) {
      if (row.dataset.chapterIndex === current) row.dataset.current = "true";
      else delete row.dataset.current;
    }
  }

  /**
   * Async factory. Loads the starting resource so the navigator is
   * ready to play on return.
   *
   * Restoration order (matches EpubNavigator):
   *   1. `config.initialLastReadingPosition` if provided
   *   2. annotator's stored last reading position (auto-persisted on
   *      previous sessions)
   *   3. `initialIndex` (default 0)
   *
   * If a stored href no longer matches the current readingOrder
   * (manifest changed), the next fallback is used.
   */
  static async create(
    config: AudiobookConfig,
    initialIndex = 0
  ): Promise<AudiobookNavigator> {
    const navigator = new AudiobookNavigator(config);
    const order = navigator.publication.readingOrder;
    if (order.length === 0) return navigator;

    let restoreLocator: Locator | undefined =
      config.initialLastReadingPosition ?? undefined;
    if (restoreLocator) {
      const readingPosition: ReadingPosition = {
        ...restoreLocator,
        created: new Date(),
      };
      navigator.annotator?.initLastReadingPosition(readingPosition);
    } else {
      const stored = navigator.annotator?.getLastReadingPosition() as
        | Locator
        | null
        | undefined;
      if (stored?.href) restoreLocator = stored;
    }

    let startIndex = initialIndex;
    let seekTime: number | undefined;
    if (restoreLocator?.href) {
      const found = order.findIndex(
        (link) => link.href === restoreLocator.href
      );
      if (found >= 0) {
        startIndex = found;
        const time = restoreLocator.locations?.time;
        if (typeof time === "number" && time > 0) seekTime = time;
      }
    }

    await navigator.goTrack(startIndex, seekTime);
    // Initial position is now committed; kick off head-of-chapter
    // prefetch. Fire-and-forget — the prefetcher manages its own
    // concurrency and lifetime via `dispose()` in `stop()`.
    navigator.prefetcher.start();
    return navigator;
  }

  // ── Industry-standard playback API ─────────────────────────────

  /**
   * Resume playback on the persistent engine. The engine handles
   * AudioContext resumption internally (lazy — only when the Web Audio
   * graph is active). AbortError on rapid play/pause toggling is
   * swallowed by the engine.
   *
   * Pre-emptively sets `waiting=true` when the engine isn't yet at
   * `HaveFutureData` so the spinner shows during cold-start, before
   * the browser fires its own `waiting` event. Cleared by `playing`.
   */
  async play(): Promise<void> {
    if (this.engine.metadata.readyState < AudioReadyState.HaveFutureData) {
      this.setWaiting(true);
    }
    await this.engine.play();
  }

  pause(): void {
    this.engine.pause();
    this.flushReadingPositionSave();
  }

  /**
   * Seek within the current track. Same-track seek lands instantly
   * (browser uses the buffered range, no CDN round-trip). For
   * cross-track seek use `goTo(locator)` instead.
   */
  seek(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.engine.seek(seconds);
    this.mediaSession?.refreshPositionState();
  }

  /** Relative seek by `seconds` within the current track. */
  jump(seconds: number): void {
    const target = Math.max(0, this.engine.currentTime + seconds);
    this.engine.seek(Math.min(target, this.engine.duration || target));
    this.mediaSession?.refreshPositionState();
  }

  skipForward(): void {
    this.jump(this.settings.skipForwardInterval);
  }

  skipBackward(): void {
    this.jump(-this.settings.skipBackwardInterval);
  }

  async goForward(): Promise<void> {
    if (!this.canGoForward) return;
    await this.goTrack(this.currentIndex + 1, undefined);
  }

  async goBackward(): Promise<void> {
    if (!this.canGoBackward) return;
    await this.goTrack(this.currentIndex - 1, undefined);
  }

  get currentTime(): number {
    return this.engine?.currentTime ?? 0;
  }

  get duration(): number {
    return this.engine?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return !(this.engine?.paused ?? true);
  }

  get isPaused(): boolean {
    return this.engine?.paused ?? true;
  }

  /**
   * Whether playback is currently waiting on audio data. Equivalent
   * shape to the `PlaybackWaiting` event payload — true during cross-
   * chapter loads, cold-starts before bytes arrive, and mid-playback
   * rebuffers.
   */
  get isWaiting(): boolean {
    return this._isWaiting;
  }

  get canGoForward(): boolean {
    return this.currentIndex < this.publication.readingOrder.length - 1;
  }

  get canGoBackward(): boolean {
    return this.currentIndex > 0;
  }

  get isTrackStart(): boolean {
    return this.currentTime === 0;
  }

  get isTrackEnd(): boolean {
    if (this.engine.duration <= 0) return false;
    return this.engine.currentTime >= this.engine.duration || this.engine.ended;
  }

  get playbackRate(): number {
    return this.settings.playbackRate;
  }

  /**
   * Convenience facade — equivalent to `this.settings.playbackRate = rate`.
   * The settings change listener pushes the new value to the engine and
   * fires `PlaybackRateChanged`.
   */
  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.settings.playbackRate = rate;
  }

  get volume(): number {
    return this.settings.volume;
  }

  /** Convenience facade for `this.settings.volume = value`. */
  setVolume(value: number): void {
    this.settings.volume = value;
  }

  /**
   * Mute is transient runtime state (a UI gesture), not a persisted
   * preference — it's intentionally absent from `AudiobookSettings`.
   * Reads + writes go directly to the engine.
   */
  get muted(): boolean {
    return this.engine?.muted ?? false;
  }

  setMuted(value: boolean): void {
    if (this.engine) this.engine.muted = value;
  }

  // ── Sleep timer ─────────────────────────────────────────────────

  /**
   * Start a time-based sleep timer. Pauses playback after `minutes`
   * minutes of wall-clock time (NOT engine time — pausing manually
   * mid-timer doesn't extend it). Replaces any active timer.
   *
   * Subscribe to `SleepTimerStarted` / `SleepTimerTick` /
   * `SleepTimerExpired` / `SleepTimerCancelled` events for UI.
   */
  startSleepTimerMinutes(minutes: number): void {
    this.sleepTimer.startMinutes(minutes);
  }

  /**
   * Arm the sleep timer to pause at the end of the current chapter.
   * Wins over `settings.autoPlay` — when the chapter ends, playback
   * pauses instead of advancing. Replaces any active timer.
   */
  startSleepTimerAtChapterEnd(): void {
    this.sleepTimer.startEndOfChapter();
  }

  /** Cancel the sleep timer if armed. Idempotent. */
  cancelSleepTimer(): void {
    this.sleepTimer.cancel();
  }

  /**
   * Snapshot of the current sleep timer state, or `null` if no timer
   * is armed. For UI rendering — subscribe to `SleepTimerTick` for
   * live updates rather than polling this every frame.
   */
  sleepTimerState(): SleepTimerSnapshot | null {
    return this.sleepTimer.snapshot();
  }

  // ── Navigator overrides ────────────────────────────────────────

  currentResource(): number | undefined {
    return this.currentIndex >= 0 ? this.currentIndex : undefined;
  }

  currentLocator(): Locator {
    const link = this.currentLink;
    if (!link) {
      return { href: "", locations: {} };
    }
    const time = this.currentTime;
    const duration = this.duration || link.duration || 0;
    return {
      href: link.href,
      type: link.type,
      title: link.title,
      locations: locationsFromTime(time, {
        position: this.currentIndex >= 0 ? this.currentIndex + 1 : undefined,
        progression: duration > 0 ? Math.min(1, time / duration) : 0,
      }),
    };
  }

  async goTo(locator: Locator): Promise<void> {
    const index = this.publication.readingOrder.findIndex(
      (link) => link.href === locator.href
    );
    if (index < 0) return;
    const time =
      typeof locator.locations?.time === "number" && locator.locations.time >= 0
        ? locator.locations.time
        : undefined;
    await this.goTrack(index, time);
  }

  async goToPosition(value: number): Promise<void> {
    const index = value - 1;
    if (index < 0 || index >= this.publication.readingOrder.length) return;
    await this.goTrack(index, 0);
  }

  async nextResource(): Promise<void> {
    return this.goForward();
  }

  async previousResource(): Promise<void> {
    return this.goBackward();
  }

  atStart(): boolean {
    return this.currentIndex <= 0 && this.currentTime <= 0;
  }

  atEnd(): boolean {
    return (
      this.currentIndex >= this.publication.readingOrder.length - 1 &&
      this.isTrackEnd
    );
  }

  /**
   * Navigator interface `stop()`. Pauses playback, rewinds the current
   * resource to the start, and tears down the engine pool. After
   * `stop()`, the navigator is no longer usable — D2Reader calls this
   * on close.
   *
   * For "pause + rewind without teardown," call `pause()` and
   * `seek(0)` separately.
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.flushReadingPositionSave();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    this.sleepTimer.dispose();
    if (this.mediaSession) {
      this.mediaSession.destroy();
      this.mediaSession = null;
    }
    // Tear down in reverse construction order: prefetcher first
    // (cancels in-flight fetches), pool second (prefetch elements
    // release their network handles), engine third (the primary
    // element, its listeners, and any lazy Web Audio graph), factory
    // last (license caches, vendor SDK references, etc.). Engine +
    // factory destroys may be async — fire-and-forget; we don't block
    // the navigator's `stop()` on them.
    this.prefetcher.dispose();
    this.pool.destroy();
    void Promise.resolve(this.engine.destroy()).catch((err) => {
      console.warn("AudiobookNavigator: engine destroy failed", err);
    });
    if (this.engineFactory.destroy) {
      try {
        const result = this.engineFactory.destroy();
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((err) => {
            console.warn(
              "AudiobookNavigator: engineFactory destroy failed",
              err
            );
          });
        }
      } catch (err) {
        console.warn("AudiobookNavigator: engineFactory destroy threw", err);
      }
    }
    this.currentIndex = -1;
  }

  // ── Reading-position persistence ──────────────────────────────

  /**
   * Schedule a debounced save. Called on every `timeupdate`. Bursts of
   * timeupdates collapse into a single persist call `settings.pollInterval`
   * after the burst settles. No-op only when neither `api` nor
   * `annotator` is wired.
   */
  private scheduleReadingPositionSave(): void {
    if (!this.api?.updateCurrentLocation && !this.annotator) return;
    if (this.lrpTimer !== null) clearTimeout(this.lrpTimer);
    this.lrpTimer = setTimeout(() => {
      this.lrpTimer = null;
      this.persistReadingPosition();
    }, this.settings.pollInterval);
  }

  /**
   * Flush any pending debounced save and persist the current position
   * immediately. Called on `pause`, chapter changes, page-visibility-
   * hidden, and `stop()`.
   */
  private flushReadingPositionSave(): void {
    if (this.lrpTimer !== null) {
      clearTimeout(this.lrpTimer);
      this.lrpTimer = null;
    }
    this.persistReadingPosition();
  }

  private persistReadingPosition(): void {
    const locator = this.currentLocator();
    if (!locator.href) return;
    const readingPosition: ReadingPosition = {
      ...locator,
      created: new Date(),
    };

    // Mirror EpubNavigator: integrator's `api.updateCurrentLocation`
    // runs first; the local `annotator.saveLastReadingPosition` chains
    // after it resolves so the local store stays in sync with whatever
    // the integrator persisted remotely. When no api is provided, save
    // locally directly.
    const update = this.api?.updateCurrentLocation;
    if (update) {
      void update(readingPosition).then(() => {
        this.annotator?.saveLastReadingPosition(readingPosition);
      });
    } else {
      this.annotator?.saveLastReadingPosition(readingPosition);
    }

    this.emit(ReaderEvent.LocationChanged, readingPosition);
  }

  // ── Internal ───────────────────────────────────────────────────

  private get currentLink(): Link | undefined {
    if (this.currentIndex < 0) return undefined;
    return this.publication.readingOrder[this.currentIndex];
  }

  /**
   * Switch the persistent engine to the track at `index` and optionally
   * seek to `time` once it's playable. The only entry point for track
   * navigation — `goTo`, `goToPosition`, `goForward`, `goBackward`, and
   * the end-of-track auto-advance all funnel through here.
   *
   * Same-track navigation collapses to a pure `engine.seek` — no src
   * change, no canplay wait, no spurious UI events.
   *
   * Cross-track navigation:
   *   1. Bumps `navigationId` (latest wins; supersedes any in-flight call).
   *   2. Sets `isNavigating = true` so engine event listeners silence the
   *      transient pause / timeupdate noise the browser fires while the
   *      element loads a new src.
   *   3. Pauses the engine and tells the pool to point it at the new
   *      source. Pool synchronously calls `engine.changeSrc()` and
   *      refreshes its prefetch window.
   *   4. Awaits a `canplay` event on the new source (with supersession
   *      check via `navigationId` so a rapid-click run-up doesn't leak
   *      promises).
   *   5. Applies the optional `time` seek.
   *   6. Drops `isNavigating`, emits TrackChanged + DurationChanged.
   *   7. Resumes playback if it was active before the jump.
   *
   * Replaces the previous `activate` / `activateInner` swap pattern.
   * No engines are constructed or destroyed here — the single persistent
   * engine survives every track change.
   */
  private async goTrack(
    index: number,
    time: number | undefined
  ): Promise<void> {
    if (this.stopped) return;
    if (index < 0 || index >= this.publication.readingOrder.length) return;

    // Same-track navigation — intra-track seek only. Browser handles
    // seek-while-playing natively; no canplay wait, no UI noise.
    if (index === this.currentIndex) {
      if (typeof time === "number" && time >= 0) {
        this.engine.seek(time);
        this.mediaSession?.refreshPositionState();
      }
      return;
    }

    const navId = ++this.navigationId;
    const wasPlaying = !this.engine.paused;
    const previousLocator =
      this.currentIndex >= 0 ? this.currentLocator() : null;

    this.isNavigating = true;
    // Spinner UI: cross-chapter load when the user was playing means
    // there's a "should-be-playing but isn't yet" gap. The engine's
    // own `waiting` event is suppressed during isNavigating, so the
    // navigator drives the state directly. Cleared by `playing` once
    // the resumed track actually starts. When the user wasn't playing,
    // also drop any stale waiting state left over from a superseded
    // previous navigation — the new target is just a paused switch
    // and no spinner is warranted.
    this.setWaiting(wasPlaying);
    this.engine.pause();

    this.currentIndex = index;
    // Pool synchronously calls `engine.changeSrc(source)` and refreshes
    // the prefetch window. The actual load is observable via the
    // engine's `canplay` / `error` events, awaited next.
    this.pool.setCurrentAudio(index);
    // Prefetcher updates its skip set so the new current + pool
    // neighbors are passed over. In-flight prefetches continue —
    // already worth finishing.
    this.prefetcher.setCurrentIndex(index);
    // Some browsers reset `playbackRate` across src changes; re-push so
    // we never resume at 1.0 after a non-1.0 user preference.
    this.engine.playbackRate = this.settings.playbackRate;

    try {
      await this.waitForCanPlay(navId);
    } catch (err) {
      // Surface the error only if it belongs to THIS navigation. If a
      // newer goTrack arrived, the older error is stale noise.
      if (navId === this.navigationId) {
        this.isNavigating = false;
        this.setWaiting(false);
        this.emit(ReaderEvent.PlaybackError, {
          error: err,
          locator: this.currentLocator(),
        });
      }
      return;
    }

    if (this.stopped || navId !== this.navigationId) return;

    if (typeof time === "number" && time >= 0) {
      this.engine.seek(time);
    }

    this.isNavigating = false;

    const currentLocator = this.currentLocator();
    this.emit(ReaderEvent.TrackChanged, {
      previous: previousLocator,
      current: currentLocator,
    });
    this.getTimelineModule()?.onTrackChanged();
    this.emit(ReaderEvent.DurationChanged, {
      duration: this.engine.duration,
      locator: currentLocator,
    });
    this.getTimelineModule()?.onDurationChanged();

    if (this.mediaSession) {
      this.mediaSession.refreshMetadata();
      this.mediaSession.refreshPositionState();
    }

    this.flushReadingPositionSave();

    if (wasPlaying) {
      await this.play();
    }
  }

  /**
   * Wait for the persistent engine to reach a playable state on its
   * current source. Resolves on the next `canplay`, rejects on the next
   * `error`.
   *
   * If a newer `goTrack` lands while we wait, its bumped `navigationId`
   * is detected via the supersession timer and we silently resolve —
   * the newer call will run its own `waitForCanPlay` against the new
   * source. Replaces the old `activating` promise gate that could hang
   * forever when a load stalled.
   */
  private waitForCanPlay(navId: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Fast path — already playable.
      if (this.engine.metadata.readyState >= AudioReadyState.HaveFutureData) {
        resolve();
        return;
      }
      const cleanup = (): void => {
        clearInterval(superTimer);
        this.engine.off("canplay", onCanPlay);
        this.engine.off("error", onError);
      };
      const onCanPlay = (): void => {
        cleanup();
        resolve();
      };
      const onError = (payload: AudioEngineEventMap["error"]): void => {
        cleanup();
        reject(payload);
      };
      const superTimer = setInterval(() => {
        if (navId !== this.navigationId || this.stopped) {
          cleanup();
          resolve();
        }
      }, 100);
      this.engine.on("canplay", onCanPlay);
      this.engine.on("error", onError);
    });
  }

  /**
   * Public host method — modules call this to hint the navigator to
   * warm a specific resource. Used by the timeline module while the
   * user drags the whole-book scrubber across chapter boundaries:
   * each time the cursor crosses into a new chapter, the chapter is
   * prefetched so the post-release seek lands without the cold-fetch
   * delay. Out-of-range indices and already-cached resources silently
   * no-op via the pool's own deduplication.
   */
  prefetchResource(index: number): void {
    if (this.stopped) return;
    this.pool.prefetchAt(index);
  }

  /**
   * Push a single settings field change into the persistent engine.
   * Called by the `settings.onChange` listener. Initial sync runs in
   * `attachEngineListeners` (no event emission needed).
   *
   * `skipForwardInterval`, `skipBackwardInterval`, `pollInterval`,
   * `autoPlay`, and `enableMediaSession` aren't engine-state — they're
   * read live at consumption sites or wired separately.
   */
  private applySettingToEngine(key: AudiobookSettingsKey): void {
    if (key === "volume") {
      this.engine.volume = this.settings.volume;
    } else if (key === "playbackRate") {
      this.engine.playbackRate = this.settings.playbackRate;
      this.emit(ReaderEvent.PlaybackRateChanged, {
        rate: this.settings.playbackRate,
      });
      // Lock-screen scrubber animates client-side from playbackRate;
      // re-push so it stays accurate after a rate change.
      this.mediaSession?.refreshPositionState();
    } else if (key === "preservePitch") {
      this.engine.preservesPitch = this.settings.preservePitch;
    }
  }

  /**
   * Bring `mediaSession` in line with `settings.enableMediaSession`.
   * Called from constructor (initial setup) and from the
   * settings.onChange listener (runtime toggle). Idempotent.
   */
  private applyMediaSessionSetting(): void {
    const enabled = this.settings.enableMediaSession;
    if (enabled && !this.mediaSession) {
      this.mediaSession = MediaSessionController.create({
        publication: this.publication,
        currentIndex: () => this.currentIndex,
        currentTime: () => this.currentTime,
        duration: () => this.duration,
        playbackRate: () => this.settings.playbackRate,
        skipBackwardInterval: () => this.settings.skipBackwardInterval,
        skipForwardInterval: () => this.settings.skipForwardInterval,
        play: () => void this.play(),
        pause: () => this.pause(),
        previousChapter: () => void this.goBackward(),
        nextChapter: () => void this.goForward(),
        seek: (seconds) => this.seek(seconds),
        jump: (seconds) => this.jump(seconds),
      });
      // Initial state push so the OS shows current track + paused/playing
      // immediately, not after the first user action.
      if (this.mediaSession) {
        if (this.isPlaying) this.mediaSession.setPlaying();
        else this.mediaSession.setPaused();
      }
    } else if (!enabled && this.mediaSession) {
      this.mediaSession.destroy();
      this.mediaSession = null;
    }
  }

  /**
   * Update the waiting state and emit `PlaybackWaiting` only on an
   * actual edge — repeated identical sets are dropped so subscribers
   * don't see noise. State changes are: engine `waiting` (true if not
   * paused), engine `playing` / `canplay` (false), engine `pause` /
   * `ended` / `error` (false), and explicit cross-track navigation
   * (true at the start when the user was playing).
   */
  private setWaiting(value: boolean): void {
    if (this._isWaiting === value) return;
    this._isWaiting = value;
    this.emit(ReaderEvent.PlaybackWaiting, {
      waiting: value,
      locator: this.currentLocator(),
    });
  }

  /**
   * Wire engine events to navigator emits. Runs ONCE in the constructor;
   * the persistent engine never goes away so listeners stay live for the
   * navigator's full lifetime. Cleanup happens via `engine.destroy()` in
   * `stop()` — no manual unsubscribe needed.
   *
   * Every listener checks `isNavigating` and bails early when a track
   * transition is in flight. The engine fires transient pause / timeupdate
   * events between `engine.pause()` and the new src reaching `canplay`;
   * forwarding those to subscribers would flash the UI through wrong
   * states (paused → playing → paused) mid-transition.
   */
  private attachEngineListeners(): void {
    const engine = this.engine;
    // Initial settings push so the engine starts in sync with user prefs.
    // Otherwise rate / volume / pitch sit at engine defaults until the
    // user touches a setting.
    engine.volume = this.settings.volume;
    engine.playbackRate = this.settings.playbackRate;
    engine.preservesPitch = this.settings.preservePitch;

    engine.on("play", (payload) => {
      if (this.isNavigating) return;
      this.emit(ReaderEvent.PlaybackStarted, {
        locator: this.currentLocator(),
        currentTime: payload.currentTime,
      });
      this.mediaSession?.setPlaying();
    });
    // `playing` fires only when audio output actually begins (after
    // paused→play or waiting→play). That's THE signal that the
    // user-visible spinner should go away. The "play" event above
    // can fire before bytes are available and is not a reliable
    // "we're audible" indicator.
    engine.on("playing", () => {
      if (this.isNavigating) return;
      this.setWaiting(false);
    });
    // Browser fires `waiting` when playback halts because more data
    // is needed. Same spinner UI as the cross-chapter case below.
    engine.on("waiting", () => {
      if (this.isNavigating) return;
      if (engine.paused) return;
      this.setWaiting(true);
    });
    // canplay during steady-state (not a navigation) means a
    // previously-buffer-starved track has caught up.
    engine.on("canplay", () => {
      if (this.isNavigating) return;
      this.setWaiting(false);
    });
    engine.on("pause", (payload) => {
      if (this.isNavigating) return;
      this.setWaiting(false);
      this.emit(ReaderEvent.PlaybackPaused, {
        locator: this.currentLocator(),
        currentTime: payload.currentTime,
      });
      this.mediaSession?.setPaused();
    });
    engine.on("ended", () => {
      if (this.isNavigating) return;
      this.setWaiting(false);
      this.emit(ReaderEvent.PlaybackEnded, { locator: this.currentLocator() });
      // Sleep timer in end-of-chapter mode wins over autoPlay-advance.
      // The timer fires its onExpire (which pauses) and we bail before
      // the advance branch.
      if (this.sleepTimer.notifyChapterEnded()) return;
      if (!this.canGoForward) return;
      // Advance to the next resource. Play continues only when
      // `settings.autoPlay` is true — matches Readium ts-toolkit.
      // With autoPlay=false the user lands on the next chapter paused.
      void (async () => {
        await this.goTrack(this.currentIndex + 1, 0);
        if (this.settings.autoPlay) {
          await this.play();
        }
      })();
    });
    engine.on("timeupdate", (payload) => {
      if (this.isNavigating) return;
      const tickPayload = {
        locator: this.currentLocator(),
        currentTime: payload.currentTime,
        duration: payload.duration,
      };
      this.emit(ReaderEvent.TimeUpdated, tickPayload);
      this.getTimelineModule()?.onTimeUpdate();
      this.getCommentsModule()?.onTimeUpdate(tickPayload);
      this.scheduleReadingPositionSave();
    });
    engine.on("stalled", (payload) => {
      if (this.isNavigating) return;
      this.emit(ReaderEvent.PlaybackStalled, {
        locator: this.currentLocator(),
        currentTime: payload.currentTime,
      });
    });
    engine.on("error", (payload) => {
      if (this.isNavigating) return;
      this.setWaiting(false);
      this.emit(ReaderEvent.PlaybackError, {
        // Surface the structured AudioEngineError as the `error` field;
        // integrators can introspect kind / retryable / cause / message.
        error: payload,
        locator: this.currentLocator(),
      });
    });
  }
}
