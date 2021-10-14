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
import {
  readerError,
  readerLoading,
  simpleUpLinkTemplate,
} from "../utils/HTMLTemplates";
import {
  Annotation,
  Locations,
  Locator,
  ReadingPosition,
} from "../model/Locator";
import { Collapsible, Dropdown, Sidenav, Tabs } from "materialize-css";
import {
  UserSettings,
  UserSettingsUIConfig,
} from "../model/user-settings/UserSettings";
import BookmarkModule, {
  BookmarkModuleConfig,
} from "../modules/BookmarkModule";
import AnnotationModule, {
  AnnotationModuleConfig,
} from "../modules/AnnotationModule";
import TTSModule from "../modules/TTS/TTSModule";
import { IS_DEV } from "..";
import Splitting from "../modules/TTS/splitting";
import SearchModule, {
  SearchModuleConfig,
} from "../modules/search/SearchModule";
import ContentProtectionModule, {
  ContentProtectionModuleConfig,
} from "../modules/protection/ContentProtectionModule";
import TextHighlighter, {
  TextHighlighterConfig,
} from "../modules/highlight/TextHighlighter";
import TimelineModule from "../modules/positions/TimelineModule";
import { debounce } from "debounce";
import TouchEventHandler from "../utils/TouchEventHandler";
import KeyboardEventHandler from "../utils/KeyboardEventHandler";
import BookView from "../views/BookView";

import MediaOverlayModule, {
  MediaOverlayModuleConfig,
} from "../modules/mediaoverlays/MediaOverlayModule";
import { D2Link, Link } from "../model/Link";
import SampleReadEventHandler from "../modules/sampleread/SampleReadEventHandler";
import ReaderModule from "../modules/ReaderModule";
import { TTSModuleConfig } from "../modules/TTS/TTSSettings";

import { HighlightType } from "../modules/highlight/common/highlight";
import TTSModule2 from "../modules/TTS/TTSModule2";
import PageBreakModule from "../modules/pagebreak/PageBreakModule";

export type GetContent = (href: string) => Promise<string>;
export type GetContentBytesLength = (href: string) => Promise<number>;

export interface NavigatorAPI {
  updateSettings: any;
  getContent: GetContent;
  getContentBytesLength: GetContentBytesLength;
  resourceReady: any;
  resourceAtStart: any;
  resourceAtEnd: any;
  resourceFitsScreen: any;
  updateCurrentLocation: any;
}

export interface UpLinkConfig {
  url?: URL;
  label?: string;
  ariaLabel?: string;
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
  headerMenu: HTMLElement;
  footerMenu: HTMLElement;
  publication: Publication;
  settings: UserSettings;
  annotator?: Annotator;
  upLink?: UpLinkConfig;
  initialLastReadingPosition?: ReadingPosition;
  rights?: ReaderRights;
  material?: ReaderUI;
  api: NavigatorAPI;
  tts: TTSModuleConfig;
  injectables: Array<Injectable>;
  attributes: IFrameAttributes;
  services: PublicationServices;
  sample?: SampleRead;
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
  enableBookmarks?: boolean;
  enableAnnotations?: boolean;
  enableTTS?: boolean;
  enableSearch?: boolean;
  enableContentProtection?: boolean;
  enableMaterial?: boolean;
  enableTimeline?: boolean;
  autoGeneratePositions?: boolean;
  enableMediaOverlays?: boolean;
}

export interface ReaderUI {
  settings: UserSettingsUIConfig;
}
export interface ReaderConfig {
  url: URL;
  userSettings?: any;
  initialAnnotations?: any;
  lastReadingPosition?: any;
  upLinkUrl?: any;
  rights?: ReaderRights;
  material?: ReaderUI;
  api?: NavigatorAPI;
  tts?: TTSModuleConfig;
  search?: SearchModuleConfig;
  protection?: ContentProtectionModuleConfig;
  mediaOverlays?: MediaOverlayModuleConfig;
  annotations?: AnnotationModuleConfig;
  bookmarks?: BookmarkModuleConfig;
  highlighter?: TextHighlighterConfig;
  injectables: Array<Injectable>;
  injectablesFixed: Array<Injectable>;
  useLocalStorage?: boolean;
  attributes?: IFrameAttributes;
  services?: PublicationServices;
  sample?: SampleRead;
}

/** Class that shows webpub resources in an iframe, with navigation controls outside the iframe. */
export default class IFrameNavigator implements Navigator {
  iframes: Array<HTMLIFrameElement> = [];

  currentTocUrl: string;
  headerMenu: HTMLElement;
  mainElement: HTMLElement;
  publication: Publication;

  bookmarkModule?: BookmarkModule;
  annotationModule?: AnnotationModule;
  ttsModule?: ReaderModule;
  searchModule?: SearchModule;
  contentProtectionModule?: ContentProtectionModule;
  highlighter?: TextHighlighter;
  timelineModule?: TimelineModule;
  pageBreakModule?: PageBreakModule;
  mediaOverlayModule?: MediaOverlayModule;

  sideNavExpanded: boolean = false;
  material: boolean = false;

  mTabs: Array<any>;
  mDropdowns: Array<any>;
  mCollapsibles: Array<any>;
  mSidenav: any;

  currentChapterLink: D2Link = {};
  currentSpreadLinks: { left?: D2Link; right?: D2Link } = {};
  currentTOCRawLink: string;
  private nextChapterLink: D2Link;
  private previousChapterLink: D2Link;
  settings: UserSettings;
  private readonly annotator: Annotator | null;

  view: BookView | null;

  private readonly eventHandler: EventHandler;
  private readonly touchEventHandler: TouchEventHandler;
  private readonly keyboardEventHandler: KeyboardEventHandler;
  private readonly sampleReadEventHandler: SampleReadEventHandler;
  private readonly upLinkConfig: UpLinkConfig | null;
  private upLink: HTMLAnchorElement | null = null;

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

  private bookmarksControl: HTMLButtonElement;
  private bookmarksView: HTMLDivElement;
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
  private newPosition: Locator | null;
  private newElementId: string | null;
  private isBeingStyled: boolean;
  private isLoading: boolean;
  private readonly initialLastReadingPosition: ReadingPosition;
  api: NavigatorAPI;
  rights: ReaderRights;
  tts: TTSModuleConfig;
  injectables: Array<Injectable>;
  attributes: IFrameAttributes;
  services: PublicationServices;
  sample: SampleRead;
  private didInitKeyboardEventHandler: boolean = false;

  public static async create(config: IFrameNavigatorConfig): Promise<any> {
    const navigator = new this(
      config.settings,
      config.annotator || null,
      config.upLink || null,
      config.initialLastReadingPosition || null,
      config.publication,
      config.material,
      config.api,
      config.rights,
      config.tts,
      config.injectables,
      config.attributes || { margin: 0 },
      config.services,
      config.sample
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
    annotator: Annotator | null = null,
    upLinkConfig: UpLinkConfig | null = null,
    initialLastReadingPosition: ReadingPosition | null = null,
    publication: Publication,
    material: any,
    api: NavigatorAPI,
    rights: ReaderRights,
    tts: TTSModuleConfig,
    injectables: Array<Injectable>,
    attributes: IFrameAttributes,
    services: PublicationServices,
    sample: SampleRead
  ) {
    this.settings = settings;
    this.annotator = annotator;
    this.view = settings.view;
    this.view.attributes = attributes;
    this.view.delegate = this;
    this.eventHandler = new EventHandler(this);
    this.touchEventHandler = new TouchEventHandler();
    this.keyboardEventHandler = new KeyboardEventHandler();
    this.upLinkConfig = upLinkConfig;
    this.initialLastReadingPosition = initialLastReadingPosition;
    this.publication = publication;
    this.material = material;
    this.api = api;
    this.rights = rights;
    this.tts = tts;
    this.injectables = injectables;
    this.attributes = attributes || { margin: 0 };
    this.services = services;
    this.sample = sample;
    this.sampleReadEventHandler = new SampleReadEventHandler(this);
  }

  async stop() {
    if (IS_DEV) {
      console.log("Iframe navigator stop");
    }

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
      this.bookmarksControl,
      "keydown",
      this.hideBookmarksOnEscape.bind(this)
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

    if (this.rights?.enableMaterial) {
      if (this.mDropdowns) {
        this.mDropdowns.forEach((element) => {
          (element as any).destroy();
        });
      }
      if (this.mCollapsibles) {
        this.mCollapsibles.forEach((element) => {
          (element as any).destroy();
        });
      }
      if (this.mSidenav) {
        (this.mSidenav as any).destroy();
      }
      if (this.mTabs) {
        this.mTabs.forEach((element) => {
          (element as any).destroy();
        });
      }
    }
  }
  spreads: HTMLDivElement;
  firstSpread: HTMLDivElement;

  protected async start(
    mainElement: HTMLElement,
    headerMenu: HTMLElement,
    footerMenu: HTMLElement
  ): Promise<void> {
    this.headerMenu = headerMenu;
    this.mainElement = mainElement;
    try {
      let iframe = HTMLUtilities.findElement(
        mainElement,
        "main#iframe-wrapper iframe"
      ) as HTMLIFrameElement;
      let iframe2 = HTMLUtilities.findElement(
        mainElement,
        "#second"
      ) as HTMLIFrameElement;

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
        var wrapper = HTMLUtilities.findRequiredElement(
          mainElement,
          "main#iframe-wrapper"
        ) as HTMLElement;
        let iframe = document.createElement("iframe");
        iframe.setAttribute("SCROLLING", "no");
        iframe.setAttribute("allowtransparency", "true");
        this.iframes.push(iframe);
        let info = document.getElementById("reader-info-bottom");

        if (
          (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
        ) {
          this.spreads = document.createElement("div");
          this.firstSpread = document.createElement("div");
          this.spreads.style.display = "flex";
          this.spreads.style.alignItems = "center";
          this.spreads.style.justifyContent = "center";
          this.spreads.appendChild(this.firstSpread);
          this.firstSpread.appendChild(this.iframes[0]);
          if (info) {
            wrapper.insertBefore(this.spreads, info);
          } else {
            wrapper.appendChild(this.spreads);
          }
        } else {
          iframe.setAttribute("height", "100%");
          iframe.setAttribute("width", "100%");
          if (info) {
            wrapper.insertBefore(this.iframes[0], info);
          } else {
            wrapper.appendChild(this.iframes[0]);
          }
        }

        if (
          (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
        ) {
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

      if (
        (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
      ) {
        var wrapper = HTMLUtilities.findRequiredElement(
          mainElement,
          "main#iframe-wrapper"
        ) as HTMLElement;
        const minHeight =
          BrowserUtilities.getHeight() - 40 - this.attributes.margin;
        wrapper.style.height = minHeight + 40 + "px";
        var iframeParent = this.iframes[0].parentElement
          .parentElement as HTMLElement;
        iframeParent.style.height = minHeight + 40 + "px";
      } else {
        if (this.iframes.length == 2) {
          this.iframes.pop();
        }
      }

      this.loadingMessage = HTMLUtilities.findElement(
        mainElement,
        "#reader-loading"
      ) as HTMLDivElement;
      if (this.loadingMessage) {
        this.loadingMessage.innerHTML = readerLoading;
        this.loadingMessage.style.display = "none";
      }
      this.errorMessage = HTMLUtilities.findElement(
        mainElement,
        "#reader-error"
      ) as HTMLDivElement;
      if (this.errorMessage) {
        this.errorMessage.innerHTML = readerError;
        this.errorMessage.style.display = "none";
      }

      this.tryAgainButton = HTMLUtilities.findElement(
        mainElement,
        "button[class=try-again]"
      ) as HTMLButtonElement;
      this.goBackButton = HTMLUtilities.findElement(
        mainElement,
        "button[class=go-back]"
      ) as HTMLButtonElement;
      this.infoTop = HTMLUtilities.findElement(
        mainElement,
        "div[class='info top']"
      ) as HTMLDivElement;
      this.infoBottom = HTMLUtilities.findElement(
        mainElement,
        "div[class='info bottom']"
      ) as HTMLDivElement;

      if (this.headerMenu)
        this.bookTitle = HTMLUtilities.findElement(
          this.headerMenu,
          "#book-title"
        ) as HTMLSpanElement;

      if (this.infoBottom)
        this.chapterTitle = HTMLUtilities.findElement(
          this.infoBottom,
          "span[class=chapter-title]"
        ) as HTMLSpanElement;
      if (this.infoBottom)
        this.chapterPosition = HTMLUtilities.findElement(
          this.infoBottom,
          "span[class=chapter-position]"
        ) as HTMLSpanElement;
      if (this.infoBottom)
        this.remainingPositions = HTMLUtilities.findElement(
          this.infoBottom,
          "span[class=remaining-positions]"
        ) as HTMLSpanElement;

      if (this.headerMenu)
        this.espandMenuIcon = HTMLUtilities.findElement(
          this.headerMenu,
          "#expand-menu"
        ) as HTMLElement;

      // Header Menu

      if (this.headerMenu)
        this.links = HTMLUtilities.findElement(
          this.headerMenu,
          "ul.links.top"
        ) as HTMLUListElement;
      if (this.headerMenu)
        this.linksTopLeft = HTMLUtilities.findElement(
          this.headerMenu,
          "#nav-mobile-left"
        ) as HTMLUListElement;

      if (this.headerMenu)
        this.tocView = HTMLUtilities.findElement(
          this.headerMenu,
          "#container-view-toc"
        ) as HTMLDivElement;

      if (this.headerMenu)
        this.landmarksView = HTMLUtilities.findElement(
          headerMenu,
          "#container-view-landmarks"
        ) as HTMLDivElement;
      if (this.headerMenu)
        this.landmarksSection = HTMLUtilities.findElement(
          headerMenu,
          "#sidenav-section-landmarks"
        ) as HTMLDivElement;
      if (this.headerMenu)
        this.pageListView = HTMLUtilities.findElement(
          headerMenu,
          "#container-view-pagelist"
        ) as HTMLDivElement;

      // Footer Menu
      if (footerMenu)
        this.linksBottom = HTMLUtilities.findElement(
          footerMenu,
          "ul.links.bottom"
        ) as HTMLUListElement;
      if (footerMenu)
        this.linksMiddle = HTMLUtilities.findElement(
          footerMenu,
          "ul.links.middle"
        ) as HTMLUListElement;

      if (this.headerMenu)
        this.nextChapterAnchorElement = HTMLUtilities.findElement(
          this.headerMenu,
          "a[rel=next]"
        ) as HTMLAnchorElement;
      if (this.headerMenu)
        this.nextChapterBottomAnchorElement = HTMLUtilities.findElement(
          mainElement,
          "#next-chapter"
        ) as HTMLAnchorElement;
      if (footerMenu)
        this.nextPageAnchorElement = HTMLUtilities.findElement(
          footerMenu,
          "a[rel=next]"
        ) as HTMLAnchorElement;

      if (this.headerMenu)
        this.previousChapterAnchorElement = HTMLUtilities.findElement(
          this.headerMenu,
          "a[rel=prev]"
        ) as HTMLAnchorElement;
      if (this.headerMenu)
        this.previousChapterTopAnchorElement = HTMLUtilities.findElement(
          mainElement,
          "#previous-chapter"
        ) as HTMLAnchorElement;
      if (footerMenu)
        this.previousPageAnchorElement = HTMLUtilities.findElement(
          footerMenu,
          "a[rel=prev]"
        ) as HTMLAnchorElement;

      if (this.nextChapterBottomAnchorElement)
        this.nextChapterBottomAnchorElement.style.display = "none";
      if (this.previousChapterTopAnchorElement)
        this.previousChapterTopAnchorElement.style.display = "none";

      this.newPosition = null;
      this.newElementId = null;
      this.isBeingStyled = true;
      this.isLoading = true;

      this.setupEvents();

      this.settings.setIframe(this.iframes[0]);
      this.settings.onSettingsChange(this.handleResize.bind(this));
      this.settings.onColumnSettingsChange(
        this.handleNumberOfIframes.bind(this)
      );
      this.settings.onViewChange(this.updateBookView.bind(this));

      if (this.initialLastReadingPosition) {
        this.annotator.initLastReadingPosition(this.initialLastReadingPosition);
      }

      var self = this;
      if (this.headerMenu) {
        var menuSearch = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-search"
        ) as HTMLLinkElement;
        var menuTTS = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-tts"
        ) as HTMLLinkElement;
        var menuBookmark = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-bookmark"
        ) as HTMLLinkElement;

        var play = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-play"
        ) as HTMLLinkElement;
        var pause = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-pause"
        ) as HTMLLinkElement;
        var menu = HTMLUtilities.findElement(
          this.headerMenu,
          "#menu-button-mediaoverlay"
        ) as HTMLLinkElement;
      }

      if (this.rights?.enableMaterial) {
        let elements = document.querySelectorAll(".sidenav");
        if (elements) {
          self.mSidenav = Sidenav.init(elements, {
            edge: this.attributes?.sideNavPosition ?? "left",
          });
        }
        let collapsible = document.querySelectorAll(".collapsible");
        if (collapsible) {
          self.mCollapsibles = Collapsible.init(collapsible, {
            accordion: true,
          });
        }
        let dropdowns = document.querySelectorAll(".dropdown-trigger");
        if (dropdowns) {
          self.mDropdowns = Dropdown.init(dropdowns, {
            alignment: "right",
            constrainWidth: false,
            coverTrigger: false,
            closeOnClick: false,
            autoTrigger: false,
            onOpenEnd: function () {
              self.mTabs.forEach((element) => {
                (element as any).updateTabIndicator();
              });
            },
          });
        }
        let tabs = document.querySelectorAll(".tabs");
        if (tabs) {
          self.mTabs = Tabs.init(tabs);
        }
        if (this.headerMenu) {
          if (!this.rights?.enableBookmarks) {
            if (menuBookmark)
              menuBookmark.parentElement.style.setProperty("display", "none");
            var sideNavSectionBookmarks = HTMLUtilities.findElement(
              this.headerMenu,
              "#sidenav-section-bookmarks"
            ) as HTMLElement;
            if (sideNavSectionBookmarks)
              sideNavSectionBookmarks.style.setProperty("display", "none");
          }
          if (!this.rights?.enableAnnotations) {
            var sideNavSectionHighlights = HTMLUtilities.findElement(
              this.headerMenu,
              "#sidenav-section-highlights"
            ) as HTMLElement;
            if (sideNavSectionHighlights)
              sideNavSectionHighlights.style.setProperty("display", "none");
          }
          if (!this.rights?.enableTTS) {
            if (menuTTS)
              menuTTS.parentElement.style.setProperty("display", "none");
          }
          if (!this.rights?.enableSearch) {
            if (menuSearch)
              menuSearch.parentElement.style.setProperty("display", "none");
          }
          if (
            menuSearch &&
            (this.view.delegate.publication.Metadata.Rendition?.Layout ??
              "unknown") === "fixed"
          ) {
            menuSearch.parentElement.style.setProperty("display", "none");
          }
        }
      } else {
        if (this.headerMenu) {
          if (menuSearch)
            menuSearch.parentElement.style.setProperty("display", "none");
          if (menuTTS)
            menuTTS.parentElement.style.setProperty("display", "none");
          if (menuBookmark)
            menuBookmark.parentElement.style.setProperty("display", "none");
        }
      }

      if (this.hasMediaOverlays) {
        if (play) play.parentElement.style.setProperty("display", "block");
        if (pause) pause.parentElement.style.setProperty("display", "block");
        if (menu) menu.parentElement.style.setProperty("display", "block");
      } else {
        if (play) play.parentElement.style.setProperty("display", "none");
        if (pause) pause.parentElement.style.setProperty("display", "none");
        if (menu) menu.parentElement.style.setProperty("display", "none");
      }

      return await this.loadManifest();
    } catch (err) {
      // There's a mismatch between the template and the selectors above,
      // or we weren't able to insert the template in the element.
      console.error(err);
      this.abortOnError();
      return new Promise<void>((_, reject) => reject(err)).catch(() => {});
    }
  }

  timeout: any;

  onResize = () => {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(this.handleResize.bind(this), 200);
  };
  reload = async () => {
    let lastReadingPosition: ReadingPosition | null = null;
    if (this.annotator) {
      lastReadingPosition =
        (await this.annotator.getLastReadingPosition()) as ReadingPosition | null;
    }

    if (lastReadingPosition) {
      const linkHref = this.publication.getAbsoluteHref(
        lastReadingPosition.href
      );
      if (IS_DEV) console.log(lastReadingPosition.href);
      if (IS_DEV) console.log(linkHref);
      lastReadingPosition.href = linkHref;
      await this.navigate(lastReadingPosition);
    }
  };

  private setupEvents(): void {
    for (const iframe of this.iframes) {
      addEventListenerOptional(
        iframe,
        "load",
        this.handleIFrameLoad.bind(this)
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
      this.bookmarksControl,
      "keydown",
      this.hideBookmarksOnEscape.bind(this)
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

  private setupModalFocusTrap(
    modal: HTMLDivElement,
    closeButton: HTMLButtonElement,
    lastFocusableElement: HTMLButtonElement | HTMLAnchorElement
  ): void {
    // Trap keyboard focus in a modal dialog when it's displayed.
    const TAB_KEY = 9;

    // Going backwards from the close button sends you to the last focusable element.
    closeButton.addEventListener("keydown", (event: KeyboardEvent) => {
      if (IFrameNavigator.isDisplayed(modal)) {
        const tab = event.keyCode === TAB_KEY;
        const shift = !!event.shiftKey;
        if (tab && shift) {
          lastFocusableElement.focus();
          event.preventDefault();
          event.stopPropagation();
        }
      }
    });

    // Going forward from the last focusable element sends you to the close button.
    lastFocusableElement.addEventListener("keydown", (event: KeyboardEvent) => {
      if (IFrameNavigator.isDisplayed(modal)) {
        const tab = event.keyCode === TAB_KEY;
        const shift = !!event.shiftKey;
        if (tab && !shift) {
          closeButton.focus();
          event.preventDefault();
          event.stopPropagation();
        }
      }
    });
  }

  isScrolling: boolean;
  private updateBookView(): void {
    if (this.view.layout === "fixed") {
      if (this.nextPageAnchorElement)
        this.nextPageAnchorElement.style.display = "none";
      if (this.previousPageAnchorElement)
        this.previousPageAnchorElement.style.display = "none";
      if (this.nextChapterBottomAnchorElement)
        this.nextChapterBottomAnchorElement.style.display = "none";
      if (this.previousChapterTopAnchorElement)
        this.previousChapterTopAnchorElement.style.display = "none";
    } else {
      this.settings.isPaginated().then((paginated) => {
        if (paginated) {
          this.view.height =
            BrowserUtilities.getHeight() - 40 - this.attributes.margin;
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
          }
          if (!IFrameNavigator.isDisplayed(this.linksBottom)) {
            this.toggleDisplay(this.linksBottom);
          }

          if (!IFrameNavigator.isDisplayed(this.linksMiddle)) {
            this.toggleDisplay(this.linksMiddle);
          }
        } else {
          if (this.infoBottom) this.infoBottom.style.display = "none";
          if (this.nextPageAnchorElement)
            this.nextPageAnchorElement.style.display = "none";
          if (this.previousPageAnchorElement)
            this.previousPageAnchorElement.style.display = "none";
          if (this.view.layout === "fixed") {
            if (this.nextChapterBottomAnchorElement)
              this.nextChapterBottomAnchorElement.style.display = "none";
            if (this.previousChapterTopAnchorElement)
              this.previousChapterTopAnchorElement.style.display = "none";
          } else {
            if (this.view.atStart() && this.view.atEnd()) {
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "unset";
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "unset";
            } else if (this.view.atEnd()) {
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "none";
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "unset";
            } else if (this.view.atStart()) {
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

          // document.body.style.overflow = "auto";
          document.body.onscroll = async () => {
            this.isScrolling = true;
            await this.savePosition();
            if (this.view.atEnd()) {
              // Bring up the bottom nav when you get to the bottom,
              // if it wasn't already displayed.
              if (!IFrameNavigator.isDisplayed(this.linksBottom)) {
                this.toggleDisplay(this.linksBottom);
              }
              if (!IFrameNavigator.isDisplayed(this.linksMiddle)) {
                this.toggleDisplay(this.linksMiddle);
              }
            } else {
              // Remove the bottom nav when you scroll back up,
              // if it was displayed because you were at the bottom.
              if (
                IFrameNavigator.isDisplayed(this.linksBottom) &&
                !IFrameNavigator.isDisplayed(this.links)
              ) {
                this.toggleDisplay(this.linksBottom);
              }
            }
            if (this.view.layout === "fixed") {
              if (this.nextChapterBottomAnchorElement)
                this.nextChapterBottomAnchorElement.style.display = "none";
              if (this.previousChapterTopAnchorElement)
                this.previousChapterTopAnchorElement.style.display = "none";
            } else {
              this.settings.isPaginated().then((paginated) => {
                if (!paginated) {
                  if (this.view.atStart() && this.view.atEnd()) {
                    if (this.nextChapterBottomAnchorElement)
                      this.nextChapterBottomAnchorElement.style.display =
                        "unset";
                    if (this.previousChapterTopAnchorElement)
                      this.previousChapterTopAnchorElement.style.display =
                        "unset";
                  } else if (this.view.atEnd()) {
                    if (this.previousChapterTopAnchorElement)
                      this.previousChapterTopAnchorElement.style.display =
                        "none";
                    if (this.nextChapterBottomAnchorElement)
                      this.nextChapterBottomAnchorElement.style.display =
                        "unset";
                  } else if (this.view.atStart()) {
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
          }
          if (!IFrameNavigator.isDisplayed(this.linksBottom)) {
            this.toggleDisplay(this.linksBottom);
          }

          if (!IFrameNavigator.isDisplayed(this.linksMiddle)) {
            this.toggleDisplay(this.linksMiddle);
          }
        }
      });
      setTimeout(async () => {
        if (this.pageBreakModule !== undefined) {
          await this.highlighter.destroyHighlights(HighlightType.PageBreak);
          await this.pageBreakModule.drawPageBreaks();
        }

        if (this.annotationModule !== undefined) {
          await this.annotationModule.drawHighlights();
        }
        if (this.bookmarkModule !== undefined) {
          await this.bookmarkModule.drawBookmarks();
        }

        if (
          this.rights?.enableSearch &&
          this.searchModule !== undefined &&
          this.highlighter !== undefined
        ) {
          await this.highlighter.destroyHighlights(HighlightType.Search);
          this.searchModule.drawSearch();
          this.searchModule.drawPopup();
        }
      }, 200);
    }
  }

  private async loadManifest(): Promise<void> {
    try {
      const createSubmenu = (
        parentElement: Element,
        links: Array<Link>,
        control?: HTMLButtonElement,
        ol: boolean = false
      ) => {
        var menuControl: HTMLButtonElement;
        var mainElement: HTMLDivElement;
        if (control) {
          menuControl = control;
          if (parentElement instanceof HTMLDivElement) {
            mainElement = parentElement;
          }
        }
        var listElement: HTMLUListElement = document.createElement("ul");
        if (ol) {
          listElement = document.createElement("ol");
        }
        listElement.className = "sidenav-toc";
        let lastLink: HTMLAnchorElement | null = null;
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
            createSubmenu(listItemElement, link.Children, null, true);
          }

          listElement.appendChild(listItemElement);
          lastLink = linkElement;
        }

        // Trap keyboard focus inside the TOC while it's open.
        if (lastLink && menuControl) {
          this.setupModalFocusTrap(mainElement, menuControl, lastLink);
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
              this.hideView(mainElement, menuControl);
            } else {
              // Set focus back to the contents toggle button so screen readers
              // don't get stuck on a hidden link.
              menuControl?.focus();

              let locations: Locations = {
                progression: 0,
              };
              if (linkElement.href.indexOf("#") !== -1) {
                const elementId = linkElement.href.slice(
                  linkElement.href.indexOf("#") + 1
                );
                if (elementId !== null) {
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

              this.hideView(mainElement, menuControl);
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
          this.tocView.parentElement.parentElement.removeChild(
            this.tocView.parentElement
          );
        }
      }

      if (this.pageListView) {
        if (pageList?.length) {
          createSubmenu(this.pageListView, pageList);
        } else {
          this.pageListView.parentElement.parentElement.removeChild(
            this.pageListView.parentElement
          );
        }
      }

      if (this.landmarksView) {
        if (landmarks?.length) {
          createSubmenu(this.landmarksView, landmarks);
        } else {
          this.landmarksSection.parentElement.removeChild(
            this.landmarksSection
          );
        }
      }

      if (
        (this.links || this.linksTopLeft) &&
        this.upLinkConfig &&
        this.upLinkConfig.url
      ) {
        const upUrl = this.upLinkConfig.url;
        const upLabel = this.upLinkConfig.label || "";
        const upAriaLabel = this.upLinkConfig.ariaLabel || upLabel;
        var upHTML = simpleUpLinkTemplate(upUrl.href, upLabel, upAriaLabel);
        const upParent: HTMLLIElement = document.createElement("li");
        upParent.classList.add("uplink-wrapper");
        upParent.innerHTML = upHTML;
        if (this.links) {
          this.links.insertBefore(upParent, this.links.firstChild);
          this.upLink = HTMLUtilities.findRequiredElement(
            this.links,
            "a[rel=up]"
          ) as HTMLAnchorElement;
        } else {
          this.linksTopLeft.insertBefore(
            upParent,
            this.linksTopLeft.firstChild
          );
          this.upLink = HTMLUtilities.findRequiredElement(
            this.linksTopLeft,
            "a[rel=up]"
          ) as HTMLAnchorElement;
        }
      }

      let lastReadingPosition: ReadingPosition | null = null;
      if (this.annotator) {
        lastReadingPosition =
          (await this.annotator.getLastReadingPosition()) as ReadingPosition | null;
      }

      const startLink = this.publication.getStartLink();
      let startUrl: string | null = null;
      if (startLink && startLink.Href) {
        startUrl = this.publication.getAbsoluteHref(startLink.Href);
      }

      if (lastReadingPosition) {
        const linkHref = this.publication.getAbsoluteHref(
          lastReadingPosition.href
        );
        if (IS_DEV) console.log(lastReadingPosition.href);
        if (IS_DEV) console.log(linkHref);
        lastReadingPosition.href = linkHref;
        await this.navigate(lastReadingPosition);
      } else if (startUrl) {
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

      return new Promise<void>((resolve) => resolve());
    } catch (err) {
      console.error(err);
      this.abortOnError();
      return new Promise<void>((_, reject) => reject(err)).catch(() => {});
    }
  }

  private async handleIFrameLoad(): Promise<void> {
    if (this.errorMessage) this.errorMessage.style.display = "none";
    this.showLoadingMessageAfterDelay();
    try {
      let bookViewPosition = 0;
      if (this.newPosition) {
        bookViewPosition = this.newPosition.locations.progression;
      }
      await this.handleResize();
      this.updateBookView();

      await this.settings.applyProperties();

      let currentLocation = this.currentChapterLink.href;

      const previous = this.publication.getPreviousSpineItem(currentLocation);
      if (previous && previous.Href) {
        this.previousChapterLink = {
          href: previous.Href,
          title: previous.Title,
          type: previous.TypeLink,
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
          title: res.Title,
          type: res.TypeLink,
        };
      } else {
        this.nextChapterLink = undefined;
      }
      if (this.nextChapterAnchorElement) {
        if (this.nextChapterLink) {
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

      if (this.currentTocUrl !== null) {
        this.setActiveTOCItem(this.currentTocUrl);
      } else {
        this.setActiveTOCItem(currentLocation);
      }

      if (this.publication.Metadata.Title) {
        if (this.bookTitle)
          this.bookTitle.innerHTML = this.publication.Metadata.Title.toString();
      }

      const spineItem = this.publication.getSpineItem(currentLocation);
      if (spineItem !== null) {
        this.currentChapterLink.title = spineItem.Title;
        this.currentChapterLink.type = spineItem.TypeLink;
      }
      let tocItem = this.publication.getTOCItem(currentLocation);
      if (this.currentTocUrl !== null) {
        tocItem = this.publication.getTOCItem(this.currentTocUrl);
      }
      if (!this.currentChapterLink.title && tocItem !== null && tocItem.Title) {
        this.currentChapterLink.title = tocItem.Title;
      }
      if (
        !this.currentChapterLink.type &&
        tocItem !== null &&
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

      await this.injectInjectablesIntoIframeHead();

      if (this.highlighter !== undefined) {
        await this.highlighter.initialize();
      }
      const body = this.iframes[0].contentDocument.body;
      if (this.rights?.enableTTS && this.tts?.enableSplitter) {
        Splitting({
          target: body,
          by: "lines",
        });
      }

      // resize on toggle details
      let details = body.querySelector("details");
      if (details) {
        let self = this;
        details.addEventListener("toggle", async (_event) => {
          await self.view.setIframeHeight(this.iframes[0]);
        });
      }

      if (this.rights?.enableContentProtection) {
        if (this.contentProtectionModule !== undefined) {
          await this.contentProtectionModule.initialize();
        }
      }

      if (this.eventHandler) {
        for (const iframe of this.iframes) {
          this.eventHandler.setupEvents(iframe.contentDocument);
          this.touchEventHandler.setupEvents(iframe.contentDocument);
          this.keyboardEventHandler.setupEvents(iframe.contentDocument);
        }
        this.touchEventHandler.setupEvents(this.errorMessage);
        if (!this.didInitKeyboardEventHandler) {
          this.keyboardEventHandler.delegate = this;
          this.keyboardEventHandler.keydown(document);
          this.didInitKeyboardEventHandler = true;
        }
      }
      if (this.view.layout !== "fixed") {
        if (this.view?.isScrollMode()) {
          for (const iframe of this.iframes) {
            this.view.setIframeHeight(iframe);
          }
        }
      }
      if (this.annotationModule !== undefined) {
        await this.annotationModule.initialize();
      }
      if (this.bookmarkModule !== undefined) {
        await this.bookmarkModule.initialize();
      }
      if (this.rights?.enableTTS) {
        for (const iframe of this.iframes) {
          const body = iframe.contentDocument.body;
          if (this.ttsModule !== undefined) {
            if (this.tts.enableSplitter) {
              const ttsModule = this.ttsModule as TTSModule;
              await ttsModule.initialize(body);
            } else {
              const ttsModule = this.ttsModule as TTSModule2;
              await ttsModule.initialize(body);
            }
          }
        }
      }

      if (this.timelineModule !== undefined) {
        await this.timelineModule.initialize();
      }

      if (this.mediaOverlayModule !== undefined) {
        await this.mediaOverlayModule.initialize();
      }

      setTimeout(async () => {
        if (this.newElementId) {
          const element = (
            this.iframes[0].contentDocument as any
          ).getElementById(this.newElementId);
          this.view.goToElement(element);
          this.newElementId = null;
        } else if (
          this.newPosition &&
          (this.newPosition as Annotation).highlight
        ) {
          this.view.goToCssSelector(
            (this.newPosition as Annotation).highlight.selectionInfo.rangeInfo
              .startContainerElementCssSelector
          );
        } else if (bookViewPosition > 0) {
          this.view.goToProgression(bookViewPosition);
        }

        this.newPosition = null;

        this.hideLoadingMessage();
        this.showIframeContents();
        if (this.mediaOverlayModule !== undefined) {
          await this.mediaOverlayModule.initializeResource(this.currentLink());
        }
        await this.updatePositionInfo();
        await this.view?.setSize();
        await this.searchModule.definitions();
      }, 200);

      return new Promise<void>((resolve) => resolve());
    } catch (err) {
      console.error(err);
      this.abortOnError();
      return new Promise<void>((_, reject) => reject(err)).catch(() => {});
    }
  }

  private async injectInjectablesIntoIframeHead(): Promise<void> {
    // Inject Readium CSS into Iframe Head
    const injectablesToLoad: Promise<boolean>[] = [];

    const addLoadingInjectable = (
      injectable: HTMLLinkElement | HTMLScriptElement
    ) => {
      const loadPromise = new Promise<boolean>((resolve) => {
        injectable.onload = () => {
          resolve(true);
        };
      });
      injectablesToLoad.push(loadPromise);
    };

    for (const iframe of this.iframes) {
      const head = iframe.contentDocument.head;
      if (head) {
        head.insertBefore(
          IFrameNavigator.createBase(this.currentChapterLink.href),
          head.firstChild
        );

        this.injectables.forEach((injectable) => {
          if (injectable.type === "style") {
            if (injectable.fontFamily) {
              // UserSettings.fontFamilyValues.push(injectable.fontFamily)
              // this.settings.setupEvents()
              // this.settings.addFont(injectable.fontFamily);
              this.settings.initAddedFont();
              if (!injectable.systemFont) {
                const link = IFrameNavigator.createCssLink(injectable.url);
                head.appendChild(link);
                addLoadingInjectable(link);
              }
            } else if (injectable.r2before) {
              const link = IFrameNavigator.createCssLink(injectable.url);
              head.insertBefore(link, head.firstChild);
              addLoadingInjectable(link);
            } else if (injectable.r2default) {
              const link = IFrameNavigator.createCssLink(injectable.url);
              head.insertBefore(link, head.childNodes[1]);
              addLoadingInjectable(link);
            } else if (injectable.r2after) {
              if (injectable.appearance) {
                // this.settings.addAppearance(injectable.appearance);
                this.settings.initAddedAppearance();
              }
              const link = IFrameNavigator.createCssLink(injectable.url);
              head.appendChild(link);
              addLoadingInjectable(link);
            } else {
              const link = IFrameNavigator.createCssLink(injectable.url);
              head.appendChild(link);
              addLoadingInjectable(link);
            }
          } else if (injectable.type === "script") {
            const script = IFrameNavigator.createJavascriptLink(
              injectable.url,
              injectable.async
            );
            head.appendChild(script);
            addLoadingInjectable(script);
          }
        });
      }
    }

    if (injectablesToLoad.length === 0) {
      return;
    }

    await Promise.all(injectablesToLoad);
  }

  private abortOnError() {
    if (this.errorMessage) this.errorMessage.style.display = "block";
    if (this.isLoading) {
      this.hideLoadingMessage();
    }
  }

  private tryAgain() {
    this.precessContentForIframe();
  }

  private precessContentForIframe() {
    const self = this;
    var index = this.publication.getSpineIndex(this.currentChapterLink.href);
    var even: boolean = index % 2 === 1;
    this.showLoadingMessageAfterDelay();

    function writeIframeDoc(content: string, href: string) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "application/xhtml+xml");
      if (doc.head) {
        doc.head.insertBefore(
          IFrameNavigator.createBase(href),
          doc.head.firstChild
        );
      }
      const newHTML = doc.documentElement.outerHTML;
      const iframeDoc = self.iframes[0].contentDocument;
      iframeDoc.open();
      iframeDoc.write(newHTML);
      iframeDoc.close();
    }

    function writeIframe2Doc(content: string, href: string) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "application/xhtml+xml");
      if (doc.head) {
        doc.head.insertBefore(
          IFrameNavigator.createBase(href),
          doc.head.firstChild
        );
      }
      const newHTML = doc.documentElement.outerHTML;
      const iframeDoc = self.iframes[1].contentDocument;
      iframeDoc.open();
      iframeDoc.write(newHTML);
      iframeDoc.close();
    }

    const link = new URL(this.currentChapterLink.href);
    const isSameOrigin =
      window.location.protocol === link.protocol &&
      window.location.port === link.port &&
      window.location.hostname === link.hostname;

    if (this.api?.getContent) {
      if (
        (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
      ) {
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
                    fetch(this.currentChapterLink.href)
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
            if (this.iframes.length == 2) {
              if (index < this.publication.readingOrder.length - 1) {
                const next = this.publication.getNextSpineItem(
                  this.currentChapterLink.href
                );
                var href = this.publication.getAbsoluteHref(next.Href);
                this.currentSpreadLinks.right = {
                  href: href,
                };

                this.api?.getContent(href).then((content) => {
                  if (content === undefined) {
                    if (isSameOrigin) {
                      this.iframes[1].src = href;
                    } else {
                      fetch(href)
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
              } else {
                this.iframes[1].src = "about:blank";
              }
            }
          } else {
            if (index > 0) {
              const prev = this.publication.getPreviousSpineItem(
                this.currentChapterLink.href
              );
              var href = this.publication.getAbsoluteHref(prev.Href);
              this.currentSpreadLinks.left = {
                href: href,
              };
              this.api?.getContent(href).then((content) => {
                if (content === undefined) {
                  if (isSameOrigin) {
                    this.iframes[0].src = href;
                  } else {
                    fetch(href)
                      .then((r) => r.text())
                      .then(async (content) => {
                        writeIframeDoc.call(this, content, href);
                      });
                  }
                } else {
                  writeIframeDoc.call(this, content, href);
                }
              });
            } else {
              this.iframes[0].src = "about:blank";
            }
            if (
              this.iframes.length == 2 &&
              (this.publication.Metadata.Rendition?.Layout ?? "unknown") ===
                "fixed"
            ) {
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
                      fetch(this.currentChapterLink.href)
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
                fetch(this.currentChapterLink.href)
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
              fetch(this.currentChapterLink.href)
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
      if (
        (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
      ) {
        if (this.settings.columnCount !== 1) {
          if (even) {
            if (isSameOrigin) {
              this.iframes[0].src = this.currentChapterLink.href;
              this.currentSpreadLinks.left = {
                href: this.currentChapterLink.href,
              };

              if (this.iframes.length == 2) {
                if (index < this.publication.readingOrder.length - 1) {
                  const next = this.publication.getNextSpineItem(
                    this.currentChapterLink.href
                  );
                  var href = this.publication.getAbsoluteHref(next.Href);
                  this.iframes[1].src = href;
                  this.currentSpreadLinks.right = {
                    href: href,
                  };
                } else {
                  this.iframes[1].src = "about:blank";
                }
              }
            } else {
              fetch(this.currentChapterLink.href)
                .then((r) => r.text())
                .then(async (content) => {
                  writeIframeDoc.call(
                    this,
                    content,
                    this.currentChapterLink.href
                  );
                });
              if (this.iframes.length == 2) {
                if (index < this.publication.readingOrder.length - 1) {
                  const next = this.publication.getNextSpineItem(
                    this.currentChapterLink.href
                  );
                  var href = this.publication.getAbsoluteHref(next.Href);
                  this.currentSpreadLinks.right = {
                    href: href,
                  };

                  fetch(href)
                    .then((r) => r.text())
                    .then(async (content) => {
                      writeIframe2Doc.call(this, content, href);
                    });
                } else {
                  this.iframes[1].src = "about:blank";
                }
              }
            }
          } else {
            if (index > 0) {
              const prev = this.publication.getPreviousSpineItem(
                this.currentChapterLink.href
              );
              var href = this.publication.getAbsoluteHref(prev.Href);
              this.currentSpreadLinks.left = {
                href: href,
              };
              if (isSameOrigin) {
                this.iframes[0].src = href;
                if (this.iframes.length == 2) {
                  this.iframes[1].src = this.currentChapterLink.href;
                }
              } else {
                fetch(href)
                  .then((r) => r.text())
                  .then(async (content) => {
                    writeIframeDoc.call(this, content, href);
                  });
                if (this.iframes.length == 2) {
                  this.currentSpreadLinks.right = {
                    href: this.currentChapterLink.href,
                  };
                  fetch(this.currentChapterLink.href)
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
            } else {
              this.iframes[0].src = "about:blank";
            }
            if (this.iframes.length == 2) {
              this.currentSpreadLinks.right = {
                href: this.currentChapterLink.href,
              };

              if (isSameOrigin) {
                this.iframes[1].src = this.currentChapterLink.href;
              } else {
                fetch(this.currentChapterLink.href)
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
          this.currentSpreadLinks.left = {
            href: href,
          };
          if (isSameOrigin) {
            this.iframes[0].src = this.currentChapterLink.href;
          } else {
            fetch(this.currentChapterLink.href)
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
          fetch(this.currentChapterLink.href)
            .then((r) => r.text())
            .then(async (content) => {
              writeIframeDoc.call(this, content, this.currentChapterLink.href);
            });
        }
      }
    }
    if (
      (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
    ) {
      setTimeout(() => {
        let height = getComputedStyle(
          index === 0 && this.iframes.length == 2
            ? this.iframes[1].contentDocument.body
            : this.iframes[0].contentDocument.body
        ).height;
        let width = getComputedStyle(
          index === 0 && this.iframes.length == 2
            ? this.iframes[1].contentDocument.body
            : this.iframes[0].contentDocument.body
        ).width;

        if (
          parseInt(height.replace("px", "")) === 0 ||
          parseInt(width.replace("px", "")) === 0
        ) {
          const head = HTMLUtilities.findRequiredIframeElement(
            index === 0 && this.iframes.length == 2
              ? this.iframes[1].contentDocument
              : this.iframes[0].contentDocument,
            "head"
          ) as HTMLHeadElement;
          if (head) {
            const viewport = HTMLUtilities.findElement(
              head,
              "meta[name=viewport]"
            ) as HTMLMetaElement;
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

        var iframeParent =
          index === 0 && this.iframes.length == 2
            ? this.iframes[1].parentElement.parentElement
            : (this.iframes[0].parentElement.parentElement as HTMLElement);
        var widthRatio =
          (parseInt(getComputedStyle(iframeParent).width) - 100) /
          (this.iframes.length == 2
            ? parseInt(width.replace("px", "")) * 2 + 200
            : parseInt(width.replace("px", "")));
        var heightRatio =
          (parseInt(getComputedStyle(iframeParent).height) - 100) /
          parseInt(height.replace("px", ""));
        var scale = Math.min(widthRatio, heightRatio);
        iframeParent.style.transform = "scale(" + scale + ")";
        for (const iframe of this.iframes) {
          iframe.style.height = height;
          iframe.style.width = width;
          iframe.parentElement.style.height = height;
        }
      }, 400);
    }
  }

  private static goBack() {
    window.history.back();
  }

  private static isDisplayed(element: HTMLDivElement | HTMLUListElement) {
    return element ? element.className.indexOf(" active") !== -1 : false;
  }

  private static showElement(
    element: HTMLDivElement | HTMLUListElement,
    control?: HTMLAnchorElement | HTMLButtonElement
  ) {
    if (element) {
      element.className = element.className.replace(" inactive", "");
      if (element.className.indexOf(" active") === -1) {
        element.className += " active";
      }
      element.setAttribute("aria-hidden", "false");
      if (control) {
        control.setAttribute("aria-expanded", "true");

        const openIcon = control.querySelector(".icon.open");
        if (
          openIcon &&
          (openIcon.getAttribute("class") || "").indexOf(" inactive-icon") ===
            -1
        ) {
          const newIconClass =
            (openIcon.getAttribute("class") || "") + " inactive-icon";
          openIcon.setAttribute("class", newIconClass);
        }
        const closeIcon = control.querySelector(".icon.close");
        if (closeIcon) {
          const newIconClass = (closeIcon.getAttribute("class") || "").replace(
            " inactive-icon",
            ""
          );
          closeIcon.setAttribute("class", newIconClass);
        }
      }
      // Add buttons and links in the element to the tab order.
      const buttons = Array.prototype.slice.call(
        element.querySelectorAll("button")
      );
      const links = Array.prototype.slice.call(element.querySelectorAll("a"));
      for (const button of buttons) {
        button.tabIndex = 0;
      }
      for (const link of links) {
        link.tabIndex = 0;
      }
    }
  }

  private static hideElement(
    element: HTMLDivElement | HTMLUListElement,
    control?: HTMLAnchorElement | HTMLButtonElement
  ) {
    if (element) {
      element.className = element.className.replace(" active", "");
      if (element.className.indexOf(" inactive") === -1) {
        element.className += " inactive";
      }
      element.setAttribute("aria-hidden", "true");
      if (control) {
        control.setAttribute("aria-expanded", "false");

        const openIcon = control.querySelector(".icon.open");
        if (openIcon) {
          const newIconClass = (openIcon.getAttribute("class") || "").replace(
            " inactive-icon",
            ""
          );
          openIcon.setAttribute("class", newIconClass);
        }
        const closeIcon = control.querySelector(".icon.close");
        if (
          closeIcon &&
          (closeIcon.getAttribute("class") || "").indexOf(" inactive-icon") ===
            -1
        ) {
          const newIconClass =
            (closeIcon.getAttribute("class") || "") + " inactive-icon";
          closeIcon.setAttribute("class", newIconClass);
        }
      }
      // Remove buttons and links in the element from the tab order.
      const buttons = Array.prototype.slice.call(
        element.querySelectorAll("button")
      );
      const links = Array.prototype.slice.call(element.querySelectorAll("a"));
      for (const button of buttons) {
        button.tabIndex = -1;
      }
      for (const link of links) {
        link.tabIndex = -1;
      }
    }
  }

  private hideModal(
    modal: HTMLDivElement,
    control?: HTMLAnchorElement | HTMLButtonElement
  ) {
    // Restore the page for screen readers.
    for (const iframe of this.iframes) {
      iframe.setAttribute("aria-hidden", "false");
    }
    if (this.upLink) this.upLink.setAttribute("aria-hidden", "false");
    if (this.linksBottom) this.linksBottom.setAttribute("aria-hidden", "false");
    if (this.linksMiddle) this.linksMiddle.setAttribute("aria-hidden", "false");
    if (this.loadingMessage)
      this.loadingMessage.setAttribute("aria-hidden", "false");
    if (this.errorMessage)
      this.errorMessage.setAttribute("aria-hidden", "false");
    if (this.infoTop) this.infoTop.setAttribute("aria-hidden", "false");
    if (this.infoBottom) this.infoBottom.setAttribute("aria-hidden", "false");
    IFrameNavigator.hideElement(modal, control);
  }

  private toggleDisplay(
    element: HTMLDivElement | HTMLUListElement,
    control?: HTMLAnchorElement | HTMLButtonElement
  ): void {
    if (!IFrameNavigator.isDisplayed(element)) {
      IFrameNavigator.showElement(element, control);
    } else {
      IFrameNavigator.hideElement(element, control);
    }
    if (element === this.linksMiddle) {
      if (this.view.layout !== "fixed") {
        if (this.view?.isScrollMode()) {
          IFrameNavigator.showElement(element, control);
        } else {
          IFrameNavigator.hideElement(element, control);
        }
      }
    }
  }

  private handleEditClick(event: MouseEvent): void {
    var element = event.target as HTMLElement;
    var sidenav = HTMLUtilities.findElement(
      this.headerMenu,
      ".sidenav"
    ) as HTMLElement;

    if (element.className.indexOf(" active") === -1) {
      element.className += " active";
      sidenav.className += " expanded";
      element.innerText = "unfold_less";
      this.sideNavExpanded = true;
      this.bookmarkModule.showBookmarks();
      this.annotationModule.showHighlights();
    } else {
      element.className = element.className.replace(" active", "");
      sidenav.className = sidenav.className.replace(" expanded", "");
      element.innerText = "unfold_more";
      this.sideNavExpanded = false;
      this.bookmarkModule.showBookmarks();
      this.annotationModule.showHighlights();
    }
    event.preventDefault();
    event.stopPropagation();
  }
  get hasMediaOverlays() {
    return this.publication.hasMediaOverlays;
  }
  startReadAloud() {
    if (this.rights?.enableTTS) {
      if (this.tts.enableSplitter) {
        this.highlighter.speakAll();
      } else {
        const ttsModule = this.ttsModule as TTSModule2;
        ttsModule.speakPlay();
      }
    }
  }
  startReadAlong() {
    if (this.rights?.enableMediaOverlays && this.publication.hasMediaOverlays) {
      this.mediaOverlayModule.startReadAloud();
    }
  }
  stopReadAloud() {
    if (this.rights?.enableTTS) {
      this.highlighter.stopReadAloud();
      if (!this.tts.enableSplitter) {
        if (this.annotationModule !== undefined) {
          this.annotationModule.drawHighlights();
        }
      }
    }
  }
  stopReadAlong() {
    if (this.rights?.enableMediaOverlays && this.publication.hasMediaOverlays) {
      this.mediaOverlayModule.stopReadAloud();
    }
  }

  pauseReadAloud() {
    if (this.rights?.enableTTS) {
      if (this.tts.enableSplitter) {
        const ttsModule = this.ttsModule as TTSModule;
        ttsModule.speakPause();
      } else {
        const ttsModule = this.ttsModule as TTSModule2;
        ttsModule.speakPause();
        if (this.annotationModule !== undefined) {
          this.annotationModule.drawHighlights();
        }
      }
    }
  }
  pauseReadAlong() {
    if (this.rights?.enableMediaOverlays && this.publication.hasMediaOverlays) {
      this.mediaOverlayModule.pauseReadAloud();
    }
  }
  resumeReadAloud() {
    if (this.rights?.enableTTS) {
      if (this.tts.enableSplitter) {
        const ttsModule = this.ttsModule as TTSModule;
        ttsModule.speakResume();
      } else {
        const ttsModule = this.ttsModule as TTSModule2;
        ttsModule.speakResume();
      }
    }
  }
  resumeReadAlong() {
    if (this.rights?.enableMediaOverlays && this.publication.hasMediaOverlays) {
      this.mediaOverlayModule.resumeReadAloud();
    }
  }

  totalResources(): number {
    return this.publication.readingOrder.length;
  }
  mostRecentNavigatedTocItem(): string {
    return this.publication.getRelativeHref(this.currentTOCRawLink);
  }
  currentResource(): number {
    let currentLocation = this.currentChapterLink.href;
    return this.publication.getSpineIndex(currentLocation);
  }
  currentLink(): Array<Link> {
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
    return [this.publication.getSpineItem(currentLocation)];
  }

  tableOfContents(): any {
    return this.publication.tableOfContents;
  }
  readingOrder(): any {
    return this.publication.readingOrder;
  }
  atStart(): boolean {
    return this.view.atStart();
  }
  atEnd(): boolean {
    return this.view.atEnd();
  }

  previousPage(): any {
    this.handlePreviousPageClick(null);
  }
  nextPage(): any {
    this.handleNextPageClick(null);
  }
  previousResource(): any {
    this.handlePreviousChapterClick(null);
  }
  nextResource(): any {
    this.handleNextChapterClick(null);
  }
  goTo(locator: Locator): any {
    let locations: Locations = locator.locations ?? { progression: 0 };
    if (locator.href.indexOf("#") !== -1) {
      const elementId = locator.href.slice(locator.href.indexOf("#") + 1);
      if (elementId !== null) {
        locations = {
          ...locations,
          fragment: elementId,
        };
      }
    }
    const position = { ...locator };
    position.locations = locations;

    const linkHref = this.publication.getAbsoluteHref(locator.href);
    if (IS_DEV) console.log(locator.href);
    if (IS_DEV) console.log(linkHref);
    position.href = linkHref;
    this.stopReadAloud();
    this.navigate(position);
  }
  currentLocator(): Locator {
    let position;
    if (
      ((this.rights?.autoGeneratePositions ?? false) &&
        this.publication.positions) ||
      this.publication.positions
    ) {
      let positions = this.publication.positionsByHref(
        this.publication.getRelativeHref(this.currentChapterLink.href)
      );
      let positionIndex = Math.ceil(
        this.view.getCurrentPosition() * (positions.length - 1)
      );
      position = positions[positionIndex];
    } else {
      var tocItem = this.publication.getTOCItem(this.currentChapterLink.href);
      if (this.currentTocUrl !== null) {
        tocItem = this.publication.getTOCItem(this.currentTocUrl);
      }
      if (tocItem === null) {
        tocItem = this.publication.getTOCItemAbsolute(
          this.currentChapterLink.href
        );
      }
      position = {
        href: tocItem.Href,
        type: this.currentChapterLink.type,
        title: this.currentChapterLink.title,
        locations: {},
      };
    }
    position.locations.progression = this.view.getCurrentPosition();
    position.displayInfo = {
      resourceScreenIndex: Math.round(this.view.getCurrentPage()),
      resourceScreenCount: Math.round(this.view.getPageCount()),
    };
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
  snapToElement(element: HTMLElement) {
    this.view.snap(element);
  }
  applyAttributes(attributes: IFrameAttributes) {
    this.attributes = attributes;
    this.view.attributes = attributes;
    this.handleResize();
  }

  private handlePreviousPageClick(
    event: MouseEvent | TouchEvent | KeyboardEvent
  ): void {
    this.stopReadAloud();
    if (this.view.layout === "fixed") {
      this.handlePreviousChapterClick(event);
    } else {
      if (this.view.atStart()) {
        this.handlePreviousChapterClick(event);
      } else {
        this.view.goToPreviousPage();
        this.updatePositionInfo();
        this.savePosition();
      }
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  private handleNextPageClick(event: MouseEvent | TouchEvent | KeyboardEvent) {
    let valid = true;
    if (this.sample?.isSampleRead && this.publication.positions) {
      const locator = this.currentLocator();
      let progress = Math.round(locator.locations.totalProgression * 100);
      valid = progress <= this.sample?.limit;
      if (this.view.layout === "fixed") {
        if (!valid && locator.locations.position <= this.sample?.minimum) {
          valid = true;
        }
      }
    }

    if (
      (valid && this.sample?.isSampleRead && this.publication.positions) ||
      !this.sample?.isSampleRead ||
      !this.publication.positions
    ) {
      this.stopReadAloud();
      if (this.view.layout === "fixed") {
        this.handleNextChapterClick(event);
      } else {
        if (this.view.atEnd()) {
          this.handleNextChapterClick(event);
        } else {
          this.view.goToNextPage();
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

  private handleClickThrough(_event: MouseEvent | TouchEvent) {
    if (this.mDropdowns) {
      this.mDropdowns.forEach((element) => {
        (element as any).close();
      });
    }
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
      if (elementId !== null) {
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
    if (
      (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
    ) {
      if (
        this.settings.columnCount !== 1 &&
        !window.matchMedia("screen and (max-width: 600px)").matches
      ) {
        if (this.iframes.length === 1) {
          var iframe = document.createElement("iframe");
          iframe.setAttribute("SCROLLING", "no");
          iframe.setAttribute("allowtransparency", "true");
          iframe.style.opacity = "1";
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
        if (this.iframes.length == 2) {
          this.iframes.pop();
          this.spreads.removeChild(this.spreads.lastChild);
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

    if (
      (this.publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
    ) {

      var index = this.publication.getSpineIndex(this.currentChapterLink.href);
      var wrapper = HTMLUtilities.findRequiredElement(
        this.mainElement,
        "main#iframe-wrapper"
      ) as HTMLElement;
      const minHeight =
        BrowserUtilities.getHeight() - 40 - this.attributes.margin;
      wrapper.style.height = minHeight + 40 + "px";

      var iframeParent =
        index === 0 && this.iframes.length == 2
          ? this.iframes[1].parentElement.parentElement
          : (this.iframes[0].parentElement.parentElement as HTMLElement);
      iframeParent.style.height = minHeight + 40 + "px";

      let height = getComputedStyle(
        index === 0 && this.iframes.length == 2
          ? this.iframes[1].contentDocument.body
          : this.iframes[0].contentDocument.body
      ).height;
      let width = getComputedStyle(
        index === 0 && this.iframes.length == 2
          ? this.iframes[1].contentDocument.body
          : this.iframes[0].contentDocument.body
      ).width;

      const head = HTMLUtilities.findRequiredIframeElement(
        index === 0 && this.iframes.length == 2
          ? this.iframes[1].contentDocument
          : this.iframes[0].contentDocument,
        "head"
      ) as HTMLHeadElement;
      if (head) {
        const viewport = HTMLUtilities.findElement(
          head,
          "meta[name=viewport]"
        ) as HTMLMetaElement;
        if (viewport) {
          var dimensionsStr = viewport.content;
          var obj = dimensionsStr.split(",").reduce((obj, s) => {
            var [key, value] = s.match(/[^\s;=]+/g);
            obj[key] = isNaN(Number(value)) ? value : +value;
            return obj;
          }, {});
          if (parseInt(obj["height"]) !== 0 || parseInt(obj["width"]) !== 0) {
            height = obj["height"] + "px";
            width = obj["width"] + "px";
          }
        }
      }

      var widthRatio =
        (parseInt(getComputedStyle(iframeParent).width) - 100) /
        (this.iframes.length == 2
          ? parseInt(width.replace("px", "")) * 2 + 200
          : parseInt(width.replace("px", "")));
      var heightRatio =
        (parseInt(getComputedStyle(iframeParent).height) - 100) /
        parseInt(height.replace("px", ""));
      var scale = Math.min(widthRatio, heightRatio);
      iframeParent.style.transform = "scale(" + scale + ")";

      for (const iframe of this.iframes) {
        iframe.style.height = height;
        iframe.style.width = width;
        iframe.parentElement.style.height = height;
      }
    }

    const selectedView = this.view;
    const oldPosition = selectedView.getCurrentPosition();

    await this.settings.applyProperties();

    // If the links are hidden, show them temporarily
    // to determine the top and bottom heights.

    const linksHidden = !IFrameNavigator.isDisplayed(this.links);

    if (linksHidden) {
      this.toggleDisplay(this.links);
    }

    if (this.infoTop) this.infoTop.style.height = 0 + "px";
    if (this.infoTop) this.infoTop.style.minHeight = 0 + "px";

    if (linksHidden) {
      this.toggleDisplay(this.links);
    }

    const linksBottomHidden = !IFrameNavigator.isDisplayed(this.linksBottom);
    if (linksBottomHidden) {
      this.toggleDisplay(this.linksBottom);
    }
    // TODO paginator page info
    // 0 = hide , 40 = show
    if (this.infoBottom)
      this.infoBottom.style.height = this.attributes.bottomInfoHeight
        ? this.attributes.bottomInfoHeight + "px"
        : 40 + "px";

    if (linksBottomHidden) {
      this.toggleDisplay(this.linksBottom);
    }

    if (this.view.layout !== "fixed") {
      this.settings.isPaginated().then((paginated) => {
        if (paginated) {
          this.view.height =
            BrowserUtilities.getHeight() - 40 - this.attributes.margin;
          if (this.infoBottom) this.infoBottom.style.removeProperty("display");
        } else {
          if (this.infoBottom) this.infoBottom.style.display = "none";
        }
      });
    }

    setTimeout(() => {
      if (this.view.layout !== "fixed") {
        if (this.view?.isScrollMode()) {
          for (const iframe of this.iframes) {
            this.view.setIframeHeight(iframe);
          }
        }
      }
    }, 100);
    setTimeout(async () => {
      selectedView.goToProgression(oldPosition);

      await this.updatePositionInfo(false);

      if (this.annotationModule !== undefined) {
        await this.annotationModule.handleResize();
      }
      if (this.bookmarkModule !== undefined) {
        await this.bookmarkModule.handleResize();
      }
      if (this.rights?.enableSearch) {
        await this.searchModule.handleResize();
      }
      if (this.pageBreakModule !== undefined) {
        await this.pageBreakModule.handleResize();
      }

      if (this.rights?.enableContentProtection) {
        if (this.contentProtectionModule !== undefined) {
          this.contentProtectionModule.handleResize();
        }
      }
    }, 100);
  }

  async updatePositionInfo(save: boolean = true) {
    if (this.view.layout === "fixed") {
      if (this.chapterPosition) this.chapterPosition.innerHTML = "";
      if (this.remainingPositions) this.remainingPositions.innerHTML = "";
    } else {
      if (this.view?.isPaginated()) {
        const locator = this.currentLocator();
        const currentPage = locator.displayInfo.resourceScreenIndex;
        const pageCount = locator.displayInfo.resourceScreenCount;
        if (this.chapterPosition) {
          this.chapterPosition.innerHTML =
            "Page " + currentPage + " of " + pageCount;
        }
      } else {
        if (this.chapterPosition) this.chapterPosition.innerHTML = "";
        if (this.remainingPositions) this.remainingPositions.innerHTML = "";
      }
    }
    if (save) {
      await this.savePosition();
    }
  }

  savePosition = debounce(async () => {
    if (this.annotator) {
      await this.saveCurrentReadingPosition();
    }
  }, 200);

  private handlePreviousChapterClick(
    event: MouseEvent | TouchEvent | KeyboardEvent
  ): void {
    if (this.view.layout === "fixed" && this.settings.columnCount !== 1) {
      var index = this.publication.getSpineIndex(this.currentChapterLink.href);
      index = index - 2;
      if (index < 0) index = 0;
      var previous = this.publication.readingOrder[index];
      const position: Locator = {
        href: this.publication.getAbsoluteHref(previous.Href),
        locations: {
          progression: 0,
        },
        type: previous.TypeLink,
        title: previous.Title,
      };

      this.stopReadAloud();
      this.navigate(position);
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
        this.navigate(position);
      }
    }
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleNextChapterClick(
    event: MouseEvent | TouchEvent | KeyboardEvent
  ): void {
    if (this.view.layout === "fixed" && this.settings.columnCount !== 1) {
      var index = this.publication.getSpineIndex(this.currentChapterLink.href);
      index = index + 2;
      if (index >= this.publication.readingOrder.length - 1)
        index = this.publication.readingOrder.length - 1;
      var next = this.publication.readingOrder[index];
      const position: Locator = {
        href: this.publication.getAbsoluteHref(next.Href),
        locations: {
          progression: 0,
        },
        type: next.TypeLink,
        title: next.Title,
      };

      this.stopReadAloud();
      this.navigate(position);
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
        this.navigate(position);
      }
    }
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private hideBookmarksOnEscape(event: KeyboardEvent) {
    const ESCAPE_KEY = 27;
    if (
      IFrameNavigator.isDisplayed(this.bookmarksView) &&
      event.keyCode === ESCAPE_KEY
    ) {
      this.hideModal(this.bookmarksView, this.bookmarksControl);
    }
  }

  private hideView(_view: HTMLDivElement, _control: HTMLButtonElement): void {
    if (this.view.layout !== "fixed") {
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

  async navigate(locator: Locator): Promise<void> {
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
          this.currentTocUrl = null;
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
            this.view.goToElement(element);
          }
          this.newElementId = null;
        } else {
          if ((locator as Annotation).highlight) {
            this.view.goToCssSelector(
              (locator as Annotation).highlight.selectionInfo.rangeInfo
                .startContainerElementCssSelector
            );
          } else {
            this.view.goToProgression(locator.locations.progression);
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

        if (this.currentTocUrl !== null) {
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
        if (spineItem !== null) {
          this.currentChapterLink.title = spineItem.Title;
          this.currentChapterLink.type = spineItem.TypeLink;
        }
        let tocItem = this.publication.getTOCItem(currentLocation);
        if (this.currentTocUrl !== null) {
          tocItem = this.publication.getTOCItem(this.currentTocUrl);
        }
        if (
          !this.currentChapterLink.title &&
          tocItem !== null &&
          tocItem.Title
        ) {
          this.currentChapterLink.title = tocItem.Title;
        }
        if (
          !this.currentChapterLink.type &&
          tocItem !== null &&
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
        if (this.searchModule !== undefined) {
          this.searchModule.clearSearch();
        }
        if (locator.locations.fragment === undefined) {
          this.currentTocUrl = null;
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
          this.rights?.enableContentProtection &&
          this.contentProtectionModule !== undefined
        ) {
          await this.contentProtectionModule.initializeResource();
        }

        if (
          this.rights?.enableMediaOverlays &&
          this.mediaOverlayModule !== undefined
        ) {
          await this.mediaOverlayModule.initializeResource(this.currentLink());
        }
        if (
          this.rights?.enableContentProtection &&
          this.contentProtectionModule !== undefined
        ) {
          this.contentProtectionModule.recalculate(300);
        }

        if (this.pageBreakModule !== undefined) {
          await this.highlighter.destroyHighlights(HighlightType.PageBreak);
          await this.pageBreakModule.drawPageBreaks();
        }

        if (this.annotationModule !== undefined) {
          await this.annotationModule.drawHighlights();
          await this.annotationModule.showHighlights();
        }
        if (this.bookmarkModule !== undefined) {
          await this.bookmarkModule.drawBookmarks();
          await this.bookmarkModule.showBookmarks();
        }
        if (
          this.rights?.enableSearch &&
          this.searchModule !== undefined &&
          this.highlighter !== undefined
        ) {
          await this.highlighter.destroyHighlights(HighlightType.Search);
          this.searchModule.drawSearch();
          this.searchModule.drawPopup();
        }

        if (this.view.layout === "fixed") {
          if (this.nextChapterBottomAnchorElement)
            this.nextChapterBottomAnchorElement.style.display = "none";
          if (this.previousChapterTopAnchorElement)
            this.previousChapterTopAnchorElement.style.display = "none";
          if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
        } else {
          this.settings.isPaginated().then((paginated) => {
            if (!paginated) {
              if (this.view.atStart() && this.view.atEnd()) {
                if (this.nextChapterBottomAnchorElement)
                  this.nextChapterBottomAnchorElement.style.display = "unset";
                if (this.previousChapterTopAnchorElement)
                  this.previousChapterTopAnchorElement.style.display = "unset";
              } else if (this.view.atEnd()) {
                if (this.previousChapterTopAnchorElement)
                  this.previousChapterTopAnchorElement.style.display = "none";
                if (this.nextChapterBottomAnchorElement)
                  this.nextChapterBottomAnchorElement.style.display = "unset";
              } else if (this.view.atStart()) {
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
      let startUrl: string | null = null;
      if (startLink && startLink.Href) {
        startUrl = this.publication.getAbsoluteHref(startLink.Href);
      }
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

  checkResourcePosition = debounce(() => {
    if (this.view.atStart() && this.view.atEnd()) {
      if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
    } else if (this.view.atEnd()) {
      if (this.api?.resourceAtEnd) this.api?.resourceAtEnd();
    } else if (this.view.atStart()) {
      if (this.api?.resourceAtStart) this.api?.resourceAtStart();
    }
  }, 200);

  private showIframeContents() {
    this.isBeingStyled = false;
    // We set a timeOut so that settings can be applied when opacity is still 0
    setTimeout(() => {
      if (!this.isBeingStyled) {
        this.iframes.forEach((iframe) => {
          iframe.style.opacity = "1";
        });
      }
    }, 150);
  }

  private showLoadingMessageAfterDelay() {
    this.isLoading = true;
    if (this.isLoading && this.loadingMessage) {
      this.loadingMessage.style.display = "block";
      this.loadingMessage.classList.add("is-loading");
    }
  }

  private hideIframeContents() {
    this.isBeingStyled = true;
    this.iframes.forEach((iframe) => {
      iframe.style.opacity = "0";
    });
  }

  private hideLoadingMessage() {
    setTimeout(() => {
      this.isLoading = false;
      if (this.loadingMessage) {
        this.loadingMessage.style.display = "none";
        this.loadingMessage.classList.remove("is-loading");
      }
      if (this.view.layout !== "fixed") {
        if (this.view.atStart() && this.view.atEnd()) {
          if (this.api?.resourceFitsScreen) this.api?.resourceFitsScreen();
        } else if (this.view.atEnd()) {
          if (this.api?.resourceAtEnd) this.api?.resourceAtEnd();
        } else if (this.view.atStart()) {
          if (this.api?.resourceAtStart) this.api?.resourceAtStart();
        }
      }
      if (this.api?.resourceReady) this.api?.resourceReady();
    }, 150);
  }

  private async saveCurrentReadingPosition(): Promise<void> {
    if (this.annotator) {
      var tocItem = this.publication.getTOCItem(this.currentChapterLink.href);
      if (this.currentTocUrl !== null) {
        tocItem = this.publication.getTOCItem(this.currentTocUrl);
      }
      if (tocItem === null) {
        tocItem = this.publication.getTOCItemAbsolute(
          this.currentChapterLink.href
        );
      }
      let locations: Locations = {
        progression: this.view.getCurrentPosition(),
      };
      if (tocItem.Href.indexOf("#") !== -1) {
        const elementId = tocItem.Href.slice(tocItem.Href.indexOf("#") + 1);
        if (elementId !== null) {
          locations = {
            progression: this.view.getCurrentPosition(),
            fragment: elementId,
          };
        }
      }

      let position: ReadingPosition;
      if (
        ((this.rights?.autoGeneratePositions ?? false) &&
          this.publication.positions) ||
        this.publication.positions
      ) {
        const positions = this.publication.positionsByHref(
          this.publication.getRelativeHref(tocItem.Href)
        );
        const positionIndex = Math.ceil(
          locations.progression * (positions.length - 1)
        );
        const locator = positions[positionIndex];
        locator.locations.fragment = locations.fragment;

        position = {
          ...locator,
          href: tocItem.Href,
          created: new Date(),
          title: this.currentChapterLink.title,
        };
      } else {
        position = {
          href: tocItem.Href,
          locations: locations,
          created: new Date(),
          type: this.currentChapterLink.type,
          title: this.currentChapterLink.title,
        };
      }

      if (this.sample?.isSampleRead && this.publication.positions) {
        this.sampleReadEventHandler?.enforceSampleRead(position);
      }

      if (this.api?.updateCurrentLocation) {
        this.api?.updateCurrentLocation(position).then(async (_) => {
          if (IS_DEV) {
            console.log("api updated current location", position);
          }
          return this.annotator.saveLastReadingPosition(position);
        });
      } else {
        if (IS_DEV) {
          console.log("save last reading position", position);
        }
        return this.annotator.saveLastReadingPosition(position);
      }
    } else {
      return new Promise<void>((resolve) => resolve());
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

  activateMarker(id) {
    this.annotationModule.activeAnnotationMarkerId = id;
    this.highlighter.activeAnnotationMarkerId = id;
  }

  deactivateMarker() {
    this.annotationModule.activeAnnotationMarkerId = undefined;
    this.highlighter.activeAnnotationMarkerId = undefined;
  }
}
