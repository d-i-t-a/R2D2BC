/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type CitationModule from "./epub/CitationModule";
import type { ConsumptionModule } from "./epub/ConsumptionModule";
import type LineFocusModule from "./epub/LineFocusModule";
import type { MediaOverlayModule } from "./epub/mediaoverlays/MediaOverlayModule";
import type { PageBreakModule } from "./epub/PageBreakModule";
import type { TimelineModule } from "./epub/TimelineModule";
import type { ContentProtectionModule } from "./epub/ContentProtectionModule";
import type { DefinitionsModule } from "./epub/search/DefinitionsModule";
import type { TTSModule2 } from "./epub/TTS/TTSModule2";
import type { PdfViewSettingsModule } from "./pdf/PdfViewSettingsModule";
import type {
  IBookmarkModule,
  ISearchModule,
  IAnnotationModule,
  IHistoryModule,
} from "./interfaces";
import { NavigatorFeature } from "../navigator/VisualNavigator";

/**
 * Typed mapping from NavigatorFeature key → concrete module class.
 *
 * Integrators can extend this via declaration merging:
 * ```ts
 * declare module "@d-i-t-a/reader/dist/modules/NavigatorFeatureMap" {
 *   interface NavigatorFeatureMap {
 *     "vocabulary-builder": VocabularyBuilder;
 *   }
 * }
 * ```
 */
export interface NavigatorFeatureMap {
  // Shared contracts — EPUB and PDF both implement these:
  [NavigatorFeature.Bookmarks]: IBookmarkModule;
  [NavigatorFeature.Annotations]: IAnnotationModule;
  [NavigatorFeature.Search]: ISearchModule;
  [NavigatorFeature.History]: IHistoryModule;

  // EPUB-only (no PDF counterpart yet — concrete classes):
  [NavigatorFeature.TTS]: TTSModule2;
  [NavigatorFeature.Definitions]: DefinitionsModule;
  [NavigatorFeature.ContentProtection]: ContentProtectionModule;
  [NavigatorFeature.Timeline]: TimelineModule;
  [NavigatorFeature.PageBreaks]: PageBreakModule;
  [NavigatorFeature.MediaOverlays]: MediaOverlayModule;
  [NavigatorFeature.LineFocus]: LineFocusModule;
  [NavigatorFeature.Citations]: CitationModule;
  [NavigatorFeature.Consumption]: ConsumptionModule;

  // PDF-only:
  [NavigatorFeature.ViewSettings]: PdfViewSettingsModule;
}

export type NavigatorFeatureKey = keyof NavigatorFeatureMap;
