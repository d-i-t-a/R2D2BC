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
