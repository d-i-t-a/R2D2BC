/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { Publication } from "../model/v3/Publication";
import type { ZipFetcher } from "./ZipFetcher";

/** Recursive TOC entry used during EPUB parsing. */
interface TocEntry {
  href: string;
  title?: string;
  children?: TocEntry[];
}

/**
 * Client-side EPUB parser.
 *
 * Reads an EPUB archive (via ZipFetcher) and produces a Publication
 * (Readium RWPM format). Handles EPUB 2 and EPUB 3:
 *
 * 1. META-INF/container.xml → find the OPF rootfile path
 * 2. OPF → parse metadata, manifest items, spine, TOC
 * 3. Convert to the normalized JSON shape that Publication.fromJSON() expects
 *
 * Metadata: title, language, identifier, authors, publisher, description,
 * subjects, published date, modified date, numberOfPages, layout,
 * readingProgression, rendition properties, media overlay classes.
 *
 * Spine: reading order with page-spread properties, linear="no" filtering,
 * page-progression-direction.
 *
 * Resources: non-spine manifest items + non-linear spine items, cover image
 * detection (EPUB3 cover-image property + EPUB2 meta name="cover").
 *
 * TOC: EPUB3 nav document with fallback to EPUB2 NCX.
 */
export class EpubParser {
  /**
   * Extract just the dc:identifier from an EPUB without full parsing.
   * Used to generate a unique synthetic URL before the full parse.
   */
  static async extractIdentifier(zip: ZipFetcher): Promise<string> {
    try {
      const containerResource = await zip.getByHref("META-INF/container.xml");
      const containerDoc = new DOMParser().parseFromString(
        containerResource.text,
        "application/xml"
      );
      const opfPath =
        containerDoc
          .querySelector("rootfile[full-path]")
          ?.getAttribute("full-path") ?? "";
      if (!opfPath) return "unknown";

      const opfResource = await zip.getByHref(opfPath);
      const opfDoc = new DOMParser().parseFromString(
        opfResource.text,
        "application/xml"
      );
      const identifier =
        opfDoc.querySelector("metadata identifier")?.textContent?.trim() ?? "";
      return identifier || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Parse an EPUB from a ZipFetcher and return a Publication.
   *
   * @param zip — ZipFetcher wrapping the .epub archive
   * @param baseUrl — synthetic base URL for the publication
   *   (e.g. `blob:...` or `epub://local/`). Used for href resolution.
   */
  static async parse(zip: ZipFetcher, baseUrl: URL): Promise<Publication> {
    // 1. Read container.xml
    const containerResource = await zip.getByHref("META-INF/container.xml");
    const containerDoc = new DOMParser().parseFromString(
      containerResource.text,
      "application/xml"
    );
    const rootfileElement = containerDoc.querySelector("rootfile[full-path]");
    const opfPath = rootfileElement?.getAttribute("full-path");
    if (!opfPath) {
      throw new Error("EpubParser: no rootfile found in container.xml");
    }

    // OPF directory — used to resolve relative hrefs in manifest items
    const opfDir = opfPath.includes("/")
      ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
      : "";

    // 2. Read and parse OPF
    const opfResource = await zip.getByHref(opfPath);
    const opfDoc = new DOMParser().parseFromString(
      opfResource.text,
      "application/xml"
    );

    // ── Top-level OPF elements ─────────────────────────────────
    const metadataElement = opfDoc.querySelector("metadata");
    const manifestElement = opfDoc.querySelector("manifest");
    const spineElement = opfDoc.querySelector("spine");

    // ── Metadata ────────────────────────────────────────────────
    const title =
      metadataElement?.querySelector("title")?.textContent?.trim() ?? "";
    const language =
      metadataElement?.querySelector("language")?.textContent?.trim() ?? "en";
    const identifier =
      metadataElement?.querySelector("identifier")?.textContent?.trim() ?? "";

    // Authors (dc:creator elements)
    const creatorElements = metadataElement?.querySelectorAll("creator") ?? [];
    const authors: Array<{ name: string }> = [];
    creatorElements.forEach((element) => {
      const name = element.textContent?.trim();
      if (name) authors.push({ name });
    });

    // Publisher
    const publisher =
      metadataElement?.querySelector("publisher")?.textContent?.trim() ??
      undefined;

    // Description
    const description =
      metadataElement?.querySelector("description")?.textContent?.trim() ??
      undefined;

    // Subjects
    const subjectElements = metadataElement?.querySelectorAll("subject") ?? [];
    const subjects: string[] = [];
    subjectElements.forEach((element) => {
      const text = element.textContent?.trim();
      if (text) subjects.push(text);
    });

    // Published date (dc:date)
    const published =
      metadataElement?.querySelector("date")?.textContent?.trim() ?? undefined;

    // Modified (dcterms:modified)
    const modifiedMeta = metadataElement?.querySelector(
      'meta[property="dcterms:modified"]'
    );
    const modified = modifiedMeta?.textContent?.trim() ?? undefined;

    // Number of pages
    const pagesMeta = metadataElement?.querySelector(
      'meta[property="schema:numberOfPages"]'
    );
    const numberOfPages = pagesMeta
      ? parseInt(pagesMeta.textContent?.trim() ?? "", 10) || undefined
      : undefined;

    // Layout (fixed or reflowable)
    // EPUB3: <meta property="rendition:layout">pre-paginated</meta>
    // EPUB2: <meta name="fixed-layout" content="true"/>
    const layoutMeta = metadataElement?.querySelector(
      'meta[property="rendition:layout"]'
    );
    let layout = layoutMeta?.textContent?.trim() ?? "";
    if (!layout) {
      const fixedLayoutMeta = metadataElement?.querySelector(
        'meta[name="fixed-layout"]'
      );
      if (fixedLayoutMeta?.getAttribute("content") === "true") {
        layout = "pre-paginated";
      }
    }
    if (!layout) layout = "reflowable";

    // Reading progression (page-progression-direction on spine)
    // Also check rendition:spread and rendition:orientation for FXL
    const pageProgressionDirection = spineElement?.getAttribute(
      "page-progression-direction"
    );
    const readingProgression =
      pageProgressionDirection === "rtl"
        ? "rtl"
        : pageProgressionDirection === "ltr"
          ? "ltr"
          : undefined;

    // Rendition properties — go into otherMetadata for navigator consumption
    const renditionSpreadMeta = metadataElement?.querySelector(
      'meta[property="rendition:spread"]'
    );
    const renditionSpread =
      renditionSpreadMeta?.textContent?.trim() ?? undefined;

    const renditionOrientationMeta = metadataElement?.querySelector(
      'meta[property="rendition:orientation"]'
    );
    const renditionOrientation =
      renditionOrientationMeta?.textContent?.trim() ?? undefined;

    // ── Manifest items (id → href + mediaType map) ──────────────
    const itemElements = manifestElement?.querySelectorAll("item") ?? [];
    const itemMap = new Map<
      string,
      { href: string; type: string; properties?: string }
    >();
    itemElements.forEach((item) => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      const mediaType = item.getAttribute("media-type") ?? "";
      const properties = item.getAttribute("properties") ?? undefined;
      if (id && href) {
        itemMap.set(id, {
          href: opfDir + href,
          type: mediaType,
          properties,
        });
      }
    });

    // ── Spine → readingOrder ────────────────────────────────────
    const itemrefElements = spineElement?.querySelectorAll("itemref") ?? [];
    const readingOrder: Array<{
      href: string;
      type?: string;
      properties?: Record<string, string>;
    }> = [];
    // Non-linear spine items go to resources, not readingOrder
    const nonLinearItems: Array<{ href: string; type?: string }> = [];
    const spineIds = new Set<string>();

    itemrefElements.forEach((itemref) => {
      const idref = itemref.getAttribute("idref");
      if (!idref) return;
      const item = itemMap.get(idref);
      if (!item) return;
      spineIds.add(idref);

      // linear="no" items are non-linear (e.g. footnotes, glossary)
      const linear = itemref.getAttribute("linear");
      if (linear === "no") {
        nonLinearItems.push({ href: item.href, type: item.type });
        return;
      }

      const entry: {
        href: string;
        type?: string;
        properties?: Record<string, string>;
      } = {
        href: item.href,
        type: item.type,
      };
      // Page spread properties from spine itemref
      const spreadAttr = itemref.getAttribute("properties");
      if (spreadAttr) {
        entry.properties = { page: spreadAttr };
      }
      readingOrder.push(entry);
    });

    // ── Resources (everything in manifest not in spine + non-linear spine items)
    const resources: Array<{
      href: string;
      type?: string;
      rel?: string;
    }> = [...nonLinearItems];
    // EPUB2 cover meta: <meta name="cover" content="cover-image-id"/>
    const coverMetaId =
      metadataElement
        ?.querySelector('meta[name="cover"]')
        ?.getAttribute("content") ?? undefined;

    itemMap.forEach((item, id) => {
      if (!spineIds.has(id)) {
        const entry: { href: string; type?: string; rel?: string } = {
          href: item.href,
          type: item.type,
        };
        // Mark cover image (EPUB3: properties="cover-image", EPUB2: meta name="cover")
        if (item.properties?.includes("cover-image") || id === coverMetaId) {
          entry.rel = "cover";
        }
        resources.push(entry);
      }
    });

    // ── TOC ─────────────────────────────────────────────────────
    let toc: TocEntry[] = [];

    // Try EPUB3 nav document first (properties="nav")
    const navItem = [...itemMap.values()].find((item) =>
      item.properties?.includes("nav")
    );
    if (navItem) {
      try {
        const navResource = await zip.getByHref(navItem.href);
        toc = EpubParser.parseNavToc(navResource.text, opfDir);
      } catch {
        // Nav parse failure — fall through to NCX
      }
    }

    // Fallback to EPUB2 NCX if no nav TOC found
    if (toc.length === 0) {
      const spineToc = spineElement?.getAttribute("toc");
      const ncxItem = spineToc ? itemMap.get(spineToc) : undefined;
      if (ncxItem) {
        try {
          const ncxResource = await zip.getByHref(ncxItem.href);
          toc = EpubParser.parseNcxToc(ncxResource.text, opfDir);
        } catch {
          // NCX parse failure is non-fatal — continue without TOC
        }
      }
    }

    // Media overlay active/playback classes
    const mediaOverlayActiveClass = metadataElement
      ?.querySelector('meta[property="media:active-class"]')
      ?.textContent?.trim();
    const mediaOverlayPlaybackActiveClass = metadataElement
      ?.querySelector('meta[property="media:playback-active-class"]')
      ?.textContent?.trim();

    // 3. Build the normalized manifest JSON (Readium RWPM format)
    const metadata: Record<string, unknown> = {
      title,
      language,
      identifier,
      author: authors.length > 0 ? authors : undefined,
      ...(publisher ? { publisher: { name: publisher } } : {}),
      ...(description ? { description } : {}),
      ...(subjects.length > 0 ? { subject: subjects } : {}),
      ...(published ? { published } : {}),
      ...(modified ? { modified } : {}),
      ...(numberOfPages ? { numberOfPages } : {}),
      ...(readingProgression ? { readingProgression } : {}),
      ...(layout === "pre-paginated" ? { layout: "fixed" } : {}),
    };

    // Rendition properties and media overlay classes go into otherMetadata
    // so the navigator can read them (it checks otherMetadata for these)
    const otherMetadata: Record<string, string> = {};
    if (renditionSpread) otherMetadata["rendition:spread"] = renditionSpread;
    if (renditionOrientation)
      otherMetadata["rendition:orientation"] = renditionOrientation;
    if (mediaOverlayActiveClass)
      otherMetadata["media:active-class"] = mediaOverlayActiveClass;
    if (mediaOverlayPlaybackActiveClass)
      otherMetadata["media:playback-active-class"] =
        mediaOverlayPlaybackActiveClass;
    if (Object.keys(otherMetadata).length > 0) {
      metadata.otherMetadata = otherMetadata;
    }

    const manifestJson = {
      metadata,
      readingOrder,
      resources,
      toc,
      links: [],
    };

    const publication = Publication.fromJSON(manifestJson, baseUrl);
    if (!publication) {
      throw new Error("EpubParser: failed to create Publication from OPF");
    }
    return publication;
  }

  /**
   * Parse the EPUB 3 nav document (XHTML) to extract the TOC.
   * Looks for `<nav epub:type="toc">` and extracts the `<ol>` structure.
   */
  private static parseNavToc(navHtml: string, opfDir: string): TocEntry[] {
    const doc = new DOMParser().parseFromString(
      navHtml,
      "application/xhtml+xml"
    );

    // Find the TOC nav element
    const tocNav =
      doc.querySelector('nav[epub\\:type="toc"]') ??
      doc.querySelector('nav[role="doc-toc"]') ??
      doc.querySelector("nav");

    if (!tocNav) return [];

    const parseOl = (ol: Element): TocEntry[] => {
      const items: TocEntry[] = [];
      const lis = ol.querySelectorAll(":scope > li");
      lis.forEach((li) => {
        const anchor = li.querySelector(":scope > a");
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        const title = anchor.textContent?.trim();
        if (!href) return;

        const entry: TocEntry = {
          href: opfDir + href,
          title,
        };

        // Recurse into nested <ol> for sub-chapters
        const childOl = li.querySelector(":scope > ol");
        if (childOl) {
          entry.children = parseOl(childOl);
        }
        items.push(entry);
      });
      return items;
    };

    const rootOl = tocNav.querySelector("ol");
    return rootOl ? parseOl(rootOl) : [];
  }

  /**
   * Parse an EPUB2 NCX table of contents.
   */
  private static parseNcxToc(ncxText: string, opfDir: string): TocEntry[] {
    const doc = new DOMParser().parseFromString(ncxText, "application/xml");

    const parseNavPoints = (parent: Element): TocEntry[] => {
      const items: TocEntry[] = [];
      const navPoints = parent.querySelectorAll(":scope > navPoint");
      navPoints.forEach((navPoint) => {
        const label = navPoint
          .querySelector("navLabel text")
          ?.textContent?.trim();
        const src = navPoint.querySelector("content")?.getAttribute("src");
        if (!src) return;

        const entry: TocEntry = {
          href: opfDir + src,
          title: label,
        };

        // Recurse into nested navPoints
        const childNavPoints = navPoint.querySelectorAll(":scope > navPoint");
        if (childNavPoints.length > 0) {
          entry.children = parseNavPoints(navPoint);
        }
        items.push(entry);
      });
      return items;
    };

    const navMap = doc.querySelector("navMap");
    return navMap ? parseNavPoints(navMap) : [];
  }
}
