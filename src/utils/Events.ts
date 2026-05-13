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
  Comment,
} from "../model/v3";

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

  // Audiobook playback (3.9)
  PlaybackStarted: "playback.started",
  PlaybackPaused: "playback.paused",
  PlaybackEnded: "playback.ended",
  PlaybackStalled: "playback.stalled",
  PlaybackError: "playback.error",
  /**
   * Toggled when playback is or is no longer waiting on audio data.
   * Fires on cross-chapter navigation, cold-start (play before bytes
   * arrive), and mid-playback buffer exhaustion. Payload carries the
   * new state. Swap the play button for a spinner when `waiting=true`.
   */
  PlaybackWaiting: "playback.waiting",
  TimeUpdated: "playback.timeupdate",
  TrackChanged: "playback.trackchanged",
  DurationChanged: "playback.durationchanged",
  PlaybackRateChanged: "playback.ratechanged",

  // Audiobook sleep timer (3.9 Phase 3)
  SleepTimerStarted: "playback.sleeptimer.started",
  SleepTimerCancelled: "playback.sleeptimer.cancelled",
  SleepTimerTick: "playback.sleeptimer.tick",
  SleepTimerExpired: "playback.sleeptimer.expired",

  // Comments (3.9)
  CommentCreated: "comments.created",
  CommentUpdated: "comments.updated",
  CommentDeleted: "comments.deleted",
  /** Emitted when the set of comments visible at the current playback time changes. */
  CommentsActive: "comments.active",
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

  // Audiobook playback (3.9)
  [ReaderEvent.PlaybackStarted]: { locator: Locator; currentTime: number };
  [ReaderEvent.PlaybackPaused]: { locator: Locator; currentTime: number };
  [ReaderEvent.PlaybackEnded]: { locator: Locator };
  [ReaderEvent.PlaybackStalled]: { locator: Locator; currentTime: number };
  [ReaderEvent.PlaybackError]: { error: unknown; locator: Locator };
  [ReaderEvent.PlaybackWaiting]: { waiting: boolean; locator: Locator };
  [ReaderEvent.TimeUpdated]: {
    locator: Locator;
    currentTime: number;
    duration: number;
  };
  [ReaderEvent.TrackChanged]: { previous: Locator | null; current: Locator };
  [ReaderEvent.DurationChanged]: { duration: number; locator: Locator };
  [ReaderEvent.PlaybackRateChanged]: { rate: number };

  // Sleep timer
  [ReaderEvent.SleepTimerStarted]: import("../navigator/audio/SleepTimer").SleepTimerSnapshot;
  [ReaderEvent.SleepTimerCancelled]: void;
  [ReaderEvent.SleepTimerTick]: import("../navigator/audio/SleepTimer").SleepTimerSnapshot;
  [ReaderEvent.SleepTimerExpired]: import("../navigator/audio/SleepTimer").SleepTimerSnapshot;

  // Comments (3.9)
  [ReaderEvent.CommentCreated]: Comment;
  [ReaderEvent.CommentUpdated]: Comment;
  [ReaderEvent.CommentDeleted]: { id: string };
  [ReaderEvent.CommentsActive]: { active: Comment[]; currentTime: number };
}
