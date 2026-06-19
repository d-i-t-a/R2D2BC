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
import {
  Annotation,
  Bookmark,
  Comment,
  Locator,
  Publication,
} from "./model/v3";
import { Profile } from "@readium/shared";
import { UserSettingsIncrementable } from "./model/user-settings/UserProperties";
import { UserSettings } from "./model/user-settings/UserSettings";
import { getScriptMode } from "./utils/ScriptMode";
import { AnnotationModule } from "./modules/epub/AnnotationModule";
import { BookmarkModule } from "./modules/epub/BookmarkModule";
import { TextHighlighter } from "./modules/highlight/TextHighlighter";
import { MediaOverlayModule } from "./modules/epub/mediaoverlays/MediaOverlayModule";
import {
  MediaOverlaySettings,
  IMediaOverlayUserSettings,
  MediaOverlayIncrementable,
} from "./modules/epub/mediaoverlays/MediaOverlaySettings";
import { TimelineModule } from "./modules/epub/TimelineModule";
import { ContentProtectionModule } from "./modules/epub/ContentProtectionModule";
import { SearchModule } from "./modules/epub/search/SearchModule";
import {
  ITTSUserSettings,
  TTSIncrementable,
  TTSSettings,
} from "./modules/epub/TTS/TTSSettings";
import {
  EpubNavigator,
  IFrameAttributes,
  ReaderRights,
} from "./navigator/EpubNavigator";
import type { ReaderConfig } from "./navigator/ReaderConfig";
import LocalAnnotator from "./store/LocalAnnotator";
import LocalStorageStore from "./store/LocalStorageStore";
import { findElement, findRequiredElement } from "./utils/HTMLUtilities";
import { toPlainObject } from "./model/Link";
import { LayerSettings } from "./modules/highlight/LayerSettings";
import { PageBreakModule } from "./modules/epub/PageBreakModule";
import { TTSModule2 } from "./modules/epub/TTS/TTSModule2";
import { DefinitionsModule } from "./modules/epub/search/DefinitionsModule";
import LineFocusModule from "./modules/epub/LineFocusModule";
import { HistoryModule } from "./modules/epub/HistoryModule";
import CitationModule from "./modules/epub/CitationModule";
import Navigator from "./navigator/Navigator";
import type { AudiobookNavigator } from "./navigator/AudiobookNavigator";
import { VisualNavigator, NavigatorFeature } from "./navigator/VisualNavigator";
import { ConsumptionModule } from "./modules/epub/ConsumptionModule";

/**
 * A class that, once instantiated using the public `.build` method,
 * is the primary interface into the D2 Reader.
 */
export default class D2Reader {
  /**
   * Class reference for the audiobook navigator, populated by
   * `loadAudiobookNavigator` on first dynamic load. Used by `asAudio`
   * for `instanceof` narrowing against a lazy-loaded class without
   * value-importing it at the top of this file. Future lazy navigators
   * follow the same shape: one static field per medium, one loader.
   */
  private static audiobookNavigatorClass?: typeof AudiobookNavigator;

  /**
   * Dynamically import PDFNavigator to avoid loading pdfjs-dist in SSR/Node.
   * pdfjs-dist references browser-only APIs (DOMMatrix, canvas) at import time.
   * Module deduplication is handled natively by the dynamic-import system.
   */
  private static async loadPDFNavigator() {
    const { PDFNavigator } = await import("./navigator/PDFNavigator");
    return PDFNavigator;
  }

  /**
   * Dynamically import AudiobookNavigator. Keeps the audio engine code
   * (HTMLAudioElement wrapper, pool, etc.) out of the bundle for
   * EPUB-only and PDF-only integrators. Caches the class on
   * `D2Reader.audiobookNavigatorClass` so `asAudio` can `instanceof`-check
   * against a lazy-loaded class without value-importing it at the top of
   * this file (which would defeat the lazy load).
   */
  private static async loadAudiobookNavigator() {
    const { AudiobookNavigator } =
      await import("./navigator/AudiobookNavigator");
    D2Reader.audiobookNavigatorClass = AudiobookNavigator;
    return AudiobookNavigator;
  }

  private constructor(
    private readonly settings: UserSettings,
    private readonly navigator: Navigator,
    private readonly highlighter?: TextHighlighter,
    private readonly ttsSettings?: TTSSettings,
    private readonly mediaOverlaySettings?: MediaOverlaySettings
  ) {}

  // ── Type guards — the only place `instanceof` appears in D2Reader.
  // Call sites use `this.asVisual()?.X()` / `this.asAudio()?.X()` to
  // dispatch medium-specific methods without scattering instanceof
  // checks. `VisualNavigator` is value-imported (direct instanceof);
  // lazy-loaded navigators are checked against the class reference
  // captured at load time on the static field above.
  private asVisual(): VisualNavigator | null {
    return this.navigator instanceof VisualNavigator ? this.navigator : null;
  }
  private asEpub(): EpubNavigator | null {
    return this.navigator instanceof EpubNavigator ? this.navigator : null;
  }
  private asAudio(): AudiobookNavigator | null {
    return D2Reader.audiobookNavigatorClass &&
      this.navigator instanceof D2Reader.audiobookNavigatorClass
      ? (this.navigator as AudiobookNavigator)
      : null;
  }

  // ── Concrete EPUB module accessors ──────────────────────────
  // Reader methods below that are EPUB-specific (using methods not on
  // the shared I* interfaces) go through these typed getters which cast
  // from the interface to the concrete EPUB class. When the navigator
  // is PDF, these return the PDF concrete class instead — but callers
  // of the EPUB-specific methods should only be invoked in EPUB contexts
  // (either the navigator is EPUB, or the method no-ops via optional chaining).
  private get epubBookmarkModule(): BookmarkModule | undefined {
    return this.asEpub()?.modules.bookmarks as BookmarkModule | undefined;
  }
  private get epubAnnotationModule(): AnnotationModule | undefined {
    return this.asEpub()?.modules.annotations as AnnotationModule | undefined;
  }
  private get epubSearchModule(): SearchModule | undefined {
    return this.asEpub()?.modules.search as SearchModule | undefined;
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
    let publication: Publication | null = null;
    // Track the Fetcher for .epub file mode — may be a ZipFetcher directly,
    // or a TransformingFetcher wrapping it (for font deobfuscation).
    let epubZipFetcher: import("./fetcher/Fetcher").Fetcher | undefined;
    let epubBlobUrlManager:
      | import("./fetcher/BlobUrlManager").BlobUrlManager
      | undefined;

    if (initialConfig.epub) {
      // ── Client-side EPUB opening ────────────────────────────────────
      const { ZipFetcher } = await import("./fetcher/ZipFetcher");
      const { EpubParser } = await import("./fetcher/EpubParser");
      const { BlobUrlManager } = await import("./fetcher/BlobUrlManager");
      const { parseEncryptionXml, createDeobfuscationTransform } =
        await import("./fetcher/FontDeobfuscator");

      // Accept File, Blob, ArrayBuffer, URL, or string — fetch if needed
      let buffer: ArrayBuffer;
      const epubInput = initialConfig.epub;
      if (typeof epubInput === "string" || epubInput instanceof URL) {
        const response = await fetch(
          epubInput.toString(),
          initialConfig.requestConfig
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch EPUB: ${response.status} ${response.statusText}`
          );
        }
        buffer = await response.arrayBuffer();
      } else if (epubInput instanceof ArrayBuffer) {
        buffer = epubInput;
      } else {
        buffer = await epubInput.arrayBuffer();
      }

      // Parse the ZIP once, extract the identifier, then set the basePath.
      // The basePath uses the page origin + a unique path so the URL
      // constructor resolves relative paths correctly (custom schemes
      // like epub:// don't work).
      const rawZip = new ZipFetcher(buffer);
      const publicationId = await EpubParser.extractIdentifier(rawZip);
      const basePath = `${window.location.origin}/epub-local/${encodeURIComponent(publicationId)}/`;
      rawZip.setBasePath(basePath);
      epubZipFetcher = rawZip;

      // Parse encryption.xml for font obfuscation info (IDPF/Adobe).
      // The encryption map is set on both ZipFetcher (so Resources carry
      // encryption metadata) and BlobUrlManager (so transforms can read it).
      let encryptionMap:
        | Map<string, import("./fetcher/FontDeobfuscator").EncryptionInfo>
        | undefined;
      try {
        const encryptionResource = await rawZip.getByHref(
          "META-INF/encryption.xml"
        );
        if (encryptionResource.text) {
          encryptionMap = parseEncryptionXml(encryptionResource.text);
          if (encryptionMap.size > 0) {
            rawZip.setEncryptionMap(encryptionMap);
          }
        }
      } catch {
        // No encryption.xml — most EPUBs don't have one
      }

      // Create blob URLs for all ZIP resources so document.write()
      // iframes can load images, CSS, fonts, and scripts.
      // The deobfuscation transform handles encrypted fonts (IDPF/Adobe)
      // before their blob URLs are created.
      epubBlobUrlManager = new BlobUrlManager(rawZip.container);
      if (encryptionMap && encryptionMap.size > 0) {
        epubBlobUrlManager.setEncryptionMap(encryptionMap);
      }
      const deobfuscationTransform =
        createDeobfuscationTransform(publicationId);
      epubBlobUrlManager.addTransform(deobfuscationTransform);
      await epubBlobUrlManager.initialize();

      // Wrap the ZipFetcher in a TransformingFetcher so resources
      // fetched through the chain (by modules, navigator, etc.) are
      // also deobfuscated — not just blob URLs.
      if (encryptionMap && encryptionMap.size > 0) {
        const { TransformingFetcher } =
          await import("./fetcher/TransformingFetcher");
        epubZipFetcher = new TransformingFetcher(
          rawZip,
          deobfuscationTransform
        );
      }

      const syntheticUrl = new URL(basePath + "manifest.json");
      publication = await EpubParser.parse(rawZip, syntheticUrl);
      webPubManifestUrl = syntheticUrl;

      // Store encryption info on Publication links so any code with a
      // Link can see which resources are encrypted and with what algorithm.
      if (encryptionMap && encryptionMap.size > 0) {
        const { Properties } = await import("@readium/shared");
        const applyEncryption = (links: import("@readium/shared").Link[]) => {
          for (const link of links) {
            const linkEncryption = encryptionMap!.get(
              link.href.replace(basePath, "")
            );
            if (linkEncryption) {
              link.properties = link.properties
                ? link.properties.add({ encrypted: linkEncryption })
                : new Properties({ encrypted: linkEncryption });
            }
          }
        };
        if (publication.readingOrder) applyEncryption(publication.readingOrder);
        if (publication.resources) applyEncryption(publication.resources);
      }

      // Auto-generate positions using byte lengths from the ZIP archive
      // (no HTTP fetch needed — the ZipFetcher knows each entry's size).
      const zipRef = rawZip;
      await publication.autoGeneratePositions(undefined, async (href) => {
        const resource = await zipRef.getByHref(href);
        return resource.bytes?.byteLength ?? 0;
      });
    } else if (initialConfig.publication) {
      const pubInput = initialConfig.publication;
      if (pubInput instanceof Publication) {
        publication = pubInput;
      } else {
        publication = Publication.fromJSON(pubInput, webPubManifestUrl!);
      }
    }
    if (!publication) {
      const { HttpFetcher } = await import("./fetcher/HttpFetcher");
      publication = await Publication.fromUrl(
        webPubManifestUrl!,
        initialConfig.requestConfig,
        new HttpFetcher(initialConfig.requestConfig)
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
      publication.metadata?.conformsTo.includes(Profile.AUDIOBOOK)
    ) {
      // EPUB-shaped UserSettings is no-op for audio — skip
      // initialUserSettings (the top-level `userSettings` config field
      // is audiobook-shaped here and routes to AudiobookSettings below).
      const settings = await UserSettings.create({
        store: settingsStore,
        layout: "",
        scriptMode: getScriptMode(publication),
      });

      const { AudiobookSettings } =
        await import("./model/user-settings/AudiobookSettings");
      // Top-level userSettings + api.updateSettings route here for
      // audiobook (the same field that goes to EPUB's UserSettings for
      // EPUB publications and to PdfViewSettingsModule for PDFs).
      const audiobookSettings = await AudiobookSettings.create({
        store: settingsStore,
        initial: initialConfig.userSettings as
          | import("./model/user-settings/AudiobookSettings").InitialAudiobookSettings
          | null
          | undefined,
        api: initialConfig.api?.updateSettings
          ? {
              updateSettings: (state) =>
                initialConfig.api!.updateSettings!(
                  state as unknown as Record<string, unknown>
                ),
            }
          : undefined,
      });

      // Built-in audiobook modules so far: AudiobookBookmarkModule (task 6).
      // Annotation / History / Consumption modules land in tasks 7–9.
      // Integrator-supplied `initialConfig.modules` are passed through and
      // validated by AudiobookNavigator's hostType check.

      const AudiobookNavigator = await D2Reader.loadAudiobookNavigator();
      const { AudiobookBookmarkModule } =
        await import("./modules/audiobook/AudiobookBookmarkModule");
      const { AudiobookCommentsModule } =
        await import("./modules/audiobook/AudiobookCommentsModule");
      const { AudiobookTimelineModule } =
        await import("./modules/audiobook/AudiobookTimelineModule");

      const bookmarkModule = rights.enableBookmarks
        ? await AudiobookBookmarkModule.create({
            annotator,
            publication,
            initialAnnotations: initialConfig.initialAnnotations,
            ...initialConfig.audiobook?.bookmarks,
          })
        : undefined;

      const commentsModule = rights.enableComments
        ? await AudiobookCommentsModule.create({
            annotator,
            publication,
            initialAnnotations: initialConfig.initialAnnotations,
            ...initialConfig.audiobook?.comments,
          })
        : undefined;

      // Timeline module: when enabled, owns whole-book progress math
      // AND renders the scrubber UI into integrator-supplied containers
      // (chapter and/or whole-book). Without containers it runs in
      // math-only mode for integrator-built UI.
      const timelineModule = rights.enableTimeline
        ? await AudiobookTimelineModule.create({
            publication,
            settings: audiobookSettings,
            ...initialConfig.audiobook?.timeline,
          })
        : undefined;

      const navigator = await AudiobookNavigator.create({
        publication: publication,
        rights: rights,
        settings: audiobookSettings,
        api: initialConfig.api,
        annotator: annotator,
        initialLastReadingPosition: initialConfig.lastReadingPosition,
        preservePitchWorkletUrl:
          initialConfig.audiobook?.preservePitchWorkletUrl,
        prefetch: initialConfig.audiobook?.prefetch,
        chapterListContainer: initialConfig.audiobook?.chapterListContainer,
        colors: initialConfig.audiobook?.colors,
        modules: [
          bookmarkModule,
          commentsModule,
          timelineModule,
          ...(initialConfig.modules ?? []),
        ],
      });

      return new D2Reader(settings, navigator);
    } else if (
      publication.metadata?.conformsTo &&
      publication.metadata?.conformsTo.includes(Profile.PDF)
    ) {
      // EPUB-shaped UserSettings is mostly no-op for PDF — skip
      // initialUserSettings (the top-level `userSettings` config field
      // is PDF-shaped here and routes to PdfViewSettingsModule below).
      const settings = await UserSettings.create({
        store: settingsStore,
        layout: "",
        scriptMode: getScriptMode(publication),
      });
      const PDFNavigator = await D2Reader.loadPDFNavigator();

      const { PdfBookmarkModule } =
        await import("./modules/pdf/PdfBookmarkModule");
      const { PdfSearchModule } = await import("./modules/pdf/PdfSearchModule");
      const { PdfAnnotationModule } =
        await import("./modules/pdf/PdfAnnotationModule");
      const { PdfHistoryModule } =
        await import("./modules/pdf/PdfHistoryModule");
      const { PdfViewSettingsModule } =
        await import("./modules/pdf/PdfViewSettingsModule");

      const bookmarkModule = rights.enableBookmarks
        ? new PdfBookmarkModule({
            annotator,
            publication,
            initialAnnotations: initialConfig.initialAnnotations,
            ...initialConfig.pdf?.bookmarks,
          })
        : undefined;
      const searchModule = rights.enableSearch
        ? new PdfSearchModule()
        : undefined;
      const annotationModule = rights.enableAnnotations
        ? new PdfAnnotationModule({
            viewStore: store,
            initialAnnotations: initialConfig.initialAnnotations,
            ...initialConfig.pdf?.annotations,
          })
        : undefined;
      const historyModule = rights.enableHistory
        ? new PdfHistoryModule()
        : undefined;
      // Top-level userSettings + api.updateSettings route here for PDF
      // (the same field that goes to EPUB's UserSettings for EPUB
      // publications and to AudiobookSettings for audiobook ones).
      const viewSettingsModule = new PdfViewSettingsModule({
        viewStore: store,
        initial: initialConfig.userSettings as
          | import("./modules/pdf/PdfViewSettingsModule").PdfViewSettingsState
          | null
          | undefined,
        api: initialConfig.api?.updateSettings
          ? {
              updateSettings: (state) =>
                initialConfig.api!.updateSettings!(
                  state as unknown as Record<string, unknown>
                ),
            }
          : undefined,
      });

      const navigator = await PDFNavigator.create({
        mainElement: mainElement,
        publication: publication,
        settings: settings,
        api: initialConfig.api,
        rights: rights,
        workerSrc: initialConfig.workerSrc,
        annotator: annotator,
        initialLastReadingPosition: initialConfig.lastReadingPosition,
        modules: [
          bookmarkModule,
          searchModule,
          annotationModule,
          historyModule,
          viewSettingsModule,
          ...(initialConfig.modules ?? []),
        ],
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
      // Positions/weights — skip if the epub file path already handled this.
      if (!epubZipFetcher) {
        const { HttpFetcher } = await import("./fetcher/HttpFetcher");
        const earlyFetcher = new HttpFetcher(initialConfig.requestConfig);

        if (rights.autoGeneratePositions) {
          await publication.autoGeneratePositions(
            initialConfig.requestConfig,
            async (href) => {
              const resource = await earlyFetcher.getByHref(href);
              return new TextEncoder().encode(resource.text).length;
            }
          );
        } else {
          if (initialConfig.services?.positions) {
            await publication.fetchPositionsFromService(
              initialConfig.services?.positions.href,
              earlyFetcher
            );
          }
          if (initialConfig.services?.weight) {
            await publication.fetchWeightsFromService(
              initialConfig.services?.weight.href,
              earlyFetcher
            );
          }
        }
      }

      const layers = await LayerSettings.create({ store: layerStore });

      // Settings
      const settings = await UserSettings.create({
        store: settingsStore,
        // EPUB owns the typography-shaped userSettings — the union at
        // the config level resolves to `Partial<InitialUserSettings>`
        // for an EPUB publication, so this cast is sound at runtime.
        initialUserSettings: initialConfig.userSettings as
          | Partial<
              import("./model/user-settings/UserSettings").InitialUserSettings
            >
          | null,
        headerMenu: headerMenu,
        api: initialConfig.api,
        injectables: publication.isFixedLayout
          ? initialConfig.injectablesFixed
          : initialConfig.injectables,
        layout: publication.isFixedLayout ? "fixed" : "reflowable",
        scriptMode: getScriptMode(publication),
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
        // null is the cache-wipe signal — the settings class handled
        // it on create(); past that point the navigator wants either
        // the config object or undefined.
        tts: initialConfig.tts ?? undefined,
        sample: initialConfig.sample,
        requestConfig: initialConfig.requestConfig,
        fetcher: epubZipFetcher,
        blobUrlManager: epubBlobUrlManager,
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
    this.asVisual()?.startReadAloud();
  };
  /** Stop TTS Read Aloud */
  stopReadAloud = () => {
    this.asVisual()?.stopReadAloud();
  };
  /** Pause TTS Read Aloud */
  pauseReadAloud = () => {
    this.asVisual()?.pauseReadAloud();
  };
  /** Resume TTS Read Aloud */
  resumeReadAloud = () => {
    this.asVisual()?.resumeReadAloud();
  };

  /**
   * Read Along
   */

  /** Start Media Overlay Read Along */
  startReadAlong = () => {
    this.asVisual()?.startReadAlong();
  };
  /** Stop Media Overlay Read Along */
  stopReadAlong = () => {
    this.asVisual()?.stopReadAlong();
  };
  /** Pause Media Overlay Read Along */
  pauseReadAlong = () => {
    this.asVisual()?.pauseReadAlong();
  };
  /** Resume Media Overlay Read Along */
  resumeReadAlong = () => {
    this.asVisual()?.resumeReadAlong();
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

  /**
   * Comments — free-text user notes anchored to a position. For audio,
   * anchored to `(href, time)` and shown during playback within each
   * comment's `displayBefore` / `displayAfter` window. The
   * `CommentsActive` event fires when the visible set changes.
   */
  /** Save a comment with the given body at the current position. */
  addComment = async (body: string): Promise<Comment | null> => {
    return (await this.navigator.modules.comments?.add(body)) ?? null;
  };
  /** Update an existing comment's body. Returns the updated comment or null. */
  updateComment = async (id: string, body: string): Promise<Comment | null> => {
    return (await this.navigator.modules.comments?.update(id, body)) ?? null;
  };
  /** Delete a previously saved comment. */
  deleteComment = async (comment: Comment): Promise<void> => {
    await this.navigator.modules.comments?.delete(comment);
  };
  /** All comments for the loaded publication, sorted by anchor time. */
  get comments(): Comment[] {
    return this.navigator.modules.comments?.list() ?? [];
  }
  /** Comments anchored at the given position (or current playback position). */
  findCommentsAt = (locator?: Locator): Comment[] => {
    return this.navigator.modules.comments?.findAt(locator) ?? [];
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
    this.asVisual()?.hideLayer(layer);
  };
  /** Show  Layer */
  showLayer = (layer) => {
    this.asVisual()?.showLayer(layer);
  };

  /** Activate Marker <br>
   * Activated Marker will be used for active annotation creation */
  activateMarker = (id: string, position: string) => {
    this.asVisual()?.activateMarker(id, position);
  };
  /** Deactivate Marker */
  deactivateMarker = () => {
    this.asVisual()?.deactivateMarker();
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
  /**
   * True if a bookmark exists at the given locator. When omitted, checks
   * the reader's current locator. Works for both EPUB and PDF.
   */
  hasBookmarkAt(locator?: Locator): boolean {
    return this.navigator.modules.bookmarks?.hasBookmarkAt(locator) ?? false;
  }
  /**
   * Saved bookmark at the given locator, or null. When omitted, returns
   * the bookmark at the reader's current locator. Works for both EPUB
   * and PDF.
   */
  findBookmarkAt(locator?: Locator): Bookmark | null {
    return this.navigator.modules.bookmarks?.findBookmarkAt(locator) ?? null;
  }
  /** Current Annotations. Works for both EPUB and PDF. */
  get annotations() {
    return this.navigator.modules.annotations?.getAll() ?? [];
  }

  get publicationLayout() {
    return this.navigator.publication.layout;
  }

  /**
   * Publication's derived script mode — `"ltr"`, `"rtl"`, `"cjk-horizontal"`,
   * `"cjk-vertical"`, or `"mongolian-vertical"`. Computed from
   * `metadata.languages` + `readingProgression`. Use to drive script-mode-
   * specific UI (e.g. timeline orientation, page-arrow placement).
   * Returns `undefined` if publication isn't available (e.g. PDF navigator
   * without an EPUB-shaped publication).
   */
  get scriptMode() {
    const publication = this.navigator.publication;
    if (!publication) return undefined;
    try {
      return getScriptMode(publication);
    } catch {
      return undefined;
    }
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
   * Audiobook playback
   *
   * Implemented by AudiobookNavigator. For EPUB and PDF navigators
   * the underlying optional methods are undefined — actions become
   * no-ops via optional chaining and getters return safe defaults.
   * Use `isAudiobook` to gate audiobook-only UI.
   */

  /** Begin playback. No-op for non-audiobook navigators. */
  play(): Promise<void> {
    return this.asAudio()?.play() ?? Promise.resolve();
  }

  /** Pause playback. */
  pause(): void {
    this.asAudio()?.pause();
  }

  /** Seek to a time in the current resource (seconds). */
  seek(seconds: number): void {
    this.asAudio()?.seek(seconds);
  }

  /** Jump by a relative offset (seconds; negative for backward). */
  jump(seconds: number): void {
    this.asAudio()?.jump(seconds);
  }

  /** Skip forward by `skipForwardInterval` (default 30s). */
  skipForward(): void {
    this.asAudio()?.skipForward();
  }

  /** Skip backward by `skipBackwardInterval` (default 15s). */
  skipBackward(): void {
    this.asAudio()?.skipBackward();
  }

  /** Advance to the next resource (chapter). Resumes playback if it was playing. */
  nextChapter(): Promise<void> {
    return this.asAudio()?.goForward() ?? Promise.resolve();
  }

  /** Return to the previous resource (chapter). Resumes playback if it was playing. */
  previousChapter(): Promise<void> {
    return this.asAudio()?.goBackward() ?? Promise.resolve();
  }

  /** Set playback rate (1.0 = normal). */
  setPlaybackRate(rate: number): void {
    this.asAudio()?.setPlaybackRate(rate);
  }

  /** Set volume in [0, 1]. */
  setVolume(value: number): void {
    this.asAudio()?.setVolume(value);
  }

  /** Set muted state (independent of volume). */
  setMuted(value: boolean): void {
    this.asAudio()?.setMuted(value);
  }

  /** Current playback time in seconds. 0 for non-audiobook. */
  get currentTime(): number {
    return this.asAudio()?.currentTime ?? 0;
  }

  /** Duration of the current resource in seconds. 0 for non-audiobook. */
  get duration(): number {
    return this.asAudio()?.duration ?? 0;
  }

  /** Whether audio is currently playing. False for non-audiobook. */
  get isPlaying(): boolean {
    return this.asAudio()?.isPlaying ?? false;
  }

  /** Whether audio is currently paused. True for non-audiobook (no audio to play). */
  get isPaused(): boolean {
    return this.asAudio()?.isPaused ?? true;
  }

  /**
   * Whether playback is currently waiting on audio data (cross-chapter
   * load, cold-start, or mid-playback rebuffer). False for non-audiobook.
   * Subscribe to `playback.waiting` event for change notifications.
   */
  get isWaiting(): boolean {
    return this.asAudio()?.isWaiting ?? false;
  }

  /** Current playback rate. 1 for non-audiobook. */
  get playbackRate(): number {
    return this.asAudio()?.playbackRate ?? 1;
  }

  /** Volume in [0, 1]. 1 for non-audiobook. */
  get volume(): number {
    return this.asAudio()?.volume ?? 1;
  }

  /** Muted state. False for non-audiobook. */
  get muted(): boolean {
    return this.asAudio()?.muted ?? false;
  }

  /**
   * Typed audiobook playback settings (volume, playbackRate, preservePitch,
   * skip intervals, pollInterval, autoPlay, enableMediaSession). Returns
   * `null` for non-audiobook publications.
   *
   * Settings are persisted via the same `LocalStorageStore` the reader uses
   * for EPUB/PDF preferences. Subscribe to `onChange` to keep UI in sync.
   */
  get audiobookSettings():
    | import("./model/user-settings/AudiobookSettings").AudiobookSettings
    | null {
    return this.asAudio()?.settings ?? null;
  }

  /**
   * The audiobook timeline module, or `null` when not enabled
   * (`rights.enableTimeline = false`) or when the publication is not
   * an audiobook. Provides whole-book progress math: cumulative
   * chapter offsets, total duration, and conversions between (chapter,
   * time) and absolute book time.
   *
   * Viewers should treat `null` as "no timeline support" and fall back
   * to a simple per-chapter scrubber.
   */
  get audiobookTimeline():
    | import("./modules/audiobook/AudiobookTimelineModule").AudiobookTimelineModule
    | null {
    const nav = this.asAudio();
    if (!nav) return null;
    return (
      nav.getModule<
        import("./modules/audiobook/AudiobookTimelineModule").AudiobookTimelineModule
      >("timeline") ?? null
    );
  }

  /**
   * Start a time-based sleep timer (audiobook only). Pauses playback after
   * `minutes` minutes of wall-clock time. Replaces any active timer.
   * No-op for non-audiobook publications.
   */
  startSleepTimerMinutes(minutes: number): void {
    this.asAudio()?.startSleepTimerMinutes(minutes);
  }

  /**
   * Arm the sleep timer to pause at the end of the current chapter
   * (audiobook only). Wins over `settings.autoPlay`. No-op for non-audiobook.
   */
  startSleepTimerAtChapterEnd(): void {
    this.asAudio()?.startSleepTimerAtChapterEnd();
  }

  /** Cancel the audiobook sleep timer if armed. Idempotent. No-op for non-audiobook. */
  cancelSleepTimer(): void {
    this.asAudio()?.cancelSleepTimer();
  }

  /**
   * Snapshot of the audiobook sleep timer state, or `null` if no timer is
   * armed (or non-audiobook publication). Subscribe to `SleepTimerTick`
   * for live countdown updates.
   */
  sleepTimerState():
    | import("./navigator/audio/SleepTimer").SleepTimerSnapshot
    | null {
    return this.asAudio()?.sleepTimerState() ?? null;
  }

  /** Whether there's a next resource (chapter) to advance to. False for non-audiobook. */
  get hasNextChapter(): boolean {
    return this.asAudio()?.canGoForward ?? false;
  }

  /** Whether there's a previous resource (chapter) to return to. False for non-audiobook. */
  get hasPreviousChapter(): boolean {
    return this.asAudio()?.canGoBackward ?? false;
  }

  /** Whether playback is at the start of the current resource. */
  get isTrackStart(): boolean {
    return this.asAudio()?.isTrackStart ?? false;
  }

  /** Whether playback is at the end of the current resource. */
  get isTrackEnd(): boolean {
    return this.asAudio()?.isTrackEnd ?? false;
  }

  /** True when the loaded publication is an audiobook. */
  get isAudiobook(): boolean {
    return this.asAudio() !== null;
  }

  /** The loaded publication. Useful when integrators need access to
   *  raw manifest fields beyond the convenience getters below. */
  get publication(): Publication {
    return this.navigator.publication;
  }

  /** The publication's metadata (title, author, language, etc.).
   *  Convenience for `publication.metadata`. */
  get metadata() {
    return this.navigator.publication.metadata;
  }

  /** Manifest `resources` array — supplementary files (cover image,
   *  alternate audio, etc.) referenced by the publication but not part
   *  of the readingOrder. */
  get resources() {
    return this.navigator.publication.resources;
  }

  /** Absolute URL of the publication's cover image, or `undefined`.
   *  Looks across links, resources, and readingOrder for `rel="cover"`,
   *  then falls back to any bitmap or SVG. Drop into `<img src=...>` or
   *  `background-image: url(...)` directly. For the underlying Link
   *  (height, width, type, etc.), use `publication.cover`. */
  get cover(): string | undefined {
    const link = this.navigator.publication.cover;
    if (!link?.href) return undefined;
    return this.navigator.publication.getAbsoluteHref(link.href);
  }

  /** The publication's timeline — readingOrder cross-referenced with
   *  the table of contents. Useful for chapter-aware UI: "what TOC
   *  entry is currently playing", search-result grouping, breadcrumbs.
   *  See `Publication.timeline` for the full API. */
  get timeline() {
    return this.navigator.publication.timeline;
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
    return this.asVisual()?.mostRecentNavigatedTocItem() ?? undefined;
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
    const visual = this.asVisual();
    if (visual && typeof visual.scroll === "function") {
      return visual.scroll(value, direction);
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
    return this.asVisual()?.positions() ?? [];
  }
  goTo = async (locator: Locator) => {
    await this.navigator.goTo(locator);
  };
  goToPosition = async (value: number) => {
    return this.navigator.goToPosition(value);
  };
  goToPage = async (page: number) => {
    await this.asVisual()?.goToPage(page);
  };
  fitToPage = () => {
    this.asVisual()?.fitToPage();
  };
  fitToWidth = () => {
    this.asVisual()?.fitToWidth();
  };
  zoomIn = () => {
    this.asVisual()?.zoomIn();
  };
  zoomOut = () => {
    this.asVisual()?.zoomOut();
  };
  activateHand = () => {
    this.asVisual()?.activateHand();
  };
  deactivateHand = () => {
    this.asVisual()?.deactivateHand();
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
    this.asVisual()?.nextPage();
  };
  previousPage = async () => {
    this.asVisual()?.previousPage();
  };
  get atStart() {
    return this.navigator.atStart();
  }
  get atEnd() {
    return this.navigator.atEnd();
  }
  snapToSelector = async (selector) => {
    this.asVisual()?.snapToSelector(selector);
  };
  /**
   * Update the navigator `IFrameAttributes` after the reader has been initialized.
   * Use this to change `margin`, `iframe.padding`, `safeArea`, or fixed-layout
   * attributes at runtime. The navigator re-applies them on the next resize.
   */
  applyAttributes = (value: IFrameAttributes) => {
    this.asVisual()?.applyAttributes(value);
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
