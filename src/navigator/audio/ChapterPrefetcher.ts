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

import type { Publication } from "../../model/v3";
import type { AudioEngine } from "./AudioEngine";
import type { AudioSource } from "./AudioTypes";
import { defaultResolveSource, type ResolveSourceFn } from "./AudioPool";

/**
 * Default head size in bytes — first ~256KB of every track. Picked to
 * be larger than a typical MP3 frame (so the audio decoder has enough
 * to start playback immediately on cache hit) but small enough that the
 * total prefetch budget for a 30-chapter book stays under ~8MB.
 */
const DEFAULT_PREFETCH_BYTES = 262144;

/** Default concurrent fetch cap. Keeps the active track's bandwidth uncrowded. */
const DEFAULT_CONCURRENCY = 3;

/**
 * Pool's own warm window (current ±N). The prefetcher skips this range
 * because the pool already holds `<audio preload="auto">` elements for
 * those neighbors — issuing a second fetch would double-buffer the same
 * bytes. Mirrors `PREFETCH_RANGE` in AudioPool; kept in sync manually.
 */
const POOL_NEIGHBOR_RANGE = 1;

/**
 * Construction-time configuration. All optional fields fall back to
 * defaults documented at top of file.
 *
 * Note on Phase B coordination: an earlier design routed a custom
 * `X-Audiobook-Prefetch: head` header from the prefetcher to the
 * Service Worker so it could differentiate head-only from full
 * fetches. Custom headers force CORS preflight, which most audio CDNs
 * (including archive.org) don't whitelist — every prefetch fails. The
 * Phase B SW instead distinguishes head-only from full requests by
 * inspecting the Range header itself (`bytes=0-N` with finite N and N
 * small → head-only; open-ended or large ranges → engine playback).
 */
export interface ChapterPrefetcherConfig {
  publication: Publication;
  /**
   * Single persistent engine instance. Read for `isWebAudioActive` so
   * the prefetcher's fetch mode matches the engine's `<audio>` element
   * CORS state — keeps cache keys aligned so a prefetched response can
   * actually be reused when the engine later loads the same URL.
   */
  engine: AudioEngine;
  /**
   * Source resolver. Same shape as `AudioPool` accepts. When omitted,
   * defaults to `{ kind: "url", url: publication.getAbsoluteHref(...) }`.
   */
  resolveSource?: ResolveSourceFn;
  /** Bytes of head to prefetch per track. Default 262144 (256KB). */
  bytes?: number;
  /** Max in-flight fetches at any one time. Default 3. */
  concurrency?: number;
  /** Master on/off switch. Default true. */
  enabled?: boolean;
}

/**
 * Head-of-chapter HTTP prefetcher. On book open, issues a small Range
 * GET for every track in the reading order so the browser's HTTP cache
 * is warm by the time the user scrubs to any chapter.
 *
 * Far-chapter scrubs that would otherwise pay a 500–1500ms cold
 * round-trip land with the first audible byte already cached. The rest
 * of the track streams normally once playback starts.
 *
 * Standalone — works without the Phase B Service Worker. When the SW
 * is present, it differentiates head-only from full audio fetches by
 * inspecting the Range header (closed range with small upper bound =
 * head; open-ended or large range = engine playback). No custom
 * header — custom headers would force CORS preflight, which audio
 * CDNs typically don't whitelist.
 *
 * Sources without a plain HTTP URL (kinds `"hls"`, `"vendor"`) are
 * skipped — their loader handles its own prefetch.
 */
export class ChapterPrefetcher {
  private readonly publication: Publication;
  private readonly engine: AudioEngine;
  private readonly resolveSource: ResolveSourceFn;
  private readonly bytes: number;
  private readonly concurrency: number;
  private readonly enabled: boolean;

  private readonly attempted = new Set<string>();
  private readonly badUrls = new Set<string>();
  private queue: number[] = [];
  private inFlight = 0;
  private currentIndex = -1;
  private started = false;
  private disposed = false;
  private readonly abortController = new AbortController();

  constructor(config: ChapterPrefetcherConfig) {
    this.publication = config.publication;
    this.engine = config.engine;
    this.resolveSource =
      config.resolveSource ?? defaultResolveSource(config.publication);
    this.bytes = config.bytes ?? DEFAULT_PREFETCH_BYTES;
    this.concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
    this.enabled = config.enabled ?? false;
  }

  /**
   * Kick off the walk. Idempotent — repeat calls re-pump the queue but
   * never re-fetch URLs already attempted (success or failure both
   * count). Call after the navigator's initial position is committed
   * so the `currentIndex` skip is meaningful.
   */
  start(): void {
    if (this.disposed) return;
    if (!this.enabled) return;
    this.started = true;
    this.rebuildQueue();
    this.pump();
  }

  /**
   * Notify the prefetcher that the active track changed. Updates the
   * skip set so the new current + its neighbors are passed over.
   * In-flight requests are NOT cancelled — they were already worth
   * starting and finishing.
   */
  setCurrentIndex(index: number): void {
    if (this.disposed) return;
    this.currentIndex = index;
    if (!this.started) return;
    this.rebuildQueue();
    this.pump();
  }

  /**
   * Cancel all in-flight fetches and clear the queue. Called by the
   * navigator from `stop()`. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue = [];
    this.abortController.abort();
  }

  // ── Internal ────────────────────────────────────────────────

  /**
   * Build the queue of indices that should be prefetched given the
   * current skip set. Already-attempted URLs are filtered out so we
   * don't re-issue requests for tracks we've already tried (or that
   * failed CORS / were known bad).
   */
  private rebuildQueue(): void {
    const items = this.publication.readingOrder;
    const queue: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (!this.shouldPrefetch(i)) continue;
      queue.push(i);
    }
    // Bias the queue toward the user's likely next destination — sort
    // by distance from the current index so chapter 5's neighbors get
    // warmed before chapter 25 when the user is on chapter 4. Ties
    // broken in reading order so the natural forward direction wins.
    const focus = this.currentIndex >= 0 ? this.currentIndex : 0;
    queue.sort((a, b) => {
      const distA = Math.abs(a - focus);
      const distB = Math.abs(b - focus);
      if (distA !== distB) return distA - distB;
      return a - b;
    });
    this.queue = queue;
  }

  /**
   * Decision predicate for a given index. Skip:
   *  - the current track (engine owns it)
   *  - pool's warm neighbors (already buffered via `<audio preload="auto">`)
   *  - sources without a plain HTTP URL (HLS / vendor SDK handles its own prefetch)
   *  - URLs already attempted or marked bad
   */
  private shouldPrefetch(index: number): boolean {
    if (index === this.currentIndex) return false;
    if (
      this.currentIndex >= 0 &&
      Math.abs(index - this.currentIndex) <= POOL_NEIGHBOR_RANGE
    ) {
      return false;
    }
    const link = this.publication.readingOrder[index];
    if (!link) return false;
    const source = this.resolveSource(link);
    const url = ChapterPrefetcher.cacheKeyFor(source);
    if (url === undefined) return false;
    if (this.attempted.has(url)) return false;
    if (this.badUrls.has(url)) return false;
    return true;
  }

  /**
   * Drain the queue up to `concurrency` in-flight at any one time.
   * Re-entered by every fetch completion so we always run at the cap
   * until the queue is empty.
   */
  private pump(): void {
    if (this.disposed) return;
    while (this.inFlight < this.concurrency && this.queue.length > 0) {
      const index = this.queue.shift();
      if (index === undefined) return;
      void this.fetchHead(index);
    }
  }

  /**
   * Issue the head fetch for a single track. Errors are swallowed and
   * the URL is marked bad so we don't retry; the engine itself remains
   * unaffected (it uses Range requests natively for `<audio>` and gets
   * its own response if the server supports it).
   */
  private async fetchHead(index: number): Promise<void> {
    const link = this.publication.readingOrder[index];
    if (!link) return;
    const source = this.resolveSource(link);
    const url = ChapterPrefetcher.cacheKeyFor(source);
    if (url === undefined) return;
    if (this.attempted.has(url)) return;
    this.attempted.add(url);
    this.inFlight++;
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        signal: this.abortController.signal,
        headers: {
          // Range with a closed byte interval is CORS-safelisted per
          // the fetch spec — no preflight on browsers that honour
          // safelist (Chrome / Edge / Firefox). Safari historically
          // preflights anyway; the catch block handles the failure by
          // marking the URL bad and moving on.
          Range: `bytes=0-${this.bytes - 1}`,
        },
      });
      // 206 Partial Content is the success case for our Range request.
      // 200 means the server returned the full file (ignoring Range);
      // that still warms the cache but blows our byte budget — mark
      // the URL so we don't try again, the engine will use its own
      // Range request when needed.
      if (response.status === 200) {
        this.badUrls.add(url);
      } else if (response.status !== 206 && response.status !== 0) {
        // 0 = opaque (we don't expect this with mode: "cors" but be
        // defensive). Any other status: treat as bad and move on.
        this.badUrls.add(url);
      }
      // Read the body to ensure the browser commits the response to
      // its HTTP cache. Streaming the response without reading it can
      // leave the cache write incomplete on some browsers.
      try {
        await response.arrayBuffer();
      } catch {
        /* abort or network during read — already handled below */
      }
    } catch (err) {
      // AbortError on dispose is expected; everything else means the
      // URL is unusable for prefetch. The engine remains unaffected.
      if (err instanceof DOMException && err.name === "AbortError") return;
      this.badUrls.add(url);
    } finally {
      this.inFlight--;
      this.pump();
    }
  }

  /**
   * Cache key the prefetcher uses to track per-URL state. Mirrors
   * `AudioPool.cacheKeyFor` — returns the source's URL for kinds that
   * play through plain HTTP (`"url"`, `"drm"`), `undefined` for kinds
   * whose loader is opaque (`"hls"`, `"vendor"`). Sources that return
   * `undefined` are never prefetched.
   */
  private static cacheKeyFor(source: AudioSource): string | undefined {
    switch (source.kind) {
      case "url":
      case "drm":
        return source.url;
      case "hls":
      case "vendor":
        return undefined;
    }
  }
}
