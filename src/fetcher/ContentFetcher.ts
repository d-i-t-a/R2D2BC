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
import type { Publication } from "../model/v3";
import { guessMediaType } from "./mediaType";

/**
 * Fetcher that delegates publication-resource requests to the integrator's
 * `api.getContent` callback.
 *
 * For hrefs that belong to the publication (readingOrder + resources in
 * the manifest), `getContent(href)` is called first. If the integrator
 * returns content, that content is used. If it returns `undefined`, the
 * request falls through to the inner Fetcher.
 *
 * Requests for hrefs NOT in the manifest — positions service, external
 * links, browser-chrome URLs — pass straight through to the inner Fetcher
 * without touching getContent.
 *
 * Integrators use `api.getContent` to serve protected/licensed content,
 * fetch from a custom source, or transform content before it reaches the
 * reader.
 */
export class ContentFetcher implements Fetcher {
  private readonly publicationResourceHrefs: Set<string>;

  constructor(
    private readonly inner: Fetcher,
    private readonly getContent: GetContent,
    publication: Publication
  ) {
    const all: Link[] = [
      ...(publication.readingOrder ?? []),
      ...(publication.resources ?? []),
    ];
    this.publicationResourceHrefs = new Set(
      all.map((link) => publication.getAbsoluteHref(link.href))
    );
  }

  async get(link: Link): Promise<Resource> {
    if (!this.isPublicationResource(link.href)) {
      return this.inner.get(link);
    }
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
    if (!this.isPublicationResource(href)) {
      return this.inner.getByHref(href);
    }
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

  private isPublicationResource(href: string): boolean {
    return this.publicationResourceHrefs.has(href);
  }
}
