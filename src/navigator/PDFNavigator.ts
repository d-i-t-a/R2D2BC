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

import log from "loglevel";
import { HostType } from "../modules/ReaderModule";
import {
  VisualNavigator,
  NavigatorFeature,
  NavigatorFeatureName,
} from "./VisualNavigator";
import { ReaderEvent } from "../utils/Events";
import { PDFModuleHost } from "../modules/ModuleHost";
import { UserSettings } from "../model/user-settings/UserSettings";
import { Publication } from "../model/v3";
import {
  Link,
  Locator,
  ReadingPosition,
  getPageFromLocations,
} from "../model/v3";
import Annotator from "../store/Annotator";
import Store from "../store/Store";
import {
  getDocument,
  GlobalWorkerOptions,
  PDFDocumentProxy,
  AnnotationMode,
  AnnotationEditorType,
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
  releasePdfViewerDocument,
  releasePdfLinkServiceDocument,
} from "../types/pdfjs-workarounds";
import { NavigatorAPI, ReaderRights } from "./EpubNavigator";
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
  /**
   * Store used to persist PDF view settings (scroll mode, spread mode, zoom, rotation)
   * across sessions.  Pass the publication store from D2Reader.load().
   */
  store?: Store;
  rights?: Partial<ReaderRights>;
  /**
   * Modules to register with this navigator. Includes built-in PDF modules
   * (PdfBookmarkModule, PdfSearchModule, PdfAnnotationModule, PdfHistoryModule,
   * PdfViewSettingsModule) plus any third-party custom modules. Module
   * hostType must be "pdf" — mismatches are logged and skipped.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules?: Array<
    import("../modules/ReaderModule").ReaderModule<any> | undefined
  >;
}

export enum ScaleType {
  Page = 0,
  Width = 1,
}

export class PDFNavigator extends VisualNavigator implements PDFModuleHost {
  readonly isPDF = true;
  settings: UserSettings;
  publication: Publication;
  rights: Partial<ReaderRights> = {};

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

  api?: Partial<NavigatorAPI>;

  pageNum = 1;
  resourceIndex = 0;

  // ── Internal state ──────────────────────────────────────────
  // These fields are accessed by PDF modules via the PDFModuleHost getters
  // defined below. Kept private so only PDFNavigator can mutate them.
  private _pdfDoc: PDFDocumentProxy | null = null;
  private _resource: import("../model/v3").Link | undefined;
  private workerSrc: string;
  private _numPages = 0;
  private _annotator?: Annotator;
  private _viewStore?: Store;
  private initialLastReadingPosition?: ReadingPosition;
  private _positionRestored = false;

  private _pdfViewer!: PDFViewer;
  private _eventBus!: EventBus;
  private _linkService!: PDFLinkService;
  private _findController!: PDFFindController;
  private pdfHistory!: PDFHistory;
  private handTool!: GrabToPan;

  // ── PDFModuleHost implementation (read-only access for modules) ──
  get pdfDoc(): PDFDocumentProxy | null {
    return this._pdfDoc;
  }
  get pdfViewer(): PDFViewer {
    return this._pdfViewer;
  }
  get eventBus(): EventBus {
    return this._eventBus;
  }
  get linkService(): PDFLinkService {
    return this._linkService;
  }
  get findController(): PDFFindController {
    return this._findController;
  }
  get currentPage(): number {
    return this.pageNum;
  }
  get totalPages(): number {
    return this._pdfDoc?.numPages ?? this._numPages ?? 0;
  }
  get fingerprint(): string | undefined {
    return this._pdfDoc?.fingerprints[0] ?? undefined;
  }
  // goToPage(page) is implemented as an abstract override below (required
  // by the Navigator interface). PDFModuleHost.goToPage matches that signature.
  get viewStore(): Store | undefined {
    return this._viewStore;
  }
  get annotator(): Annotator | undefined {
    return this._annotator;
  }
  get currentResourceLink(): import("../model/v3").Link | undefined {
    return this._resource;
  }

  private resizeTimeout: ReturnType<typeof setTimeout> | undefined;

  // ── Factory ────────────────────────────────────────────────────────────────

  public static async create(
    config: PDFNavigatorConfig
  ): Promise<PDFNavigator> {
    const nav = new this(
      config.settings,
      config.publication,
      config.api,
      config.workerSrc,
      config.annotator,
      config.initialLastReadingPosition,
      config.store,
      config.rights,
      config.modules
    );
    await nav.start(config.mainElement, config.headerMenu, config.footerMenu);
    return nav;
  }

  protected constructor(
    settings: UserSettings,
    publication: Publication,
    api?: Partial<NavigatorAPI>,
    workerSrc?: string,
    annotator?: Annotator,
    initialLastReadingPosition?: ReadingPosition,
    viewStore?: Store,
    rights?: Partial<ReaderRights>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modules?: Array<
      import("../modules/ReaderModule").ReaderModule<any> | undefined
    >
  ) {
    super();
    this.settings = settings;
    this.publication = publication;
    this.api = api;
    this.rights = rights ?? {};
    this.workerSrc =
      workerSrc ??
      `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
    this._annotator = annotator;
    this.initialLastReadingPosition = initialLastReadingPosition;
    this._viewStore = viewStore;

    // Register modules with hostType validation. Mismatches are logged
    // and skipped — same pattern as EpubNavigator.
    for (const module of modules ?? []) {
      if (!module) continue;
      if (module.hostType !== HostType.PDF) {
        log.warn(
          `Module "${module.name}" requires host type "${module.hostType}" but navigator is PDF — skipping`
        );
        continue;
      }
      this.registry.register(module, this);
    }
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
    this._resource = this.publication.readingOrder[this.resourceIndex];

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
    this._eventBus = new EventBus();

    this._linkService = new PDFLinkService({ eventBus: this._eventBus });

    this._findController = new PDFFindController({
      linkService: this._linkService,
      eventBus: this._eventBus,
    });

    this._pdfViewer = new PDFViewer({
      container: this.wrapper as HTMLDivElement,
      viewer: this.pdfContainer as HTMLDivElement,
      eventBus: this._eventBus,
      linkService: this._linkService,
      findController: this._findController,
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

    this._linkService.setViewer(this._pdfViewer);
    // spreadMode must be set after viewer construction, not in options.
    this._pdfViewer.spreadMode = SpreadMode.NONE;

    // PDFHistory integrates PDF navigation with the browser history API.
    this.pdfHistory = new PDFHistory({
      eventBus: this._eventBus,
      linkService: this._linkService,
    });
    this._linkService.setHistory(this.pdfHistory);

    // ── Wire events ──────────────────────────────────────────────────────────

    // pagesinit fires once PDFViewer has sized all page slots. PdfViewSettingsModule
    // restores saved view preferences (scroll/spread/scale/rotate); navigator only
    // needs to ensure the current page number is applied.
    this._eventBus.on("pagesinit", () => {
      this._pdfViewer.currentPageNumber = this.pageNum;
    });

    // Keep pageNum in sync and persist the reading position on every page turn.
    // Note: intentionally NOT calling registry.notifyResourceReady() here —
    // that is a per-resource lifecycle event, not a per-page one. Resources
    // only change when loadDocument() swaps to a new PDF (handled by the
    // pagesloaded handler below).
    this._eventBus.on(
      "pagechanging",
      ({ pageNumber }: { pageNumber: number }) => {
        this.pageNum = pageNumber;
        this.saveLastReadingPosition();
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
    this._eventBus.on(
      "pagesloaded",
      async ({ pagesCount }: { pagesCount: number }) => {
        this._numPages = pagesCount;
        this.hideLoading();
        this.api?.resourceReady?.();
        this.emit(ReaderEvent.ResourceReady, {
          href: this.publication.readingOrder[0]?.href,
        });
        this.registry.notifyResourceReady();
        // Restore saved position once — on the very first document load only.
        if (!this._positionRestored) {
          this._positionRestored = true;
          await this.restoreLastReadingPosition();
        }
      }
    );

    // Annotation persistence (layer-rendered + state-changed handlers,
    // pending queue, debounced save, onSetModified wiring) now lives in
    // PdfAnnotationModule. Registered via reader.ts and hooked up through
    // the module lifecycle (setup / onResourceReady / stop).

    this.showLoading();
    await this.loadDocument(
      this.publication.getAbsoluteHref(this._resource.href),
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
    el.className = "loading is-loading";
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
    if (this._pdfDoc) {
      releasePdfViewerDocument(this._pdfViewer);
      releasePdfLinkServiceDocument(this._linkService);
      await this._pdfDoc.destroy();
      this._pdfDoc = null;
    }

    try {
      const task = getDocument(url);
      const doc = await task.promise;
      this._pdfDoc = doc;
      this._pdfViewer.setDocument(doc);
      this._linkService.setDocument(doc);
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
      if (this._pdfViewer) {
        // Re-assigning the same scaleValue triggers a layout recalculation.
        const v = this._pdfViewer.currentScaleValue;
        this._pdfViewer.currentScaleValue = v;
      }
    }, 200);
  };

  // ── Navigator interface ────────────────────────────────────────────────────

  readingOrder(): Link[] {
    return this.publication.readingOrder;
  }

  tableOfContents(): Link[] {
    return this.publication.tableOfContents;
  }

  landmarks(): Link[] {
    return [];
  }

  pageList(): Link[] {
    return [];
  }

  atStart(): boolean {
    return this.pageNum <= 1 && this.resourceIndex === 0;
  }

  atEnd(): boolean {
    const lastResource =
      this.resourceIndex >= this.publication.readingOrder.length - 1;
    return lastResource && this.pageNum >= (this._pdfDoc?.numPages ?? 1);
  }

  currentResource(): number {
    return this.resourceIndex;
  }

  totalResources(): number {
    return this.publication.readingOrder.length;
  }

  currentLocator(): Locator {
    const totalPages = this._pdfDoc?.numPages ?? this._numPages ?? 1;
    const progression =
      totalPages > 1 ? (this.pageNum - 1) / (totalPages - 1) : 0;
    const locator: Locator = {
      href: this._resource
        ? this.publication.getAbsoluteHref(this._resource.href)
        : "",
      title: `Page ${this.pageNum}`,
      locations: {
        page: this.pageNum,
        progression,
      },
      type: "application/pdf",
    };
    return locator;
  }

  positions(): Locator[] {
    return this.publication.positions ?? [];
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** Total page count of the currently loaded document. */
  get numPages(): number {
    return this._numPages;
  }

  // ── Page navigation ────────────────────────────────────────────────────────

  nextPage(): void {
    if (this.pageNum >= (this._pdfDoc?.numPages ?? 1)) {
      this.nextResource();
      return;
    }
    // Use PDFViewer.nextPage() directly — it calls #getPageAdvance() internally
    // which advances by 2 in spread mode and by 1 in single-page mode.
    this._pdfViewer.nextPage();
  }

  previousPage(): void {
    if (this.pageNum <= 1) {
      this.previousResource();
      return;
    }
    this._pdfViewer.previousPage();
  }

  // ── Resource navigation ────────────────────────────────────────────────────

  nextResource(): void {
    if (this.resourceIndex >= this.publication.readingOrder.length - 1) return;
    this.resourceIndex++;
    this._resource = this.publication.readingOrder[this.resourceIndex];
    this.loadDocument(this.publication.getAbsoluteHref(this._resource.href), 1);
  }

  previousResource(): void {
    if (this.resourceIndex === 0) return;
    this.resourceIndex--;
    this._resource = this.publication.readingOrder[this.resourceIndex];
    this.loadDocument(
      this.publication.getAbsoluteHref(this._resource.href),
      this._pdfDoc?.numPages ?? 1
    );
  }

  // ── Location ───────────────────────────────────────────────────────────────

  goTo(locator: Locator): void {
    // 1. Explicit page field takes priority (used by bookmarks / reading positions).
    //    Accepts legacy `position` too via getPageFromLocations for backwards compat.
    const explicitPage = getPageFromLocations(locator.locations);
    if (typeof explicitPage === "number") {
      this._pdfViewer.currentPageNumber = explicitPage;
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
        this._resource = this.publication.readingOrder[this.resourceIndex];
        this.loadDocument(
          this.publication.getAbsoluteHref(this._resource.href),
          page
        );
        return;
      }
    }

    this._pdfViewer.currentPageNumber = page;
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
    this._pdfViewer.currentPageNumber = value;
  }

  async goToPage(page: number): Promise<void> {
    this._pdfViewer.currentPageNumber = page;
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

  /**
   * The AnnotationStorage instance that holds all user-created annotations
   * for the current document. Serialize with `.serializable` to persist them.
   */
  get annotationStorage() {
    return this._pdfDoc?.annotationStorage;
  }

  // ── Reading position persistence ───────────────────────────────────────────

  private saveLastReadingPosition(): void {
    if (!this._annotator || !this._resource) return;
    const position: ReadingPosition = {
      href: this.publication.getAbsoluteHref(this._resource.href),
      locations: { page: this.pageNum },
      type: "application/pdf",
      created: new Date(),
    };
    if (this.api?.updateCurrentLocation) {
      this.api.updateCurrentLocation(position).then(() => {
        this._annotator!.saveLastReadingPosition(position);
      });
    } else {
      this._annotator.saveLastReadingPosition(position);
    }
    this.emit(ReaderEvent.LocationChanged, position);
  }

  private async restoreLastReadingPosition(): Promise<void> {
    // Seed the annotator from config if provided (allows host app to pre-load a position).
    if (this.initialLastReadingPosition) {
      this._annotator?.initLastReadingPosition(this.initialLastReadingPosition);
    }
    if (!this._annotator) return;

    const saved = this._annotator.getLastReadingPosition();
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
      this._resource = this.publication.readingOrder[this.resourceIndex];
      await this.loadDocument(
        this.publication.getAbsoluteHref(this._resource.href),
        page
      );
    } else {
      // Same resource — just jump to the saved page.
      this._pdfViewer.currentPageNumber = page;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  stop(): void {
    this.registry.stopAll();
    removeEventListenerOptional(window, "resize", this.onResize);
    if (this._pdfViewer) releasePdfViewerDocument(this._pdfViewer);
    this._pdfDoc?.destroy();
    this._pdfDoc = null;
  }
}
