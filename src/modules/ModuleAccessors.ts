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
import { ModuleRegistry } from "./ModuleRegistry";
import { NavigatorFeature } from "../navigator/VisualNavigator";

/**
 * Typed accessors over a ModuleRegistry.
 *
 * Single source of truth for built-in module lookups — both the navigator
 * (internal use) and D2Reader (public API) delegate to this class.
 * Adding a new built-in module = add a getter here and an entry in
 * NavigatorFeatureMap. No other lookup sites to update.
 *
 * Generic over the four shared-contract keys (Bookmarks, Annotations,
 * Search, History). Each navigator subclass specifies the CONCRETE
 * module class it hosts for those keys, so internal navigator code
 * sees the full API (including EPUB-specific methods). D2Reader uses
 * the default interface types for cross-navigator polymorphism.
 */
export class ModuleAccessors<
  B extends IBookmarkModule = IBookmarkModule,
  A extends IAnnotationModule = IAnnotationModule,
  S extends ISearchModule = ISearchModule,
  H extends IHistoryModule = IHistoryModule,
> {
  constructor(private readonly registry: ModuleRegistry) {}

  // ── Shared contracts (EPUB + PDF) ───────────────────────────
  get bookmarks(): B | undefined {
    return this.registry.get(NavigatorFeature.Bookmarks) as B | undefined;
  }
  get annotations(): A | undefined {
    return this.registry.get(NavigatorFeature.Annotations) as A | undefined;
  }
  get search(): S | undefined {
    return this.registry.get(NavigatorFeature.Search) as S | undefined;
  }
  get history(): H | undefined {
    return this.registry.get(NavigatorFeature.History) as H | undefined;
  }

  // ── EPUB-only concrete modules ──────────────────────────────
  get tts(): TTSModule2 | undefined {
    return this.registry.get(NavigatorFeature.TTS);
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
  get citations(): CitationModule | undefined {
    return this.registry.get(NavigatorFeature.Citations);
  }
  get consumption(): ConsumptionModule | undefined {
    return this.registry.get(NavigatorFeature.Consumption);
  }

  // ── PDF-only concrete modules ───────────────────────────────
  get viewSettings(): PdfViewSettingsModule | undefined {
    return this.registry.get(NavigatorFeature.ViewSettings);
  }
}
