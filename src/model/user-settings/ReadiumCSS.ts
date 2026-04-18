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

export class ReadiumCSS {
  // --- v1.1.x and shared (present in both v1 and v2) ---
  static readonly FONT_SIZE_REF = "fontSize";
  static readonly FONT_FAMILY_REF = "fontFamily";
  static readonly FONT_OVERRIDE_REF = "fontOverride";
  static readonly APPEARANCE_REF = "appearance";
  static readonly SCROLL_REF = "scroll";
  static readonly ADVANCED_SETTINGS_REF = "advancedSettings";
  static readonly TEXT_ALIGNMENT_REF = "textAlign";
  static readonly COLUMN_COUNT_REF = "colCount";
  static readonly DIRECTION_REF = "direction";
  static readonly WORD_SPACING_REF = "wordSpacing";
  static readonly LETTER_SPACING_REF = "letterSpacing";
  static readonly PAGE_MARGINS_REF = "pageMargins";
  static readonly LINE_HEIGHT_REF = "lineHeight";
  static readonly BODY_HYPHENS_REF = "bodyHyphens";
  static readonly PARA_SPACING_REF = "paraSpacing";
  static readonly PARA_INDENT_REF = "paraIndent";
  static readonly TYPE_SCALE_REF = "typeScale";
  static readonly BACKGROUND_COLOR_REF = "backgroundColor";
  static readonly TEXT_COLOR_REF = "textColor";

  static readonly FONT_SIZE_KEY = "--USER__" + ReadiumCSS.FONT_SIZE_REF;
  static readonly FONT_FAMILY_KEY = "--USER__" + ReadiumCSS.FONT_FAMILY_REF;
  static readonly FONT_OVERRIDE_KEY = "--USER__" + ReadiumCSS.FONT_OVERRIDE_REF;
  static readonly APPEARANCE_KEY = "--USER__" + ReadiumCSS.APPEARANCE_REF;
  static readonly SCROLL_KEY = "--USER__" + ReadiumCSS.SCROLL_REF;
  static readonly ADVANCED_SETTINGS_KEY =
    "--USER__" + ReadiumCSS.ADVANCED_SETTINGS_REF;
  static readonly TEXT_ALIGNMENT_KEY =
    "--USER__" + ReadiumCSS.TEXT_ALIGNMENT_REF;
  static readonly COLUMN_COUNT_KEY = "--USER__" + ReadiumCSS.COLUMN_COUNT_REF;
  static readonly DIRECTION_KEY = "--USER__" + ReadiumCSS.DIRECTION_REF;
  static readonly WORD_SPACING_KEY = "--USER__" + ReadiumCSS.WORD_SPACING_REF;
  static readonly LETTER_SPACING_KEY =
    "--USER__" + ReadiumCSS.LETTER_SPACING_REF;
  static readonly PAGE_MARGINS_KEY = "--USER__" + ReadiumCSS.PAGE_MARGINS_REF;
  static readonly LINE_HEIGHT_KEY = "--USER__" + ReadiumCSS.LINE_HEIGHT_REF;
  static readonly BODY_HYPHENS_KEY = "--USER__" + ReadiumCSS.BODY_HYPHENS_REF;
  static readonly PARA_SPACING_KEY = "--USER__" + ReadiumCSS.PARA_SPACING_REF;
  static readonly PARA_INDENT_KEY = "--USER__" + ReadiumCSS.PARA_INDENT_REF;
  static readonly TYPE_SCALE_KEY = "--USER__" + ReadiumCSS.TYPE_SCALE_REF;
  static readonly BACKGROUND_COLOR_KEY =
    "--USER__" + ReadiumCSS.BACKGROUND_COLOR_REF;
  static readonly TEXT_COLOR_KEY = "--USER__" + ReadiumCSS.TEXT_COLOR_REF;

  // --- v2.0.0-only variables ---
  // These do nothing when the integrator has injected v1 CSS — the browser
  // stores the custom property but no rule reads it. When v2 CSS is injected
  // these drive the new behaviour.

  // Replaces pageMargins (inverted semantics — higher lineLength = wider text,
  // narrower margins). Default in v2 is 100%.
  static readonly LINE_LENGTH_REF = "lineLength";
  static readonly LINE_LENGTH_KEY = "--USER__" + ReadiumCSS.LINE_LENGTH_REF;

  // Variable font axes (requires integrator-supplied variable font).
  static readonly FONT_WEIGHT_REF = "fontWeight";
  static readonly FONT_WEIGHT_KEY = "--USER__" + ReadiumCSS.FONT_WEIGHT_REF;

  static readonly FONT_WIDTH_REF = "fontWidth";
  static readonly FONT_WIDTH_KEY = "--USER__" + ReadiumCSS.FONT_WIDTH_REF;

  static readonly FONT_OPTICAL_SIZING_REF = "fontOpticalSizing";
  static readonly FONT_OPTICAL_SIZING_KEY =
    "--USER__" + ReadiumCSS.FONT_OPTICAL_SIZING_REF;

  // Typography
  static readonly LIGATURES_REF = "ligatures";
  static readonly LIGATURES_KEY = "--USER__" + ReadiumCSS.LIGATURES_REF;

  // Image filters (v2 decoupled these from appearance themes)
  static readonly BLEND_IMAGES_REF = "blendImages";
  static readonly BLEND_IMAGES_KEY = "--USER__" + ReadiumCSS.BLEND_IMAGES_REF;

  static readonly DARKEN_IMAGES_REF = "darkenImages";
  static readonly DARKEN_IMAGES_KEY = "--USER__" + ReadiumCSS.DARKEN_IMAGES_REF;

  static readonly INVERT_IMAGES_REF = "invertImages";
  static readonly INVERT_IMAGES_KEY = "--USER__" + ReadiumCSS.INVERT_IMAGES_REF;

  static readonly INVERT_GAIJI_REF = "invertGaiji";
  static readonly INVERT_GAIJI_KEY = "--USER__" + ReadiumCSS.INVERT_GAIJI_REF;

  // v2 theme colour vars (complement existing backgroundColor, textColor)
  static readonly LINK_COLOR_REF = "linkColor";
  static readonly LINK_COLOR_KEY = "--USER__" + ReadiumCSS.LINK_COLOR_REF;

  static readonly VISITED_COLOR_REF = "visitedColor";
  static readonly VISITED_COLOR_KEY = "--USER__" + ReadiumCSS.VISITED_COLOR_REF;

  static readonly SELECTION_BACKGROUND_COLOR_REF = "selectionBackgroundColor";
  static readonly SELECTION_BACKGROUND_COLOR_KEY =
    "--USER__" + ReadiumCSS.SELECTION_BACKGROUND_COLOR_REF;

  static readonly SELECTION_TEXT_COLOR_REF = "selectionTextColor";
  static readonly SELECTION_TEXT_COLOR_KEY =
    "--USER__" + ReadiumCSS.SELECTION_TEXT_COLOR_REF;

  // Scroll-view padding (RS-scoped, replaces pageGutter in scroll mode)
  static readonly SCROLL_PADDING_TOP_KEY = "--RS__scrollPaddingTop";
  static readonly SCROLL_PADDING_BOTTOM_KEY = "--RS__scrollPaddingBottom";
  static readonly SCROLL_PADDING_LEFT_KEY = "--RS__scrollPaddingLeft";
  static readonly SCROLL_PADDING_RIGHT_KEY = "--RS__scrollPaddingRight";

  // Fallback: opts into v1 font-size normalization when the browser does not
  // support CSS `zoom`.
  static readonly FONT_SIZE_NORMALIZE_KEY = "--USER__fontSizeNormalize";
}

// --- v1 ↔ v2 helpers ---

/**
 * Resolve "auto" column count to a numeric value based on viewport width.
 *
 * v1 ReadiumCSS had media queries that switched 1↔2 columns responsively.
 * v2 removed those queries and also lifted the 2-column cap. Per the v2
 * migration guide, integrators must resolve "auto" in JavaScript.
 *
 * Breakpoints:
 *   < 600px   → 1 column
 *   600-1199  → 2 columns
 *   1200-1799 → 3 columns
 *   >= 1800   → 4 columns
 */
export function resolveAutoColumns(viewportWidth: number): string {
  if (viewportWidth >= 1800) return "4";
  if (viewportWidth >= 1200) return "3";
  if (viewportWidth >= 600) return "2";
  return "1";
}

/**
 * Map v1 pageMargins (0.5..4, default 2) to v2 lineLength percentage.
 * Inverted semantics: larger pageMargins → narrower lineLength.
 *
 * Formula: lineLength = 100 - (pageMargins - 0.5) * 20, clamped to 0..100.
 * pageMargins 0.5 → 100%
 * pageMargins 2   →  70%
 * pageMargins 4   →  30%
 */
export function pageMarginsToLineLength(pageMargins: number): string {
  const clamped = Math.max(0.5, Math.min(4, pageMargins));
  const percent = Math.max(0, Math.min(100, 100 - (clamped - 0.5) * 20));
  return percent + "%";
}

/**
 * Appearance → v2 theme colour presets.
 *
 * Values match ReadiumCSS v1.1.x so v1 and v2 integrators get visually
 * identical themes. v1 defines these inside the stylesheet itself
 * (see readium-sepia-on / readium-night-on rules); v2 removed the built-in
 * appearance flag so we set the individual --USER__* colour vars.
 *
 * When an integrator sets appearance, we set the v1 --USER__appearance flag
 * AND these individual v2 colour vars. If the integrator also provides an
 * explicit backgroundColor / textColor those take precedence in applyProperties.
 *
 * Each preset also implies image filter behaviour (see APPEARANCE_IMAGE_FILTERS
 * below) — sepia blends images, night inverts them. Matches v1 defaults.
 */
export const APPEARANCE_COLOR_PRESETS = {
  "readium-default-on": {
    background: "#ffffff",
    text: "#121212",
    link: "#0000ee",
    visited: "#551a8b",
    selectionBackground: "#b4d8fe",
    selectionText: "inherit",
  },
  "readium-sepia-on": {
    background: "#faf4e8",
    text: "#121212",
    link: "#0000ee",
    visited: "#551a8b",
    selectionBackground: "#b4d8fe",
    selectionText: "inherit",
  },
  "readium-night-on": {
    background: "#000000",
    text: "#fefefe",
    link: "#63caff",
    visited: "#0099e5",
    selectionBackground: "#b4d8fe",
    selectionText: "inherit",
  },
} as const;

/**
 * Appearance → image filter behaviour (matches v1 ReadiumCSS auto-behaviour).
 *
 * v1 implicitly applies `mix-blend-mode: multiply` to all images in Sepia
 * so they blend with the warm background. v2 does not — we drive the
 * `blendImages` flag from the preset to match.
 *
 * v1 does NOT invert images in Night by default — only gaiji and titlepage
 * images get auto-inverted (handled by v1 CSS rules directly, not via our
 * flags). Regular images in Night keep their original colours in v1.
 * Integrators who want night-mode image inversion (old convention with
 * `readium-darken-on` / `readium-invert-on`) must set it explicitly.
 *
 * Integrators can override per-setting after appearance is applied.
 */
export const APPEARANCE_IMAGE_FILTERS = {
  "readium-default-on": {
    blendImages: false,
    invertImages: false,
    darkenImages: false,
  },
  "readium-sepia-on": {
    blendImages: true,
    invertImages: false,
    darkenImages: false,
  },
  "readium-night-on": {
    blendImages: false,
    invertImages: false,
    darkenImages: false,
  },
} as const;

export type AppearanceValue = keyof typeof APPEARANCE_COLOR_PRESETS;
