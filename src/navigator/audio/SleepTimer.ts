/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * SleepTimer — fires a callback after a duration or at the end of the
 * current chapter. Two distinct intents, two distinct entry points (no
 * `number | "endOfChapter"` union string).
 *
 * Time-based timers track an absolute deadline (`Date.now() + ms`) and
 * recompute remaining ms on every tick — self-correcting against
 * `setTimeout` drift in backgrounded tabs (where the browser may throttle
 * timers to once-per-minute while audio keeps playing via Web Audio).
 *
 * End-of-chapter mode arms a flag; the navigator's `onEnded` handler
 * checks it before the autoPlay-advance branch and fires `expire()` instead.
 *
 * The timer keeps counting through manual pauses — matches user intent
 * ("stop me at 30 min" should mean wall-clock 30 min, not engine-time).
 */

const TICK_INTERVAL_MS = 1000;

export type SleepTimerKind = "minutes" | "endOfChapter";

/**
 * Snapshot of timer state. Emitted via the `tick` callback so subscribers
 * (UI, MediaSessionController) can render the current countdown without
 * polling or holding a reference to the timer instance.
 */
export interface SleepTimerSnapshot {
  kind: SleepTimerKind;
  /**
   * For `kind = "minutes"`: ms until the timer fires, recomputed against
   * the absolute deadline. Drops to 0 at expiry.
   *
   * For `kind = "endOfChapter"`: always 0 — there's no countdown, just
   * a pending arm.
   */
  remainingMs: number;
  /**
   * For `kind = "minutes"`: the originally requested duration. Useful
   * for rendering "30 min timer set" in the UI without losing the
   * original choice when the countdown ticks down.
   *
   * For `kind = "endOfChapter"`: 0.
   */
  totalMs: number;
}

export interface SleepTimerCallbacks {
  /**
   * Called when the timer fires. Receives the final snapshot
   * (`remainingMs: 0` plus the original `kind` and `totalMs`) so
   * subscribers know which mode just ended without holding a reference
   * to the timer. The owner (navigator) is expected to pause playback.
   * The timer auto-cleans after firing — no need to `cancel()` from
   * inside the callback.
   */
  onExpire: (snapshot: SleepTimerSnapshot) => void;
  /**
   * Called every `TICK_INTERVAL_MS` while the timer is armed AND of
   * `kind = "minutes"`. End-of-chapter timers do NOT tick (no
   * countdown). Useful for UI to render the live countdown.
   */
  onTick: (snapshot: SleepTimerSnapshot) => void;
  /** Called when the timer starts. */
  onStart: (snapshot: SleepTimerSnapshot) => void;
  /** Called when `cancel()` is invoked (NOT when the timer fires). */
  onCancel: () => void;
}

export class SleepTimer {
  private kind: SleepTimerKind | null = null;
  private deadline = 0;
  private totalMs = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly callbacks: SleepTimerCallbacks;

  constructor(callbacks: SleepTimerCallbacks) {
    this.callbacks = callbacks;
  }

  /** Whether a timer is currently armed (either kind). */
  get isActive(): boolean {
    return this.kind !== null;
  }

  /** Snapshot of the current state, or null if no timer is armed. */
  snapshot(): SleepTimerSnapshot | null {
    if (this.kind === null) return null;
    if (this.kind === "endOfChapter") {
      return { kind: "endOfChapter", remainingMs: 0, totalMs: 0 };
    }
    return {
      kind: "minutes",
      remainingMs: Math.max(0, this.deadline - Date.now()),
      totalMs: this.totalMs,
    };
  }

  /**
   * Start a time-based sleep timer. Replaces any existing timer (either
   * kind). Fractional minutes are accepted and rounded to the nearest ms.
   */
  startMinutes(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.clearInternalTimers();
    const ms = Math.round(minutes * 60_000);
    this.kind = "minutes";
    this.totalMs = ms;
    this.deadline = Date.now() + ms;

    // Ticker for UI countdown. Self-corrects drift against the absolute
    // deadline. Background-tab throttling slows the tick rate but doesn't
    // skip the expiry — the deadline check on each tick fires expire()
    // when we cross it, and the setTimeout below catches the case where
    // ticks stop entirely (tab fully suspended).
    this.interval = setInterval(() => this.handleTick(), TICK_INTERVAL_MS);
    this.timeout = setTimeout(() => this.fire(), ms);

    this.callbacks.onStart(this.snapshot()!);
  }

  /**
   * Arm the timer to fire at the end of the current chapter. The
   * navigator's `onEnded` handler is responsible for calling `expire()`
   * when it observes the end. Idempotent — re-arming has no effect.
   */
  startEndOfChapter(): void {
    this.clearInternalTimers();
    this.kind = "endOfChapter";
    this.totalMs = 0;
    this.deadline = 0;
    this.callbacks.onStart(this.snapshot()!);
  }

  /**
   * Called by the navigator when the active chapter ends, IF the timer
   * is in `endOfChapter` mode. No-op otherwise — the navigator can call
   * this unconditionally.
   *
   * Returns true if the timer fired (so the navigator knows to skip the
   * autoPlay-advance branch), false if there was nothing to fire.
   */
  notifyChapterEnded(): boolean {
    if (this.kind !== "endOfChapter") return false;
    this.fire();
    return true;
  }

  /** Cancel the timer. Idempotent. Fires `onCancel` only if a timer was armed. */
  cancel(): void {
    if (this.kind === null) return;
    this.clearInternalTimers();
    this.kind = null;
    this.callbacks.onCancel();
  }

  /** Cleanup — stop all timers, no callbacks fired. Used during navigator stop(). */
  dispose(): void {
    this.clearInternalTimers();
    this.kind = null;
  }

  // ── Internals ─────────────────────────────────────────────────

  private handleTick(): void {
    const snap = this.snapshot();
    if (!snap) return;
    // Deadline crossed but timeout hasn't fired yet (background-tab
    // throttling) — fire eagerly so the user doesn't sit through extra
    // playback. The setTimeout race is harmless: fire() clears it.
    if (snap.kind === "minutes" && snap.remainingMs <= 0) {
      this.fire();
      return;
    }
    this.callbacks.onTick(snap);
  }

  private fire(): void {
    if (this.kind === null) return;
    // Build the final snapshot before clearing internal state so the
    // owner sees `remainingMs: 0` plus the original `kind` / `totalMs`.
    const snap: SleepTimerSnapshot = {
      kind: this.kind,
      remainingMs: 0,
      totalMs: this.totalMs,
    };
    this.clearInternalTimers();
    this.kind = null;
    this.totalMs = 0;
    this.deadline = 0;
    this.callbacks.onExpire(snap);
  }

  private clearInternalTimers(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
