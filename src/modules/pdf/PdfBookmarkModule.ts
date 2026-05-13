/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { HostType, RightsKey } from "../ReaderModule";
import { IBookmarkModule } from "../interfaces";
import { PDFModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import {
  Bookmark,
  Locator,
  Publication,
  getPageFromLocations,
} from "../../model/v3";
import Annotator from "../../store/Annotator";

export interface PdfBookmarkModuleConfig {
  annotator: Annotator;
  publication: Publication;
}

/**
 * PDF bookmark module.
 *
 * Page-based bookmarks backed by an annotator passed in at construction.
 * Writes `locations.page` (new field) and reads either `page` or
 * `position` via `getPageFromLocations` for backwards compatibility with
 * pre-rework data. Dynamic state (current resource, current page) still
 * comes from the host via `attach()`.
 */
export class PdfBookmarkModule implements IBookmarkModule<PDFModuleHost> {
  readonly name = NavigatorFeature.Bookmarks;
  readonly hostType = HostType.PDF;
  readonly rightsKey = RightsKey.Bookmarks;

  private readonly annotator: Annotator;
  private readonly publication: Publication;
  private host!: PDFModuleHost;

  constructor(config: PdfBookmarkModuleConfig) {
    this.annotator = config.annotator;
    this.publication = config.publication;
  }

  attach(host: PDFModuleHost): void {
    this.host = host;
  }

  /** Save a bookmark at the current page. Returns null if already bookmarked. */
  save(): Bookmark | null {
    if (this.hasBookmarkAt()) return null;
    return this.annotator.saveBookmark(this.makeBookmark()) ?? null;
  }

  /** Delete a previously saved bookmark. */
  delete(bookmark: Bookmark): void {
    this.annotator.deleteBookmark(bookmark);
  }

  /** Return all bookmarks for the current resource. */
  list(): Bookmark[] {
    if (!this.host.currentResourceLink) return [];
    return this.annotator.getBookmarks(
      this.publication.getAbsoluteHref(this.host.currentResourceLink.href)
    );
  }

  /**
   * True if a bookmark exists at the given locator (or current page if
   * omitted). PDF locators carry a page in `locations.position`.
   */
  hasBookmarkAt(locator?: Locator): boolean {
    return this.findBookmarkAt(locator) !== null;
  }

  /**
   * Saved bookmark at the given locator (or current page if omitted), or null.
   * For PDF, identity is page-based.
   */
  findBookmarkAt(locator?: Locator): Bookmark | null {
    const targetPage =
      (locator ? getPageFromLocations(locator.locations) : undefined) ??
      this.host.currentPage;
    return (
      this.list().find(
        (b) => getPageFromLocations(b.locations) === targetPage
      ) ?? null
    );
  }

  stop(): void {}

  // ── Internal ────────────────────────────────────────────────

  private makeBookmark(): Bookmark {
    return {
      id: crypto.randomUUID(),
      href: this.host.currentResourceLink
        ? this.publication.getAbsoluteHref(this.host.currentResourceLink.href)
        : "",
      locations: { page: this.host.currentPage },
      type: "application/pdf",
      title: `Page ${this.host.currentPage}`,
      created: new Date(),
    };
  }
}
