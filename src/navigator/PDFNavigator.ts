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

import debounce from "debounce";
import EventEmitter from "eventemitter3";
import Navigator from "./Navigator";
import { UserSettings } from "../model/user-settings/UserSettings";
import { Publication } from "../model/Publication";
import { Bookmark, Locator, ReadingPosition } from "../model/Locator";
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
import { NavigatorAPI } from "./IFrameNavigator";
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
}

export enum ScaleType {
  Page = 0,
  Width = 1,
}

export class PDFNavigator extends EventEmitter implements Navigator {
  settings: UserSettings;
  publication: Publication;

  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  mainElement: HTMLElement;
  pdfContainer: HTMLElement;
  wrapper: HTMLElement;

  api?: Partial<NavigatorAPI>;

  pageNum = 1;
  resourceIndex = 0;

  private pdfDoc: PDFDocumentProxy | null = null;
  private resource: any;
  private workerSrc: string;
  private _numPages = 0;
  private annotator?: Annotator;
  private viewStore?: Store;
  private initialLastReadingPosition?: ReadingPosition;
  private _positionRestored = false;
  // Saved annotations grouped by page index, waiting for their layer to render.
  private _pendingAnnotations: Map<number, unknown[]> | null = null;

  private pdfViewer!: PDFViewer;
  // Public so callers can subscribe to PDF.js events directly (e.g. pagechanging, updatefindmatchescount).
  public eventBus!: EventBus;
  private linkService!: PDFLinkService;
  private findController!: PDFFindController;
  private pdfHistory!: PDFHistory;
  private handTool!: GrabToPan;

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
      config.store
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
    viewStore?: Store
  ) {
    super();
    this.settings = settings;
    this.publication = publication;
    this.api = api;
    this.workerSrc =
      workerSrc ??
      `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
    this.annotator = annotator;
    this.initialLastReadingPosition = initialLastReadingPosition;
    this.viewStore = viewStore;
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

    // pagesinit fires once PDFViewer has sized all page slots; restore saved settings here.
    this.eventBus.on("pagesinit", () => {
      this.restoreViewSettings();
      this.pdfViewer.currentPageNumber = this.pageNum;
    });

    // Keep pageNum in sync and persist the reading position on every page turn.
    this.eventBus.on(
      "pagechanging",
      ({ pageNumber }: { pageNumber: number }) => {
        this.pageNum = pageNumber;
        this.saveLastReadingPosition();
        // Emit boundary events so integrators get the same signals as EPUB.
        if (this.atStart()) {
          this.api?.resourceAtStart?.();
          this.emit("resource.start");
        } else if (this.atEnd()) {
          this.api?.resourceAtEnd?.();
          this.emit("resource.end");
        }
      }
    );

    // pagesloaded fires after all pages finish their first render pass.
    this.eventBus.on(
      "pagesloaded",
      async ({ pagesCount }: { pagesCount: number }) => {
        this._numPages = pagesCount;
        this.hideLoading();
        this.api?.resourceReady?.();
        this.emit("resource.ready");
        // Restore saved position once — on the very first document load only.
        if (!this._positionRestored) {
          this._positionRestored = true;
          await this.restoreLastReadingPosition();
        }
      }
    );

    // When an annotation editor layer finishes rendering for a page, inject
    // any pending saved annotations for that page via the proper deserialize
    // path so they appear as live editors (not just raw storage values).
    //
    // NOTE: evt.source is PDFPageView; its .annotationEditorLayer property is
    // an AnnotationEditorLayerBuilder (a wrapper).  The actual AnnotationEditorLayer
    // with deserialize() / addOrRebuild() lives one level deeper as
    // .annotationEditorLayer.annotationEditorLayer.
    this.eventBus.on(
      "annotationeditorlayerrendered",
      async (evt: { source: any; pageNumber: number; error?: unknown }) => {
        if (evt.error || !this._pendingAnnotations) return;
        const pageIndex = evt.pageNumber - 1;
        const pending = this._pendingAnnotations.get(pageIndex);
        if (!pending || pending.length === 0) return;
        // Claim this page's pending set immediately to prevent double-restore.
        this._pendingAnnotations.delete(pageIndex);
        // Drill past the builder wrapper to the actual AnnotationEditorLayer.
        const layer = evt.source?.annotationEditorLayer?.annotationEditorLayer;
        if (!layer || !this.pdfDoc) return;

        // Suppress onSetModified during the restore loop.  Without this, the
        // callback fires after the *first* addOrRebuild and saveAnnotations()
        // runs before the remaining editors on this page are in live storage —
        // overwriting them.  We do a single authoritative save afterward.
        const storage = this.pdfDoc.annotationStorage as any;
        const savedOnSetModified = storage.onSetModified;
        storage.onSetModified = null;

        for (const data of pending) {
          try {
            const editor = await layer.deserialize(data);
            if (editor) layer.addOrRebuild(editor);
          } catch (err) {
            console.warn(
              "PDFNavigator: failed to restore annotation",
              data,
              err
            );
          }
        }

        // Restore the callback and do one complete save (live editors for this
        // page are now all in annotationStorage; remaining pending pages still
        // in _pendingAnnotations).
        storage.onSetModified = savedOnSetModified;
        this.saveAnnotations(this.pdfDoc.fingerprints[0] ?? "");
      }
    );

    // Also save after any annotation state change (debounced) — this fires
    // after editors are committed, catching cases where onSetModified fired
    // before the annotation content was finalised (e.g., empty highlight).
    const debouncedSave = debounce(() => {
      if (this.pdfDoc) {
        this.saveAnnotations(this.pdfDoc.fingerprints[0] ?? "");
      }
    }, 200);
    this.eventBus.on("annotationeditorstateschanged", debouncedSave);

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
    if (this.pdfDoc) {
      this.pdfViewer.setDocument(null as any);
      this.linkService.setDocument(null as any);
      await this.pdfDoc.destroy();
      this.pdfDoc = null;
    }

    try {
      const task = getDocument(url);
      const doc = await task.promise;
      this.pdfDoc = doc;
      this.pdfViewer.setDocument(doc);
      this.linkService.setDocument(doc);
      this.pdfHistory.initialize({ fingerprint: doc.fingerprints[0] ?? "" });
      // Restore saved annotations before pages render, then wire save-on-change.
      this.restoreAnnotations(doc.fingerprints[0] ?? "");
      // onSetModified is typed as `null` in the pdfjs-dist declarations but is
      // a settable callback in the runtime implementation.
      (doc.annotationStorage as any).onSetModified = () => {
        this.saveAnnotations(doc.fingerprints[0] ?? "");
      };
    } catch (err) {
      this.hideLoading();
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("PDFNavigator: failed to load document", url, error);
      this.api?.onError?.(error);
      this.emit("resource.error", error);
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  private onResize = (): void => {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (this.pdfViewer) {
        // Re-assigning the same scaleValue triggers a layout recalculation.
        const v = this.pdfViewer.currentScaleValue;
        this.pdfViewer.currentScaleValue = v;
      }
    }, 200);
  };

  // ── Navigator interface ────────────────────────────────────────────────────

  readingOrder(): any {
    return this.publication.readingOrder;
  }

  tableOfContents(): any {
    return this.publication.tableOfContents;
  }

  landmarks(): any {
    return [];
  }

  pageList(): any {
    return [];
  }

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

  totalResources(): number {
    return this.publication.readingOrder.length;
  }

  currentLocator(): Locator {
    const totalPages = this.pdfDoc?.numPages ?? this._numPages ?? 1;
    const progression =
      totalPages > 1 ? (this.pageNum - 1) / (totalPages - 1) : 0;
    return {
      href: this.resource
        ? this.publication.getAbsoluteHref(this.resource.href)
        : "",
      title: `Page ${this.pageNum}`,
      locations: {
        position: this.pageNum,
        progression,
      },
      type: "application/pdf",
    } as unknown as Locator;
  }

  positions(): any {
    return this.publication.positions ?? [];
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** Total page count of the currently loaded document. */
  get numPages(): number {
    return this._numPages;
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
    // 1. Explicit position field takes priority (used by bookmarks / reading positions).
    if (typeof locator.locations?.position === "number") {
      this.pdfViewer.currentPageNumber = locator.locations.position;
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

  // ── View settings persistence ──────────────────────────────────────────────

  private static readonly KEY_SCROLL = "pdf-scroll-mode";
  private static readonly KEY_SPREAD = "pdf-spread-mode";
  private static readonly KEY_SCALE = "pdf-scale-value";
  private static readonly KEY_ROTATE = "pdf-rotation";

  private saveViewSetting(key: string, value: string | number): void {
    this.viewStore?.set(key, String(value));
  }

  private restoreViewSettings(): void {
    const scroll = this.viewStore?.get(PDFNavigator.KEY_SCROLL);
    const spread = this.viewStore?.get(PDFNavigator.KEY_SPREAD);
    const scale = this.viewStore?.get(PDFNavigator.KEY_SCALE);
    const rotate = this.viewStore?.get(PDFNavigator.KEY_ROTATE);

    this.pdfViewer.currentScaleValue = scale ?? "page-fit";
    if (scroll !== null && scroll !== undefined)
      this.pdfViewer.scrollMode = Number(scroll);
    if (spread !== null && spread !== undefined)
      this.pdfViewer.spreadMode = Number(spread);
    if (rotate !== null && rotate !== undefined)
      this.pdfViewer.pagesRotation = Number(rotate);
  }

  // ── Annotation persistence ─────────────────────────────────────────────────

  private annotationKey(fingerprint: string): string {
    return `pdf-ann-${fingerprint || this.resourceIndex}`;
  }

  /**
   * Serialize the in-memory AnnotationStorage and write it to the viewStore.
   * Called via `annotationStorage.onSetModified` whenever an annotation is
   * added, edited, or deleted.
   *
   * Entries with bitmaps (image stamps) are skipped because ImageBitmap
   * cannot be JSON-serialised — they would need separate binary storage.
   */
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
      return value.map(PDFNavigator.toJsonSafe);
    }
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = PDFNavigator.toJsonSafe(v);
      }
      return out;
    }
    return value;
  }

  private saveAnnotations(fingerprint: string): void {
    if (!this.viewStore || !this.pdfDoc) return;
    const key = this.annotationKey(fingerprint);
    const plain: Record<string, unknown> = {};

    // 1. Live annotations — pages already rendered and deserialized into editors.
    const { map } = this.pdfDoc.annotationStorage.serializable as {
      map?: Map<string, Record<string, unknown>>;
    };
    if (map) {
      for (const [id, value] of map) {
        if ((value as any).bitmap) continue; // ImageBitmap can't JSON round-trip
        plain[id] = PDFNavigator.toJsonSafe(value);
      }
    }

    // 2. Pending annotations — pages not yet scrolled into view, still awaiting
    //    their annotation editor layer.  We must include these so that a save
    //    triggered by restoring page N doesn't silently drop pages N+1, N+2 …
    //    restoreAnnotations() groups by pageIndex from Object.values(), so the
    //    synthetic key format doesn't matter as long as it's unique.
    if (this._pendingAnnotations) {
      let i = 0;
      for (const [pageIndex, anns] of this._pendingAnnotations) {
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
   * the `annotationeditorlayerrendered` listener can inject each page's
   * editors as their layer becomes ready.  This must be called right after
   * `pdfViewer.setDocument()` so the data is in place before pages render.
   *
   * We do NOT call `annotationStorage.setValue()` here — that only fills the
   * raw storage map and is never read back by the AnnotationEditorUIManager.
   * Instead, `layer.deserialize()` + `layer.addOrRebuild()` reconstructs
   * proper AnnotationEditor instances from the saved JSON.
   */
  private restoreAnnotations(fingerprint: string): void {
    this._pendingAnnotations = null;
    if (!this.viewStore) return;
    const key = this.annotationKey(fingerprint);
    const raw = this.viewStore.get(key);
    if (!raw) return;
    try {
      const plain = JSON.parse(raw) as Record<string, unknown>;
      const grouped = new Map<number, unknown[]>();
      for (const value of Object.values(plain)) {
        const ann = value as any;
        const pageIndex: number = ann.pageIndex ?? 0;
        if (!grouped.has(pageIndex)) grouped.set(pageIndex, []);
        grouped.get(pageIndex)!.push(ann);
      }
      this._pendingAnnotations = grouped;
    } catch {
      // Corrupted store entry — ignore and start fresh.
    }
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  fitToWidth(): void {
    this.pdfViewer.currentScaleValue = "page-width";
    this.saveViewSetting(PDFNavigator.KEY_SCALE, "page-width");
  }

  fitToPage(): void {
    this.pdfViewer.currentScaleValue = "page-fit";
    this.saveViewSetting(PDFNavigator.KEY_SCALE, "page-fit");
  }

  zoomIn(): void {
    this.pdfViewer.increaseScale();
    this.saveViewSetting(
      PDFNavigator.KEY_SCALE,
      this.pdfViewer.currentScaleValue
    );
  }

  zoomOut(): void {
    this.pdfViewer.decreaseScale();
    this.saveViewSetting(
      PDFNavigator.KEY_SCALE,
      this.pdfViewer.currentScaleValue
    );
  }

  // ── Rotation ──────────────────────────────────────────────────────────────

  rotateCw(): void {
    this.pdfViewer.pagesRotation = (this.pdfViewer.pagesRotation + 90) % 360;
    this.saveViewSetting(PDFNavigator.KEY_ROTATE, this.pdfViewer.pagesRotation);
  }

  rotateCcw(): void {
    this.pdfViewer.pagesRotation = (this.pdfViewer.pagesRotation + 270) % 360;
    this.saveViewSetting(PDFNavigator.KEY_ROTATE, this.pdfViewer.pagesRotation);
  }

  // ── Spread mode ────────────────────────────────────────────────────────────

  setSpreadMode(mode: number): void {
    this.pdfViewer.spreadMode = mode;
    this.saveViewSetting(PDFNavigator.KEY_SPREAD, mode);
  }

  // ── Annotation editor ──────────────────────────────────────────────────────

  /**
   * Activate an annotation editor tool.
   * Pass an `AnnotationEditorType` value:
   *   NONE = 0      — editor on, no tool active (cursor / select mode)
   *   FREETEXT = 3  — add text notes
   *   HIGHLIGHT = 9 — highlight selected text
   *   STAMP = 13    — insert image stamps
   *   INK = 15      — freehand drawing
   */
  setAnnotationEditorMode(mode: number): void {
    // The PDFViewer exposes annotationEditorMode as a setter that accepts { mode }.
    // Do NOT dispatch "switchannotationeditormode" — that event is emitted BY the
    // AnnotationEditorUIManager, not listened to by PDFViewer.
    this.pdfViewer.annotationEditorMode = { mode };
  }

  /**
   * The AnnotationStorage instance that holds all user-created annotations
   * for the current document.  Serialize with `.serializable` to persist them.
   */
  get annotationStorage() {
    return this.pdfDoc?.annotationStorage;
  }

  /**
   * Clear all user-created annotations for the current document and remove
   * the persisted copy from the store.
   */
  /**
   * Returns every annotation across all pages — both those already deserialized
   * into live editor objects (in annotationStorage) and those still waiting for
   * their page to render (in _pendingAnnotations).  The sidebar uses this so it
   * can show the complete list without requiring every page to be scrolled into view.
   */
  getAllAnnotations(): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];

    // Live annotations: already deserialized on rendered pages.
    const { map } = (this.pdfDoc?.annotationStorage.serializable ?? {}) as {
      map?: Map<string, Record<string, unknown>>;
    };
    if (map) {
      for (const value of map.values()) {
        result.push(PDFNavigator.toJsonSafe(value) as Record<string, unknown>);
      }
    }

    // Pending annotations: pages not yet rendered, still awaiting their layer.
    if (this._pendingAnnotations) {
      for (const anns of this._pendingAnnotations.values()) {
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

  clearAnnotations(): void {
    if (!this.pdfDoc) return;
    const storage = this.pdfDoc.annotationStorage;
    // Remove every stored entry individually.
    const { map } = storage.serializable as {
      map?: Map<string, unknown>;
    };
    if (map) {
      for (const id of map.keys()) {
        storage.remove(id);
      }
    }
    if (this.viewStore && this.pdfDoc.fingerprints[0]) {
      this.viewStore.remove(this.annotationKey(this.pdfDoc.fingerprints[0]));
    }
  }

  // ── Bookmarks ─────────────────────────────────────────────────────────────

  private makeBookmark(): Bookmark {
    return {
      id: crypto.randomUUID(),
      href: this.resource
        ? this.publication.getAbsoluteHref(this.resource.href)
        : "",
      locations: { position: this.pageNum },
      type: "application/pdf",
      title: `Page ${this.pageNum}`,
      created: new Date(),
    };
  }

  /** Save a bookmark for the current page. Returns null if already bookmarked. */
  saveBookmark(): Bookmark | null {
    if (!this.annotator) return null;
    // Use position-based check — locatorExists only compares `locations.progression`
    // which is undefined on PDF bookmarks, so it always matches.
    if (this.isCurrentPageBookmarked()) return null;
    return this.annotator.saveBookmark(this.makeBookmark());
  }

  /** Delete a previously saved bookmark. */
  deleteBookmark(bookmark: Bookmark): void {
    this.annotator?.deleteBookmark(bookmark);
  }

  /** Return all bookmarks for the current resource. */
  getBookmarks(): Bookmark[] {
    if (!this.annotator || !this.resource) return [];
    return this.annotator.getBookmarks(
      this.publication.getAbsoluteHref(this.resource.href)
    );
  }

  /** True if the current page already has a bookmark. */
  isCurrentPageBookmarked(): boolean {
    // Compare by page position — locatorExists uses `locations.progression`
    // which is undefined for PDF locators and would produce false positives.
    return this.getBookmarks().some(
      (b) => b.locations?.position === this.pageNum
    );
  }

  // ── Hand tool (pan / grab) ─────────────────────────────────────────────────

  activateHand(): void {
    this.handTool.activate();
  }

  deactivateHand(): void {
    this.handTool.deactivate();
  }

  // ── Scroll mode ────────────────────────────────────────────────────────────

  async scroll(scroll: boolean, direction?: string): Promise<void> {
    const mode = scroll
      ? direction === "horizontal"
        ? ScrollMode.HORIZONTAL
        : direction === "wrapped"
          ? ScrollMode.WRAPPED
          : ScrollMode.VERTICAL
      : ScrollMode.PAGE;
    this.pdfViewer.scrollMode = mode;
    this.saveViewSetting(PDFNavigator.KEY_SCROLL, mode);
  }

  // ── Text search (wired to PDFFindController) ────────────────────────────────

  find(
    query: string,
    options?: {
      caseSensitive?: boolean;
      highlightAll?: boolean;
      findPrevious?: boolean;
    }
  ): void {
    this.eventBus.dispatch("find", {
      query,
      caseSensitive: options?.caseSensitive ?? false,
      highlightAll: options?.highlightAll ?? true,
      findPrevious: options?.findPrevious ?? false,
      type: "",
    });
  }

  findNext(): void {
    this.eventBus.dispatch("find", {
      query: (this.findController as any).state?.query ?? "",
      caseSensitive: false,
      highlightAll: true,
      findPrevious: false,
      type: "again",
    });
  }

  findPrevious(): void {
    this.eventBus.dispatch("find", {
      query: (this.findController as any).state?.query ?? "",
      caseSensitive: false,
      highlightAll: true,
      findPrevious: true,
      type: "again",
    });
  }

  // ── Reading position persistence ───────────────────────────────────────────

  private saveLastReadingPosition(): void {
    if (!this.annotator || !this.resource) return;
    const position: ReadingPosition = {
      href: this.publication.getAbsoluteHref(this.resource.href),
      locations: { position: this.pageNum },
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
  }

  private async restoreLastReadingPosition(): Promise<void> {
    // Seed the annotator from config if provided (allows host app to pre-load a position).
    if (this.initialLastReadingPosition) {
      this.annotator?.initLastReadingPosition(this.initialLastReadingPosition);
    }
    if (!this.annotator) return;

    const saved = this.annotator.getLastReadingPosition();
    if (!saved) return;

    const page = (saved.locations?.position as number) ?? 1;

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
    removeEventListenerOptional(window, "resize", this.onResize);
    this.pdfViewer?.setDocument(null as any);
    this.pdfDoc?.destroy();
    this.pdfDoc = null;
  }
}
