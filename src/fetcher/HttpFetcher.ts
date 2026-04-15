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
import type { RequestConfig } from "../navigator/EpubNavigator";
import type { Fetcher, Resource } from "./Fetcher";
import { ReadError } from "./ReadError";

/**
 * Default Fetcher implementation — loads resources via HTTP `fetch()`.
 *
 * Drop-in replacement for the current direct `fetch()` calls scattered
 * across EpubNavigator, SearchModule, MediaOverlayModule, and Popup.
 * Existing integrators get this automatically without changing anything.
 *
 * Handles:
 * - Custom headers, credentials, and other RequestInit options via `requestConfig`
 * - Base64-encoded content from server-side streamers (`requestConfig.encoded`)
 * - Media type detection from Content-Type header
 */
export class HttpFetcher implements Fetcher {
  /** Track in-flight requests by href so each can be cancelled independently. */
  private controllers = new Map<string, AbortController>();

  constructor(private readonly requestConfig?: RequestConfig) {}

  async get(link: Link): Promise<Resource> {
    return this.fetchByHref(link.href, link.type);
  }

  async getByHref(href: string): Promise<Resource> {
    return this.fetchByHref(href);
  }

  private async fetchByHref(
    href: string,
    mediaTypeHint?: string
  ): Promise<Resource> {
    const controller = new AbortController();
    this.controllers.set(href, controller);

    const init: RequestInit = {
      ...this.requestConfig,
      signal: controller.signal,
    };

    let response: Response;
    try {
      response = await fetch(href, init);
    } catch (err) {
      this.controllers.delete(href);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw ReadError.cancelled(href);
      }
      throw ReadError.access(href, `Network error fetching ${href}`);
    }
    if (!response.ok) {
      this.controllers.delete(href);
      throw ReadError.access(
        href,
        `${response.status} ${response.statusText} for ${href}`,
        response.status
      );
    }

    let text = await response.text();

    // Server-side streamers (e.g. Readium go-toolkit) may return content
    // as base64-encoded strings. The `encoded` flag on RequestConfig
    // signals this — decode before returning.
    if (this.requestConfig?.encoded) {
      text = HttpFetcher.decodeBase64(text);
    }

    const contentType =
      response.headers.get("content-type") ?? mediaTypeHint ?? "";
    const mediaType = contentType.split(";")[0].trim();

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    this.controllers.delete(href);

    return {
      text,
      headers,
      mediaType,
      href,
    };
  }

  cancel(href?: string): void {
    if (href) {
      this.controllers.get(href)?.abort();
      this.controllers.delete(href);
    } else {
      // Cancel all in-flight requests
      for (const controller of this.controllers.values()) {
        controller.abort();
      }
      this.controllers.clear();
    }
  }

  destroy(): void {
    this.cancel();
  }

  /**
   * Decode a base64-encoded string to UTF-8 text.
   * Handles multi-byte characters correctly (atob alone doesn't).
   */
  private static decodeBase64(base64: string): string {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
}
