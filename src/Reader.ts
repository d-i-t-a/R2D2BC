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

export default class Reader {
  constructor(
    readonly settings: UserSettings,
    readonly ttsSettings: TTSSettings,
    readonly navigator: IFrameNavigator,
    readonly highlighter: TextHighlighter,
    readonly bookmarkModule: BookmarkModule,
    readonly annotationModule?: AnnotationModule,
    readonly searchModule?: SearchModule,
    readonly contentProtectionModule?: ContentProtectionModule,
    readonly timelineModule?: TimelineModule
  ) {}
  /**
   * The async builder.
   * @TODO :
   *  - browser support
   *  - config updating that happens before building modules
   *
   * Questions
   *  - should the config.api be required or optional?
   *  - if it is optional,
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
      searchModule,
      contentProtectionModule,
      timelineModule
    );
  }
}
