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
import { AudiobookModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/NavigatorFeature";
import { Bookmark, Locator, Publication } from "../../model/v3";
import Annotator from "../../store/Annotator";
import { ReaderEvent } from "../../utils/Events";

/**
 * `H:MM:SS` (or `M:SS`) formatter for bookmark timestamps. Local to
 * this module — small enough not to be worth a shared utility yet.
 */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface AudiobookBookmarkModuleConfig {
  annotator: Annotator;
  publication: Publication;
  /**
   * Container the bookmark list renders into. Optional. When supplied,
   * the module writes its inner DOM (chapter-grouped rows, time, delete
   * button) inside and re-renders on `bookmark.created` / `bookmark.deleted`.
   * Without a container the module is data-only (`list()` plus events).
   */
  listContainer?: HTMLElement | null;
}

/**
 * Audiobook bookmark module.
 *
 * Time-based bookmarks backed by an annotator passed in at
 * construction. Identity is `(href, time)` — two bookmarks at the same
 * resource within `MATCH_TOLERANCE_SECONDS` of each other are
 * considered the same bookmark.
 *
 * Mirrors EPUB / PDF bookmark module shapes:
 * - constructor takes static deps (annotator, publication) directly
 * - `attach(host)` for dynamic state (current locator)
 * - implements `IBookmarkModule`
 */
export class AudiobookBookmarkModule implements IBookmarkModule<AudiobookModuleHost> {
  readonly name = NavigatorFeature.Bookmarks;
  readonly hostType = HostType.Audiobook;
  readonly rightsKey = RightsKey.Bookmarks;

  /**
   * Two bookmarks at the same href within this many seconds of each
   * other are considered the same bookmark. Audio playback time is
   * never exactly reproducible across `seek` round-trips, so a small
   * tolerance avoids accidental duplicates when the user toggles a
   * bookmark on the same word twice.
   */
  static readonly MATCH_TOLERANCE_SECONDS = 1;

  private readonly annotator: Annotator;
  private readonly publication: Publication;
  private readonly listContainer?: HTMLElement | null;
  private host!: AudiobookModuleHost;

  /**
   * Async factory mirroring EpubBookmarkModule.create — keeps the
   * construction shape consistent across navigators so D2Reader.load
   * uses the same `await Module.create({...})` everywhere.
   */
  public static async create(
    config: AudiobookBookmarkModuleConfig
  ): Promise<AudiobookBookmarkModule> {
    return new AudiobookBookmarkModule(config);
  }

  public constructor(config: AudiobookBookmarkModuleConfig) {
    this.annotator = config.annotator;
    this.publication = config.publication;
    this.listContainer = config.listContainer;
  }

  attach(host: AudiobookModuleHost): void {
    this.host = host;
    if (this.listContainer) this.renderList();
  }

  /**
   * Save a bookmark at the current playback position. Returns null if
   * already bookmarked. Emits `BookmarkCreated` so subscribers (UI list,
   * scrubber markers, integrator analytics) can refresh without polling.
   */
  save(): Bookmark | null {
    if (this.hasBookmarkAt()) return null;
    const bookmark = this.makeBookmark();
    if (!bookmark) return null;
    const saved = this.annotator.saveBookmark(bookmark) ?? null;
    if (saved) {
      this.host.emit(ReaderEvent.BookmarkCreated, saved);
      if (this.listContainer) this.renderList();
    }
    return saved;
  }

  /**
   * Delete a previously saved bookmark. Emits `BookmarkDeleted` with the
   * removed bookmark for the same reasons as `save`.
   */
  delete(bookmark: Bookmark): void {
    this.annotator.deleteBookmark(bookmark);
    this.host.emit(ReaderEvent.BookmarkDeleted, bookmark);
    if (this.listContainer) this.renderList();
  }

  /**
   * Return all bookmarks for this publication across resources
   * (matches EpubBookmarkModule.list — audiobook chapters are
   * traversed during playback, so the user expects a single
   * consolidated list rather than a per-chapter view).
   */
  list(): Bookmark[] {
    return this.annotator.getBookmarks() as Bookmark[];
  }

  /**
   * True if a bookmark exists at the given locator (or current playback
   * position if omitted), within MATCH_TOLERANCE_SECONDS.
   */
  hasBookmarkAt(locator?: Locator): boolean {
    return this.findBookmarkAt(locator) !== null;
  }

  /**
   * Saved bookmark at the given locator (or current playback position),
   * or null. Identity is `(href, time)` with a ±MATCH_TOLERANCE_SECONDS
   * tolerance on `time`.
   */
  findBookmarkAt(locator?: Locator): Bookmark | null {
    const target = locator ?? this.host.currentLocator();
    const href = target.href;
    const time = target.locations?.time;
    if (!href || typeof time !== "number") return null;

    const tolerance = AudiobookBookmarkModule.MATCH_TOLERANCE_SECONDS;
    const candidates = this.annotator.getBookmarks(
      this.publication.getAbsoluteHref(href)
    );
    return (
      candidates.find((bookmark) => {
        const bookmarkTime = bookmark.locations?.time;
        return (
          typeof bookmarkTime === "number" &&
          Math.abs(bookmarkTime - time) <= tolerance
        );
      }) ?? null
    );
  }

  stop(): void {
    if (this.listContainer) this.listContainer.innerHTML = "";
  }

  // ── List rendering ──────────────────────────────────────────

  /**
   * Build a chapter-grouped bookmark list inside the integrator-supplied
   * container. Each row shows the bookmark time + a delete button;
   * clicking the row navigates to the bookmark via the host's `goTo`.
   * Re-rendered on every save/delete — full DOM rebuild because lists
   * are short (typically tens of bookmarks per book) and the rebuild
   * keeps grouping/sorting code in one place.
   */
  private renderList(): void {
    const host = this.listContainer;
    if (!host) return;
    host.innerHTML = "";
    const bookmarks = this.list();
    if (bookmarks.length === 0) return;
    const order = this.publication.readingOrder;
    const root = document.createElement("ol");
    root.className = "dita-audiobook-bookmarks";
    order.forEach((link, chapterIndex) => {
      const absHref = this.publication.getAbsoluteHref(link.href);
      const inThisChapter = bookmarks
        .filter((b) => b.href === absHref)
        .sort((a, b) => (a.locations?.time ?? 0) - (b.locations?.time ?? 0));
      if (inThisChapter.length === 0) return;
      const heading = document.createElement("li");
      heading.className = "dita-audiobook-bookmarks-heading";
      heading.textContent = link.title || `Track ${chapterIndex + 1}`;
      root.appendChild(heading);
      for (const bookmark of inThisChapter) {
        root.appendChild(this.buildRow(bookmark, link.href));
      }
    });
    host.appendChild(root);
  }

  private buildRow(bookmark: Bookmark, chapterHref: string): HTMLElement {
    const row = document.createElement("li");
    row.className = "dita-audiobook-bookmarks-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");

    const time = document.createElement("span");
    time.className = "dita-audiobook-bookmarks-time";
    time.textContent = formatTime(bookmark.locations?.time ?? 0);
    row.appendChild(time);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "dita-audiobook-bookmarks-delete";
    del.setAttribute("aria-label", "Delete bookmark");
    del.textContent = "✕";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      this.delete(bookmark);
    });
    row.appendChild(del);

    const onActivate = (event: Event): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      void this.host.goTo({
        href: chapterHref,
        locations: { time: bookmark.locations?.time ?? 0 },
      });
    };
    row.addEventListener("click", onActivate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(event);
      }
    });
    return row;
  }

  // ── Internal ────────────────────────────────────────────────

  private makeBookmark(): Bookmark | null {
    const locator = this.host.currentLocator();
    if (!locator.href) return null;
    return {
      id: crypto.randomUUID(),
      href: this.publication.getAbsoluteHref(locator.href),
      type: locator.type ?? "audio/*",
      title: locator.title,
      locations: locator.locations,
      created: new Date(),
    };
  }
}
