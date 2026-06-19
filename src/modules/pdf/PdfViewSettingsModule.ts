/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { ReaderModule, HostType } from "../ReaderModule";
import { PDFModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import { ScrollMode } from "pdfjs-dist/web/pdf_viewer.mjs";
import Store from "../../store/Store";

/**
 * Typed view of PDF view settings persisted across sessions.
 *
 *   - `scrollMode` — pdfjs ScrollMode (0 vertical, 1 horizontal, 2 wrapped, 3 page)
 *   - `spreadMode` — pdfjs SpreadMode (0 none, 1 odd, 2 even)
 *   - `scale`      — pdfjs scale value: numeric ("1.25") or symbolic
 *                    ("page-fit", "page-width", "auto")
 *   - `rotation`   — 0 / 90 / 180 / 270
 */
export interface PdfViewSettingsState {
  scrollMode?: number;
  spreadMode?: number;
  scale?: string | number;
  rotation?: number;
}

/**
 * Integrator-supplied write-through hook for PDF view settings.
 *
 * Fires on every user-driven change (zoom, scroll mode, spread, rotation)
 * so the integrator can persist the snapshot to their own server. Snapshot
 * shape matches what the local viewStore holds.
 */
export interface PdfViewSettingsModuleAPI {
  updateSettings: (settings: PdfViewSettingsState) => Promise<void>;
}

export interface PdfViewSettingsModuleConfig {
  viewStore: Store;
  /**
   * Integrator-supplied initial PDF user settings (scroll mode,
   * spread, scale, rotation).
   *
   *   - `{...}`     → partial overrides; supplied fields are written
   *                   to viewStore, omitted fields fall back to
   *                   whatever's already in viewStore.
   *   - `null`      → **wipe** the PDF user-settings local cache, fall
   *                   back to library defaults. Use this for
   *                   multi-user shared-browser scenarios so a prior
   *                   user's scroll mode / zoom don't bleed through.
   *   - `undefined` → don't touch viewStore.
   */
  initial?: PdfViewSettingsState | null;
  /**
   * Optional integrator write-through callback. Fires on every
   * user-driven change with the full current snapshot. Same shape as
   * EPUB's `api.updateSettings`.
   */
  api?: PdfViewSettingsModuleAPI;
}

/**
 * PDF view settings module.
 *
 * Owns zoom, scroll mode, spread mode, rotation, and their persistence
 * across sessions via the host's viewStore. Replaces the scattered view
 * settings logic previously inlined in PDFNavigator.
 *
 * PDF-only — no EPUB counterpart yet and no shared interface. When FXL
 * zoom/pan is refactored into a module (post-3.7), an IViewSettingsModule
 * interface can be extracted.
 */
export class PdfViewSettingsModule implements ReaderModule<PDFModuleHost> {
  readonly name = NavigatorFeature.ViewSettings;
  readonly hostType = HostType.PDF;
  // No rightsKey — view settings always available.

  // Persistence keys used by the host's viewStore.
  private static readonly KEY_SCROLL = "pdf-scroll-mode";
  private static readonly KEY_SPREAD = "pdf-spread-mode";
  private static readonly KEY_SCALE = "pdf-scale-value";
  private static readonly KEY_ROTATE = "pdf-rotation";

  private readonly viewStore: Store;
  private readonly api?: PdfViewSettingsModuleAPI;
  private readonly initial?: PdfViewSettingsState | null;
  private host!: PDFModuleHost;

  constructor(config: PdfViewSettingsModuleConfig) {
    this.viewStore = config.viewStore;
    this.api = config.api;
    this.initial = config.initial;
  }

  attach(host: PDFModuleHost): void {
    this.host = host;
    // Apply the initial-settings contract BEFORE pdfjs has rendered
    // pages — the restore on `pagesinit` will then read whatever's in
    // viewStore (or fall back to defaults if we just cleared it).
    this.applyInitialSettings();
  }

  setup(): void {
    // Subscribe to pdfjs `pagesinit` to restore view settings once the
    // viewer has sized its page slots (the same lifecycle PDFNavigator
    // previously used for its inline restore).
    this.host.eventBus.on("pagesinit", this.onPagesInit);
  }

  private onPagesInit = (): void => {
    this.restore();
  };

  // ── Public API ──────────────────────────────────────────────

  fitToWidth(): void {
    this.host.pdfViewer.currentScaleValue = "page-width";
    this.saveSetting(PdfViewSettingsModule.KEY_SCALE, "page-width");
  }

  fitToPage(): void {
    this.host.pdfViewer.currentScaleValue = "page-fit";
    this.saveSetting(PdfViewSettingsModule.KEY_SCALE, "page-fit");
  }

  zoomIn(): void {
    this.host.pdfViewer.increaseScale();
    this.saveSetting(
      PdfViewSettingsModule.KEY_SCALE,
      this.host.pdfViewer.currentScaleValue
    );
  }

  zoomOut(): void {
    this.host.pdfViewer.decreaseScale();
    this.saveSetting(
      PdfViewSettingsModule.KEY_SCALE,
      this.host.pdfViewer.currentScaleValue
    );
  }

  rotateCw(): void {
    this.host.pdfViewer.pagesRotation =
      (this.host.pdfViewer.pagesRotation + 90) % 360;
    this.saveSetting(
      PdfViewSettingsModule.KEY_ROTATE,
      this.host.pdfViewer.pagesRotation
    );
  }

  rotateCcw(): void {
    this.host.pdfViewer.pagesRotation =
      (this.host.pdfViewer.pagesRotation + 270) % 360;
    this.saveSetting(
      PdfViewSettingsModule.KEY_ROTATE,
      this.host.pdfViewer.pagesRotation
    );
  }

  /** Set the spread mode (NONE=0, ODD=1, EVEN=2 — see pdfjs SpreadMode). */
  setSpreadMode(mode: number): void {
    this.host.pdfViewer.spreadMode = mode;
    this.saveSetting(PdfViewSettingsModule.KEY_SPREAD, mode);
  }

  setScrollMode(scroll: boolean, direction?: string): void {
    const mode = scroll
      ? direction === "horizontal"
        ? ScrollMode.HORIZONTAL
        : direction === "wrapped"
          ? ScrollMode.WRAPPED
          : ScrollMode.VERTICAL
      : ScrollMode.PAGE;
    this.host.pdfViewer.scrollMode = mode;
    this.saveSetting(PdfViewSettingsModule.KEY_SCROLL, mode);
  }

  stop(): void {
    this.host?.eventBus.off("pagesinit", this.onPagesInit);
  }

  // ── Persistence ─────────────────────────────────────────────

  private saveSetting(key: string, value: string | number): void {
    this.viewStore.set(key, String(value));
    // Write-through to integrator with the full snapshot (matches the
    // EPUB `api.updateSettings` shape — full settings on every change,
    // not a diff). Fire-and-forget — errors don't block local writes.
    this.fireUpdateSettings();
  }

  private fireUpdateSettings(): void {
    if (!this.api?.updateSettings) return;
    const snapshot = this.currentSnapshot();
    void this.api.updateSettings(snapshot);
  }

  private currentSnapshot(): PdfViewSettingsState {
    const scroll = this.viewStore.get(PdfViewSettingsModule.KEY_SCROLL);
    const spread = this.viewStore.get(PdfViewSettingsModule.KEY_SPREAD);
    const scale = this.viewStore.get(PdfViewSettingsModule.KEY_SCALE);
    const rotate = this.viewStore.get(PdfViewSettingsModule.KEY_ROTATE);
    const snap: PdfViewSettingsState = {};
    if (scroll !== null && scroll !== undefined) snap.scrollMode = Number(scroll);
    if (spread !== null && spread !== undefined) snap.spreadMode = Number(spread);
    if (scale !== null && scale !== undefined) snap.scale = scale;
    if (rotate !== null && rotate !== undefined) snap.rotation = Number(rotate);
    return snap;
  }

  /**
   * Apply the integrator's `initialSettings` contract to the local
   * viewStore. Runs once on `attach()` — BEFORE `pagesinit` fires and
   * `restore()` reads the store back.
   *
   *   - object → overwrite supplied fields, leave others untouched
   *   - null   → wipe all four keys (clear cross-user leak)
   *   - undef  → do nothing
   */
  private applyInitialSettings(): void {
    if (this.initial === undefined) return;
    if (this.initial === null) {
      this.viewStore.remove(PdfViewSettingsModule.KEY_SCROLL);
      this.viewStore.remove(PdfViewSettingsModule.KEY_SPREAD);
      this.viewStore.remove(PdfViewSettingsModule.KEY_SCALE);
      this.viewStore.remove(PdfViewSettingsModule.KEY_ROTATE);
      return;
    }
    const s = this.initial;
    if (s.scrollMode !== undefined) {
      this.viewStore.set(PdfViewSettingsModule.KEY_SCROLL, String(s.scrollMode));
    }
    if (s.spreadMode !== undefined) {
      this.viewStore.set(PdfViewSettingsModule.KEY_SPREAD, String(s.spreadMode));
    }
    if (s.scale !== undefined) {
      this.viewStore.set(PdfViewSettingsModule.KEY_SCALE, String(s.scale));
    }
    if (s.rotation !== undefined) {
      this.viewStore.set(PdfViewSettingsModule.KEY_ROTATE, String(s.rotation));
    }
  }

  private restore(): void {
    const store = this.viewStore;

    const scroll = store.get(PdfViewSettingsModule.KEY_SCROLL);
    const spread = store.get(PdfViewSettingsModule.KEY_SPREAD);
    const scale = store.get(PdfViewSettingsModule.KEY_SCALE);
    const rotate = store.get(PdfViewSettingsModule.KEY_ROTATE);

    this.host.pdfViewer.currentScaleValue = scale ?? "page-fit";
    if (scroll !== null && scroll !== undefined) {
      this.host.pdfViewer.scrollMode = Number(scroll);
    }
    if (spread !== null && spread !== undefined) {
      this.host.pdfViewer.spreadMode = Number(spread);
    }
    if (rotate !== null && rotate !== undefined) {
      this.host.pdfViewer.pagesRotation = Number(rotate);
    }
  }
}
