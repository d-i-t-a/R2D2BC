/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Shared module interface contracts.
 *
 * These interfaces define the lowest-common-denominator API that every
 * navigator-specific implementation of a given feature must provide.
 * Integrator-facing code uses these interfaces so the same call works
 * regardless of whether the current navigator is EPUB, PDF, or (in
 * future) audiobook / DiViNa.
 *
 * Navigator-specific methods (e.g. EPUB's iframe/highlighter access,
 * PDF's pdfjs AnnotationEditor access) stay on the concrete classes
 * and are reached via cast when needed:
 *   (reader.bookmarkModule as BookmarkModule).someEpubOnlyMethod()
 */

import type { ReaderModule } from "./ReaderModule";
import type { ModuleHost } from "./ModuleHost";
import type { Bookmark, Locator } from "../model/v3";

// ─────────────────────────────────────────────────────────────────────────────
// IBookmarkModule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bookmark management contract.
 * EPUB and PDF both provide an implementation; integrator code that only
 * needs CRUD + current-location check can use this interface directly.
 */
export interface IBookmarkModule<
  H extends ModuleHost = ModuleHost,
> extends ReaderModule<H> {
  /** Save a bookmark at the current reading location. Returns null if already bookmarked. */
  save(): Promise<Bookmark | null> | Bookmark | null;

  /** Delete a previously saved bookmark. */
  delete(bookmark: Bookmark): Promise<void> | void;

  /** Return all bookmarks for the current resource. */
  list(): Bookmark[];

  /** True if the current reading location already has a bookmark. */
  isCurrentBookmarked(): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ISearchModule
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  caseSensitive?: boolean;
  highlightAll?: boolean;
  entireWord?: boolean;
}

/**
 * In-document search contract.
 *
 * Deliberately minimal — EPUB and PDF have very different search models:
 * EPUB's SearchModule returns a result array that the UI iterates; PDF's
 * is cursor-based via pdfjs PDFFindController with next/previous. Each
 * concrete class exposes its native navigation API directly, and the
 * second parameter of `search()` is implementation-specific.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISearchModule<
  H extends ModuleHost = ModuleHost,
> extends ReaderModule<H> {
  /**
   * Execute a new search. The second parameter is implementation-specific
   * (EPUB: `current: boolean`; PDF: `options?: SearchOptions`).
   * Returned payload shape is also implementation-specific.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  search(query: string, ...args: any[]): Promise<unknown> | unknown;

  /** Clear the current search (removes highlights, resets state). */
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAnnotationModule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Annotation listing / clearing contract.
 *
 * Deliberately minimal — EPUB and PDF have very different annotation
 * storage models (TextHighlighter DOM highlights vs pdfjs AnnotationEditor
 * objects), and a richer shared API would force lossy abstraction.
 *
 * Concrete classes expose their native add/edit/delete APIs directly.
 */
export interface IAnnotationModule<
  H extends ModuleHost = ModuleHost,
> extends ReaderModule<H> {
  /**
   * Return every annotation in the current resource as an opaque payload.
   * The shape is implementation-specific — EPUB returns Annotation objects,
   * PDF returns pdfjs serializable map entries.
   */
  getAll(): unknown[];

  /** Remove every annotation in the current resource. */
  clear(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// IHistoryModule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-reader navigation history contract.
 * Distinct from browser-history integration (e.g. pdfjs PDFHistory) which
 * is a navigator concern. This interface is the back/forward stack that
 * tracks user navigation across resources and pages.
 *
 * Second parameter of `push` is implementation-specific — EPUB uses a
 * boolean flag for "append to history vs replace current"; PDF uses
 * nothing and always appends.
 */
export interface IHistoryModule<
  H extends ModuleHost = ModuleHost,
> extends ReaderModule<H> {
  /** Navigate to the previous entry in history. */
  back(): Promise<void> | void;

  /** Navigate to the next entry in history. */
  forward(): Promise<void> | void;

  /** Record a new entry in the history stack. Extra args are implementation-specific. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  push(locator: Locator, ...args: any[]): Promise<void> | void;

  /** True if there is at least one entry behind the current position. */
  canGoBack(): boolean;

  /** True if there is at least one entry ahead of the current position. */
  canGoForward(): boolean;
}
