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

/**
 * Shared types at the audio-engine boundary. Defined here (not re-using
 * DOM types directly) so the engine surface is decoupled from the
 * browser's media APIs. Every consumer downstream — pool, navigator,
 * viewer — sees only these types.
 */

/**
 * Where the engine pulls audio bytes from. Discriminated union so future
 * engines (DRM, HLS, vendor SDKs) can carry their own configuration without
 * widening every existing engine's contract.
 *
 * Default `WebAudioEngine` only handles `kind: "url"`. Other kinds require
 * an integrator-supplied `EngineFactory` (see EngineFactory.ts).
 */
export type AudioSource =
  | { kind: "url"; url: string }
  | {
      kind: "drm";
      url: string;
      /** Per-resource license URL, if different from a global one. */
      licenseUrl?: string;
      /** Pre-fetched key-by-keyID map, for offline / pre-licensed playback. */
      keys?: Record<string, string>;
    }
  | {
      kind: "hls";
      manifestUrl: string;
      /** Authorization header value to use for manifest + segment requests. */
      auth?: string;
    }
  | {
      kind: "vendor";
      vendorId: string;
      resourceId: string;
      /** Vendor-specific opaque config. Engine validates. */
      config?: unknown;
    };

/**
 * Half-open time range, in seconds. `start <= end`. Used for `buffered` and
 * `seekable` snapshots so we don't leak DOM `TimeRanges` into the engine
 * surface.
 */
export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Mirrors the W3C `HTMLMediaElement.readyState` constants. Numeric values
 * intentionally match the spec so implementations can pass through the
 * underlying browser value without translation.
 *
 * https://html.spec.whatwg.org/multipage/media.html#dom-media-readystate
 */
export enum AudioReadyState {
  HaveNothing = 0,
  HaveMetadata = 1,
  HaveCurrentData = 2,
  HaveFutureData = 3,
  HaveEnoughData = 4,
}

/**
 * Mirrors the W3C `HTMLMediaElement.networkState` constants. Numeric values
 * intentionally match the spec so implementations can pass through the
 * underlying browser value without translation.
 *
 * https://html.spec.whatwg.org/multipage/media.html#dom-media-networkstate
 */
export enum AudioNetworkState {
  Empty = 0,
  Idle = 1,
  Loading = 2,
  NoSource = 3,
}

/**
 * Aliased re-exports of the DOM `TextTrack` enums. We use the same string
 * unions because they are stable web standards; aliasing decouples our
 * type names from the DOM ones in case we ever want to diverge.
 */
export type AudioTextTrackMode = TextTrackMode;
export type AudioTextTrackKind = TextTrackKind;

/**
 * A text track attached to an audio resource (subtitles, captions, chapter
 * markers, transcripts, etc.). Wraps the standard browser `TextTrack` so
 * consumers don't need to import DOM types.
 */
export interface AudioTextTrack {
  /** URL of the track resource (`.vtt` etc.), if known. May be empty for in-band tracks. */
  src: string;
  kind: AudioTextTrackKind;
  label: string;
  /** BCP 47 language tag. Empty when the track has no declared language. */
  language: string;
  mode: AudioTextTrackMode;
}

/**
 * Snapshot of media metadata exposed by the engine. Read live from the
 * underlying source on every property access — no caching. Subscribe to
 * `metadataloaded` (initial) and `metadatachanged` (subsequent) events
 * to react to changes.
 */
export interface AudioMetadata {
  /** Duration in seconds. May be `Infinity` for live streams. */
  duration: number;
  textTracks: AudioTextTrack[];
  readyState: AudioReadyState;
  networkState: AudioNetworkState;
}

/**
 * Categorizes engine errors so the pool / navigator can decide between
 * retry, fall-through, and surfacing to the integrator. The `unknown` kind
 * is the catch-all for errors that don't map to the named categories.
 */
export type AudioEngineErrorKind =
  | "network"
  | "decode"
  | "drm"
  | "notfound"
  | "unknown";

/**
 * Structured error fired by the `error` engine event. After this event,
 * the engine is in a terminal state — calls to `play()` / `seek()` /
 * etc. are undefined behavior. The pool MUST evict and create a fresh
 * engine for the same source if recovery is needed.
 *
 * `retryable: true` means the same source may succeed on a second
 * attempt (transient network error, decoder hiccup). `retryable: false`
 * means the source is permanently unusable in this engine and the pool
 * should mark it as bad to skip prefetch.
 */
export interface AudioEngineError {
  message: string;
  cause?: unknown;
  kind: AudioEngineErrorKind;
  retryable: boolean;
}
