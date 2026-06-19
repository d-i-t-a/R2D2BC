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

import type { Link, Publication } from "../../model/v3";
import type { AudioEngine } from "./AudioEngine";
import type { AudioSource } from "./AudioTypes";

/**
 * Resolves a `Link` from the publication's reading order (or one of its
 * `alternates`) into the `AudioSource` the engine should consume. The
 * default builds a plain `{ kind: "url", url }` source from the link's
 * absolute href; integrators override this when sources need DRM keys,
 * HLS manifest URLs, vendor IDs, etc.
 */
export type ResolveSourceFn = (link: Link) => AudioSource;

/**
 * Default source resolver — returns `{ kind: "url", url: absoluteHref }`
 * resolved against the publication base. Used by `AudioPool` when the
 * integrator doesn't supply their own.
 */
export function defaultResolveSource(
  publication: Publication
): ResolveSourceFn {
  return (link) => ({
    kind: "url",
    url: publication.getAbsoluteHref(link.href),
  });
}

/**
 * Number of neighboring tracks (on each side of the current one) for
 * which the pool ensures a `<audio preload="auto">` element exists.
 * Mirrors Readium ts-toolkit's `LOWER_BOUNDARY` / `UPPER_BOUNDARY`
 * constants (both 1). The current track is owned by the engine's
 * primary element, not by the pool.
 */
const PREFETCH_RANGE = 1;

/**
 * Pool of hidden `<audio preload="auto">` elements keyed by source URL.
 *
 * The pool does NOT hold `AudioEngine` instances. There is only ONE
 * engine in the system — the navigator's persistent engine. The pool's
 * job is to keep adjacent tracks' bytes warm in the browser's HTTP
 * cache, so when the engine's `changeSrc(href)` lands on a prefetched
 * neighbor the browser serves the response from cache instead of
 * paying a fresh CDN round-trip.
 *
 * Pattern mirrors Readium ts-toolkit's `AudioPoolManager`:
 *
 *   1. Pool holds at most `2 × PREFETCH_RANGE` hidden `<audio>` elements
 *      (next + previous track). Current track lives on the engine's
 *      primary element.
 *   2. Each pool entry's `crossOrigin` is matched to the engine's graph
 *      state. When the engine is in plain-audio mode, the prefetch
 *      elements have no CORS — so the browser cache key matches.
 *      When the engine is in Web Audio mode (worklet fallback active),
 *      both use `crossOrigin="anonymous"` so the CORS-tagged cached
 *      response is reusable.
 *   3. Format selection via `audio.canPlayType` is done once at
 *      construction; per-link picks are O(1) lookups.
 *   4. `setCurrentAudio(index)` is the only mutation entry point —
 *      tells the engine to switch tracks AND updates the pool around
 *      the new position.
 */
export class AudioPool {
  private readonly engine: AudioEngine;
  private readonly publication: Publication;
  private readonly resolveSource: ResolveSourceFn;
  private readonly pool = new Map<string, HTMLAudioElement>();
  private readonly supportedAudioTypes: ReadonlyMap<
    string,
    "probably" | "maybe"
  >;
  private destroyed = false;

  constructor(config: {
    engine: AudioEngine;
    publication: Publication;
    resolveSource?: ResolveSourceFn;
  }) {
    this.engine = config.engine;
    this.publication = config.publication;
    this.resolveSource =
      config.resolveSource ?? defaultResolveSource(config.publication);
    this.supportedAudioTypes = AudioPool.detectSupportedAudioTypes(
      config.publication
    );
  }

  /**
   * Tell the engine to switch to the track at `currentIndex` and refresh
   * the pool's prefetch window around the new position. Called by the
   * navigator on every track transition.
   *
   * After this returns the engine is pointed at the new source (load is
   * async — observable via `loadedmetadata` / `canplay` events) and the
   * pool holds prefetch elements for the new neighbors.
   */
  setCurrentAudio(currentIndex: number): void {
    if (this.destroyed) return;
    const items = this.publication.readingOrder;
    if (currentIndex < 0 || currentIndex >= items.length) return;
    const source = this.resolveSourceFor(items[currentIndex]);
    this.engine.changeSrc(source);
    // The primary element now owns this URL — drop any pool entry for
    // it so we don't keep two parallel buffers of the same response.
    const key = AudioPool.cacheKeyFor(source);
    if (key !== undefined) this.releasePoolEntry(key);
    this.update(currentIndex);
  }

  /**
   * Hint the pool to warm a specific track without making it current.
   * Used by the timeline module while the user drags the whole-book
   * scrubber across chapter boundaries — by the time they release on
   * a position several tracks away, the target's first bytes are
   * already in the browser's cache. Bounded by the prefetch range
   * around the current position so a runaway drag doesn't OOM the
   * page.
   */
  prefetchAt(index: number): void {
    if (this.destroyed) return;
    const items = this.publication.readingOrder;
    if (index < 0 || index >= items.length) return;
    const source = this.resolveSourceFor(items[index]);
    const key = AudioPool.cacheKeyFor(source);
    if (key !== undefined) this.ensure(key);
  }

  /** Number of pool entries currently held. */
  get size(): number {
    return this.pool.size;
  }

  /**
   * Tear down all pool elements and clear the map. Engine teardown is
   * the navigator's responsibility — this only handles the prefetch
   * elements the pool owns.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [, element] of this.pool) {
      AudioPool.releaseElement(element);
    }
    this.pool.clear();
  }

  // ── Internal ────────────────────────────────────────────────

  /**
   * Ensure a pool entry exists for `url`. Idempotent — if one already
   * exists, leave it untouched so its buffered data is preserved.
   * `crossOrigin` is matched to the engine's current graph state.
   */
  private ensure(url: string): HTMLAudioElement {
    const existing = this.pool.get(url);
    if (existing) return existing;
    const element = document.createElement("audio");
    element.preload = "auto";
    if (this.engine.isWebAudioActive) {
      element.crossOrigin = "anonymous";
    }
    element.src = url;
    element.load();
    this.pool.set(url, element);
    return element;
  }

  /**
   * Maintain the pool window around `currentIndex`: ensure entries
   * within ±PREFETCH_RANGE, evict everything beyond. The current track
   * itself is skipped — the engine's primary element handles it.
   * Sources without a plain HTTP cache key (HLS manifests, vendor-SDK
   * resources) are skipped — their loader handles its own prefetch.
   */
  private update(currentIndex: number): void {
    const items = this.publication.readingOrder;
    const keep = new Set<string>();

    for (let j = 0; j < items.length; j++) {
      if (j === currentIndex) continue;
      if (j < currentIndex - PREFETCH_RANGE) continue;
      if (j > currentIndex + PREFETCH_RANGE) continue;
      const source = this.resolveSourceFor(items[j]);
      const key = AudioPool.cacheKeyFor(source);
      if (key === undefined) continue;
      this.ensure(key);
      keep.add(key);
    }

    for (const [url, element] of this.pool) {
      if (keep.has(url)) continue;
      AudioPool.releaseElement(element);
      this.pool.delete(url);
    }
  }

  /**
   * Cache key the pool uses for prefetch-element bookkeeping. Returns
   * the source's URL for kinds that play through plain HTTP (`"url"`,
   * `"drm"`), `undefined` for kinds whose loader is opaque (`"hls"`,
   * `"vendor"`). When `undefined`, the pool skips prefetch for that
   * source — its own SDK is responsible for warming what it needs.
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

  /** Remove a single pool entry by URL. No-op if absent. */
  private releasePoolEntry(url: string): void {
    const element = this.pool.get(url);
    if (!element) return;
    AudioPool.releaseElement(element);
    this.pool.delete(url);
  }

  /**
   * Resolve a Link to its `AudioSource`, picking the best playable
   * variant from `link.alternates` via the cached `canPlayType` map.
   */
  private resolveSourceFor(link: Link): AudioSource {
    const playable = this.pickPlayableLink(link);
    return this.resolveSource(playable);
  }

  /**
   * Probe `audio.canPlayType` for every distinct media-type referenced
   * by the publication's reading order (and alternates). Done once at
   * construction so per-link picks are O(1) lookups.
   */
  private static detectSupportedAudioTypes(
    publication: Publication
  ): ReadonlyMap<string, "probably" | "maybe"> {
    const audio = document.createElement("audio");
    const types = new Set<string>();
    for (const link of publication.readingOrder) {
      if (link.type) types.add(link.type);
      const alternates = link.alternates;
      if (alternates) {
        for (const alt of alternates.items) {
          if (alt.type) types.add(alt.type);
        }
      }
    }
    const supported = new Map<string, "probably" | "maybe">();
    for (const type of types) {
      const result = audio.canPlayType(type);
      if (result === "probably" || result === "maybe") {
        supported.set(type, result);
      }
    }
    return supported;
  }

  /**
   * Pick the best playable variant of `link` from itself and its
   * `alternates`, ranked by `canPlayType` confidence ("probably" >
   * "maybe" > unsupported). When no candidate is supported, returns the
   * original link — the engine will surface the load failure via its
   * `error` event.
   */
  private pickPlayableLink(link: Link): Link {
    const candidates: Link[] = [link];
    const alternates = link.alternates;
    if (alternates) {
      for (const alt of alternates.items) candidates.push(alt as Link);
    }
    let bestMaybe: Link | undefined;
    for (const candidate of candidates) {
      const type = candidate.type;
      if (!type) continue;
      const confidence = this.supportedAudioTypes.get(type);
      if (confidence === "probably") return candidate;
      if (confidence === "maybe" && !bestMaybe) bestMaybe = candidate;
    }
    return bestMaybe ?? link;
  }

  /**
   * Release a pool element's network handle so the browser can reclaim
   * the buffered data. Standard pattern from the HTML spec: drop the
   * src attribute, then call load() to force the element back to its
   * empty state.
   */
  private static releaseElement(element: HTMLAudioElement): void {
    element.removeAttribute("src");
    element.load();
  }
}
