/*
 * Copyright 2018-2025 DITA (AM Consulting LLC)
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
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { HostType } from "../modules/ReaderModule";
import type { ReaderModule } from "../modules/ReaderModule";
import { HttpFetcher } from "../fetcher/HttpFetcher";
import type { Fetcher } from "../fetcher/Fetcher";
import type { ZipFetcher } from "../fetcher/ZipFetcher";
import type { Link } from "../model/v3";
import {
  NavigatorFeature,
  NavigatorFeatureName,
  VisualNavigator,
} from "./VisualNavigator";
import { ReaderEvent } from "../utils/Events";
import { PDFModuleHost } from "../modules/ModuleHost";
import { UserSettings } from "../model/user-settings/UserSettings";
import {
  getPageFromLocations,
  Locator,
  Publication,
  ReadingPosition,
} from "../model/v3";
import Annotator from "../store/Annotator";
import {
  AnnotationEditorType,
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  PDFDocumentProxy,
  version as pdfjsVersion,
} from "pdfjs-dist";
import {
  EventBus,
  PDFFindController,
  PDFHistory,
  PDFLinkService,
  PDFViewer,
  ScrollMode,
  SpreadMode,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../utils/EventHandler";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import {
  releasePdfLinkServiceDocument,
  releasePdfViewerDocument,
} from "../types/pdfjs-workarounds";
import type { NavigatorAPI, ReaderRights } from "./types";
import { GrabToPan } from "../utils/GrabToPan";
import { readerLoading } from "../utils/HTMLTemplates";

export { SpreadMode, ScrollMode, AnnotationEditorType };

export interface PDFNavigatorConfig {
  mainElement: HTMLElement;
  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  publication: Publication;
  settings: UserSettings;
  api?: Partial<NavigatorAPI>;
  /**
   * Override the PDF.js worker URL.
   * Defaults to unpkg CDN for the bundled pdfjs-dist version.
   * Set this if you want to self-host the worker (copy
   * node_modules/pdfjs-dist/build/pdf.worker.min.mjs to your server).
   */
  workerSrc?: string;
  /** Annotator used to persist the last reading position and bookmarks across sessions. */
  annotator?: Annotator;
  /** Pre-loaded reading position to seed the annotator before navigation. */
  initialLastReadingPosition?: ReadingPosition;
  rights?: Partial<ReaderRights>;
  /**
   * Modules to register with this navigator. Includes built-in PDF modules
   * (PdfBookmarkModule, PdfSearchModule, PdfAnnotationModule, PdfHistoryModule,
   * PdfViewSettingsModule) plus any third-party custom modules. Module
   * hostType must be "pdf" — mismatches are logged and skipped.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules?: Array<ReaderModule<any> | undefined>;
}

export class PDFNavigator extends VisualNavigator implements PDFModuleHost {
  settings: UserSettings;
  readonly publication: Publication;
  readonly rights: Partial<ReaderRights> = {};

  supports(feature: NavigatorFeatureName): boolean {
    // Zoom is navigator-level (not module-based) — always supported.
    if (feature === NavigatorFeature.Zoom) return true;
    // Everything else goes through the registry with rights gating.
    return this.registry.has(feature);
  }

  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  mainElement: HTMLElement;
  pdfContainer: HTMLElement;
  wrapper: HTMLElement;

  readonly api?: Partial<NavigatorAPI>;

  pageNum = 1;
  resourceIndex = 0;

  // ── Internal state ──────────────────────────────────────────
  // pdfjs primitives modules consume via the PDFModuleHost interface
  // (declared `readonly` there so module callers can't mutate them).
  // The class itself writes to them as the document loads / unloads.
  pdfDoc: PDFDocumentProxy | null = null;
  pdfViewer!: PDFViewer;
  eventBus!: EventBus;
  fetcher!: Fetcher;

  private resource: Link | undefined;
  private readonly workerSrc: string;
  private numPages = 0;
  private readonly annotator?: Annotator;
  private readonly initialLastReadingPosition?: ReadingPosition;
  private positionRestored = false;
  private linkService!: PDFLinkService;
  private findController!: PDFFindController;
  private pdfHistory!: PDFHistory;
  private handTool!: GrabToPan;

  // ── PDFModuleHost implementation (read-only via interface) ──
  get currentPage(): number {
    return this.pageNum;
  }
  get totalPages(): number {
    return this.pdfDoc?.numPages ?? this.numPages ?? 0;
  }
  get fingerprint(): string | undefined {
    return this.pdfDoc?.fingerprints[0] ?? undefined;
  }
  // goToPage(page) is implemented as an abstract override below (required
  // by the Navigator interface). PDFModuleHost.goToPage matches that signature.
  get currentResourceLink(): Link | undefined {
    return this.resource;
  }

  private resizeTimeout: ReturnType<typeof setTimeout> | undefined;

  // ── Factory ────────────────────────────────────────────────────────────────

  public static async create(
    config: PDFNavigatorConfig
  ): Promise<PDFNavigator> {
    const nav = new this(config);
    await nav.start(config.mainElement, config.headerMenu, config.footerMenu);
    return nav;
  }

  protected constructor(config: PDFNavigatorConfig) {
    super();
    this.settings = config.settings;
    this.publication = config.publication;
    this.api = config.api;
    this.rights = config.rights ?? {};
    this.workerSrc =
      config.workerSrc ??
      `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
    this.annotator = config.annotator;
    this.initialLastReadingPosition = config.initialLastReadingPosition;
    this.fetcher = new HttpFetcher();

    this.registerModules(config.modules, HostType.PDF);
  }

  // ── Startup ────────────────────────────────────────────────────────────────

  protected async start(
    mainElement: HTMLElement,
    headerMenu?: HTMLElement | null,
    footerMenu?: HTMLElement | null
  ): Promise<void> {
    this.headerMenu = headerMenu;
    this.footerMenu = footerMenu;
    this.mainElement = mainElement;

    this.resourceIndex = 0;
    this.resource = this.publication.readingOrder[this.resourceIndex];

    GlobalWorkerOptions.workerSrc = this.workerSrc;

    this.wrapper = HTMLUtilities.findRequiredElement(
      this.mainElement,
      "#iframe-wrapper"
    );
    this.pdfContainer = HTMLUtilities.findRequiredElement(
      this.mainElement,
      "#pdf-container"
    );

    // PDFViewer v5 requires the container to be absolutely positioned
    // and to be the scroll root (overflow: auto/scroll).
    this.wrapper.style.position = "absolute";
    this.wrapper.style.overflow = "auto";
    this.wrapper.style.top = "0";
    this.wrapper.style.left = "0";
    this.wrapper.style.right = "0";
    this.wrapper.style.bottom = "0";
    // pdf_viewer.css targets .pdfViewer on the inner element.
    this.pdfContainer.classList.add("pdfViewer");

    this.handTool = new GrabToPan({ element: this.wrapper });

    // ── Build pdfjs viewer stack ─────────────────────────────────────────────
    this.eventBus = new EventBus();

    this.linkService = new PDFLinkService({ eventBus: this.eventBus });

    this.findController = new PDFFindController({
      linkService: this.linkService,
      eventBus: this.eventBus,
    });

    this.pdfViewer = new PDFViewer({
      container: this.wrapper as HTMLDivElement,
      viewer: this.pdfContainer as HTMLDivElement,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      // Enables text selection and search highlight overlay.
      textLayerMode: 1, // TextLayerMode.ENABLE
      // Renders PDF annotations AND stores user-created ones in AnnotationStorage.
      annotationMode: AnnotationMode.ENABLE_STORAGE,
      // Editor is active (mode NONE = ready, no specific tool selected yet).
      // Call setAnnotationEditorMode() to activate Highlight / FreeText / Ink / Stamp.
      annotationEditorMode: AnnotationEditorType.NONE,
      // Default highlight colour palette — required so AnnotationEditorUIManager
      // can resolve colour names (used by telemetryInitialData on restore).
      // Format: "Name=HexColor" pairs separated by commas.
      annotationEditorHighlightColors:
        "Yellow=#FFFF98,Green=#53FFBC,Blue=#80EBFF,Pink=#FFCBE6,Red=#FF4F5F",
    });

    this.linkService.setViewer(this.pdfViewer);
    // spreadMode must be set after viewer construction, not in options.
    this.pdfViewer.spreadMode = SpreadMode.NONE;

    // PDFHistory integrates PDF navigation with the browser history API.
    this.pdfHistory = new PDFHistory({
      eventBus: this.eventBus,
      linkService: this.linkService,
    });
    this.linkService.setHistory(this.pdfHistory);

    // ── Wire events ──────────────────────────────────────────────────────────

    // pagesinit fires once PDFViewer has sized all page slots. PdfViewSettingsModule
    // restores saved view preferences (scroll/spread/scale/rotate); navigator only
    // needs to ensure the current page number is applied.
    this.eventBus.on("pagesinit", () => {
      this.pdfViewer.currentPageNumber = this.pageNum;
    });

    // Keep pageNum in sync and persist the reading position on every page turn.
    // Note: intentionally NOT calling registry.notifyResourceReady() here —
    // that is a per-resource lifecycle event, not a per-page one. Resources
    // only change when loadDocument() swaps to a new PDF (handled by the
    // pagesloaded handler below).
    this.eventBus.on(
      "pagechanging",
      ({ pageNumber }: { pageNumber: number }) => {
        this.pageNum = pageNumber;
        this.saveLastReadingPosition();
        this.emit(ReaderEvent.PageChanged, {
          page: pageNumber,
          totalPages: this.pdfDoc?.numPages ?? this.numPages,
        });
        // Emit boundary events so integrators get the same signals as EPUB.
        if (this.atStart()) {
          this.api?.resourceAtStart?.();
          this.emit(ReaderEvent.ResourceStart, {
            href: this.publication.readingOrder[0]?.href,
          });
        } else if (this.atEnd()) {
          this.api?.resourceAtEnd?.();
          this.emit(ReaderEvent.ResourceEnd, {
            href: this.publication.readingOrder[0]?.href,
          });
        }
      }
    );

    // pagesloaded fires after all pages finish their first render pass.
    this.eventBus.on(
      "pagesloaded",
      async ({ pagesCount }: { pagesCount: number }) => {
        this.numPages = pagesCount;
        this.hideLoading();
        this.api?.resourceReady?.();
        this.emit(ReaderEvent.ResourceReady, {
          href: this.publication.readingOrder[0]?.href,
        });
        this.registry.notifyResourceReady();
        // Restore saved position once — on the very first document load only.
        if (!this.positionRestored) {
          this.positionRestored = true;
          await this.restoreLastReadingPosition();
        }
      }
    );

    // Annotation persistence (layer-rendered + state-changed handlers,
    // pending queue, debounced save, onSetModified wiring) now lives in
    // PdfAnnotationModule. Registered via reader.ts and hooked up through
    // the module lifecycle (setup / onResourceReady / stop).

    // Run module setup BEFORE loading the document — modules subscribe to
    // eventBus events (annotationeditorlayerrendered, updatefindmatchescount,
    // pagesinit for view settings restore, etc.) during setup(). If the
    // document loads first, those initial events are missed.
    await this.registry.setupAll();

    this.showLoading();
    await this.loadDocument(
      this.publication.getAbsoluteHref(this.resource.href),
      1
    );

    addEventListenerOptional(window, "resize", this.onResize);
  }

  // ── Loading overlay ────────────────────────────────────────────────────────

  private showLoading(): void {
    let el = document.getElementById("loadingpdf");
    if (el) {
      el.style.display = "flex";
      return;
    }
    el = document.createElement("div");
    el.id = "loadingpdf";
    el.innerHTML = readerLoading;
    Object.assign(el.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      zIndex: "100",
      alignItems: "center",
      justifyContent: "center",
      background: "white",
    });
    el.className = "dita-loading is-loading";
    (this.wrapper.parentElement ?? document.body).appendChild(el);
  }

  private hideLoading(): void {
    const el = document.getElementById("loadingpdf");
    if (el) el.style.display = "none";
  }

  // ── Document loading ───────────────────────────────────────────────────────

  private async loadDocument(url: string, pageNum: number): Promise<void> {
    this.showLoading();
    this.pageNum = pageNum;

    // Destroy the previous document to free memory before loading the next.
    if (this.pdfDoc) {
      releasePdfViewerDocument(this.pdfViewer);
      releasePdfLinkServiceDocument(this.linkService);
      await this.pdfDoc.destroy();
      this.pdfDoc = null;
    }

    try {
      // If the Fetcher is a ZipFetcher (e.g., a multi-file PDF bundled in a
      // ZIP), extract the raw bytes and pass them to pdfjs instead of a URL.
      let task;
      if ("getBytes" in this.fetcher) {
        const zipFetcher = this.fetcher as ZipFetcher;
        const bytes = zipFetcher.getBytes(url);
        if (bytes) {
          task = getDocument({ data: bytes });
        } else {
          task = getDocument(url);
        }
      } else {
        task = getDocument(url);
      }
      const doc = await task.promise;
      this.pdfDoc = doc;
      this.pdfViewer.setDocument(doc);
      this.linkService.setDocument(doc);
      this.pdfHistory.initialize({ fingerprint: doc.fingerprints[0] ?? "" });
      // Annotation restore + onSetModified wiring moved to PdfAnnotationModule,
      // which hooks in via its onResourceReady lifecycle once pagesloaded fires.
    } catch (err) {
      this.hideLoading();
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("PDFNavigator: failed to load document", url, error);
      this.api?.onError?.(error);
      this.emit(ReaderEvent.ResourceError, error);
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  private onResize = (): void => {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (this.pdfViewer) {
        // Re-assigning the same scaleValue triggers a layout recalculation.
        const value = this.pdfViewer.currentScaleValue;
        this.pdfViewer.currentScaleValue = value;
      }
    }, 200);
  };

  // ── Navigator interface ────────────────────────────────────────────────────

  atStart(): boolean {
    return this.pageNum <= 1 && this.resourceIndex === 0;
  }

  atEnd(): boolean {
    const lastResource =
      this.resourceIndex >= this.publication.readingOrder.length - 1;
    return lastResource && this.pageNum >= (this.pdfDoc?.numPages ?? 1);
  }

  currentResource(): number {
    return this.resourceIndex;
  }

  currentLocator(): Locator {
    const totalPages = this.pdfDoc?.numPages ?? this.numPages ?? 1;
    const progression =
      totalPages > 1 ? (this.pageNum - 1) / (totalPages - 1) : 0;
    return {
      href: this.resource
        ? this.publication.getAbsoluteHref(this.resource.href)
        : "",
      title: `Page ${this.pageNum}`,
      locations: {
        page: this.pageNum,
        progression,
      },
      type: "application/pdf",
    };
  }

  // ── Page navigation ────────────────────────────────────────────────────────

  nextPage(): void {
    if (this.pageNum >= (this.pdfDoc?.numPages ?? 1)) {
      this.nextResource();
      return;
    }
    // Use PDFViewer.nextPage() directly — it calls #getPageAdvance() internally
    // which advances by 2 in spread mode and by 1 in single-page mode.
    this.pdfViewer.nextPage();
  }

  previousPage(): void {
    if (this.pageNum <= 1) {
      this.previousResource();
      return;
    }
    this.pdfViewer.previousPage();
  }

  // ── Resource navigation ────────────────────────────────────────────────────

  nextResource(): void {
    if (this.resourceIndex >= this.publication.readingOrder.length - 1) return;
    this.resourceIndex++;
    this.resource = this.publication.readingOrder[this.resourceIndex];
    this.loadDocument(this.publication.getAbsoluteHref(this.resource.href), 1);
  }

  previousResource(): void {
    if (this.resourceIndex === 0) return;
    this.resourceIndex--;
    this.resource = this.publication.readingOrder[this.resourceIndex];
    this.loadDocument(
      this.publication.getAbsoluteHref(this.resource.href),
      this.pdfDoc?.numPages ?? 1
    );
  }

  // ── Location ───────────────────────────────────────────────────────────────

  goTo(locator: Locator): void {
    // 1. Explicit page field takes priority (used by bookmarks / reading positions).
    //    Accepts legacy `position` too via getPageFromLocations for backwards compat.
    const explicitPage = getPageFromLocations(locator.locations);
    if (typeof explicitPage === "number") {
      this.pdfViewer.currentPageNumber = explicitPage;
      return;
    }

    const href = locator.href ?? "";
    const page = this.pageFromHref(href) ?? 1;

    // 2. If the locator points to a different resource, load it first.
    if (href) {
      const baseHref = href.split("#")[0].split("?")[0];
      const targetIdx = this.publication.readingOrder.findIndex((item) => {
        if (!item.href) return false;
        const abs = this.publication.getAbsoluteHref(item.href);
        return (
          item.href === baseHref ||
          abs === baseHref ||
          abs === this.toAbsoluteHref(baseHref)
        );
      });
      if (targetIdx >= 0 && targetIdx !== this.resourceIndex) {
        this.resourceIndex = targetIdx;
        this.resource = this.publication.readingOrder[this.resourceIndex];
        this.loadDocument(
          this.publication.getAbsoluteHref(this.resource.href),
          page
        );
        return;
      }
    }

    this.pdfViewer.currentPageNumber = page;
  }

  /**
   * Extract a 1-based page number from an href.
   * Handles:
   *   - `#page=N`  — PDF.js / PDF URL fragment convention
   *   - `?start=N` — Readium webpub-manifest convention
   *   - `?page=N`  — alternative query param
   */
  private pageFromHref(href: string): number | null {
    if (!href) return null;
    // Fragment #page=N takes priority
    const hashPage = href.match(/#page=(\d+)/i);
    if (hashPage) return parseInt(hashPage[1], 10);
    try {
      const url = new URL(href, window.location.href);
      if (url.searchParams.has("start"))
        return parseInt(url.searchParams.get("start")!, 10);
      if (url.searchParams.has("page"))
        return parseInt(url.searchParams.get("page")!, 10);
    } catch {
      /* not a valid URL — ignore */
    }
    return null;
  }

  private toAbsoluteHref(href: string): string {
    try {
      return new URL(href, window.location.href).href;
    } catch {
      return href;
    }
  }

  goToPosition(value: number): void {
    this.pdfViewer.currentPageNumber = value;
  }

  async goToPage(page: number): Promise<void> {
    this.pdfViewer.currentPageNumber = page;
  }

  // View settings persistence moved to PdfViewSettingsModule.
  // Annotation persistence moved to PdfAnnotationModule.
  // Bookmarks moved to PdfBookmarkModule.
  // Search moved to PdfSearchModule.

  // ── Zoom (navigator-level — called by D2Reader.fitToPage() etc.) ──────────

  fitToWidth(): void {
    this.modules.viewSettings?.fitToWidth();
  }

  fitToPage(): void {
    this.modules.viewSettings?.fitToPage();
  }

  zoomIn(): void {
    this.modules.viewSettings?.zoomIn();
  }

  zoomOut(): void {
    this.modules.viewSettings?.zoomOut();
  }

  // ── Hand tool (pan / grab) ─────────────────────────────────────────────────

  activateHand(): void {
    this.handTool.activate();
  }

  deactivateHand(): void {
    this.handTool.deactivate();
  }

  // ── Scroll mode (called by D2Reader.scroll()) ─────────────────────────────

  async scroll(scroll: boolean, direction?: string): Promise<void> {
    this.modules.viewSettings?.setScrollMode(scroll, direction);
  }

  // ── Reading position persistence ───────────────────────────────────────────

  private saveLastReadingPosition(): void {
    if (!this.annotator || !this.resource) return;
    const position: ReadingPosition = {
      href: this.publication.getAbsoluteHref(this.resource.href),
      locations: { page: this.pageNum },
      type: "application/pdf",
      created: new Date(),
    };
    if (this.api?.updateCurrentLocation) {
      this.api.updateCurrentLocation(position).then(() => {
        this.annotator!.saveLastReadingPosition(position);
      });
    } else {
      this.annotator.saveLastReadingPosition(position);
    }
    this.emit(ReaderEvent.LocationChanged, position);
  }

  private async restoreLastReadingPosition(): Promise<void> {
    // Seed the annotator from config if provided (allows host app to pre-load a position).
    if (this.initialLastReadingPosition) {
      this.annotator?.initLastReadingPosition(this.initialLastReadingPosition);
    }
    if (!this.annotator) return;

    const saved = this.annotator.getLastReadingPosition();
    if (!saved) return;

    const page = getPageFromLocations(saved.locations) ?? 1;

    // Find the matching resource by comparing absolute hrefs.
    const idx = this.publication.readingOrder.findIndex(
      (item) =>
        item.href && this.publication.getAbsoluteHref(item.href) === saved.href
    );

    if (idx >= 0 && idx !== this.resourceIndex) {
      // Saved position is in a different resource — load it.
      this.resourceIndex = idx;
      this.resource = this.publication.readingOrder[this.resourceIndex];
      await this.loadDocument(
        this.publication.getAbsoluteHref(this.resource.href),
        page
      );
    } else {
      // Same resource — just jump to the saved page.
      this.pdfViewer.currentPageNumber = page;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  stop(): void {
    this.registry.stopAll();
    removeEventListenerOptional(window, "resize", this.onResize);
    if (this.pdfViewer) releasePdfViewerDocument(this.pdfViewer);
    this.pdfDoc?.destroy();
    this.pdfDoc = null;
  }
}
