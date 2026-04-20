/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { strFromU8 } from "fflate";
import type { Link } from "../model/v3";
import type { Fetcher, Resource } from "./Fetcher";
import type { Container } from "./Container";
import type { EncryptionInfo } from "./FontDeobfuscator";
import { ZipContainer } from "./ZipContainer";
import { ReadError } from "./ReadError";
import { guessMediaType } from "./mediaType";

/**
 * Fetcher that reads resources from a Container (ZIP archive, etc.).
 *
 * Wraps a Container and builds Resource objects from its raw bytes.
 * The Container owns the data; the ZipFetcher handles path resolution,
 * media type guessing, and text decoding.
 *
 * Accepts raw ZIP bytes (creates a ZipContainer internally) or a
 * pre-built Container for reuse across Fetchers.
 *
 * Used by:
 * - D2Reader.load({ epub: file }) — opens an .epub file directly
 * - DiViNaNavigator (3.11) — opens CBZ comic/manga archives
 */
export class ZipFetcher implements Fetcher {
  readonly container: Container;
  private basePath: string;
  private encryptionMap?: Map<string, EncryptionInfo>;

  /**
   * Update the basePath after construction. Used when the identifier
   * is extracted from the ZIP content and incorporated into the path.
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  /**
   * Set encryption info so Resources carry encryption metadata
   * in their `properties.encrypted` field. The TransformingFetcher
   * reads this to know which resources need deobfuscation.
   */
  setEncryptionMap(map: Map<string, EncryptionInfo>): void {
    this.encryptionMap = map;
  }

  constructor(source: ArrayBuffer | Uint8Array | Container, basePath = "") {
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      this.container = new ZipContainer(source);
    } else {
      this.container = source;
    }
    this.basePath = basePath;
  }

  async get(link: Link): Promise<Resource> {
    const resource = await this.getByHref(link.href);
    // Prefer the Link's declared type over guessing from extension
    if (link.type) {
      return { ...resource, mediaType: link.type };
    }
    return resource;
  }

  async getByHref(href: string): Promise<Resource> {
    const path = this.resolvePath(href);
    const entry = this.container.get(path);
    if (!entry) {
      throw ReadError.access(href, `Not found in archive: ${path}`);
    }

    const mediaType = guessMediaType(path);
    // Only decode text for text-based content types — skip for binary
    // resources (images, fonts, audio) to avoid wasting CPU on garbage.
    const isText =
      mediaType.startsWith("text/") ||
      mediaType.includes("xml") ||
      mediaType.includes("json") ||
      mediaType.includes("javascript");
    const text = isText ? strFromU8(entry) : "";

    // Attach encryption metadata if this resource is in encryption.xml
    const encryptionInfo = this.encryptionMap?.get(path);
    const properties = encryptionInfo
      ? { encrypted: encryptionInfo }
      : undefined;

    return {
      text,
      bytes: new Uint8Array(entry).buffer,
      headers: {},
      mediaType,
      href,
      properties,
    };
  }

  async has(link: Link): Promise<boolean> {
    const path = this.resolvePath(link.href);
    return this.container.has(path);
  }

  /** List all file paths in the container. */
  list(): string[] {
    return this.container.entries();
  }

  /** Read a specific entry as raw bytes. */
  getBytes(path: string): Uint8Array | undefined {
    return this.container.get(this.resolvePath(path));
  }

  destroy(): void {
    this.container.destroy();
  }

  // ── Internal ─────────────────────────────────────────────────

  /**
   * Resolve an href to a container entry path.
   * Strips the basePath prefix, query strings, fragments, and
   * leading slashes.
   */
  private resolvePath(href: string): string {
    let path = href;

    // Strip query string and fragment
    const qIdx = path.indexOf("?");
    if (qIdx >= 0) path = path.substring(0, qIdx);
    const hIdx = path.indexOf("#");
    if (hIdx >= 0) path = path.substring(0, hIdx);

    // Strip basePath prefix
    if (this.basePath && path.startsWith(this.basePath)) {
      path = path.substring(this.basePath.length);
    }

    // Strip leading slash
    if (path.startsWith("/")) path = path.substring(1);

    // Try URL decoding (ZIP entries may have encoded characters)
    try {
      path = decodeURIComponent(path);
    } catch {
      // Keep original if decoding fails
    }

    // If exact match fails, try without directory prefix (some EPUBs
    // use OEBPS/ or OPS/ prefixes that may or may not be in the href)
    if (!this.container.has(path)) {
      for (const key of this.container.entries()) {
        if (key.endsWith("/" + path) || key === path) {
          return key;
        }
      }
    }

    return path;
  }

  /** @deprecated Use `guessMediaType` from `./mediaType` instead. */
  static guessMediaType(path: string): string {
    return guessMediaType(path);
  }
}
