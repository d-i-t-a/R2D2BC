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

export interface PdfViewSettingsModuleConfig {
  viewStore: Store;
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
  private host!: PDFModuleHost;

  constructor(config: PdfViewSettingsModuleConfig) {
    this.viewStore = config.viewStore;
  }

  attach(host: PDFModuleHost): void {
    this.host = host;
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
