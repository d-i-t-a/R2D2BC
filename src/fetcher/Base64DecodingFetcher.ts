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
 * Wraps an inner Fetcher and base64-decodes document responses when
 * needed. Composed into the chain when `RequestConfig.encoded === true`.
 *
 * Detects encoding by first character: document content starts with `<`;
 * base64 doesn't. If text is already a document, pass through. Otherwise
 * attempt atob; if atob succeeds, use the result.
 */
export class Base64DecodingFetcher implements Fetcher {
  constructor(private readonly inner: Fetcher) {}

  async get(link: Link): Promise<Resource> {
    return this.maybeDecode(await this.inner.get(link));
  }

  async getByHref(href: string): Promise<Resource> {
    return this.maybeDecode(await this.inner.getByHref(href));
  }

  cancel(href: string): void {
    this.inner.cancel?.(href);
  }

  destroy(): void {
    this.inner.destroy?.();
  }

  private maybeDecode(resource: Resource): Resource {
    if (!shouldDecode(resource.mediaType)) return resource;
    if (!isLikelyEncoded(resource.text)) return resource;

    try {
      return { ...resource, text: decodeBase64Utf8(resource.text) };
    } catch {
      return resource;
    }
  }
}

function shouldDecode(mediaType: string): boolean {
  if (!mediaType) return false;
  const lower = mediaType.toLowerCase();
  return (
    lower === "application/xhtml+xml" ||
    lower === "text/html" ||
    lower === "application/xml"
  );
}

/**
 * True if the text doesn't start with `<` (after optional BOM / whitespace).
 * Document content always opens with a tag; base64 never does.
 */
function isLikelyEncoded(text: string): boolean {
  if (!text) return false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (
      ch === " " ||
      ch === "\n" ||
      ch === "\r" ||
      ch === "\t" ||
      code === 0xfeff
    ) {
      i++;
      continue;
    }
    return ch !== "<";
  }
  return false;
}

/**
 * Decode a base64-encoded string to UTF-8 text.
 * Handles multi-byte characters correctly (atob alone doesn't).
 */
function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
