/*
 * Copyright 2018-2021 DITA (AM Consulting LLC)
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
 * Developed on behalf of: NYPL, Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: NYPL, Bokbasen AS and CAST under one or more contributor license agreements.
 */
import { Annotation, Bookmark, Locator } from "./model/Locator";
import { Publication } from "./model/Publication";
import { UserSettingsIncrementable } from "./model/user-settings/UserProperties";
import { UserSettings } from "./model/user-settings/UserSettings";
import { AnnotationModule } from "./modules/AnnotationModule";
import { BookmarkModule } from "./modules/BookmarkModule";
import { TextHighlighter } from "./modules/highlight/TextHighlighter";
import { MediaOverlayModule } from "./modules/mediaoverlays/MediaOverlayModule";
import {
  MediaOverlaySettings,
  IMediaOverlayUserSettings,
  MediaOverlayIncrementable,
} from "./modules/mediaoverlays/MediaOverlaySettings";
import { TimelineModule } from "./modules/positions/TimelineModule";
import { ContentProtectionModule } from "./modules/protection/ContentProtectionModule";
import { SearchModule } from "./modules/search/SearchModule";
import {
  ITTSUserSettings,
  TTSIncrementable,
  TTSSettings,
} from "./modules/TTS/TTSSettings";
import {
  EpubNavigator,
  IFrameAttributes,
  ReaderConfig,
  ReaderRights,
} from "./navigator/EpubNavigator";
import LocalAnnotator from "./store/LocalAnnotator";
import LocalStorageStore from "./store/LocalStorageStore";
import { findElement, findRequiredElement } from "./utils/HTMLUtilities";
import { toPlainObject } from "./model/Link";
import { LayerSettings } from "./modules/highlight/LayerSettings";
import { PageBreakModule } from "./modules/pagebreak/PageBreakModule";
import { TTSModule2 } from "./modules/TTS/TTSModule2";
import { DefinitionsModule } from "./modules/search/DefinitionsModule";
import LineFocusModule from "./modules/linefocus/LineFocusModule";
import { HistoryModule } from "./modules/history/HistoryModule";
import CitationModule from "./modules/citation/CitationModule";
import type { PDFNavigator } from "./navigator/PDFNavigator";
import { VisualNavigator, NavigatorFeature } from "./navigator/VisualNavigator";
import { ConsumptionModule } from "./modules/consumption/ConsumptionModule";

/**
 * Dynamically import PDFNavigator to avoid loading pdfjs-dist in SSR/Node.
 * pdfjs-dist references browser-only APIs (DOMMatrix, canvas) at import time.
 */
let _PDFNavigatorClass:
  | (typeof import("./navigator/PDFNavigator"))["PDFNavigator"]
  | undefined;
async function loadPDFNavigator() {
  if (!_PDFNavigatorClass) {
    const mod = await import("./navigator/PDFNavigator");
    _PDFNavigatorClass = mod.PDFNavigator;
  }
  return _PDFNavigatorClass;
}
function isPDFNavigator(nav: any): nav is PDFNavigator {
  return nav?.isPDF === true;
}

/**
 * A class that, once instantiated using the public `.build` method,
 * is the primary interface into the D2 Reader.
 * @TODO :
 *  - Type all function arguments
 *  - DEV logger
 *  - Default config
 *  - Different types for initial config and final config
 *  - Testing
 */
export default class D2Reader {
  private constructor(
    private readonly settings: UserSettings,
    private readonly navigator: VisualNavigator,
    private readonly highlighter?: TextHighlighter,
    private readonly ttsSettings?: TTSSettings,
    private readonly mediaOverlaySettings?: MediaOverlaySettings
  ) {}

  // ── Concrete EPUB module accessors ──────────────────────────
  // Reader methods below that are EPUB-specific (using methods not on
  // the shared I* interfaces) go through these typed getters which cast
  // from the interface to the concrete EPUB class. When the navigator
  // is PDF, these return the PDF concrete class instead — but callers
  // of the EPUB-specific methods should only be invoked in EPUB contexts
  // (either the navigator is EPUB, or the method no-ops via optional chaining).
  private get epubBookmarkModule(): BookmarkModule | undefined {
    return this.navigator.modules.bookmarks as BookmarkModule | undefined;
  }
  private get epubAnnotationModule(): AnnotationModule | undefined {
    return this.navigator.modules.annotations as AnnotationModule | undefined;
  }
  private get epubSearchModule(): SearchModule | undefined {
    return this.navigator.modules.search as SearchModule | undefined;
  }

  addEventListener(event: string, handler: (...args: any[]) => void) {
    this.navigator.addListener(event, handler);
  }

  /**
   * The async builder.
   */
  static async load(initialConfig: ReaderConfig): Promise<D2Reader> {
    let rights: Partial<ReaderRights> = initialConfig.rights ?? {
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

    // Enforces supported browsers
    if (rights.enableContentProtection && initialConfig.protection) {
      await ContentProtectionModule.setupPreloadProtection(
        initialConfig.protection
      );
    }

    const mainElement = findRequiredElement(document, "#D2Reader-Container");
    // are the following elements necessary or not? They seem not to be,
    // but we will have to change some types if they are allowed to be null
    const headerMenu = findElement(document, "#headerMenu");
    const footerMenu = findElement(document, "#footerMenu");

    let webPubManifestUrl = initialConfig.url;
    let publication;
    if (initialConfig.publication) {
      const pubInput = initialConfig.publication;
      if (pubInput instanceof Publication) {
        publication = pubInput;
      } else {
        publication = Publication.fromJSON(pubInput, webPubManifestUrl);
      }
    }
    if (!publication) {
      publication = await Publication.fromUrl(
        webPubManifestUrl,
        initialConfig.requestConfig
      );
    }

    const store = new LocalStorageStore({
      prefix: publication.manifestUrl,
      useLocalStorage: initialConfig.useLocalStorage ?? false,
      useStorageType: initialConfig.useStorageType,
    });

    const settingsStore = new LocalStorageStore({
      prefix: "r2d2bc-reader",
      useLocalStorage: initialConfig.useLocalStorage ?? false,
      useStorageType: initialConfig.useStorageType,
    });
    const layerStore = new LocalStorageStore({
      prefix: "r2d2bc-layers",
      useLocalStorage: initialConfig.useLocalStorage ?? false,
      useStorageType: initialConfig.useStorageType,
    });

    const annotator = new LocalAnnotator({ store: store });

    publication.sample = initialConfig.sample;

    // update our config based on what we know from the publication
    rights = updateConfig(rights, publication);

    if (
      publication.metadata?.conformsTo &&
      publication.metadata?.conformsTo.includes(
        "https://readium.org/webpub-manifest/profiles/pdf"
      )
    ) {
      const settings = await UserSettings.create({
        store: settingsStore,
        initialUserSettings: initialConfig.userSettings,
        layout: "",
      });
      const PDFNav = await loadPDFNavigator();

      // Built-in PDF modules. The navigator registers them during
      // construction (host-type validated). Custom user modules from
      // initialConfig.modules are concatenated after.
      const { PdfBookmarkModule } =
        await import("./modules/pdf/PdfBookmarkModule");
      const { PdfSearchModule } = await import("./modules/pdf/PdfSearchModule");
      const { PdfAnnotationModule } =
        await import("./modules/pdf/PdfAnnotationModule");
      const { PdfHistoryModule } =
        await import("./modules/pdf/PdfHistoryModule");
      const { PdfViewSettingsModule } =
        await import("./modules/pdf/PdfViewSettingsModule");

      const pdfBuiltIns = [
        new PdfBookmarkModule(),
        new PdfSearchModule(),
        new PdfAnnotationModule(),
        new PdfHistoryModule(),
        new PdfViewSettingsModule(),
      ];

      const navigator = await PDFNav.create({
        mainElement: mainElement,
        publication: publication,
        settings: settings,
        api: initialConfig.api,
        rights: rights,
        workerSrc: initialConfig.workerSrc,
        annotator: annotator,
        initialLastReadingPosition: initialConfig.lastReadingPosition,
        store: store,
        modules: [...pdfBuiltIns, ...(initialConfig.modules ?? [])],
      });

      // setupAll() is called inside PDFNavigator.start() — before the
      // document loads, so modules' event subscriptions are in place for
      // the initial pagesloaded / annotationeditorlayerrendered events.

      // Content protection for PDF via @d-i-t-a/web-content-protection
      if (rights.enableContentProtection && initialConfig.webProtection) {
        const { ContentProtection } =
          await import("@d-i-t-a/web-content-protection");
        const protection = new ContentProtection(initialConfig.webProtection);
        await protection.activate();
      }

      return new D2Reader(settings, navigator);
    } else {
      /**
       * Set up publication positions and weights by either auto
       * generating them or fetching them from provided services.
       */
      if (rights.autoGeneratePositions) {
        await publication.autoGeneratePositions(initialConfig.requestConfig);
      } else {
        if (initialConfig.services?.positions) {
          await publication.fetchPositionsFromService(
            initialConfig.services?.positions.href,
            initialConfig.requestConfig
          );
        }
        if (initialConfig.services?.weight) {
          await publication.fetchWeightsFromService(
            initialConfig.services?.weight.href,
            initialConfig.requestConfig
          );
        }
      }

      const layers = await LayerSettings.create({ store: layerStore });

      // Settings
      const settings = await UserSettings.create({
        store: settingsStore,
        initialUserSettings: initialConfig.userSettings,
        headerMenu: headerMenu,
        api: initialConfig.api,
        injectables: publication.isFixedLayout
          ? initialConfig.injectablesFixed
          : initialConfig.injectables,
        layout: publication.isFixedLayout ? "fixed" : "reflowable",
      });

      // Highlighter
      const highlighter = await TextHighlighter.create({
        layerSettings: layers,
        ...initialConfig.highlighter,
      });

      // Bookmark Module
      const bookmarkModule = rights.enableBookmarks
        ? await BookmarkModule.create({
            annotator: annotator,
            headerMenu: headerMenu,
            publication: publication,
            initialAnnotations: initialConfig.initialAnnotations,
            ...initialConfig.bookmarks,
          })
        : undefined;

      // Annotation Module
      const annotationModule = rights.enableAnnotations
        ? await AnnotationModule.create({
            annotator: annotator,
            publication: publication,
            initialAnnotations: initialConfig.initialAnnotations,
            highlighter: highlighter,
            headerMenu: headerMenu,
            ...initialConfig.annotations,
          })
        : undefined;

      // TTS Module
      const ttsEnabled = rights.enableTTS;
      const ttsSettings = ttsEnabled
        ? await TTSSettings.create({
            store: settingsStore,
            initialTTSSettings: initialConfig.tts,
            headerMenu: headerMenu,
          })
        : undefined;

      let ttsModule: TTSModule2 | undefined = undefined;

      if (ttsEnabled && ttsSettings) {
        ttsModule = await TTSModule2.create({
          tts: ttsSettings,
          headerMenu: headerMenu,
          highlighter: highlighter,
          ...initialConfig.tts,
        });
      }

      // Search Module
      const searchModule = rights.enableSearch
        ? await SearchModule.create({
            headerMenu: headerMenu,
            publication: publication,
            highlighter: highlighter,
            ...initialConfig.search,
          })
        : undefined;

      const definitionsModule = rights.enableDefinitions
        ? await DefinitionsModule.create({
            publication: publication,
            highlighter: highlighter,
            ...initialConfig.define,
          })
        : undefined;

      // Timeline Module
      const timelineModule = rights.enableTimeline
        ? await TimelineModule.create({
            publication: publication,
          })
        : undefined;

      // Content Protection Module
      const contentProtectionModule = rights.enableContentProtection
        ? await ContentProtectionModule.create({
            ...initialConfig.protection,
          })
        : undefined;

      const citationModule = rights.enableCitations
        ? await CitationModule.create({
            publication: publication,
            highlighter: highlighter,
            ...initialConfig.citations,
          })
        : undefined;

      const enableMediaOverlays = rights.enableMediaOverlays;
      const mediaOverlaySettings = enableMediaOverlays
        ? await MediaOverlaySettings.create({
            store: settingsStore,
            initialMediaOverlaySettings: initialConfig.mediaOverlays,
            headerMenu: headerMenu,
            ...initialConfig.mediaOverlays,
          })
        : undefined;

      const mediaOverlayModule = enableMediaOverlays
        ? await MediaOverlayModule.create({
            publication: publication,
            settings: mediaOverlaySettings,
            ...initialConfig.mediaOverlays,
          })
        : undefined;

      const enablePageBreaks = rights.enablePageBreaks;
      const pageBreakModule =
        enablePageBreaks && publication.isReflowable
          ? await PageBreakModule.create({
              publication: publication,
              headerMenu: headerMenu,
              ...initialConfig.pagebreak,
            })
          : undefined;

      const lineFocusModule = rights.enableLineFocus
        ? await LineFocusModule.create({
            publication: publication,
            highlighter: highlighter,
            ...initialConfig.lineFocus,
          })
        : undefined;

      const historyModule = rights.enableHistory
        ? await HistoryModule.create({
            annotator: annotator,
            publication: publication,
            headerMenu: headerMenu,
          })
        : undefined;

      const consumptionModule = rights.enableConsumption
        ? await ConsumptionModule.create({
            publication: publication,
            ...initialConfig.consumption,
          })
        : undefined;

      // Navigator
      const navigator = await EpubNavigator.create({
        mainElement: mainElement,
        headerMenu: headerMenu,
        footerMenu: footerMenu,
        publication: publication,
        settings,
        annotator: annotator,
        initialLastReadingPosition: initialConfig.lastReadingPosition,
        api: initialConfig.api,
        rights: rights,
        tts: initialConfig.tts,
        sample: initialConfig.sample,
        requestConfig: initialConfig.requestConfig,
        injectables: publication.isFixedLayout
          ? (initialConfig.injectablesFixed ?? [])
          : initialConfig.injectables,
        attributes: initialConfig.attributes,
        services: initialConfig.services,
        highlighter,
        modules: [
          bookmarkModule,
          annotationModule,
          ttsModule,
          searchModule,
          definitionsModule,
          timelineModule,
          contentProtectionModule,
          citationModule,
          mediaOverlayModule,
          pageBreakModule,
          lineFocusModule,
          historyModule,
          consumptionModule,
          ...(initialConfig.modules ?? []),
        ],
      });

      return new D2Reader(
        settings,
        navigator,
        highlighter,
        ttsSettings,
        mediaOverlaySettings
      );
    }
  }

  /**
   * Read Aloud
   */

  /** Start TTS Read Aloud */
  startReadAloud = () => {
    this.navigator.startReadAloud();
  };
  /** Stop TTS Read Aloud */
  stopReadAloud = () => {
    this.navigator.stopReadAloud();
  };
  /** Pause TTS Read Aloud */
  pauseReadAloud = () => {
    this.navigator.pauseReadAloud();
  };
  /** Resume TTS Read Aloud */
  resumeReadAloud = () => {
    this.navigator.resumeReadAloud();
  };

  /**
   * Read Along
   */

  /** Start Media Overlay Read Along */
  startReadAlong = () => {
    this.navigator.startReadAlong();
  };
  /** Stop Media Overlay Read Along */
  stopReadAlong = () => {
    this.navigator.stopReadAlong();
  };
  /** Pause Media Overlay Read Along */
  pauseReadAlong = () => {
    this.navigator.pauseReadAlong();
  };
  /** Resume Media Overlay Read Along */
  resumeReadAlong = () => {
    this.navigator.resumeReadAlong();
  };
  get hasMediaOverlays() {
    return this.navigator.publication.hasMediaOverlays ?? false;
  }

  /**
   * Bookmarks and annotations
   */

  /** Save bookmark for the current position. Works for both EPUB and PDF. */
  saveBookmark = async () => {
    return (await this.navigator.modules.bookmarks?.save()) ?? false;
  };
  /** Save bookmark by annotation (EPUB-only) */
  saveBookmarkPlus = async () => {
    return this.epubBookmarkModule?.saveBookmarkPlus();
  };
  /** Delete bookmark. Works for both EPUB and PDF. */
  deleteBookmark = async (bookmark: Bookmark) => {
    return (await this.navigator.modules.bookmarks?.delete(bookmark)) ?? false;
  };
  /** Delete annotation */
  deleteAnnotation = async (highlight: Annotation) => {
    return (
      (await this.epubAnnotationModule?.deleteAnnotation(highlight)) ?? false
    );
  };
  /** Add annotation */
  addAnnotation = async (highlight: Annotation) => {
    return (await this.epubAnnotationModule?.addAnnotation(highlight)) ?? false;
  };
  /**
   * Update annotation
   *
   * This should be used only when the add/delete of the annotation note
   * is not directly handled in the `addAnnotation`/`addCommentToAnnotation`
   * callback defined in the configuration of the D2Reader.load() method
   *  */
  updateAnnotation = async (highlight: Annotation) => {
    return (
      (await this.epubAnnotationModule?.updateAnnotation(highlight)) ?? false
    );
  };

  /** Change highlighter color to a specific HEX string */
  changeHighlighterColor = (color: string) => {
    this.highlighter?.setColor(color);
  };

  /** Hide Annotation Layer */
  hideAnnotationLayer = () => {
    return this.epubAnnotationModule?.hideAnnotationLayer();
  };
  /** Show Annotation Layer */
  showAnnotationLayer = () => {
    return this.epubAnnotationModule?.showAnnotationLayer();
  };

  /** Hide  Layer */
  hideLayer = (layer) => {
    this.navigator.hideLayer(layer);
  };
  /** Show  Layer */
  showLayer = (layer) => {
    this.navigator.showLayer(layer);
  };

  /** Activate Marker <br>
   * Activated Marker will be used for active annotation creation */
  activateMarker = (id: string, position: string) => {
    this.navigator.activateMarker(id, position);
  };
  /** Deactivate Marker */
  deactivateMarker = () => {
    this.navigator.deactivateMarker();
  };

  /**
   * Definitions
   */

  /** Clear current definitions */
  clearDefinitions = async () => {
    await this.navigator.modules.definitions?.clearDefinitions();
  };
  /** Add newt definition */
  addDefinition = async (definition) => {
    await this.navigator.modules.definitions?.addDefinition(definition);
  };

  /** Table of Contents */
  get tableOfContents() {
    return toPlainObject(this.navigator.tableOfContents()) ?? [];
  }
  /** Landmarks */
  get landmarks() {
    return toPlainObject(this.navigator.landmarks()) ?? [];
  }
  /** Page List */
  get pageList() {
    return toPlainObject(this.navigator.pageList()) ?? [];
  }
  /** Reading Order or Spine */
  get readingOrder() {
    return toPlainObject(this.navigator.readingOrder()) ?? [];
  }
  /** Current Bookmarks. Works for both EPUB and PDF. */
  get bookmarks() {
    return this.navigator.modules.bookmarks?.list() ?? [];
  }
  /** Current Annotations. Works for both EPUB and PDF. */
  get annotations() {
    return this.navigator.modules.annotations?.getAll() ?? [];
  }

  get publicationLayout() {
    return this.navigator.publication.layout;
  }

  /** History Back. Works for both EPUB and PDF. */
  historyBack = async () => {
    return this.navigator.modules.history?.back();
  };
  /** History Forward. Works for both EPUB and PDF. */
  historyForward = async () => {
    return this.navigator.modules.history?.forward();
  };
  /** Can go back in history. Works for both EPUB and PDF. */
  get canGoBack() {
    return this.navigator.modules.history?.canGoBack() ?? false;
  }
  /** Can go forward in history. Works for both EPUB and PDF. */
  get canGoForward() {
    return this.navigator.modules.history?.canGoForward() ?? false;
  }

  /**
   * Search
   */
  /** Search by term and current resource or entire book <br>
   * current = true, will search only current resource <br>
   * current = false, will search entire publication */
  search = async (term: string, current: boolean) => {
    return (await this.epubSearchModule?.search(term, current)) ?? [];
  };
  goToSearchIndex = async (href: string, index: number, current: boolean) => {
    if (this.navigator.supports(NavigatorFeature.Search)) {
      await this.epubSearchModule?.goToSearchIndex(href, index, current);
    }
  };
  goToSearchID = async (href: string, index: number, current: boolean) => {
    if (this.navigator.supports(NavigatorFeature.Search)) {
      await this.epubSearchModule?.goToSearchID(href, index, current);
    }
  };
  clearSearch = async () => {
    if (this.navigator.supports(NavigatorFeature.Search)) {
      await this.epubSearchModule?.clearSearch();
    }
  };

  /**
   * Resources
   */
  get currentResource() {
    return this.navigator.currentResource();
  }
  get mostRecentNavigatedTocItem() {
    return this.navigator.mostRecentNavigatedTocItem?.() ?? undefined;
  }
  get totalResources() {
    return this.navigator.totalResources();
  }
  get publicationLanguage() {
    return this.navigator.publication.metadata?.languages;
  }

  /**
   * Settings
   */
  get currentSettings() {
    return this.settings.currentSettings;
  }
  resetUserSettings = async () => {
    return await this.settings.resetUserSettings();
  };
  applyUserSettings = async (userSettings: Partial<UserSettings>) => {
    return await this.settings.applyUserSettings(userSettings);
  };
  scroll = async (value: boolean, direction?: string) => {
    if (isPDFNavigator(this.navigator)) {
      return this.navigator.scroll(value, direction);
    }
    return await this.settings.scroll(value);
  };

  private isTTSIncrementable(
    incremental:
      | UserSettingsIncrementable
      | TTSIncrementable
      | MediaOverlayIncrementable
  ): incremental is TTSIncrementable {
    return (
      incremental === "pitch" ||
      incremental === "rate" ||
      incremental === "volume"
    );
  }
  private isMOIncrementable(
    incremental:
      | UserSettingsIncrementable
      | TTSIncrementable
      | MediaOverlayIncrementable
  ): incremental is MediaOverlayIncrementable {
    return incremental === "mo_rate" || incremental === "mo_volume";
  }

  /**
   * Used to increase anything that can be increased,
   * such as pitch, rate, volume, fontSize
   */
  increase = async (
    incremental:
      | UserSettingsIncrementable
      | TTSIncrementable
      | MediaOverlayIncrementable
  ) => {
    if (this.isTTSIncrementable(incremental)) {
      if (this.navigator.supports(NavigatorFeature.TTS)) {
        await this.ttsSettings?.increase(incremental);
      }
    } else if (this.isMOIncrementable(incremental)) {
      if (this.navigator.supports(NavigatorFeature.MediaOverlays)) {
        await this.mediaOverlaySettings?.increase(incremental);
      }
    } else {
      await this.settings.increase(incremental);
    }
  };

  /**
   * Used to decrease anything that can be decreased,
   * such as pitch, rate, volume, fontSize
   */
  decrease = async (
    incremental:
      | UserSettingsIncrementable
      | TTSIncrementable
      | MediaOverlayIncrementable
  ) => {
    if (this.isTTSIncrementable(incremental)) {
      if (this.navigator.supports(NavigatorFeature.TTS)) {
        await this.ttsSettings?.decrease(incremental);
      }
    } else if (this.isMOIncrementable(incremental)) {
      if (this.navigator.supports(NavigatorFeature.MediaOverlays)) {
        await this.mediaOverlaySettings?.decrease(incremental);
      }
    } else {
      await this.settings.decrease(incremental);
    }
  };

  /**
   * Publisher?
   * Disabled
   */
  // publisher = (on) => {
  //   this.settings.publisher(on);
  // };

  /**
   * TTS Settings
   */
  resetTTSSettings = () => {
    if (this.navigator.supports(NavigatorFeature.TTS)) {
      this.ttsSettings?.resetTTSSettings();
    }
  };
  applyTTSSettings = async (ttsSettings: Partial<ITTSUserSettings>) => {
    if (this.navigator.supports(NavigatorFeature.TTS)) {
      await this.ttsSettings?.applyTTSSettings(ttsSettings);
    }
  };
  /**
   * Disabled
   */
  // applyTTSSetting = (key: string, value: any) => {
  //   if (this.navigator.rights.enableTTS) {
  //     this.ttsSettings.applyTTSSetting(key, value);
  //   }
  // };
  applyPreferredVoice = async (value: string) => {
    if (this.navigator.supports(NavigatorFeature.TTS)) {
      await this.ttsSettings?.applyPreferredVoice(value);
    }
  };

  /**
   * Media Overlay Settings
   */
  resetMediaOverlaySettings = async () => {
    if (this.navigator.supports(NavigatorFeature.MediaOverlays)) {
      await this.mediaOverlaySettings?.resetMediaOverlaySettings();
    }
  };
  applyMediaOverlaySettings = async (
    settings: Partial<IMediaOverlayUserSettings>
  ) => {
    if (this.navigator.supports(NavigatorFeature.MediaOverlays)) {
      await this.mediaOverlaySettings?.applyMediaOverlaySettings(settings);
    }
  };

  /**
   * Navigation
   * @TODO : These should return promises that complete when they are done.
   */
  get currentLocator() {
    return this.navigator.currentLocator();
  }
  get positions() {
    return this.navigator.positions();
  }
  goTo = async (locator: Locator) => {
    this.navigator.goTo(locator);
  };
  goToPosition = async (value: number) => {
    return this.navigator.goToPosition(value);
  };
  goToPage = async (page: number) => {
    await this.navigator.goToPage(page);
  };
  fitToPage = () => {
    this.navigator.fitToPage();
  };
  fitToWidth = () => {
    this.navigator.fitToWidth();
  };
  zoomIn = () => {
    this.navigator.zoomIn();
  };
  zoomOut = () => {
    this.navigator.zoomOut();
  };
  activateHand = () => {
    this.navigator.activateHand();
  };
  deactivateHand = () => {
    this.navigator.deactivateHand();
  };
  copyToClipboard = (text) => {
    this.navigator.modules.contentProtection?.copyToClipboard(text);
  };
  nextResource = () => {
    this.navigator.nextResource();
  };
  previousResource = () => {
    this.navigator.previousResource();
  };
  nextPage = async () => {
    this.navigator.nextPage();
  };
  previousPage = async () => {
    this.navigator.previousPage();
  };
  get atStart() {
    return this.navigator.atStart();
  }
  get atEnd() {
    return this.navigator.atEnd();
  }
  snapToSelector = async (selector) => {
    this.navigator.snapToSelector?.(selector);
  };
  /**
   * You have attributes in the reader when you initialize it. You can set margin, navigationHeight etc...
   * This is in case you change the attributes after initializing the reader.
   */
  applyAttributes = (value: IFrameAttributes) => {
    this.navigator.applyAttributes?.(value);
  };

  async applyLineFocusSettings(userSettings) {
    if (userSettings.lines) {
      if (this.navigator.modules.lineFocus) {
        const lines = this.navigator.modules.lineFocus.properties.lines ?? 1;
        this.navigator.modules.lineFocus.index =
          (this.navigator.modules.lineFocus.index * lines) /
          parseInt(userSettings.lines);
        this.navigator.modules.lineFocus.index = Math.abs(
          parseInt(this.navigator.modules.lineFocus.index.toFixed())
        );
        this.navigator.modules.lineFocus.properties.lines = parseInt(
          userSettings.lines
        );
        if (this.navigator.modules.lineFocus.isActive) {
          await this.navigator.modules.lineFocus.enableLineFocus();
        }
      }
    }
    if (userSettings.debug !== undefined) {
      if (this.navigator.modules.lineFocus) {
        this.navigator.modules.lineFocus.isDebug = userSettings.debug;
        if (this.navigator.modules.lineFocus.isActive) {
          await this.navigator.modules.lineFocus.enableLineFocus();
        }
      }
    }
  }
  lineUp() {
    this.navigator.modules.lineFocus?.lineUp();
  }
  lineDown() {
    this.navigator.modules.lineFocus?.lineDown();
  }
  async enableLineFocus() {
    await this.navigator.modules.lineFocus?.enableLineFocus();
  }
  async lineFocus(active: boolean) {
    if (active) {
      await this.navigator.modules.lineFocus?.enableLineFocus();
    } else {
      this.navigator.modules.lineFocus?.disableLineFocus();
    }
  }
  disableLineFocus() {
    this.navigator.modules.lineFocus?.disableLineFocus();
  }

  /**
   * Destructor:
   * Only used in react applications because when they re-visit the page
   * it tried to create a new reader, which interfered with the first one.
   */
  stop = () => {
    document.body.onscroll = () => {};
    this.navigator.stop(); // calls registry.stopAll() for all modules
    this.settings.stop();
    this.ttsSettings?.stop();
    this.mediaOverlaySettings?.stop();
  };
}

function updateConfig(
  rights: Partial<ReaderRights>,
  publication: Publication
): Partial<ReaderRights> {
  // Some settings must be disabled for fixed-layout publications
  // maybe we should warn the user we are disabling them here.
  if (publication.isFixedLayout) {
    rights.enableAnnotations = false;
    rights.enableSearch = false;
    rights.enableTTS = false;
    rights.enableDefinitions = false;
    rights.enablePageBreaks = false;
    rights.enableLineFocus = false;
    // config.protection.enableObfuscation = false;
  }
  if (publication.sample?.isSampleRead) {
    rights.enableAnnotations = false;
    rights.enableSearch = false;
    rights.enableTTS = false;
    rights.enableDefinitions = false;
    rights.enableTimeline = false;
    rights.enableMediaOverlays = false;
    rights.enablePageBreaks = false;
    rights.enableLineFocus = false;
  }

  return rights;
}
