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
import { Bookmark, getPageFromLocations } from "../../model/v3";

/**
 * PDF bookmark module.
 *
 * Page-based bookmarks backed by the host annotator. Replaces the inline
 * bookmark methods previously on PDFNavigator. Writes `locations.page`
 * (new field) and reads either `page` or `position` via
 * `getPageFromLocations` for backwards compatibility with pre-rework data.
 */
export class PdfBookmarkModule implements IBookmarkModule<PDFModuleHost> {
  readonly name = NavigatorFeature.Bookmarks;
  readonly hostType = HostType.PDF;
  readonly rightsKey = RightsKey.Bookmarks;

  private host!: PDFModuleHost;
  attach(host: PDFModuleHost): void {
    this.host = host;
  }

  /** Save a bookmark at the current page. Returns null if already bookmarked. */
  save(): Bookmark | null {
    if (!this.host.annotator) return null;
    if (this.isCurrentBookmarked()) return null;
    return this.host.annotator.saveBookmark(this.makeBookmark()) ?? null;
  }

  /** Delete a previously saved bookmark. */
  delete(bookmark: Bookmark): void {
    this.host.annotator?.deleteBookmark(bookmark);
  }

  /** Return all bookmarks for the current resource. */
  list(): Bookmark[] {
    if (!this.host.annotator || !this.host.currentResourceLink) return [];
    return this.host.annotator.getBookmarks(
      this.host.publication.getAbsoluteHref(this.host.currentResourceLink.href)
    );
  }

  /** True if the current page already has a bookmark. */
  isCurrentBookmarked(): boolean {
    return this.list().some(
      (b) => getPageFromLocations(b.locations) === this.host.currentPage
    );
  }

  stop(): void {}

  // ── Internal ────────────────────────────────────────────────

  private makeBookmark(): Bookmark {
    return {
      id: crypto.randomUUID(),
      href: this.host.currentResourceLink
        ? this.host.publication.getAbsoluteHref(
            this.host.currentResourceLink.href
          )
        : "",
      locations: { page: this.host.currentPage },
      type: "application/pdf",
      title: `Page ${this.host.currentPage}`,
      created: new Date(),
    };
  }
}
