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
 * Extends RequestInit with reader-specific options.
 *
 * Passed to HttpFetcher and through the Fetcher chain.
 * `encoded` signals that the server returns base64-encoded content
 * (used by some Readium-compatible streamers).
 */
export interface RequestConfig extends RequestInit {
  encoded?: boolean;
}

/**
 * Integrator-provided content callback.
 *
 * Called by ContentFetcher for each resource request. If the integrator
 * returns content (string), it's used directly. If it returns undefined,
 * the request falls through to the inner Fetcher (typically HttpFetcher).
 *
 * Used for DRM decryption, custom content sources, content transformation.
 */
export type GetContent = (href: string) => Promise<string | undefined>;

/**
 * Callback to get the byte length of a resource.
 *
 * Used by Publication.autoGeneratePositions() to calculate
 * reading positions from content size.
 */
export type GetContentBytesLength = (
  href: string,
  requestConfig?: RequestConfig
) => Promise<number>;
