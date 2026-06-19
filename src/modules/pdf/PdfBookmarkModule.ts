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
import { ReaderEvent } from "../../utils/Events";
import type { InitialAnnotations } from "../../navigator/ReaderConfig";

/**
 * Integrator-supplied write-through hooks for PDF bookmarks. Mirrors
 * EPUB's `BookmarkModuleAPI` exactly.
 *
 * `addBookmark` runs before the module persists locally — the returned
 * `Bookmark` is what gets written to the annotator (integrator can
 * stamp an id, server timestamp, etc.). `deleteBookmark` runs before
 * the module deletes locally.
 */
export interface PdfBookmarkModuleAPI {
  addBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
  deleteBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
}

export interface PdfBookmarkModuleConfig {
  annotator: Annotator;
  publication: Publication;
  /**
   * Previously-persisted annotations to restore the annotator from on
   * `attach()`. When supplied, the module calls
   * `annotator.initBookmarks(initialAnnotations.bookmarks)` so the
   * integrator can restore from server-side / external persistence
   * before the first `list()` call. Mirrors the EPUB `BookmarkModule`
   * shape.
   */
  initialAnnotations?: InitialAnnotations;
  /**
   * Optional integrator write-through callbacks. When provided, the
   * module awaits the matching callback before mutating the annotator
   * so server-side persistence can fail the operation. Mirrors the EPUB
   * `BookmarkModule` API shape.
   */
  api?: PdfBookmarkModuleAPI;
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
  private readonly initialAnnotations?: InitialAnnotations;
  private readonly api?: PdfBookmarkModuleAPI;
  private host!: PDFModuleHost;

  constructor(config: PdfBookmarkModuleConfig) {
    this.annotator = config.annotator;
    this.publication = config.publication;
    this.initialAnnotations = config.initialAnnotations;
    this.api = config.api;
  }

  attach(host: PDFModuleHost): void {
    this.host = host;
    // Treat initialAnnotations as source of truth — overwrite local
    // storage even when empty so a prior user's bookmarks on a shared
    // browser don't leak through.
    if (this.initialAnnotations) {
      this.annotator?.initBookmarks(this.initialAnnotations.bookmarks ?? []);
    }
  }

  /**
   * Save a bookmark at the current page. Returns null if already
   * bookmarked. If an `api.addBookmark` callback is configured, awaits
   * it before persisting locally so the integrator's server can either
   * accept the bookmark (possibly with a server-stamped id) or refuse.
   * Emits `ReaderEvent.BookmarkCreated` on success.
   */
  async save(): Promise<Bookmark | null> {
    if (this.hasBookmarkAt()) return null;
    let bookmark = this.makeBookmark();
    // Guard: no current resource → empty href → don't POST garbage to the integrator
    if (!bookmark.href) return null;
    if (this.api?.addBookmark) {
      bookmark = await this.api.addBookmark(bookmark);
    }
    const saved = this.annotator.saveBookmark(bookmark) ?? null;
    if (saved) {
      this.host.emit(ReaderEvent.BookmarkCreated, saved);
    }
    return saved;
  }

  /**
   * Delete a previously saved bookmark. If an `api.deleteBookmark`
   * callback is configured, awaits it before deleting locally so the
   * integrator's server can either accept the deletion or refuse.
   * Emits `ReaderEvent.BookmarkDeleted` on success.
   */
  async delete(bookmark: Bookmark): Promise<void> {
    if (this.api?.deleteBookmark) {
      await this.api.deleteBookmark(bookmark);
    }
    this.annotator.deleteBookmark(bookmark);
    this.host.emit(ReaderEvent.BookmarkDeleted, bookmark);
  }

  /** Return all bookmarks for the current resource. */
  list(): Bookmark[] {
    if (!this.host.currentResourceLink) return [];
    return this.annotator.getBookmarks(this.host.currentResourceLink.href);
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
      href: this.host.currentResourceLink?.href ?? "",
      locations: { page: this.host.currentPage },
      type: "application/pdf",
      title: `Page ${this.host.currentPage}`,
      created: new Date(),
    };
  }
}
