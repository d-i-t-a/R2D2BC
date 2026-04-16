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

/**
 * A fetched resource — the result of a Fetcher.get() call.
 *
 * Represents content retrieved from any source (HTTP, ZIP, cache,
 * decryption pipeline). Consumers read `text` for string content
 * (HTML, XML, JSON) or `bytes` for binary content (images, audio, PDF).
 *
 * The `partial` and `range` fields are reserved for future range/partial
 * fetching (DRM workstream — page-level streaming). Fetchers that support
 * partial content set these; consumers that don't need partial content
 * ignore them.
 */
export interface Resource {
  /** The resolved content as a string (HTML, XML, JSON, etc.) */
  readonly text: string;

  /** The raw bytes — for binary content (images, audio, PDF) */
  readonly bytes?: ArrayBuffer;

  /** HTTP headers or equivalent metadata */
  readonly headers: Record<string, string>;

  /** The media type (e.g. "application/xhtml+xml", "application/pdf") */
  readonly mediaType: string;

  /** The resolved href */
  readonly href: string;

  /**
   * Extensible metadata about this resource.
   *
   * Used to carry information through the Fetcher chain that
   * isn't part of the content itself:
   * - `encrypted?: { algorithm: string; originalLength?: number }` —
   *   encryption/obfuscation info from encryption.xml
   * - `filename?: string` — original filename from the container
   * - Custom properties set by TransformingFetcher or integrators
   */
  readonly properties?: Record<string, unknown>;

  /**
   * Reserved for future range/partial fetching (3.9).
   * True if this resource contains a partial range, not the full content.
   */
  readonly partial?: boolean;

  /**
   * Reserved for future range/partial fetching (3.9).
   * The byte range this resource represents within the full content.
   */
  readonly range?: { start: number; end: number; total: number };
}

/**
 * Content loading abstraction.
 *
 * All content in the reader flows through a Fetcher — chapter HTML,
 * media overlay manifests, audio files, footnote popups, search content.
 * The navigator and modules call `fetcher.get(link)` and receive a
 * Resource without knowing where the content came from (HTTP, ZIP,
 * cache, decryption pipeline).
 *
 * Fetchers are composable — stack them to build a content pipeline:
 *
 * ```ts
 * // Server-based with decryption + caching:
 * const fetcher = new CacheFetcher(
 *   new ContentFetcher(
 *     new HttpFetcher(requestConfig),
 *     api.getContent
 *   )
 * )
 *
 * // Client-side EPUB with caching:
 * const fetcher = new CacheFetcher(
 *   new ZipFetcher(epubBlob)
 * )
 * ```
 */
export interface Fetcher {
  /**
   * Fetch a resource by Link.
   * Returns a Resource with the content, headers, and media type.
   * Throws ReadError on failure (access, decoding, or cancelled).
   */
  get(link: Link): Promise<Resource>;

  /**
   * Fetch a resource by href string (convenience overload).
   * Throws ReadError on failure.
   */
  getByHref(href: string): Promise<Resource>;

  /**
   * Cancel an in-flight fetch for the given href.
   * Optional — not all Fetcher implementations support cancellation.
   */
  cancel?(href: string): void;

  /**
   * Check if a resource is available without fetching it.
   * Optional — useful for CacheFetcher (check cache hit) and
   * ZipFetcher (check if file exists in ZIP).
   */
  has?(link: Link): Promise<boolean>;

  /**
   * Prefetch a resource into cache without blocking.
   * Optional — only meaningful for Fetchers that cache (CacheFetcher).
   * Non-caching Fetchers can ignore this or no-op.
   */
  prefetch?(link: Link): Promise<void>;

  /**
   * Release resources held by this Fetcher (close ZIP handles,
   * clear caches, abort pending requests).
   */
  destroy?(): void;
}
