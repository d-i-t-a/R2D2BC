/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import debounce from "debounce";
import { HostType, RightsKey } from "../ReaderModule";
import { IAnnotationModule } from "../interfaces";
import { PDFModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import {
  setAnnotationStorageOnModified,
  getAnnotationStorageOnModified,
  getSerializable,
} from "../../types/pdfjs-workarounds";
import Store from "../../store/Store";
import { Annotation } from "../../model/v3";
import type { InitialAnnotations } from "../../navigator/ReaderConfig";

/**
 * Integrator-supplied write-through hooks for PDF annotations.
 *
 * Shape mirrors the EPUB `AnnotationModuleAPI` exactly so integrators
 * get one consistent contract across formats: `Annotation` in, modified
 * `Annotation` out (e.g. the server stamps an id, server-side
 * timestamp, etc.). The module awaits each callback before persisting
 * locally, so server-side persistence can refuse / mutate the write
 * before it lands in `viewStore`.
 */
export type PdfAnnotationCallback = (
  annotation: Annotation
) => Promise<Annotation>;

export interface PdfAnnotationModuleAPI {
  addAnnotation: PdfAnnotationCallback;
  updateAnnotation: PdfAnnotationCallback;
  deleteAnnotation: PdfAnnotationCallback;
}

export interface PdfAnnotationModuleConfig {
  viewStore: Store;
  /**
   * Previously-persisted annotations to restore the editor layer from
   * on first resource load. Same shape EPUB consumes
   * (`initialAnnotations.highlights: Annotation[]`); each `Annotation`
   * carries a `pdfHighlight` field with the pdfjs editor serialization
   * blob needed for faithful restore into the AnnotationEditorLayer.
   * When provided, wins over the local `viewStore` for the initial
   * restore.
   */
  initialAnnotations?: InitialAnnotations;
  /**
   * Optional integrator write-through callbacks. When provided, the
   * module awaits the matching callback before mutating the local
   * `viewStore`, so server-side persistence can fail / mutate each op.
   * Same `addAnnotation` / `updateAnnotation` / `deleteAnnotation`
   * shape as the EPUB module.
   */
  api?: PdfAnnotationModuleAPI;
}

/**
 * PDF annotation module.
 *
 * Owns the save / restore lifecycle for pdfjs AnnotationEditor instances
 * (highlights, freetext, ink, stamps) against the host's viewStore.
 *
 * **Data shape on the wire and in `viewStore` is `Annotation[]`** —
 * the same locator shape the EPUB module uses. Each entry carries the
 * pdfjs editor serialization blob inside its `pdfHighlight` field,
 * because pdfjs's restore path needs the full original blob (rects,
 * quadPoints, annotationType, structTreeParentId, methodOfCreation,
 * etc.) to reconstruct the editor faithfully. The integrator's server
 * sees a list of `Annotation` locators with the pdfjs payload riding
 * along.
 *
 * Key behaviours:
 *
 * 1. **Per-page lazy restore.** Saved annotations are grouped by page
 *    and the pdfjs blob (from each `Annotation.pdfHighlight`) is
 *    injected into each page's AnnotationEditorLayer as the layer
 *    renders (via the `annotationeditorlayerrendered` event). Pages
 *    not yet scrolled into view keep their annotations in a pending
 *    queue.
 *
 * 2. **onSetModified + event-bus debouncing.** A debounced save fires
 *    on every AnnotationStorage mutation and on every editor-param
 *    change (color, thickness, opacity) so add / edit / delete reach
 *    the integrator within 200ms.
 *
 * 3. **Restore-loop suppression.** When restoring a page, the
 *    onSetModified callback is nulled out so each addOrRebuild() during
 *    the loop doesn't trigger an intermediate save that would miss
 *    later additions. After the loop, one authoritative save captures
 *    the final state.
 *
 * 4. **Pending + live merge at save time.** save() includes BOTH the
 *    live AnnotationStorage map AND the remaining pending queue, so a
 *    save triggered by restoring page N doesn't silently drop pages
 *    N+1..
 *
 * 5. **Diff-based api dispatch.** Save computes the diff between the
 *    last-persisted state and the new state and fires the integrator's
 *    `addAnnotation` / `updateAnnotation` / `deleteAnnotation` per
 *    affected item — matching the EPUB module's contract. Repeated
 *    save() calls with no semantic change (tool-mode toggle, page
 *    render) produce no api calls.
 *
 * 6. **TypedArray → Array conversion.** pdfjs editor state contains
 *    Float32Arrays for ink paths and similar. Those stringify as
 *    objects without .length, breaking pdfjs deserialization on
 *    restore. The `toJsonSafe` helper recursively converts them to
 *    plain arrays.
 *
 * 7. **Bitmap skip.** Image-stamp editors have ImageBitmap references
 *    that can't JSON round-trip. Those are skipped during save (they'd
 *    need separate binary storage).
 *
 * 8. **Multi-document reset.** `onResourceReady()` fires when a new PDF
 *    loads (different fingerprint). The pending queue is reset and
 *    restore runs for the new fingerprint, preventing annotation
 *    bleed-through between documents in a multi-PDF publication.
 */
export class PdfAnnotationModule implements IAnnotationModule<PDFModuleHost> {
  readonly name = NavigatorFeature.Annotations;
  readonly hostType = HostType.PDF;
  readonly rightsKey = RightsKey.Annotations;

  private readonly viewStore: Store;
  private readonly api?: PdfAnnotationModuleAPI;
  private host!: PDFModuleHost;

  // One-shot initial annotations handed in via config. Consumed on the
  // first `onResourceReady` and cleared so a subsequent document load
  // (or resource change) doesn't re-restore stale server data over the
  // user's in-progress edits.
  private initialAnnotations?: InitialAnnotations;

  // Annotations grouped by page index, waiting for their layer to
  // render. Stored as pdfjs editor blobs (the `pdfHighlight` field of
  // each Annotation) so `layer.deserialize()` can reconstruct the
  // editor.
  private pendingAnnotations: Map<number, unknown[]> | null = null;

  // Source-of-truth view of what's been written to api + viewStore.
  // Keyed by Annotation.id. Used to diff against the current pdfjs
  // state on save so we fire add / update / delete per item.
  private lastSaved = new Map<string, Annotation>();

  // Fingerprint of the last-restored document, used to detect resource
  // changes.
  private lastFingerprint: string | undefined;

  private debouncedSave!: () => void;

  constructor(config: PdfAnnotationModuleConfig) {
    this.viewStore = config.viewStore;
    this.api = config.api;
    this.initialAnnotations = config.initialAnnotations;
  }

  attach(host: PDFModuleHost): void {
    this.host = host;
  }

  setup(): void {
    this.debouncedSave = debounce(() => {
      if (this.host.pdfDoc) {
        void this.save();
      }
    }, 200);

    this.host.eventBus.on(
      "annotationeditorlayerrendered",
      this.onLayerRendered
    );
    this.host.eventBus.on("annotationeditorstateschanged", this.debouncedSave);
    // Param changes (color, thickness, opacity) mutate the editor
    // instance in place — pdfjs does NOT call
    // `annotationStorage.setValue` again (the instance is already there)
    // and does NOT fire `annotationeditorstateschanged` (that event
    // tracks selection / isEmpty / undo state, not editor params).
    // Without these listeners, changing a highlight's color after
    // creation never fires the integrator's `updateAnnotation` callback
    // and the integrator's server keeps the original color forever.
    // Both the inbound `switchannotationeditorparams` (dispatched by
    // toolbars to apply a change) and the outbound
    // `annotationeditorparamschanged` (dispatched by UIManager after
    // the change is applied) get the same debounced handler — the diff
    // logic in `save()` swallows redundancy.
    this.host.eventBus.on("switchannotationeditorparams", this.debouncedSave);
    this.host.eventBus.on("annotationeditorparamschanged", this.debouncedSave);

    // Initial restore fires when the first document is fully loaded —
    // handled by onResourceReady below.
  }

  onResourceReady(): void {
    const fingerprint = this.host.fingerprint ?? "";
    if (!fingerprint || fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;

    // Reset any stale pending state from a previous document.
    this.pendingAnnotations = null;
    // Reset the diff baseline so the first save() on the new doc
    // surfaces the restored set as the new starting point (no spurious
    // delete calls for prior-document entries).
    this.lastSaved = new Map();

    this.restore(fingerprint);

    // Wire onSetModified on the NEW document's annotation storage so
    // any live edit triggers a debounced save.
    if (this.host.pdfDoc) {
      setAnnotationStorageOnModified(this.host.pdfDoc.annotationStorage, () => {
        void this.save();
      });
    }
  }

  stop(): void {
    this.host?.eventBus.off(
      "annotationeditorlayerrendered",
      this.onLayerRendered
    );
    this.host?.eventBus.off(
      "annotationeditorstateschanged",
      this.debouncedSave
    );
    this.host?.eventBus.off("switchannotationeditorparams", this.debouncedSave);
    this.host?.eventBus.off(
      "annotationeditorparamschanged",
      this.debouncedSave
    );
  }

  // ── IAnnotationModule contract ─────────────────────────────

  /**
   * Returns every annotation across all pages — both those already
   * deserialized into live editors and those still pending in the
   * queue. The UI sidebar uses this so it can show the complete list
   * without requiring every page to be scrolled into view.
   */
  getAll(): Annotation[] {
    const href = this.currentHref();
    const result: Annotation[] = [];

    if (this.host?.pdfDoc) {
      const { map } = getSerializable(this.host.pdfDoc.annotationStorage);
      if (map) {
        for (const [id, value] of map) {
          if (hasBitmap(value)) continue;
          const blob = PdfAnnotationModule.toJsonSafe(value) as Record<
            string,
            unknown
          >;
          result.push(
            this.annotationFromBlob(id, blob, this.lastSaved.get(id), href)
          );
        }
      }
    }

    if (this.pendingAnnotations) {
      for (const [, anns] of this.pendingAnnotations) {
        for (const blob of anns) {
          const b = blob as Record<string, unknown>;
          const id = typeof b.id === "string" ? b.id : "";
          if (!id) continue;
          result.push(
            this.annotationFromBlob(id, b, this.lastSaved.get(id), href)
          );
        }
      }
    }

    result.sort((a, b) => (a.locations.page ?? 0) - (b.locations.page ?? 0));
    return result;
  }

  clear(): void {
    if (!this.host?.pdfDoc) return;
    const storage = this.host.pdfDoc.annotationStorage;
    const { map } = getSerializable(storage);
    if (map) {
      for (const id of map.keys()) {
        storage.remove(id);
      }
    }
    const fingerprint = this.host.fingerprint;
    if (this.viewStore && fingerprint) {
      this.viewStore.remove(this.storageKey(fingerprint));
    }
    this.pendingAnnotations = null;
    // Diff will fire deleteAnnotation for each previously-saved entry
    // on next save(). Clear the baseline so we don't replay deletes
    // for the same items twice.
    this.lastSaved = new Map();
  }

  // ── Editor mode control ────────────────────────────────────

  /**
   * Activate an annotation editor tool.
   * Pass an `AnnotationEditorType` value:
   *   NONE = 0      — editor on, no tool active
   *   FREETEXT = 3  — text notes
   *   HIGHLIGHT = 9 — highlight selected text
   *   STAMP = 13    — image stamps
   *   INK = 15      — freehand drawing
   */
  setEditorMode(mode: number): void {
    this.host.pdfViewer.annotationEditorMode = { mode };
  }

  // ── Save / restore lifecycle ───────────────────────────────

  private onLayerRendered = async (evt: {
    source: {
      annotationEditorLayer?: {
        annotationEditorLayer?: {
          deserialize(data: unknown): Promise<unknown>;
          addOrRebuild(editor: unknown): void;
        };
      };
    };
    pageNumber: number;
    error?: unknown;
  }): Promise<void> => {
    if (evt.error || !this.pendingAnnotations) return;
    const pageIndex = evt.pageNumber - 1;
    const pending = this.pendingAnnotations.get(pageIndex);
    if (!pending || pending.length === 0) return;

    // Claim this page's pending set immediately to prevent
    // double-restore.
    this.pendingAnnotations.delete(pageIndex);

    // Drill past the builder wrapper to the actual
    // AnnotationEditorLayer.
    const layer = evt.source?.annotationEditorLayer?.annotationEditorLayer;
    if (!layer || !this.host.pdfDoc) return;

    // Suppress onSetModified during the restore loop (see class-level
    // docs).
    const storage = this.host.pdfDoc.annotationStorage;
    const savedOnSetModified = getAnnotationStorageOnModified(storage);
    setAnnotationStorageOnModified(storage, null);

    for (const data of pending) {
      try {
        const editor = await layer.deserialize(data);
        if (editor) layer.addOrRebuild(editor);
      } catch (err) {
        console.warn(
          "PdfAnnotationModule: failed to restore annotation",
          data,
          err
        );
      }
    }

    // Restore the callback and do one authoritative save.
    setAnnotationStorageOnModified(storage, savedOnSetModified);
    void this.save();
  };

  /**
   * Capture the current pdfjs editor state as `Annotation[]`, diff
   * against `lastSaved`, fire api per item for adds / updates /
   * deletes, and write the new set to the viewStore.
   *
   * Includes BOTH live annotations (on rendered pages) AND pending
   * ones (pages not yet scrolled into view) so a save from one page
   * doesn't drop others.
   */
  private async save(): Promise<void> {
    if (!this.viewStore || !this.host?.pdfDoc) return;
    const fingerprint = this.host.fingerprint ?? "";
    const key = this.storageKey(fingerprint);
    const href = this.currentHref();

    // Build the current annotation set from pdfjs state + pending.
    const current = new Map<string, Annotation>();

    const { map } = getSerializable(this.host.pdfDoc.annotationStorage);
    if (map) {
      for (const [id, value] of map) {
        if (hasBitmap(value)) continue; // ImageBitmap can't JSON round-trip
        const blob = PdfAnnotationModule.toJsonSafe(value) as Record<
          string,
          unknown
        >;
        current.set(
          id,
          this.annotationFromBlob(id, blob, this.lastSaved.get(id), href)
        );
      }
    }

    if (this.pendingAnnotations) {
      for (const [, anns] of this.pendingAnnotations) {
        for (const blob of anns) {
          const b = blob as Record<string, unknown>;
          const id = typeof b.id === "string" ? b.id : "";
          if (!id) continue;
          current.set(
            id,
            this.annotationFromBlob(id, b, this.lastSaved.get(id), href)
          );
        }
      }
    }

    // Diff and dispatch api callbacks per item. Each callback can
    // mutate the Annotation it receives (e.g. server-stamped id) —
    // we use the returned value for both lastSaved and viewStore.
    const next = new Map<string, Annotation>();

    for (const [id, ann] of current) {
      const prev = this.lastSaved.get(id);
      if (!prev) {
        let saved = ann;
        if (this.api?.addAnnotation) {
          try {
            saved = (await this.api.addAnnotation(ann)) || ann;
          } catch (err) {
            console.warn("PdfAnnotationModule: addAnnotation failed", err);
          }
        }
        next.set(id, saved);
      } else if (!annotationsEqual(prev, ann)) {
        let saved: Annotation = { ...prev, ...ann, created: prev.created };
        if (this.api?.updateAnnotation) {
          try {
            saved = (await this.api.updateAnnotation(saved)) || saved;
          } catch (err) {
            console.warn("PdfAnnotationModule: updateAnnotation failed", err);
          }
        }
        next.set(id, saved);
      } else {
        // Unchanged — carry forward the prior Annotation (preserves
        // any server-stamped fields like id or timestamps the
        // integrator added on first add).
        next.set(id, prev);
      }
    }

    // Deletes: anything in lastSaved that isn't in current.
    for (const [id, prev] of this.lastSaved) {
      if (!current.has(id)) {
        if (this.api?.deleteAnnotation) {
          try {
            await this.api.deleteAnnotation(prev);
          } catch (err) {
            console.warn("PdfAnnotationModule: deleteAnnotation failed", err);
          }
        }
      }
    }

    this.lastSaved = next;

    // Persist locally as Annotation[].
    const arr = Array.from(next.values());
    if (arr.length === 0) {
      this.viewStore.remove(key);
    } else {
      this.viewStore.set(key, JSON.stringify(arr));
    }
  }

  /**
   * Parse saved annotations from the integrator-supplied initial set
   * (preferred) or the local store and group them by page index so
   * `onLayerRendered` can inject each page's editors as their layer
   * becomes ready. Called right after a new document loads.
   *
   * Does NOT call `annotationStorage.setValue()` — that only fills the
   * raw storage map and is never read back by the
   * AnnotationEditorUIManager. `layer.deserialize()` +
   * `layer.addOrRebuild()` reconstructs proper AnnotationEditor
   * instances from the saved JSON.
   */
  private restore(fingerprint: string): void {
    this.pendingAnnotations = null;

    let annotations: Annotation[] | null = null;

    // Integrator-supplied initialAnnotations is the canonical source of
    // truth — when provided, overwrite the local viewStore for this
    // fingerprint even if `.highlights` is empty/missing. Otherwise a
    // previous user's pdf-ann-<fingerprint> entry on a shared browser
    // bleeds through to the next user.
    if (this.initialAnnotations) {
      annotations = this.initialAnnotations.highlights ?? [];
      this.initialAnnotations = undefined;

      const key = this.storageKey(fingerprint);
      if (this.viewStore) {
        if (annotations.length === 0) this.viewStore.remove(key);
        else this.viewStore.set(key, JSON.stringify(annotations));
      }
    } else if (this.viewStore) {
      const raw = this.viewStore.get(this.storageKey(fingerprint));
      if (!raw) return;
      try {
        annotations = JSON.parse(raw) as Annotation[];
      } catch {
        // Corrupted store entry — ignore and start fresh.
        return;
      }
    } else {
      return;
    }

    if (!annotations || annotations.length === 0) return;

    const grouped = new Map<number, unknown[]>();
    const baseline = new Map<string, Annotation>();
    for (const ann of annotations) {
      const blob = ann.pdfHighlight;
      if (!blob) continue;
      const pageIndex = getPageIndex(blob);
      if (!grouped.has(pageIndex)) grouped.set(pageIndex, []);
      grouped.get(pageIndex)!.push(blob);
      if (typeof ann.id === "string") baseline.set(ann.id, ann);
    }
    this.pendingAnnotations = grouped;
    // Seed lastSaved with the restored set so the first save() after
    // restore doesn't fire spurious add/update/delete for items the
    // user hasn't touched yet.
    this.lastSaved = baseline;
  }

  private storageKey(fingerprint: string): string {
    return `pdf-ann-${fingerprint}`;
  }

  private currentHref(): string {
    return this.host?.currentResourceLink?.href ?? "";
  }

  // ── Annotation construction ────────────────────────────────

  /**
   * Build an `Annotation` locator from a pdfjs editor serialization
   * blob. The blob itself rides along in `pdfHighlight` for faithful
   * restore; the top-level locator fields are decomposed so
   * integrators can query / display them without parsing the pdfjs
   * shape.
   *
   * `prev` is the previously-saved Annotation for this id (if any),
   * used to preserve server-stamped fields (e.g. `created`, custom
   * server-set ids) across saves.
   */
  private annotationFromBlob(
    id: string,
    blob: Record<string, unknown>,
    prev: Annotation | undefined,
    href: string
  ): Annotation {
    const pageIndex = typeof blob.pageIndex === "number" ? blob.pageIndex : 0;
    const text = typeof blob.text === "string" ? blob.text : undefined;
    const color = colorToCss(blob.color);
    return {
      id: prev?.id ?? id,
      href,
      type: "application/pdf",
      locations: { page: pageIndex + 1 },
      text: text ? { highlight: text } : undefined,
      highlight: color
        ? ({ id: prev?.id ?? id, color } as Annotation["highlight"])
        : undefined,
      created: prev?.created ?? new Date(),
      pdfHighlight: blob,
    };
  }

  // ── JSON safety helpers ────────────────────────────────────

  /**
   * Recursively converts TypedArray instances (Float32Array, etc.) to
   * plain arrays so they survive JSON round-trip. TypedArrays
   * stringify as objects { "0": n, "1": n, … } which have no .length,
   * breaking pdfjs deserialization.
   */
  private static toJsonSafe(value: unknown): unknown {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>);
    }
    if (Array.isArray(value)) {
      return value.map(PdfAnnotationModule.toJsonSafe);
    }
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = PdfAnnotationModule.toJsonSafe(v);
      }
      return out;
    }
    return value;
  }
}

// ── Helpers ────────────────────────────────────────────────

function hasBitmap(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "bitmap" in value &&
    (value as { bitmap?: unknown }).bitmap !== undefined
  );
}

function getPageIndex(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "pageIndex" in value &&
    typeof (value as { pageIndex?: unknown }).pageIndex === "number"
  ) {
    return (value as { pageIndex: number }).pageIndex;
  }
  return 0;
}

/**
 * Convert pdfjs's `[r, g, b]` color triple (or already-stringified
 * value) to a CSS color string for `Annotation.highlight.color`.
 */
function colorToCss(value: unknown): string | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value;
    if (
      typeof r === "number" &&
      typeof g === "number" &&
      typeof b === "number"
    ) {
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  if (typeof value === "string" && value) return value;
  return undefined;
}

/**
 * Structural equality between two `Annotation`s for diff purposes.
 * Compares the pdfjs blob (the only thing that drives semantic
 * change), the decomposed page, and the color string. Excludes `id`,
 * `created`, and any integrator-stamped fields that don't reflect
 * user-visible changes.
 */
function annotationsEqual(a: Annotation, b: Annotation): boolean {
  if ((a.locations.page ?? 0) !== (b.locations.page ?? 0)) return false;
  if ((a.highlight?.color ?? "") !== (b.highlight?.color ?? "")) return false;
  if ((a.text?.highlight ?? "") !== (b.text?.highlight ?? "")) return false;
  return (
    JSON.stringify(a.pdfHighlight ?? {}) ===
    JSON.stringify(b.pdfHighlight ?? {})
  );
}
