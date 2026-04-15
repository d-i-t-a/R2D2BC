/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { Link } from "../model/v3";
import type { Fetcher, Resource } from "./Fetcher";

/**
 * Caching wrapper around any Fetcher.
 *
 * Caches fetched resources by href in memory. Serves subsequent
 * requests from cache without hitting the inner Fetcher. Enables
 * predictive spine prefetching — the navigator calls `prefetch(link)`
 * after each resource loads, and the next chapter is already in memory
 * when the user turns the page.
 *
 * Memory management: call `evict(href)` to remove specific entries,
 * or `clear()` to drop all cached resources.
 */
export class CacheFetcher implements Fetcher {
  private cache = new Map<string, Resource>();
  private pending = new Map<string, Promise<Resource>>();

  constructor(private readonly inner: Fetcher) {}

  async get(link: Link): Promise<Resource> {
    const cached = this.cache.get(link.href);
    if (cached) return cached;

    const inflight = this.pending.get(link.href);
    if (inflight) return inflight;

    // Delegate to inner.get(link) to preserve Link metadata (type, etc.)
    const promise = this.inner
      .get(link)
      .then((resource) => {
        this.cache.set(link.href, resource);
        this.pending.delete(link.href);
        return resource;
      })
      .catch((err) => {
        this.pending.delete(link.href);
        throw err;
      });
    this.pending.set(link.href, promise);
    return promise;
  }

  async getByHref(href: string): Promise<Resource> {
    const cached = this.cache.get(href);
    if (cached) return cached;

    const inflight = this.pending.get(href);
    if (inflight) return inflight;

    const promise = this.inner
      .getByHref(href)
      .then((resource) => {
        this.cache.set(href, resource);
        this.pending.delete(href);
        return resource;
      })
      .catch((err) => {
        this.pending.delete(href);
        throw err;
      });
    this.pending.set(href, promise);
    return promise;
  }

  /**
   * Prefetch a resource into cache without blocking.
   * Used by the navigator to preload adjacent spine items after
   * the current resource finishes loading.
   */
  async prefetch(link: Link): Promise<void> {
    if (this.cache.has(link.href) || this.pending.has(link.href)) return;
    try {
      await this.get(link);
    } catch {
      // Prefetch failures are non-fatal — the resource will be
      // fetched on demand when the user navigates to it.
    }
  }

  /** Check if a resource is cached. */
  async has(link: Link): Promise<boolean> {
    return this.cache.has(link.href);
  }

  /** Remove a specific resource from cache. */
  evict(href: string): void {
    this.cache.delete(href);
  }

  /** Drop all cached resources. */
  clear(): void {
    this.cache.clear();
  }

  cancel(href: string): void {
    this.inner.cancel?.(href);
  }

  destroy(): void {
    this.cache.clear();
    this.pending.clear();
    this.inner.destroy?.();
  }
}
