/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { Publication, Link } from "../../model/v3";

/**
 * MediaSessionController — wires the browser's Media Session API to an
 * AudiobookNavigator's playback. Lock-screen / notification-shade
 * controls, OS media-key routing, and Bluetooth headset buttons (next
 * track / play-pause) all flow through here.
 *
 * Beyond Readium ts-toolkit's Media Session integration we add:
 * - `setActionHandler("seekto")` so the lock-screen scrubber works
 * - `setPositionState()` so the lock-screen timeline is accurate (not
 *   stuck at 0 or unknown)
 * - `playbackState` so the OS shows the correct play/pause icon
 *
 * Lifecycle: created via `MediaSessionController.create(navigator)`,
 * which returns `null` when the browser lacks Media Session support
 * (older Safari, all of IE). When the controller is null the navigator
 * skips wiring and Media Session features are inert — no per-call
 * branches sprinkled through the codebase.
 *
 * The controller subscribes to navigator-level callbacks (`hooks`),
 * not engine events directly — so chapter swaps are transparent
 * (engines come and go; the navigator stays put).
 */

/**
 * The navigator surface the controller depends on. Decoupled so the
 * controller can be tested without spinning up a full navigator and so
 * we don't accidentally widen the public navigator API surface.
 */
export interface MediaSessionNavigatorHooks {
  /** Used to derive title/artist/album/cover. */
  publication: Publication;
  /** Active resource index — drives metadata title selection. */
  currentIndex(): number;
  /** Current playback time in seconds — drives `setPositionState.position`. */
  currentTime(): number;
  /** Active resource duration in seconds — drives `setPositionState.duration`. */
  duration(): number;
  /** Current playback rate — drives `setPositionState.playbackRate`. */
  playbackRate(): number;
  /** Configured skip-back interval — used as `seekOffset` default. */
  skipBackwardInterval(): number;
  /** Configured skip-forward interval — used as `seekOffset` default. */
  skipForwardInterval(): number;

  // Action callbacks — invoked from Media Session handlers.
  play(): void;
  pause(): void;
  previousChapter(): void;
  nextChapter(): void;
  seek(seconds: number): void;
  jump(seconds: number): void;
}

export class MediaSessionController {
  private readonly hooks: MediaSessionNavigatorHooks;
  private destroyed = false;

  /**
   * Returns a controller, or `null` if Media Session is unsupported.
   * Callers should bail without registering any teardown when null is
   * returned.
   */
  static create(
    hooks: MediaSessionNavigatorHooks
  ): MediaSessionController | null {
    if (typeof navigator === "undefined") return null;
    if (!("mediaSession" in navigator)) return null;
    return new MediaSessionController(hooks);
  }

  private constructor(hooks: MediaSessionNavigatorHooks) {
    this.hooks = hooks;
    this.installActionHandlers();
    this.refreshMetadata();
  }

  /**
   * Update the OS-shown metadata (title, artist, album, cover artwork).
   * Call on track change. Cheap, but only worth calling on a real
   * change — not on every `timeupdate`.
   */
  refreshMetadata(): void {
    if (this.destroyed) return;
    // Cosmetic OS-shown metadata. Wrapped because a browser quirk
    // (missing `MediaMetadata` global on iOS standalone, missing
    // `name.getTranslation` on a partial publication, malformed cover
    // URL, etc.) must NEVER kill the activate() chain — playback is
    // more important than the lock-screen title.
    try {
      const pub = this.hooks.publication;
      const trackIndex = this.hooks.currentIndex();
      const track = pub.readingOrder[trackIndex];

      const title = track?.title || `Track ${trackIndex + 1}`;
      const artist = pub.metadata?.authors?.items
        ?.map((a) => a.name?.getTranslation?.() ?? "")
        ?.filter((s) => s.length > 0)
        ?.join(", ");
      const album = pub.metadata?.title?.getTranslation?.();
      const artwork = this.resolveArtwork();

      if (typeof MediaMetadata === "undefined") return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: artist || undefined,
        album: album || undefined,
        artwork,
      });
    } catch {
      // Best-effort — swallow so playback is unaffected.
    }
  }

  /**
   * Push playback position to the OS. Call on play, pause, seek,
   * playbackRate change, and track change — NOT on every `timeupdate`.
   * The lock-screen scrubber animates client-side from `playbackRate`
   * between updates.
   */
  refreshPositionState(): void {
    if (this.destroyed) return;
    if (!("setPositionState" in navigator.mediaSession)) return;
    // setPositionState throws InvalidStateError on subtle spec
    // violations (position > duration, NaN, negative). Clamping
    // covers most cases but browser quirks remain — wrap so a single
    // throw can't kill the navigator's seek/activate chain.
    try {
      const duration = this.hooks.duration();
      const position = this.hooks.currentTime();
      const playbackRate = this.hooks.playbackRate();

      if (!Number.isFinite(duration) || duration <= 0) {
        navigator.mediaSession.setPositionState();
        return;
      }
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(0, position), duration),
        playbackRate:
          Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
      });
    } catch {
      // Best-effort — swallow so playback is unaffected.
    }
  }

  /** Tell the OS we're playing — flips lock-screen icon to pause. */
  setPlaying(): void {
    if (this.destroyed) return;
    navigator.mediaSession.playbackState = "playing";
    this.refreshPositionState();
  }

  /** Tell the OS we're paused — flips lock-screen icon to play. */
  setPaused(): void {
    if (this.destroyed) return;
    navigator.mediaSession.playbackState = "paused";
    this.refreshPositionState();
  }

  /** Tell the OS we're idle (post-stop / pre-load). */
  setIdle(): void {
    if (this.destroyed) return;
    navigator.mediaSession.playbackState = "none";
  }

  /**
   * Tear down. Clears handlers + metadata + position state so the OS
   * stops showing our session. Idempotent.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
    if ("setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState();
      } catch {
        // Some browsers throw if already cleared; best-effort.
      }
    }
    for (const action of ALL_ACTIONS) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Older browsers throw on unsupported actions; ignore.
      }
    }
  }

  // ── Internals ─────────────────────────────────────────────────

  private installActionHandlers(): void {
    const ms = navigator.mediaSession;

    // Each handler is wrapped in setActionHandler in a try/catch so an
    // unsupported action (e.g., "seekto" on older browsers) doesn't
    // poison the rest. Browser support varies per action.
    this.safeSet("play", () => this.hooks.play());
    this.safeSet("pause", () => this.hooks.pause());
    this.safeSet("previoustrack", () => this.hooks.previousChapter());
    this.safeSet("nexttrack", () => this.hooks.nextChapter());

    this.safeSet("seekbackward", (details) => {
      const offset = details.seekOffset ?? this.hooks.skipBackwardInterval();
      this.hooks.jump(-offset);
    });
    this.safeSet("seekforward", (details) => {
      const offset = details.seekOffset ?? this.hooks.skipForwardInterval();
      this.hooks.jump(offset);
    });

    // Lock-screen scrubber. fastSeek is a hint from the OS to use a
    // lower-quality but quicker seek; we don't differentiate but the
    // spec wants us to honour it if we can. We just seek — same path.
    this.safeSet("seekto", (details) => {
      const seekTime = details.seekTime;
      if (seekTime === undefined || seekTime === null) return;
      this.hooks.seek(seekTime);
    });

    void ms; // silence unused-var when no actions install
  }

  private safeSet(
    action: MediaSessionAction,
    handler: MediaSessionActionHandler
  ): void {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Action not supported by this browser — silent skip.
    }
  }

  private resolveArtwork(): MediaImage[] | undefined {
    const cover = findCoverLink(this.hooks.publication);
    if (!cover?.href) return undefined;
    const baseUrl = this.hooks.publication.manifestUrl;
    let url: string;
    try {
      url = new URL(cover.href, baseUrl).href;
    } catch {
      url = cover.href;
    }
    return [
      {
        src: url,
        type: cover.type,
      },
    ];
  }
}

const ALL_ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "previoustrack",
  "nexttrack",
  "seekbackward",
  "seekforward",
  "seekto",
];

/**
 * Find the publication's cover link. Mirrors Readium's getCover():
 * search readingOrder → resources → links for the first link with
 * `rel="cover"`. Returns undefined if none found (no artwork shown).
 */
function findCoverLink(pub: Publication): Link | undefined {
  const sources: Link[][] = [
    pub.readingOrder ?? [],
    pub.resources ?? [],
    pub.links ?? [],
  ];
  for (const links of sources) {
    for (const link of links) {
      if (link.rels?.has("cover")) return link;
    }
  }
  return undefined;
}
