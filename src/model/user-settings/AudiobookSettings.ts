/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import Store from "../../store/Store";

/**
 * Typed audiobook playback settings.
 *
 * Field set + names match Readium ts-toolkit's `AudioPreferences`
 * (navigator/src/audio/preferences/AudioPreferences.ts) so that
 * integrators porting between R2D2BC and Readium see the same vocabulary.
 *
 * Persisted via the same `Store` abstraction EPUB and PDF use — drop-in
 * with `LocalStorageStore`. All eight values are persisted; values
 * survive reloads.
 *
 * Note on `muted`: deliberately NOT a settings field. Mute is a
 * transient UI gesture (speaker-icon toggle), not a preference, and
 * Readium models it the same way. The engine still exposes a runtime
 * `muted` flag for the toggle; it just isn't persisted.
 */
export interface IAudiobookSettings {
  /** Output gain in [0, 1]. */
  volume: number;
  /**
   * Playback speed multiplier in [0.5, 4.0]. Pitch is preserved when
   * `preservePitch` is true (the engine applies a phase-vocoder worklet).
   */
  playbackRate: number;
  /**
   * If true, pitch stays constant across `playbackRate` changes (default).
   * If false, audio shifts pitch with rate (the "chipmunk" effect).
   */
  preservePitch: boolean;
  /** Skip-backward jump size in seconds. */
  skipBackwardInterval: number;
  /** Skip-forward jump size in seconds. */
  skipForwardInterval: number;
  /**
   * Reading-position save debounce window in milliseconds. Bursts of
   * `timeupdate` events collapse into one persist call this long after
   * the burst settles. Set to 0 to persist on every tick (chatty).
   */
  pollInterval: number;
  /**
   * When the current resource ends, automatically continue playing the
   * next resource. With `autoPlay = false` the navigator still advances
   * to the next chapter on end, but lands paused — the user must click
   * play to continue. Default `true` matches the natural audiobook
   * listening experience and Readium ts-toolkit's default.
   */
  autoPlay: boolean;
  /**
   * Whether to integrate with the browser's Media Session API for
   * lock-screen / notification-shade controls. Wired in workstream 3.9
   * Phase 3; declared here now to avoid schema churn.
   */
  enableMediaSession: boolean;
  /**
   * Scrubber / progress-timeline display mode.
   *
   * - `"chapter"` (default): bar represents the current chapter only —
   *   precise scrubbing within the active resource. Industry default
   *   (Audible / Apple Books / Libro.fm). Best for long books where
   *   per-pixel precision matters.
   * - `"book"`: bar represents total publication duration. Drag past
   *   chapter boundaries to seek across tracks. Useful for "where am I
   *   in the whole book" mental model. Less precise on long books.
   * - `"both"`: per-chapter scrubber primary + thin whole-book progress
   *   strip alongside it. Macro reference + micro precision.
   */
  timelineMode: TimelineMode;
}

/** Scrubber display mode. */
export type TimelineMode = "chapter" | "book" | "both";

export type InitialAudiobookSettings = Partial<IAudiobookSettings>;

export type AudiobookSettingsKey = keyof IAudiobookSettings;

export interface AudiobookSettingsConfig {
  store: Store;
  initialAudiobookSettings?: InitialAudiobookSettings;
}

const DEFAULTS: IAudiobookSettings = {
  volume: 1.0,
  playbackRate: 1.0,
  preservePitch: true,
  skipBackwardInterval: 10,
  skipForwardInterval: 30,
  pollInterval: 1000,
  autoPlay: true,
  enableMediaSession: true,
  timelineMode: "chapter",
};

const TIMELINE_MODES: ReadonlySet<TimelineMode> = new Set([
  "chapter",
  "book",
  "both",
]);

const RANGES = {
  volume: [0, 1] as const,
  playbackRate: [0.5, 4.0] as const,
  skipBackwardInterval: [5, 60] as const,
  skipForwardInterval: [5, 60] as const,
  pollInterval: [0, Number.MAX_SAFE_INTEGER] as const,
};

const STORE_PREFIX = "audiobook-";

export class AudiobookSettings implements IAudiobookSettings {
  private readonly store: Store;
  private readonly listeners = new Set<(key: AudiobookSettingsKey) => void>();

  private _volume: number = DEFAULTS.volume;
  private _playbackRate: number = DEFAULTS.playbackRate;
  private _preservePitch: boolean = DEFAULTS.preservePitch;
  private _skipBackwardInterval: number = DEFAULTS.skipBackwardInterval;
  private _skipForwardInterval: number = DEFAULTS.skipForwardInterval;
  private _pollInterval: number = DEFAULTS.pollInterval;
  private _autoPlay: boolean = DEFAULTS.autoPlay;
  private _enableMediaSession: boolean = DEFAULTS.enableMediaSession;
  private _timelineMode: TimelineMode = DEFAULTS.timelineMode;

  /**
   * Async to mirror `UserSettings.create()` even though no I/O is
   * actually awaited — `Store.get` is synchronous. Future Store
   * implementations (IndexedDB-backed) may be async, in which case
   * the contract is already in place.
   */
  static async create(
    config: AudiobookSettingsConfig
  ): Promise<AudiobookSettings> {
    const settings = new AudiobookSettings(config.store);
    settings.loadFromStore();
    if (config.initialAudiobookSettings) {
      settings.apply(config.initialAudiobookSettings);
    }
    return settings;
  }

  private constructor(store: Store) {
    this.store = store;
  }

  private loadFromStore(): void {
    this._volume = this.readNumber("volume", DEFAULTS.volume, RANGES.volume);
    this._playbackRate = this.readNumber(
      "playbackRate",
      DEFAULTS.playbackRate,
      RANGES.playbackRate
    );
    this._preservePitch = this.readBoolean(
      "preservePitch",
      DEFAULTS.preservePitch
    );
    this._skipBackwardInterval = this.readNumber(
      "skipBackwardInterval",
      DEFAULTS.skipBackwardInterval,
      RANGES.skipBackwardInterval
    );
    this._skipForwardInterval = this.readNumber(
      "skipForwardInterval",
      DEFAULTS.skipForwardInterval,
      RANGES.skipForwardInterval
    );
    this._pollInterval = this.readNumber(
      "pollInterval",
      DEFAULTS.pollInterval,
      RANGES.pollInterval
    );
    this._autoPlay = this.readBoolean("autoPlay", DEFAULTS.autoPlay);
    this._enableMediaSession = this.readBoolean(
      "enableMediaSession",
      DEFAULTS.enableMediaSession
    );
    this._timelineMode = this.readEnum(
      "timelineMode",
      DEFAULTS.timelineMode,
      TIMELINE_MODES
    );
  }

  /** Apply a batch of overrides. Used by `initialAudiobookSettings`. */
  apply(values: InitialAudiobookSettings): void {
    if (values.volume !== undefined) this.volume = values.volume;
    if (values.playbackRate !== undefined)
      this.playbackRate = values.playbackRate;
    if (values.preservePitch !== undefined)
      this.preservePitch = values.preservePitch;
    if (values.skipBackwardInterval !== undefined)
      this.skipBackwardInterval = values.skipBackwardInterval;
    if (values.skipForwardInterval !== undefined)
      this.skipForwardInterval = values.skipForwardInterval;
    if (values.pollInterval !== undefined)
      this.pollInterval = values.pollInterval;
    if (values.autoPlay !== undefined) this.autoPlay = values.autoPlay;
    if (values.enableMediaSession !== undefined)
      this.enableMediaSession = values.enableMediaSession;
    if (values.timelineMode !== undefined)
      this.timelineMode = values.timelineMode;
  }

  /** Snapshot of current values. */
  toJSON(): IAudiobookSettings {
    return {
      volume: this._volume,
      playbackRate: this._playbackRate,
      preservePitch: this._preservePitch,
      skipBackwardInterval: this._skipBackwardInterval,
      skipForwardInterval: this._skipForwardInterval,
      pollInterval: this._pollInterval,
      autoPlay: this._autoPlay,
      enableMediaSession: this._enableMediaSession,
      timelineMode: this._timelineMode,
    };
  }

  /**
   * Subscribe to value changes. Listener receives the key that changed;
   * read the current value via the corresponding getter. Returns an
   * unsubscribe function.
   */
  onChange(listener: (key: AudiobookSettingsKey) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Typed accessors ───────────────────────────────────────────

  get volume(): number {
    return this._volume;
  }
  set volume(value: number) {
    const clamped = clamp(value, RANGES.volume[0], RANGES.volume[1]);
    if (clamped === this._volume) return;
    this._volume = clamped;
    this.persist("volume", clamped);
  }

  get playbackRate(): number {
    return this._playbackRate;
  }
  set playbackRate(value: number) {
    const clamped = clamp(
      value,
      RANGES.playbackRate[0],
      RANGES.playbackRate[1]
    );
    if (clamped === this._playbackRate) return;
    this._playbackRate = clamped;
    this.persist("playbackRate", clamped);
  }

  get preservePitch(): boolean {
    return this._preservePitch;
  }
  set preservePitch(value: boolean) {
    if (value === this._preservePitch) return;
    this._preservePitch = value;
    this.persist("preservePitch", value);
  }

  get skipBackwardInterval(): number {
    return this._skipBackwardInterval;
  }
  set skipBackwardInterval(value: number) {
    const clamped = clamp(
      value,
      RANGES.skipBackwardInterval[0],
      RANGES.skipBackwardInterval[1]
    );
    if (clamped === this._skipBackwardInterval) return;
    this._skipBackwardInterval = clamped;
    this.persist("skipBackwardInterval", clamped);
  }

  get skipForwardInterval(): number {
    return this._skipForwardInterval;
  }
  set skipForwardInterval(value: number) {
    const clamped = clamp(
      value,
      RANGES.skipForwardInterval[0],
      RANGES.skipForwardInterval[1]
    );
    if (clamped === this._skipForwardInterval) return;
    this._skipForwardInterval = clamped;
    this.persist("skipForwardInterval", clamped);
  }

  get pollInterval(): number {
    return this._pollInterval;
  }
  set pollInterval(value: number) {
    const clamped = clamp(
      value,
      RANGES.pollInterval[0],
      RANGES.pollInterval[1]
    );
    if (clamped === this._pollInterval) return;
    this._pollInterval = clamped;
    this.persist("pollInterval", clamped);
  }

  get autoPlay(): boolean {
    return this._autoPlay;
  }
  set autoPlay(value: boolean) {
    if (value === this._autoPlay) return;
    this._autoPlay = value;
    this.persist("autoPlay", value);
  }

  get enableMediaSession(): boolean {
    return this._enableMediaSession;
  }
  set enableMediaSession(value: boolean) {
    if (value === this._enableMediaSession) return;
    this._enableMediaSession = value;
    this.persist("enableMediaSession", value);
  }

  get timelineMode(): TimelineMode {
    return this._timelineMode;
  }
  set timelineMode(value: TimelineMode) {
    if (!TIMELINE_MODES.has(value)) return;
    if (value === this._timelineMode) return;
    this._timelineMode = value;
    this.persist("timelineMode", value);
  }

  // ── Internals ─────────────────────────────────────────────────

  private readNumber(
    key: AudiobookSettingsKey,
    fallback: number,
    range: readonly [number, number]
  ): number {
    const raw = this.store.get(STORE_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, range[0], range[1]);
  }

  private readBoolean(key: AudiobookSettingsKey, fallback: boolean): boolean {
    const raw = this.store.get(STORE_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === "boolean") return raw;
    return raw === "true" || raw === "1";
  }

  private readEnum<T extends string>(
    key: AudiobookSettingsKey,
    fallback: T,
    valid: ReadonlySet<T>
  ): T {
    const raw = this.store.get(STORE_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw !== "string") return fallback;
    return valid.has(raw as T) ? (raw as T) : fallback;
  }

  private persist(
    key: AudiobookSettingsKey,
    value: number | boolean | string
  ): void {
    this.store.set(STORE_PREFIX + key, String(value));
    for (const fn of this.listeners) fn(key);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
