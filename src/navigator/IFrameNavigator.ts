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

import Navigator from "./Navigator";
import Annotator from "../store/Annotator";
import { Publication } from "../model/Publication";
import EventHandler, {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../utils/EventHandler";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import { readerError, readerLoading } from "../utils/HTMLTemplates";
import {
  Annotation,
  Locations,
  Locator,
  ReadingPosition,
} from "../model/Locator";
import {
  UserSettings,
  UserSettingsUIConfig,
} from "../model/user-settings/UserSettings";
import {
  BookmarkModule,
  BookmarkModuleConfig,
} from "../modules/BookmarkModule";
import {
  AnnotationModule,
  AnnotationModuleConfig,
} from "../modules/AnnotationModule";
import {
  SearchModule,
  SearchModuleConfig,
} from "../modules/search/SearchModule";
import {
  ContentProtectionModule,
  ContentProtectionModuleConfig,
} from "../modules/protection/ContentProtectionModule";
import {
  HighlightContainer,
  TextHighlighter,
  TextHighlighterConfig,
} from "../modules/highlight/TextHighlighter";
import { TimelineModule } from "../modules/positions/TimelineModule";
import debounce from "debounce";
import TouchEventHandler from "../utils/TouchEventHandler";
import KeyboardEventHandler from "../utils/KeyboardEventHandler";
import BookView from "../views/BookView";

import {
  MediaOverlayModule,
  MediaOverlayModuleConfig,
} from "../modules/mediaoverlays/MediaOverlayModule";
import { D2Link, Link } from "../model/Link";
import SampleReadEventHandler from "../modules/sampleread/SampleReadEventHandler";
import { ReaderModule } from "../modules/ReaderModule";
import { TTSModuleConfig } from "../modules/TTS/TTSSettings";

import { HighlightType } from "../modules/highlight/common/highlight";
import {
  PageBreakModule,
  PageBreakModuleConfig,
} from "../modules/pagebreak/PageBreakModule";
import { Switchable } from "../model/user-settings/UserProperties";
import { TTSModule2 } from "../modules/TTS/TTSModule2";
import {
  DefinitionsModule,
  DefinitionsModuleConfig,
} from "../modules/search/DefinitionsModule";
import EventEmitter from "eventemitter3";
import LineFocusModule, {
  LineFocusModuleConfig,
} from "../modules/linefocus/LineFocusModule";
import { HistoryModule } from "../modules/history/HistoryModule";
import CitationModule, {
  CitationModuleConfig,
} from "../modules/citation/CitationModule";
import log from "loglevel";
import {
  ConsumptionModule,
  ConsumptionModuleConfig,
} from "../modules/consumption/ConsumptionModule";
import KeyDownEvent = JQuery.KeyDownEvent;

export type GetContent = (href: string) => Promise<string>;
export type GetContentBytesLength = (
  href: string,
  requestConfig?: RequestConfig
) => Promise<number>;

export interface RequestConfig extends RequestInit {
  encoded?: boolean;
}

export interface NavigatorAPI {
  updateSettings: any;
  getContent: GetContent;
  getContentBytesLength: GetContentBytesLength;
  resourceReady: any;
  resourceAtStart: any;
  resourceAtEnd: any;
  resourceFitsScreen: any;
  updateCurrentLocation: any;
  keydownFallthrough: any;
  clickThrough: any;
  direction: any;
  onError?: (e: Error) => void;
}

export interface IFrameAttributes {
  margin: number;
  navHeight?: number;
  iframePaddingTop?: number;
  bottomInfoHeight?: number;
  sideNavPosition?: "left" | "right";
}
export interface IFrameNavigatorConfig {
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
  modules: ReaderModule[];
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
export interface Injectable {
  type: string;
  url?: string;
  r2after?: boolean;
  r2before?: boolean;
  r2default?: boolean;
  fontFamily?: string;
  systemFont?: boolean;
  appearance?: string;
  async?: boolean;
}

export interface ReaderRights {
  enableBookmarks: boolean;
  enableAnnotations: boolean;
  enableTTS: boolean;
  enableSearch: boolean;
  enableDefinitions: boolean;
  enableContentProtection: boolean;
  enableTimeline: boolean;
  autoGeneratePositions: boolean;
  enableMediaOverlays: boolean;
  enablePageBreaks: boolean;
  enableLineFocus: boolean;
  customKeyboardEvents: boolean;
  enableHistory: boolean;
  enableCitations: boolean;
  enableConsumption: boolean;
}

export interface ReaderUI {
  settings: UserSettingsUIConfig;
}
export interface ReaderConfig {
  publication?: any;
  url: URL;
  userSettings?: any;
  initialAnnotations?: any;
  lastReadingPosition?: any;
  rights?: Partial<ReaderRights>;
  api?: Partial<NavigatorAPI>;
  tts?: Partial<TTSModuleConfig>;
  search?: Partial<SearchModuleConfig>;
  define?: Partial<DefinitionsModuleConfig>;
  protection?: Partial<ContentProtectionModuleConfig>;
  mediaOverlays?: Partial<MediaOverlayModuleConfig>;
  pagebreak?: Partial<PageBreakModuleConfig>;
  annotations?: Partial<AnnotationModuleConfig>;
  bookmarks?: Partial<BookmarkModuleConfig>;
  lineFocus?: Partial<LineFocusModuleConfig>;
  citations?: Partial<CitationModuleConfig>;
  consumption?: Partial<ConsumptionModuleConfig>;
  highlighter?: Partial<TextHighlighterConfig>;
  injectables: Array<Injectable>;
  injectablesFixed?: Array<Injectable>;
  useLocalStorage?: boolean;
  useStorageType?: string;
  attributes?: IFrameAttributes;
  services?: PublicationServices;
  sample?: SampleRead;
  requestConfig?: RequestConfig;
}

/** Class that shows webpub resources in an iframe, with navigation controls outside the iframe. */
export class IFrameNavigator extends EventEmitter implements Navigator {
  iframes: Array<HTMLIFrameElement> = [];

  currentTocUrl: string | undefined;
  headerMenu?: HTMLElement | null;
  mainElement: HTMLElement;
  publication: Publication;

  bookmarkModule?: BookmarkModule;
  annotationModule?: AnnotationModule;
  ttsModule?: ReaderModule;
  searchModule?: SearchModule;
  definitionsModule?: DefinitionsModule;
  contentProtectionModule?: ContentProtectionModule;
  highlighter?: TextHighlighter;
  timelineModule?: TimelineModule;
  pageBreakModule?: PageBreakModule;
  mediaOverlayModule?: MediaOverlayModule;
  lineFocusModule?: LineFocusModule;
  historyModule?: HistoryModule;
  citationModule?: CitationModule;
  consumptionModule?: ConsumptionModule;

  sideNavExpanded: boolean = false;

  currentChapterLink: D2Link = { href: "" };
  currentSpreadLinks: { left?: D2Link; right?: D2Link } = {};
  currentTOCRawLink: string;
  private nextChapterLink: D2Link | undefined;
  private previousChapterLink: D2Link | undefined;
  settings: UserSettings;
  private readonly annotator: Annotator | undefined;

  view: BookView;

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

  private links: HTMLUListElement;
  private linksTopLeft: HTMLUListElement;
  private linksBottom: HTMLUListElement;
  private linksMiddle: HTMLUListElement;
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
  api?: Partial<NavigatorAPI>;
  rights: Partial<ReaderRights> = {
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

  public static async create(
    config: IFrameNavigatorConfig
  ): Promise<IFrameNavigator> {
    const navigator = new this(
      config.settings,
      config.annotator || undefined,
      config.initialLastReadingPosition || undefined,
      config.publication,
      config.api,
      config.rights,
      config.tts,
      config.injectables,
      config.attributes || { margin: 0 },
      config.services,
      config.sample,
      config.requestConfig,
      config.highlighter,
      config.modules
    );

    await navigator.start(
      config.mainElement,
      config.headerMenu,
      config.footerMenu
    );
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
    modules?: ReaderModule[]
  ) {
    super();
    this.highlighter = highlighter;
    if (this.highlighter) {
      this.highlighter.navigator = this;
    }
    for (const index in modules) {
      let module = modules[index];
      if (module) {
        module.navigator = this;
      }
      if (modules[index] instanceof AnnotationModule) {
        this.annotationModule = module;
      }
      if (modules[index] instanceof BookmarkModule) {
        this.bookmarkModule = module;
      }
      if (modules[index] instanceof TTSModule2) {
        this.ttsModule = module;
      }
      if (modules[index] instanceof TTSModule2) {
        this.ttsModule = module;
      }
      if (modules[index] instanceof SearchModule) {
        this.searchModule = module;
      }
      if (modules[index] instanceof DefinitionsModule) {
        this.definitionsModule = module;
      }
      if (modules[index] instanceof TimelineModule) {
        this.timelineModule = module;
      }
      if (modules[index] instanceof ContentProtectionModule) {
        this.contentProtectionModule = module;
      }
      if (modules[index] instanceof CitationModule) {
        this.citationModule = module;
      }
      if (modules[index] instanceof MediaOverlayModule) {
        this.mediaOverlayModule = module;
      }
      if (modules[index] instanceof PageBreakModule) {
        this.pageBreakModule = module;
      }
      if (modules[index] instanceof LineFocusModule) {
        this.lineFocusModule = module;
      }
      if (modules[index] instanceof HistoryModule) {
        this.historyModule = module;
      }
      if (modules[index] instanceof ConsumptionModule) {
        this.consumptionModule = module;
      }
      // modules: [
      //   bookmarkModule,
      //   annotationModule,
      //   ttsModule,
      //   searchModule,
      //   definitionsModule,
      //   timelineModule,
      //   contentProtectionModule,
      //   citationModule,
      //   mediaOverlayModule,
      //   pageBreakModule,
      //   lineFocusModule,
      //   historyModule,
      //   consumptionModule,
      // ],
    }
    this.settings = settings;
    this.annotator = annotator;
    this.view = settings.view;
    this.view.attributes = attributes;
    this.view.navigator = this;
    this.eventHandler = new EventHandler(this);
    this.touchEventHandler = new TouchEventHandler(this);
    this.keyboardEventHandler = new KeyboardEventHandler(this);
    this.initialLastReadingPosition = initialLastReadingPosition;
    this.publication = publication;
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
    this.attributes = attributes || { margin: 0 };
    this.services = services;
    this.sample = sample;
    this.requestConfig = requestConfig;
    this.sampleReadEventHandler = new SampleReadEventHandler(this);
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
      IFrameNavigator.goBack.bind(this)
    );

    removeEventListenerOptional(
      this.espandMenuIcon,
      "click",
      this.handleEditClick.bind(this)
    );

    removeEventListenerOptional(window, "resize", this.onResize);
    this.iframes.forEach((iframe) => {
      removeEventListenerOptional(iframe, "resize", this.onResize);
    });

    if (this.didInitKeyboardEventHandler)
      this.keyboardEventHandler.removeEvents(document);
  }
  spreads: HTMLDivElement;
  firstSpread: HTMLDivElement;

  setDirection(direction?: string | null) {
    let dir = "";
    if (direction === "rtl" || direction === "ltr") dir = direction;
    if (direction === "auto") dir = this.publication.Metadata.Direction2;
    if (dir) {
      if (dir === "rtl") this.spreads.style.flexDirection = "row-reverse";
      if (dir === "ltr") this.spreads.style.flexDirection = "row";
      this.keyboardEventHandler.rtl = dir === "rtl";
      if (this.api?.direction) this.api?.direction(dir);
      this.emit("direction", dir);
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
        this.iframes.push(iframe);
      }
      if (iframe2) {
        this.iframes.push(iframe2);
      }
      if (window.matchMedia("screen and (max-width: 600px)").matches) {
        this.settings.columnCount = 1;
      }
      if (this.iframes.length === 0) {
        wrapper.style.overflow = "auto";
        let iframe = document.createElement("iframe");
        iframe.setAttribute("SCROLLING", "no");
        iframe.setAttribute("allowtransparency", "true");
        this.iframes.push(iframe);

        if (this.publication.isFixedLayout) {
          this.spreads = document.createElement("div");
          this.firstSpread = document.createElement("div");
          this.spreads.style.display = "flex";
          this.spreads.style.alignItems = "center";
          this.spreads.style.justifyContent = "center";
          this.spreads.appendChild(this.firstSpread);
          this.firstSpread.appendChild(this.iframes[0]);
          wrapper.appendChild(this.spreads);
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
            this.iframes.push(iframe2);

            secondSpread.appendChild(this.iframes[1]);
            this.firstSpread.style.clipPath =
              "polygon(0% -20%, 100% -20%, 100% 120%, -20% 120%)";
            this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
            secondSpread.style.clipPath =
              "polygon(0% -20%, 100% -20%, 120% 100%, 0% 120%)";
            secondSpread.style.boxShadow = "0 0 8px 2px #ccc";
          } else {
            this.firstSpread.style.clipPath =
              "polygon(0% -20%, 100% -20%, 120% 100%, -20% 120%)";
            this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
          }
        } else {
          this.iframes[0].style.paddingTop =
            (this.attributes?.iframePaddingTop ?? 0) + "px";
        }
      }

      if (this.publication.isFixedLayout) {
        const minHeight = wrapper.clientHeight;
        // wrapper.style.height = minHeight + 40 + "px";
        var iframeParent = this.iframes[0].parentElement
          ?.parentElement as HTMLElement;
        iframeParent.style.height = minHeight + 40 + "px";
      } else {
        if (this.iframes.length === 2) {
          this.iframes.pop();
        }
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
        "div[class='info top']"
      );
      this.infoBottom = HTMLUtilities.findElement(
        mainElement,
        "div[class='info bottom']"
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
        this.links = HTMLUtilities.findElement(this.headerMenu, "ul.links.top");
      if (this.headerMenu)
        this.linksTopLeft = HTMLUtilities.findElement(
          this.headerMenu,
          "#nav-mobile-left"
        );

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

      // Footer Menu
      if (footerMenu)
        this.linksBottom = HTMLUtilities.findElement(
          footerMenu,
          "ul.links.bottom"
        );
      if (footerMenu)
        this.linksMiddle = HTMLUtilities.findElement(
          footerMenu,
          "ul.links.middle"
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
      this.settings.onViewChange(this.updateBookView.bind(this));

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
        if (menuSearch && this.view?.navigator.publication.isFixedLayout) {
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
      IFrameNavigator.goBack.bind(this)
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
  private updateBookView(options?: { skipDrawingAnnotations?: boolean }): void {
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
          this.view.height =
            BrowserUtilities.getHeight() - 40 - (this.attributes?.margin ?? 0);
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

          // document.body.style.overflow = "auto";
          wrapper.onscroll = async () => {
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
          await this.highlighter?.prepareContainers(
            this.iframes[0].contentWindow as any
          );

          if (this.highlighter) {
            if (this.rights.enableAnnotations && this.annotationModule) {
              await this.annotationModule.drawHighlights();
            }

            if (this.rights.enableBookmarks && this.bookmarkModule) {
              await this.bookmarkModule.drawBookmarks();
            }

            if (this.rights.enableSearch && this.searchModule) {
              await this.highlighter.destroyHighlights(HighlightType.Search);
              this.searchModule.drawSearch();
            }

            if (this.rights.enablePageBreaks && this.pageBreakModule) {
              await this.highlighter.destroyHighlights(HighlightType.PageBreak);
              await this.pageBreakModule.drawPageBreaks();
            }

            if (this.rights.enableDefinitions && this.definitionsModule) {
              await this.definitionsModule.drawDefinitions();
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
          if (link.Href) {
            href = this.publication.getAbsoluteHref(link.Href);
            linkElement.href = href;
            linkElement.innerHTML = link.Title || "";
            listItemElement.appendChild(linkElement);
          } else {
            spanElement.innerHTML = link.Title || "";
            spanElement.className = "chapter-title";
            listItemElement.appendChild(spanElement);
          }
          if (link.Children && link.Children.length > 0) {
            createSubmenu(listItemElement, link.Children, true);
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
      if (startLink && startLink.Href) {
        startUrl = this.publication.getAbsoluteHref(startLink.Href);
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
          title: startLink?.Title,
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
    try {
      let bookViewPosition: number | undefined = 0;
      if (this.newPosition) {
        bookViewPosition = this.newPosition.locations.progression;
      }
      await this.handleResize();
      this.updateBookView({ skipDrawingAnnotations: true });

      await this.settings.applyProperties();

      let currentLocation = this.currentChapterLink.href;
      if (currentLocation) {
        const previous = this.publication.getPreviousSpineItem(currentLocation);
        if (previous && previous.Href) {
          this.previousChapterLink = {
            href: previous.Href,
            title: previous.Title,
            type: previous.TypeLink,
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
          href: res.Href,
          title: res.Title,
          type: res.TypeLink,
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

      if (this.historyModule) {
        this.historyModule.setup();
      }

      if (this.currentTocUrl !== undefined) {
        this.setActiveTOCItem(this.currentTocUrl);
      } else {
        this.setActiveTOCItem(currentLocation);
      }

      if (this.publication.Metadata.Title) {
        if (this.bookTitle)
          this.bookTitle.innerHTML = this.publication.Metadata.Title.toString();
      }

      const spineItem = this.publication.getSpineItem(currentLocation);
      if (spineItem !== undefined) {
        this.currentChapterLink.title = spineItem.Title;
        this.currentChapterLink.type = spineItem.TypeLink;
      }
      let tocItem = this.publication.getTOCItem(currentLocation);
      if (this.currentTocUrl !== undefined) {
        tocItem = this.publication.getTOCItem(this.currentTocUrl);
      }
      if (
        !this.currentChapterLink.title &&
        tocItem !== undefined &&
        tocItem.Title
      ) {
        this.currentChapterLink.title = tocItem.Title;
      }
      if (
        !this.currentChapterLink.type &&
        tocItem !== undefined &&
        tocItem.TypeLink
      ) {
        this.currentChapterLink.title = tocItem.Title;
      }

      if (this.currentChapterLink.title) {
        if (this.chapterTitle)
          this.chapterTitle.innerHTML =
            "(" + this.currentChapterLink.title + ")";
      } else {
        if (this.chapterTitle)
          this.chapterTitle.innerHTML = "(Current Chapter)";
      }

      await this.injectInjectablesIntoIframeHead(iframe);

      if (this.view?.layout !== "fixed" && this.highlighter !== undefined) {
        await this.highlighter.initialize(iframe);
      }
      const body = iframe.contentDocument?.body;

      // resize on toggle details
      let details = body?.querySelector("details");
      if (details) {
        let self = this;
        details.addEventListener("toggle", async (_event) => {
          await self.view?.setIframeHeight?.(iframe);
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
      if (this.view?.layout !== "fixed") {
        if (this.view?.isScrollMode()) {
          iframe.height = "0";
          this.view?.setIframeHeight?.(iframe);
        }
      }

      if (this.rights.enableContentProtection && this.contentProtectionModule) {
        await this.contentProtectionModule.initialize(iframe);
      }

      if (this.rights.enableConsumption && this.consumptionModule) {
        await this.consumptionModule.initialize(iframe);
      }

      if (this.rights.enableAnnotations && this.annotationModule) {
        await this.annotationModule.initialize(iframe);
      }

      if (this.rights.enableBookmarks && this.bookmarkModule) {
        await this.bookmarkModule.initialize();
      }

      if (this.rights.enableLineFocus && this.lineFocusModule) {
        await this.lineFocusModule.initialize(iframe);
      }

      if (this.rights.enableTTS && this.ttsModule) {
        const body = iframe.contentDocument?.body;
        const ttsModule = this.ttsModule as TTSModule2;
        await ttsModule.initialize(body);
      }

      if (this.rights.enableTimeline && this.timelineModule) {
        await this.timelineModule.initialize();
      }

      if (
        this.rights.enableMediaOverlays &&
        this.mediaOverlayModule &&
        this.hasMediaOverlays
      ) {
        await this.mediaOverlayModule.initialize();
      }

      setTimeout(async () => {
        if (this.newElementId) {
          const element = (iframe.contentDocument as any).getElementById(
            this.newElementId
          );
          this.view?.goToElement?.(element);
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
        } else if (bookViewPosition && bookViewPosition >= 0) {
          this.view?.goToProgression(bookViewPosition);
        }

        this.newPosition = undefined;

        if (this.rights?.enableContentProtection) {
          if (this.contentProtectionModule !== undefined) {
            await this.contentProtectionModule.recalculate(10);
          }
        }

        this.hideLoadingMessage();
        this.showIframeContents(iframe);

        if (
          this.rights.enableMediaOverlays &&
          this.mediaOverlayModule &&
          this.hasMediaOverlays
        ) {
          let link = this.currentLink();
          await this.mediaOverlayModule?.initializeResource(link);
        }
        await this.updatePositionInfo();
        await this.view?.setSize();
        setTimeout(() => {
          if (this.mediaOverlayModule) {
            this.mediaOverlayModule.settings.resourceReady = true;
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

  private async injectInjectablesIntoIframeHead(
    iframe: HTMLIFrameElement
  ): Promise<void> {
    // Inject Readium CSS into Iframe Head
    const injectablesToLoad: Promise<boolean>[] = [];

    const addLoadingInjectable = (
      injectable: HTMLLinkElement | HTMLScriptElement
    ) => {
      const loadPromise = new Promise<boolean>((resolve, reject) => {
        injectable.onload = () => {
          resolve(true);
        };
        injectable.onerror = (e) => {
          const message =
            typeof e === "string"
              ? e
              : `Injectable failed to load at: ${
                  "href" in injectable ? injectable.href : injectable.src
                }`;
          reject(new Error(message));
        };
      });
      injectablesToLoad.push(loadPromise);
    };

    const head = iframe.contentDocument?.head;
    if (head) {
      const bases = iframe.contentDocument.getElementsByTagName("base");
      if (bases.length === 0) {
        head.insertBefore(
          IFrameNavigator.createBase(this.currentChapterLink.href),
          head.firstChild
        );
      }

      this.injectables?.forEach((injectable) => {
        if (injectable.type === "style") {
          if (injectable.fontFamily) {
            // UserSettings.fontFamilyValues.push(injectable.fontFamily)
            // this.settings.setupEvents()
            // this.settings.addFont(injectable.fontFamily);
            this.settings.initAddedFont();
            if (!injectable.systemFont && injectable.url) {
              const link = IFrameNavigator.createCssLink(injectable.url);
              head.appendChild(link);
              addLoadingInjectable(link);
            }
          } else if (injectable.r2before && injectable.url) {
            const link = IFrameNavigator.createCssLink(injectable.url);
            head.insertBefore(link, head.firstChild);
            addLoadingInjectable(link);
          } else if (injectable.r2default && injectable.url) {
            const link = IFrameNavigator.createCssLink(injectable.url);
            head.insertBefore(link, head.childNodes[1]);
            addLoadingInjectable(link);
          } else if (injectable.r2after && injectable.url) {
            if (injectable.appearance) {
              // this.settings.addAppearance(injectable.appearance);
              this.settings.initAddedAppearance();
            }
            const link = IFrameNavigator.createCssLink(injectable.url);
            head.appendChild(link);
            addLoadingInjectable(link);
          } else if (injectable.url) {
            const link = IFrameNavigator.createCssLink(injectable.url);
            head.appendChild(link);
            addLoadingInjectable(link);
          }
        } else if (injectable.type === "script" && injectable.url) {
          const script = IFrameNavigator.createJavascriptLink(
            injectable.url,
            injectable.async ?? false
          );
          head.appendChild(script);
          addLoadingInjectable(script);
        }
      });
    }

    if (injectablesToLoad.length === 0) {
      return;
    }

    await Promise.all(injectablesToLoad);
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
            : new Error("An unknown error occurred in the IFrameNavigator.");
      this.api.onError(trueError);
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
    var even: boolean = (index ?? 0) % 2 === 1;
    this.showLoadingMessageAfterDelay();

    function writeIframeDoc(content: string, href: string) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "application/xhtml+xml");
      if (doc.head) {
        const bases = doc.getElementsByTagName("base");
        if (bases.length === 0) {
          doc.head.insertBefore(
            IFrameNavigator.createBase(href),
            doc.head.firstChild
          );
        }
      }
      const newHTML = doc.documentElement.outerHTML;
      const iframeDoc = self.iframes[0].contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(newHTML);
        iframeDoc.close();
      }
    }

    function writeIframe2Doc(content: string, href: string) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "application/xhtml+xml");
      if (doc.head) {
        const bases = doc.getElementsByTagName("base");
        if (bases.length === 0) {
          doc.head.insertBefore(
            IFrameNavigator.createBase(href),
            doc.head.firstChild
          );
        }
      }
      const newHTML = doc.documentElement.outerHTML;
      const iframeDoc = self.iframes[1].contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(newHTML);
        iframeDoc.close();
      }
    }

    const link = new URL(this.currentChapterLink.href);
    const isSameOrigin =
      window.location.protocol === link.protocol &&
      window.location.port === link.port &&
      window.location.hostname === link.hostname;

    if (this.api?.getContent) {
      if (this.publication.isFixedLayout) {
        if (this.settings.columnCount !== 1) {
          if (even) {
            this.currentSpreadLinks.left = {
              href: this.currentChapterLink.href,
            };

            this.api
              ?.getContent(this.currentChapterLink.href)
              .then((content) => {
                if (content === undefined) {
                  if (isSameOrigin) {
                    this.iframes[0].src = this.currentChapterLink.href;
                  } else {
                    fetch(this.currentChapterLink.href, this.requestConfig)
                      .then((r) => r.text())
                      .then(async (content) => {
                        writeIframeDoc.call(
                          this,
                          content,
                          this.currentChapterLink.href
                        );
                      });
                  }
                } else {
                  writeIframeDoc.call(
                    this,
                    content,
                    this.currentChapterLink.href
                  );
                }
              });
            if (this.iframes.length === 2) {
              if ((index ?? 0) < this.publication.readingOrder.length - 1) {
                const next = this.publication.getNextSpineItem(
                  this.currentChapterLink.href
                );
                if (next) {
                  const href = this.publication.getAbsoluteHref(next.Href);
                  this.currentSpreadLinks.right = {
                    href: href,
                  };
                  this.api?.getContent(href).then((content) => {
                    if (content === undefined) {
                      if (isSameOrigin) {
                        this.iframes[1].src = href;
                      } else {
                        fetch(href, this.requestConfig)
                          .then((r) => r.text())
                          .then(async (content) => {
                            writeIframe2Doc.call(this, content, href);
                            this.currentSpreadLinks.right = {
                              href: href,
                            };
                          });
                      }
                    } else {
                      writeIframe2Doc.call(this, content, href);
                    }
                  });
                }
              } else {
                this.iframes[1].src = "about:blank";
              }
            }
          } else {
            if ((index ?? 0) > 0) {
              const prev = this.publication.getPreviousSpineItem(
                this.currentChapterLink.href
              );
              if (prev) {
                const href = this.publication.getAbsoluteHref(prev.Href);
                this.currentSpreadLinks.left = {
                  href: href,
                };
                this.api?.getContent(href).then((content) => {
                  if (content === undefined) {
                    if (isSameOrigin) {
                      this.iframes[0].src = href;
                    } else {
                      fetch(href, this.requestConfig)
                        .then((r) => r.text())
                        .then(async (content) => {
                          writeIframeDoc.call(this, content, href);
                        });
                    }
                  } else {
                    writeIframeDoc.call(this, content, href);
                  }
                });
              }
            } else {
              this.iframes[0].src = "about:blank";
            }
            if (this.iframes.length === 2 && this.publication.isFixedLayout) {
              this.currentSpreadLinks.right = {
                href: this.currentChapterLink.href,
              };

              this.api
                .getContent(this.currentChapterLink.href)
                .then((content) => {
                  if (content === undefined) {
                    if (isSameOrigin) {
                      this.iframes[1].src = this.currentChapterLink.href;
                    } else {
                      fetch(this.currentChapterLink.href, this.requestConfig)
                        .then((r) => r.text())
                        .then(async (content) => {
                          writeIframe2Doc.call(
                            this,
                            content,
                            this.currentChapterLink.href
                          );
                        });
                    }
                  } else {
                    writeIframe2Doc.call(
                      this,
                      content,
                      this.currentChapterLink.href
                    );
                  }
                });
            }
          }
        } else {
          this.currentSpreadLinks.left = {
            href: this.currentChapterLink.href,
          };
          this.api?.getContent(this.currentChapterLink.href).then((content) => {
            if (content === undefined) {
              if (isSameOrigin) {
                this.iframes[0].src = this.currentChapterLink.href;
              } else {
                fetch(this.currentChapterLink.href, this.requestConfig)
                  .then((r) => r.text())
                  .then(async (content) => {
                    writeIframeDoc.call(
                      this,
                      content,
                      this.currentChapterLink.href
                    );
                  });
              }
            } else {
              writeIframeDoc.call(this, content, this.currentChapterLink.href);
            }
          });
        }
      } else {
        this.api?.getContent(this.currentChapterLink.href).then((content) => {
          this.currentSpreadLinks.left = {
            href: this.currentChapterLink.href,
          };

          if (content === undefined) {
            if (isSameOrigin) {
              this.iframes[0].src = this.currentChapterLink.href;
            } else {
              fetch(this.currentChapterLink.href, this.requestConfig)
                .then((r) => r.text())
                .then(async (content) => {
                  writeIframeDoc.call(
                    this,
                    content,
                    this.currentChapterLink.href
                  );
                });
            }
          } else {
            writeIframeDoc.call(this, content, this.currentChapterLink.href);
          }
        });
      }
    } else {
      if (this.publication.isFixedLayout) {
        if (this.settings.columnCount !== 1) {
          if (even) {
            if (isSameOrigin) {
              this.iframes[0].src = this.currentChapterLink.href;
              this.currentSpreadLinks.left = {
                href: this.currentChapterLink.href,
              };

              if (this.iframes.length === 2) {
                if ((index ?? 0) < this.publication.readingOrder.length - 1) {
                  const next = this.publication.getNextSpineItem(
                    this.currentChapterLink.href
                  );
                  if (next) {
                    const href = this.publication.getAbsoluteHref(next.Href);
                    this.iframes[1].src = href;
                    this.currentSpreadLinks.right = {
                      href: href,
                    };
                  }
                } else {
                  this.iframes[1].src = "about:blank";
                }
              }
            } else {
              fetch(this.currentChapterLink.href, this.requestConfig)
                .then((r) => r.text())
                .then(async (content) => {
                  writeIframeDoc.call(
                    this,
                    content,
                    this.currentChapterLink.href
                  );
                });
              if (this.iframes.length === 2) {
                if ((index ?? 0) < this.publication.readingOrder.length - 1) {
                  const next = this.publication.getNextSpineItem(
                    this.currentChapterLink.href
                  );
                  if (next) {
                    const href = this.publication.getAbsoluteHref(next.Href);
                    this.currentSpreadLinks.right = {
                      href: href,
                    };

                    fetch(href, this.requestConfig)
                      .then((r) => r.text())
                      .then(async (content) => {
                        writeIframe2Doc.call(this, content, href);
                      });
                  }
                } else {
                  this.iframes[1].src = "about:blank";
                }
              }
            }
          } else {
            if ((index ?? 0) > 0) {
              const prev = this.publication.getPreviousSpineItem(
                this.currentChapterLink.href
              );
              if (prev) {
                const href = this.publication.getAbsoluteHref(prev.Href);
                this.currentSpreadLinks.left = {
                  href: href,
                };
                if (isSameOrigin) {
                  this.iframes[0].src = href;
                  if (this.iframes.length === 2) {
                    this.iframes[1].src = this.currentChapterLink.href;
                  }
                } else {
                  fetch(href, this.requestConfig)
                    .then((r) => r.text())
                    .then(async (content) => {
                      writeIframeDoc.call(this, content, href);
                    });
                  if (this.iframes.length === 2) {
                    this.currentSpreadLinks.right = {
                      href: this.currentChapterLink.href,
                    };
                    fetch(this.currentChapterLink.href, this.requestConfig)
                      .then((r) => r.text())
                      .then(async (content) => {
                        writeIframe2Doc.call(
                          this,
                          content,
                          this.currentChapterLink.href
                        );
                      });
                  }
                }
              }
            } else {
              this.iframes[0].src = "about:blank";
              if (this.iframes.length === 2) {
                this.currentSpreadLinks.right = {
                  href: this.currentChapterLink.href,
                };

                if (isSameOrigin) {
                  this.iframes[1].src = this.currentChapterLink.href;
                } else {
                  fetch(this.currentChapterLink.href, this.requestConfig)
                    .then((r) => r.text())
                    .then(async (content) => {
                      writeIframe2Doc.call(
                        this,
                        content,
                        this.currentChapterLink.href
                      );
                    });
                }
              }
            }
          }
        } else {
          this.currentSpreadLinks.left = {
            href: this.currentChapterLink.href,
          };
          if (isSameOrigin) {
            this.iframes[0].src = this.currentChapterLink.href;
          } else {
            fetch(this.currentChapterLink.href, this.requestConfig)
              .then((r) => r.text())
              .then(async (content) => {
                writeIframeDoc.call(
                  this,
                  content,
                  this.currentChapterLink.href
                );
              });
          }
        }
      } else {
        this.currentSpreadLinks.left = {
          href: this.currentChapterLink.href,
        };
        if (isSameOrigin) {
          this.iframes[0].src = this.currentChapterLink.href;
        } else {
          fetch(this.currentChapterLink.href, this.requestConfig)
            .then((r) => r.text())
            .then(async (content) => {
              writeIframeDoc.call(this, content, this.currentChapterLink.href);
            });
        }
      }
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

        var iframeParent =
          index === 0 && this.iframes.length === 2
            ? this.iframes[1].parentElement?.parentElement
            : (this.iframes[0].parentElement?.parentElement as HTMLElement);
        if (iframeParent && width) {
          var widthRatio =
            (parseInt(getComputedStyle(iframeParent).width) - 100) /
            (this.iframes.length === 2
              ? parseInt(width.toString().replace("px", "")) * 2 + 200
              : parseInt(width.toString().replace("px", "")));
          var heightRatio =
            (parseInt(getComputedStyle(iframeParent).height) - 100) /
            parseInt(height.toString().replace("px", ""));
          var scale = Math.min(widthRatio, heightRatio);
          iframeParent.style.transform = "scale(" + scale + ")";
          for (const iframe of this.iframes) {
            iframe.style.height = height;
            iframe.style.width = width;
            if (iframe.parentElement) {
              iframe.parentElement.style.height = height;
            }
          }
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

      if (element.className.indexOf(" active") === -1) {
        element.className += " active";
        sidenav.className += " expanded";
        element.innerText = "unfold_less";
        this.sideNavExpanded = true;
        this.bookmarkModule?.showBookmarks();
        this.annotationModule?.showHighlights();
      } else {
        element.className = element.className.replace(" active", "");
        sidenav.className = sidenav.className.replace(" expanded", "");
        element.innerText = "unfold_more";
        this.sideNavExpanded = false;
        this.bookmarkModule?.showBookmarks();
        this.annotationModule?.showHighlights();
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
      const ttsModule = this.ttsModule as TTSModule2;
      ttsModule.speakPlay();
    }
  }
  startReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.mediaOverlayModule !== undefined &&
      this.hasMediaOverlays
    ) {
      this.mediaOverlayModule?.startReadAloud();
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
      this.mediaOverlayModule !== undefined &&
      this.hasMediaOverlays
    ) {
      this.mediaOverlayModule?.stopReadAloud();
    }
  }

  pauseReadAloud() {
    if (this.rights.enableTTS) {
      const ttsModule = this.ttsModule as TTSModule2;
      ttsModule.speakPause();
      if (this.annotationModule !== undefined) {
        this.annotationModule.drawHighlights();
      }
    }
  }
  pauseReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.mediaOverlayModule !== undefined &&
      this.hasMediaOverlays
    ) {
      this.mediaOverlayModule?.pauseReadAloud();
    }
  }
  resumeReadAloud() {
    if (this.rights.enableTTS) {
      const ttsModule = this.ttsModule as TTSModule2;
      ttsModule.speakResume();
    }
  }
  resumeReadAlong() {
    if (
      this.rights.enableMediaOverlays &&
      this.mediaOverlayModule !== undefined &&
      this.hasMediaOverlays
    ) {
      this.mediaOverlayModule?.resumeReadAloud();
    }
  }

  totalResources(): number {
    return this.publication.readingOrder.length;
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

  tableOfContents(): any {
    return this.publication.tableOfContents;
  }
  landmarks(): any {
    return this.publication.landmarks;
  }
  pageList(): any {
    return this.publication.pageList;
  }
  readingOrder(): any {
    return this.publication.readingOrder;
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
            href: tocItem.Href,
            type: this.currentChapterLink.type,
            title: this.currentChapterLink.title,
            locations: {},
          };
        }
      }
    }
    if (position) {
      position.locations.progression = this.view?.getCurrentPosition();
      position.displayInfo = {
        resourceScreenIndex: Math.round(this.view?.getCurrentPage() ?? 0),
        resourceScreenCount: Math.round(this.view?.getPageCount() ?? 0),
      };
    }
    return position;
  }

  positions(): any {
    return this.publication.positions ? this.publication.positions : [];
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
    if (this.pageBreakModule !== undefined) {
      await this.pageBreakModule.goToPageNumber(page);
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
    this.attributes = attributes;
    this.view.attributes = attributes;
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
    this.emit("click", event);
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

        this.firstSpread.style.clipPath =
          "polygon(0% -20%, 100% -20%, 100% 120%, -20% 120%)";
        this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
        secondSpread.style.clipPath =
          "polygon(0% -20%, 100% -20%, 120% 100%, 0% 120%)";
        secondSpread.style.boxShadow = "0 0 8px 2px #ccc";
      } else {
        if (this.iframes.length === 2) {
          this.iframes.pop();
          if (this.spreads.lastChild) {
            this.spreads.removeChild(this.spreads.lastChild);
          }
        }
        this.firstSpread.style.clipPath =
          "polygon(0% -20%, 100% -20%, 120% 100%, -20% 120%)";
        this.firstSpread.style.boxShadow = "0 0 8px 2px #ccc";
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
      const minHeight =
        BrowserUtilities.getHeight() - 40 - (this.attributes?.margin ?? 0);

      var iframeParent =
        index === 0 && this.iframes.length === 2
          ? this.iframes[1].parentElement?.parentElement
          : (this.iframes[0].parentElement?.parentElement as HTMLElement);
      if (iframeParent) {
        iframeParent.style.height = minHeight + 40 + "px";

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
            var obj = dimensionsStr.split(",").reduce((obj, s) => {
              // @ts-ignore
              var [key, value] = s.match(/[^\s;=]+/g);
              obj[key] = isNaN(Number(value)) ? value : +value;
              return obj;
            }, {});
            if (parseInt(obj["height"]) !== 0 || parseInt(obj["width"]) !== 0) {
              height = obj["height"].toString().endsWith("px")
                ? obj["height"]
                : obj["height"] + "px";
              width = obj["width"].toString().endsWith("px")
                ? obj["width"]
                : obj["width"] + "px";
            }
          }
        }

        var widthRatio =
          (parseInt(getComputedStyle(iframeParent).width) - 100) /
          (this.iframes.length === 2
            ? parseInt(
                width.toString().endsWith("px")
                  ? width?.replace("px", "")
                  : width
              ) *
                2 +
              200
            : parseInt(
                width.toString().endsWith("px")
                  ? width?.replace("px", "")
                  : width
              ));
        var heightRatio =
          (parseInt(getComputedStyle(iframeParent).height) - 100) /
          parseInt(height.toString().replace("px", ""));
        var scale = Math.min(widthRatio, heightRatio);
        iframeParent.style.transform = "scale(" + scale + ")";

        for (const iframe of this.iframes) {
          iframe.style.height = height;
          iframe.style.width = width;
          if (iframe.parentElement) {
            iframe.parentElement.style.height = height;
          }
        }
      }
    }

    const oldPosition = this.view?.getCurrentPosition();
    await this.settings.applyProperties();

    // If the links are hidden, show them temporarily
    // to determine the top and bottom heights.

    if (this.infoTop) this.infoTop.style.height = 0 + "px";
    if (this.infoTop) this.infoTop.style.minHeight = 0 + "px";

    // TODO paginator page info
    // 0 = hide , 40 = show
    if (this.infoBottom)
      this.infoBottom.style.height = this.attributes?.bottomInfoHeight
        ? this.attributes.bottomInfoHeight + "px"
        : 40 + "px";

    if (this.view?.layout !== "fixed") {
      this.settings.isPaginated().then((paginated) => {
        if (paginated) {
          this.view.height =
            BrowserUtilities.getHeight() - 40 - (this.attributes?.margin ?? 0);
          if (this.infoBottom) this.infoBottom.style.removeProperty("display");
        } else {
          if (this.infoBottom) this.infoBottom.style.display = "none";
        }
      });
    }

    setTimeout(() => {
      if (this.view?.layout !== "fixed") {
        if (this.view?.isScrollMode()) {
          this.view?.setIframeHeight?.(this.iframes[0]);
        }
      }
    }, 100);
    setTimeout(async () => {
      if (oldPosition) {
        this.view?.goToProgression(oldPosition);
      }
      this.updatePositionInfo(false);

      if (this.contentProtectionModule !== undefined) {
        await this.contentProtectionModule.handleResize();
      }

      if (this.annotationModule !== undefined) {
        await this.annotationModule.handleResize();
      }
      if (this.bookmarkModule !== undefined) {
        await this.bookmarkModule.handleResize();
      }
      if (this.searchModule !== undefined) {
        await this.searchModule.handleResize();
      }
      if (this.definitionsModule !== undefined) {
        await this.definitionsModule.handleResize();
      }
      if (this.pageBreakModule !== undefined) {
        await this.pageBreakModule.handleResize();
      }
      if (this.lineFocusModule !== undefined) {
        this.lineFocusModule.handleResize();
      }
      if (this.historyModule !== undefined) {
        await this.historyModule.handleResize();
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
        href: this.publication.getAbsoluteHref(previous.Href),
        locations: {
          progression: 0,
        },
        type: previous.TypeLink,
        title: previous.Title,
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
        href: this.publication.getAbsoluteHref(next.Href),
        locations: {
          progression: 0,
        },
        type: next.TypeLink,
        title: next.Title,
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

  private handleKeydownFallthrough(event: KeyDownEvent | undefined): void {
    if (this.api?.keydownFallthrough) this.api?.keydownFallthrough(event);
    this.emit("keydown", event);
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
        item.className = item.className.replace(" active", "");
      }
      const activeItem = this.tocView.querySelector(
        'li > a[href^="' + resource + '"]'
      );
      if (activeItem) {
        activeItem.className += " active";
      }
    }
  }

  async navigate(locator: Locator, history: boolean = true): Promise<void> {
    if (this.rights.enableConsumption && this.consumptionModule) {
      if (history) {
        this.consumptionModule.startReadingSession(locator);
      }
    }
    if (this.historyModule) {
      await this.historyModule.push(locator, history);
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

        if (this.newElementId) {
          for (const iframe of this.iframes) {
            const element = (iframe.contentDocument as any).getElementById(
              this.newElementId
            );
            this.view?.goToElement?.(element);
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
        if (previous && previous.Href) {
          this.previousChapterLink = {
            href: previous.Href,
            type: previous.TypeLink,
            title: previous.Title,
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
            href: res.Href,
            type: res.TypeLink,
            title: res.Title,
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

        if (this.publication.Metadata.Title) {
          if (this.bookTitle)
            this.bookTitle.innerHTML =
              this.publication.Metadata.Title.toString();
        }

        const spineItem = this.publication.getSpineItem(currentLocation);
        if (spineItem !== undefined) {
          this.currentChapterLink.title = spineItem.Title;
          this.currentChapterLink.type = spineItem.TypeLink;
        }
        let tocItem = this.publication.getTOCItem(currentLocation);
        if (this.currentTocUrl !== undefined) {
          tocItem = this.publication.getTOCItem(this.currentTocUrl);
        }
        if (
          !this.currentChapterLink.title &&
          tocItem !== undefined &&
          tocItem.Title
        ) {
          this.currentChapterLink.title = tocItem.Title;
        }
        if (
          !this.currentChapterLink.type &&
          tocItem !== undefined &&
          tocItem.TypeLink
        ) {
          this.currentChapterLink.title = tocItem.Title;
        }

        if (this.currentChapterLink.title) {
          if (this.chapterTitle)
            this.chapterTitle.innerHTML =
              "(" + this.currentChapterLink.title + ")";
        } else {
          if (this.chapterTitle)
            this.chapterTitle.innerHTML = "(Current Chapter)";
        }
        await this.updatePositionInfo();
      } else {
        if (this.lineFocusModule !== undefined) {
          this.lineFocusModule.disableLineFocus(false);
        }
        if (this.searchModule !== undefined) {
          this.searchModule.clearSearch();
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
          this.contentProtectionModule !== undefined
        ) {
          await this.contentProtectionModule.initializeResource();
        }

        if (
          this.rights.enableMediaOverlays &&
          this.mediaOverlayModule !== undefined &&
          this.hasMediaOverlays
        ) {
          await this.mediaOverlayModule.initializeResource(this.currentLink());
        }

        if (
          this.rights.enableContentProtection &&
          this.contentProtectionModule !== undefined
        ) {
          await this.contentProtectionModule.recalculate(300);
        }

        if (this.bookmarkModule) {
          await this.bookmarkModule.drawBookmarks();
          await this.bookmarkModule.showBookmarks();
        }

        if (this.pageBreakModule) {
          await this.highlighter?.destroyHighlights(HighlightType.PageBreak);
          await this.pageBreakModule.drawPageBreaks();
        }

        if (
          this.rights.enableSearch &&
          this.searchModule !== undefined &&
          this.highlighter !== undefined
        ) {
          await this.highlighter.destroyHighlights(HighlightType.Search);
          this.searchModule.drawSearch();
        }

        if (
          this.rights.enableDefinitions &&
          this.definitionsModule &&
          this.highlighter
        ) {
          await this.definitionsModule.drawDefinitions();
        }

        if (this.rights.enableConsumption && this.consumptionModule) {
          this.consumptionModule.continueReadingSession(locator);
        }

        if (this.view?.layout === "fixed") {
          if (this.nextChapterBottomAnchorElement)
            this.nextChapterBottomAnchorElement.style.display = "none";
          if (this.previousChapterTopAnchorElement)
            this.previousChapterTopAnchorElement.style.display = "none";
          if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
          this.emit("resource.fits");
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
      if (startLink && startLink.Href) {
        startUrl = this.publication.getAbsoluteHref(startLink.Href);
        if (startUrl) {
          const position: ReadingPosition = {
            href: startUrl,
            locations: {
              progression: 0,
            },
            created: new Date(),
            title: startLink.Title,
          };
          await this.navigate(position);
        }
      }
    }
  }

  checkResourcePosition = debounce(() => {
    if (this.view?.atStart() && this.view?.atEnd()) {
      if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
      this.emit("resource.fits");
    } else if (this.view?.atEnd()) {
      if (this.api?.resourceAtEnd) this.api?.resourceAtEnd();
      this.emit("resource.end");
    } else if (this.view?.atStart()) {
      if (this.api?.resourceAtStart) this.api?.resourceAtStart();
      this.emit("resource.start");
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
    if (this.mediaOverlayModule !== undefined) {
      this.mediaOverlayModule.settings.resourceReady = false;
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
        if (this.view?.atStart() && this.view?.atEnd()) {
          if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
          this.emit("resource.fits");
        } else if (this.view?.atEnd()) {
          if (this.api?.resourceAtEnd) this.api?.resourceAtEnd();
          this.emit("resource.end");
        } else if (this.view?.atStart()) {
          if (this.api?.resourceAtStart) this.api?.resourceAtStart();
          this.emit("resource.start");
        }
      }
      if (this.api?.resourceReady) this.api?.resourceReady();
      this.emit("resource.ready");
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
        if (tocItem.Href.indexOf("#") !== -1) {
          const elementId = tocItem.Href.slice(tocItem.Href.indexOf("#") + 1);
          if (elementId !== undefined) {
            locations = {
              progression: this.view?.getCurrentPosition(),
              fragment: elementId,
            };
          }
        }

        let position: ReadingPosition | undefined;
        if (
          (this.rights.autoGeneratePositions && this.publication.positions) ||
          this.publication.positions
        ) {
          const positions = this.publication.positionsByHref(
            this.publication.getRelativeHref(tocItem.Href)
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
                href: tocItem.Href,
                created: new Date(),
                title: this.currentChapterLink.title,
              };
            }
          }
        } else {
          position = {
            href: tocItem.Href,
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
          if (this.consumptionModule) {
            this.consumptionModule.continueReadingSession(position);
          }
        }
      }
    }
  }

  private static createBase(href: string): HTMLBaseElement {
    const base = document.createElement("base");
    base.target = "_self";
    base.href = href;
    return base;
  }

  private static createCssLink(href: string): HTMLLinkElement {
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.type = "text/css";
    cssLink.href = href;
    return cssLink;
  }
  private static createJavascriptLink(
    href: string,
    isAsync: boolean
  ): HTMLScriptElement {
    const jsLink = document.createElement("script");
    jsLink.type = "text/javascript";
    jsLink.src = href;

    // Enforce synchronous behaviour of injected scripts
    // unless specifically marked async, as though they
    // were inserted using <script> tags
    //
    // See comment on differing default behaviour of
    // dynamically inserted script loading at https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#Attributes
    jsLink.async = isAsync;

    return jsLink;
  }

  activateMarker(id, position) {
    if (this.annotationModule !== undefined) {
      if (
        this.annotationModule.activeAnnotationMarkerId === undefined ||
        this.annotationModule.activeAnnotationMarkerId !== id
      ) {
        this.annotationModule.activeAnnotationMarkerId = id;
        this.annotationModule.activeAnnotationMarkerPosition = position;
        if (this.highlighter) {
          this.highlighter.activeAnnotationMarkerId = id;
        }
      } else {
        this.deactivateMarker();
      }
    }
  }

  deactivateMarker() {
    if (this.annotationModule !== undefined) {
      this.annotationModule.activeAnnotationMarkerId = undefined;
      this.annotationModule.activeAnnotationMarkerPosition = undefined;
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
