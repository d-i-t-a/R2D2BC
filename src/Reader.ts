import Publication from "./model/Publication";
import { UserSettings } from "./model/user-settings/UserSettings";
import AnnotationModule from "./modules/AnnotationModule";
import BookmarkModule from "./modules/BookmarkModule";
import TextHighlighter from "./modules/highlight/TextHighlighter";
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

function getElement(id: string): HTMLElement {
  const elem = document.getElementById(id);
  if (!elem) throw new Error(`Missing required element with ID: ${id}`);
  return elem;
}

/**
 * A class that, once instantiated using the public `.build` method,
 * is the primary interface into the D2 Reader.
 *
 * @TODO :
 *  - DEV logger
 */
export default class Reader {
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
   * @TODO :
   *  - browser support section
   *  - Code that updates/changes the config before we start using it
   *  - Update the config typing so that it properly reflects what is required
   */
  static async build(config: ReaderConfig): Promise<Reader> {
    const mainElement = getElement("D2Reader-Container");
    const headerMenu = getElement("headerMenu");
    const footerMenu = getElement("footerMenu");
    const webpubManifestUrl = config.url;
    const store = new LocalStorageStore({
      prefix: webpubManifestUrl.href,
      useLocalStorage: config.useLocalStorage ?? false,
    });
    const settingsStore = new LocalStorageStore({
      prefix: "r2d2bc-reader",
      useLocalStorage: config.useLocalStorage ?? false,
    });

    const annotator = new LocalAnnotator({ store: store });

    const upLink: UpLinkConfig = config.upLinkUrl ?? undefined;

    const publication: Publication = await Publication.getManifest(
      webpubManifestUrl,
      store
    );

    // Settings
    const settings = await UserSettings.create({
      store: settingsStore,
      initialUserSettings: config.userSettings,
      headerMenu: headerMenu,
      material: config.material,
      api: config.api,
      layout:
        (publication.metadata.rendition?.layout ?? "unknown") === "fixed"
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
        (publication.metadata.rendition?.layout ?? "unknown") === "fixed"
          ? []
          : config.injectables,
      attributes: config.attributes,
      services: config.services,
    });

    // Highlighter
    const highligherEnabled =
      (publication.metadata.rendition?.layout ?? "unknown") !== "fixed";
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

    return new Reader(
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
  startReadAloud() {
    return this.navigator.startReadAloud();
  }
  stopReadAloud() {
    return this.navigator.stopReadAloud();
  }
  pauseReadAloud() {
    return this.navigator.pauseReadAloud();
  }
  resumeReadAloud() {
    return this.navigator.resumeReadAloud();
  }

  /**
   * Bookmarks and annotations
   */
  async saveBookmark() {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.saveBookmark();
    }
  }
  async deleteBookmark(bookmark) {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.deleteBookmark(bookmark);
    }
  }
  async deleteAnnotation(highlight) {
    return await this.annotationModule?.deleteAnnotation(highlight);
  }
  async addAnnotation(highlight) {
    return await this.annotationModule?.addAnnotation(highlight);
  }
  async tableOfContents() {
    return await this.navigator.tableOfContents();
  }
  async readingOrder() {
    return await this.navigator.readingOrder();
  }
  async bookmarks() {
    if (this.navigator.rights?.enableBookmarks) {
      return await this.bookmarkModule.getBookmarks();
    } else {
      return [];
    }
  }
  async annotations() {
    return (await this.annotationModule?.getAnnotations()) ?? [];
  }

  /**
   * Search
   */
  async search(term, current) {
    if (this.navigator.rights?.enableSearch) {
      return await this.searchModule?.search(term, current);
    } else {
      return [];
    }
  }
  async goToSearchIndex(href, index, current) {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.goToSearchIndex(href, index, current);
    }
  }
  async goToSearchID(href, index, current) {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.goToSearchID(href, index, current);
    }
  }
  async clearSearch() {
    if (this.navigator.rights?.enableSearch) {
      await this.searchModule?.clearSearch();
    }
  }

  /**
   * Resources
   */
  currentResource() {
    return this.navigator.currentResource();
  }
  mostRecentNavigatedTocItem() {
    return this.navigator.mostRecentNavigatedTocItem();
  }
  totalResources() {
    return this.navigator.totalResources();
  }

  /**
   * Settings
   */
  get publicationLanguage() {
    return this.navigator.publication.metadata.language;
  }
  async resetUserSettings() {
    return await this.settings.resetUserSettings();
  }
  async applyUserSettings(userSettings) {
    return await this.settings.applyUserSettings(userSettings);
  }
  async currentSettings() {
    return this.settings.currentSettings();
  }
  async scroll(value) {
    return await this.settings.scroll(value);
  }

  /**
   * pitch?
   */
  increase(incremental) {
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
  }
  decrease(incremental) {
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
  }

  /**
   * Publisher?
   */
  publisher(on) {
    this.settings.publisher(on);
  }

  /**
   * TTS Settings
   */
  resetTTSSettings() {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.resetTTSSettings();
    }
  }
  applyTTSSettings(ttsSettings) {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyTTSSettings(ttsSettings);
    }
  }

  applyTTSSetting(key, value) {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyTTSSetting(key, value);
    }
  }
  applyPreferredVoice(value) {
    if (this.navigator.rights?.enableTTS) {
      this.ttsSettings.applyPreferredVoice(value);
    }
  }

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
  async goTo(locator) {
    this.navigator.goTo(locator);
  }
  async goToPosition(value) {
    return this.navigator.goToPosition(value);
  }
  async nextResource() {
    this.navigator.nextResource();
  }
  async previousResource() {
    this.navigator.previousResource();
  }
  async nextPage() {
    this.navigator.nextPage();
  }
  async previousPage() {
    this.navigator.previousPage();
  }
  async atStart() {
    return this.navigator.atStart();
  }
  async atEnd() {
    return this.navigator.atEnd();
  }
  async snapToElement(value) {
    this.navigator.snapToElement(value);
  }

  /**
   * ??
   */
  applyAttributes(value) {
    this.navigator.applyAttributes(value);
  }

  /**
   * Destructor
   */
  stop() {
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
  }
}
