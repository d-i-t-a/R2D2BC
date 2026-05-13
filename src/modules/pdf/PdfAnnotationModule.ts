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

export interface PdfAnnotationModuleConfig {
  viewStore: Store;
}

/**
 * PDF annotation module.
 *
 * Owns the save / restore lifecycle for pdfjs AnnotationEditor instances
 * (highlights, freetext, ink, stamps) against the host's viewStore.
 *
 * Key behaviours preserved from the original PDFNavigator inline code:
 *
 * 1. **Per-page lazy restore.** Saved annotations are grouped by page and
 *    injected into each page's AnnotationEditorLayer as the layer renders
 *    (via the `annotationeditorlayerrendered` event). Pages not yet scrolled
 *    into view keep their annotations in a pending queue.
 *
 * 2. **onSetModified debouncing.** A debounced save fires on every
 *    AnnotationStorage mutation, so add/edit/delete of any editor triggers
 *    a persist within 200ms.
 *
 * 3. **Restore-loop suppression.** When restoring a page, the onSetModified
 *    callback is nulled out so that each addOrRebuild() during the loop
 *    doesn't trigger an intermediate save that would miss later additions.
 *    After the loop, one authoritative save captures the final state.
 *
 * 4. **Pending + live merge at save time.** saveAnnotations() persists BOTH
 *    the live annotationStorage map AND the remaining pending queue, so a
 *    save triggered by restoring page N doesn't silently drop pages N+1..
 *
 * 5. **TypedArray → Array conversion.** pdfjs editor state contains
 *    Float32Arrays for ink paths and similar. Those stringify as objects
 *    without .length, breaking pdfjs deserialization on restore. The
 *    `toJsonSafe` helper recursively converts them to plain arrays.
 *
 * 6. **Bitmap skip.** Image-stamp editors have ImageBitmap references that
 *    can't JSON round-trip. Those are skipped during save (they'd need
 *    separate binary storage).
 *
 * 7. **Multi-document reset.** `onResourceReady()` fires when a new PDF
 *    loads (different fingerprint). The pending queue is reset and restore
 *    runs for the new fingerprint, preventing annotation bleed-through
 *    between documents in a multi-PDF publication.
 */
export class PdfAnnotationModule implements IAnnotationModule<PDFModuleHost> {
  readonly name = NavigatorFeature.Annotations;
  readonly hostType = HostType.PDF;
  readonly rightsKey = RightsKey.Annotations;

  private readonly viewStore: Store;
  private host!: PDFModuleHost;
  // Saved annotations grouped by page index, waiting for their layer to render.
  private pendingAnnotations: Map<number, unknown[]> | null = null;
  // Fingerprint of the last-restored document, used to detect resource changes.
  private lastFingerprint: string | undefined;
  private debouncedSave!: () => void;

  constructor(config: PdfAnnotationModuleConfig) {
    this.viewStore = config.viewStore;
  }

  attach(host: PDFModuleHost): void {
    this.host = host;
  }

  setup(): void {
    this.debouncedSave = debounce(() => {
      if (this.host.pdfDoc) {
        this.save();
      }
    }, 200);

    this.host.eventBus.on(
      "annotationeditorlayerrendered",
      this.onLayerRendered
    );
    this.host.eventBus.on("annotationeditorstateschanged", this.debouncedSave);

    // Initial restore fires when the first document is fully loaded —
    // handled by onResourceReady below.
  }

  onResourceReady(): void {
    const fingerprint = this.host.fingerprint ?? "";
    if (!fingerprint || fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;

    // Reset any stale pending state from a previous document.
    this.pendingAnnotations = null;

    this.restore(fingerprint);

    // Wire onSetModified on the NEW document's annotation storage so any
    // live edit triggers a debounced save.
    if (this.host.pdfDoc) {
      setAnnotationStorageOnModified(this.host.pdfDoc.annotationStorage, () => {
        this.save();
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
  }

  // ── IAnnotationModule contract ─────────────────────────────

  /**
   * Returns every annotation across all pages — both those already
   * deserialized into live editors and those still pending in the queue.
   * The UI sidebar uses this so it can show the complete list without
   * requiring every page to be scrolled into view.
   */
  getAll(): unknown[] {
    const result: Record<string, unknown>[] = [];

    if (this.host.pdfDoc) {
      const { map } = getSerializable(this.host.pdfDoc.annotationStorage);
      if (map) {
        for (const value of map.values()) {
          result.push(
            PdfAnnotationModule.toJsonSafe(value) as Record<string, unknown>
          );
        }
      }
    }

    if (this.pendingAnnotations) {
      for (const anns of this.pendingAnnotations.values()) {
        for (const ann of anns) {
          result.push(ann as Record<string, unknown>);
        }
      }
    }

    result.sort(
      (a, b) => ((a.pageIndex as number) ?? 0) - ((b.pageIndex as number) ?? 0)
    );
    return result;
  }

  clear(): void {
    if (!this.host.pdfDoc) return;
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

    // Claim this page's pending set immediately to prevent double-restore.
    this.pendingAnnotations.delete(pageIndex);

    // Drill past the builder wrapper to the actual AnnotationEditorLayer.
    const layer = evt.source?.annotationEditorLayer?.annotationEditorLayer;
    if (!layer || !this.host.pdfDoc) return;

    // Suppress onSetModified during the restore loop (see class-level docs).
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
    this.save();
  };

  /**
   * Serialize the in-memory AnnotationStorage and write it to the viewStore.
   * Called via `annotationStorage.onSetModified` whenever an annotation is
   * added, edited, or deleted.
   *
   * Includes BOTH live annotations (on rendered pages) AND pending ones
   * (pages not yet scrolled into view) so a save from one page doesn't
   * drop others.
   */
  private save(): void {
    if (!this.viewStore || !this.host.pdfDoc) return;
    const fingerprint = this.host.fingerprint ?? "";
    const key = this.storageKey(fingerprint);
    const plain: Record<string, unknown> = {};

    const { map } = getSerializable(this.host.pdfDoc.annotationStorage);
    if (map) {
      for (const [id, value] of map) {
        if (hasBitmap(value)) continue; // ImageBitmap can't JSON round-trip
        plain[id] = PdfAnnotationModule.toJsonSafe(value);
      }
    }

    if (this.pendingAnnotations) {
      let i = 0;
      for (const [pageIndex, anns] of this.pendingAnnotations) {
        for (const ann of anns) {
          plain[`_pending_p${pageIndex}_${i++}`] = ann;
        }
      }
    }

    if (Object.keys(plain).length === 0) {
      this.viewStore.remove(key);
    } else {
      this.viewStore.set(key, JSON.stringify(plain));
    }
  }

  /**
   * Parse saved annotations from the store and group them by page index so
   * `onLayerRendered` can inject each page's editors as their layer becomes
   * ready. Called right after a new document loads.
   *
   * Does NOT call `annotationStorage.setValue()` — that only fills the raw
   * storage map and is never read back by the AnnotationEditorUIManager.
   * `layer.deserialize()` + `layer.addOrRebuild()` reconstructs proper
   * AnnotationEditor instances from the saved JSON.
   */
  private restore(fingerprint: string): void {
    this.pendingAnnotations = null;
    if (!this.viewStore) return;
    const key = this.storageKey(fingerprint);
    const raw = this.viewStore.get(key);
    if (!raw) return;
    try {
      const plain = JSON.parse(raw) as Record<string, unknown>;
      const grouped = new Map<number, unknown[]>();
      for (const value of Object.values(plain)) {
        const pageIndex = getPageIndex(value);
        if (!grouped.has(pageIndex)) grouped.set(pageIndex, []);
        grouped.get(pageIndex)!.push(value);
      }
      this.pendingAnnotations = grouped;
    } catch {
      // Corrupted store entry — ignore and start fresh.
    }
  }

  private storageKey(fingerprint: string): string {
    return `pdf-ann-${fingerprint}`;
  }

  // ── JSON safety helpers ────────────────────────────────────

  /**
   * Recursively converts TypedArray instances (Float32Array, etc.) to plain
   * arrays so they survive JSON round-trip. TypedArrays stringify as objects
   * { "0": n, "1": n, … } which have no .length, breaking pdfjs deserialization.
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

// ── Type guards for the opaque annotation payloads ──────────

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
