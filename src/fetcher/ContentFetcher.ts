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
import type { GetContent } from "./types";
import type { Fetcher, Resource } from "./Fetcher";
import { guessMediaType } from "./mediaType";

/**
 * Fetcher that delegates to the integrator's `api.getContent` callback.
 *
 * Sits between CacheFetcher and HttpFetcher in the chain:
 *
 *   CacheFetcher → ContentFetcher → HttpFetcher
 *
 * For each request, `getContent(href)` is called first. If the integrator
 * returns content (a string), that content is used directly. If it returns
 * `undefined`, the request falls through to the inner Fetcher (HttpFetcher).
 *
 * Integrators use `api.getContent` to:
 * - Serve protected/licensed content (DRM, LCP — decryption happens
 *   server-side, the callback returns the cleartext)
 * - Fetch content from a custom source (non-HTTP, local cache, etc.)
 * - Transform content before the reader sees it
 *
 * In a future workstream this layer will also handle LCP license
 * validation and server-side decryption workflows.
 */
export class ContentFetcher implements Fetcher {
  constructor(
    private readonly inner: Fetcher,
    private readonly getContent: GetContent
  ) {}

  async get(link: Link): Promise<Resource> {
    const content = await this.getContent(link.href);
    if (content !== undefined) {
      return {
        text: content,
        headers: {},
        mediaType: link.type ?? "application/xhtml+xml",
        href: link.href,
      };
    }
    return this.inner.get(link);
  }

  async getByHref(href: string): Promise<Resource> {
    const content = await this.getContent(href);
    if (content !== undefined) {
      return {
        text: content,
        headers: {},
        mediaType: guessMediaType(href),
        href,
      };
    }
    return this.inner.getByHref(href);
  }

  cancel(href: string): void {
    this.inner.cancel?.(href);
  }

  destroy(): void {
    this.inner.destroy?.();
  }
}
