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

import type {
  AudioEngineError,
  AudioMetadata,
  AudioSource,
  TimeRange,
} from "./AudioTypes";

/**
 * Pluggable audio engine interface for the AudiobookNavigator.
 *
 * One engine is created per navigator lifetime (via the configured
 * `EngineFactory`) and reused across every track in the publication. The
 * navigator drives track transitions through `changeSrc(source)` — the
 * underlying media element / source node is never swapped. This keeps the
 * RemotePlayback session, MediaSession metadata, and event listener wiring
 * intact across navigation and matches Readium's `WebAudioEngine` pattern.
 *
 * The default implementation is `WebAudioEngine` (HTMLAudioElement with a
 * lazy Web Audio graph for pitch preservation). Future engines (DRM, HLS,
 * vendor SDKs) plug in through `EngineFactory` and handle their own source
 * kinds in `changeSrc`.
 *
 * All time values are in seconds. Engines wrapping millisecond-based SDKs
 * convert at this boundary.
 */

/**
 * Event names emitted by every `AudioEngine` implementation. The set is
 * deliberately small — implementations normalize their underlying media
 * surface to these names. New cross-cutting events go here; engine-internal
 * detail does not.
 */
export type AudioEngineEvent =
  | "loadedmetadata"
  | "metadatachanged"
  | "canplay"
  | "play"
  | "playing"
  | "pause"
  | "ended"
  | "timeupdate"
  | "seeking"
  | "seeked"
  | "stalled"
  | "waiting"
  | "bufferedchanged"
  | "seekablechanged"
  | "error";

/**
 * Payload shapes per event. Every payload carries the engine's
 * just-changed state at emission time so listeners don't need to query
 * back. Snapshot accessors (`buffered`, `seekable`, `metadata`) remain
 * available for one-off reads.
 */
export interface AudioEngineEventMap {
  loadedmetadata: AudioMetadata;
  metadatachanged: AudioMetadata;
  canplay: { duration: number };
  play: { currentTime: number };
  playing: { currentTime: number };
  pause: { currentTime: number };
  ended: { currentTime: number };
  timeupdate: { currentTime: number; duration: number };
  seeking: { currentTime: number };
  seeked: { currentTime: number };
  stalled: { currentTime: number };
  waiting: { currentTime: number };
  bufferedchanged: { ranges: TimeRange[] };
  seekablechanged: { ranges: TimeRange[] };
  error: AudioEngineError;
}

export type AudioEngineEventHandler<E extends AudioEngineEvent> = (
  payload: AudioEngineEventMap[E]
) => void;

/**
 * The contract every engine implementation satisfies. The
 * AudiobookNavigator depends on this interface exclusively — no concrete
 * engine type leaks past this boundary.
 *
 * Implementations are responsible for:
 * - reading state (`currentTime`, `duration`, `buffered`, etc.) live from
 *   the underlying source — no caching at the engine boundary
 * - keeping `playbackRate` and `preservesPitch` coordinated internally
 *   when the underlying media APIs split them across multiple properties
 * - emitting `bufferedchanged` / `seekablechanged` only when ranges
 *   actually change, not on every browser-internal tick
 * - tearing down all internal listeners and references in `destroy()`
 *   before resolving its promise (or returning, for sync implementations)
 */
export interface AudioEngine {
  /**
   * Point the engine at a new audio source. Does NOT swap the underlying
   * media element — same element, new `src`. Preserves the RemotePlayback
   * session, MediaSession bindings, attached event listeners, and (when
   * activated) the Web Audio graph. Called by the pool on every track
   * change.
   *
   * No-ops if the source URL already matches the current one. Returns
   * synchronously; load progress is observable via `loadedmetadata` /
   * `canplay` / `error` events.
   */
  changeSrc(source: AudioSource): void;

  /** Begin playback. Resolves once playback has actually started. */
  play(): Promise<void>;

  /** Pause playback. */
  pause(): void;

  /** Pause and rewind to start. */
  stop(): void;

  /** Seek to the given time in seconds. */
  seek(seconds: number): void;

  // ── Snapshot state ──────────────────────────────────────────
  // All read live from the underlying source; no caching.

  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;

  /** Buffered time ranges (snapshot). Subscribe to `bufferedchanged` for updates. */
  readonly buffered: TimeRange[];
  /** Seekable time ranges (snapshot). Subscribe to `seekablechanged` for updates. */
  readonly seekable: TimeRange[];
  /** Media metadata snapshot. Subscribe to `metadataloaded` / `metadatachanged` for updates. */
  readonly metadata: AudioMetadata;
  /**
   * Whether the engine currently routes through a Web Audio graph (for
   * pitch preservation or similar). `false` for the default fast path.
   * Pool reads this to match `crossOrigin` on its prefetch elements so
   * cached HTTP responses are reusable when the engine loads them.
   */
  readonly isWebAudioActive: boolean;

  // ── Mutable parameters ──────────────────────────────────────

  /**
   * Playback rate multiplier (1.0 = normal). Implementations MUST keep
   * `preservesPitch` honored — setting `playbackRate` while `preservesPitch`
   * is true must apply the engine's pitch-preservation pipeline.
   */
  playbackRate: number;
  /** Whether the engine preserves pitch under non-1.0 playback rates. */
  preservesPitch: boolean;
  /** Volume in [0, 1]. */
  volume: number;
  /** Muted state (independent of volume). */
  muted: boolean;

  // ── Events ──────────────────────────────────────────────────

  on<E extends AudioEngineEvent>(
    event: E,
    handler: AudioEngineEventHandler<E>
  ): void;

  off<E extends AudioEngineEvent>(
    event: E,
    handler: AudioEngineEventHandler<E>
  ): void;

  /**
   * Tear down. After destroy resolves, the engine MUST NOT emit further
   * events. Async to accommodate engines whose cleanup involves SDK
   * teardown, license session release, manifest unsubscribe, etc.
   * Calling `destroy()` more than once is a no-op (idempotent).
   */
  destroy(): void | Promise<void>;
}
