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
import { ICommentsModule } from "../interfaces";
import { AudiobookModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/NavigatorFeature";
import { Comment, Locator, Publication } from "../../model/v3";
import { ReaderEvent } from "../../utils/Events";
import Annotator from "../../store/Annotator";
import type { InitialAnnotations } from "../../navigator/ReaderConfig";

/**
 * `H:MM:SS` (or `M:SS`) formatter for comment timestamps. Local to
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

/**
 * Callback the integrator supplies to handle the "edit" action on a
 * comment-list row. Receives the comment to edit; integrator owns the
 * edit UX (inline form, modal, etc.) and calls `module.update(id, body)`
 * when the user saves. Optional — without a callback, the edit button
 * is hidden.
 */
export type CommentEditHandler = (comment: Comment) => void;

/**
 * Integrator-supplied write-through hooks for audiobook comments.
 * Mirrors the EPUB `BookmarkModuleAPI` / `AnnotationModuleAPI` shape.
 *
 * Each callback runs before the module mutates the annotator so
 * server-side persistence can either accept (with a stamped id) or
 * refuse the operation.
 */
export interface AudiobookCommentsModuleAPI {
  addComment: (comment: Comment) => Promise<Comment>;
  updateComment: (comment: Comment) => Promise<Comment>;
  deleteComment: (comment: Comment) => Promise<Comment>;
}

export interface AudiobookCommentsModuleConfig {
  annotator: Annotator;
  publication: Publication;
  /**
   * Container the comment list renders into. Optional. When supplied,
   * the module writes its inner DOM (chapter-grouped rows with body,
   * time, edit button, delete button) inside and re-renders on
   * `comment.created` / `comment.updated` / `comment.deleted`. Without
   * a container the module is data-only (`list()`, `findAt()`, events).
   */
  listContainer?: HTMLElement | null;
  /**
   * Optional integrator callback invoked when the user clicks the row's
   * edit button. The integrator owns the edit UX and is expected to
   * call `module.update(id, body)` with the new text. When omitted,
   * the edit button is hidden — the row remains clickable to navigate.
   */
  onEdit?: CommentEditHandler;
  /**
   * Previously-persisted annotations to restore the annotator from on
   * `attach()`. When supplied, the module calls
   * `annotator.initComments(initialAnnotations.comments)` so the
   * integrator can restore from server-side / external persistence
   * before the first `list()` call.
   */
  initialAnnotations?: InitialAnnotations;
  /**
   * Optional integrator write-through callbacks. When provided, the
   * module awaits the matching callback before mutating the annotator
   * so server-side persistence can fail the operation.
   */
  api?: AudiobookCommentsModuleAPI;
}

/**
 * Audiobook comments module.
 *
 * Free-text user notes anchored to a moment `(href, time)` in the
 * audiobook. Distinct from bookmarks (plain markers) and from
 * annotations (which require a text selection — not applicable to
 * audio without a transcript).
 *
 * Comments are visible during playback within a per-comment time
 * window — `displayBefore` seconds before the anchor through
 * `displayAfter` seconds after it. The module subscribes to the
 * navigator's `TimeUpdated` event and emits `CommentsActive` whenever
 * the set of currently-visible comments changes.
 *
 * Single-user only. Threading / replies / multi-user belongs above
 * this module (integrator-supplied backend).
 */
export class AudiobookCommentsModule implements ICommentsModule<AudiobookModuleHost> {
  readonly name = NavigatorFeature.Comments;
  readonly hostType = HostType.Audiobook;
  readonly rightsKey = RightsKey.Comments;

  /** Default seconds before anchor time to start showing a comment. */
  static readonly DEFAULT_DISPLAY_BEFORE_SECONDS = 5;
  /** Default seconds after anchor time to stop showing a comment. */
  static readonly DEFAULT_DISPLAY_AFTER_SECONDS = 10;

  private readonly annotator: Annotator;
  private readonly publication: Publication;
  private readonly listContainer?: HTMLElement | null;
  private readonly onEdit?: CommentEditHandler;
  private readonly initialAnnotations?: InitialAnnotations;
  private readonly api?: AudiobookCommentsModuleAPI;
  private host!: AudiobookModuleHost;

  /** Last set of active comment IDs — used to dedup CommentsActive emissions. */
  private lastActiveIds = "";

  public static async create(
    config: AudiobookCommentsModuleConfig
  ): Promise<AudiobookCommentsModule> {
    return new AudiobookCommentsModule(config);
  }

  public constructor(config: AudiobookCommentsModuleConfig) {
    this.annotator = config.annotator;
    this.publication = config.publication;
    this.listContainer = config.listContainer;
    this.onEdit = config.onEdit;
    this.initialAnnotations = config.initialAnnotations;
    this.api = config.api;
  }

  attach(host: AudiobookModuleHost): void {
    this.host = host;
    // Treat initialAnnotations as source of truth — overwrite local
    // storage even when empty so a prior user's comments on a shared
    // browser don't leak through.
    if (this.initialAnnotations) {
      this.annotator?.initComments(this.initialAnnotations.comments ?? []);
    }
    if (this.listContainer) this.renderList();
  }

  /**
   * Called by `AudiobookNavigator` at the same site it emits
   * `ReaderEvent.TimeUpdated`. Recomputes which comments are inside
   * their display window at the new playback time, and emits
   * `CommentsActive` if the visible set changed. Mirrors how the
   * timeline module receives navigator-driven dispatch — modules
   * never subscribe to host events themselves.
   */
  onTimeUpdate(payload: { locator: Locator; currentTime: number }): void {
    this.recomputeActive(payload.locator, payload.currentTime);
  }

  /**
   * Save a comment at the current playback position (or given locator).
   * If an `api.addComment` callback is configured, awaits it before
   * persisting locally so the integrator's server can accept (possibly
   * stamping an id / timestamp) or refuse the operation.
   */
  async add(body: string, locator?: Locator): Promise<Comment | null> {
    const target = locator ?? this.host.currentLocator();
    if (!target.href) return null;
    let comment: Comment = {
      id: crypto.randomUUID(),
      href: target.href,
      type: target.type ?? "audio/*",
      title: target.title,
      locations: target.locations,
      created: new Date(),
      body,
    };
    if (this.api?.addComment) {
      comment = await this.api.addComment(comment);
    }
    const saved = this.annotator.saveComment(comment) ?? null;
    if (saved) {
      this.host.emit(ReaderEvent.CommentCreated, saved);
      // Immediately recompute active set in case the new comment is in window.
      this.recomputeActive(this.host.currentLocator(), this.currentTime());
      if (this.listContainer) this.renderList();
    }
    return saved;
  }

  /**
   * Update a comment's body. Returns the updated comment or null if
   * not found. If an `api.updateComment` callback is configured, awaits
   * it before persisting locally.
   */
  async update(id: string, body: string): Promise<Comment | null> {
    // Look up the existing comment so the integrator gets a full Comment
    // to inspect / modify / refuse. Mirrors bookmark + add() pattern:
    // api FIRST (server can refuse, stamp, modify), then ONE annotator write.
    const existing = this.annotator.getCommentByID(id);
    if (!existing) return null;
    let candidate: Comment = { ...existing, body };
    if (this.api?.updateComment) {
      candidate = await this.api.updateComment(candidate);
    }
    const updated = this.annotator.updateComment(id, candidate.body) ?? null;
    if (updated) {
      this.host.emit(ReaderEvent.CommentUpdated, updated);
      if (this.listContainer) this.renderList();
    }
    return updated;
  }

  /**
   * Delete a previously saved comment. If an `api.deleteComment`
   * callback is configured, awaits it before deleting locally.
   */
  async delete(comment: Comment): Promise<void> {
    if (this.api?.deleteComment) {
      await this.api.deleteComment(comment);
    }
    this.annotator.deleteComment(comment.id);
    // Emit the full Comment (not { id }) — matches BookmarkDeleted /
    // AnnotationDeleted shape and ReaderEventMap declares CommentDeleted: Comment.
    this.host.emit(ReaderEvent.CommentDeleted, comment);
    this.recomputeActive(this.host.currentLocator(), this.currentTime());
    if (this.listContainer) this.renderList();
  }

  /** All comments for the publication, sorted by anchor time. */
  list(): Comment[] {
    return this.annotator.getComments();
  }

  /**
   * Comments anchored at the given locator (or current playback position).
   * Filters to the same resource and uses the per-comment display window
   * (or defaults) to determine "near enough."
   */
  findAt(locator?: Locator): Comment[] {
    const target = locator ?? this.host.currentLocator();
    const href = target.href;
    const time = target.locations?.time;
    if (!href || typeof time !== "number") return [];
    const candidates = this.annotator.getComments(href);
    return candidates.filter((c) => this.isWithinWindow(c, time));
  }

  stop(): void {
    if (this.listContainer) this.listContainer.innerHTML = "";
  }

  // ── List rendering ──────────────────────────────────────────

  /**
   * Build a chapter-grouped comment list inside the integrator-supplied
   * container. Each row shows the body, the time, and edit/delete
   * buttons; clicking the row navigates to the comment via the host's
   * `goTo`. Edit button only renders when `onEdit` was supplied — the
   * integrator owns the edit UX. Re-rendered on every save / update /
   * delete (small lists, full rebuild stays clean).
   */
  private renderList(): void {
    const host = this.listContainer;
    if (!host) return;
    host.innerHTML = "";
    const comments = this.list();
    if (comments.length === 0) return;
    const order = this.publication.readingOrder;
    const root = document.createElement("ol");
    root.className = "dita-audiobook-comments";
    order.forEach((link, chapterIndex) => {
      const inThisChapter = comments
        .filter((c) => c.href === link.href)
        .sort((a, b) => (a.locations?.time ?? 0) - (b.locations?.time ?? 0));
      if (inThisChapter.length === 0) return;
      const heading = document.createElement("li");
      heading.className = "dita-audiobook-comments-heading";
      heading.textContent = link.title || `Track ${chapterIndex + 1}`;
      root.appendChild(heading);
      for (const comment of inThisChapter) {
        root.appendChild(this.buildRow(comment, link.href));
      }
    });
    host.appendChild(root);
  }

  private buildRow(comment: Comment, chapterHref: string): HTMLElement {
    const row = document.createElement("li");
    row.className = "dita-audiobook-comments-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");

    const body = document.createElement("span");
    body.className = "dita-audiobook-comments-body";
    body.textContent = comment.body ?? "";
    row.appendChild(body);

    const time = document.createElement("span");
    time.className = "dita-audiobook-comments-time";
    time.textContent = formatTime(comment.locations?.time ?? 0);
    row.appendChild(time);

    if (this.onEdit) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "dita-audiobook-comments-edit";
      edit.setAttribute("aria-label", "Edit comment");
      edit.textContent = "✎";
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        this.onEdit?.(comment);
      });
      row.appendChild(edit);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "dita-audiobook-comments-delete";
    del.setAttribute("aria-label", "Delete comment");
    del.textContent = "✕";
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      this.delete(comment);
    });
    row.appendChild(del);

    const onActivate = (event: Event): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      void this.host.goTo({
        href: chapterHref,
        locations: { time: comment.locations?.time ?? 0 },
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

  /**
   * True if the playback time is inside the comment's display window:
   * `(comment.time - displayBefore) <= currentTime <= (comment.time + displayAfter)`.
   */
  private isWithinWindow(comment: Comment, currentTime: number): boolean {
    const anchor = comment.locations?.time;
    if (typeof anchor !== "number") return false;
    const before =
      comment.displayBefore ??
      AudiobookCommentsModule.DEFAULT_DISPLAY_BEFORE_SECONDS;
    const after =
      comment.displayAfter ??
      AudiobookCommentsModule.DEFAULT_DISPLAY_AFTER_SECONDS;
    return currentTime >= anchor - before && currentTime <= anchor + after;
  }

  /**
   * Recompute which comments are currently visible at the playback time
   * and emit `CommentsActive` if the set changed.
   */
  private recomputeActive(locator: Locator, currentTime: number): void {
    const href = locator.href;
    if (!href) return;
    const candidates = this.annotator.getComments(href);
    const active = candidates.filter((c) =>
      this.isWithinWindow(c, currentTime)
    );
    const ids = active.map((c) => c.id).join(",");
    if (ids !== this.lastActiveIds) {
      this.lastActiveIds = ids;
      this.host.emit(ReaderEvent.CommentsActive, { active, currentTime });
    }
  }

  /** Current time from the navigator host's locator. */
  private currentTime(): number {
    return this.host.currentLocator().locations?.time ?? 0;
  }
}
