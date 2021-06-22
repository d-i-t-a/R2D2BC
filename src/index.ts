import { Annotation, Bookmark, Locator } from "./model/Locator";
import Publication from "./model/Publication";
import { UserSettingsIncrementable } from "./model/user-settings/UserProperties";
import { UserSettings } from "./model/user-settings/UserSettings";
import AnnotationModule from "./modules/AnnotationModule";
import BookmarkModule from "./modules/BookmarkModule";
import TextHighlighter from "./modules/highlight/TextHighlighter";
import TimelineModule from "./modules/positions/TimelineModule";
import ContentProtectionModule from "./modules/protection/ContentProtectionModule";
import SearchModule from "./modules/search/SearchModule";
import TTSModule from "./modules/TTS/TTSModule";
import {
  ITTSUserSettings,
  TTSIncrementable,
  TTSSettings,
} from "./modules/TTS/TTSSettings";
import IFrameNavigator, {
  IFrameAttributes,
  ReaderConfig,
  UpLinkConfig,
} from "./navigator/IFrameNavigator";
import LocalAnnotator from "./store/LocalAnnotator";
import LocalStorageStore from "./store/LocalStorageStore";
import { enforceSupportedBrowsers } from "./utils/BrowserUtilities";
import { findElement, findRequiredElement } from "./utils/HTMLUtilities";

/**
 * A class that, once instantiated using the public `.build` method,
 * is the primary interface into the D2 Reader.
 *
 * @TODO :
 *  - DEV logger
 *  - Default config
 *  - Different types for initial config and final config
 *  - Testing
 */
export default class D2Reader {
  private constructor(
    readonly settings: UserSettings,
    readonly ttsSettings: TTSSettings,
    readonly navigator: IFrameNavigator,
    readonly highlighter: TextHighlighter,
    readonly bookmarkModule: BookmarkModule,
    readonly annotationModule?: AnnotationModule,
    readonly ttsModule?: TTSModule,
    readonly searchModule?: SearchModule,
    readonly contentProtectionModule?: ContentProtectionModule,
    readonly timelineModule?: TimelineModule
  ) {}
  /**
   * The async builder.
   */
  static async build(initialConfig: ReaderConfig): Promise<D2Reader> {
    // will throw error if on unsupported browser
    enforceSupportedBrowsers(initialConfig);

    const mainElement = findRequiredElement(document, "#D2Reader-Container");
    const headerMenu = findElement(document, "#headerMenu");
    const footerMenu = findElement(document, "#footerMenu");

    const webpubManifestUrl = initialConfig.url;
    const store = new LocalStorageStore({
      prefix: webpubManifestUrl.href,
      useLocalStorage: initialConfig.useLocalStorage ?? false,
    });
    const settingsStore = new LocalStorageStore({
      prefix: "r2d2bc-reader",
      useLocalStorage: initialConfig.useLocalStorage ?? false,
    });

    const annotator = new LocalAnnotator({ store: store });

    const upLink: UpLinkConfig = initialConfig.upLinkUrl ?? undefined;

    const publication: Publication = await Publication.fromUrl(
      webpubManifestUrl
    );

    const config = updateConfigForFixedLayout(initialConfig, publication);

    /**
     * Set up publication positions and weights by either auto
     * generating them or fetching them from provided services.
     */
    if (config.rights?.autoGeneratePositions ?? true) {
      await publication.autoGeneratePositions();
    } else {
      if (config.services?.positions) {
        await publication.fetchPositionsFromService(
          config.services?.positions.href
        );
      }
      /**
       * The weight tells each resource how large it is relative to total size,
       * used to show a the timeline with resources sized relative to weight
       */
      if (config.services?.weight) {
        await publication.fetchWeightsFromService(config.services?.weight.href);
      }
    }

    // Settings
    const settings = await UserSettings.create({
      store: settingsStore,
      initialUserSettings: config.userSettings,
      headerMenu: headerMenu,
      material: config.material,
      api: config.api,
      layout: publication.layout,
    });

    // Navigator
    const navigator = await IFrameNavigator.create({
      mainElement: mainElement,
      headerMenu: headerMenu,
      footerMenu: footerMenu,
      publication: publication,
      settings,
      annotator: annotator,
      upLink: upLink,
      initialLastReadingPosition: config.lastReadingPosition,
      material: config.material,
      api: config.api,
      rights: config.rights,
      tts: config.tts,
      injectables: publication.isFixedLayout
        ? config.injectablesFixed
        : config.injectables,
      attributes: config.attributes,
      services: config.services,
    });

    // Highlighter
    const highligherEnabled = publication.isReflowable;
    const highlighter = highligherEnabled
      ? await TextHighlighter.create({
          delegate: navigator,
          ...config.highlighter,
        })
      : undefined;

    // Bookmark Module
    const bookmarkModule = config.rights?.enableBookmarks
      ? await BookmarkModule.create({
          annotator: annotator,
          headerMenu: headerMenu,
          rights: config.rights,
          publication: publication,
          delegate: navigator,
          initialAnnotations: config.initialAnnotations,
          ...config.bookmarks,
        })
      : undefined;

    // Annotation Module
    const annotationModule = config.rights?.enableAnnotations
      ? await AnnotationModule.create({
          annotator: annotator,
          headerMenu: headerMenu,
          rights: config.rights,
          publication: publication,
          delegate: navigator,
          initialAnnotations: config.initialAnnotations,
          highlighter: highlighter,
          ...config.annotations,
        })
      : undefined;

    // TTS Module
    const ttsEnabled = config.rights?.enableTTS;
    const ttsSettings = ttsEnabled
      ? await TTSSettings.create({
          store: settingsStore,
          initialTTSSettings: config.tts,
          headerMenu: headerMenu,
          ...config.tts,
        })
      : undefined;

    const ttsModule = ttsEnabled
      ? await TTSModule.create({
          delegate: navigator,
          tts: ttsSettings,
          headerMenu: headerMenu,
          rights: config.rights,
          highlighter: highlighter,
          ...config.tts,
        })
      : undefined;

    // Search Module
    const searchModule = config.rights?.enableSearch
      ? await SearchModule.create({
          headerMenu: headerMenu,
          delegate: navigator,
          publication: publication,
          highlighter: highlighter,
          ...config.search,
        })
      : undefined;

    // Timeline Module
    const timelineModule = config.rights?.enableTimeline
      ? await TimelineModule.create({
          publication: publication,
          delegate: navigator,
        })
      : undefined;

    // Content Protection Module
    const contentProtectionModule = config.rights?.enableContentProtection
      ? await ContentProtectionModule.create({
          delegate: navigator,
          ...config.protection,
        })
      : undefined;

    return new D2Reader(
      settings,
      ttsSettings,
      navigator,
      highlighter,
      bookmarkModule,
      annotationModule,
      ttsModule,
      searchModule,
      contentProtectionModule,
      timelineModule
    );
  }

  /**
   * Read Aloud
   */
  startReadAloud = () => {
    return this.navigator.startReadAloud();
  };
  stopReadAloud = () => {
    return this.navigator.stopReadAloud();
  };
  pauseReadAloud = () => {
    return this.navigator.pauseReadAloud();
  };
  resumeReadAloud = () => {
    return this.navigator.resumeReadAloud();
  };

  /**
   * Bookmarks and annotations
   */
  saveBookmark = async () => {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.saveBookmark();
    }
  };
  deleteBookmark = async (bookmark: Bookmark) => {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.deleteBookmark(bookmark);
    }
  };
  deleteAnnotation = async (highlight: Annotation) => {
    return await this.annotationModule?.deleteAnnotation(highlight);
  };
  addAnnotation = async (highlight: Annotation) => {
    return await this.annotationModule?.addAnnotation(highlight);
  };
  tableOfContents = async () => {
    return await this.navigator.tableOfContents();
  };
  readingOrder = async () => {
    return await this.navigator.readingOrder();
  };
  bookmarks = async () => {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.getBookmarks();
    } else {
      return [];
    }
  };
  annotations = async () => {
    return (await this.annotationModule?.getAnnotations()) ?? [];
  };

  /**
   * Search
   */
  search = async (term: string, current: boolean) => {
    if (this.navigator.rights?.enableSearch) {
      return await this.searchModule?.search(term, current);
    } else {
      return [];
    }
  };
  goToSearchIndex = async (href: string, index: number, current: boolean) => {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.goToSearchIndex(href, index, current);
    }
  };
  goToSearchID = async (href: string, index: number, current: boolean) => {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.goToSearchID(href, index, current);
    }
  };
  clearSearch = () => {
    if (this.navigator.rights?.enableSearch) {
      this.searchModule?.clearSearch();
    }
  };

  /**
   * Resources
   */
  currentResource = () => {
    return this.navigator.currentResource();
  };
  mostRecentNavigatedTocItem = () => {
    return this.navigator.mostRecentNavigatedTocItem();
  };
  totalResources = () => {
    return this.navigator.totalResources();
  };

  /**
   * Settings
   */
  get publicationLanguage() {
    return this.navigator.publication.Metadata.Language;
  }
  resetUserSettings = async () => {
    return await this.settings.resetUserSettings();
  };
  applyUserSettings = async (userSettings: UserSettings) => {
    return await this.settings.applyUserSettings(userSettings);
  };
  currentSettings = () => {
    return this.settings.currentSettings();
  };
  scroll = async (value: boolean) => {
    return await this.settings.scroll(value);
  };

  private isTTSIncrementable(
    incremental: UserSettingsIncrementable | TTSIncrementable
  ): incremental is TTSIncrementable {
    return (
      incremental === "pitch" ||
      incremental === "rate" ||
      incremental === "volume"
    );
  }

  /**
   * Used to increase anything that can be increased,
   * such as pitch, rate, volume, fontSize
   */
  increase = (incremental: UserSettingsIncrementable | TTSIncrementable) => {
    if (this.isTTSIncrementable(incremental)) {
      if (this.navigator.rights?.enableTTS) {
        this.ttsSettings.increase(incremental);
      }
    } else {
      this.settings.increase(incremental);
    }
  };

  /**
   * Used to decrease anything that can be decreased,
   * such as pitch, rate, volume, fontSize
   */
  decrease = (incremental: UserSettingsIncrementable | TTSIncrementable) => {
    if (this.isTTSIncrementable(incremental)) {
      if (this.navigator.rights?.enableTTS) {
        this.ttsSettings.decrease(incremental);
      }
    } else {
      this.settings.decrease(incremental);
    }
  };

  /**
   * TTS Settings
   */
  resetTTSSettings = () => {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.resetTTSSettings();
    }
  };
  applyTTSSettings = (ttsSettings: ITTSUserSettings) => {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyTTSSettings(ttsSettings);
    }
  };

  applyTTSSetting = (key: string, value) => {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyTTSSetting(key, value);
    }
  };
  applyPreferredVoice = (value: string) => {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyPreferredVoice(value);
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
  nextResource = async () => {
    this.navigator.nextResource();
  };
  previousResource = async () => {
    this.navigator.previousResource();
  };
  nextPage = async () => {
    this.navigator.nextPage();
  };
  previousPage = async () => {
    this.navigator.previousPage();
  };
  atStart = async () => {
    return this.navigator.atStart();
  };
  atEnd = async () => {
    return this.navigator.atEnd();
  };
  snapToElement = async (value: HTMLElement) => {
    this.navigator.snapToElement(value);
  };

  /**
   * You have attributes in the reader when you initialize it. You can set margin, navigationHeight etc...
   * This is in case you change the attributes after initializing the reader.
   */
  applyAttributes = (value: IFrameAttributes) => {
    this.navigator.applyAttributes(value);
  };

  /**
   * Destructor:
   * Only used in react applications because when they re-visit the page
   * it tried to create a new reader, which interfered with the first one.
   */
  stop = () => {
    document.body.onscroll = () => {};
    this.navigator.stop();
    this.settings.stop();
    this.ttsSettings.stop();
    this.ttsModule?.stop();
    this.bookmarkModule.stop();
    this.annotationModule?.stop();
    this.searchModule?.stop();
    this.contentProtectionModule?.stop();
    this.timelineModule?.stop();
  };
}

function updateConfigForFixedLayout(
  config: ReaderConfig,
  publication: Publication
): ReaderConfig {
  // Some settings must be disabled for fixed-layout publications
  // maybe we should warn the user we are disabling them here.
  if (publication.isFixedLayout) {
    config.rights.enableAnnotations = false;
    config.rights.enableSearch = false;
    config.rights.enableTTS = false;
    // config.protection.enableObfuscation = false;
  }

  return config;
}
