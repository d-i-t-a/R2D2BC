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
import { ModuleRegistry } from "./ModuleRegistry";
import { NavigatorFeature } from "../navigator/VisualNavigator";

/**
 * Typed accessors over a ModuleRegistry.
 *
 * Single source of truth for built-in module lookups — both the navigator
 * (internal use) and D2Reader (public API) delegate to this class.
 * Adding a new built-in module = add a getter here and an entry in
 * NavigatorFeatureMap. No other lookup sites to update.
 */
export class ModuleAccessors {
  constructor(private readonly registry: ModuleRegistry) {}

  get bookmarks(): BookmarkModule | undefined {
    return this.registry.get(NavigatorFeature.Bookmarks);
  }
  get annotations(): AnnotationModule | undefined {
    return this.registry.get(NavigatorFeature.Annotations);
  }
  get tts(): TTSModule2 | undefined {
    return this.registry.get(NavigatorFeature.TTS);
  }
  get search(): SearchModule | undefined {
    return this.registry.get(NavigatorFeature.Search);
  }
  get definitions(): DefinitionsModule | undefined {
    return this.registry.get(NavigatorFeature.Definitions);
  }
  get contentProtection(): ContentProtectionModule | undefined {
    return this.registry.get(NavigatorFeature.ContentProtection);
  }
  get timeline(): TimelineModule | undefined {
    return this.registry.get(NavigatorFeature.Timeline);
  }
  get pageBreaks(): PageBreakModule | undefined {
    return this.registry.get(NavigatorFeature.PageBreaks);
  }
  get mediaOverlays(): MediaOverlayModule | undefined {
    return this.registry.get(NavigatorFeature.MediaOverlays);
  }
  get lineFocus(): LineFocusModule | undefined {
    return this.registry.get(NavigatorFeature.LineFocus);
  }
  get history(): HistoryModule | undefined {
    return this.registry.get(NavigatorFeature.History);
  }
  get citations(): CitationModule | undefined {
    return this.registry.get(NavigatorFeature.Citations);
  }
  get consumption(): ConsumptionModule | undefined {
    return this.registry.get(NavigatorFeature.Consumption);
  }
}
