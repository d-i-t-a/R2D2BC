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
  IFrameNavigator,
  IFrameAttributes,
  ReaderConfig,
  ReaderRights,
} from "./navigator/IFrameNavigator";
import LocalAnnotator from "./store/LocalAnnotator";
import LocalStorageStore from "./store/LocalStorageStore";
import { findElement, findRequiredElement } from "./utils/HTMLUtilities";
import { convertAndCamel } from "./model/Link";
import { LayerSettings } from "./modules/highlight/LayerSettings";
import { PageBreakModule } from "./modules/pagebreak/PageBreakModule";
import { TTSModule2 } from "./modules/TTS/TTSModule2";
import { ReaderModule } from "./modules/ReaderModule";
import { DefinitionsModule } from "./modules/search/DefinitionsModule";
import LineFocusModule from "./modules/linefocus/LineFocusModule";
import { HistoryModule } from "./modules/history/HistoryModule";
import CitationModule from "./modules/citation/CitationModule";
import { TaJsonDeserialize } from "./utils/JsonUtil";
import { PDFNavigator } from "./navigator/PDFNavigator";
import Navigator from "./navigator/Navigator";
import { ConsumptionModule } from "./modules/consumption/ConsumptionModule";

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
    private readonly navigator: Navigator | IFrameNavigator | PDFNavigator,
    private readonly highlighter?: TextHighlighter,
    private readonly bookmarkModule?: BookmarkModule,
    private readonly annotationModule?: AnnotationModule,
    private readonly ttsSettings?: TTSSettings,
    private readonly ttsModule?: ReaderModule,
    private readonly searchModule?: SearchModule,
    private readonly definitionsModule?: DefinitionsModule,
    private readonly contentProtectionModule?: ContentProtectionModule,
    private readonly timelineModule?: TimelineModule,
    private readonly mediaOverlaySettings?: MediaOverlaySettings,
    private readonly mediaOverlayModule?: MediaOverlayModule,
    private readonly pageBreakModule?: PageBreakModule,
    private readonly lineFocusModule?: LineFocusModule,
    private readonly historyModule?: HistoryModule,
    private readonly citationModule?: CitationModule,
    private readonly consumptionModule?: ConsumptionModule
  ) {}

  addEventListener() {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.addListener(arguments[0], arguments[1]);
    }
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
      publication = TaJsonDeserialize<Publication>(
        initialConfig.publication,
        Publication
      );
      publication.manifestUrl = new URL(webPubManifestUrl);
    } else {
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
      publication.Metadata.ConformsTo &&
      publication.Metadata.ConformsTo.includes(
        "https://readium.org/webpub-manifest/profiles/pdf"
      )
    ) {
      const settings = await UserSettings.create({
        store: settingsStore,
        initialUserSettings: initialConfig.userSettings,
        layout: "",
      });
      const navigator = await PDFNavigator.create({
        mainElement: mainElement,
        publication: publication,
        settings: settings,
        api: initialConfig.api,
      });
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
        injectables:
          (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
            ? initialConfig.injectablesFixed
            : initialConfig.injectables,
        layout:
          (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
            ? "fixed"
            : "reflowable",
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
            rights: rights,
            publication: publication,
            initialAnnotations: initialConfig.initialAnnotations,
            ...initialConfig.bookmarks,
          })
        : undefined;

      // Annotation Module
      const annotationModule = rights.enableAnnotations
        ? await AnnotationModule.create({
            annotator: annotator,
            rights: rights,
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

      let ttsModule: ReaderModule | undefined = undefined;

      if (ttsEnabled && ttsSettings) {
        ttsModule = await TTSModule2.create({
          tts: ttsSettings,
          headerMenu: headerMenu,
          rights: rights,
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
      const navigator = await IFrameNavigator.create({
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
        injectables:
          (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
            ? initialConfig.injectablesFixed ?? []
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
        ],
      });

      return new D2Reader(
        settings,
        navigator,
        highlighter,
        bookmarkModule,
        annotationModule,
        ttsSettings,
        ttsModule,
        searchModule,
        definitionsModule,
        contentProtectionModule,
        timelineModule,
        mediaOverlaySettings,
        mediaOverlayModule,
        pageBreakModule,
        lineFocusModule,
        historyModule,
        citationModule,
        consumptionModule
      );
    }
  }

  /**
   * Read Aloud
   */

  /** Start TTS Read Aloud */
  startReadAloud = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.startReadAloud();
    }
  };
  /** Start TTS Read Aloud */
  stopReadAloud = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.stopReadAloud();
    }
  };
  /** Start TTS Read Aloud */
  pauseReadAloud = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.pauseReadAloud();
    }
  };
  /** Start TTS Read Aloud */
  resumeReadAloud = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.resumeReadAloud();
    }
  };

  /**
   * Read Along
   */

  /** Start Media Overlay Read Along */
  startReadAlong = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.startReadAlong();
    }
  };
  /** Stop Media Overlay Read Along */
  stopReadAlong = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.stopReadAlong();
    }
  };
  /** Pause Media Overlay Read Along */
  pauseReadAlong = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.pauseReadAlong();
    }
  };
  /** Resume Media Overlay Read Along */
  resumeReadAlong = () => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.resumeReadAlong();
    }
  };
  get hasMediaOverlays() {
    if (this.navigator instanceof IFrameNavigator) {
      return this.navigator.hasMediaOverlays;
    }
    return false;
  }

  /**
   * Bookmarks and annotations
   */

  /** Save bookmark by progression */
  saveBookmark = async () => {
    return (await this.bookmarkModule?.saveBookmark()) ?? false;
  };
  /** Save bookmark by annotation */
  saveBookmarkPlus = async () => {
    return this.bookmarkModule?.saveBookmarkPlus();
  };
  /** Delete bookmark */
  deleteBookmark = async (bookmark: Bookmark) => {
    return (await this.bookmarkModule?.deleteBookmark(bookmark)) ?? false;
  };
  /** Delete annotation */
  deleteAnnotation = async (highlight: Annotation) => {
    return (await this.annotationModule?.deleteAnnotation(highlight)) ?? false;
  };
  /** Add annotation */
  addAnnotation = async (highlight: Annotation) => {
    return (await this.annotationModule?.addAnnotation(highlight)) ?? false;
  };

  /** Hide Annotation Layer */
  hideAnnotationLayer = () => {
    return this.annotationModule?.hideAnnotationLayer();
  };
  /** Show Annotation Layer */
  showAnnotationLayer = () => {
    return this.annotationModule?.showAnnotationLayer();
  };

  /** Hide  Layer */
  hideLayer = (layer) => {
    return this.navigator instanceof IFrameNavigator
      ? this.navigator?.hideLayer(layer)
      : false;
  };
  /** Show  Layer */
  showLayer = (layer) => {
    return this.navigator instanceof IFrameNavigator
      ? this.navigator?.showLayer(layer)
      : false;
  };

  /** Activate Marker <br>
   * Activated Marker will be used for active annotation creation */
  activateMarker = (id: string, position: string) => {
    return this.navigator instanceof IFrameNavigator
      ? this.navigator?.activateMarker(id, position)
      : false;
  };
  /** Deactivate Marker */
  deactivateMarker = () => {
    return this.navigator instanceof IFrameNavigator
      ? this.navigator?.deactivateMarker()
      : false;
  };

  /**
   * Definitions
   */

  /** Clear current definitions */
  clearDefinitions = async () => {
    await this.definitionsModule?.clearDefinitions();
  };
  /** Add newt definition */
  addDefinition = async (definition) => {
    await this.definitionsModule?.addDefinition(definition);
  };

  /** Table of Contents */
  get tableOfContents() {
    return convertAndCamel(this.navigator.tableOfContents()) ?? [];
  }
  /** Landmarks */
  get landmarks() {
    return convertAndCamel(this.navigator.landmarks()) ?? [];
  }
  /** Page List */
  get pageList() {
    return convertAndCamel(this.navigator.pageList()) ?? [];
  }
  /** Reading Order or Spine */
  get readingOrder() {
    return convertAndCamel(this.navigator.readingOrder()) ?? [];
  }
  /** Current Bookmarks */
  get bookmarks() {
    return this.bookmarkModule?.getBookmarks() ?? [];
  }
  /** Current Annotations */
  get annotations() {
    return this.annotationModule?.getAnnotations();
  }

  get publicationLayout() {
    return this.navigator.publication.layout;
  }

  /** History */
  get history() {
    return this.historyModule?.history;
  }
  /** Current index of history */
  get historyCurrentIndex() {
    return this.historyModule?.historyCurrentIndex;
  }
  /** History Back */
  historyBack = async () => {
    return this.historyModule?.historyBack();
  };
  /** History Forward */
  historyForward = async () => {
    return this.historyModule?.historyForward();
  };

  /**
   * Search
   */
  /** Search by term and current resource or entire book <br>
   * current = true, will search only current resource <br>
   * current = false, will search entire publication */
  search = async (term: string, current: boolean) => {
    return (await this.searchModule?.search(term, current)) ?? [];
  };
  goToSearchIndex = async (href: string, index: number, current: boolean) => {
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableSearch
    ) {
      await this.searchModule?.goToSearchIndex(href, index, current);
    }
  };
  goToSearchID = async (href: string, index: number, current: boolean) => {
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableSearch
    ) {
      await this.searchModule?.goToSearchID(href, index, current);
    }
  };
  clearSearch = async () => {
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableSearch
    ) {
      await this.searchModule?.clearSearch();
    }
  };

  /**
   * Resources
   */
  get currentResource() {
    return this.navigator.currentResource();
  }
  get mostRecentNavigatedTocItem() {
    return this.navigator instanceof IFrameNavigator
      ? this.navigator.mostRecentNavigatedTocItem()
      : false;
  }
  get totalResources() {
    return this.navigator.totalResources();
  }
  get publicationLanguage() {
    return this.navigator.publication.Metadata.Language;
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
    if (this.navigator instanceof PDFNavigator) {
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
      if (
        this.navigator instanceof IFrameNavigator &&
        this.navigator.rights.enableTTS
      ) {
        await this.ttsSettings?.increase(incremental);
      }
    } else if (this.isMOIncrementable(incremental)) {
      if (
        this.navigator instanceof IFrameNavigator &&
        this.navigator.rights.enableMediaOverlays
      ) {
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
      if (
        this.navigator instanceof IFrameNavigator &&
        this.navigator.rights.enableTTS
      ) {
        await this.ttsSettings?.decrease(incremental);
      }
    } else if (this.isMOIncrementable(incremental)) {
      if (
        this.navigator instanceof IFrameNavigator &&
        this.navigator.rights.enableMediaOverlays
      ) {
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
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableTTS
    ) {
      this.ttsSettings?.resetTTSSettings();
    }
  };
  applyTTSSettings = async (ttsSettings: Partial<ITTSUserSettings>) => {
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableTTS
    ) {
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
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableTTS
    ) {
      await this.ttsSettings?.applyPreferredVoice(value);
    }
  };

  /**
   * Media Overlay Settings
   */
  resetMediaOverlaySettings = async () => {
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableMediaOverlays
    ) {
      await this.mediaOverlaySettings?.resetMediaOverlaySettings();
    }
  };
  applyMediaOverlaySettings = async (
    settings: Partial<IMediaOverlayUserSettings>
  ) => {
    if (
      this.navigator instanceof IFrameNavigator &&
      this.navigator.rights.enableMediaOverlays
    ) {
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
    if (this.navigator instanceof PDFNavigator) {
      (this.navigator as PDFNavigator).fitToPage();
    }
  };
  fitToWidth = () => {
    if (this.navigator instanceof PDFNavigator) {
      (this.navigator as PDFNavigator).fitToWidth();
    }
  };
  zoomIn = () => {
    if (this.navigator instanceof PDFNavigator) {
      (this.navigator as PDFNavigator).zoomIn();
    }
  };
  zoomOut = () => {
    if (this.navigator instanceof PDFNavigator) {
      (this.navigator as PDFNavigator).zoomOut();
    }
  };
  activateHand = () => {
    if (this.navigator instanceof PDFNavigator) {
      (this.navigator as PDFNavigator).activateHand();
    }
  };
  deactivateHand = () => {
    if (this.navigator instanceof PDFNavigator) {
      (this.navigator as PDFNavigator).deactivateHand();
    }
  };
  copyToClipboard = (text) => {
    this.contentProtectionModule?.copyToClipboard(text);
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
    return this.navigator instanceof IFrameNavigator
      ? this.navigator.atStart()
      : false;
  }
  get atEnd() {
    return this.navigator instanceof IFrameNavigator
      ? this.navigator.atEnd()
      : false;
  }
  snapToSelector = async (selector) => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.snapToSelector(selector);
    }
  };
  /**
   * You have attributes in the reader when you initialize it. You can set margin, navigationHeight etc...
   * This is in case you change the attributes after initializing the reader.
   */
  applyAttributes = (value: IFrameAttributes) => {
    if (this.navigator instanceof IFrameNavigator) {
      this.navigator.applyAttributes(value);
    }
  };

  async applyLineFocusSettings(userSettings) {
    if (userSettings.lines) {
      if (this.lineFocusModule) {
        const lines = this.lineFocusModule.properties.lines ?? 1;
        this.lineFocusModule.index =
          (this.lineFocusModule.index * lines) / parseInt(userSettings.lines);
        this.lineFocusModule.index = Math.abs(
          parseInt(this.lineFocusModule.index.toFixed())
        );
        this.lineFocusModule.properties.lines = parseInt(userSettings.lines);
        if (this.lineFocusModule.isActive) {
          await this.lineFocusModule.enableLineFocus();
        }
      }
    }
    if (userSettings.debug !== undefined) {
      if (this.lineFocusModule) {
        this.lineFocusModule.isDebug = userSettings.debug;
        if (this.lineFocusModule.isActive) {
          await this.lineFocusModule.enableLineFocus();
        }
      }
    }
  }
  lineUp() {
    this.lineFocusModule?.lineUp();
  }
  lineDown() {
    this.lineFocusModule?.lineDown();
  }
  async enableLineFocus() {
    await this.lineFocusModule?.enableLineFocus();
  }
  async lineFocus(active: boolean) {
    if (active) {
      await this.lineFocusModule?.enableLineFocus();
    } else {
      this.lineFocusModule?.disableLineFocus();
    }
  }
  disableLineFocus() {
    this.lineFocusModule?.disableLineFocus();
  }

  /**
   * Destructor:
   * Only used in react applications because when they re-visit the page
   * it tried to create a new reader, which interfered with the first one.
   */
  stop = () => {
    document.body.onscroll = () => {};
    this.navigator.stop();
    this.settings.stop();
    this.ttsSettings?.stop();
    (this.ttsModule as TTSModule2)?.stop();
    this.bookmarkModule?.stop();
    this.annotationModule?.stop();
    this.searchModule?.stop();
    this.definitionsModule?.stop();
    this.contentProtectionModule?.stop();
    this.timelineModule?.stop();
    this.mediaOverlaySettings?.stop();
    this.mediaOverlayModule?.stop();
    this.pageBreakModule?.stop();
    this.lineFocusModule?.stop();
    this.citationModule?.stop();
    this.consumptionModule?.stop();
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
