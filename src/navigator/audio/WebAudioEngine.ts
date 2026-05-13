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

import EventEmitter from "eventemitter3";
import {
  AudioEngine,
  AudioEngineEvent,
  AudioEngineEventHandler,
  AudioEngineEventMap,
} from "./AudioEngine";
import {
  AudioMetadata,
  AudioNetworkState,
  AudioReadyState,
  AudioSource,
  AudioTextTrack,
  TimeRange,
} from "./AudioTypes";
import {
  PRESERVE_PITCH_PROCESSOR_NAME,
  SetPitchFactorMessage,
} from "./PreservePitchProcessor";
import type { EngineFactory } from "./EngineFactory";

/**
 * Default audio engine for the AudiobookNavigator.
 *
 * One element, one lifetime, lazy Web Audio.
 *
 * Architecture mirrors Readium ts-toolkit's `WebAudioEngine`:
 *
 *   - A single persistent `HTMLAudioElement` is created in the constructor
 *     and reused for the engine's entire lifetime. Track changes go through
 *     `changeSrc(source)` — the element is never swapped. This preserves
 *     the RemotePlayback session, MediaSession bindings, and the attached
 *     event listeners across navigation.
 *
 *   - The default playback path is **plain HTMLMediaElement** with no
 *     Web Audio graph, no `crossOrigin`, no AudioContext. The browser
 *     handles streaming, byte-range, buffering, and seeking natively.
 *
 *   - The Web Audio graph (MediaElementAudioSourceNode → GainNode →
 *     destination, optionally with the preserve-pitch worklet inserted
 *     between source and gain) is activated **lazily and only when
 *     needed** — that means: when `setPlaybackRate(rate, preservePitch=true)`
 *     is called on a browser that lacks native `HTMLMediaElement.preservesPitch`.
 *     On modern Chromium, Firefox, and Safari (≥ 13.1) the native attribute
 *     handles pitch preservation and the graph never activates.
 *
 *   - Graph activation reloads the element with `crossOrigin="anonymous"`.
 *     If the new source's server does not send `Access-Control-Allow-Origin`,
 *     the engine rolls back to non-CORS mode — playback continues,
 *     pitch correction is silently disabled for that source.
 *
 *   - Volume routing is graph-aware: with the graph inactive, `element.volume`
 *     carries the level. With the graph active, the element is forced to
 *     1.0 and the `GainNode` carries the level — avoids the
 *     `0.5 × 0.5 = 0.25` double-attenuation trap.
 *
 * This shape is what Readium ts-toolkit (`navigator/src/audio/engine/WebAudioEngine.ts`)
 * ships and what their reference player at https://playground.readium.org
 * uses to stream LibriVox audiobooks. Adopting it makes streaming feel
 * fast (the default path is the native browser audio path with no Web Audio
 * latency) while preserving the worklet as the fallback path for any browser
 * that lacks native pitch preservation.
 */

/**
 * Construction-time configuration. Empty by default — the worklet URL
 * is only consulted if the engine falls back to the worklet path, which
 * is rare on modern browsers.
 */
export interface WebAudioEngineConfig {
  /**
   * URL of the deployed `PreservePitchProcessor.js` AudioWorklet module.
   * Only consulted when the engine falls back to the worklet path
   * (`setPlaybackRate(rate, preservePitch=true)` on a browser whose
   * `HTMLMediaElement` lacks the `preservesPitch` property). On Chromium /
   * Firefox / Safari ≥ 13.1 the native property handles pitch and this
   * URL is never read. When omitted AND the worklet fallback is reached,
   * the engine logs a warning and plays without pitch correction.
   */
  preservePitchWorkletUrl?: string | URL;
}

export class WebAudioEngine implements AudioEngine {
  private readonly element: HTMLAudioElement;
  private readonly emitter = new EventEmitter();
  private readonly elementListeners = new Map<string, EventListener>();

  // Web Audio graph — all lazy. `null` in the default fast path.
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletReady: Promise<void> | null = null;
  private webAudioActive = false;

  private readonly preservePitchWorkletUrl?: string | URL;
  private currentSrc = "";
  private destroyed = false;
  private _preservesPitch = true;
  private _muted = false;
  private _volume = 1;

  constructor(config: WebAudioEngineConfig = {}) {
    this.preservePitchWorkletUrl = config.preservePitchWorkletUrl;
    this.element = new Audio();
    // `preload="auto"` so the browser eagerly buffers audio data
    // (not just metadata). Seeks within the current track land in the
    // browser's cache instead of paying a fresh CDN fetch each time.
    // Cost is a few MB of speculative download per active source,
    // bounded by the pool's prefetch range.
    this.element.preload = "auto";
    // No `crossOrigin` here — set lazily by `activateWebAudio()` only
    // when MediaElementAudioSourceNode needs to read element samples.
    // Avoiding it on the default path means no CORS preflight, which is
    // what lets streaming feel responsive.
    // No `src` either — that's `changeSrc()`'s job.
    this.wireElementEvents();
  }

  /**
   * Point the persistent element at a new source. No element swap, no
   * graph teardown (unless CORS rollback is needed). Pool calls this on
   * every track change.
   */
  changeSrc(source: AudioSource): void {
    if (this.destroyed) return;
    if (source.kind !== "url") {
      throw new Error(
        `WebAudioEngine: unsupported source kind "${source.kind}"; ` +
          `only "url" is handled. Register an EngineFactory for this kind.`
      );
    }
    const href = source.url;
    if (href === this.currentSrc) return;
    this.element.pause();
    this.currentSrc = href;

    if (this.webAudioActive) {
      // Graph is active — reload with CORS so MediaElementAudioSourceNode
      // can keep reading samples. If the new source's host doesn't allow
      // CORS, fall through to non-CORS mode and tear down the graph
      // (playback continues, pitch correction silently lost).
      this.element.crossOrigin = "anonymous";
      this.element.src = href;
      this.element.load();

      const onReady = (): void => cleanup();
      const onFail = (): void => {
        cleanup();
        console.warn(
          "WebAudioEngine: CORS reload failed on changeSrc — tearing down Web Audio graph for this source"
        );
        this.tearDownWebAudio();
        this.element.removeAttribute("crossorigin");
        this.element.src = href;
        this.element.load();
      };
      const cleanup = (): void => {
        this.element.removeEventListener("canplaythrough", onReady);
        this.element.removeEventListener("error", onFail);
      };
      this.element.addEventListener("canplaythrough", onReady, { once: true });
      this.element.addEventListener("error", onFail, { once: true });
    } else {
      // Default fast path — plain HTML5 audio.
      this.element.src = href;
      this.element.load();
    }
  }

  // ── Element event forwarding ─────────────────────────────────

  private wireElementEvents(): void {
    const forward = <E extends AudioEngineEvent>(
      domEvent: string,
      engineEvent: E,
      buildPayload: () => AudioEngineEventMap[E]
    ): void => {
      const handler: EventListener = () => {
        if (this.destroyed) return;
        this.emitter.emit(engineEvent, buildPayload());
      };
      this.element.addEventListener(domEvent, handler);
      this.elementListeners.set(`${domEvent}:${engineEvent}`, handler);
    };

    forward("loadedmetadata", "loadedmetadata", () => this.metadata);
    forward("loadedmetadata", "metadatachanged", () => this.metadata);
    forward("loadedmetadata", "seekablechanged", () => ({
      ranges: this.seekable,
    }));
    forward("durationchange", "metadatachanged", () => this.metadata);
    forward("canplay", "canplay", () => ({ duration: this.duration }));
    forward("play", "play", () => ({ currentTime: this.currentTime }));
    forward("playing", "playing", () => ({ currentTime: this.currentTime }));
    forward("pause", "pause", () => ({ currentTime: this.currentTime }));
    forward("ended", "ended", () => ({ currentTime: this.currentTime }));
    forward("timeupdate", "timeupdate", () => ({
      currentTime: this.currentTime,
      duration: this.duration,
    }));
    forward("seeking", "seeking", () => ({ currentTime: this.currentTime }));
    forward("seeked", "seeked", () => ({ currentTime: this.currentTime }));
    forward("stalled", "stalled", () => ({ currentTime: this.currentTime }));
    forward("waiting", "waiting", () => ({ currentTime: this.currentTime }));
    forward("progress", "bufferedchanged", () => ({ ranges: this.buffered }));

    const errorHandler: EventListener = () => {
      if (this.destroyed) return;
      this.emitter.emit("error", this.translateMediaError());
    };
    this.element.addEventListener("error", errorHandler);
    this.elementListeners.set("error:error", errorHandler);
  }

  private translateMediaError(): AudioEngineEventMap["error"] {
    const err = this.element.error;
    if (!err) {
      return {
        message: "Unknown audio error",
        kind: "unknown",
        retryable: false,
      };
    }
    switch (err.code) {
      case 1:
        return {
          message: err.message || "Audio fetch aborted",
          kind: "network",
          cause: err,
          retryable: true,
        };
      case 2:
        return {
          message: err.message || "Audio network error",
          kind: "network",
          cause: err,
          retryable: true,
        };
      case 3:
        return {
          message: err.message || "Audio decode error",
          kind: "decode",
          cause: err,
          retryable: false,
        };
      case 4:
        return {
          message: err.message || "Audio source not supported",
          kind: "notfound",
          cause: err,
          retryable: false,
        };
      default:
        return {
          message: err.message || `Audio error code ${err.code}`,
          kind: "unknown",
          cause: err,
          retryable: false,
        };
    }
  }

  // ── Playback control ────────────────────────────────────────

  async play(): Promise<void> {
    if (this.destroyed) {
      throw new Error("WebAudioEngine: destroyed");
    }
    // Only ceremony the AudioContext if one exists. On the default fast
    // path it doesn't, and skipping the resume avoids the autoplay-policy
    // gesture requirement entirely.
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    try {
      await this.element.play();
    } catch (err) {
      // AbortError is expected when load() interrupts a pending play()
      // during navigation. The pause event already drove the UI to the
      // correct state — swallow so click handlers don't surface unhandled
      // rejections.
      if (err instanceof DOMException && err.name === "AbortError") return;
      throw err;
    }
  }

  pause(): void {
    if (this.destroyed) return;
    this.element.pause();
  }

  stop(): void {
    if (this.destroyed) return;
    this.element.pause();
    this.element.currentTime = 0;
  }

  seek(seconds: number): void {
    if (this.destroyed) return;
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.element.currentTime = seconds;
  }

  // ── Snapshot state ──────────────────────────────────────────

  get currentTime(): number {
    return this.element.currentTime;
  }

  get duration(): number {
    const dur = this.element.duration;
    return Number.isFinite(dur) ? dur : 0;
  }

  get paused(): boolean {
    return this.element.paused;
  }

  get ended(): boolean {
    return this.element.ended;
  }

  get buffered(): TimeRange[] {
    return WebAudioEngine.toTimeRanges(this.element.buffered);
  }

  get seekable(): TimeRange[] {
    return WebAudioEngine.toTimeRanges(this.element.seekable);
  }

  get metadata(): AudioMetadata {
    return {
      duration: this.duration,
      textTracks: WebAudioEngine.toAudioTextTracks(this.element.textTracks),
      readyState: this.element.readyState as AudioReadyState,
      networkState: this.element.networkState as AudioNetworkState,
    };
  }

  /** Whether the Web Audio graph is currently active (worklet fallback path). */
  get isWebAudioActive(): boolean {
    return this.webAudioActive;
  }

  /**
   * The underlying media element. Exposed so the pool can match
   * `crossOrigin` on prefetch elements (so cached HTTP responses are
   * reusable when the primary element loads the same href).
   */
  getMediaElement(): HTMLMediaElement {
    return this.element;
  }

  // ── Mutable parameters ──────────────────────────────────────

  get playbackRate(): number {
    return this.element.playbackRate;
  }
  set playbackRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.element.playbackRate = rate;
    this.applyPitchHandling();
  }

  get preservesPitch(): boolean {
    return this._preservesPitch;
  }
  set preservesPitch(value: boolean) {
    if (this._preservesPitch === value) return;
    this._preservesPitch = value;
    this.applyPitchHandling();
  }

  get volume(): number {
    return this._volume;
  }
  set volume(value: number) {
    if (!Number.isFinite(value)) return;
    this._volume = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }

  get muted(): boolean {
    return this._muted;
  }
  set muted(value: boolean) {
    if (this._muted === value) return;
    this._muted = value;
    this.applyVolume();
  }

  /**
   * Push the effective volume to wherever it currently lives. With the
   * graph inactive that's `element.volume`; with the graph active it's
   * `gainNode.gain.value` and the element is forced to 1.0 so the level
   * isn't applied twice.
   */
  private applyVolume(): void {
    const effective = this._muted ? 0 : this._volume;
    if (this.gainNode) {
      this.element.volume = 1;
      this.gainNode.gain.value = effective;
    } else {
      this.element.volume = effective;
    }
  }

  // ── Pitch handling ──────────────────────────────────────────

  /**
   * Coordinate pitch preservation with the current `playbackRate` and
   * `_preservesPitch` flag. Native first; lazy Web Audio + worklet
   * fallback only when native isn't available.
   *
   * Modern Chromium / Firefox / Safari ≥ 13.1 all expose
   * `HTMLMediaElement.preservesPitch`, so the worklet path almost never
   * fires in practice. It remains as the fallback Readium designed it
   * to be — playable on older browsers without losing pitch quality.
   */
  private applyPitchHandling(): void {
    if (this._preservesPitch) {
      if ("preservesPitch" in this.element) {
        // Native path — no Web Audio activation needed. Default for ~99%
        // of browsers in the field today.
        (this.element as HTMLMediaElement).preservesPitch = true;
        // If the worklet was previously attached (rare — would mean a
        // browser that lost native support mid-session), keep updating it
        // so its factor matches the new rate.
        this.sendPitchFactor();
      } else {
        // Fallback: activate the graph, attach the worklet, set factor.
        void this.activateWebAudio()
          .then(() => this.ensureWorklet())
          .then(() => this.sendPitchFactor())
          .catch((err) => {
            console.warn(
              "WebAudioEngine: pitch preservation unavailable — playing without:",
              err
            );
          });
      }
    } else {
      // Disable native pitch preservation if the attribute exists.
      if ("preservesPitch" in this.element) {
        (this.element as HTMLMediaElement).preservesPitch = false;
      }
      // If the worklet path is active, set factor to 1.0 (passthrough)
      // so playback continues at the new rate without pitch correction.
      this.sendPitchFactor();
    }
  }

  /**
   * Send the current pitch factor to the worklet, if attached. Factor
   * is `1/rate` when preserving (compensates for rate-induced shift),
   * `1.0` otherwise. No-op when the worklet isn't attached.
   */
  private sendPitchFactor(): void {
    if (!this.workletNode) return;
    const factor = this._preservesPitch
      ? 1 / Math.max(0.0625, this.element.playbackRate)
      : 1.0;
    const message: SetPitchFactorMessage = {
      type: "setPitchFactor",
      factor,
    };
    this.workletNode.port.postMessage(message);
  }

  // ── Web Audio graph (lazy) ──────────────────────────────────

  /**
   * Build the Web Audio graph for the current element. Idempotent (no-op
   * if already active). Requires reloading the element with
   * `crossOrigin="anonymous"` so MediaElementAudioSourceNode can read
   * its samples. On CORS failure, rolls the element back to non-CORS
   * mode and rethrows — caller can fall through to native playback
   * without pitch correction.
   */
  private async activateWebAudio(): Promise<void> {
    if (this.webAudioActive) return;
    if (!this.currentSrc) return;

    const wasPlaying = !this.element.paused;
    const previousTime = this.element.currentTime;
    if (wasPlaying) this.element.pause();

    this.element.crossOrigin = "anonymous";
    this.element.src = this.currentSrc;
    this.element.load();

    try {
      await waitForCanPlayOrError(this.element);
    } catch (err) {
      // Roll back: drop CORS, reload, restore previous play state.
      this.element.removeAttribute("crossorigin");
      this.element.src = this.currentSrc;
      this.element.load();
      if (wasPlaying) {
        await waitForCanPlay(this.element);
        this.element.currentTime = previousTime;
        try {
          await this.element.play();
        } catch {
          /* AbortError or autoplay denial — caller surfaced state. */
        }
      } else {
        this.element.currentTime = previousTime;
      }
      throw err;
    }

    // CORS reload succeeded — build the graph.
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    this.sourceNode = this.audioContext.createMediaElementSource(this.element);
    this.gainNode = this.audioContext.createGain();
    // Seed gain from the current element volume, then reset element to
    // 1.0 so the level isn't applied twice once `applyVolume()` starts
    // routing through the GainNode.
    this.gainNode.gain.value = this._muted ? 0 : this._volume;
    this.element.volume = 1;
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);
    this.webAudioActive = true;

    this.element.currentTime = previousTime;
    if (wasPlaying) {
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      try {
        await this.element.play();
      } catch {
        /* AbortError or autoplay denial. */
      }
    }
  }

  /**
   * Ensure the preserve-pitch worklet module is loaded and the node is
   * attached between `sourceNode` and `gainNode`. Requires the graph to
   * already be active (`activateWebAudio()` first). Throws if the worklet
   * URL was not supplied at construction.
   */
  private async ensureWorklet(): Promise<void> {
    if (this.workletNode) return;
    if (!this.webAudioActive || !this.audioContext) {
      throw new Error(
        "WebAudioEngine: activateWebAudio() must succeed before attaching the worklet"
      );
    }
    if (!this.preservePitchWorkletUrl) {
      throw new Error(
        "WebAudioEngine: preservePitchWorkletUrl was not supplied to the engine, " +
          "so the worklet fallback is unavailable on this browser"
      );
    }
    if (!this.workletReady) {
      const url =
        this.preservePitchWorkletUrl instanceof URL
          ? this.preservePitchWorkletUrl.href
          : this.preservePitchWorkletUrl;
      this.workletReady = this.audioContext.audioWorklet.addModule(url);
    }
    await this.workletReady;
    if (!this.audioContext || !this.sourceNode || !this.gainNode) return;
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      PRESERVE_PITCH_PROCESSOR_NAME
    );
    // Rewire: sourceNode → workletNode → gainNode → destination.
    try {
      this.sourceNode.disconnect();
    } catch {
      /* already disconnected */
    }
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.gainNode);
  }

  /**
   * Tear down the Web Audio graph and return the element to standalone
   * playback. Restores the level that was managed by the GainNode back
   * onto `element.volume`. Safe to call when the graph was never active
   * (no-op). Called on CORS rollback in `changeSrc`.
   */
  private tearDownWebAudio(): void {
    if (this.workletNode) {
      try {
        this.workletNode.port.close();
      } catch {
        /* port already closed */
      }
      try {
        this.workletNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.workletNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.sourceNode = null;
    }
    if (this.gainNode) {
      const restoredVolume = this.gainNode.gain.value;
      try {
        this.gainNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.gainNode = null;
      this.element.volume = this._muted ? 0 : restoredVolume;
    }
    this.webAudioActive = false;
  }

  // ── Events ──────────────────────────────────────────────────

  on<E extends AudioEngineEvent>(
    event: E,
    handler: AudioEngineEventHandler<E>
  ): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  off<E extends AudioEngineEvent>(
    event: E,
    handler: AudioEngineEventHandler<E>
  ): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  // ── Lifecycle ───────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.element.pause();
    for (const [key, handler] of this.elementListeners) {
      const domEvent = key.split(":")[0];
      this.element.removeEventListener(domEvent, handler);
    }
    this.elementListeners.clear();
    this.emitter.removeAllListeners();
    this.tearDownWebAudio();
    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        /* context already closed */
      }
      this.audioContext = null;
    }
    this.element.removeAttribute("src");
    this.element.load();
  }

  // ── Internal helpers ────────────────────────────────────────

  private static toTimeRanges(ranges: TimeRanges): TimeRange[] {
    const out: TimeRange[] = [];
    for (let i = 0; i < ranges.length; i++) {
      out.push({ start: ranges.start(i), end: ranges.end(i) });
    }
    return out;
  }

  private static toAudioTextTracks(tracks: TextTrackList): AudioTextTrack[] {
    const out: AudioTextTrack[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      out.push({
        src: "",
        kind: t.kind,
        label: t.label,
        language: t.language,
        mode: t.mode,
      });
    }
    return out;
  }
}

/**
 * Resolve when `canplaythrough` fires, reject when `error` fires. Used
 * by `activateWebAudio` to await the CORS-reloaded element being ready.
 */
function waitForCanPlayOrError(element: HTMLAudioElement): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onFail = (): void => {
      cleanup();
      reject(
        new Error(
          "WebAudioEngine: CORS reload failed — server may not send Access-Control-Allow-Origin"
        )
      );
    };
    const cleanup = (): void => {
      element.removeEventListener("canplaythrough", onReady);
      element.removeEventListener("error", onFail);
    };
    element.addEventListener("canplaythrough", onReady, { once: true });
    element.addEventListener("error", onFail, { once: true });
  });
}

/** Resolve when `canplaythrough` fires. Used by rollback path. */
function waitForCanPlay(element: HTMLAudioElement): Promise<void> {
  return new Promise<void>((resolve) => {
    const onReady = (): void => {
      element.removeEventListener("canplaythrough", onReady);
      resolve();
    };
    element.addEventListener("canplaythrough", onReady, { once: true });
  });
}

/**
 * Default factory — produces `WebAudioEngine` instances. The factory is
 * stateless; integrators that swap in DRM / HLS / vendor engines pass
 * their own factory.
 */
export class WebAudioEngineFactory implements EngineFactory {
  constructor(private readonly config: WebAudioEngineConfig = {}) {}

  create(): AudioEngine {
    return new WebAudioEngine(this.config);
  }
}
