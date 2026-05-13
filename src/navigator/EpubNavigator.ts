/*
 * Copyright 2018-2020 DITA (AM Consulting LLC)
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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import {
  VisualNavigator,
  NavigatorFeature,
  NavigatorFeatureName,
} from "./VisualNavigator";
import { ReaderEvent } from "../utils/Events";
import Annotator from "../store/Annotator";
import { Publication } from "../model/v3";
import EventHandler, {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../utils/EventHandler";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import { readerError, readerLoading } from "../utils/HTMLTemplates";
import { Annotation, Locations, Locator, ReadingPosition } from "../model/v3";
import { UserSettings } from "../model/user-settings/UserSettings";
import type { Fetcher } from "../fetcher/Fetcher";
import type { BlobUrlManager } from "../fetcher/BlobUrlManager";
import { BookmarkModule } from "../modules/epub/BookmarkModule";
import { AnnotationModule } from "../modules/epub/AnnotationModule";
import { SearchModule } from "../modules/epub/search/SearchModule";
import { ModuleAccessors } from "../modules/ModuleAccessors";
import { HistoryModule } from "../modules/epub/HistoryModule";
import {
  HighlightContainer,
  TextHighlighter,
} from "../modules/highlight/TextHighlighter";
import debounce from "debounce";
import TouchEventHandler from "../utils/TouchEventHandler";
import KeyboardEventHandler from "../utils/KeyboardEventHandler";
import Renderer from "../views/Renderer";
import { ScriptMode, getScriptMode } from "../utils/ScriptMode";

import { D2Link, Link } from "../model/v3";
import SampleReadEventHandler from "../modules/epub/SampleReadEventHandler";
import { ReaderModule, HostType } from "../modules/ReaderModule";
import { EpubModuleHost } from "../modules/ModuleHost";
import { TTSModuleConfig } from "../modules/epub/TTS/TTSSettings";
import { HttpFetcher } from "../fetcher/HttpFetcher";
import { Base64DecodingFetcher } from "../fetcher/Base64DecodingFetcher";
import { InjectableManager } from "./InjectableManager";
import { ContentFetcher } from "../fetcher/ContentFetcher";
import { CacheFetcher } from "../fetcher/CacheFetcher";

import { HighlightType } from "../modules/highlight/common/highlight";
import { Switchable } from "../model/user-settings/UserProperties";
import log from "loglevel";
import { GrabToPan } from "../utils/GrabToPan";
import type {
  GetContent,
  GetContentBytesLength,
  RequestConfig,
} from "../fetcher/types";
import type {
  NavigatorAPI,
  ReaderRights,
  Injectable,
  IFrameAttributes,
} from "./types";
// Re-exported for backwards compatibility.
export type { GetContent, GetContentBytesLength, RequestConfig };
export type {
  NavigatorAPI,
  ReaderRights,
  Injectable,
  InjectableContext,
  StyleInjectable,
  ScriptInjectable,
  InlineStyleInjectable,
  InlineScriptInjectable,
  IFrameAttributes,
} from "./types";
export interface EpubNavigatorConfig {
  mainElement: HTMLElement;
  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  publication: Publication;
  settings: UserSettings;
  annotator?: Annotator;
  initialLastReadingPosition?: ReadingPosition;
  rights: Partial<ReaderRights>;
  api?: Partial<NavigatorAPI>;
  tts?: Partial<TTSModuleConfig>;
  injectables: Array<Injectable>;
  attributes?: IFrameAttributes;
  services?: PublicationServices;
  sample?: SampleRead;
  requestConfig?: RequestConfig;
  /**
   * Pre-built Fetcher to use for content loading. If provided, the
   * navigator uses this instead of constructing its own HttpFetcher
   * from requestConfig. Used when opening .epub files (ZipFetcher)
   * or when the integrator wants full control over the content pipeline.
   */
  fetcher?: Fetcher;
  /**
   * Blob URL manager for ZIP-based content. Rewrites resource references
   * (images, CSS, fonts) to blob URLs so document.write() iframes can
   * load them. Only needed when opening .epub files directly.
   */
  blobUrlManager?: BlobUrlManager;
  modules: Array<ReaderModule<any> | undefined>;
  highlighter: TextHighlighter;
}
export interface PublicationServices {
  positions?: URL;
  weight?: URL;
}
export interface SampleRead {
  isSampleRead?: boolean;
  limit?: number;
  popup?: string;
  minimum?: number;
}
// `ReaderConfig` and `InitialAnnotations` live in `./ReaderConfig` —
// they span EPUB / PDF / audiobook concerns and shouldn't be defined
// inside the EPUB navigator file.

/** EPUB navigator — renders spine items in iframes with navigation controls. */
export class EpubNavigator extends VisualNavigator implements EpubModuleHost {
  iframes: Array<HTMLIFrameElement> = [];

  // Override the base `modules` accessor with concrete EPUB module types
  // so internal navigator code sees the full API (not just the shared
  // interface contract).
  readonly modules = new ModuleAccessors<
    BookmarkModule,
    AnnotationModule,
    SearchModule,
    HistoryModule
  >(this.registry);

  currentTocUrl: string | undefined;
  headerMenu?: HTMLElement | null;
  mainElement: HTMLElement;
  readonly publication: Publication;

  highlighter?: TextHighlighter;
  fetcher!: Fetcher;
  private blobUrlManager?: BlobUrlManager;

  supports(feature: NavigatorFeatureName): boolean {
    // Zoom is navigator-level, not module-based
    if (feature === NavigatorFeature.Zoom)
      return this.publication.isFixedLayout;
    // MediaOverlays has an extra runtime condition beyond the rights flag
    if (feature === NavigatorFeature.MediaOverlays) {
      return this.registry.has(feature) && this.hasMediaOverlays;
    }
    // Registry.has() already enforces rightsKey gating.
    return this.registry.has(feature);
  }

  // ── FXL zoom ────────────────────────────────────────────────

  private fxlZoomKeyHandler = (event: KeyboardEvent): void => {
    if (
      /input|select|option|textarea/i.test(
        (event.target as HTMLElement).tagName
      )
    )
      return;
    const key = event.key;
    if (key === "=" || key === "+") {
      this.zoomIn();
    } else if (key === "-") {
      this.zoomOut();
    } else if (key === "0") {
      this.fitToPage();
    } else {
      return;
    }
    event.preventDefault();
  };

  private getFxlCurrentScale(): number {
    const match = this.spreads?.style.transform?.match(/scale\(([^)]+)\)/);
    return match ? parseFloat(match[1]) : 1;
  }

  fitToPage(): void {
    if (!this.publication.isFixedLayout) return;
    this.handleResize();
  }

  zoomIn(): void {
    if (!this.publication.isFixedLayout) return;
    this.setFxlScale(this.getFxlCurrentScale() * 1.15);
  }

  zoomOut(): void {
    if (!this.publication.isFixedLayout) return;
    this.setFxlScale(this.getFxlCurrentScale() / 1.15);
  }

  private setFxlScale(newScale: number): void {
    if (!this.spreads || !this.fxlZoomContainer) return;
    this.spreads.style.transform = "scale(" + newScale + ")";
    this.updateFxlZoomContainer(newScale);
  }

  private updateFxlZoomContainer(scale: number): void {
    if (
      !this.fxlZoomContainer ||
      !this.fxlContentWidth ||
      !this.fxlContentHeight
    )
      return;
    this.fxlZoomContainer.style.width = this.fxlContentWidth * scale + "px";
    this.fxlZoomContainer.style.height = this.fxlContentHeight * scale + "px";
    this.spreads.style.width = this.fxlContentWidth + "px";
    this.spreads.style.height = this.fxlContentHeight + "px";

    // Auto-activate pan when zoomed beyond fit, deactivate when back to fit
    if (this.fxlHandTool) {
      requestAnimationFrame(() => {
        if (!this.fxlScrollContainer) return;
        const isZoomed =
          this.fxlScrollContainer.scrollWidth >
            this.fxlScrollContainer.clientWidth ||
          this.fxlScrollContainer.scrollHeight >
            this.fxlScrollContainer.clientHeight;
        if (isZoomed) {
          this.activateHand();
        } else {
          this.deactivateHand();
        }
      });
    }
  }

  // ── FXL pan (grab-to-scroll) ──────────────────────────────

  private fxlPanOverlay: HTMLDivElement;
  private fxlHandTool: GrabToPan;

  private setupFxlPan(): void {
    const el = this.fxlScrollContainer;
    if (!el) return;

    // Transparent overlay captures mouse events over iframes.
    // Lives inside the zoom container so it scales with the content.
    this.fxlPanOverlay = document.createElement("div");
    this.fxlPanOverlay.style.position = "absolute";
    this.fxlPanOverlay.style.top = "0";
    this.fxlPanOverlay.style.left = "0";
    this.fxlPanOverlay.style.width = "100%";
    this.fxlPanOverlay.style.height = "100%";
    this.fxlPanOverlay.style.pointerEvents = "none";
    this.fxlPanOverlay.style.zIndex = "1";
    this.fxlZoomContainer.style.position = "relative";
    this.fxlZoomContainer.appendChild(this.fxlPanOverlay);

    // GrabToPan scrolls the scroll container, mousedown captured by overlay
    this.fxlHandTool = new GrabToPan({ element: el });
  }

  activateHand(): void {
    if (!this.publication.isFixedLayout) return;
    if (this.fxlPanOverlay) {
      this.fxlPanOverlay.style.pointerEvents = "auto";
    }
    this.fxlHandTool?.activate();
    const panBtn = document.querySelector("#fxl-pan a") as HTMLElement;
    if (panBtn) {
      panBtn.classList.add("dita-active");
      panBtn.style.color = "#039be5";
    }
  }

  deactivateHand(): void {
    if (!this.publication.isFixedLayout) return;
    if (this.fxlPanOverlay) {
      this.fxlPanOverlay.style.pointerEvents = "none";
    }
    this.fxlHandTool?.deactivate();
    const panBtn = document.querySelector("#fxl-pan a") as HTMLElement;
    if (panBtn) {
      panBtn.classList.remove("dita-active");
      panBtn.style.color = "";
    }
  }

  sideNavExpanded: boolean = false;

  currentChapterLink: D2Link = { href: "" };
  currentSpreadLinks: { left?: D2Link; right?: D2Link } = {};
  currentTOCRawLink: string;
  private nextChapterLink: D2Link | undefined;
  private previousChapterLink: D2Link | undefined;
  settings: UserSettings;
  private readonly annotator: Annotator | undefined;

  view: Renderer;

  /**
   * Script mode of the loaded publication, derived once at construct time
   * from `metadata.languages` + `readingProgression`. Drives:
   * - `dir` propagation onto the iframe document at load
   * - ReadiumCSS variant selection (rtl, cjk-horizontal, cjk-vertical)
   * - VerticalRenderer selection for cjk-vertical / mongolian-vertical
   * - direction-normalized math in ColumnRenderer for `rtl`
   */
  readonly scriptMode: ScriptMode;

  private readonly eventHandler: EventHandler;
  private readonly touchEventHandler: TouchEventHandler;
  private readonly keyboardEventHandler: KeyboardEventHandler;
  private readonly sampleReadEventHandler: SampleReadEventHandler;

  private nextChapterBottomAnchorElement: HTMLAnchorElement;
  private previousChapterTopAnchorElement: HTMLAnchorElement;

  private nextChapterAnchorElement: HTMLAnchorElement;
  private previousChapterAnchorElement: HTMLAnchorElement;

  private nextPageAnchorElement: HTMLAnchorElement;
  private previousPageAnchorElement: HTMLAnchorElement;
  private espandMenuIcon: HTMLElement;

  private landmarksView: HTMLDivElement;
  private landmarksSection: HTMLDivElement;
  private pageListView: HTMLDivElement;

  private tocView: HTMLDivElement;
  private loadingMessage: HTMLDivElement;
  errorMessage: HTMLDivElement;
  private tryAgainButton: HTMLButtonElement;
  private goBackButton: HTMLButtonElement;
  private infoTop: HTMLDivElement;
  private infoBottom: HTMLDivElement;
  private bookTitle: HTMLSpanElement;
  private chapterTitle: HTMLSpanElement;
  private chapterPosition: HTMLSpanElement;
  private remainingPositions: HTMLSpanElement;
  private newPosition: Locator | undefined;
  private newElementId: string | undefined;
  private isBeingStyled: boolean;
  private isLoading: boolean;
  private readonly initialLastReadingPosition?: ReadingPosition;
  readonly api?: Partial<NavigatorAPI>;
  readonly rights: Partial<ReaderRights> = {
    autoGeneratePositions: false,
    enableAnnotations: false,
    enableBookmarks: false,
    enableContentProtection: false,
    enableDefinitions: false,
    enableLineFocus: false,
    enableMediaOverlays: false,
    enablePageBreaks: false,
    enableSearch: false,
    enableTTS: false,
    enableTimeline: false,
    customKeyboardEvents: false,
    enableHistory: false,
    enableCitations: false,
  };
  tts?: Partial<TTSModuleConfig>;
  injectables?: Array<Injectable>;
  attributes?: IFrameAttributes;
  services?: PublicationServices;
  sample?: SampleRead;
  requestConfig?: RequestConfig;
  private didInitKeyboardEventHandler: boolean = false;
  /** Owns the lifecycle of `Injectable` items across iframe loads. */
  private injectableManager!: InjectableManager;

  public static async create(
    config: EpubNavigatorConfig
  ): Promise<EpubNavigator> {
    const navigator = new this(
      config.settings,
      config.annotator || undefined,
      config.initialLastReadingPosition || undefined,
      config.publication,
      config.api,
      config.rights,
      config.tts,
      config.injectables,
      config.attributes,
      config.services,
      config.sample,
      config.requestConfig,
      config.highlighter,
      config.modules,
      config.fetcher,
      config.blobUrlManager
    );

    await navigator.start(
      config.mainElement,
      config.headerMenu,
      config.footerMenu
    );
    await navigator.registry.setupAll();
    return new Promise((resolve) => resolve(navigator));
  }

  protected constructor(
    settings: UserSettings,
    annotator: Annotator | undefined = undefined,
    initialLastReadingPosition: ReadingPosition | undefined = undefined,
    publication: Publication,
    api?: Partial<NavigatorAPI>,
    rights?: Partial<ReaderRights>,
    tts?: Partial<TTSModuleConfig>,
    injectables?: Array<Injectable>,
    attributes?: IFrameAttributes,
    services?: PublicationServices,
    sample?: SampleRead,
    requestConfig?: RequestConfig,
    highlighter?: TextHighlighter,
    modules?: Array<ReaderModule<any> | undefined>,
    fetcher?: Fetcher,
    blobUrlManager?: BlobUrlManager
  ) {
    super();
    this.blobUrlManager = blobUrlManager;
    this.highlighter = highlighter;
    if (this.highlighter) {
      this.highlighter.navigator = this;
    }
    this.registerModules(modules, HostType.Epub);
    // Default chain (innermost first): HttpFetcher → ContentFetcher (if
    // getContent) → Base64DecodingFetcher (if encoded) → CacheFetcher.
    // Pre-built fetcher short-circuits (e.g. ZipFetcher for .epub files).
    if (fetcher) {
      this.fetcher = new CacheFetcher(fetcher);
    } else {
      let inner: Fetcher = new HttpFetcher(requestConfig);
      if (api?.getContent) {
        inner = new ContentFetcher(inner, api.getContent, publication);
      }
      if (requestConfig?.encoded) {
        inner = new Base64DecodingFetcher(inner);
      }
      this.fetcher = new CacheFetcher(inner);
    }

    this.publication = publication;
    this.scriptMode = getScriptMode(publication);
    this.settings = settings;
    // Propagate scriptMode so settings.swapRenderer can pick VerticalRenderer
    // for cjk-vertical / mongolian-vertical publications.
    this.settings.scriptMode = this.scriptMode;
    this.annotator = annotator;
    this.attributes = attributes ?? {};
    this.view = settings.view;
    this.view.attributes = this.attributes;
    this.view.host = {
      checkResourcePosition: () => this.checkResourcePosition(),
      recalculateContentProtection: (delay?: number) =>
        this.modules.contentProtection?.recalculate(delay),
      isContentProtectionEnabled: () => !!this.rights.enableContentProtection,
      isFixedLayout: () => this.publication.isFixedLayout,
      isReflowable: () => this.publication.isReflowable,
      setDirection: (direction?: string | null) => this.setDirection(direction),
    };
    this.eventHandler = new EventHandler(this);
    this.touchEventHandler = new TouchEventHandler(this);
    this.keyboardEventHandler = new KeyboardEventHandler(this);
    this.initialLastReadingPosition = initialLastReadingPosition;
    this.api = api;
    this.rights = rights ?? {
      autoGeneratePositions: false,
      enableAnnotations: false,
      enableBookmarks: false,
      enableContentProtection: false,
      enableDefinitions: false,
      enableLineFocus: false,
      enableMediaOverlays: false,
      enablePageBreaks: false,
      enableSearch: false,
      enableTTS: false,
      enableTimeline: false,
      customKeyboardEvents: false,
      enableHistory: false,
      enableCitations: false,
    };
    this.tts = tts;
    this.injectables = injectables;
    this.services = services;
    this.sample = sample;
    this.requestConfig = requestConfig;
    this.sampleReadEventHandler = new SampleReadEventHandler(this);
    this.injectableManager = new InjectableManager(publication, settings);
  }

  stop() {
    log.log("Iframe navigator stop");

    removeEventListenerOptional(
      this.previousChapterAnchorElement,
      "click",
      this.handlePreviousChapterClick.bind(this)
    );
    removeEventListenerOptional(
      this.nextChapterAnchorElement,
      "click",
      this.handleNextChapterClick.bind(this)
    );

    removeEventListenerOptional(
      this.previousChapterTopAnchorElement,
      "click",
      this.handlePreviousPageClick.bind(this)
    );
    removeEventListenerOptional(
      this.nextChapterBottomAnchorElement,
      "click",
      this.handleNextPageClick.bind(this)
    );

    removeEventListenerOptional(
      this.previousPageAnchorElement,
      "click",
      this.handlePreviousPageClick.bind(this)
    );
    removeEventListenerOptional(
      this.nextPageAnchorElement,
      "click",
      this.handleNextPageClick.bind(this)
    );

    removeEventListenerOptional(
      this.tryAgainButton,
      "click",
      this.tryAgain.bind(this)
    );
    removeEventListenerOptional(
      this.goBackButton,
      "click",
      EpubNavigator.goBack.bind(this)
    );

    removeEventListenerOptional(
      this.espandMenuIcon,
      "click",
      this.handleEditClick.bind(this)
    );

    removeEventListenerOptional(window, "resize", this.onResize);
    // Revoke any blob-content object URLs allocated for each iframe before
    // removal so they don't leak when the reader is stopped.
    this.iframes.forEach((iframe) => {
      this.injectableManager.cleanupForIframe(iframe);
      removeEventListenerOptional(iframe, "resize", this.onResize);
      iframe.remove();
    });

    if (this.didInitKeyboardEventHandler)
      this.keyboardEventHandler.removeEvents(document);

    this.registry.stopAll();
    this.fetcher?.destroy?.();
    this.blobUrlManager?.destroy();
  }
  spreads: HTMLDivElement;
  firstSpread: HTMLDivElement;
  private fxlScrollContainer: HTMLDivElement;
  private fxlZoomContainer: HTMLDivElement;
  private fxlContentWidth: number = 0;
  private fxlContentHeight: number = 0;

  /**
   * Set `dir` on the iframe's `<html>` and `<body>` based on the
   * publication's script mode, but only if the document author hasn't
   * already set it. Vertical scripts (cjk-vertical, mongolian-vertical)
   * skip this — their layout is driven by CSS `writing-mode`, and `dir`
   * applies to in-flow horizontal text where the author should retain
   * control.
   */
  private applyScriptModeAttributes(iframe: HTMLIFrameElement): void {
    const doc = iframe.contentDocument;
    if (!doc) return;
    const inferredDir = this.inferDirAttribute(this.scriptMode);
    if (!inferredDir) return;
    const html = doc.documentElement;
    if (html && !html.getAttribute("dir")) {
      html.setAttribute("dir", inferredDir);
    }
    const body = doc.body;
    if (body && !body.getAttribute("dir")) {
      body.setAttribute("dir", inferredDir);
    }
  }

  private inferDirAttribute(scriptMode: ScriptMode): "ltr" | "rtl" | null {
    switch (scriptMode) {
      case "ltr":
      case "cjk-horizontal":
        return "ltr";
      case "rtl":
        return "rtl";
      case "cjk-vertical":
      case "mongolian-vertical":
        return null;
    }
  }

  setDirection(direction?: string | null) {
    let dir = "";
    if (direction === "rtl" || direction === "ltr") {
      dir = direction;
    } else if (direction === "auto") {
      // Resolve from manifest: readingProgression or rendition:spread-direction
      dir =
        (this.publication.metadata?.readingProgression as string) ||
        (this.publication.metadata?.otherMetadata?.[
          "rendition:spread-direction"
        ] as string) ||
        "ltr";
    }
    if (dir === "rtl" || dir === "ltr") {
      if (this.publication.isFixedLayout) {
        this.spreads.style.flexDirection =
          dir === "rtl" ? "row-reverse" : "row";
      }
      this.keyboardEventHandler.rtl = dir === "rtl";
      if (this.api?.direction) this.api?.direction(dir);
      this.emit(ReaderEvent.Direction, dir);
    }
  }

  protected async start(
    mainElement: HTMLElement,
    headerMenu?: HTMLElement | null,
    footerMenu?: HTMLElement | null
  ): Promise<void> {
    this.headerMenu = headerMenu;
    this.mainElement = mainElement;
    try {
      const wrapper = HTMLUtilities.findRequiredElement(
        mainElement,
        "main#iframe-wrapper"
      );
      wrapper.style.overflow = "auto";
      let iframe = HTMLUtilities.findElement(
        mainElement,
        "main#iframe-wrapper iframe"
      );
      let iframe2 = HTMLUtilities.findElement(mainElement, "#second");

      if (iframe) {
        (iframe as HTMLIFrameElement).style.verticalAlign = "top";
        this.iframes.push(iframe);
      }
      if (iframe2) {
        (iframe2 as HTMLIFrameElement).style.verticalAlign = "top";
        this.iframes.push(iframe2);
      }
      if (window.matchMedia("screen and (max-width: 600px)").matches) {
        this.settings.columnCount = 1;
      }
      // Respect rendition:spread "none" — force single page display
      if (this.publication.isFixedLayout) {
        const spread =
          this.publication.metadata?.otherMetadata?.["rendition:spread"] ??
          this.publication.metadata?.otherMetadata?.rendition?.spread;
        if (spread === "none") {
          this.settings.columnCount = 1;
        }
      }
      if (this.iframes.length === 0) {
        wrapper.style.overflow = "auto";
        let iframe = document.createElement("iframe");
        // Default to `scrolling="no"` so paginated mode never exposes the
        // iframe's internal scrollbar (paginated columns overflow horizontally
        // for page-flip math). The active renderer flips this to `"auto"`
        // inside `engage()` only when the user is in scroll mode AND
        // scrollContainer is "iframe".
        //
        // Vertical scripts (cjk-vertical / mongolian-vertical) always use
        // iframe-scroll regardless of `attributes.scrollContainer`. The
        // post-load attribute change is unreliable on already-loaded iframes,
        // and `scrolling="no"` overrides any document-level CSS overflow,
        // so we bake `scrolling="auto"` in at iframe creation for vertical.
        // VerticalRenderer.scrollContainerMode also returns "iframe"
        // unconditionally — the integrator's `scrollContainer: "host"`
        // setting is ignored for vertical because host-scroll on vertical-rl
        // is unreliable (negative scrollLeft, reading-axis flicker on resize).
        const isVerticalScript =
          this.scriptMode === "cjk-vertical" ||
          this.scriptMode === "mongolian-vertical";
        iframe.setAttribute("scrolling", isVerticalScript ? "auto" : "no");
        iframe.setAttribute("allowtransparency", "true");
        iframe.style.verticalAlign = "top";
        this.iframes.push(iframe);

        if (this.publication.isFixedLayout) {
          this.spreads = document.createElement("div");
          this.firstSpread = document.createElement("div");
          this.spreads.style.display = "flex";
          this.spreads.style.transformOrigin = "0 0";
          this.spreads.appendChild(this.firstSpread);
          this.firstSpread.appendChild(this.iframes[0]);

          // Scroll container fills wrapper, handles overflow scrolling
          this.fxlScrollContainer = document.createElement("div");
          this.fxlScrollContainer.style.position = "absolute";
          this.fxlScrollContainer.style.top = "0";
          this.fxlScrollContainer.style.right = "0";
          const timelineEl = document.getElementById("container-view-timeline");
          this.fxlScrollContainer.style.left =
            timelineEl && this.rights.enableTimeline ? "70px" : "0";
          const infoBottom = document.getElementById("reader-info-bottom");
          this.fxlScrollContainer.style.bottom = infoBottom
            ? infoBottom.offsetHeight + "px"
            : "0";
          this.fxlScrollContainer.style.overflow = "auto";
          this.fxlScrollContainer.style.display = "flex";

          // Sizer has visual dimensions, centered via margin: auto
          this.fxlZoomContainer = document.createElement("div");
          this.fxlZoomContainer.style.margin = "auto";
          this.fxlZoomContainer.style.flexShrink = "0";
          this.fxlZoomContainer.style.overflow = "hidden";
          if (this.attributes?.fixedLayoutShadow !== false) {
            this.fxlZoomContainer.style.padding = "12px";
            this.fxlZoomContainer.style.boxSizing = "content-box";
          }
          this.fxlZoomContainer.appendChild(this.spreads);

          this.fxlScrollContainer.appendChild(this.fxlZoomContainer);
          wrapper.style.position = "relative";
          wrapper.appendChild(this.fxlScrollContainer);
          document.addEventListener("keydown", this.fxlZoomKeyHandler);
          this.setupFxlPan();
          let dir = "";
          switch (this.settings.direction) {
            case 0:
              dir = "auto";
              break;
            case 1:
              dir = "ltr";
              break;
            case 2:
              dir = "rtl";
              break;
          }
          this.setDirection(dir);
        } else {
          iframe.setAttribute("height", "100%");
          iframe.setAttribute("width", "100%");
          wrapper.appendChild(this.iframes[0]);
        }

        if (this.publication.isFixedLayout) {
          if (
            this.settings.columnCount !== 1 &&
            !window.matchMedia("screen and (max-width: 600px)").matches
          ) {
            let secondSpread = document.createElement("div");
            this.spreads.appendChild(secondSpread);
            let iframe2 = document.createElement("iframe");
            iframe2.setAttribute("SCROLLING", "no");
            iframe2.setAttribute("allowtransparency", "true");
            iframe2.style.opacity = "1";
            iframe2.style.border = "none";
            iframe2.style.overflow = "hidden";
            iframe2.style.verticalAlign = "top";
            this.iframes.push(iframe2);

            secondSpread.appendChild(this.iframes[1]);
            if (this.attributes?.fixedLayoutShadow !== false) {
              this.firstSpread.style.clipPath =
                "polygon(0% -20%, 100% -20%, 100% 120%, -20% 120%)";
              this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
              secondSpread.style.clipPath =
                "polygon(0% -20%, 100% -20%, 120% 100%, 0% 120%)";
              secondSpread.style.boxShadow = "0 0 8px 2px #ccc";
            }
          } else {
            if (this.attributes?.fixedLayoutShadow !== false) {
              this.firstSpread.style.clipPath =
                "polygon(0% -20%, 100% -20%, 120% 100%, -20% 120%)";
              this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
            }
          }
        } else {
          // Reflowable iframe padding — CSS padding applied to the iframe
          // element itself, shifting its internal browsing context inward
          // on each side by the given pixel amount. Not applied in FXL.
          //
          // New API: `attributes.iframe.padding` accepts a number (all four
          // sides the same) or a per-side object `{ top, bottom, left, right }`.
          // Legacy `attributes.iframePaddingTop` still works when the new
          // API is not set.
          //
          // Only sides the integrator explicitly specified are written to
          // the iframe's inline style. Unspecified sides inherit from the
          // stylesheet (no forced zero).
          const iframe = this.iframes[0];
          const pad = this.attributes?.iframe?.padding;
          if (pad !== undefined) {
            if (typeof pad === "number") {
              iframe.style.padding = pad + "px";
            } else {
              if (pad.top !== undefined)
                iframe.style.paddingTop = pad.top + "px";
              if (pad.bottom !== undefined)
                iframe.style.paddingBottom = pad.bottom + "px";
              if (pad.left !== undefined)
                iframe.style.paddingLeft = pad.left + "px";
              if (pad.right !== undefined)
                iframe.style.paddingRight = pad.right + "px";
            }
          } else if (this.attributes?.iframePaddingTop !== undefined) {
            // Legacy path — iframe.padding not set, honour iframePaddingTop
            iframe.style.paddingTop = this.attributes.iframePaddingTop + "px";
          }
        }
      }

      if (this.publication.isFixedLayout) {
        // Zoom container dimensions are set during scale calculation
      } else {
        if (this.iframes.length === 2) {
          this.iframes.pop();
        }
        // Apply reading direction for reflowable (keyboard RTL + event)
        let dir = "";
        switch (this.settings.direction) {
          case 0:
            dir = "auto";
            break;
          case 1:
            dir = "ltr";
            break;
          case 2:
            dir = "rtl";
            break;
        }
        this.setDirection(dir);
      }

      this.loadingMessage = HTMLUtilities.findElement(
        mainElement,
        "#reader-loading"
      );
      if (this.loadingMessage) {
        this.loadingMessage.innerHTML = readerLoading;
        this.loadingMessage.style.display = "none";
      }
      this.errorMessage = HTMLUtilities.findElement(
        mainElement,
        "#reader-error"
      );
      if (this.errorMessage) {
        this.errorMessage.innerHTML = readerError;
        this.errorMessage.style.display = "none";
      }

      this.tryAgainButton = HTMLUtilities.findElement(
        mainElement,
        "button[class=try-again]"
      );
      this.goBackButton = HTMLUtilities.findElement(
        mainElement,
        "button[class=go-back]"
      );
      this.infoTop = HTMLUtilities.findElement(
        mainElement,
        "div[class='dita-info top']"
      );
      this.infoBottom = HTMLUtilities.findElement(
        mainElement,
        "div[class='dita-info bottom']"
      );

      if (this.headerMenu)
        this.bookTitle = HTMLUtilities.findElement(
          this.headerMenu,
          "#book-title"
        );

      if (this.infoBottom)
        this.chapterTitle = HTMLUtilities.findElement(
          this.infoBottom,
          "span[class=chapter-title]"
        );
      if (this.infoBottom)
        this.chapterPosition = HTMLUtilities.findElement(
          this.infoBottom,
          "span[class=chapter-position]"
        );
      if (this.infoBottom)
        this.remainingPositions = HTMLUtilities.findElement(
          this.infoBottom,
          "span[class=remaining-positions]"
        );

      if (this.headerMenu)
        this.espandMenuIcon = HTMLUtilities.findElement(
          this.headerMenu,
          "#expand-menu"
        );

      // Header Menu

      if (this.headerMenu)
        this.tocView = HTMLUtilities.findElement(
          this.headerMenu,
          "#container-view-toc"
        );

      if (this.headerMenu)
        this.landmarksView = HTMLUtilities.findElement(
          this.headerMenu,
          "#container-view-landmarks"
        );
      if (this.headerMenu)
        this.landmarksSection = HTMLUtilities.findElement(
          this.headerMenu,
          "#sidenav-section-landmarks"
        );
      if (this.headerMenu)
        this.pageListView = HTMLUtilities.findElement(
          this.headerMenu,
          "#container-view-pagelist"
        );

      if (this.headerMenu)
        this.nextChapterAnchorElement = HTMLUtilities.findElement(
          this.headerMenu,
          "a[rel=next]"
        );
      if (this.headerMenu)
        this.nextChapterBottomAnchorElement = HTMLUtilities.findElement(
          mainElement,
          "#next-chapter"
        );
      if (footerMenu)
        this.nextPageAnchorElement = HTMLUtilities.findElement(
          footerMenu,
          "a[rel=next]"
        );

      if (this.headerMenu)
        this.previousChapterAnchorElement = HTMLUtilities.findElement(
          this.headerMenu,
          "a[rel=prev]"
        );
      if (this.headerMenu)
        this.previousChapterTopAnchorElement = HTMLUtilities.findElement(
          mainElement,
          "#previous-chapter"
        );
      if (footerMenu)
        this.previousPageAnchorElement = HTMLUtilities.findElement(
          footerMenu,
          "a[rel=prev]"
        );

      if (this.nextChapterBottomAnchorElement)
        this.nextChapterBottomAnchorElement.style.display = "none";
      if (this.previousChapterTopAnchorElement)
        this.previousChapterTopAnchorElement.style.display = "none";

      this.newPosition = undefined;
      this.newElementId = undefined;
      this.isBeingStyled = true;
      this.isLoading = true;

      this.settings.setIframe(this.iframes[0]);
      this.settings.onSettingsChange(this.handleResize.bind(this));
      this.settings.onColumnSettingsChange(
        this.handleNumberOfIframes.bind(this)
      );
      this.settings.onViewChange(this.updateRenderer.bind(this));

      if (this.initialLastReadingPosition) {
        this.annotator?.initLastReadingPosition(
          this.initialLastReadingPosition
        );
      }

      if (this.headerMenu) {
        var menuSearch = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-search"
        );
        var menuTTS = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-tts"
        );
        var menuBookmark = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-bookmark"
        );

        var play = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-play"
        );
        var pause = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-pause"
        );
        var menu = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-mediaoverlay"
        );
        if (!this.rights.enableBookmarks) {
          if (menuBookmark)
            menuBookmark.parentElement?.style.setProperty("display", "none");
          var sideNavSectionBookmarks = HTMLUtilities.findElement(
            this.headerMenu,
            "#sidenav-section-bookmarks"
          );
          if (sideNavSectionBookmarks)
            sideNavSectionBookmarks.style.setProperty("display", "none");
        }
        if (!this.rights.enableAnnotations) {
          var sideNavSectionHighlights = HTMLUtilities.findElement(
            this.headerMenu,
            "#sidenav-section-highlights"
          );
          if (sideNavSectionHighlights)
            sideNavSectionHighlights.style.setProperty("display", "none");
        }
        if (!this.rights.enableTTS) {
          if (menuTTS)
            menuTTS.parentElement?.style.setProperty("display", "none");
        }
        if (!this.rights.enableSearch) {
          if (menuSearch)
            menuSearch.parentElement?.style.setProperty("display", "none");
        }
        if (menuSearch && this.publication.isFixedLayout) {
          menuSearch.parentElement?.style.setProperty("display", "none");
        }
        if (this.hasMediaOverlays) {
          if (play) play.parentElement?.style.removeProperty("display");
          if (pause) pause.parentElement?.style.removeProperty("display");
          if (menu) menu.parentElement?.style.removeProperty("display");
        } else {
          if (play) play.parentElement?.style.setProperty("display", "none");
          if (pause) pause.parentElement?.style.setProperty("display", "none");
          if (menu) menu.parentElement?.style.setProperty("display", "none");
        }
      } else {
        if (menuSearch)
          menuSearch.parentElement?.style.setProperty("display", "none");
        if (menuTTS)
          menuTTS.parentElement?.style.setProperty("display", "none");
        if (menuBookmark)
          menuBookmark.parentElement?.style.setProperty("display", "none");
      }
      this.setupEvents();

      return await this.loadManifest();
    } catch (err: unknown) {
      // There's a mismatch between the template and the selectors above,
      // or we weren't able to insert the template in the element.
      log.error(err);
      this.abortOnError(err);
      return Promise.reject(err);
    }
  }

  timeout: any;

  onResize = () => {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(this.handleResize.bind(this), 200);
  };
  reload = async () => {
    let lastReadingPosition: ReadingPosition | undefined = undefined;
    if (this.annotator) {
      lastReadingPosition = (await this.annotator.getLastReadingPosition()) as
        | ReadingPosition
        | undefined;
    }

    if (lastReadingPosition) {
      const linkHref = this.publication.getAbsoluteHref(
        lastReadingPosition.href
      );
      log.log(lastReadingPosition.href);
      log.log(linkHref);
      lastReadingPosition.href = linkHref;
      await this.navigate(lastReadingPosition);
    }
  };

  private setupEvents(): void {
    for (const iframe of this.iframes) {
      addEventListenerOptional(
        iframe,
        "load",
        this.handleIFrameLoad.bind(this, iframe)
      );
    }

    addEventListenerOptional(
      this.previousChapterAnchorElement,
      "click",
      this.handlePreviousChapterClick.bind(this)
    );
    addEventListenerOptional(
      this.nextChapterAnchorElement,
      "click",
      this.handleNextChapterClick.bind(this)
    );

    addEventListenerOptional(
      this.previousChapterTopAnchorElement,
      "click",
      this.handlePreviousPageClick.bind(this)
    );
    addEventListenerOptional(
      this.nextChapterBottomAnchorElement,
      "click",
      this.handleNextPageClick.bind(this)
    );

    addEventListenerOptional(
      this.previousPageAnchorElement,
      "click",
      this.handlePreviousPageClick.bind(this)
    );
    addEventListenerOptional(
      this.nextPageAnchorElement,
      "click",
      this.handleNextPageClick.bind(this)
    );

    addEventListenerOptional(
      this.tryAgainButton,
      "click",
      this.tryAgain.bind(this)
    );
    addEventListenerOptional(
      this.goBackButton,
      "click",
      EpubNavigator.goBack.bind(this)
    );

    addEventListenerOptional(
      this.espandMenuIcon,
      "click",
      this.handleEditClick.bind(this)
    );

    addEventListenerOptional(window, "resize", this.onResize);
    for (const iframe of this.iframes) {
      addEventListenerOptional(iframe, "resize", this.onResize);
    }
  }

  isScrolling: boolean;
  private updateRenderer(options?: { skipDrawingAnnotations?: boolean }): void {
    // Re-sync from settings: when scroll mode toggles, UserSettings swaps
    // the renderer instance. The navigator's local reference is otherwise
    // stale after the swap.
    if (this.settings?.view && this.view !== this.settings.view) {
      this.view = this.settings.view;
    }
    if (this.view?.layout === "fixed") {
      if (this.nextPageAnchorElement)
        this.nextPageAnchorElement.style.display = "none";
      if (this.previousPageAnchorElement)
        this.previousPageAnchorElement.style.display = "none";
      if (this.nextChapterBottomAnchorElement)
        this.nextChapterBottomAnchorElement.style.display = "none";
      if (this.previousChapterTopAnchorElement)
        this.previousChapterTopAnchorElement.style.display = "none";
      if (this.eventHandler) {
        this.eventHandler.onClickThrough = this.handleClickThrough.bind(this);
      }
      if (this.keyboardEventHandler) {
        this.keyboardEventHandler.onBackwardSwipe =
          this.handlePreviousChapterClick.bind(this);
        this.keyboardEventHandler.onForwardSwipe =
          this.handleNextChapterClick.bind(this);
        this.keyboardEventHandler.onKeydown =
          this.handleKeydownFallthrough.bind(this);
      }
      if (this.touchEventHandler) {
        this.touchEventHandler.onBackwardSwipe =
          this.handlePreviousPageClick.bind(this);
        this.touchEventHandler.onForwardSwipe =
          this.handleNextPageClick.bind(this);
      }
    } else {
      this.settings.isPaginated().then((paginated) => {
        if (paginated) {
          this.view.height = BrowserUtilities.computeIframeContentHeight(
            this.iframes[0],
            this.attributes
          );
          if (this.infoBottom) this.infoBottom.style.removeProperty("display");
          document.body.onscroll = () => {};
          if (this.nextChapterBottomAnchorElement)
            this.nextChapterBottomAnchorElement.style.display = "none";
          if (this.previousChapterTopAnchorElement)
            this.previousChapterTopAnchorElement.style.display = "none";
          if (this.nextPageAnchorElement)
            this.nextPageAnchorElement.style.display = "unset";
          if (this.previousPageAnchorElement)
            this.previousPageAnchorElement.style.display = "unset";
          if (this.chapterTitle) this.chapterTitle.style.display = "inline";
          if (this.chapterPosition)
            this.chapterPosition.style.display = "inline";
          if (this.remainingPositions)
            this.remainingPositions.style.display = "inline";
          if (this.eventHandler) {
            this.eventHandler.onInternalLink =
              this.handleInternalLink.bind(this);
            this.eventHandler.onClickThrough =
              this.handleClickThrough.bind(this);
          }
          if (this.touchEventHandler) {
            this.touchEventHandler.onBackwardSwipe =
              this.handlePreviousPageClick.bind(this);
            this.touchEventHandler.onForwardSwipe =
              this.handleNextPageClick.bind(this);
          }
          if (this.keyboardEventHandler) {
            this.keyboardEventHandler.onBackwardSwipe =
              this.handlePreviousPageClick.bind(this);
            this.keyboardEventHandler.onForwardSwipe =
              this.handleNextPageClick.bind(this);
            this.keyboardEventHandler.onKeydown =
              this.handleKeydownFallthrough.bind(this);
          }
        } else {
          if (this.infoBottom) this.infoBottom.style.display = "none";
          if (this.nextPageAnchorElement)
            this.nextPageAnchorElement.style.display = "none";
          if (this.previousPageAnchorElement)
            this.previousPageAnchorElement.style.display = "none";
          if (this.view?.layout === "fixed") {
            if (this.nextChapterBottomAnchorElement)
              this.nextChapterBottomAnchorElement.style.display = "none";
            if (this.previousChapterTopAnchorElement)
              this.previousChapterTopAnchorElement.style.display = "none";
          } else {
            if (this.view?.atStart() && this.view?.atEnd()) {
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "unset";
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "unset";
            } else if (this.view?.atEnd()) {
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "none";
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "unset";
            } else if (this.view?.atStart()) {
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "none";
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "unset";
            } else {
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "none";
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "none";
            }
          }
          const onDoScrolling = debounce(() => {
            this.isScrolling = false;
          }, 200);

          const wrapper = HTMLUtilities.findRequiredElement(
            document,
            "#iframe-wrapper"
          );

          const onScroll = async () => {
            this.isScrolling = true;
            await this.savePosition();
            if (this.view?.atEnd()) {
              // Bring up the bottom nav when you get to the bottom,
              // if it wasn't already displayed.
            } else {
              // Remove the bottom nav when you scroll back up,
              // if it was displayed because you were at the bottom.
            }
            if (this.view?.layout === "fixed") {
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "none";
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "none";
            } else {
              this.settings.isPaginated().then((paginated) => {
                if (!paginated) {
                  if (this.view?.atStart() && this.view?.atEnd()) {
                    if (this.nextChapterBottomAnchorElement)
                      this.nextChapterBottomAnchorElement.style.display =
                        "unset";
                    if (this.previousChapterTopAnchorElement)
                      this.previousChapterTopAnchorElement.style.display =
                        "unset";
                  } else if (this.view?.atEnd()) {
                    if (this.previousChapterTopAnchorElement)
                      this.previousChapterTopAnchorElement.style.display =
                        "none";
                    if (this.nextChapterBottomAnchorElement)
                      this.nextChapterBottomAnchorElement.style.display =
                        "unset";
                  } else if (this.view?.atStart()) {
                    if (this.nextChapterBottomAnchorElement)
                      this.nextChapterBottomAnchorElement.style.display =
                        "none";
                    if (this.previousChapterTopAnchorElement)
                      this.previousChapterTopAnchorElement.style.display =
                        "unset";
                  } else {
                    if (this.nextChapterBottomAnchorElement)
                      this.nextChapterBottomAnchorElement.style.display =
                        "none";
                    if (this.previousChapterTopAnchorElement)
                      this.previousChapterTopAnchorElement.style.display =
                        "none";
                  }
                }
              });
              this.checkResourcePosition();
            }
            onDoScrolling();
          };

          // Scroll event source depends on `attributes.scrollContainer`:
          // - "host" (default): #iframe-wrapper scrolls (iframe grows to content).
          // - "iframe": iframe's own contentWindow scrolls (iframe stays at viewport).
          // Re-attached on every updateRenderer so a chapter swap (new
          // contentWindow) gets a fresh listener.
          if (this.attributes?.scrollContainer === "iframe") {
            wrapper.onscroll = null;
            const cw = this.iframes[0]?.contentWindow;
            if (cw) cw.onscroll = onScroll;
          } else {
            wrapper.onscroll = onScroll;
          }

          if (this.chapterTitle) this.chapterTitle.style.display = "none";
          if (this.chapterPosition) this.chapterPosition.style.display = "none";
          if (this.remainingPositions)
            this.remainingPositions.style.display = "none";
          if (this.eventHandler) {
            this.eventHandler.onInternalLink =
              this.handleInternalLink.bind(this);
            this.eventHandler.onClickThrough =
              this.handleClickThrough.bind(this);
          }
          if (this.touchEventHandler) {
            this.touchEventHandler.onBackwardSwipe =
              this.handlePreviousPageClick.bind(this);
            this.touchEventHandler.onForwardSwipe =
              this.handleNextPageClick.bind(this);
          }
          if (this.keyboardEventHandler) {
            this.keyboardEventHandler.onBackwardSwipe =
              this.handlePreviousPageClick.bind(this);
            this.keyboardEventHandler.onForwardSwipe =
              this.handleNextPageClick.bind(this);
            this.keyboardEventHandler.onKeydown =
              this.handleKeydownFallthrough.bind(this);
          }
        }
      });
      if (!options?.skipDrawingAnnotations) {
        setTimeout(async () => {
          if (this.highlighter) {
            await this.highlighter.prepareContainers(
              this.iframes[0].contentWindow
            );
            if (this.rights.enableAnnotations && this.modules.annotations) {
              await this.modules.annotations.drawHighlights();
            }

            if (this.rights.enableBookmarks && this.modules.bookmarks) {
              await this.modules.bookmarks.drawBookmarks();
            }

            if (this.rights.enableSearch && this.modules.search) {
              await this.highlighter.destroyHighlights(HighlightType.Search);
              this.modules.search.drawSearch();
            }

            if (this.rights.enablePageBreaks && this.modules.pageBreaks) {
              await this.highlighter.destroyHighlights(HighlightType.PageBreak);
              await this.modules.pageBreaks.drawPageBreaks();
            }

            if (this.rights.enableDefinitions && this.modules.definitions) {
              await this.modules.definitions.drawDefinitions();
            }
          }
        }, 200);
      }
    }
  }

  private async loadManifest(): Promise<void> {
    try {
      const createSubmenu = (
        parentElement: Element,
        links: Array<Link>,
        ol: boolean = false
      ) => {
        var listElement: HTMLUListElement = document.createElement("ul");
        if (ol) {
          listElement = document.createElement("ol");
        }
        listElement.className = "sidenav-toc";
        for (const link of links) {
          const listItemElement: HTMLLIElement = document.createElement("li");
          const linkElement: HTMLAnchorElement = document.createElement("a");
          const spanElement: HTMLSpanElement = document.createElement("span");
          linkElement.className = "chapter-link";
          linkElement.tabIndex = -1;
          let href = "";
          if (link.href) {
            href = this.publication.getAbsoluteHref(link.href);
            linkElement.href = href;
            linkElement.innerHTML = link.title || "";
            listItemElement.appendChild(linkElement);
          } else {
            spanElement.innerHTML = link.title || "";
            spanElement.className = "chapter-title";
            listItemElement.appendChild(spanElement);
          }
          if (link.children?.items && link.children.items.length > 0) {
            createSubmenu(listItemElement, link.children.items as Link[], true);
          }

          listElement.appendChild(listItemElement);
        }

        addEventListenerOptional(listElement, "click", (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          if (
            event.target &&
            (event.target as HTMLElement).tagName.toLowerCase() === "a"
          ) {
            let linkElement = event.target as HTMLAnchorElement;

            if (linkElement.className.indexOf("active") !== -1) {
              // This TOC item is already loaded. Hide the TOC
              // but don't navigate.
              this.hideView();
            } else {
              let locations: Locations = {
                progression: 0,
              };
              if (linkElement.href.indexOf("#") !== -1) {
                const elementId = linkElement.href.slice(
                  linkElement.href.indexOf("#") + 1
                );
                if (elementId !== undefined) {
                  locations = {
                    fragment: elementId,
                  };
                }
              }

              const position: Locator = {
                href: linkElement.href,
                locations: locations,
                type: linkElement.type,
                title: linkElement.title,
              };

              this.hideView();
              this.navigate(position);
            }
          }
        });

        parentElement.appendChild(listElement);
      };

      const toc = this.publication.tableOfContents;
      const landmarks = this.publication.landmarks;
      const pageList = this.publication.pageList;

      if (this.tocView) {
        if (toc.length) {
          createSubmenu(this.tocView, toc);
        } else {
          this.tocView.parentElement?.parentElement?.removeChild(
            this.tocView.parentElement
          );
        }
      }

      if (this.pageListView) {
        if (pageList?.length) {
          createSubmenu(this.pageListView, pageList);
        } else {
          this.pageListView.parentElement?.parentElement?.removeChild(
            this.pageListView.parentElement
          );
        }
      }

      if (this.landmarksView) {
        if (landmarks?.length) {
          createSubmenu(this.landmarksView, landmarks);
        } else {
          this.landmarksSection.parentElement?.removeChild(
            this.landmarksSection
          );
        }
      }

      let lastReadingPosition: ReadingPosition | undefined = undefined;
      if (this.annotator) {
        lastReadingPosition =
          (await this.annotator.getLastReadingPosition()) as
            | ReadingPosition
            | undefined;
      }

      const startLink = this.publication.getStartLink();
      let startUrl: string | undefined = undefined;
      if (startLink && startLink.href) {
        startUrl = this.publication.getAbsoluteHref(startLink.href);
      }

      if (lastReadingPosition) {
        const linkHref = this.publication.getAbsoluteHref(
          lastReadingPosition.href
        );
        log.log(lastReadingPosition.href);
        log.log(linkHref);
        lastReadingPosition.href = linkHref;
        await this.navigate(lastReadingPosition);
      } else if (startUrl) {
        const position: ReadingPosition = {
          href: startUrl,
          locations: {
            progression: 0,
          },
          created: new Date(),
          title: startLink?.title,
        };
        await this.navigate(position);
      }

      return new Promise<void>((resolve) => resolve());
    } catch (err: unknown) {
      log.error(err);
      this.abortOnError(err);
      return new Promise<void>((_, reject) => reject(err)).catch(() => {});
    }
  }

  private async handleIFrameLoad(iframe: HTMLIFrameElement): Promise<void> {
    if (this.errorMessage) this.errorMessage.style.display = "none";
    this.showLoadingMessageAfterDelay();
    this.applyScriptModeAttributes(iframe);
    try {
      let rendererPosition: number | undefined = 0;
      if (this.newPosition) {
        rendererPosition = this.newPosition.locations.progression;
      }
      await this.handleResize();
      this.updateRenderer({ skipDrawingAnnotations: true });

      await this.settings.applyProperties();

      let currentLocation = this.currentChapterLink.href;
      if (currentLocation) {
        const previous = this.publication.getPreviousSpineItem(currentLocation);
        if (previous && previous.href) {
          this.previousChapterLink = {
            href: previous.href,
            title: previous.title,
            type: previous.type,
          };
        }
      }
      if (this.previousChapterAnchorElement) {
        if (this.previousChapterLink && this.previousChapterLink.href) {
          this.previousChapterAnchorElement.href =
            this.publication.getAbsoluteHref(this.previousChapterLink.href);
          this.previousChapterAnchorElement.className =
            this.previousChapterAnchorElement.className.replace(
              " disabled",
              ""
            );
        } else {
          this.previousChapterAnchorElement.removeAttribute("href");
          this.previousChapterAnchorElement.className += " disabled";
        }
      }
      let res = this.publication.getNextSpineItem(currentLocation);
      if (res) {
        this.nextChapterLink = {
          href: res.href,
          title: res.title,
          type: res.type,
        };
      } else {
        this.nextChapterLink = undefined;
      }
      if (this.nextChapterAnchorElement) {
        if (this.nextChapterLink && this.nextChapterLink.href) {
          this.nextChapterAnchorElement.href = this.publication.getAbsoluteHref(
            this.nextChapterLink.href
          );
          this.nextChapterAnchorElement.className =
            this.nextChapterAnchorElement.className.replace(" disabled", "");
        } else {
          this.nextChapterAnchorElement.removeAttribute("href");
          this.nextChapterAnchorElement.className += " disabled";
        }
      }

      if (this.modules.history) {
        this.modules.history.setup();
      }

      if (this.currentTocUrl !== undefined) {
        this.setActiveTOCItem(this.currentTocUrl);
      } else {
        this.setActiveTOCItem(currentLocation);
      }

      if (this.publication.metadata?.title) {
        if (this.bookTitle)
          this.bookTitle.innerHTML =
            this.publication.metadata?.title.toString();
      }

      const spineItem = this.publication.getSpineItem(currentLocation);
      if (spineItem !== undefined) {
        this.currentChapterLink.title = spineItem.title;
        this.currentChapterLink.type = spineItem.type;
      }
      let tocItem = this.publication.getTOCItem(currentLocation);
      if (this.currentTocUrl !== undefined) {
        tocItem = this.publication.getTOCItem(this.currentTocUrl);
      }
      if (
        !this.currentChapterLink.title &&
        tocItem !== undefined &&
        tocItem.title
      ) {
        this.currentChapterLink.title = tocItem.title;
      }
      if (
        !this.currentChapterLink.type &&
        tocItem !== undefined &&
        tocItem.type
      ) {
        this.currentChapterLink.title = tocItem.title;
      }

      if (this.currentChapterLink.title) {
        if (this.chapterTitle)
          this.chapterTitle.innerHTML =
            "(" + this.currentChapterLink.title + ")";
        if (this.api?.chapterInfo)
          this.api.chapterInfo(this.currentChapterLink.title);
        this.emit(ReaderEvent.ChapterInfo, this.currentChapterLink.title);
      } else {
        if (this.chapterTitle)
          this.chapterTitle.innerHTML = "(Current Chapter)";
        if (this.api?.chapterInfo) this.api.chapterInfo(undefined);
        this.emit(ReaderEvent.ChapterInfo, undefined);
      }

      // Static injectables (style / script / inline) were written into the
      // document inside prepareDoc — they're loaded by the browser during
      // iframe parse. Nothing to do on load beyond what the browser did.

      if (this.view?.layout !== "fixed" && this.highlighter !== undefined) {
        await this.highlighter.initialize(iframe);
      }
      const body = iframe.contentDocument?.body;

      // resize on toggle details
      let details = body?.querySelector("details");
      if (details) {
        let self = this;
        details.addEventListener("toggle", async (_event) => {
          await self.view?.growIframeToContent?.(iframe);
        });
      }

      if (this.eventHandler) {
        this.eventHandler.setupEvents(iframe.contentDocument);
        this.touchEventHandler.setupEvents(iframe.contentDocument);
        this.keyboardEventHandler.setupEvents(iframe.contentDocument);
        this.touchEventHandler.setupEvents(this.errorMessage);
        if (!this.didInitKeyboardEventHandler) {
          this.keyboardEventHandler.keydown(document);
          this.didInitKeyboardEventHandler = true;
        }
      }
      if (this.publication.isFixedLayout && iframe.contentDocument) {
        iframe.contentDocument.addEventListener(
          "keydown",
          this.fxlZoomKeyHandler
        );
      }
      if (this.view?.layout !== "fixed") {
        if (this.view?.isScrollMode()) {
          // Reset the renderer's growth axis to 0 so growIframeToContent's
          // debounce can grow it cleanly to content extent. Only relevant
          // in host-scroll mode (where the iframe element grows to content);
          // in iframe-scroll mode the iframe stays at viewport size and
          // the document scrolls internally, so zeroing would just leave a
          // collapsed iframe until the next engage/resize.
          //
          // Vertical scripts always run in iframe-scroll mode (forced by
          // VerticalRenderer regardless of `attributes.scrollContainer`),
          // so the zero step is skipped for them. Only ScrollRenderer in
          // host-scroll mode needs it.
          const isVerticalScript =
            this.scriptMode === "cjk-vertical" ||
            this.scriptMode === "mongolian-vertical";
          if (
            !isVerticalScript &&
            this.attributes?.scrollContainer !== "iframe"
          ) {
            iframe.height = "0";
          }
          this.view?.growIframeToContent?.(iframe);
        }
      }

      if (
        this.rights.enableContentProtection &&
        this.modules.contentProtection
      ) {
        await this.modules.contentProtection.initialize(iframe);
      }

      if (this.rights.enableConsumption && this.modules.consumption) {
        await this.modules.consumption.initialize(iframe);
      }

      if (this.rights.enableAnnotations && this.modules.annotations) {
        await this.modules.annotations.initialize(iframe);
      }

      if (this.rights.enableBookmarks && this.modules.bookmarks) {
        await this.modules.bookmarks.initialize();
      }

      if (this.rights.enableLineFocus && this.modules.lineFocus) {
        await this.modules.lineFocus.initialize(iframe);
      }

      if (this.rights.enableTTS && this.modules.tts) {
        const body = iframe.contentDocument?.body;
        const ttsModule = this.modules.tts;
        await ttsModule.initialize(body);
      }

      if (this.rights.enableTimeline && this.modules.timeline) {
        await this.modules.timeline.initialize();
      }

      if (
        this.rights.enableMediaOverlays &&
        this.modules.mediaOverlays &&
        this.hasMediaOverlays
      ) {
        await this.modules.mediaOverlays.initialize();
      }

      setTimeout(async () => {
        // Wait for the iframe's @font-face fonts to load before restoring
        // position. Font loading is asynchronous and reflows the document
        // when it completes — without this, scrollHeight (scroll mode) and
        // column widths (paginated) computed before fonts arrive are stale,
        // and the saved progression maps to the wrong px/column. Resolves
        // immediately when no fonts are pending.
        const iframeDocument = iframe.contentDocument;
        if (iframeDocument?.fonts?.ready) {
          await iframeDocument.fonts.ready;
        }
        if (this.newElementId) {
          const element = iframe.contentDocument?.getElementById(
            this.newElementId
          );
          if (element) this.view?.goToElement?.(element);
          this.newElementId = undefined;
        } else if (
          this.newPosition &&
          (this.newPosition as Annotation).highlight
        ) {
          let startContainer = (this.newPosition as Annotation).highlight
            ?.selectionInfo.rangeInfo.startContainerElementCssSelector;
          if (startContainer) {
            this.view?.goToCssSelector(startContainer);
          }
        } else if (rendererPosition !== undefined && rendererPosition >= 0) {
          // Inject the odd-column spacer before restoring progression so the
          // progression-to-scroll math uses the final, even-column layout.
          // Without this, refreshing on an odd-column page restores position
          // against pre-spacer scrollWidth; then hideLoadingMessage adds the
          // spacer and the visible content jumps right (or the chapter
          // navigation lands on the wrong column).
          if (this.view?.layout !== "fixed") {
            this.view?.padOddColumns?.();
          }
          this.view?.goToProgression(rendererPosition);
        }

        this.newPosition = undefined;

        if (this.rights?.enableContentProtection) {
          if (this.modules.contentProtection !== undefined) {
            await this.modules.contentProtection.recalculate(10);
          }
        }

        this.hideLoadingMessage();
        this.showIframeContents(iframe);

        if (
          this.rights.enableMediaOverlays &&
          this.modules.mediaOverlays &&
          this.hasMediaOverlays
        ) {
          let link = this.currentLink();
          await this.modules.mediaOverlays?.initializeResource(link);
        }
        await this.updatePositionInfo();
        await this.view?.setSize();
        setTimeout(() => {
          if (this.modules.mediaOverlays) {
            this.modules.mediaOverlays.settings.resourceReady = true;
            if (this.modules.mediaOverlays.settings.playing) {
              this.modules.mediaOverlays.bindClickHandler();
            }
          }
        }, 300);
      }, 200);

      return new Promise<void>((resolve) => resolve());
    } catch (err: unknown) {
      log.error(err);
      this.abortOnError(err);
      return Promise.reject(err);
    }
  }

  /**
   * Displays standard error UI.
   */
  private abortOnError(e: unknown) {
    // if there is an onError event passed in, depend on that
    // to catch it.
    if (this.api?.onError) {
      // make sure the error is always an actual Error
      const trueError =
        e instanceof Error
          ? e
          : typeof e === "string"
            ? new Error(e)
            : new Error("An unknown error occurred in the EpubNavigator.");
      this.api.onError(trueError);
      this.emit(ReaderEvent.Error, trueError);
    } else {
      // otherwise just display the standard error UI
      if (this.errorMessage) this.errorMessage.style.display = "block";
      if (this.isLoading) {
        this.hideLoadingMessage();
      }
    }
  }

  private tryAgain() {
    this.precessContentForIframe();
  }

  private precessContentForIframe() {
    const self = this;
    var index = this.publication.getSpineIndex(this.currentChapterLink.href);
    // Determine spread position: use link's page property if set, else fall back to index parity
    const spineLink =
      index !== undefined ? this.publication.readingOrder?.[index] : undefined;
    const pageSpread = spineLink?.properties?.page;
    var even: boolean;
    if (pageSpread === "left") {
      even = true;
    } else if (pageSpread === "right") {
      even = false;
    } else if (pageSpread === "center") {
      even = true;
    } else {
      even = (index ?? 0) % 2 === 1;
    }
    this.showLoadingMessageAfterDelay();

    this.currentSpreadLinks = {};

    // ── Content loading via Fetcher ──────────────────────────────────────────
    // All chapter content flows through the Fetcher chain — any decoding,
    // transform, or caching happens there. This callback just returns the
    // final text.
    const fetchContent = async (href: string): Promise<string> => {
      const resource = await self.fetcher.getByHref(href);
      return resource.text;
    };

    function prepareDoc(
      content: string,
      href: string,
      iframe: HTMLIFrameElement
    ): string {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "application/xhtml+xml");
      if (doc.head) {
        const bases = doc.getElementsByTagName("base");
        if (bases.length === 0) {
          doc.head.insertBefore(
            EpubNavigator.createBase(href),
            doc.head.firstChild
          );
        }
      }
      // Inject static injectables (style / script / style-inline /
      // script-inline) into the parsed doc's head/body before the iframe
      // writes it. The browser then loads them in parallel with the body
      // — no flash of unstyled content, and the iframe's own `load` event
      // covers readiness without a second round-trip.
      self.injectableManager.injectStaticIntoDoc(
        doc,
        iframe,
        self.injectables,
        href
      );
      // For ZIP-based EPUBs, rewrite resource URLs (images, CSS, fonts)
      // to blob URLs so document.write() can load them.
      if (self.blobUrlManager) {
        // Extract ZIP-internal path from the full href
        const publication = self.publication;
        const zipPath = publication.getRelativeHref(href);
        self.blobUrlManager.rewriteDom(doc, zipPath);
      }
      return doc.documentElement.outerHTML;
    }

    function writeIframeDoc(content: string, href: string) {
      self.injectableManager.cleanupForIframe(self.iframes[0]);
      const newHTML = prepareDoc(content, href, self.iframes[0]);
      const iframeDoc = self.iframes[0].contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(newHTML);
        iframeDoc.close();
      }
    }

    function writeIframe2Doc(content: string, href: string) {
      self.injectableManager.cleanupForIframe(self.iframes[1]);
      const newHTML = prepareDoc(content, href, self.iframes[1]);
      const iframeDoc = self.iframes[1].contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(newHTML);
        iframeDoc.close();
      }
    }

    // ── Load content into iframes via Fetcher ─────────────────────────────────
    // All content goes through the Fetcher pipeline (HttpFetcher, ContentFetcher,
    // CacheFetcher, ZipFetcher, etc.). No more same-origin shortcuts or scattered
    // api.getContent / fetch / encoded branching.

    const loadIntoIframe = async (
      href: string,
      iframeIndex: number
    ): Promise<void> => {
      const content = await fetchContent(href);
      if (iframeIndex === 0) {
        writeIframeDoc.call(self, content, href);
      } else {
        writeIframe2Doc.call(self, content, href);
      }
    };

    if (this.publication.isFixedLayout) {
      if (this.settings.columnCount !== 1) {
        // ── FXL spread (2-column) ────────────────────────────────────────────
        if (even) {
          // Even page → left iframe = current, right iframe = next
          this.currentSpreadLinks.left = {
            href: this.currentChapterLink.href,
          };
          loadIntoIframe(this.currentChapterLink.href, 0);

          if (this.iframes.length === 2) {
            if (
              pageSpread !== "center" &&
              (index ?? 0) < this.publication.readingOrder.length - 1
            ) {
              const next = this.publication.getNextSpineItem(
                this.currentChapterLink.href
              );
              if (next) {
                const href = this.publication.getAbsoluteHref(next.href);
                this.currentSpreadLinks.right = { href };
                loadIntoIframe(href, 1);
              }
            } else {
              this.injectableManager.cleanupForIframe(this.iframes[1]);
              this.iframes[1].src = "about:blank";
              this.currentSpreadLinks.right = undefined;
            }
          }
        } else {
          // Odd page → left iframe = previous, right iframe = current
          if ((index ?? 0) > 0) {
            const prev = this.publication.getPreviousSpineItem(
              this.currentChapterLink.href
            );
            if (prev) {
              const href = this.publication.getAbsoluteHref(prev.href);
              this.currentSpreadLinks.left = { href };
              loadIntoIframe(href, 0);
            }
          } else {
            this.injectableManager.cleanupForIframe(this.iframes[0]);
            this.iframes[0].src = "about:blank";
            this.currentSpreadLinks.left = undefined;
          }

          if (this.iframes.length === 2) {
            this.currentSpreadLinks.right = {
              href: this.currentChapterLink.href,
            };
            loadIntoIframe(this.currentChapterLink.href, 1);
          }
        }
      } else {
        // ── FXL single column ──────────────────────────────────────────────
        this.currentSpreadLinks.left = {
          href: this.currentChapterLink.href,
        };
        loadIntoIframe(this.currentChapterLink.href, 0);
      }
    } else {
      // ── Reflowable ─────────────────────────────────────────────────────
      this.currentSpreadLinks.left = {
        href: this.currentChapterLink.href,
      };
      loadIntoIframe(this.currentChapterLink.href, 0);
    }

    if (this.publication.isFixedLayout) {
      setTimeout(() => {
        let height, width;
        let doc;
        if (index === 0 && this.iframes?.length === 2) {
          doc = this.iframes[1].contentDocument;
        } else {
          doc = this.iframes[0].contentDocument;
        }
        if (doc && doc.body) {
          height = getComputedStyle(doc.body).height;
          width = getComputedStyle(doc.body).width;
          if (
            parseInt(height.toString().replace("px", "")) === 0 ||
            parseInt(width.toString().replace("px", "")) === 0
          ) {
            const head = HTMLUtilities.findIframeElement(
              doc,
              "head"
            ) as HTMLHeadElement;
            if (head) {
              const viewport = HTMLUtilities.findElement(
                head,
                "meta[name=viewport]"
              );
              if (viewport) {
                var dimensionsStr = viewport.content;
                var obj = dimensionsStr.split(",").reduce((obj, s) => {
                  var [key, value] = s.match(/[^\s;=]+/g);
                  obj[key] = isNaN(Number(value)) ? value : +value;
                  return obj;
                }, {});
                height = obj["height"] + "px";
                width = obj["width"] + "px";
              }
            }
          }
        }

        if (width) {
          if (!this.fxlScrollContainer) return;
          const fxlMargin = this.attributes?.fixedLayoutMargin ?? 100;
          const contentW = parseInt(width.toString().replace("px", ""));
          const contentH = parseInt(height.toString().replace("px", ""));
          var widthRatio =
            (this.fxlScrollContainer.clientWidth - fxlMargin) /
            (this.iframes.length === 2
              ? contentW * 2 + fxlMargin * 2
              : contentW);
          var heightRatio =
            (this.fxlScrollContainer.clientHeight - fxlMargin) / contentH;
          var scale = Math.min(widthRatio, heightRatio);
          this.spreads.style.transform = "scale(" + scale + ")";
          for (const iframe of this.iframes) {
            iframe.style.height = height;
            iframe.style.width = width;
            if (iframe.parentElement) {
              iframe.parentElement.style.height = height;
            }
          }
          this.fxlContentWidth =
            this.iframes.length === 2 ? contentW * 2 : contentW;
          this.fxlContentHeight = contentH;
          this.updateFxlZoomContainer(scale);
        }
      }, 400);
    }
  }

  private static goBack() {
    window.history.back();
  }

  private handleEditClick(event: MouseEvent): void {
    var element = event.target as HTMLElement;
    if (this.headerMenu) {
      var sidenav = HTMLUtilities.findElement(document, ".sidenav");

      if (element.className.indexOf(" dita-active") === -1) {
        element.className += " dita-active";
        sidenav.className += " expanded";
        element.innerText = "unfold_less";
        this.sideNavExpanded = true;
        this.modules.bookmarks?.showBookmarks();
        this.modules.annotations?.showHighlights();
      } else {
        element.className = element.className.replace(" dita-active", "");
        sidenav.className = sidenav.className.replace(" expanded", "");
        element.innerText = "unfold_more";
        this.sideNavExpanded = false;
        this.modules.bookmarks?.showBookmarks();
        this.modules.annotations?.showHighlights();
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }
  get hasMediaOverlays() {
    return this.publication.hasMediaOverlays;
  }
  startReadAloud() {
    if (this.rights.enableTTS) {
      this.modules.tts?.speakPlay();
    }
  }
  startReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.modules.mediaOverlays !== undefined &&
      this.hasMediaOverlays
    ) {
      this.modules.mediaOverlays?.startReadAloud();
    }
  }
  stopReadAloud() {
    if (this.rights.enableTTS) {
      this.highlighter?.stopReadAloud();
    }
  }
  stopReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.modules.mediaOverlays !== undefined &&
      this.hasMediaOverlays
    ) {
      const wasPlaying = this.modules.mediaOverlays.settings.playing;
      this.modules.mediaOverlays?.stopReadAloud();
      if (wasPlaying) {
        this.emit(ReaderEvent.ReadAlongStopped, "stopped");
      }
    }
  }

  pauseReadAloud() {
    if (this.rights.enableTTS) {
      this.modules.tts?.speakPause();
      if (this.modules.annotations !== undefined) {
        this.modules.annotations.drawHighlights();
      }
    }
  }
  pauseReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.modules.mediaOverlays !== undefined &&
      this.hasMediaOverlays
    ) {
      this.modules.mediaOverlays?.pauseReadAloud();
    }
  }
  resumeReadAloud() {
    if (this.rights.enableTTS) {
      this.modules.tts?.speakResume();
    }
  }
  resumeReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.modules.mediaOverlays !== undefined &&
      this.hasMediaOverlays
    ) {
      this.modules.mediaOverlays?.resumeReadAloud();
    }
  }

  mostRecentNavigatedTocItem(): string {
    return this.publication.getRelativeHref(this.currentTOCRawLink);
  }
  currentResource(): number | undefined {
    let currentLocation = this.currentChapterLink.href;
    return this.publication.getSpineIndex(currentLocation);
  }
  currentLink(): Array<Link | undefined> {
    if (this.settings.columnCount !== 1) {
      if (
        this.currentSpreadLinks.left !== undefined &&
        this.currentSpreadLinks.right !== undefined
      ) {
        let left = this.publication.getSpineItem(
          this.currentSpreadLinks.left.href
        );
        let right = this.publication.getSpineItem(
          this.currentSpreadLinks.right.href
        );
        return [left, right];
      }
    }
    let currentLocation = this.currentChapterLink.href;
    return [this.publication.getSpineItem(currentLocation!)];
  }

  atStart(): boolean {
    return this.view?.atStart() ?? false;
  }
  atEnd(): boolean {
    return this.view?.atEnd() ?? false;
  }

  previousPage(): any {
    this.handlePreviousPageClick(undefined);
  }
  nextPage(): any {
    this.handleNextPageClick(undefined);
  }
  previousResource(): any {
    this.handlePreviousChapterClick(undefined);
  }
  nextResource(): any {
    this.handleNextChapterClick(undefined);
  }
  goTo(locator: Locator): any {
    let locations: Locations = locator.locations ?? { progression: 0 };
    if (locator.href.indexOf("#") !== -1) {
      const elementId = locator.href.slice(locator.href.indexOf("#") + 1);
      if (elementId !== undefined) {
        locations = {
          ...locations,
          fragment: elementId,
        };
      }
    }
    const position = { ...locator };
    position.locations = locations;

    const linkHref = this.publication.getAbsoluteHref(locator.href);
    log.log(locator.href);
    log.log(linkHref);
    position.href = linkHref;
    this.stopReadAloud();
    this.navigate(position);
  }
  currentLocator(): Locator {
    let position;
    if (
      (this.rights.autoGeneratePositions && this.publication.positions) ||
      this.publication.positions
    ) {
      let positions = this.publication.positionsByHref(
        this.publication.getRelativeHref(this.currentChapterLink.href)
      );
      let positionIndex = Math.ceil(
        (this.view?.getCurrentPosition() ?? 0) * (positions.length - 1)
      );
      position = positions[positionIndex];
    } else {
      let tocItem = this.publication.getTOCItem(this.currentChapterLink.href);
      if (tocItem) {
        if (this.currentTocUrl !== undefined) {
          tocItem = this.publication.getTOCItem(this.currentTocUrl);
        }
        if (tocItem === undefined) {
          tocItem = this.publication.getTOCItemAbsolute(
            this.currentChapterLink.href!
          );
        }
        if (tocItem) {
          position = {
            href: tocItem.href,
            type: this.currentChapterLink.type,
            title: this.currentChapterLink.title,
            locations: {},
          };
        }
      }
    }
    if (position) {
      if (!position.title && this.currentChapterLink.title) {
        position.title = this.currentChapterLink.title;
      }
      position.locations.progression = this.view?.getCurrentPosition();
      position.displayInfo = {
        resourceScreenIndex: Math.round(this.view?.getCurrentPage() ?? 0),
        resourceScreenCount: Math.round(this.view?.getPageCount() ?? 0),
      };
    }
    return position;
  }

  goToPosition(position: number) {
    if (this.publication.positions) {
      let locator = this.publication.positions.filter(
        (el: Locator) => el.locations.position === parseInt(String(position))
      )[0];
      this.goTo(locator);
    }
  }
  async goToPage(page: number) {
    if (this.modules.pageBreaks !== undefined) {
      await this.modules.pageBreaks.goToPageNumber(page);
    }
  }
  snapToSelector(selector) {
    const doc = this.iframes[0].contentDocument;
    if (doc) {
      log.log(selector);
      let result = doc.querySelectorAll(selector);
      if (result.length > 0) this.view?.snap(result[0]);
    }
  }
  applyAttributes(attributes: IFrameAttributes) {
    this.attributes = attributes ?? {};
    this.view.attributes = this.attributes;
    this.handleResize();
  }

  private handlePreviousPageClick(
    event: MouseEvent | TouchEvent | KeyboardEvent | undefined
  ): void {
    this.stopReadAloud();
    if (this.view?.layout === "fixed") {
      this.handlePreviousChapterClick(event);
    } else {
      if (this.view?.atStart()) {
        this.handlePreviousChapterClick(event);
      } else {
        this.view?.goToPreviousPage?.();
        this.updatePositionInfo();
        this.savePosition();
      }
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  private handleNextPageClick(
    event: MouseEvent | TouchEvent | KeyboardEvent | undefined
  ) {
    let valid = true;
    if (this.sample?.isSampleRead && this.publication.positions) {
      const locator = this.currentLocator();
      let progress = Math.round(
        (locator.locations.totalProgression ?? 0) * 100
      );

      if (this.sample?.limit) {
        valid = progress <= this.sample?.limit;
        if (this.view?.layout === "fixed") {
          if (
            (!valid && this.sample?.minimum && locator.locations.position) ??
            0 <= (this.sample?.minimum ?? 0)
          ) {
            valid = true;
          }
        }
      }
    }

    if (
      (valid && this.sample?.isSampleRead && this.publication.positions) ||
      !this.sample?.isSampleRead ||
      !this.publication.positions
    ) {
      this.stopReadAloud();
      if (this.view?.layout === "fixed") {
        this.handleNextChapterClick(event);
      } else {
        if (this.view?.atEnd()) {
          this.handleNextChapterClick(event);
        } else {
          this.view?.goToNextPage?.();
          this.updatePositionInfo();
          this.savePosition();
        }
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
    if (!valid && this.sample?.isSampleRead && this.publication.positions) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  private handleClickThrough(event: MouseEvent | TouchEvent) {
    if (this.api?.clickThrough) this.api?.clickThrough(event);
    this.emit(ReaderEvent.Click, event);
  }

  private handleInternalLink(event: MouseEvent | TouchEvent) {
    const element = event.target;
    let locations: Locations = {
      progression: 0,
    };
    const linkElement = element as HTMLAnchorElement;
    if (linkElement.href.indexOf("#") !== -1) {
      const elementId = linkElement.href.slice(
        linkElement.href.indexOf("#") + 1
      );
      if (elementId !== undefined) {
        locations = {
          fragment: elementId,
        };
      }
    }

    const position: Locator = {
      href: linkElement.href,
      locations: locations,
      type: linkElement.type,
      title: linkElement.title,
    };

    event.preventDefault();
    event.stopPropagation();
    this.stopReadAloud();
    this.navigate(position);
  }

  private handleNumberOfIframes(): void {
    if (this.publication.isFixedLayout) {
      if (
        this.settings.columnCount !== 1 &&
        !window.matchMedia("screen and (max-width: 600px)").matches
      ) {
        if (this.iframes.length === 1) {
          var iframe = document.createElement("iframe");
          iframe.setAttribute("SCROLLING", "no");
          iframe.setAttribute("allowtransparency", "true");
          iframe.style.opacity = "1";
          iframe.style.border = "none";
          iframe.style.overflow = "hidden";
          this.iframes.push(iframe);
        }
        let secondSpread = document.createElement("div");
        this.spreads.appendChild(secondSpread);
        secondSpread.appendChild(this.iframes[1]);

        if (this.attributes?.fixedLayoutShadow !== false) {
          this.firstSpread.style.clipPath =
            "polygon(0% -20%, 100% -20%, 100% 120%, -20% 120%)";
          this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
          secondSpread.style.clipPath =
            "polygon(0% -20%, 100% -20%, 120% 100%, 0% 120%)";
          secondSpread.style.boxShadow = "0 0 8px 2px #ccc";
        }
      } else {
        if (this.iframes.length === 2) {
          this.iframes.pop();
          if (this.spreads.lastChild) {
            this.spreads.removeChild(this.spreads.lastChild);
          }
        }
        if (this.attributes?.fixedLayoutShadow !== false) {
          this.firstSpread.style.clipPath =
            "polygon(0% -20%, 100% -20%, 120% 100%, -20% 120%)";
          this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
        }
      }
      this.precessContentForIframe();
    }
  }

  async handleResize(): Promise<void> {
    if (this.isScrolling) {
      return;
    }

    if (this.publication.isFixedLayout) {
      var index = this.publication.getSpineIndex(this.currentChapterLink.href);
      if (this.fxlScrollContainer) {
        let height, width;
        let doc;
        if (index === 0 && this.iframes?.length === 2) {
          doc = this.iframes[1].contentDocument;
        } else {
          doc = this.iframes[0].contentDocument;
        }
        // Iframe may not have loaded yet — bail out of the FXL resize logic
        // that reads viewport metadata from the iframe head. A later load
        // event will trigger handleResize again.
        if (!doc) {
          return;
        }
        if (doc.body) {
          height = getComputedStyle(doc.body).height;
          width = getComputedStyle(doc.body).width;
        }

        const head = HTMLUtilities.findIframeElement(
          doc,
          "head"
        ) as HTMLHeadElement;
        if (head) {
          const viewport = HTMLUtilities.findElement(
            head,
            "meta[name=viewport]"
          );
          if (viewport) {
            var dimensionsStr = viewport.content;
            var obj: Record<string, number | string> = {};
            dimensionsStr.split(",").forEach((s) => {
              const parts = s.match(/[^\s;=]+/g);
              if (parts && parts.length >= 2) {
                const [key, value] = parts;
                obj[key] = isNaN(Number(value)) ? value : +value;
              }
            });
            if (
              parseInt(String(obj["height"])) !== 0 ||
              parseInt(String(obj["width"])) !== 0
            ) {
              height = obj["height"].toString().endsWith("px")
                ? obj["height"]
                : obj["height"] + "px";
              width = obj["width"].toString().endsWith("px")
                ? obj["width"]
                : obj["width"] + "px";
            }
          }
        }

        const fxlMargin = this.attributes?.fixedLayoutMargin ?? 100;
        const contentW = parseInt(
          width.toString().endsWith("px") ? width?.replace("px", "") : width
        );
        const contentH = parseInt(height.toString().replace("px", ""));
        var widthRatio =
          (this.fxlScrollContainer.clientWidth - fxlMargin) /
          (this.iframes.length === 2 ? contentW * 2 + fxlMargin * 2 : contentW);
        var heightRatio =
          (this.fxlScrollContainer.clientHeight - fxlMargin) / contentH;
        var scale = Math.min(widthRatio, heightRatio);
        this.spreads.style.transform = "scale(" + scale + ")";

        for (const iframe of this.iframes) {
          iframe.style.height = height;
          iframe.style.width = width;
          if (iframe.parentElement) {
            iframe.parentElement.style.height = height;
          }
        }

        this.fxlContentWidth =
          this.iframes.length === 2 ? contentW * 2 : contentW;
        this.fxlContentHeight = contentH;
        this.updateFxlZoomContainer(scale);
      }
    }

    const oldPosition = this.view?.getCurrentPosition();
    await this.settings.applyProperties();

    // If the links are hidden, show them temporarily
    // to determine the top and bottom heights.

    if (this.infoTop) this.infoTop.style.height = 0 + "px";
    if (this.infoTop) this.infoTop.style.minHeight = 0 + "px";

    // #reader-info-bottom height is driven by the integrator's own CSS.
    // The reader only toggles visibility (display) based on scroll vs
    // paginated mode — see below.

    if (this.view?.layout !== "fixed") {
      this.settings.isPaginated().then((paginated) => {
        if (paginated) {
          this.view.height = BrowserUtilities.computeIframeContentHeight(
            this.iframes[0],
            this.attributes
          );
          if (this.infoBottom) this.infoBottom.style.removeProperty("display");
        } else {
          if (this.infoBottom) this.infoBottom.style.display = "none";
        }
      });
    }

    setTimeout(() => {
      if (this.view?.layout !== "fixed") {
        // Re-apply renderer-specific sizing on resize. setSize is a no-op
        // for FixedRenderer and idempotent for the others, so calling it
        // unconditionally keeps the resize path simple. VerticalRenderer
        // refreshes its own this.height inside setSize.
        this.view?.setSize();
        if (this.view?.isScrollMode()) {
          this.view?.growIframeToContent?.(this.iframes[0]);
        } else {
          // Paginated: column count or page width may have changed (window
          // resize, settings 2→3 col). Strip stale spacers from the old
          // layout so padOddColumns can re-pad with the new count, then
          // re-pad. The existing-spacer guards in each variant would
          // otherwise block re-padding.
          this.view?.clearSpacers?.();
          this.view?.padOddColumns?.();
        }
      }
    }, 100);
    setTimeout(async () => {
      if (oldPosition) {
        this.view?.goToProgression(oldPosition);
      }
      this.updatePositionInfo(false);

      if (this.modules.contentProtection !== undefined) {
        await this.modules.contentProtection.handleResize();
      }

      if (this.modules.annotations !== undefined) {
        await this.modules.annotations.handleResize();
      }
      if (this.modules.bookmarks !== undefined) {
        await this.modules.bookmarks.handleResize();
      }
      if (this.modules.search !== undefined) {
        await this.modules.search.handleResize();
      }
      if (this.modules.definitions !== undefined) {
        await this.modules.definitions.handleResize();
      }
      if (this.modules.pageBreaks !== undefined) {
        await this.modules.pageBreaks.handleResize();
      }
      if (this.modules.lineFocus !== undefined) {
        this.modules.lineFocus.handleResize();
      }
      if (this.modules.history !== undefined) {
        await this.modules.history.handleResize();
      }
    }, 150);
  }

  updatePositionInfo(save: boolean = true) {
    if (this.view?.layout === "fixed") {
      if (this.chapterPosition) this.chapterPosition.innerHTML = "";
      if (this.remainingPositions) this.remainingPositions.innerHTML = "";
    } else {
      if (this.view?.isPaginated()) {
        const locator = this.currentLocator();
        if (locator) {
          const currentPage = locator.displayInfo.resourceScreenIndex;
          const pageCount = locator.displayInfo.resourceScreenCount;
          if (this.chapterPosition) {
            this.chapterPosition.innerHTML =
              "Page " + currentPage + " of " + pageCount;
          }
          if (this.api?.positionInfo) {
            this.api.positionInfo(locator);
          }
          this.emit(ReaderEvent.PositionInfo, locator);
        }
      } else {
        if (this.chapterPosition) this.chapterPosition.innerHTML = "";
        if (this.remainingPositions) this.remainingPositions.innerHTML = "";
      }
    }
    if (save) {
      this.savePosition();
    }
  }

  savePosition = debounce(() => {
    if (this.annotator) {
      this.saveCurrentReadingPosition();
    }
  }, 200);

  private handlePreviousChapterClick(
    event: MouseEvent | TouchEvent | KeyboardEvent | undefined
  ): void {
    if (this.view?.layout === "fixed" && this.settings.columnCount !== 1) {
      let index =
        this.publication.getSpineIndex(this.currentChapterLink.href) ?? 0;
      index = index - 2;
      if (index < 0) index = 0;
      const previous = this.publication.readingOrder[index];
      const position: Locator = {
        href: this.publication.getAbsoluteHref(previous.href),
        locations: {
          progression: 0,
        },
        type: previous.type,
        title: previous.title,
      };

      this.stopReadAloud();
      this.navigate(position, false);
    } else {
      if (this.previousChapterLink) {
        const position: Locator = {
          href: this.publication.getAbsoluteHref(this.previousChapterLink.href),
          locations: {
            progression: 1,
          },
          type: this.previousChapterLink.type,
          title: this.previousChapterLink.title,
        };

        this.stopReadAloud();
        this.navigate(position, false);
      }
    }
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleNextChapterClick(
    event: MouseEvent | TouchEvent | KeyboardEvent | undefined
  ): void {
    if (this.view?.layout === "fixed" && this.settings.columnCount !== 1) {
      let index =
        this.publication.getSpineIndex(this.currentChapterLink.href) ?? 0;
      index = index + 2;
      if (index >= this.publication.readingOrder.length - 1)
        index = this.publication.readingOrder.length - 1;
      const next = this.publication.readingOrder[index];
      const position: Locator = {
        href: this.publication.getAbsoluteHref(next.href),
        locations: {
          progression: 0,
        },
        type: next.type,
        title: next.title,
      };

      this.stopReadAloud();
      this.navigate(position, false);
    } else {
      if (this.nextChapterLink) {
        const position: Locator = {
          href: this.publication.getAbsoluteHref(this.nextChapterLink.href),
          locations: {
            progression: 0,
          },
          type: this.nextChapterLink.type,
          title: this.nextChapterLink.title,
        };
        this.stopReadAloud();
        this.navigate(position, false);
      }
    }
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleKeydownFallthrough(event: KeyboardEvent | undefined): void {
    if (this.api?.keydownFallthrough) this.api?.keydownFallthrough(event);
    this.emit(ReaderEvent.KeyDown, event);
  }

  private hideView(): void {
    if (this.view?.layout !== "fixed") {
      if (this.view?.isScrollMode()) {
        document.body.style.overflow = "auto";
      }
    }
  }

  private setActiveTOCItem(resource: string): void {
    if (this.tocView) {
      const allItems = Array.prototype.slice.call(
        this.tocView.querySelectorAll("li > a")
      );
      for (const item of allItems) {
        item.className = item.className.replace(" dita-active", "");
      }
      const activeItem = this.tocView.querySelector(
        'li > a[href^="' + resource + '"]'
      );
      if (activeItem) {
        activeItem.className += " dita-active";
      }
    }
  }

  async navigate(locator: Locator, history: boolean = true): Promise<void> {
    if (this.rights.enableConsumption && this.modules.consumption) {
      if (history) {
        this.modules.consumption.startReadingSession(locator);
      }
    }
    if (this.modules.history) {
      await this.modules.history.push(locator, history);
    }

    const exists = this.publication.getTOCItem(locator.href);
    if (exists) {
      var isCurrentLoaded = false;

      if (locator.href.indexOf("#") !== -1) {
        const newResource = locator.href.slice(0, locator.href.indexOf("#"));
        if (newResource === this.currentChapterLink.href) {
          isCurrentLoaded = true;
        }
        this.currentChapterLink.href = newResource;
        this.currentChapterLink.type = locator.type;
        this.currentChapterLink.title = locator.title;
      } else {
        if (locator.href === this.currentChapterLink.href) {
          isCurrentLoaded = true;
        }
        this.currentChapterLink.href = locator.href;
        this.currentChapterLink.type = locator.type;
        this.currentChapterLink.title = locator.title;
      }
      if (
        this.currentSpreadLinks.left !== undefined &&
        this.currentSpreadLinks.right !== undefined
      ) {
        if (
          locator.href === this.currentSpreadLinks.left.href ||
          locator.href === this.currentSpreadLinks.right.href
        ) {
          return;
        }
      }

      // isCurrentLoaded represents if the navigation goes to a different chapter
      // Going to a chapter also triggers handleIFrameLoad
      if (isCurrentLoaded) {
        if (locator.href.indexOf("#") !== -1) {
          const elementId = locator.href.slice(locator.href.indexOf("#") + 1);
          locator.locations = {
            fragment: elementId,
          };
        }
        this.newPosition = locator;
        this.currentTOCRawLink = locator.href;
        if (locator.locations.fragment === undefined) {
          this.currentTocUrl = undefined;
        } else {
          this.newElementId = locator.locations.fragment;
          this.currentTocUrl =
            this.currentChapterLink.href + "#" + this.newElementId;
        }

        // Inject the odd-column spacer before per-locator navigation so the
        // progression-to-scroll math uses the even-column layout. Matches
        // the fix in the initial-load path above.
        if (this.view?.layout !== "fixed") {
          this.view?.padOddColumns?.();
        }
        if (this.newElementId) {
          for (const iframe of this.iframes) {
            const element = iframe.contentDocument?.getElementById(
              this.newElementId
            );
            if (element) this.view?.goToElement?.(element);
          }
          this.newElementId = undefined;
        } else {
          if ((locator as Annotation).highlight) {
            let startContainer = (locator as Annotation).highlight
              ?.selectionInfo.rangeInfo.startContainerElementCssSelector;
            if (startContainer) {
              this.view?.goToCssSelector(startContainer);
            }
          } else {
            this.view?.goToProgression(locator.locations.progression ?? 0);
          }
        }

        let currentLocation = this.currentChapterLink.href;

        const previous = this.publication.getPreviousSpineItem(currentLocation);
        if (previous && previous.href) {
          this.previousChapterLink = {
            href: previous.href,
            type: previous.type,
            title: previous.title,
          };
        }
        if (this.previousChapterAnchorElement) {
          if (this.previousChapterLink) {
            this.previousChapterAnchorElement.href =
              this.publication.getAbsoluteHref(this.previousChapterLink.href);
            this.previousChapterAnchorElement.className =
              this.previousChapterAnchorElement.className.replace(
                " disabled",
                ""
              );
          } else {
            this.previousChapterAnchorElement.removeAttribute("href");
            this.previousChapterAnchorElement.className += " disabled";
          }
        }
        let res = this.publication.getNextSpineItem(currentLocation);
        if (res) {
          this.nextChapterLink = {
            href: res.href,
            type: res.type,
            title: res.title,
          };
        } else {
          this.nextChapterLink = undefined;
        }

        if (this.nextChapterAnchorElement) {
          if (this.nextChapterLink) {
            this.nextChapterAnchorElement.href =
              this.publication.getAbsoluteHref(this.nextChapterLink.href);
            this.nextChapterAnchorElement.className =
              this.nextChapterAnchorElement.className.replace(" disabled", "");
          } else {
            this.nextChapterAnchorElement.removeAttribute("href");
            this.nextChapterAnchorElement.className += " disabled";
          }
        }

        if (this.currentTocUrl !== undefined) {
          this.setActiveTOCItem(this.currentTocUrl);
        } else {
          this.setActiveTOCItem(currentLocation);
        }

        if (this.publication.metadata?.title) {
          if (this.bookTitle)
            this.bookTitle.innerHTML =
              this.publication.metadata?.title.toString();
        }

        const spineItem = this.publication.getSpineItem(currentLocation);
        if (spineItem !== undefined) {
          this.currentChapterLink.title = spineItem.title;
          this.currentChapterLink.type = spineItem.type;
        }
        let tocItem = this.publication.getTOCItem(currentLocation);
        if (this.currentTocUrl !== undefined) {
          tocItem = this.publication.getTOCItem(this.currentTocUrl);
        }
        if (
          !this.currentChapterLink.title &&
          tocItem !== undefined &&
          tocItem.title
        ) {
          this.currentChapterLink.title = tocItem.title;
        }
        if (
          !this.currentChapterLink.type &&
          tocItem !== undefined &&
          tocItem.type
        ) {
          this.currentChapterLink.title = tocItem.title;
        }

        if (this.currentChapterLink.title) {
          if (this.chapterTitle)
            this.chapterTitle.innerHTML =
              "(" + this.currentChapterLink.title + ")";
          if (this.api?.chapterInfo)
            this.api.chapterInfo(this.currentChapterLink.title);
          this.emit(ReaderEvent.ChapterInfo, this.currentChapterLink.title);
        } else {
          if (this.chapterTitle)
            this.chapterTitle.innerHTML = "(Current Chapter)";
          if (this.api?.chapterInfo) this.api.chapterInfo(undefined);
          this.emit(ReaderEvent.ChapterInfo, undefined);
        }
        await this.updatePositionInfo();
      } else {
        if (this.modules.lineFocus !== undefined) {
          this.modules.lineFocus.disableLineFocus(false);
        }
        if (this.modules.search !== undefined) {
          this.modules.search.clearSearch();
        }
        if (locator.locations.fragment === undefined) {
          this.currentTocUrl = undefined;
        } else {
          this.newElementId = locator.locations.fragment;
          this.currentTocUrl =
            this.currentChapterLink.href + "#" + this.newElementId;
        }

        this.hideIframeContents();
        this.showLoadingMessageAfterDelay();
        if (locator.locations === undefined) {
          locator.locations = {
            progression: 0,
          };
        }
        this.newPosition = locator;
        this.currentTOCRawLink = locator.href;

        this.precessContentForIframe();

        if (
          this.rights.enableContentProtection &&
          this.modules.contentProtection !== undefined
        ) {
          await this.modules.contentProtection.initializeResource();
        }

        if (
          this.rights.enableMediaOverlays &&
          this.modules.mediaOverlays !== undefined &&
          this.hasMediaOverlays
        ) {
          await this.modules.mediaOverlays.initializeResource(
            this.currentLink()
          );
        }

        if (
          this.rights.enableContentProtection &&
          this.modules.contentProtection !== undefined
        ) {
          await this.modules.contentProtection.recalculate(300);
        }

        if (this.modules.bookmarks) {
          await this.modules.bookmarks.drawBookmarks();
          await this.modules.bookmarks.showBookmarks();
        }

        if (this.modules.pageBreaks) {
          await this.highlighter?.destroyHighlights(HighlightType.PageBreak);
          await this.modules.pageBreaks.drawPageBreaks();
        }

        if (
          this.rights.enableSearch &&
          this.modules.search !== undefined &&
          this.highlighter !== undefined
        ) {
          await this.highlighter.destroyHighlights(HighlightType.Search);
          this.modules.search.drawSearch();
        }

        if (
          this.rights.enableDefinitions &&
          this.modules.definitions &&
          this.highlighter
        ) {
          await this.modules.definitions.drawDefinitions();
        }

        if (this.rights.enableConsumption && this.modules.consumption) {
          this.modules.consumption.continueReadingSession(locator);
        }

        if (this.view?.layout === "fixed") {
          if (this.nextChapterBottomAnchorElement)
            this.nextChapterBottomAnchorElement.style.display = "none";
          if (this.previousChapterTopAnchorElement)
            this.previousChapterTopAnchorElement.style.display = "none";
          if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
          this.emit(ReaderEvent.ResourceFits, {
            href: this.currentChapterLink.href,
          });
        } else {
          this.settings.isPaginated().then((paginated) => {
            if (!paginated) {
              if (this.view?.atStart() && this.view?.atEnd!()) {
                if (this.nextChapterBottomAnchorElement)
                  this.nextChapterBottomAnchorElement.style.display = "unset";
                if (this.previousChapterTopAnchorElement)
                  this.previousChapterTopAnchorElement.style.display = "unset";
              } else if (this.view?.atEnd()) {
                if (this.previousChapterTopAnchorElement)
                  this.previousChapterTopAnchorElement.style.display = "none";
                if (this.nextChapterBottomAnchorElement)
                  this.nextChapterBottomAnchorElement.style.display = "unset";
              } else if (this.view?.atStart()) {
                if (this.nextChapterBottomAnchorElement)
                  this.nextChapterBottomAnchorElement.style.display = "none";
                if (this.previousChapterTopAnchorElement)
                  this.previousChapterTopAnchorElement.style.display = "unset";
              } else {
                if (this.nextChapterBottomAnchorElement)
                  this.nextChapterBottomAnchorElement.style.display = "none";
                if (this.previousChapterTopAnchorElement)
                  this.previousChapterTopAnchorElement.style.display = "none";
              }
            }
          });
        }
      }
    } else {
      const startLink = this.publication.getStartLink();
      let startUrl: string | undefined = undefined;
      if (startLink && startLink.href) {
        startUrl = this.publication.getAbsoluteHref(startLink.href);
        if (startUrl) {
          const position: ReadingPosition = {
            href: startUrl,
            locations: {
              progression: 0,
            },
            created: new Date(),
            title: startLink.title,
          };
          await this.navigate(position);
        }
      }
    }
  }

  checkResourcePosition = debounce(() => {
    if (this.view?.atStart() && this.view?.atEnd()) {
      if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
      this.emit(ReaderEvent.ResourceFits, {
        href: this.currentChapterLink.href,
      });
    } else if (this.view?.atEnd()) {
      if (this.api?.resourceAtEnd) this.api?.resourceAtEnd();
      this.emit(ReaderEvent.ResourceEnd, {
        href: this.currentChapterLink.href,
      });
    } else if (this.view?.atStart()) {
      if (this.api?.resourceAtStart) this.api?.resourceAtStart();
      this.emit(ReaderEvent.ResourceStart, {
        href: this.currentChapterLink.href,
      });
    }
  }, 200);

  private showIframeContents(iframe: HTMLIFrameElement) {
    this.isBeingStyled = false;
    // We set a timeOut so that settings can be applied when opacity is still 0
    setTimeout(() => {
      if (!this.isBeingStyled) {
        iframe.style.opacity = "1";
        iframe.style.border = "none";
        iframe.style.overflow = "hidden";
      }
    }, 150);
  }

  private showLoadingMessageAfterDelay() {
    this.isLoading = true;
    if (this.isLoading && this.loadingMessage) {
      this.loadingMessage.style.display = "block";
      this.loadingMessage.classList.add("is-loading");
    }
    if (this.modules.mediaOverlays !== undefined) {
      this.modules.mediaOverlays.settings.resourceReady = false;
    }
  }

  private hideIframeContents() {
    this.isBeingStyled = true;
    this.iframes.forEach((iframe) => {
      iframe.style.opacity = "0";
      iframe.style.border = "none";
      iframe.style.overflow = "hidden";
    });
  }

  private hideLoadingMessage() {
    setTimeout(() => {
      this.isLoading = false;
      if (this.loadingMessage) {
        this.loadingMessage.style.display = "none";
        this.loadingMessage.classList.remove("is-loading");
      }
      if (this.view?.layout !== "fixed") {
        this.view?.padOddColumns?.();
        if (this.view?.atStart() && this.view?.atEnd()) {
          if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
          this.emit(ReaderEvent.ResourceFits, {
            href: this.currentChapterLink.href,
          });
        } else if (this.view?.atEnd()) {
          if (this.api?.resourceAtEnd) this.api?.resourceAtEnd();
          this.emit(ReaderEvent.ResourceEnd, {
            href: this.currentChapterLink.href,
          });
        } else if (this.view?.atStart()) {
          if (this.api?.resourceAtStart) this.api?.resourceAtStart();
          this.emit(ReaderEvent.ResourceStart, {
            href: this.currentChapterLink.href,
          });
        }
      }
      if (this.api?.resourceReady) this.api?.resourceReady();
      this.emit(ReaderEvent.ResourceReady, {
        href: this.currentChapterLink.href,
      });
      this.registry.notifyResourceReady();

      // Predictive prefetching — cache adjacent spine items so the next
      // page turn is instant. Non-caching Fetchers ignore prefetch() calls.
      if (this.fetcher.prefetch) {
        const idx = this.publication.readingOrder.findIndex(
          (item) =>
            item.href &&
            this.publication.getAbsoluteHref(item.href) ===
              this.currentChapterLink.href
        );
        if (idx >= 0) {
          const next = this.publication.readingOrder[idx + 1];
          const prev = this.publication.readingOrder[idx - 1];
          if (next) {
            this.fetcher.prefetch({
              ...next,
              href: this.publication.getAbsoluteHref(next.href),
            } as Link);
          }
          if (prev) {
            this.fetcher.prefetch({
              ...prev,
              href: this.publication.getAbsoluteHref(prev.href),
            } as Link);
          }
        }
      }
    }, 150);
  }

  private saveCurrentReadingPosition() {
    if (this.annotator) {
      var tocItem = this.publication.getTOCItem(this.currentChapterLink.href);
      if (this.currentTocUrl !== undefined) {
        tocItem = this.publication.getTOCItem(this.currentTocUrl);
      }
      if (tocItem === undefined) {
        tocItem = this.publication.getTOCItemAbsolute(
          this.currentChapterLink.href
        );
      }
      let locations: Locations = {
        progression: this.view?.getCurrentPosition(),
      };

      if (tocItem) {
        if (tocItem.href.indexOf("#") !== -1) {
          const elementId = tocItem.href.slice(tocItem.href.indexOf("#") + 1);
          if (elementId !== undefined) {
            locations = {
              progression: this.view?.getCurrentPosition(),
              fragment: elementId,
            };
          }
        }

        let position: ReadingPosition | undefined;
        if (
          this.publication.positions &&
          this.publication.positions.length > 0
        ) {
          const positions = this.publication.positionsByHref(
            this.publication.getRelativeHref(tocItem.href)
          );
          if (positions.length > 0) {
            const positionIndex = Math.ceil(
              (locations.progression ?? 0) * (positions.length - 1)
            );
            const locator = positions[positionIndex];
            if (locator) {
              locator.locations.fragment = locations.fragment;

              position = {
                ...locator,
                href: tocItem.href,
                created: new Date(),
                title: this.currentChapterLink.title,
              };
            }
          }
        } else {
          position = {
            href: tocItem.href,
            locations: locations,
            created: new Date(),
            type: this.currentChapterLink.type,
            title: this.currentChapterLink.title,
          };
        }

        if (position) {
          if (this.sample?.isSampleRead && this.publication.positions) {
            this.sampleReadEventHandler?.enforceSampleRead(position);
          }

          if (this.api?.updateCurrentLocation) {
            this.api?.updateCurrentLocation(position).then(async (_) => {
              log.log("api updated current location", position);
              return this.annotator?.saveLastReadingPosition(position);
            });
          } else {
            log.log("save last reading position", position);
            this.annotator.saveLastReadingPosition(position);
          }
          this.emit(ReaderEvent.LocationChanged, position);
          if (this.modules.consumption) {
            this.modules.consumption.continueReadingSession(position);
          }
        }
      }
    }
  }

  /**
   * Create a `<base>` element for the iframe's document. Used by `prepareDoc`
   * to anchor relative URLs in chapter content to the resource's href.
   */
  private static createBase(href: string): HTMLBaseElement {
    const base = document.createElement("base");
    base.target = "_self";
    base.href = href;
    return base;
  }

  activateMarker(id, position) {
    // activeAnnotationMarker* are EPUB-specific fields on the concrete
    // AnnotationModule — not part of IAnnotationModule. Cast to access.
    const annotations = this.modules.annotations as
      | AnnotationModule
      | undefined;
    if (annotations !== undefined) {
      if (
        annotations.activeAnnotationMarkerId === undefined ||
        annotations.activeAnnotationMarkerId !== id
      ) {
        annotations.activeAnnotationMarkerId = id;
        annotations.activeAnnotationMarkerPosition = position;
        if (this.highlighter) {
          this.highlighter.activeAnnotationMarkerId = id;
        }
      } else {
        this.deactivateMarker();
      }
    }
  }

  deactivateMarker() {
    const annotations = this.modules.annotations as
      | AnnotationModule
      | undefined;
    if (annotations !== undefined) {
      annotations.activeAnnotationMarkerId = undefined;
      annotations.activeAnnotationMarkerPosition = undefined;
      if (this.highlighter) {
        this.highlighter.activeAnnotationMarkerId = undefined;
      }
    }
  }

  showLayer(layer) {
    let ID = "#";
    let prop = new Switchable(
      "layer-on",
      "layer-off",
      true,
      layer,
      "layer-" + layer
    );

    switch (layer) {
      case "annotations":
      case "highlights":
        ID += HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER;
        prop.name = HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER;
        break;
      case "readaloud":
        ID += HighlightContainer.R2_ID_READALOUD_CONTAINER;
        prop.name = HighlightContainer.R2_ID_READALOUD_CONTAINER;
        break;
      case "pagebreak":
        ID += HighlightContainer.R2_ID_PAGEBREAK_CONTAINER;
        prop.name = HighlightContainer.R2_ID_PAGEBREAK_CONTAINER;
        break;
      case "search":
        ID += HighlightContainer.R2_ID_SEARCH_CONTAINER;
        prop.name = HighlightContainer.R2_ID_SEARCH_CONTAINER;
        break;
      case "definitions":
        ID += HighlightContainer.R2_ID_DEFINITIONS_CONTAINER;
        prop.name = HighlightContainer.R2_ID_DEFINITIONS_CONTAINER;
        break;
    }

    this.highlighter?.layerSettings.saveProperty(prop);
    let doc = this.iframes[0].contentDocument;
    if (doc) {
      const container = HTMLUtilities.findElement(doc, ID);
      if (container) {
        container.style.display = "block";
      }
    }
  }

  hideLayer(layer) {
    let ID = "#";
    let prop = new Switchable(
      "layer-on",
      "layer-off",
      false,
      layer,
      "layer-" + layer
    );

    switch (layer) {
      case "annotations":
      case "highlights":
        ID += HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER;
        prop.name = HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER;
        break;
      case "readaloud":
        ID += HighlightContainer.R2_ID_READALOUD_CONTAINER;
        prop.name = HighlightContainer.R2_ID_READALOUD_CONTAINER;
        break;
      case "pagebreak":
        ID += HighlightContainer.R2_ID_PAGEBREAK_CONTAINER;
        prop.name = HighlightContainer.R2_ID_PAGEBREAK_CONTAINER;
        break;
      case "search":
        ID += HighlightContainer.R2_ID_SEARCH_CONTAINER;
        prop.name = HighlightContainer.R2_ID_SEARCH_CONTAINER;
        break;
      case "definitions":
        ID += HighlightContainer.R2_ID_DEFINITIONS_CONTAINER;
        prop.name = HighlightContainer.R2_ID_DEFINITIONS_CONTAINER;
        break;
    }

    this.highlighter?.layerSettings.saveProperty(prop);

    let doc = this.iframes[0].contentDocument;
    if (doc) {
      const container = HTMLUtilities.findElement(doc, ID);
      if (container) {
        container.style.display = "none";
      }
    }
  }
}

// Backwards-compat aliases
/** @deprecated Use EpubNavigator */
export const IFrameNavigator = EpubNavigator;
/** @deprecated Use EpubNavigatorConfig */
export type IFrameNavigatorConfig = EpubNavigatorConfig;
