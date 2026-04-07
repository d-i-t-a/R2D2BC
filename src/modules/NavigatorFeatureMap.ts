/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { AnnotationModule } from "./AnnotationModule";
import type { BookmarkModule } from "./BookmarkModule";
import type CitationModule from "./citation/CitationModule";
import type { ConsumptionModule } from "./consumption/ConsumptionModule";
import type { HistoryModule } from "./history/HistoryModule";
import type LineFocusModule from "./linefocus/LineFocusModule";
import type { MediaOverlayModule } from "./mediaoverlays/MediaOverlayModule";
import type { PageBreakModule } from "./pagebreak/PageBreakModule";
import type { TimelineModule } from "./positions/TimelineModule";
import type { ContentProtectionModule } from "./protection/ContentProtectionModule";
import type { DefinitionsModule } from "./search/DefinitionsModule";
import type { SearchModule } from "./search/SearchModule";
import type { TTSModule2 } from "./TTS/TTSModule2";
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
  [NavigatorFeature.Bookmarks]: BookmarkModule;
  [NavigatorFeature.Annotations]: AnnotationModule;
  [NavigatorFeature.TTS]: TTSModule2;
  [NavigatorFeature.Search]: SearchModule;
  [NavigatorFeature.Definitions]: DefinitionsModule;
  [NavigatorFeature.ContentProtection]: ContentProtectionModule;
  [NavigatorFeature.Timeline]: TimelineModule;
  [NavigatorFeature.PageBreaks]: PageBreakModule;
  [NavigatorFeature.MediaOverlays]: MediaOverlayModule;
  [NavigatorFeature.LineFocus]: LineFocusModule;
  [NavigatorFeature.History]: HistoryModule;
  [NavigatorFeature.Citations]: CitationModule;
  [NavigatorFeature.Consumption]: ConsumptionModule;
}

export type NavigatorFeatureKey = keyof NavigatorFeatureMap;
