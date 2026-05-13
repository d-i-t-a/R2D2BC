/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * The top-level configuration `D2Reader.load()` accepts. This file
 * lives separately from any specific navigator (`EpubNavigator`,
 * `PDFNavigator`, `AudiobookNavigator`) because it spans all three —
 * EPUB-only options, PDF-only options, and audiobook-only options
 * coexist as optional fields in the same shape. Putting it inside any
 * one navigator file would make the others import sideways.
 */

import type { Bookmark, Annotation, ReadingPosition } from "../model/Locator";
import type { ReaderModule } from "../modules/ReaderModule";
import type { InitialUserSettings } from "../model/user-settings/UserSettings";
import type { TTSModuleConfig } from "../modules/epub/TTS/TTSSettings";
import type { SearchModuleConfig } from "../modules/epub/search/SearchModule";
import type { DefinitionsModuleConfig } from "../modules/epub/search/DefinitionsModule";
import type { ContentProtectionModuleConfig } from "../modules/epub/ContentProtectionModule";
import type { MediaOverlayModuleConfig } from "../modules/epub/mediaoverlays/MediaOverlayModule";
import type { PageBreakModuleConfig } from "../modules/epub/PageBreakModule";
import type { AnnotationModuleConfig } from "../modules/epub/AnnotationModule";
import type { BookmarkModuleConfig } from "../modules/epub/BookmarkModule";
import type { LineFocusModuleConfig } from "../modules/epub/LineFocusModule";
import type { CitationModuleConfig } from "../modules/epub/CitationModule";
import type { ConsumptionModuleConfig } from "../modules/epub/ConsumptionModule";
import type { TextHighlighterConfig } from "../modules/highlight/TextHighlighter";
import type { RequestConfig } from "../fetcher/types";
import type {
  NavigatorAPI,
  ReaderRights,
  Injectable,
  IFrameAttributes,
} from "./types";
import type { PublicationServices, SampleRead } from "./EpubNavigator";

/**
 * Shape of the initial annotations object passed to `D2Reader.load()`.
 * Both `bookmarks` and `highlights` are optional arrays of their respective types.
 */
export interface InitialAnnotations {
  bookmarks?: Bookmark[];
  highlights?: Annotation[];
}

export interface ReaderConfig {
  /** Pre-parsed publication manifest JSON — if omitted the manifest is fetched from `url`. */
  publication?: Record<string, unknown>;
  /**
   * Manifest URL (webpub from server). Required unless `epub` is provided.
   */
  url?: URL;
  /**
   * Open an .epub file directly — no server/streamer needed.
   * The reader parses the EPUB client-side (container.xml → OPF → manifest)
   * and serves content from the ZIP via ZipFetcher.
   *
   * Accepts:
   * - `File` or `Blob` — local file from drag-drop, file picker, IndexedDB
   * - `ArrayBuffer` — raw bytes already in memory
   * - `URL` or `string` — URL to a hosted .epub file (fetched automatically)
   *
   * Mutually exclusive with `url` (webpub manifest) — provide one or the other.
   */
  epub?: File | Blob | ArrayBuffer | URL | string;
  userSettings?: Partial<InitialUserSettings>;
  initialAnnotations?: InitialAnnotations;
  lastReadingPosition?: ReadingPosition;
  rights?: Partial<ReaderRights>;
  api?: Partial<NavigatorAPI>;
  tts?: Partial<TTSModuleConfig>;
  search?: Partial<SearchModuleConfig>;
  define?: Partial<DefinitionsModuleConfig>;
  protection?: Partial<ContentProtectionModuleConfig>;
  /** Config for @d-i-t-a/web-content-protection (used for PDF, future: replaces legacy protection) */
  webProtection?: import("@d-i-t-a/web-content-protection").ContentProtectionConfig;
  mediaOverlays?: Partial<MediaOverlayModuleConfig>;
  pagebreak?: Partial<PageBreakModuleConfig>;
  annotations?: Partial<AnnotationModuleConfig>;
  bookmarks?: Partial<BookmarkModuleConfig>;
  lineFocus?: Partial<LineFocusModuleConfig>;
  citations?: Partial<CitationModuleConfig>;
  consumption?: Partial<ConsumptionModuleConfig>;
  highlighter?: Partial<TextHighlighterConfig>;
  /** Custom modules to register alongside built-in modules */
  modules?: Array<ReaderModule<any>>;
  injectables: Array<Injectable>;
  injectablesFixed?: Array<Injectable>;
  useLocalStorage?: boolean;
  useStorageType?: string;
  attributes?: IFrameAttributes;
  services?: PublicationServices;
  sample?: SampleRead;
  requestConfig?: RequestConfig;
  /**
   * Override the PDF.js worker URL (PDF publications only).
   * Defaults to the unpkg CDN for the bundled pdfjs-dist version.
   * Set to a local path when self-hosting the worker, e.g. `"/viewer/pdf.worker.min.mjs"`.
   */
  workerSrc?: string;
  /**
   * Audiobook navigator configuration (audiobook publications only).
   * All audiobook-specific options live under this single field —
   * user settings, module configs, and navigator-level options —
   * so the top level of `ReaderConfig` isn't fragmented across many
   * `audiobookXxx` keys. EPUB and PDF expose their own configuration
   * surfaces at the top level; only audiobook nests its surface here.
   */
  audiobook?: {
    /**
     * Initial audiobook playback settings. Values here override
     * anything previously persisted via `LocalStorageStore`. Field
     * set + names match Readium ts-toolkit's `AudioPreferences` —
     * see `AudiobookSettings.ts` for documentation.
     */
    userSettings?: import("../model/user-settings/AudiobookSettings").InitialAudiobookSettings;
    /**
     * Audiobook timeline module config. When containers are supplied,
     * the module renders scrubber UI inside them; without containers
     * it runs in math-only mode for integrator-built UI.
     */
    timeline?: Partial<
      Omit<
        import("../modules/audiobook/AudiobookTimelineModule").AudiobookTimelineModuleConfig,
        "publication" | "settings"
      >
    >;
    /**
     * Audiobook bookmark module config. When `listContainer` is
     * supplied, the module renders a chapter-grouped bookmark list
     * inside it (time + delete action, click → seek). Without a
     * container the module is data-only. Gated by
     * `rights.enableBookmarks`.
     */
    bookmarks?: Partial<
      Omit<
        import("../modules/audiobook/AudiobookBookmarkModule").AudiobookBookmarkModuleConfig,
        "publication" | "annotator"
      >
    >;
    /**
     * Audiobook comments module config. When `listContainer` is
     * supplied, the module renders a chapter-grouped comment list
     * inside it (body, time, optional edit, delete). `onEdit` is the
     * integrator's edit-UX hook — without it the edit button is
     * hidden. Gated by `rights.enableComments`.
     */
    comments?: Partial<
      Omit<
        import("../modules/audiobook/AudiobookCommentsModule").AudiobookCommentsModuleConfig,
        "publication" | "annotator"
      >
    >;
    /**
     * Override the AudioWorklet URL for pitch preservation. Required
     * when bundling under classic CJS/UMD or IIFE outputs where
     * `import.meta.url` is unavailable. Point at the deployed copy
     * of `PreservePitchProcessor.js`, e.g.
     * `"/viewer/PreservePitchProcessor.js"`.
     */
    preservePitchWorkletUrl?: string | URL;
    /**
     * Container the chapter list renders into. When supplied, the
     * navigator writes its inner DOM (chapter rows, optional
     * sub-section rows, current-chapter highlight) inside; integrator
     * owns layout around it. Always available; no rights flag gates it.
     */
    chapterListContainer?: HTMLElement | null;
    /**
     * Color overrides for every audiobook UI surface (scrubber,
     * chapter list, bookmark list, comment list). Applied as inline
     * CSS custom properties on the document root so all
     * library-rendered audiobook DOM inherits them. Omit any field
     * to fall back to the SCSS default.
     */
    colors?: import("./AudiobookNavigator").AudiobookColors;
    /**
     * Head-of-chapter HTTP prefetch. Pre-warms the browser cache with
     * the first N bytes of every track on book open. Defaults:
     * `{ enabled: false, bytes: 262144, concurrency: 3 }`.
     */
    prefetch?: {
      enabled?: boolean;
      bytes?: number;
      concurrency?: number;
    };
  };
}
