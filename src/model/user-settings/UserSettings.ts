/*
 * Copyright 2018-2020 DITA (AM Consulting LLC)
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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import Store from "../../store/Store";
import {
  Enumerable,
  Incremental,
  Stringable,
  Switchable,
  UserProperties,
  UserProperty,
  UserSettingsIncrementable,
} from "./UserProperties";
import {
  APPEARANCE_COLOR_PRESETS,
  APPEARANCE_IMAGE_FILTERS,
  AppearanceValue,
  pageMarginsToLineLength,
  ReadiumCSS,
  resolveAutoColumns,
} from "./ReadiumCSS";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import * as BrowserUtilities from "../../utils/BrowserUtilities";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { Injectable } from "../../navigator/EpubNavigator";
import type { NavigatorAPI } from "../../navigator/types";
import ColumnRenderer from "../../views/ColumnRenderer";
import ScrollRenderer from "../../views/ScrollRenderer";
import VerticalRenderer from "../../views/VerticalRenderer";
import FixedRenderer from "../../views/FixedRenderer";
import Renderer from "../../views/Renderer";
import type { ScriptMode } from "../../utils/ScriptMode";
import log from "loglevel";

/**
 * Parse a stored image-filter setting (Stringable round-tripped from
 * boolean | number) back to its original union type. `"true"` / `"false"`
 * become booleans; numeric strings become numbers; anything else returns
 * the supplied fallback.
 */
function parseImageFilter(
  stored: string | undefined | null,
  fallback: boolean | number
): boolean | number {
  if (stored === undefined || stored === null) return fallback;
  if (stored === "true") return true;
  if (stored === "false") return false;
  const n = parseFloat(stored);
  return Number.isFinite(n) ? n : fallback;
}

export interface UserSettingsConfig {
  /** Store to save the user's selections in. */
  store: Store;
  initialUserSettings?: Partial<InitialUserSettings>;
  headerMenu?: HTMLElement | null;
  api?: Partial<NavigatorAPI>;
  injectables?: Array<Injectable>;
  layout: string;
  /**
   * Script mode of the publication, derived from `getScriptMode(publication)`.
   * Lets the constructor pick the correct initial renderer (and direction
   * flag) without waiting for EpubNavigator to set it later. Default `"ltr"`
   * for back-compat with callers that don't pass it.
   */
  scriptMode?: ScriptMode;
}
export interface UserSettingsUIConfig {
  fontSize?: boolean;
  fontFamily?: boolean;
  fontOverride: boolean;
  appearance?: boolean;
  scroll?: boolean;
  // advancedSettings: boolean;
  textAlign?: boolean;
  colCount?: boolean;
  wordSpacing?: boolean;
  letterSpacing?: boolean;
  pageMargins: boolean;
  lineHeight: boolean;
}

/**
 * The shape of the UserSettings class.
 */
export interface IUserSettings {
  fontSize: number;
  fontOverride: boolean;
  fontFamily: number;
  appearance: any;
  verticalScroll: boolean;

  //Advanced settings
  // publisherDefaults: boolean;
  textAlignment: number;
  columnCount: number;
  direction: number;
  wordSpacing: number;
  letterSpacing: number;
  pageMargins: number;
  lineHeight: number;
  bodyHyphens: boolean;
  paraSpacing: number;
  paraIndent: number;
  typeScale: number;
  backgroundColor: string;
  textColor: string;

  // v2-only (silently no-op on v1 CSS).
  // When pageMargins is set, lineLength is derived automatically via
  // pageMarginsToLineLength(). lineLength here lets an integrator override
  // with a direct CSS value (e.g. "80%", "40rem").
  lineLength: string;
  fontWeight: number;
  fontWidth: number;
  fontOpticalSizing: boolean;
  ligatures: "none" | "common-ligatures";
  // v2 image filters accept either a boolean (toggles the on/off flag) or a
  // number (0..1 for precise amount) — a numeric value takes precedence
  // over the boolean flag.
  blendImages: boolean;
  darkenImages: boolean | number;
  invertImages: boolean | number;
  invertGaiji: boolean | number;
  linkColor: string;
  visitedColor: string;
  selectionBackgroundColor: string;
  selectionTextColor: string;
  scrollPaddingTop: string;
  scrollPaddingBottom: string;
  scrollPaddingLeft: string;
  scrollPaddingRight: string;
}

/**
 * The settings that someone might pass in when instantiating
 * the reader. Differs from the internal settings values for
 * backwards compatibility.
 */
export interface InitialUserSettings {
  fontSize: number;
  fontOverride?: boolean | "readium-font-on" | "readium-font-off";
  fontFamily: number;
  appearance: any;
  verticalScroll?:
    | boolean
    | "readium-scroll-on"
    | "readium-scroll-off"
    | "scroll"
    | "paginated";

  //Advanced settings
  // publisherDefaults?: boolean | "readium-advanced-on" | "readium-advanced-off";
  textAlignment: number;
  columnCount: number;
  direction: string;
  wordSpacing: number;
  letterSpacing: number;
  pageMargins: number;
  lineHeight: number;
  bodyHyphens?: boolean;
  paraSpacing?: number;
  paraIndent?: number;
  typeScale?: number;
  backgroundColor?: string;
  textColor?: string;

  // v2-only — all optional, silently no-op on v1 CSS
  lineLength?: string;
  fontWeight?: number;
  fontWidth?: number;
  fontOpticalSizing?: boolean;
  ligatures?: "none" | "common-ligatures";
  blendImages?: boolean;
  darkenImages?: boolean | number;
  invertImages?: boolean | number;
  invertGaiji?: boolean | number;
  linkColor?: string;
  visitedColor?: string;
  selectionBackgroundColor?: string;
  selectionTextColor?: string;
  scrollPaddingTop?: string;
  scrollPaddingBottom?: string;
  scrollPaddingLeft?: string;
  scrollPaddingRight?: string;
}

export class UserSettings implements IUserSettings {
  async isPaginated() {
    // Vertical scripts (cjk-vertical / mongolian-vertical) are scroll-only
    // by design — VerticalRenderer ignores the persisted `verticalScroll`
    // setting. Report scroll here too so navigator chrome (page arrows,
    // column-count UI) doesn't fall back to paginated state from a prior
    // book's setting.
    if (this.isVerticalScript) return false;
    let scroll = await this.getPropertyAndFallback<Switchable>(
      "verticalScroll",
      ReadiumCSS.SCROLL_KEY
    );

    return !scroll;
  }
  async isScrollMode() {
    return !(await this.isPaginated());
  }

  private readonly store: Store;
  private readonly USERSETTINGS = "userSetting";

  private static appearanceValues = [
    "readium-default-on",
    "readium-sepia-on",
    "readium-night-on",
  ];
  private static fontFamilyValues = ["Original", "serif", "sans-serif"];
  private static readonly textAlignmentValues = ["auto", "justify", "start"];
  private static readonly columnCountValues = ["auto", "1", "2", "3", "4"];
  private static readonly directionValues = ["auto", "ltr", "rtl"];

  fontSize = 100.0;
  fontOverride = false;
  fontFamily = 0;
  appearance: any = 0;
  verticalScroll = true;

  //Advanced settings
  // publisherDefaults = true;
  textAlignment = 0;
  columnCount = 0;
  direction = 0;
  wordSpacing = 0.0;
  letterSpacing = 0.0;
  pageMargins = 2.0;
  lineHeight = 1.0;
  bodyHyphens = false;
  paraSpacing = 0.0;
  paraIndent = 1.0;
  typeScale = 1.2;
  backgroundColor = "";
  textColor = "";

  // v2-only settings (no-op when integrator has injected v1 CSS)
  lineLength = ""; // empty = derive from pageMargins
  fontWeight = 400;
  fontWidth = 100;
  fontOpticalSizing = true;
  ligatures: "none" | "common-ligatures" = "common-ligatures";
  blendImages = false;
  darkenImages: boolean | number = false;
  invertImages: boolean | number = false;
  invertGaiji: boolean | number = false;
  linkColor = "";
  visitedColor = "";
  selectionBackgroundColor = "";
  selectionTextColor = "";
  // Scroll-view padding defaults. Must be non-zero so the cjk-vertical
  // bundle's body padding rule (matched via `[style*="--RS__scrollPaddingX"]`)
  // bounds body's content area — without bounded padding, vertical-rl
  // content layout doesn't converge (body.scrollWidth grows on every
  // reflow as `columns: auto auto` keeps fitting one more column into
  // the slightly-wider iframe). 20px is a reasonable default page gutter;
  // integrators can override via `initialUserSettings`.
  scrollPaddingTop = "20";
  scrollPaddingBottom = "20";
  scrollPaddingLeft = "20";
  scrollPaddingRight = "20";

  userProperties?: UserProperties;

  // Definite-assignment: assigned by `selectInitialRenderer()`, which
  // the factory calls after `initialise()` + integrator overrides have
  // settled `verticalScroll`/`scriptMode`/`layout`. Unassigned during
  // the constructor so we don't pick a renderer against a stale scroll
  // preference and immediately swap it (throwaway).
  view!: Renderer;

  /** Stashed in the constructor, consumed by `selectInitialRenderer()`. */
  private layout?: string;

  private settingsChangeCallback: () => void = () => {};
  private settingsColumnsChangeCallback: () => void = () => {};
  private viewChangeCallback: () => void = () => {};

  private settingsView: HTMLDivElement;
  private readonly headerMenu?: HTMLElement | null;
  api?: Partial<NavigatorAPI>;
  injectables?: Array<Injectable>;

  private iframe: HTMLIFrameElement;

  // Debounced resize handler — re-applies properties when colCount is "auto"
  // so v2 ReadiumCSS (which has no media queries) switches columns on resize.
  private resizeTimer: number | null = null;
  private readonly onWindowResize = () => {
    const colCountRef = this.userProperties?.getByRef(
      ReadiumCSS.COLUMN_COUNT_REF
    );
    if (colCountRef?.toString() !== "auto") return;
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.applyProperties();
    }, 150);
  };

  public static async create(config: UserSettingsConfig): Promise<any> {
    const settings = new this(
      config.store,
      config.headerMenu,
      config.api,
      config.injectables,
      config.layout,
      config.scriptMode
    );
    await settings.initialise();

    if (config.initialUserSettings) {
      if (!settings.userProperties) {
        settings.userProperties = settings.getUserSettings();
      }
      let initialUserSettings = config.initialUserSettings;
      if (initialUserSettings.verticalScroll !== undefined) {
        settings.verticalScroll = this.parseScrollSetting(
          initialUserSettings.verticalScroll
        );
        let prop = settings.userProperties.getByRef(ReadiumCSS.SCROLL_REF);
        if (prop) {
          prop.value = settings.verticalScroll;
          await settings.saveProperty(prop);
        }
        log.log(settings.verticalScroll);
      }
      if (initialUserSettings.appearance) {
        settings.appearance = UserSettings.parseAppearanceSetting(
          initialUserSettings.appearance
        );
        let prop = settings.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF);
        if (prop) {
          prop.value = settings.appearance;
          await settings.saveProperty(prop);
        }
        log.log(settings.appearance);
      }
      if (initialUserSettings.fontSize) {
        settings.fontSize = initialUserSettings.fontSize;
        let prop = settings.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF);
        if (prop) {
          prop.value = settings.fontSize;
          await settings.saveProperty(prop);
        }
        log.log(settings.fontSize);
      }
      if (initialUserSettings.fontFamily) {
        settings.fontFamily = UserSettings.fontFamilyValues.findIndex(
          (el: any) => el === initialUserSettings.fontFamily
        );
        let prop = settings.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF);
        if (prop) {
          prop.value = settings.fontFamily;
          await settings.saveProperty(prop);
        }
        log.log(settings.fontFamily);
        if (settings.fontFamily !== 0) {
          settings.fontOverride = true;
        }
      }
      if (initialUserSettings.textAlignment) {
        settings.textAlignment = UserSettings.textAlignmentValues.findIndex(
          (el: any) => el === initialUserSettings.textAlignment
        );
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.TEXT_ALIGNMENT_REF
        );
        if (prop) {
          prop.value = settings.textAlignment;
          await settings.saveProperty(prop);
        }
        // settings.publisherDefaults = false;
        log.log(settings.textAlignment);
      }
      if (initialUserSettings.columnCount) {
        settings.columnCount = UserSettings.columnCountValues.findIndex(
          (el: any) => el === initialUserSettings.columnCount
        );
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.COLUMN_COUNT_REF
        );
        if (prop) {
          prop.value = settings.columnCount;
          await settings.saveProperty(prop);
        }
        log.log(settings.columnCount);
      }
      if (initialUserSettings.direction) {
        settings.direction = UserSettings.directionValues.findIndex(
          (el: any) => el === initialUserSettings.direction
        );
        let prop = settings.userProperties.getByRef(ReadiumCSS.DIRECTION_REF);
        if (prop) {
          prop.value = settings.direction;
          await settings.saveProperty(prop);
        }
        log.log(settings.direction);
      }
      if (initialUserSettings.wordSpacing) {
        settings.wordSpacing = initialUserSettings.wordSpacing;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.WORD_SPACING_REF
        );
        if (prop) {
          prop.value = settings.wordSpacing;
          await settings.saveProperty(prop);
        }
        log.log(settings.wordSpacing);
      }
      if (initialUserSettings.letterSpacing) {
        settings.letterSpacing = initialUserSettings.letterSpacing;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.LETTER_SPACING_REF
        );
        if (prop) {
          prop.value = settings.letterSpacing;
          await settings.saveProperty(prop);
        }
        log.log(settings.letterSpacing);
      }
      if (initialUserSettings.pageMargins) {
        settings.pageMargins = initialUserSettings.pageMargins;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.PAGE_MARGINS_REF
        );
        if (prop) {
          prop.value = settings.pageMargins;
          await settings.saveProperty(prop);
        }
        log.log(settings.pageMargins);
      }
      if (initialUserSettings.lineHeight) {
        settings.lineHeight = initialUserSettings.lineHeight;
        let prop = settings.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF);
        if (prop) {
          prop.value = settings.lineHeight;
          await settings.saveProperty(prop);
        }
        log.log(settings.lineHeight);
      }
      if (initialUserSettings.bodyHyphens !== undefined) {
        settings.bodyHyphens = initialUserSettings.bodyHyphens;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.BODY_HYPHENS_REF
        );
        if (prop) {
          prop.value = settings.bodyHyphens;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.paraSpacing !== undefined) {
        settings.paraSpacing = initialUserSettings.paraSpacing;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.PARA_SPACING_REF
        );
        if (prop) {
          prop.value = settings.paraSpacing;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.paraIndent !== undefined) {
        settings.paraIndent = initialUserSettings.paraIndent;
        let prop = settings.userProperties.getByRef(ReadiumCSS.PARA_INDENT_REF);
        if (prop) {
          prop.value = settings.paraIndent;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.typeScale !== undefined) {
        settings.typeScale = initialUserSettings.typeScale;
        let prop = settings.userProperties.getByRef(ReadiumCSS.TYPE_SCALE_REF);
        if (prop) {
          prop.value = settings.typeScale;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.backgroundColor !== undefined) {
        settings.backgroundColor = initialUserSettings.backgroundColor;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.BACKGROUND_COLOR_REF
        );
        if (prop) {
          prop.value = settings.backgroundColor;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.textColor !== undefined) {
        settings.textColor = initialUserSettings.textColor;
        let prop = settings.userProperties.getByRef(ReadiumCSS.TEXT_COLOR_REF);
        if (prop) {
          prop.value = settings.textColor;
          await settings.saveProperty(prop);
        }
      }

      // --- v2-only settings ---
      if (initialUserSettings.lineLength !== undefined) {
        settings.lineLength = initialUserSettings.lineLength;
        let prop = settings.userProperties.getByRef(ReadiumCSS.LINE_LENGTH_REF);
        if (prop) {
          prop.value = settings.lineLength;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.fontWeight !== undefined) {
        settings.fontWeight = initialUserSettings.fontWeight;
        let prop = settings.userProperties.getByRef(ReadiumCSS.FONT_WEIGHT_REF);
        if (prop) {
          prop.value = settings.fontWeight;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.fontWidth !== undefined) {
        settings.fontWidth = initialUserSettings.fontWidth;
        let prop = settings.userProperties.getByRef(ReadiumCSS.FONT_WIDTH_REF);
        if (prop) {
          prop.value = settings.fontWidth;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.fontOpticalSizing !== undefined) {
        settings.fontOpticalSizing = initialUserSettings.fontOpticalSizing;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.FONT_OPTICAL_SIZING_REF
        );
        if (prop) {
          prop.value = settings.fontOpticalSizing;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.ligatures !== undefined) {
        settings.ligatures = initialUserSettings.ligatures;
        let prop = settings.userProperties.getByRef(ReadiumCSS.LIGATURES_REF);
        if (prop) {
          prop.value = settings.ligatures;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.blendImages !== undefined) {
        settings.blendImages = initialUserSettings.blendImages;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.BLEND_IMAGES_REF
        );
        if (prop) {
          prop.value = settings.blendImages;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.darkenImages !== undefined) {
        settings.darkenImages = initialUserSettings.darkenImages;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.DARKEN_IMAGES_REF
        );
        if (prop) {
          prop.value = String(settings.darkenImages);
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.invertImages !== undefined) {
        settings.invertImages = initialUserSettings.invertImages;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.INVERT_IMAGES_REF
        );
        if (prop) {
          prop.value = String(settings.invertImages);
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.invertGaiji !== undefined) {
        settings.invertGaiji = initialUserSettings.invertGaiji;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.INVERT_GAIJI_REF
        );
        if (prop) {
          prop.value = String(settings.invertGaiji);
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.linkColor !== undefined) {
        settings.linkColor = initialUserSettings.linkColor;
        let prop = settings.userProperties.getByRef(ReadiumCSS.LINK_COLOR_REF);
        if (prop) {
          prop.value = settings.linkColor;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.visitedColor !== undefined) {
        settings.visitedColor = initialUserSettings.visitedColor;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.VISITED_COLOR_REF
        );
        if (prop) {
          prop.value = settings.visitedColor;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.selectionBackgroundColor !== undefined) {
        settings.selectionBackgroundColor =
          initialUserSettings.selectionBackgroundColor;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.SELECTION_BACKGROUND_COLOR_REF
        );
        if (prop) {
          prop.value = settings.selectionBackgroundColor;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.selectionTextColor !== undefined) {
        settings.selectionTextColor = initialUserSettings.selectionTextColor;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.SELECTION_TEXT_COLOR_REF
        );
        if (prop) {
          prop.value = settings.selectionTextColor;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.scrollPaddingTop !== undefined) {
        settings.scrollPaddingTop = initialUserSettings.scrollPaddingTop;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.SCROLL_PADDING_TOP_REF
        );
        if (prop) {
          prop.value = settings.scrollPaddingTop;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.scrollPaddingBottom !== undefined) {
        settings.scrollPaddingBottom = initialUserSettings.scrollPaddingBottom;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.SCROLL_PADDING_BOTTOM_REF
        );
        if (prop) {
          prop.value = settings.scrollPaddingBottom;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.scrollPaddingLeft !== undefined) {
        settings.scrollPaddingLeft = initialUserSettings.scrollPaddingLeft;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.SCROLL_PADDING_LEFT_REF
        );
        if (prop) {
          prop.value = settings.scrollPaddingLeft;
          await settings.saveProperty(prop);
        }
      }
      if (initialUserSettings.scrollPaddingRight !== undefined) {
        settings.scrollPaddingRight = initialUserSettings.scrollPaddingRight;
        let prop = settings.userProperties.getByRef(
          ReadiumCSS.SCROLL_PADDING_RIGHT_REF
        );
        if (prop) {
          prop.value = settings.scrollPaddingRight;
          await settings.saveProperty(prop);
        }
      }

      settings.userProperties = settings.getUserSettings();
      await settings.initialise();
    }
    await settings.initializeSelections();
    // Construct the initial renderer now that all view-determining
    // settings (layout, scriptMode, verticalScroll) have settled. No
    // throwaway construct + swap.
    settings.selectInitialRenderer();
    return new Promise((resolve) => resolve(settings));
  }

  protected constructor(
    store: Store,
    headerMenu?: HTMLElement | null,
    api?: Partial<NavigatorAPI>,
    injectables?: Array<Injectable>,
    layout?: string,
    scriptMode?: ScriptMode
  ) {
    this.store = store;
    if (scriptMode) this.scriptMode = scriptMode;
    this.layout = layout;
    // Renderer is NOT constructed here. The factory calls
    // `selectInitialRenderer()` after `initialise()` + integrator
    // overrides resolve `verticalScroll`, so we pick the right one up
    // front (no throwaway construct + swap).

    this.headerMenu = headerMenu;
    this.api = api;
    this.injectables = injectables;

    this.injectables?.forEach((injectable) => {
      if (injectable.type === "style") {
        if (injectable.fontFamily) {
          this.addFont(injectable.fontFamily);
        }
        if (injectable.appearance) {
          this.addAppearance(injectable.appearance);
        }
      }
    });
  }

  stop() {
    log.log("book settings stop");
    window.removeEventListener("resize", this.onWindowResize);
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  private async initialise() {
    this.appearance = await this.getPropertyAndFallback<Enumerable>(
      "appearance",
      ReadiumCSS.APPEARANCE_KEY
    );

    this.verticalScroll = await this.getPropertyAndFallback<Switchable>(
      "verticalScroll",
      ReadiumCSS.SCROLL_KEY
    );
    this.fontFamily = await this.getPropertyAndFallback<Enumerable>(
      "fontFamily",
      ReadiumCSS.FONT_FAMILY_KEY
    );

    if (this.fontFamily !== 0) {
      this.fontOverride = true;
    }
    // this.publisherDefaults =
    //   (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY)) != null
    //     ? ((await this.getProperty(
    //         ReadiumCSS.PUBLISHER_DEFAULT_KEY
    //       )) as Switchable).value
    //     : this.publisherDefaults;
    this.textAlignment = await this.getPropertyAndFallback<Enumerable>(
      "textAlignment",
      ReadiumCSS.TEXT_ALIGNMENT_KEY
    );
    this.columnCount = await this.getPropertyAndFallback<Enumerable>(
      "columnCount",
      ReadiumCSS.COLUMN_COUNT_KEY
    );
    this.direction = await this.getPropertyAndFallback<Enumerable>(
      "direction",
      ReadiumCSS.DIRECTION_KEY
    );

    this.fontSize = await this.getPropertyAndFallback<Incremental>(
      "fontSize",
      ReadiumCSS.FONT_SIZE_KEY
    );

    this.wordSpacing = await this.getPropertyAndFallback<Incremental>(
      "wordSpacing",
      ReadiumCSS.WORD_SPACING_KEY
    );
    this.letterSpacing = await this.getPropertyAndFallback<Incremental>(
      "letterSpacing",
      ReadiumCSS.LETTER_SPACING_KEY
    );
    this.pageMargins = await this.getPropertyAndFallback<Incremental>(
      "pageMargins",
      ReadiumCSS.PAGE_MARGINS_KEY
    );
    this.lineHeight = await this.getPropertyAndFallback<Incremental>(
      "lineHeight",
      ReadiumCSS.LINE_HEIGHT_KEY
    );
    this.bodyHyphens = await this.getPropertyAndFallback<Switchable>(
      "bodyHyphens",
      ReadiumCSS.BODY_HYPHENS_KEY
    );
    this.paraSpacing = await this.getPropertyAndFallback<Incremental>(
      "paraSpacing",
      ReadiumCSS.PARA_SPACING_KEY
    );
    this.paraIndent = await this.getPropertyAndFallback<Incremental>(
      "paraIndent",
      ReadiumCSS.PARA_INDENT_KEY
    );
    this.typeScale = await this.getPropertyAndFallback<Incremental>(
      "typeScale",
      ReadiumCSS.TYPE_SCALE_KEY
    );
    this.backgroundColor = await this.getPropertyAndFallback<Stringable>(
      "backgroundColor",
      ReadiumCSS.BACKGROUND_COLOR_KEY
    );
    this.textColor = await this.getPropertyAndFallback<Stringable>(
      "textColor",
      ReadiumCSS.TEXT_COLOR_KEY
    );

    // --- v2-only fields (read back via getPropertyAndFallback so user
    // overrides via applyUserSettings persist across reloads) ---
    this.lineLength = await this.getPropertyAndFallback<Stringable>(
      "lineLength",
      ReadiumCSS.LINE_LENGTH_KEY
    );
    this.fontOpticalSizing = await this.getPropertyAndFallback<Switchable>(
      "fontOpticalSizing",
      ReadiumCSS.FONT_OPTICAL_SIZING_KEY
    );
    const ligaturesValue = await this.getPropertyAndFallback<Stringable>(
      "ligatures",
      ReadiumCSS.LIGATURES_KEY
    );
    this.ligatures =
      ligaturesValue === "none" || ligaturesValue === "common-ligatures"
        ? ligaturesValue
        : this.ligatures;
    this.blendImages = await this.getPropertyAndFallback<Switchable>(
      "blendImages",
      ReadiumCSS.BLEND_IMAGES_KEY
    );
    this.darkenImages = parseImageFilter(
      await this.getPropertyAndFallback<Stringable>(
        "darkenImages",
        ReadiumCSS.DARKEN_IMAGES_KEY
      ),
      this.darkenImages
    );
    this.invertImages = parseImageFilter(
      await this.getPropertyAndFallback<Stringable>(
        "invertImages",
        ReadiumCSS.INVERT_IMAGES_KEY
      ),
      this.invertImages
    );
    this.invertGaiji = parseImageFilter(
      await this.getPropertyAndFallback<Stringable>(
        "invertGaiji",
        ReadiumCSS.INVERT_GAIJI_KEY
      ),
      this.invertGaiji
    );
    this.linkColor = await this.getPropertyAndFallback<Stringable>(
      "linkColor",
      ReadiumCSS.LINK_COLOR_KEY
    );
    this.visitedColor = await this.getPropertyAndFallback<Stringable>(
      "visitedColor",
      ReadiumCSS.VISITED_COLOR_KEY
    );
    this.selectionBackgroundColor =
      await this.getPropertyAndFallback<Stringable>(
        "selectionBackgroundColor",
        ReadiumCSS.SELECTION_BACKGROUND_COLOR_KEY
      );
    this.selectionTextColor = await this.getPropertyAndFallback<Stringable>(
      "selectionTextColor",
      ReadiumCSS.SELECTION_TEXT_COLOR_KEY
    );
    this.scrollPaddingTop = await this.getPropertyAndFallback<Stringable>(
      "scrollPaddingTop",
      ReadiumCSS.SCROLL_PADDING_TOP_KEY
    );
    this.scrollPaddingBottom = await this.getPropertyAndFallback<Stringable>(
      "scrollPaddingBottom",
      ReadiumCSS.SCROLL_PADDING_BOTTOM_KEY
    );
    this.scrollPaddingLeft = await this.getPropertyAndFallback<Stringable>(
      "scrollPaddingLeft",
      ReadiumCSS.SCROLL_PADDING_LEFT_KEY
    );
    this.scrollPaddingRight = await this.getPropertyAndFallback<Stringable>(
      "scrollPaddingRight",
      ReadiumCSS.SCROLL_PADDING_RIGHT_KEY
    );

    window.addEventListener("resize", this.onWindowResize);
    this.userProperties = this.getUserSettings();
  }

  private async reset() {
    this.appearance = 0;
    this.verticalScroll = true;
    this.fontSize = 100.0;
    this.fontOverride = false;
    this.fontFamily = 0;

    //Advanced settings
    // this.publisherDefaults = true;
    this.textAlignment = 0;
    this.columnCount = 0;
    this.direction = 0;
    this.wordSpacing = 0.0;
    this.letterSpacing = 0.0;
    this.pageMargins = 2.0;
    this.lineHeight = 1.0;
    this.bodyHyphens = false;
    this.paraSpacing = 0.0;
    this.paraIndent = 1.0;
    this.typeScale = 1.2;
    this.backgroundColor = "";
    this.textColor = "";

    // v2-only field defaults — match the field-declaration defaults at top
    // of the class so reset truly returns to factory state.
    this.lineLength = "";
    this.fontWeight = 400;
    this.fontWidth = 100;
    this.fontOpticalSizing = true;
    this.ligatures = "common-ligatures";
    this.blendImages = false;
    this.darkenImages = false;
    this.invertImages = false;
    this.invertGaiji = false;
    this.linkColor = "";
    this.visitedColor = "";
    this.selectionBackgroundColor = "";
    this.selectionTextColor = "";
    this.scrollPaddingTop = "20";
    this.scrollPaddingBottom = "20";
    this.scrollPaddingLeft = "20";
    this.scrollPaddingRight = "20";

    this.userProperties = this.getUserSettings();

    let doc = this.iframe.contentDocument;
    if (doc) {
      const html = HTMLUtilities.findIframeElement(
        doc,
        "html"
      ) as HTMLHtmlElement;
      if (html) {
        const rootElement =
          HTMLUtilities.findElement(document, "#root") ||
          document.documentElement;
        const body = HTMLUtilities.findElement(html, "body");

        // // Apply publishers default
        // html.style.removeProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY);
        // Apply font size
        html.style.removeProperty(ReadiumCSS.FONT_SIZE_KEY);
        // Apply word spacing
        html.style.removeProperty(ReadiumCSS.WORD_SPACING_KEY);
        // Apply letter spacing
        html.style.removeProperty(ReadiumCSS.LETTER_SPACING_KEY);
        // Apply column count
        html.style.removeProperty(ReadiumCSS.COLUMN_COUNT_KEY);
        // Apply direction
        html.style.removeProperty(ReadiumCSS.DIRECTION_KEY);
        // Apply text alignment
        html.style.removeProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY);
        // Apply line height
        html.style.removeProperty(ReadiumCSS.LINE_HEIGHT_KEY);
        // Apply page margins
        html.style.removeProperty(ReadiumCSS.PAGE_MARGINS_KEY);
        // Remove new properties
        html.style.removeProperty(ReadiumCSS.BODY_HYPHENS_KEY);
        html.style.removeProperty(ReadiumCSS.PARA_SPACING_KEY);
        html.style.removeProperty(ReadiumCSS.PARA_INDENT_KEY);
        html.style.removeProperty(ReadiumCSS.TYPE_SCALE_KEY);
        html.style.removeProperty(ReadiumCSS.BACKGROUND_COLOR_KEY);
        html.style.removeProperty(ReadiumCSS.TEXT_COLOR_KEY);

        // Apply appearance
        html.style.removeProperty(ReadiumCSS.APPEARANCE_KEY);
        if (rootElement)
          HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
        if (body) HTMLUtilities.setAttr(body, "data-viewer-theme", "day");

        // Apply font family
        html.style.removeProperty(ReadiumCSS.FONT_FAMILY_KEY);
        HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
        html.style.setProperty(
          ReadiumCSS.FONT_OVERRIDE_KEY,
          "readium-font-off"
        );

        // v2-only fields — clear inline style so iframe layout falls back
        // to bundle defaults / re-derives from the reset field values on
        // next applyProperties.
        html.style.removeProperty(ReadiumCSS.LINE_LENGTH_KEY);
        html.style.removeProperty(ReadiumCSS.FONT_WEIGHT_KEY);
        html.style.removeProperty(ReadiumCSS.FONT_WIDTH_KEY);
        html.style.removeProperty(ReadiumCSS.FONT_OPTICAL_SIZING_KEY);
        html.style.removeProperty(ReadiumCSS.LIGATURES_KEY);
        html.style.removeProperty(ReadiumCSS.BLEND_IMAGES_KEY);
        html.style.removeProperty(ReadiumCSS.DARKEN_IMAGES_KEY);
        html.style.removeProperty(ReadiumCSS.INVERT_IMAGES_KEY);
        html.style.removeProperty(ReadiumCSS.INVERT_GAIJI_KEY);
        html.style.removeProperty(ReadiumCSS.LINK_COLOR_KEY);
        html.style.removeProperty(ReadiumCSS.VISITED_COLOR_KEY);
        html.style.removeProperty(ReadiumCSS.SELECTION_BACKGROUND_COLOR_KEY);
        html.style.removeProperty(ReadiumCSS.SELECTION_TEXT_COLOR_KEY);
        html.style.removeProperty(ReadiumCSS.SCROLL_PADDING_TOP_KEY);
        html.style.removeProperty(ReadiumCSS.SCROLL_PADDING_BOTTOM_KEY);
        html.style.removeProperty(ReadiumCSS.SCROLL_PADDING_LEFT_KEY);
        html.style.removeProperty(ReadiumCSS.SCROLL_PADDING_RIGHT_KEY);
      }
    }
  }

  // TODO not really needed
  private async initializeSelections(): Promise<void> {
    if (this.headerMenu)
      this.settingsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-settings"
      );
  }

  async applyProperties(): Promise<any> {
    this.userProperties = this.getUserSettings();
    let doc = this.iframe.contentDocument;
    if (doc) {
      const html = HTMLUtilities.findIframeElement(
        doc,
        "html"
      ) as HTMLHtmlElement;

      if (html) {
        // iPadOS patch toggle — ReadiumCSS v2 ships rules gated on
        // `:root[style*="readium-iPadOSPatch-on"]` that disable Safari's
        // native text-size-adjust + text-zoom (which otherwise compound
        // with v2's CSS `zoom`-based font sizing and produce double-scaled
        // text on iPad). Apply as a CSS custom property so the substring
        // selector matches without polluting real CSS vars.
        if (BrowserUtilities.isIPadOS()) {
          html.style.setProperty("--readium-iPadOSPatch-on", "1");
        } else {
          html.style.removeProperty("--readium-iPadOSPatch-on");
        }

        const rootElement =
          HTMLUtilities.findElement(document, "#root") ||
          document.documentElement;
        const body = HTMLUtilities.findElement(html, "body");
        if (this.view?.host?.isReflowable()) {
          // Apply font size
          if (await this.getProperty(ReadiumCSS.FONT_SIZE_KEY)) {
            html.style.setProperty(
              ReadiumCSS.FONT_SIZE_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.FONT_SIZE_REF)
                ?.toString() ?? null
            );
          }
          // Apply word spacing
          if (await this.getProperty(ReadiumCSS.WORD_SPACING_KEY)) {
            // html.style.setProperty(
            //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
            //   "readium-advanced-on"
            // );
            html.style.setProperty(
              ReadiumCSS.WORD_SPACING_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.WORD_SPACING_REF)
                ?.toString() ?? null
            );
          }
          // Apply letter spacing
          if (await this.getProperty(ReadiumCSS.LETTER_SPACING_KEY)) {
            // html.style.setProperty(
            //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
            //   "readium-advanced-on"
            // );
            html.style.setProperty(
              ReadiumCSS.LETTER_SPACING_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.LETTER_SPACING_REF)
                ?.toString() ?? null
            );
          }
        }
        // Apply column count.
        // Applied unconditionally because v2 ReadiumCSS removed the responsive
        // column media queries — "auto" must be resolved to a numeric column
        // count based on viewport width in JS (per Readium v2 migration guide).
        // v2 also removed the 2-column cap, so 3+ columns are honoured on
        // wide viewports.
        // Skipped for vertical-script publications (cjk-vertical /
        // mongolian-vertical) — the cjk-vertical bundle's scroll-on rule
        // forces `columns: auto auto !important` on root, so writing
        // --USER__colCount has no layout effect and just pollutes the
        // inline style attribute.
        if (!this.isVerticalScript) {
          const colCountValue =
            this.userProperties
              .getByRef(ReadiumCSS.COLUMN_COUNT_REF)
              ?.toString() ?? "auto";
          const resolvedColCount =
            colCountValue === "auto"
              ? resolveAutoColumns(
                  BrowserUtilities.computeIframeContentWidth(
                    this.iframe,
                    this.view?.attributes
                  )
                )
              : colCountValue;
          html.style.setProperty(ReadiumCSS.COLUMN_COUNT_KEY, resolvedColCount);
        }
        if (this.view?.host?.isReflowable()) {
          // Apply text alignment
          if (await this.getProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY)) {
            if (
              this.userProperties
                .getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
                ?.toString() === "auto"
            ) {
              html.style.removeProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY);
            } else {
              // html.style.setProperty(
              //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
              //   "readium-advanced-on"
              // );
              html.style.setProperty(
                ReadiumCSS.TEXT_ALIGNMENT_KEY,
                this.userProperties
                  .getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
                  ?.toString() ?? null
              );
            }
          }

          // Apply line height
          if (await this.getProperty(ReadiumCSS.LINE_HEIGHT_KEY)) {
            // html.style.setProperty(
            //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
            //   "readium-advanced-on"
            // );
            html.style.setProperty(
              ReadiumCSS.LINE_HEIGHT_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.LINE_HEIGHT_REF)
                ?.toString() ?? null
            );
          }
          // Apply page margins (v1) + derive lineLength (v2).
          // For LTR / RTL / cjk-horizontal: derive both --USER__pageMargins
          // and --USER__lineLength from the user's pageMargins setting (or
          // an explicit lineLength override). Sets body's max-width.
          //
          // For vertical scripts (cjk-vertical / mongolian-vertical):
          // pageMargins as a horizontal-axis percentage doesn't translate.
          // Write --USER__lineLength = "100%" so body's max-height (= inline
          // axis in vertical-rl) fills the full viewport height — full
          // column height, no top/bottom blank space — and the bundle's
          // `[style*="--USER__lineLength"]` body rule fires (without it,
          // body's max-height falls back to the bundle default and the
          // cjk-vertical column-count auto-flow doesn't converge).
          // Vertical scripts get their --USER__lineLength written below
          // (in the vertical-script block) with viewport-height fallback.
          // For LTR / RTL / cjk-horizontal: write --USER__pageMargins and
          // derive --USER__lineLength from it (or use integrator override).
          if (!this.isVerticalScript) {
            const pageMarginsValue =
              this.userProperties
                .getByRef(ReadiumCSS.PAGE_MARGINS_REF)
                ?.toString() ?? null;
            html.style.setProperty(
              ReadiumCSS.PAGE_MARGINS_KEY,
              pageMarginsValue
            );
            // Direct lineLength override takes precedence over derivation.
            if (this.lineLength) {
              html.style.setProperty(
                ReadiumCSS.LINE_LENGTH_KEY,
                this.lineLength
              );
            } else {
              const prop = this.userProperties.getByRef(
                ReadiumCSS.PAGE_MARGINS_REF
              );
              const pageMarginsNum =
                typeof prop?.value === "number" ? prop.value : this.pageMargins;
              html.style.setProperty(
                ReadiumCSS.LINE_LENGTH_KEY,
                pageMarginsToLineLength(pageMarginsNum)
              );
            }
          }
          // Apply body hyphens
          if (await this.getProperty(ReadiumCSS.BODY_HYPHENS_KEY)) {
            html.style.setProperty(
              ReadiumCSS.BODY_HYPHENS_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.BODY_HYPHENS_REF)
                ?.toString() ?? null
            );
          }
          // Apply paragraph spacing
          if (await this.getProperty(ReadiumCSS.PARA_SPACING_KEY)) {
            html.style.setProperty(
              ReadiumCSS.PARA_SPACING_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.PARA_SPACING_REF)
                ?.toString() ?? null
            );
          }
          // Apply paragraph indent
          if (await this.getProperty(ReadiumCSS.PARA_INDENT_KEY)) {
            html.style.setProperty(
              ReadiumCSS.PARA_INDENT_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.PARA_INDENT_REF)
                ?.toString() ?? null
            );
          }
          // Apply type scale
          if (await this.getProperty(ReadiumCSS.TYPE_SCALE_KEY)) {
            html.style.setProperty(
              ReadiumCSS.TYPE_SCALE_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.TYPE_SCALE_REF)
                ?.toString() ?? null
            );
          }
          // Apply background color
          if (await this.getProperty(ReadiumCSS.BACKGROUND_COLOR_KEY)) {
            html.style.setProperty(
              ReadiumCSS.BACKGROUND_COLOR_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.BACKGROUND_COLOR_REF)
                ?.toString() ?? null
            );
          }
          // Apply text color
          if (await this.getProperty(ReadiumCSS.TEXT_COLOR_KEY)) {
            html.style.setProperty(
              ReadiumCSS.TEXT_COLOR_KEY,
              this.userProperties
                .getByRef(ReadiumCSS.TEXT_COLOR_REF)
                ?.toString() ?? null
            );
          }
        }

        // Apply appearance (v1) + derive v2 theme colour vars.
        // Applied unconditionally — v2 ReadiumCSS does not define appearance,
        // so the individual colour vars must always be set for themes to
        // work, not only when the store has a persisted value. Cjk-vertical
        // bundle honors `--USER__backgroundColor` / `--USER__textColor` the
        // same way the other variants do, so sepia/night themes apply to
        // vertical books too.
        {
          const appearanceValue =
            (this.userProperties
              .getByRef(ReadiumCSS.APPEARANCE_REF)
              ?.toString() as AppearanceValue | undefined) ??
            "readium-default-on";
          html.style.setProperty(ReadiumCSS.APPEARANCE_KEY, appearanceValue);

          // v2 colour preset — only applied for sepia/night, NOT for day.
          //
          // v2 ReadiumCSS applies publisher-colour-wiping rules whenever
          // --USER__textColor or --USER__backgroundColor are present in the
          // style attribute:
          //   :root[style*="--USER__textColor"] *:not(a) {
          //     color: inherit !important;
          //   }
          // v1 excluded headings from that wipe (h1-h6, pre); v2 only
          // excludes anchors. So setting these vars for the "day" default
          // wipes publisher heading colours throughout the book.
          //
          // For "day" we REMOVE the colour vars so publisher CSS flows
          // through. For sepia/night the user is explicitly asking for a
          // theme, so we apply the preset colours (accepting that publisher
          // heading colours will be overridden — which is what the user
          // wants when switching to a theme).
          //
          // Integrator-supplied backgroundColor / textColor fields always
          // take precedence (kept below after this block).
          const preset = APPEARANCE_COLOR_PRESETS[appearanceValue];
          const filterPreset = APPEARANCE_IMAGE_FILTERS[appearanceValue];
          const isDefaultDay = appearanceValue === "readium-default-on";
          if (preset && !isDefaultDay) {
            if (!this.backgroundColor) {
              html.style.setProperty(
                ReadiumCSS.BACKGROUND_COLOR_KEY,
                preset.background
              );
            }
            if (!this.textColor) {
              html.style.setProperty(ReadiumCSS.TEXT_COLOR_KEY, preset.text);
            }
            if (!this.linkColor) {
              html.style.setProperty(ReadiumCSS.LINK_COLOR_KEY, preset.link);
            }
            if (!this.visitedColor) {
              html.style.setProperty(
                ReadiumCSS.VISITED_COLOR_KEY,
                preset.visited
              );
            }
            if (!this.selectionBackgroundColor) {
              html.style.setProperty(
                ReadiumCSS.SELECTION_BACKGROUND_COLOR_KEY,
                preset.selectionBackground
              );
            }
            if (!this.selectionTextColor) {
              html.style.setProperty(
                ReadiumCSS.SELECTION_TEXT_COLOR_KEY,
                preset.selectionText
              );
            }
          } else if (isDefaultDay) {
            // Remove colour vars for "day" so publisher CSS flows through.
            // Integrator explicit overrides re-apply below.
            if (!this.backgroundColor) {
              html.style.removeProperty(ReadiumCSS.BACKGROUND_COLOR_KEY);
            }
            if (!this.textColor) {
              html.style.removeProperty(ReadiumCSS.TEXT_COLOR_KEY);
            }
            if (!this.linkColor) {
              html.style.removeProperty(ReadiumCSS.LINK_COLOR_KEY);
            }
            if (!this.visitedColor) {
              html.style.removeProperty(ReadiumCSS.VISITED_COLOR_KEY);
            }
            if (!this.selectionBackgroundColor) {
              html.style.removeProperty(
                ReadiumCSS.SELECTION_BACKGROUND_COLOR_KEY
              );
            }
            if (!this.selectionTextColor) {
              html.style.removeProperty(ReadiumCSS.SELECTION_TEXT_COLOR_KEY);
            }
          }

          // Auto-apply per-theme image filters to match v1 behaviour.
          // v1 ReadiumCSS implicitly applies mix-blend-mode on sepia and
          // invert on night; v2 does not, so we drive the filters from the
          // appearance preset. Integrator-supplied explicit filter values
          // are applied later in this method and override these defaults.
          if (filterPreset) {
            this.blendImages = filterPreset.blendImages;
            this.invertImages = filterPreset.invertImages;
            this.darkenImages = filterPreset.darkenImages;
          }
        }

        // data-viewer-theme attribute on rootElement + body is set
        // unconditionally — independent of the appearance var-write gate.
        // Reader UI SCSS (toc, settings, error, loading, bookmarks,
        // timeline, settings panel) keys theme-aware styling off this
        // attribute, including for vertical-script books which skip the
        // CSS-var writes inside the appearance block above.
        {
          const appearanceIdx =
            this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF)?.value ?? 0;
          const themeAttr =
            appearanceIdx === 1
              ? "sepia"
              : appearanceIdx === 2
                ? "night"
                : "day";
          if (rootElement)
            HTMLUtilities.setAttr(rootElement, "data-viewer-theme", themeAttr);
          if (body) HTMLUtilities.setAttr(body, "data-viewer-theme", themeAttr);
        }

        if (this.view?.host?.isFixedLayout()) {
          if (await this.getProperty(ReadiumCSS.DIRECTION_KEY)) {
            let value =
              this.userProperties
                .getByRef(ReadiumCSS.DIRECTION_REF)
                ?.toString() ?? null;
            html.style.setProperty(ReadiumCSS.DIRECTION_KEY, value);
            this.view.host?.setDirection(value);
          }
        }

        if (this.view?.host?.isReflowable()) {
          // Apply font family.
          // When the user picks "Original" (value 0 = publisher default) we
          // REMOVE --USER__fontFamily entirely. In v2 ReadiumCSS, merely
          // having the property set (even to "Original") triggers the rule
          // `:root[style*="--USER__fontFamily"] * { font-family: revert
          // !important; }` — which overrides the publisher's own font-family
          // declarations throughout the book. Removing the property lets
          // publisher fonts apply naturally.
          if (await this.getProperty(ReadiumCSS.FONT_FAMILY_KEY)) {
            const fontFamilyRefValue = this.userProperties.getByRef(
              ReadiumCSS.FONT_FAMILY_REF
            )?.value;
            if (fontFamilyRefValue === 0) {
              html.style.removeProperty(ReadiumCSS.FONT_FAMILY_KEY);
            } else {
              html.style.setProperty(
                ReadiumCSS.FONT_FAMILY_KEY,
                this.userProperties
                  .getByRef(ReadiumCSS.FONT_FAMILY_REF)
                  ?.toString() ?? null
              );
            }
            if (
              this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF)
                ?.value === 0
            ) {
              HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
              html.style.setProperty(
                ReadiumCSS.FONT_OVERRIDE_KEY,
                "readium-font-off"
              );
            } else if (
              this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF)
                ?.value === 1
            ) {
              HTMLUtilities.setAttr(html, "data-viewer-font", "serif");
              html.style.setProperty(
                ReadiumCSS.FONT_OVERRIDE_KEY,
                "readium-font-on"
              );
            } else if (
              this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF)
                ?.value === 2
            ) {
              HTMLUtilities.setAttr(html, "data-viewer-font", "sans");
              html.style.setProperty(
                ReadiumCSS.FONT_OVERRIDE_KEY,
                "readium-font-on"
              );
            } else {
              let prop = this.userProperties.getByRef(
                ReadiumCSS.FONT_FAMILY_REF
              );
              if (prop) {
                HTMLUtilities.setAttr(
                  html,
                  "data-viewer-font",
                  prop.toString()
                );
              }
              html.style.setProperty(
                ReadiumCSS.FONT_OVERRIDE_KEY,
                "readium-font-on"
              );
            }
          } else {
            // Store has no persisted fontFamily — leave --USER__fontFamily
            // unset so publisher fonts flow through (especially important
            // under v2 ReadiumCSS where any --USER__fontFamily value, even
            // "Original", triggers `* { font-family: revert !important; }`
            // on descendants).
            html.style.removeProperty(ReadiumCSS.FONT_FAMILY_KEY);
            HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
            html.style.setProperty(
              ReadiumCSS.FONT_OVERRIDE_KEY,
              "readium-font-off"
            );
          }

          // --- v2-only CSS variables ---
          // Applied when the integrator set the corresponding field on
          // InitialUserSettings. Silently no-op when v1 ReadiumCSS is injected.

          if (this.lineLength) {
            html.style.setProperty(ReadiumCSS.LINE_LENGTH_KEY, this.lineLength);
          }
          if (this.fontWeight && this.fontWeight !== 400) {
            html.style.setProperty(
              ReadiumCSS.FONT_WEIGHT_KEY,
              String(this.fontWeight)
            );
          }
          if (this.fontWidth && this.fontWidth !== 100) {
            html.style.setProperty(
              ReadiumCSS.FONT_WIDTH_KEY,
              String(this.fontWidth)
            );
          }
          if (!this.isVerticalScript) {
            html.style.setProperty(
              ReadiumCSS.FONT_OPTICAL_SIZING_KEY,
              this.fontOpticalSizing ? "auto" : "none"
            );
            html.style.setProperty(ReadiumCSS.LIGATURES_KEY, this.ligatures);
          }

          // Image filters — v2 accepts either a simple flag (boolean) or a
          // numeric amount. A numeric value takes precedence.
          //   blendImages (boolean only):    readium-blend-on
          //   darkenImages (boolean):        readium-darken-on
          //   darkenImages (number 0..1):    --USER__darkenImages
          //   invertImages (boolean):        readium-invert-on
          //   invertImages (number 0..1):    --USER__invertImages
          //   invertGaiji  (boolean):        readium-invertGaiji-on
          //   invertGaiji  (number 0..1):    --USER__invertGaiji
          // v2 CSS uses `[style*="readium-*-on"]` substring matching on the
          // style attribute; we store the flag value on the corresponding
          // --USER__* custom property so the substring appears in style.
          if (this.blendImages) {
            html.style.setProperty(
              ReadiumCSS.BLEND_IMAGES_KEY,
              "readium-blend-on"
            );
          } else {
            html.style.removeProperty(ReadiumCSS.BLEND_IMAGES_KEY);
          }

          applyFilterSetting(
            html,
            ReadiumCSS.DARKEN_IMAGES_KEY,
            this.darkenImages,
            "readium-darken-on"
          );
          applyFilterSetting(
            html,
            ReadiumCSS.INVERT_IMAGES_KEY,
            this.invertImages,
            "readium-invert-on"
          );
          applyFilterSetting(
            html,
            ReadiumCSS.INVERT_GAIJI_KEY,
            this.invertGaiji,
            "readium-invertGaiji-on"
          );
          // Explicit theme colour overrides — take precedence over appearance
          // preset colours applied above.
          if (this.linkColor) {
            html.style.setProperty(ReadiumCSS.LINK_COLOR_KEY, this.linkColor);
          }
          if (this.visitedColor) {
            html.style.setProperty(
              ReadiumCSS.VISITED_COLOR_KEY,
              this.visitedColor
            );
          }
          if (this.selectionBackgroundColor) {
            html.style.setProperty(
              ReadiumCSS.SELECTION_BACKGROUND_COLOR_KEY,
              this.selectionBackgroundColor
            );
          }
          if (this.selectionTextColor) {
            html.style.setProperty(
              ReadiumCSS.SELECTION_TEXT_COLOR_KEY,
              this.selectionTextColor
            );
          }
          // Scroll-view padding (v2 replaces pageGutter in scroll mode).
          if (this.scrollPaddingTop) {
            html.style.setProperty(
              ReadiumCSS.SCROLL_PADDING_TOP_KEY,
              this.scrollPaddingTop
            );
          }
          if (this.scrollPaddingBottom) {
            html.style.setProperty(
              ReadiumCSS.SCROLL_PADDING_BOTTOM_KEY,
              this.scrollPaddingBottom
            );
          }
          if (this.scrollPaddingLeft) {
            html.style.setProperty(
              ReadiumCSS.SCROLL_PADDING_LEFT_KEY,
              this.scrollPaddingLeft
            );
          }
          if (this.scrollPaddingRight) {
            html.style.setProperty(
              ReadiumCSS.SCROLL_PADDING_RIGHT_KEY,
              this.scrollPaddingRight
            );
          }

          if (this.isVerticalScript) {
            // Vertical scripts (cjk-vertical / mongolian-vertical) need both
            // --USER__scroll: readium-scroll-on AND --RS__disablePagination:
            // readium-noVerticalPagination-on. Both substrings independently
            // trigger the cjk-vertical CSS rule that sets
            // `:root { columns: auto auto !important; max-width: none !important; }`
            // — the layout that lets vertical-rl content extend horizontally
            // instead of being fragmented into a single viewport-width column.
            // Without --USER__scroll the gated scroll-padding rules also
            // wouldn't fire.
            html.style.setProperty("--USER__scroll", "readium-scroll-on");
            html.style.setProperty("--USER__view", "readium-scroll-on");
            html.style.setProperty(
              ReadiumCSS.DISABLE_PAGINATION_KEY,
              "readium-noVerticalPagination-on"
            );
            // Opt out of cjk-vertical's body overflow:hidden / overflow:clip
            // rules. Those rules are gated on
            // `:not([style*="readium-noOverflow-on"])` — adding any inline
            // style declaration containing that literal substring defeats
            // the selector. Without this, body clips multicol fragments and
            // content beyond the first column-block is invisible.
            html.style.setProperty("--RS__overflow", "readium-noOverflow-on");

            // Body max-height (inline-axis in vertical-rl). Integrator
            // override via `initialUserSettings.lineLength` or runtime
            // `applyUserSettings({ lineLength })` takes precedence; otherwise
            // fall back to viewport height in px (mirrors Readium's effective
            // lineLength for CJK content where canvas-measured maximalLineLength
            // exceeds viewport_height and the min() clamp picks viewport_height).
            // Recomputed on resize via applyProperties re-run from handleResize.
            const verticalLineLength = this.lineLength
              ? this.lineLength
              : `${this.iframe?.parentElement?.clientHeight ?? window.innerHeight}px`;
            html.style.setProperty(
              ReadiumCSS.LINE_LENGTH_KEY,
              verticalLineLength
            );
          } else if (await this.getProperty(ReadiumCSS.SCROLL_KEY)) {
            if (
              this.userProperties.getByRef(ReadiumCSS.SCROLL_REF)?.value ===
              true
            ) {
              html.style.setProperty("--USER__scroll", "readium-scroll-on");
            } else {
              html.style.setProperty("--USER__scroll", "readium-scroll-off");
            }
          } else {
            html.style.setProperty("--USER__scroll", "readium-scroll-on");
          }

          // Apply publishers default
          // if (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY)) {
          //   if (
          //     this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF)
          //       .value === true
          //   ) {
          //     html.style.setProperty(
          //       "--USER__advancedSettings",
          //       "readium-advanced-off"
          //     );
          //   } else {
          html.style.setProperty(
            "--USER__advancedSettings",
            "readium-advanced-on"
          );
          // }
          // } else {
          //   html.style.setProperty(
          //     "--USER__advancedSettings",
          //     "readium-advanced-off"
          //   );
          // }
          this.isScrollMode().then((scroll) => {
            this.swapRenderer(scroll);
          });
        }
      }
    }
  }

  setIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    if (this.view) {
      this.view.iframe = iframe;
    }
    if (this.settingsView) UserSettings.renderControls(this.settingsView);
  }

  /**
   * Script mode of the loaded publication. Set externally by the
   * navigator after construct so `swapRenderer` can pick a vertical-script
   * renderer when appropriate. Optional — default `"ltr"` until set.
   */
  scriptMode: ScriptMode = "ltr";

  /**
   * `true` when the publication uses a vertical writing mode
   * (cjk-vertical / mongolian-vertical). Vertical content runs in scroll
   * mode unconditionally (no in-resource pagination); the user-set
   * `verticalScroll` toggle is ignored for vertical scripts.
   */
  private get isVerticalScript(): boolean {
    return (
      this.scriptMode === "cjk-vertical" ||
      this.scriptMode === "mongolian-vertical"
    );
  }

  /**
   * Pick the right reflowable renderer for the current scroll mode and apply
   * mode-specific iframe setup. Replaces the historical `view.setMode(scroll)`
   * call: when the mode actually changes we instantiate a fresh renderer of
   * the correct class, transfer the iframe / host / attributes / sizing
   * state, then call `engage()` on the new instance. When mode is unchanged
   * we just re-engage the existing renderer (matches the old setMode
   * idempotent behavior).
   *
   * Fixed-layout publications use FixedRenderer and ignore the toggle.
   * Vertical scripts (cjk-vertical / mongolian-vertical) use
   * VerticalRenderer regardless of `scroll` — they're scroll-only by design.
   */
  /**
   * Pick the initial renderer based on layout, scriptMode, and the
   * resolved `verticalScroll` setting. Called by the factory exactly
   * once, after `initialise()` reads the persisted store and after
   * integrator-supplied `initialUserSettings.verticalScroll` overrides
   * have applied. Avoids the throwaway "construct paginated, swap to
   * scroll" path that the constructor used to take.
   */
  selectInitialRenderer(): void {
    if (this.layout === "fixed") {
      this.view = new FixedRenderer();
    } else if (
      this.scriptMode === "cjk-vertical" ||
      this.scriptMode === "mongolian-vertical"
    ) {
      this.view = new VerticalRenderer(
        this.store,
        this.scriptMode === "cjk-vertical"
      );
    } else if (this.verticalScroll === false) {
      this.view = new ColumnRenderer(this.store, this.scriptMode === "rtl");
    } else {
      // Default: ScrollRenderer — matches the class-field default
      // (`verticalScroll = true`) and applies when nothing is persisted
      // and no integrator override is supplied.
      this.view = new ScrollRenderer(this.store);
    }
  }

  private swapRenderer(scroll: boolean): void {
    if (this.view instanceof FixedRenderer) return;

    const targetClass:
      | typeof ColumnRenderer
      | typeof ScrollRenderer
      | typeof VerticalRenderer = this.isVerticalScript
      ? VerticalRenderer
      : scroll
        ? ScrollRenderer
        : ColumnRenderer;
    const current = this.view as
      | ColumnRenderer
      | ScrollRenderer
      | VerticalRenderer
      | undefined;

    // Shortcut: re-engage the existing renderer ONLY if its constructor
    // flags also match. Without this, an RTL/vertical publication that
    // started life with the pre-scriptMode-known ColumnRenderer (rtl=false)
    // or with a stale verticalRtl flag would get re-engaged with the wrong
    // direction. Falls through to construct a fresh instance when flags
    // disagree.
    if (current && current instanceof targetClass) {
      const wantRtl = this.scriptMode === "rtl";
      const wantVerticalRtl = this.scriptMode === "cjk-vertical";
      const flagsMatch =
        current instanceof ColumnRenderer
          ? current.publicationRtl === wantRtl
          : current instanceof VerticalRenderer
            ? current.verticalRtl === wantVerticalRtl
            : true; // ScrollRenderer has no script-mode flag
      if (flagsMatch) {
        current.engage();
        return;
      }
    }

    const next =
      targetClass === VerticalRenderer
        ? new VerticalRenderer(this.store, this.scriptMode === "cjk-vertical")
        : targetClass === ScrollRenderer
          ? new ScrollRenderer(this.store)
          : new ColumnRenderer(this.store, this.scriptMode === "rtl");
    if (current) {
      next.iframe = current.iframe;
      next.host = current.host;
      next.attributes = current.attributes;
      next.sideMargin = current.sideMargin;
      next.height = current.height;
    }
    this.view = next;
    next.engage();
    // Notify so listeners (EpubNavigator's updateRenderer) re-sync to the
    // new instance. Otherwise external `view` refs go stale on the silent
    // swap path (applyProperties), since only the explicit user-toggle
    // paths fire viewChangeCallback themselves.
    this.viewChangeCallback();
  }

  private static renderControls(element: HTMLElement): void {
    // Clicking the settings view outside the ul hides it, but clicking inside the ul keeps it up.
    addEventListenerOptional(
      HTMLUtilities.findElement(element, "ul"),
      "click",
      (event: Event) => {
        event.stopPropagation();
      }
    );
  }

  public onSettingsChange(callback: () => void) {
    this.settingsChangeCallback = callback;
  }
  public onColumnSettingsChange(callback: () => void) {
    this.settingsColumnsChangeCallback = callback;
  }

  public onViewChange(callback: () => void) {
    this.viewChangeCallback = callback;
  }

  private async storeProperty(property: UserProperty): Promise<void> {
    await this.updateUserSettings();
    await this.saveProperty(property);
  }

  addAppearance(appearance: string): any {
    if (!UserSettings.appearanceValues.includes(appearance)) {
      UserSettings.appearanceValues.push(appearance);
    }
  }

  initAddedAppearance(): any {
    this.applyProperties();
  }

  addFont(fontFamily: string): any {
    if (!UserSettings.fontFamilyValues.includes(fontFamily)) {
      UserSettings.fontFamilyValues.push(fontFamily);
    }
  }

  initAddedFont(): any {
    this.applyProperties();
  }

  private async updateUserSettings() {
    let userSettings = {
      fontFamily:
        UserSettings.fontFamilyValues[
          await this.userProperties?.getByRef(ReadiumCSS.FONT_FAMILY_REF)?.value
        ],
      fontSize: this.userProperties?.getByRef(ReadiumCSS.FONT_SIZE_REF)?.value,
      appearance:
        UserSettings.appearanceValues[
          await this.userProperties?.getByRef(ReadiumCSS.APPEARANCE_REF)?.value
        ],
      textAlignment:
        UserSettings.textAlignmentValues[
          await this.userProperties?.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
            ?.value
        ],
      columnCount:
        UserSettings.columnCountValues[
          await this.userProperties?.getByRef(ReadiumCSS.COLUMN_COUNT_REF)
            ?.value
        ],
      direction:
        UserSettings.directionValues[
          await this.userProperties?.getByRef(ReadiumCSS.DIRECTION_REF)?.value
        ],
      wordSpacing: this.userProperties?.getByRef(ReadiumCSS.WORD_SPACING_REF)
        ?.value,
      letterSpacing: this.userProperties?.getByRef(
        ReadiumCSS.LETTER_SPACING_REF
      )?.value,
      // publisherDefault: this.userProperties.getByRef(
      //   ReadiumCSS.PUBLISHER_DEFAULT_REF
      // ).value,
      verticalScroll: this.userProperties?.getByRef(ReadiumCSS.SCROLL_REF)
        ?.value,
      bodyHyphens: this.userProperties?.getByRef(ReadiumCSS.BODY_HYPHENS_REF)
        ?.value,
      paraSpacing: this.userProperties?.getByRef(ReadiumCSS.PARA_SPACING_REF)
        ?.value,
      paraIndent: this.userProperties?.getByRef(ReadiumCSS.PARA_INDENT_REF)
        ?.value,
      typeScale: this.userProperties?.getByRef(ReadiumCSS.TYPE_SCALE_REF)
        ?.value,
      backgroundColor: this.userProperties?.getByRef(
        ReadiumCSS.BACKGROUND_COLOR_REF
      )?.value,
      textColor: this.userProperties?.getByRef(ReadiumCSS.TEXT_COLOR_REF)
        ?.value,
    };
    if (this.api?.updateSettings) {
      this.api?.updateSettings(userSettings).then((_) => {
        log.log("api updated user settings", JSON.stringify(userSettings));
      });
    }
  }

  private getUserSettings(): UserProperties {
    let userProperties = new UserProperties();
    // Publisher default system
    // userProperties.addSwitchable(
    //   "readium-advanced-off",
    //   "readium-advanced-on",
    //   this.publisherDefaults,
    //   ReadiumCSS.PUBLISHER_DEFAULT_REF,
    //   ReadiumCSS.PUBLISHER_DEFAULT_KEY
    // );
    // Font override
    userProperties.addSwitchable(
      "readium-font-on",
      "readium-font-off",
      this.fontOverride,
      ReadiumCSS.FONT_OVERRIDE_REF,
      ReadiumCSS.FONT_OVERRIDE_KEY
    );
    // Column count
    userProperties.addEnumerable(
      this.columnCount,
      UserSettings.columnCountValues,
      ReadiumCSS.COLUMN_COUNT_REF,
      ReadiumCSS.COLUMN_COUNT_KEY
    );
    // Direction
    userProperties.addEnumerable(
      this.direction,
      UserSettings.directionValues,
      ReadiumCSS.DIRECTION_REF,
      ReadiumCSS.DIRECTION_KEY
    );
    // Appearance
    userProperties.addEnumerable(
      this.appearance,
      UserSettings.appearanceValues,
      ReadiumCSS.APPEARANCE_REF,
      ReadiumCSS.APPEARANCE_KEY
    );
    // Page margins
    userProperties.addIncremental(
      this.pageMargins,
      0.5,
      4,
      0.25,
      "",
      ReadiumCSS.PAGE_MARGINS_REF,
      ReadiumCSS.PAGE_MARGINS_KEY
    );
    // Text alignment
    userProperties.addEnumerable(
      this.textAlignment,
      UserSettings.textAlignmentValues,
      ReadiumCSS.TEXT_ALIGNMENT_REF,
      ReadiumCSS.TEXT_ALIGNMENT_KEY
    );
    // Font family
    userProperties.addEnumerable(
      this.fontFamily,
      UserSettings.fontFamilyValues,
      ReadiumCSS.FONT_FAMILY_REF,
      ReadiumCSS.FONT_FAMILY_KEY
    );
    // Font size
    userProperties.addIncremental(
      this.fontSize,
      100,
      300,
      25,
      "%",
      ReadiumCSS.FONT_SIZE_REF,
      ReadiumCSS.FONT_SIZE_KEY
    );
    // Line height
    userProperties.addIncremental(
      this.lineHeight,
      1,
      2,
      0.25,
      "em",
      ReadiumCSS.LINE_HEIGHT_REF,
      ReadiumCSS.LINE_HEIGHT_KEY
    );
    // Word spacing
    userProperties.addIncremental(
      this.wordSpacing,
      0,
      1,
      0.25,
      "rem",
      ReadiumCSS.WORD_SPACING_REF,
      ReadiumCSS.WORD_SPACING_KEY
    );
    // Letter spacing
    userProperties.addIncremental(
      this.letterSpacing,
      0,
      0.5,
      0.0625,
      "em",
      ReadiumCSS.LETTER_SPACING_REF,
      ReadiumCSS.LETTER_SPACING_KEY
    );
    // Scroll
    userProperties.addSwitchable(
      "readium-scroll-on",
      "readium-scroll-off",
      this.verticalScroll,
      ReadiumCSS.SCROLL_REF,
      ReadiumCSS.SCROLL_KEY
    );
    // Body hyphens
    userProperties.addSwitchable(
      "auto",
      "none",
      this.bodyHyphens,
      ReadiumCSS.BODY_HYPHENS_REF,
      ReadiumCSS.BODY_HYPHENS_KEY
    );
    // Paragraph spacing
    userProperties.addIncremental(
      this.paraSpacing,
      0,
      3,
      0.5,
      "rem",
      ReadiumCSS.PARA_SPACING_REF,
      ReadiumCSS.PARA_SPACING_KEY
    );
    // Paragraph indent
    userProperties.addIncremental(
      this.paraIndent,
      0,
      3,
      0.5,
      "em",
      ReadiumCSS.PARA_INDENT_REF,
      ReadiumCSS.PARA_INDENT_KEY
    );
    // Type scale
    userProperties.addIncremental(
      this.typeScale,
      1.0,
      1.5,
      0.1,
      "",
      ReadiumCSS.TYPE_SCALE_REF,
      ReadiumCSS.TYPE_SCALE_KEY
    );
    // Background color
    userProperties.addStringable(
      this.backgroundColor,
      ReadiumCSS.BACKGROUND_COLOR_REF,
      ReadiumCSS.BACKGROUND_COLOR_KEY
    );
    // Text color
    userProperties.addStringable(
      this.textColor,
      ReadiumCSS.TEXT_COLOR_REF,
      ReadiumCSS.TEXT_COLOR_KEY
    );

    // --- v2-only incremental properties (silently no-op on v1 CSS) ---
    // Font weight (variable font axis, default 400)
    userProperties.addIncremental(
      this.fontWeight,
      100,
      900,
      50,
      "",
      ReadiumCSS.FONT_WEIGHT_REF,
      ReadiumCSS.FONT_WEIGHT_KEY
    );
    // Font width (variable font axis, default 100)
    userProperties.addIncremental(
      this.fontWidth,
      50,
      200,
      10,
      "",
      ReadiumCSS.FONT_WIDTH_REF,
      ReadiumCSS.FONT_WIDTH_KEY
    );

    // --- v2-only stringable / switchable properties (persistence-backed) ---
    // Body max-width (LTR/RTL/cjk-horizontal) or max-height (vertical-rl).
    userProperties.addStringable(
      this.lineLength,
      ReadiumCSS.LINE_LENGTH_REF,
      ReadiumCSS.LINE_LENGTH_KEY
    );
    // Variable-font optical sizing toggle.
    userProperties.addSwitchable(
      "auto",
      "none",
      this.fontOpticalSizing,
      ReadiumCSS.FONT_OPTICAL_SIZING_REF,
      ReadiumCSS.FONT_OPTICAL_SIZING_KEY
    );
    // Common-ligatures toggle (string value: "none" | "common-ligatures").
    userProperties.addStringable(
      this.ligatures,
      ReadiumCSS.LIGATURES_REF,
      ReadiumCSS.LIGATURES_KEY
    );
    // Image filters — stored as serialized strings to preserve the
    // boolean | numeric-amount union (parsed back in initialise()).
    userProperties.addSwitchable(
      "readium-blend-on",
      "readium-blend-off",
      this.blendImages,
      ReadiumCSS.BLEND_IMAGES_REF,
      ReadiumCSS.BLEND_IMAGES_KEY
    );
    userProperties.addStringable(
      String(this.darkenImages),
      ReadiumCSS.DARKEN_IMAGES_REF,
      ReadiumCSS.DARKEN_IMAGES_KEY
    );
    userProperties.addStringable(
      String(this.invertImages),
      ReadiumCSS.INVERT_IMAGES_REF,
      ReadiumCSS.INVERT_IMAGES_KEY
    );
    userProperties.addStringable(
      String(this.invertGaiji),
      ReadiumCSS.INVERT_GAIJI_REF,
      ReadiumCSS.INVERT_GAIJI_KEY
    );
    // v2 theme accent colours.
    userProperties.addStringable(
      this.linkColor,
      ReadiumCSS.LINK_COLOR_REF,
      ReadiumCSS.LINK_COLOR_KEY
    );
    userProperties.addStringable(
      this.visitedColor,
      ReadiumCSS.VISITED_COLOR_REF,
      ReadiumCSS.VISITED_COLOR_KEY
    );
    userProperties.addStringable(
      this.selectionBackgroundColor,
      ReadiumCSS.SELECTION_BACKGROUND_COLOR_REF,
      ReadiumCSS.SELECTION_BACKGROUND_COLOR_KEY
    );
    userProperties.addStringable(
      this.selectionTextColor,
      ReadiumCSS.SELECTION_TEXT_COLOR_REF,
      ReadiumCSS.SELECTION_TEXT_COLOR_KEY
    );
    // Scroll-view padding (RS-scoped, vertical-rl reading-axis padding).
    userProperties.addStringable(
      this.scrollPaddingTop,
      ReadiumCSS.SCROLL_PADDING_TOP_REF,
      ReadiumCSS.SCROLL_PADDING_TOP_KEY
    );
    userProperties.addStringable(
      this.scrollPaddingBottom,
      ReadiumCSS.SCROLL_PADDING_BOTTOM_REF,
      ReadiumCSS.SCROLL_PADDING_BOTTOM_KEY
    );
    userProperties.addStringable(
      this.scrollPaddingLeft,
      ReadiumCSS.SCROLL_PADDING_LEFT_REF,
      ReadiumCSS.SCROLL_PADDING_LEFT_KEY
    );
    userProperties.addStringable(
      this.scrollPaddingRight,
      ReadiumCSS.SCROLL_PADDING_RIGHT_REF,
      ReadiumCSS.SCROLL_PADDING_RIGHT_KEY
    );
    return userProperties;
  }

  private async saveProperty(property: UserProperty): Promise<any> {
    let savedProperties = await this.store.get(this.USERSETTINGS);
    if (savedProperties) {
      let array = JSON.parse(savedProperties);
      array = array.filter((el: any) => el.name !== property.name);
      if (property.value !== undefined) {
        array.push(property);
      }
      await this.store.set(this.USERSETTINGS, JSON.stringify(array));
    } else {
      let array: UserProperty[] = [];
      array.push(property);
      await this.store.set(this.USERSETTINGS, JSON.stringify(array));
    }
    return new Promise((resolve) => resolve(property));
  }

  async getProperty<T extends UserProperty = UserProperty>(
    name: string
  ): Promise<T | null> {
    let array = await this.store.get(this.USERSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return null;
      }
      return properties[0] as T | null;
    }
    return null;
  }

  /**
   * If the property doesn't exist in the store, will fall back to the value on this
   */
  async getPropertyAndFallback<T extends UserProperty = UserProperty>(
    name: keyof this,
    key: string
  ): Promise<T["value"]> {
    return (await this.getProperty(key))?.value ?? this[name];
  }

  async resetUserSettings(): Promise<void> {
    this.store.remove(this.USERSETTINGS);
    await this.reset();
    this.viewChangeCallback();
    this.settingsChangeCallback();
  }

  get currentSettings() {
    return {
      appearance:
        UserSettings.appearanceValues[
          this.userProperties?.getByRef(ReadiumCSS.APPEARANCE_REF)?.value
        ], //readium-default-on, readium-night-on, readium-sepia-on
      fontFamily:
        UserSettings.fontFamilyValues[
          this.userProperties?.getByRef(ReadiumCSS.FONT_FAMILY_REF)?.value
        ], //Original, serif, sans-serif
      textAlignment:
        UserSettings.textAlignmentValues[
          this.userProperties?.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)?.value
        ], //"auto", "justify", "start"
      columnCount:
        UserSettings.columnCountValues[
          this.userProperties?.getByRef(ReadiumCSS.COLUMN_COUNT_REF)?.value
        ], // "auto", "1", "2"
      direction:
        UserSettings.directionValues[
          this.userProperties?.getByRef(ReadiumCSS.DIRECTION_REF)?.value
        ], // "auto", "ltr", "rtl"
      // Vertical scripts (cjk-vertical / mongolian-vertical) are forced to
      // scroll mode by VerticalRenderer regardless of the persisted
      // setting, so report that here too — keeps the integrator's UI
      // toggle in sync with the actual renderer.
      verticalScroll: this.isVerticalScript ? true : this.verticalScroll,
      fontSize: this.fontSize,
      wordSpacing: this.wordSpacing,
      letterSpacing: this.letterSpacing,
      pageMargins: this.pageMargins,
      lineHeight: this.lineHeight,
      bodyHyphens: this.bodyHyphens,
      paraSpacing: this.paraSpacing,
      paraIndent: this.paraIndent,
      typeScale: this.typeScale,
      backgroundColor: this.backgroundColor,
      textColor: this.textColor,
      // v2-only fields (persistence-backed). Surface here so integrators
      // can read current values to populate UI controls.
      lineLength: this.lineLength,
      fontWeight: this.fontWeight,
      fontWidth: this.fontWidth,
      fontOpticalSizing: this.fontOpticalSizing,
      ligatures: this.ligatures,
      blendImages: this.blendImages,
      darkenImages: this.darkenImages,
      invertImages: this.invertImages,
      invertGaiji: this.invertGaiji,
      linkColor: this.linkColor,
      visitedColor: this.visitedColor,
      selectionBackgroundColor: this.selectionBackgroundColor,
      selectionTextColor: this.selectionTextColor,
      scrollPaddingTop: this.scrollPaddingTop,
      scrollPaddingBottom: this.scrollPaddingBottom,
      scrollPaddingLeft: this.scrollPaddingLeft,
      scrollPaddingRight: this.scrollPaddingRight,
    };
  }

  async applyUserSettings(userSettings: Partial<UserSettings>): Promise<void> {
    if (userSettings.appearance) {
      this.appearance = UserSettings.parseAppearanceSetting(
        userSettings.appearance
      );
      let prop = this.userProperties?.getByRef(ReadiumCSS.APPEARANCE_REF);
      if (prop) {
        prop.value = this.appearance;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.fontSize) {
      this.fontSize = userSettings.fontSize;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_SIZE_REF);
      if (prop) {
        prop.value = this.fontSize;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.fontFamily) {
      this.fontFamily = UserSettings.fontFamilyValues.findIndex(
        (el: any) => el === userSettings.fontFamily
      );
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_FAMILY_REF);
      if (prop) {
        prop.value = this.fontFamily;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.letterSpacing) {
      this.letterSpacing = userSettings.letterSpacing;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LETTER_SPACING_REF);
      if (prop) {
        prop.value = this.letterSpacing;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.wordSpacing) {
      this.wordSpacing = userSettings.wordSpacing;
      let prop = this.userProperties?.getByRef(ReadiumCSS.WORD_SPACING_REF);
      if (prop) {
        prop.value = this.wordSpacing;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.columnCount) {
      this.columnCount = UserSettings.columnCountValues.findIndex(
        (el: any) => el === userSettings.columnCount
      );
      let prop = this.userProperties?.getByRef(ReadiumCSS.COLUMN_COUNT_REF);
      if (prop) {
        prop.value = this.columnCount;
        await this.storeProperty(prop);
      }
      this.settingsColumnsChangeCallback();
    }

    if (userSettings.direction) {
      this.direction = UserSettings.directionValues.findIndex(
        (el: any) => el === userSettings.direction
      );
      let prop = this.userProperties?.getByRef(ReadiumCSS.DIRECTION_REF);
      if (prop) {
        prop.value = this.direction;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.textAlignment) {
      this.textAlignment = UserSettings.textAlignmentValues.findIndex(
        (el: any) => el === userSettings.textAlignment
      );
      let prop = this.userProperties?.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF);
      if (prop) {
        prop.value = this.textAlignment;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.lineHeight) {
      this.lineHeight = userSettings.lineHeight;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LINE_HEIGHT_REF);
      if (prop) {
        prop.value = this.lineHeight;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.pageMargins) {
      this.pageMargins = userSettings.pageMargins;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PAGE_MARGINS_REF);
      if (prop) {
        prop.value = this.pageMargins;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.verticalScroll !== undefined) {
      const position = this.view?.getCurrentPosition();
      this.verticalScroll = UserSettings.parseScrollSetting(
        userSettings.verticalScroll
      );
      let prop = this.userProperties?.getByRef(ReadiumCSS.SCROLL_REF);
      if (prop) {
        prop.value = this.verticalScroll;
        await this.saveProperty(prop);
      }
      this.swapRenderer(this.verticalScroll);
      if (position) {
        this.view?.goToProgression(position);
      }
      this.viewChangeCallback();
    }

    if (userSettings.bodyHyphens !== undefined) {
      this.bodyHyphens = userSettings.bodyHyphens;
      let prop = this.userProperties?.getByRef(ReadiumCSS.BODY_HYPHENS_REF);
      if (prop) {
        prop.value = this.bodyHyphens;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.paraSpacing !== undefined) {
      this.paraSpacing = userSettings.paraSpacing;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PARA_SPACING_REF);
      if (prop) {
        prop.value = this.paraSpacing;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.paraIndent !== undefined) {
      this.paraIndent = userSettings.paraIndent;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PARA_INDENT_REF);
      if (prop) {
        prop.value = this.paraIndent;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.typeScale !== undefined) {
      this.typeScale = userSettings.typeScale;
      let prop = this.userProperties?.getByRef(ReadiumCSS.TYPE_SCALE_REF);
      if (prop) {
        prop.value = this.typeScale;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.backgroundColor !== undefined) {
      this.backgroundColor = userSettings.backgroundColor;
      let prop = this.userProperties?.getByRef(ReadiumCSS.BACKGROUND_COLOR_REF);
      if (prop) {
        prop.value = this.backgroundColor;
        await this.storeProperty(prop);
      }
    }

    if (userSettings.textColor !== undefined) {
      this.textColor = userSettings.textColor;
      let prop = this.userProperties?.getByRef(ReadiumCSS.TEXT_COLOR_REF);
      if (prop) {
        prop.value = this.textColor;
        await this.storeProperty(prop);
      }
    }

    // --- v2-only settings ---
    // These class fields drive applyProperties(); they persist via class
    // state, not through UserProperties (no corresponding registered
    // Incremental / Switchable / Enumerable / Stringable for most).
    if (userSettings.lineLength !== undefined) {
      this.lineLength = userSettings.lineLength;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LINE_LENGTH_REF);
      if (prop) {
        prop.value = this.lineLength;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.fontWeight !== undefined) {
      this.fontWeight = userSettings.fontWeight;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_WEIGHT_REF);
      if (prop) {
        prop.value = this.fontWeight;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.fontWidth !== undefined) {
      this.fontWidth = userSettings.fontWidth;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_WIDTH_REF);
      if (prop) {
        prop.value = this.fontWidth;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.fontOpticalSizing !== undefined) {
      this.fontOpticalSizing = userSettings.fontOpticalSizing;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.FONT_OPTICAL_SIZING_REF
      );
      if (prop) {
        prop.value = this.fontOpticalSizing;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.ligatures !== undefined) {
      this.ligatures = userSettings.ligatures;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LIGATURES_REF);
      if (prop) {
        prop.value = this.ligatures;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.blendImages !== undefined) {
      this.blendImages = userSettings.blendImages;
      let prop = this.userProperties?.getByRef(ReadiumCSS.BLEND_IMAGES_REF);
      if (prop) {
        prop.value = this.blendImages;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.darkenImages !== undefined) {
      this.darkenImages = userSettings.darkenImages;
      let prop = this.userProperties?.getByRef(ReadiumCSS.DARKEN_IMAGES_REF);
      if (prop) {
        prop.value = String(this.darkenImages);
        await this.storeProperty(prop);
      }
    }
    if (userSettings.invertImages !== undefined) {
      this.invertImages = userSettings.invertImages;
      let prop = this.userProperties?.getByRef(ReadiumCSS.INVERT_IMAGES_REF);
      if (prop) {
        prop.value = String(this.invertImages);
        await this.storeProperty(prop);
      }
    }
    if (userSettings.invertGaiji !== undefined) {
      this.invertGaiji = userSettings.invertGaiji;
      let prop = this.userProperties?.getByRef(ReadiumCSS.INVERT_GAIJI_REF);
      if (prop) {
        prop.value = String(this.invertGaiji);
        await this.storeProperty(prop);
      }
    }
    if (userSettings.linkColor !== undefined) {
      this.linkColor = userSettings.linkColor;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LINK_COLOR_REF);
      if (prop) {
        prop.value = this.linkColor;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.visitedColor !== undefined) {
      this.visitedColor = userSettings.visitedColor;
      let prop = this.userProperties?.getByRef(ReadiumCSS.VISITED_COLOR_REF);
      if (prop) {
        prop.value = this.visitedColor;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.selectionBackgroundColor !== undefined) {
      this.selectionBackgroundColor = userSettings.selectionBackgroundColor;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.SELECTION_BACKGROUND_COLOR_REF
      );
      if (prop) {
        prop.value = this.selectionBackgroundColor;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.selectionTextColor !== undefined) {
      this.selectionTextColor = userSettings.selectionTextColor;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.SELECTION_TEXT_COLOR_REF
      );
      if (prop) {
        prop.value = this.selectionTextColor;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.scrollPaddingTop !== undefined) {
      this.scrollPaddingTop = userSettings.scrollPaddingTop;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.SCROLL_PADDING_TOP_REF
      );
      if (prop) {
        prop.value = this.scrollPaddingTop;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.scrollPaddingBottom !== undefined) {
      this.scrollPaddingBottom = userSettings.scrollPaddingBottom;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.SCROLL_PADDING_BOTTOM_REF
      );
      if (prop) {
        prop.value = this.scrollPaddingBottom;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.scrollPaddingLeft !== undefined) {
      this.scrollPaddingLeft = userSettings.scrollPaddingLeft;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.SCROLL_PADDING_LEFT_REF
      );
      if (prop) {
        prop.value = this.scrollPaddingLeft;
        await this.storeProperty(prop);
      }
    }
    if (userSettings.scrollPaddingRight !== undefined) {
      this.scrollPaddingRight = userSettings.scrollPaddingRight;
      let prop = this.userProperties?.getByRef(
        ReadiumCSS.SCROLL_PADDING_RIGHT_REF
      );
      if (prop) {
        prop.value = this.scrollPaddingRight;
        await this.storeProperty(prop);
      }
    }

    await this.applyProperties();
    this.settingsChangeCallback();
  }

  /**
   * Parses a scroll setting from a variety of inputs to a simple boolean
   */
  private static parseScrollSetting(
    inputSetting: InitialUserSettings["verticalScroll"]
  ): boolean {
    switch (inputSetting) {
      case true:
      case "scroll":
      case "readium-scroll-on":
        return true;
      case false:
      case "paginated":
      case "readium-scroll-off":
        return false;
      default:
        return false;
    }
  }

  private static parseAppearanceSetting(
    inputSetting: InitialUserSettings["appearance"]
  ): number {
    let a: string;
    if (inputSetting === "day" || inputSetting === "readium-default-on") {
      a = UserSettings.appearanceValues[0];
    } else if (
      inputSetting === "sepia" ||
      inputSetting === "readium-sepia-on"
    ) {
      a = UserSettings.appearanceValues[1];
    } else if (
      inputSetting === "night" ||
      inputSetting === "readium-night-on"
    ) {
      a = UserSettings.appearanceValues[2];
    } else {
      a = inputSetting;
    }
    return UserSettings.appearanceValues.findIndex((el: any) => el === a);
  }

  async scroll(scroll: boolean): Promise<void> {
    const position = this.view?.getCurrentPosition();
    this.verticalScroll = scroll;
    let prop = this.userProperties?.getByRef(ReadiumCSS.SCROLL_REF);
    if (prop) {
      prop.value = this.verticalScroll;
      await this.saveProperty(prop);
    }
    await this.applyProperties();
    this.swapRenderer(this.verticalScroll);
    if (position) {
      this.view?.goToProgression(position);
    }
    this.viewChangeCallback();
  }

  async increase(incremental: UserSettingsIncrementable): Promise<void> {
    if (incremental === "fontSize") {
      (
        this.userProperties?.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental
      ).increment();
      this.fontSize = this.userProperties?.getByRef(
        ReadiumCSS.FONT_SIZE_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_SIZE_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "letterSpacing") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.LETTER_SPACING_REF
        ) as Incremental
      ).increment();
      this.letterSpacing = this.userProperties?.getByRef(
        ReadiumCSS.LETTER_SPACING_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LETTER_SPACING_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "wordSpacing") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.WORD_SPACING_REF
        ) as Incremental
      ).increment();
      this.wordSpacing = this.userProperties?.getByRef(
        ReadiumCSS.WORD_SPACING_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.WORD_SPACING_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "lineHeight") {
      (
        this.userProperties?.getByRef(ReadiumCSS.LINE_HEIGHT_REF) as Incremental
      ).increment();
      this.lineHeight = this.userProperties?.getByRef(
        ReadiumCSS.LINE_HEIGHT_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LINE_HEIGHT_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "paraSpacing") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.PARA_SPACING_REF
        ) as Incremental
      ).increment();
      this.paraSpacing = this.userProperties?.getByRef(
        ReadiumCSS.PARA_SPACING_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PARA_SPACING_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "paraIndent") {
      (
        this.userProperties?.getByRef(ReadiumCSS.PARA_INDENT_REF) as Incremental
      ).increment();
      this.paraIndent = this.userProperties?.getByRef(
        ReadiumCSS.PARA_INDENT_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PARA_INDENT_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "typeScale") {
      (
        this.userProperties?.getByRef(ReadiumCSS.TYPE_SCALE_REF) as Incremental
      ).increment();
      this.typeScale = this.userProperties?.getByRef(
        ReadiumCSS.TYPE_SCALE_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.TYPE_SCALE_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "pageMargins") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.PAGE_MARGINS_REF
        ) as Incremental
      ).increment();
      this.pageMargins = this.userProperties?.getByRef(
        ReadiumCSS.PAGE_MARGINS_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PAGE_MARGINS_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "fontWeight") {
      (
        this.userProperties?.getByRef(ReadiumCSS.FONT_WEIGHT_REF) as Incremental
      ).increment();
      this.fontWeight = this.userProperties?.getByRef(
        ReadiumCSS.FONT_WEIGHT_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_WEIGHT_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "fontWidth") {
      (
        this.userProperties?.getByRef(ReadiumCSS.FONT_WIDTH_REF) as Incremental
      ).increment();
      this.fontWidth = this.userProperties?.getByRef(
        ReadiumCSS.FONT_WIDTH_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_WIDTH_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    }
    await this.applyProperties();
    this.settingsChangeCallback();
  }

  async decrease(incremental: UserSettingsIncrementable): Promise<void> {
    if (incremental === "fontSize") {
      (
        this.userProperties?.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental
      ).decrement();
      this.fontSize = this.userProperties?.getByRef(
        ReadiumCSS.FONT_SIZE_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_SIZE_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "letterSpacing") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.LETTER_SPACING_REF
        ) as Incremental
      ).decrement();
      this.letterSpacing = this.userProperties?.getByRef(
        ReadiumCSS.LETTER_SPACING_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LETTER_SPACING_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "wordSpacing") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.WORD_SPACING_REF
        ) as Incremental
      ).decrement();
      this.wordSpacing = this.userProperties?.getByRef(
        ReadiumCSS.WORD_SPACING_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.WORD_SPACING_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "lineHeight") {
      (
        this.userProperties?.getByRef(ReadiumCSS.LINE_HEIGHT_REF) as Incremental
      ).decrement();
      this.lineHeight = this.userProperties?.getByRef(
        ReadiumCSS.LINE_HEIGHT_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.LINE_HEIGHT_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "paraSpacing") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.PARA_SPACING_REF
        ) as Incremental
      ).decrement();
      this.paraSpacing = this.userProperties?.getByRef(
        ReadiumCSS.PARA_SPACING_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PARA_SPACING_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "paraIndent") {
      (
        this.userProperties?.getByRef(ReadiumCSS.PARA_INDENT_REF) as Incremental
      ).decrement();
      this.paraIndent = this.userProperties?.getByRef(
        ReadiumCSS.PARA_INDENT_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PARA_INDENT_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "typeScale") {
      (
        this.userProperties?.getByRef(ReadiumCSS.TYPE_SCALE_REF) as Incremental
      ).decrement();
      this.typeScale = this.userProperties?.getByRef(
        ReadiumCSS.TYPE_SCALE_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.TYPE_SCALE_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "pageMargins") {
      (
        this.userProperties?.getByRef(
          ReadiumCSS.PAGE_MARGINS_REF
        ) as Incremental
      ).decrement();
      this.pageMargins = this.userProperties?.getByRef(
        ReadiumCSS.PAGE_MARGINS_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.PAGE_MARGINS_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "fontWeight") {
      (
        this.userProperties?.getByRef(ReadiumCSS.FONT_WEIGHT_REF) as Incremental
      ).decrement();
      this.fontWeight = this.userProperties?.getByRef(
        ReadiumCSS.FONT_WEIGHT_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_WEIGHT_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    } else if (incremental === "fontWidth") {
      (
        this.userProperties?.getByRef(ReadiumCSS.FONT_WIDTH_REF) as Incremental
      ).decrement();
      this.fontWidth = this.userProperties?.getByRef(
        ReadiumCSS.FONT_WIDTH_REF
      )?.value;
      let prop = this.userProperties?.getByRef(ReadiumCSS.FONT_WIDTH_REF);
      if (prop) {
        await this.storeProperty(prop);
      }
    }
    await this.applyProperties();
    this.settingsChangeCallback();
  }

  // async publisher(on): Promise<void> {
  //   this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = on;
  //   this.storeProperty(
  //     this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF)
  //   );
  //   this.applyProperties();
  // }
}

/**
 * Apply a v2 image filter setting that accepts `boolean | number`.
 *
 * Numeric values take precedence: when `value` is a number (0..1), the
 * corresponding `--USER__*` CSS var is set to that amount — v2 ReadiumCSS
 * uses it as the filter strength (brightness / invert / etc.). When `value`
 * is `true`, a boolean flag string is written instead; v2 matches via
 * `[style*="readium-*-on"]`. When `value` is `false` the property is
 * removed entirely.
 */
function applyFilterSetting(
  html: HTMLHtmlElement,
  cssVarKey: string,
  value: boolean | number,
  booleanFlagString: string
): void {
  if (typeof value === "number") {
    html.style.setProperty(cssVarKey, String(value));
  } else if (value === true) {
    html.style.setProperty(cssVarKey, booleanFlagString);
  } else {
    html.style.removeProperty(cssVarKey);
  }
}
