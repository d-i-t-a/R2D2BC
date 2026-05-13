/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
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
 * Developed on behalf of: DITA (AM Consulting LLC)
 */

/**
 * Typed feature names for navigator capability queries.
 *
 * Lives in its own file so every navigator (visual or otherwise) can
 * reference the registry of feature names without inheriting from any
 * specific base class.
 */
export const NavigatorFeature = {
  TTS: "tts",
  MediaOverlays: "mediaOverlays",
  Search: "search",
  Annotations: "annotations",
  Bookmarks: "bookmarks",
  Comments: "comments",
  Zoom: "zoom",
  LineFocus: "lineFocus",
  Definitions: "definitions",
  Citations: "citations",
  ContentProtection: "contentProtection",
  Consumption: "consumption",
  History: "history",
  Timeline: "timeline",
  PageBreaks: "pageBreaks",
  ViewSettings: "viewSettings",
} as const;

export type NavigatorFeatureName =
  (typeof NavigatorFeature)[keyof typeof NavigatorFeature];
