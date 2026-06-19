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
import type { Comment } from "../model/v3";
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
 * Previously-persisted annotations passed to `D2Reader.load()` to
 * restore the annotator from external persistence (server, prior
 * session DB, file). Holds whatever a user has previously added on top
 * of a publication:
 *
 * - `bookmarks` — position markers. EPUB / PDF / Audiobook.
 * - `highlights` — text-anchored highlights. EPUB only.
 * - `comments` — time-anchored notes. Audiobook only.
 *
 * Each navigator's modules pick the field they care about and call
 * `annotator.initBookmarks` / `initAnnotations` / `initComments` on
 * `attach()` so the annotator is restored to the integrator's last
 * known state before the first `list()` call.
 */
export interface InitialAnnotations {
  bookmarks?: Bookmark[];
  highlights?: Annotation[];
  comments?: Comment[];
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
  /**
   * Integrator-supplied initial user settings. Shape depends on the
   * publication format being loaded — the library dispatches to the
   * matching settings class.
   *
   *   - EPUB      → `Partial<InitialUserSettings>` — typography,
   *                 theme, columns, alignment, etc.
   *   - PDF       → `PdfViewSettingsState` — scroll mode, spread,
   *                 scale, rotation.
   *   - Audiobook → `InitialAudiobookSettings` — volume, playback
   *                 rate, autoplay, etc.
   *
   * Tri-state contract is uniform across formats:
   *
   *   - `{...}`     → partial overrides on top of whatever's in the
   *                   local store.
   *   - `null`      → wipe the local cache and fall back to library
   *                   defaults. Use this for multi-user shared-browser
   *                   scenarios so a prior user's choices don't bleed
   *                   through.
   *   - `undefined` → leave the local store alone.
   */
  userSettings?:
    | Partial<InitialUserSettings>
    | import("../modules/pdf/PdfViewSettingsModule").PdfViewSettingsState
    | import("../model/user-settings/AudiobookSettings").InitialAudiobookSettings
    | null;
  initialAnnotations?: InitialAnnotations;
  /**
   * The user's saved last reading position, or an explicit signal that
   * they have none.
   *
   *   - `{...}`     → integrator owns state; the local store is
   *                   overwritten with this on load.
   *   - `null`      → integrator explicitly says no position. The
   *                   local store is **cleared** on load — use this for
   *                   multi-user shared-browser scenarios so a prior
   *                   user's stored position doesn't bleed into the
   *                   new user's session.
   *   - `undefined` → integrator isn't managing this; the local store
   *                   is read as-is.
   */
  lastReadingPosition?: ReadingPosition | null;
  rights?: Partial<ReaderRights>;
  api?: Partial<NavigatorAPI>;
  /**
   * EPUB TTS module config — initial overrides + api callbacks +
   * module deps in one block.
   *
   *   - `{...}`     → overrides + api wiring (current shape).
   *   - `null`      → wipe the TTS local cache, skip module init. Use
   *                   for multi-user shared-browser scenarios.
   *   - `undefined` → leave the local store alone (current default).
   */
  tts?: Partial<TTSModuleConfig> | null;
  search?: Partial<SearchModuleConfig>;
  define?: Partial<DefinitionsModuleConfig>;
  protection?: Partial<ContentProtectionModuleConfig>;
  /** Config for @d-i-t-a/web-content-protection (used for PDF, future: replaces legacy protection) */
  webProtection?: import("@d-i-t-a/web-content-protection").ContentProtectionConfig;
  /**
   * EPUB Media Overlay module config — initial overrides + api
   * callbacks + module deps in one block.
   *
   *   - `{...}`     → overrides + api wiring (current shape).
   *   - `null`      → wipe the MO local cache, skip module init.
   *   - `undefined` → leave the local store alone.
   */
  mediaOverlays?: Partial<MediaOverlayModuleConfig> | null;
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
  /**
   * PDF navigator config. Mirrors the audiobook nesting — PDF-specific
   * module configuration lives here rather than at the top level so
   * EPUB and PDF integrator config stays cleanly separated.
   */
  pdf?: {
    /**
     * PDF bookmark module config. Gated by `rights.enableBookmarks`.
     * Use `api` to receive write-through callbacks on save / delete.
     */
    bookmarks?: Partial<
      Omit<
        import("../modules/pdf/PdfBookmarkModule").PdfBookmarkModuleConfig,
        "publication" | "annotator"
      >
    >;
    /**
     * PDF annotation module config. Gated by `rights.enableAnnotations`.
     * Use `api.saveAnnotations` to receive a write-through callback on
     * every debounced save of the pdfjs editor state.
     */
    annotations?: Partial<
      Omit<
        import("../modules/pdf/PdfAnnotationModule").PdfAnnotationModuleConfig,
        "viewStore"
      >
    >;
  };
}
