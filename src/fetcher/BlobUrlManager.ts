/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { Container } from "./Container";
import type { Resource } from "./Fetcher";
import type { EncryptionInfo } from "./FontDeobfuscator";
import { ZipFetcher } from "./ZipFetcher";
import { guessMediaType } from "./mediaType";

/**
 * A transform applied to resources before creating blob URLs.
 * Same signature as ResourceTransform from TransformingFetcher.
 */
type BlobTransform = (resource: Resource) => Resource | Promise<Resource>;

/**
 * Creates and manages blob URLs for resources in a Container.
 *
 * When opening an .epub file directly, the browser can't fetch images,
 * CSS, fonts, and scripts from the archive because they don't exist
 * at any HTTP URL. This manager creates blob URLs for each resource
 * so they can be referenced in document.write() iframe content.
 *
 * Transforms (e.g., font deobfuscation) can be applied to resources
 * before blob URLs are created via `addTransform()`.
 *
 * After parsing HTML content with DOMParser, call `rewriteDom(doc, baseDir)`
 * to replace relative src/href attributes with blob URLs. This works at
 * the DOM level — no regex on raw HTML.
 *
 * Call `destroy()` when done to revoke all blob URLs and free memory.
 */
export class BlobUrlManager {
  private blobUrls = new Map<string, string>();
  private readonly container: Container;
  private transforms: BlobTransform[] = [];
  private encryptionMap?: Map<string, EncryptionInfo>;

  constructor(source: Container | ZipFetcher) {
    this.container = "container" in source ? source.container : source;
  }

  /**
   * Set encryption metadata so Resources built during initialize()
   * carry `properties.encrypted`. Transforms (e.g., deobfuscation)
   * read this to know which resources to process.
   */
  setEncryptionMap(map: Map<string, EncryptionInfo>): void {
    this.encryptionMap = map;
  }

  /**
   * Add a transform applied to resources before blob URL creation.
   * Transforms run in order. Must be called before initialize().
   *
   * Example: font deobfuscation
   * ```ts
   * manager.addTransform(createDeobfuscationTransform(identifier));
   * ```
   */
  addTransform(transform: BlobTransform): void {
    this.transforms.push(transform);
  }

  /**
   * Create blob URLs for all resources in the container.
   * Call once after construction and addTransform().
   *
   * Two-pass process:
   * 1. Create blob URLs for all non-CSS resources (images, fonts, etc.)
   *    — applies any registered transforms before creating the blob URL.
   * 2. Process CSS files — rewrite internal url() references to the
   *    blob URLs from pass 1, THEN create blob URLs for the rewritten CSS.
   *
   * This ensures that when the browser loads a CSS file via its blob URL,
   * font/image/background references inside it also point to blob URLs.
   */
  async initialize(): Promise<void> {
    const cssEntries: Array<{ path: string; bytes: Uint8Array }> = [];

    // Pass 1: non-CSS resources → blob URLs
    for (const path of this.container.entries()) {
      if (path.endsWith("/")) continue;
      const rawBytes = this.container.get(path);
      if (!rawBytes) continue;

      const mediaType = guessMediaType(path);
      if (mediaType === "text/css") {
        cssEntries.push({ path, bytes: rawBytes });
        continue;
      }

      // Apply transforms (e.g., font deobfuscation)
      let bytes: Uint8Array = rawBytes;
      if (this.transforms.length > 0) {
        const encryptionInfo = this.encryptionMap?.get(path);
        let resource: Resource = {
          text: "",
          bytes: new Uint8Array(rawBytes).buffer,
          headers: {},
          mediaType,
          href: path,
          properties: encryptionInfo
            ? { encrypted: encryptionInfo }
            : undefined,
        };
        for (const transform of this.transforms) {
          resource = await transform(resource);
        }
        if (resource.bytes) {
          bytes = new Uint8Array(resource.bytes);
        }
      }

      const blob = new Blob([new Uint8Array(bytes)], { type: mediaType });
      this.blobUrls.set(path, URL.createObjectURL(blob));
    }

    // Pass 2: CSS files — rewrite url() then create blob URLs
    for (const { path, bytes } of cssEntries) {
      let cssText = new TextDecoder().decode(bytes);
      const cssDir = path.includes("/")
        ? path.substring(0, path.lastIndexOf("/") + 1)
        : "";
      cssText = this.rewriteCssUrls(cssText, cssDir);
      const blob = new Blob([cssText], { type: "text/css" });
      this.blobUrls.set(path, URL.createObjectURL(blob));
    }
  }

  /**
   * Rewrite resource references in a parsed DOM to blob URLs.
   *
   * Traverses the document and replaces relative `src`, `href`, and
   * `xlink:href` attributes on img, link, script, image, use, audio,
   * video, and source elements with their corresponding blob URLs.
   *
   * Also strips any Content-Security-Policy meta tags that would block
   * the injected ReadiumCSS stylesheets.
   *
   * @param doc — the parsed XHTML document
   * @param currentPath — the ZIP-internal path of the current HTML file
   *   (e.g., "OEBPS/Text/chapter1.xhtml"). Used to resolve relative URLs.
   */
  rewriteDom(doc: Document, currentPath: string): void {
    const baseDir = currentPath.includes("/")
      ? currentPath.substring(0, currentPath.lastIndexOf("/") + 1)
      : "";

    // Defer EPUB scripts so they execute AFTER document.write() finishes.
    // Without this, scripts that call document.write() themselves would
    // clear the body content during the iframe write.
    const scripts = doc.querySelectorAll("script");
    scripts.forEach((element) => {
      element.setAttribute("defer", "");
    });

    // Elements with src attribute
    const srcElements = doc.querySelectorAll(
      "img, script, audio, video, source, input[type=image]"
    );
    srcElements.forEach((element) => {
      const src = element.getAttribute("src");
      if (src && !this.isAbsolute(src)) {
        const resolved = this.resolve(baseDir, src);
        const blobUrl = this.blobUrls.get(resolved);
        if (blobUrl) element.setAttribute("src", blobUrl);
      }
    });

    // Elements with href attribute (CSS, links)
    const hrefElements = doc.querySelectorAll("link[href], a[href]");
    hrefElements.forEach((element) => {
      const href = element.getAttribute("href");
      if (href && !this.isAbsolute(href) && !href.startsWith("#")) {
        const resolved = this.resolve(baseDir, href);
        const blobUrl = this.blobUrls.get(resolved);
        if (blobUrl) element.setAttribute("href", blobUrl);
      }
    });

    // SVG elements with xlink:href
    const xlinkElements = doc.querySelectorAll("[*|href]");
    xlinkElements.forEach((element) => {
      const href =
        element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
        element.getAttribute("xlink:href");
      if (href && !this.isAbsolute(href) && !href.startsWith("#")) {
        const resolved = this.resolve(baseDir, href);
        const blobUrl = this.blobUrls.get(resolved);
        if (blobUrl) {
          element.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "href",
            blobUrl
          );
        }
      }
    });

    // Rewrite CSS url() references in inline styles and <style> blocks
    const styleElements = doc.querySelectorAll("style");
    styleElements.forEach((element) => {
      if (element.textContent) {
        element.textContent = this.rewriteCssUrls(element.textContent, baseDir);
      }
    });

    // Rewrite inline style attributes with url()
    const styledElements = doc.querySelectorAll("[style]");
    styledElements.forEach((element) => {
      const style = element.getAttribute("style");
      if (style && style.includes("url(")) {
        element.setAttribute("style", this.rewriteCssUrls(style, baseDir));
      }
    });

    // Strip CSP meta tags that would block ReadiumCSS injectables
    const cspMetas = doc.querySelectorAll(
      'meta[http-equiv="Content-Security-Policy"]'
    );
    cspMetas.forEach((meta) => meta.remove());
  }

  /**
   * Rewrite url() and @import references in CSS text.
   *
   * Handles:
   * - `url("path")` / `url('path')` / `url(path)` — standard references
   * - `@import url("path")` — url()-form imports (caught by the url() regex)
   * - `@import "path"` / `@import 'path'` — bare string imports
   */
  private rewriteCssUrls(css: string, baseDir: string): string {
    // Rewrite url() references (also catches @import url("..."))
    let result = css.replace(
      /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
      (match, url) => {
        if (this.isAbsolute(url) || url.startsWith("data:")) return match;
        const resolved = this.resolve(baseDir, url);
        const blobUrl = this.blobUrls.get(resolved);
        return blobUrl ? `url("${blobUrl}")` : match;
      }
    );

    // Rewrite bare @import "path" / @import 'path' (not caught by url() regex)
    result = result.replace(/@import\s+["']([^"']+)["']/gi, (match, url) => {
      if (this.isAbsolute(url) || url.startsWith("data:")) return match;
      const resolved = this.resolve(baseDir, url);
      const blobUrl = this.blobUrls.get(resolved);
      return blobUrl ? `@import "${blobUrl}"` : match;
    });

    return result;
  }

  private isAbsolute(url: string): boolean {
    return (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      // eslint-disable-next-line no-script-url
      url.startsWith("javascript:") ||
      // eslint-disable-next-line no-script-url
      url.startsWith("vbscript:") ||
      url.startsWith("mailto:")
    );
  }

  private resolve(baseDir: string, relative: string): string {
    let path = relative.split("?")[0].split("#")[0];
    const parts = (baseDir + path).split("/");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") resolved.pop();
      else if (part !== "." && part !== "") resolved.push(part);
    }
    return resolved.join("/");
  }

  destroy(): void {
    for (const url of this.blobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
  }
}
