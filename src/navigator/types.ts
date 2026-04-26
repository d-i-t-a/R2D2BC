/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { GetContent, GetContentBytesLength } from "../fetcher/types";
import type { Publication } from "../model/v3";

/**
 * Callbacks the integrator can supply for the reader to emit state changes
 * and delegate resource loading. Shared by EpubNavigator and PDFNavigator.
 */
export interface NavigatorAPI {
  updateSettings?: (settings: Record<string, unknown>) => Promise<void>;
  getContent: GetContent;
  getContentBytesLength: GetContentBytesLength;
  resourceReady?: () => void;
  resourceAtStart?: () => void;
  resourceAtEnd?: () => void;
  resourceFitsScreen?: () => void;
  updateCurrentLocation?: (
    locator: import("../model/Locator").ReadingPosition
  ) => Promise<void>;
  positionInfo?: (locator: import("../model/Locator").Locator) => void;
  chapterInfo?: (title: string | undefined) => void;
  keydownFallthrough?: (event: KeyboardEvent | undefined) => void;
  clickThrough?: (event: MouseEvent | TouchEvent) => void;
  direction?: (dir: string) => void;
  onError?: (e: Error) => void;
}

/**
 * Context passed to an injectable's `when` predicate. Lets integrators gate
 * per-resource / per-publication without us pre-computing a lot of metadata.
 *
 * `doc` is the parsed chapter XHTML document, provided for content inspection
 * (detect math, language, tables, publisher classes, etc.). Treat it as
 * read-only: mutations land in the written iframe and bypass the Injectable
 * API contract. Use injectables for injection, not `when`.
 */
export interface InjectableContext {
  publication: Publication;
  /** href of the resource about to be loaded into the iframe */
  resourceHref: string;
  /** Parsed XHTML document of the chapter. Read-only by convention. */
  doc: Document;
}

/**
 * Shared optional fields on every Injectable variant.
 */
interface BaseInjectable {
  /**
   * If provided, the injectable is skipped when this returns false.
   * Evaluated once per iframe load. Useful for per-resource or per-publication
   * gating that the `injectables` / `injectablesFixed` array split can't express.
   */
  when?: (ctx: InjectableContext) => boolean;
  /**
   * Extra HTML attributes to set on the injected `<link>` / `<script>` /
   * `<style>` element. Useful for CSP `nonce`, SRI `integrity`, `crossorigin`,
   * `media` queries on link tags, `data-*` attributes, etc.
   */
  attributes?: Record<string, string>;
}

/**
 * Inject a stylesheet as a `<link rel="stylesheet">` pointing at a URL, or
 * as a Blob converted to an object URL at runtime.
 *
 * One of `url` or `blob` is required.
 */
export interface StyleInjectable extends BaseInjectable {
  type: "style";
  url?: string;
  blob?: Blob;
  /** ReadiumCSS: inject before all other styles (first in head). */
  r2before?: boolean;
  /** ReadiumCSS: inject as the default stylesheet (second in head). */
  r2default?: boolean;
  /** ReadiumCSS: inject after all other styles (last in head). */
  r2after?: boolean;
  /**
   * Registers the font family with the reader's font picker. `UserSettings`
   * calls `addFont(fontFamily)` at init to extend the selectable list; the
   * navigator calls `initAddedFont()` after this stylesheet loads to refresh
   * the UI. The stylesheet should declare `@font-face` for this family.
   */
  fontFamily?: string;
  /**
   * System font declaration — no URL needed, the font is available on the
   * user's OS. Registers the family in the picker without loading a stylesheet.
   */
  systemFont?: boolean;
  /**
   * Registers an appearance name with the reader's appearance selector.
   * `UserSettings` calls `addAppearance(appearance)` at init; the navigator
   * calls `initAddedAppearance()` after this stylesheet loads. Typically set
   * on an `r2after` stylesheet that declares the appearance's custom properties.
   */
  appearance?: string;
}

/**
 * Inject a JS file as a `<script>` element pointing at a URL, or as a Blob
 * converted to an object URL at runtime.
 *
 * One of `url` or `blob` is required.
 */
export interface ScriptInjectable extends BaseInjectable {
  type: "script";
  url?: string;
  blob?: Blob;
  /** Load script asynchronously. */
  async?: boolean;
  /** Render as `<script type="module">`. */
  module?: boolean;
}

/**
 * Inject inline CSS — no HTTP round-trip. Rendered as a `<style>` element with
 * `source` as its text content.
 */
export interface InlineStyleInjectable extends BaseInjectable {
  type: "style-inline";
  source: string;
  /** ReadiumCSS: inject before all other styles (first in head). */
  r2before?: boolean;
  /** ReadiumCSS: inject as the default stylesheet (second in head). */
  r2default?: boolean;
  /** ReadiumCSS: inject after all other styles (last in head). */
  r2after?: boolean;
}

/**
 * Inject inline JS — no HTTP round-trip. Rendered as a `<script>` element with
 * `source` as its text content.
 */
export interface InlineScriptInjectable extends BaseInjectable {
  type: "script-inline";
  source: string;
  /** Load script asynchronously. */
  async?: boolean;
  /** Render as `<script type="module">`. */
  module?: boolean;
}

/**
 * Injectable — discriminated union keyed on `type`. Passed to the navigator
 * via `ReaderConfig.injectables` (and `injectablesFixed` for fixed-layout
 * publications). Every item in the chosen array is evaluated per iframe load.
 *
 * All variants inject into the iframe `<head>`. Integrators needing DOM
 * behaviour (click listeners, popup UI, glossary, analytics) write a normal
 * `type: "script"` injectable whose content attaches its own handlers inside
 * the iframe — the v2.5 pattern used by `injectables/click/click.ts` and
 * `injectables/mui/script.js`, unchanged.
 */
export type Injectable =
  | StyleInjectable
  | ScriptInjectable
  | InlineStyleInjectable
  | InlineScriptInjectable;

/**
 * Integrator-supplied configuration for iframe sizing and the selection
 * toolbox's safe-area avoidance.
 */
export interface IFrameAttributes {
  margin?: number;

  /**
   * Reflowable iframe styling. Not applied in fixed-layout publications.
   *
   * `padding` accepts a single number (same value on all four sides) or an
   * object with individual `top` / `bottom` / `left` / `right` values.
   */
  iframe?: {
    padding?:
      | number
      | {
          top?: number;
          bottom?: number;
          left?: number;
          right?: number;
        };
  };

  /** @deprecated Use `iframe.padding.top`. */
  iframePaddingTop?: number;

  /**
   * Integrator-provided "safe areas" at the top and/or bottom of the
   * viewport that the reader should avoid placing floating UI (selection
   * toolbox) over. Useful when the integrator renders fixed chrome
   * (navbar, progress bar, etc.) that overlays the reader.
   *
   * Each entry is a callback returning the element whose current height
   * should be reserved. The reader calls it at placement time and
   * measures `getBoundingClientRect().height`, so toggling visibility on
   * the element (e.g. `display: none` → 0 height) automatically reclaims
   * the space without any further config change.
   */
  safeArea?: {
    top?: () => Element | null;
    bottom?: () => Element | null;
  };

  /**
   * Scroll-mode viewport model. Opt-in.
   *
   * - `"host"` (default): iframe grows to its content height and
   *   `#iframe-wrapper` provides the scrollbar. Existing behaviour.
   * - `"iframe"`: iframe stays at viewport height and scrolls internally.
   *   Prevents the feedback loop when injected styles create a 100%
   *   height chain (e.g. `body { height: 100% }` on cover pages).
   *
   * Only affects scroll mode. Paginated and fixed-layout are unchanged.
   */
  scrollContainer?: "host" | "iframe";

  /** Margin (in px) around fixed-layout content. Defaults to 100. */
  fixedLayoutMargin?: number;
  /** Whether to show a drop shadow on fixed-layout spreads. Defaults to true. */
  fixedLayoutShadow?: boolean;
}

/**
 * Feature toggles gating which modules are loaded and which reader
 * capabilities are exposed. Shared by EpubNavigator and PDFNavigator.
 */
export interface ReaderRights {
  enableBookmarks: boolean;
  enableAnnotations: boolean;
  enableTTS: boolean;
  enableSearch: boolean;
  enableDefinitions: boolean;
  enableContentProtection: boolean;
  enableTimeline: boolean;
  autoGeneratePositions: boolean;
  enableMediaOverlays: boolean;
  enablePageBreaks: boolean;
  enableLineFocus: boolean;
  customKeyboardEvents: boolean;
  enableHistory: boolean;
  enableCitations: boolean;
  enableConsumption: boolean;
}
