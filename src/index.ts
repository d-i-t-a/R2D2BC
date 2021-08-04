import Publication from "./model/Publication";
import { UserSettings } from "./model/user-settings/UserSettings";
import AnnotationModule from "./modules/AnnotationModule";
import BookmarkModule from "./modules/BookmarkModule";
import TextHighlighter from "./modules/highlight/TextHighlighter";
import MediaOverlayModule from "./modules/mediaoverlays/MediaOverlayModule";
import { MediaOverlaySettings } from "./modules/mediaoverlays/MediaOverlaySettings";
import TimelineModule from "./modules/positions/TimelineModule";
import ContentProtectionModule from "./modules/protection/ContentProtectionModule";
import SearchModule from "./modules/search/SearchModule";
import TTSModule from "./modules/TTS/TTSModule";
import { TTSSettings } from "./modules/TTS/TTSSettings";
import IFrameNavigator, {
  ReaderConfig,
  UpLinkConfig,
} from "./navigator/IFrameNavigator";
import LocalAnnotator from "./store/LocalAnnotator";
import LocalStorageStore from "./store/LocalStorageStore";
import { findElement, findRequiredElement } from "./utils/HTMLUtilities";

/**
 * A class that, once instantiated using the public `.build` method,
 * is the primary interface into the D2 Reader.
 *
 * @TODO :
 *  - Type all function arguments
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
    readonly timelineModule?: TimelineModule,
    readonly mediaOverlayModule?: MediaOverlayModule
  ) {}

  /**
   * The async builder.
   */
  static async build(initialConfig: ReaderConfig): Promise<D2Reader> {
    // Enforces supported browsers
    if (
      initialConfig.rights?.enableContentProtection &&
      initialConfig.protection
    ) {
      await ContentProtectionModule.setupPreloadProtection(
        initialConfig.protection
      );
    }
    const mainElement = findRequiredElement(document, "#D2Reader-Container");
    // are the following elements necessary or not? They seem not to be,
    // but we will have to change some types if they are allowed to be null
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

    // update our config based on what we know from the publication
    const config = updateConfig(initialConfig, publication);

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
      injectables:
        (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
          ? config.injectablesFixed
          : config.injectables,
      layout:
        (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
          ? "fixed"
          : "reflowable",
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
      injectables:
        (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
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

    const enableMediaOverlays = config.rights?.enableMediaOverlays ?? false;

    const mediaOverlaySettings = enableMediaOverlays
      ? await MediaOverlaySettings.create({
          store: settingsStore,
          initialMediaOverlaySettings: config.mediaOverlays,
          headerMenu: headerMenu,
          ...config.mediaOverlays,
        })
      : undefined;

    const mediaOverlayModule = enableMediaOverlays
      ? await MediaOverlayModule.create({
          publication: publication,
          settings: mediaOverlaySettings,
          delegate: navigator,
          ...config.mediaOverlays,
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
      timelineModule,
      mediaOverlayModule
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
  deleteBookmark = async (bookmark) => {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.deleteBookmark(bookmark);
    }
  };
  deleteAnnotation = async (highlight) => {
    return await this.annotationModule?.deleteAnnotation(highlight);
  };
  addAnnotation = async (highlight) => {
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
  search = async (term, current) => {
    if (this.navigator.rights?.enableSearch) {
      return await this.searchModule?.search(term, current);
    } else {
      return [];
    }
  };
  goToSearchIndex = async (href, index, current) => {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.goToSearchIndex(href, index, current);
    }
  };
  goToSearchID = async (href, index, current) => {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.goToSearchID(href, index, current);
    }
  };
  clearSearch = async () => {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.clearSearch();
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
  applyUserSettings = async (userSettings) => {
    return await this.settings.applyUserSettings(userSettings);
  };
  currentSettings = () => {
    return this.settings.currentSettings;
  };
  scroll = async (value) => {
    return await this.settings.scroll(value);
  };

  /**
   * pitch?
   */
  increase = (incremental) => {
    if (
      (incremental === "pitch" ||
        incremental === "rate" ||
        incremental === "volume") &&
      this.navigator.rights?.enableTTS
    ) {
      this.ttsSettings.increase(incremental);
    } else {
      this.settings.increase(incremental);
    }
  };
  decrease = (incremental) => {
    if (
      (incremental === "pitch" ||
        incremental === "rate" ||
        incremental === "volume") &&
      this.navigator.rights?.enableTTS
    ) {
      this.ttsSettings.decrease(incremental);
    } else {
      this.settings.decrease(incremental);
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
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.resetTTSSettings();
    }
  };
  applyTTSSettings = (ttsSettings) => {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyTTSSettings(ttsSettings);
    }
  };

  applyTTSSetting = (key, value) => {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyTTSSetting(key, value);
    }
  };
  applyPreferredVoice = (value) => {
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
  goTo = async (locator) => {
    this.navigator.goTo(locator);
  };
  goToPosition = async (value) => {
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
  snapToElement = async (value) => {
    this.navigator.snapToElement(value);
  };

  /**
   * ??
   */
  applyAttributes = (value) => {
    this.navigator.applyAttributes(value);
  };

  /**
   * Destructor
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
    this.mediaOverlayModule?.stop();
  };
}

function updateConfig(
  config: ReaderConfig,
  publication: Publication
): ReaderConfig {
  // Some settings must be disabled for fixed-layout publications
  // maybe we should warn the user we are disabling them here.
  if (publication.isFixedLayout) {
    if (!config.rights) config.rights = {};
    config.rights.enableAnnotations = false;
    config.rights.enableSearch = false;
    config.rights.enableTTS = false;
    // config.protection.enableObfuscation = false;
  }

  return config;
}
