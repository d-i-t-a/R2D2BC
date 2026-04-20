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

import {
  Locator,
  ReadingPosition,
  Bookmark,
  Annotation,
} from "../model/Locator";

/**
 * Typed event names for the R2D2BC reader.
 *
 * Both navigators and modules emit these events through the EventEmitter.
 * Integrators can listen via:
 *   reader.addEventListener("resource.ready", handler)
 *   reader.addEventListener(ReaderEvent.ResourceReady, handler)
 *
 * All existing string event names are preserved for backwards compatibility.
 */

// ── Navigator Events ───────────────────────────────────────────

export const ReaderEvent = {
  // Resource lifecycle
  ResourceReady: "resource.ready",
  ResourceStart: "resource.start",
  ResourceEnd: "resource.end",
  ResourceFits: "resource.fits",
  ResourceError: "resource.error",

  // Navigation info
  Direction: "direction",
  ChapterInfo: "chapterinfo",
  PositionInfo: "positioninfo",
  LocationChanged: "location.changed",

  // User interaction
  Click: "click",
  KeyDown: "keydown",

  // Error
  Error: "error",

  // TTS / Read Aloud
  ReadAloudStarted: "readaloud.started",
  ReadAloudStopped: "readaloud.stopped",
  ReadAloudPaused: "readaloud.paused",
  ReadAloudResumed: "readaloud.resumed",
  ReadAloudFinished: "readaloud.finished",

  // Media Overlays / Read Along
  ReadAlongStarted: "readalong.started",
  ReadAlongStopped: "readalong.stopped",
  ReadAlongPaused: "readalong.paused",
  ReadAlongResumed: "readalong.resumed",
  ReadAlongFinished: "readalong.finished",

  // Bookmarks
  BookmarkCreated: "bookmark.created",
  BookmarkDeleted: "bookmark.deleted",

  // Annotations
  AnnotationCreated: "annotation.created",
  AnnotationDeleted: "annotation.deleted",
  AnnotationUpdated: "annotation.updated",
  AnnotationSelected: "annotation.selected",
  AnnotationCommentAdded: "annotation.comment.added",

  // Text selection / Toolbox
  ToolboxOpened: "toolbox.opened",
  ToolboxClosed: "toolbox.closed",
  TextSelected: "text.selected",

  // Definitions
  DefinitionSuccess: "definition.success",
  DefinitionClick: "definition.click",
  DefinitionVisible: "definition.visible",

  // Citation
  CitationCreated: "citation.created",
  CitationFailed: "citation.failed",

  // Content Protection
  InspectDetected: "inspect.detected",

  // Consumption tracking
  ActionTracked: "consumption.action",
  IdleSince: "consumption.idle",

  // PDF page navigation
  PageChanged: "page.changed",

  // PDF search matches
  PdfMatchesUpdated: "pdf.matches.updated",
} as const;

export type ReaderEventName = (typeof ReaderEvent)[keyof typeof ReaderEvent];

// ── Event Payloads ─────────────────────────────────────────────

export interface ReaderEventMap {
  // Resource lifecycle
  [ReaderEvent.ResourceReady]: void;
  [ReaderEvent.ResourceStart]: void;
  [ReaderEvent.ResourceEnd]: void;
  [ReaderEvent.ResourceFits]: void;
  [ReaderEvent.ResourceError]: Error;

  // Navigation info
  [ReaderEvent.Direction]: string;
  [ReaderEvent.ChapterInfo]: string | undefined;
  [ReaderEvent.PositionInfo]: Locator;
  [ReaderEvent.LocationChanged]: ReadingPosition;

  // User interaction
  [ReaderEvent.Click]: MouseEvent | TouchEvent;
  [ReaderEvent.KeyDown]: KeyboardEvent;

  // Error
  [ReaderEvent.Error]: Error;

  // TTS
  [ReaderEvent.ReadAloudStarted]: string;
  [ReaderEvent.ReadAloudStopped]: string;
  [ReaderEvent.ReadAloudPaused]: string;
  [ReaderEvent.ReadAloudResumed]: string;
  [ReaderEvent.ReadAloudFinished]: string;

  // Media Overlays
  [ReaderEvent.ReadAlongStarted]: string;
  [ReaderEvent.ReadAlongStopped]: string;
  [ReaderEvent.ReadAlongPaused]: string;
  [ReaderEvent.ReadAlongResumed]: string;
  [ReaderEvent.ReadAlongFinished]: string;

  // Bookmarks
  [ReaderEvent.BookmarkCreated]: Bookmark;
  [ReaderEvent.BookmarkDeleted]: Bookmark;

  // Annotations
  [ReaderEvent.AnnotationCreated]: Annotation;
  [ReaderEvent.AnnotationDeleted]: Annotation;
  [ReaderEvent.AnnotationUpdated]: Annotation;
  [ReaderEvent.AnnotationSelected]: Annotation;
  [ReaderEvent.AnnotationCommentAdded]: Annotation;

  // Text selection
  [ReaderEvent.ToolboxOpened]: string;
  [ReaderEvent.ToolboxClosed]: string;
  [ReaderEvent.TextSelected]: { text: string; selection: any };

  // Definitions
  [ReaderEvent.DefinitionSuccess]: any;
  [ReaderEvent.DefinitionClick]: { result: any; highlight: any };
  [ReaderEvent.DefinitionVisible]: { item: any; highlight: any };

  // Citation
  [ReaderEvent.CitationCreated]: string;
  [ReaderEvent.CitationFailed]: string;

  // Content Protection
  [ReaderEvent.InspectDetected]: void;

  // Consumption
  [ReaderEvent.ActionTracked]: { locator: Locator; action: any };
  [ReaderEvent.IdleSince]: number;

  // PDF
  [ReaderEvent.PageChanged]: { page: number; totalPages: number };
  [ReaderEvent.PdfMatchesUpdated]: { current: number; total: number };
}
