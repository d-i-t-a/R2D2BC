/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 */

/**
 * Typed accessors for pdfjs-dist APIs that have declaration gaps.
 *
 * Why this file exists:
 * pdfjs-dist (v5.x) ships some runtime features whose TypeScript declarations
 * are incomplete or inaccurate. Rather than scatter `as any` casts across the
 * codebase, this file collects them into typed helpers with documentation
 * explaining WHY each cast is necessary.
 *
 * All call sites should import from here. There should be ZERO `as any` casts
 * on pdfjs APIs anywhere else in the project.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";

// AnnotationStorage isn't exported from pdfjs-dist's main entry, so we derive
// the type from the PDFDocumentProxy getter where it's reachable.
type AnnotationStorage = PDFDocumentProxy["annotationStorage"];

// ─────────────────────────────────────────────────────────────────────────────
// AnnotationStorage hooks + serializable access
// ─────────────────────────────────────────────────────────────────────────────
//
// pdfjs-dist declares these properties with narrower types than they actually
// are at runtime:
//   - onSetModified — declared as `null`, but runtime accepts a callback fn
//   - serializable — returns a frozen/readonly union; we need the live `.map`
//
// These are both documented in the pdfjs source as "internal/extensible" —
// the runtime contract is stable; only the .d.ts files lag.

/**
 * Serializable shape exposed by `AnnotationStorage.serializable`.
 * The runtime returns an object with a `map` field when annotations exist.
 */
export interface AnnotationStorageSerializable {
  map?: Map<string, Record<string, unknown>>;
  hash: string;
  transfer?: unknown[];
}

interface AnnotationStorageWithHooks {
  onSetModified: (() => void) | null;
  serializable: AnnotationStorageSerializable;
}

/**
 * Set the `onSetModified` callback on an AnnotationStorage.
 * Runtime-settable even though the type declares it as `null`.
 */
export function setAnnotationStorageOnModified(
  storage: AnnotationStorage,
  callback: (() => void) | null
): void {
  (storage as unknown as AnnotationStorageWithHooks).onSetModified = callback;
}

/**
 * Get the `onSetModified` callback (for temporary save-and-restore patterns).
 */
export function getAnnotationStorageOnModified(
  storage: AnnotationStorage
): (() => void) | null {
  return (storage as unknown as AnnotationStorageWithHooks).onSetModified;
}

/**
 * Get the live serializable snapshot of an AnnotationStorage.
 * The runtime returns an object whose `map` is the internal storage Map.
 */
export function getSerializable(
  storage: AnnotationStorage
): AnnotationStorageSerializable {
  return (storage as unknown as AnnotationStorageWithHooks).serializable;
}

// ─────────────────────────────────────────────────────────────────────────────
// setDocument(null) — release the current document
// ─────────────────────────────────────────────────────────────────────────────
//
// pdfjs-dist types `PDFViewer.setDocument()` and `PDFLinkService.setDocument()`
// as requiring a `PDFDocumentProxy`, but both accept `null` at runtime to
// release the current document. This is the documented way to tear down a
// viewer before loading the next PDF.

interface SetDocumentNullable {
  setDocument(doc: PDFDocumentProxy | null): void;
}

/**
 * Release the current document from a PDFViewer (accepts null at runtime).
 */
export function releasePdfViewerDocument(viewer: PDFViewer): void {
  (viewer as unknown as SetDocumentNullable).setDocument(null);
}

/**
 * Release the current document from a PDFLinkService (accepts null at runtime).
 */
export function releasePdfLinkServiceDocument(
  linkService: PDFLinkService
): void {
  (linkService as unknown as SetDocumentNullable).setDocument(null);
}
