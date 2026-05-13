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

import Renderer from "../views/Renderer";
import { D2Link } from "../model/v3";
import { Locator } from "../model/v3";
import { Publication } from "../model/v3";
import { ReaderModule } from "./ReaderModule";
import type { ReaderEventMap } from "../utils/Events";
import type {
  NavigatorFeatureKey,
  NavigatorFeatureMap,
} from "./NavigatorFeatureMap";
import {
  IFrameAttributes,
  RequestConfig,
  SampleRead,
} from "../navigator/EpubNavigator";
import type { NavigatorAPI, ReaderRights } from "../navigator/types";
import { UserSettings } from "../model/user-settings/UserSettings";
import { TextHighlighter } from "./highlight/TextHighlighter";

/**
 * Minimal host interface every navigator provides — visual or not.
 *
 * Audiobook navigators implement this directly; EPUB and PDF
 * navigators implement `VisualModuleHost` which extends this with
 * DOM / settings / fetcher fields that don't apply to audio.
 */
export interface ModuleHost {
  // ── Core ────────────────────────────────────────────────────
  readonly publication: Publication;
  readonly rights: Partial<ReaderRights>;
  readonly api?: Partial<NavigatorAPI>;

  // ── Navigation ──────────────────────────────────────────────
  goTo(locator: Locator): void | Promise<void>;
  nextResource(): void | Promise<void>;

  // ── Position info ───────────────────────────────────────────
  currentLocator(): Locator;
  currentResource(): number | undefined;

  // ── Events ──────────────────────────────────────────────────
  /**
   * Emit a typed reader event. Event names must be keys of ReaderEventMap;
   * the payload type is enforced against the map. Events with `void`
   * payload take no arguments.
   */
  emit<K extends keyof ReaderEventMap>(
    event: K,
    ...args: ReaderEventMap[K] extends void ? [] : [ReaderEventMap[K]]
  ): boolean;
  /** Fallback for custom event names not in the map (discouraged). */
  emit(event: string, ...args: unknown[]): boolean;

  // ── Module cross-reference ──────────────────────────────────
  getModule<K extends NavigatorFeatureKey>(
    name: K
  ): NavigatorFeatureMap[K] | undefined;
  getModule<T extends ReaderModule = ReaderModule>(name: string): T | undefined;
}

/**
 * Host interface for navigators that render the publication into a
 * DOM container — EPUB and PDF.
 *
 * Adds the visual concerns (settings, fetcher, main element, header
 * menu) that audio-only navigators don't have.
 */
export interface VisualModuleHost extends ModuleHost {
  // ── Settings ────────────────────────────────────────────────
  readonly settings: UserSettings;

  // ── Content loading ─────────────────────────────────────────
  readonly fetcher: import("../fetcher/Fetcher").Fetcher;

  // ── DOM access ──────────────────────────────────────────────
  readonly mainElement: HTMLElement;
  readonly headerMenu?: HTMLElement | null;
}

/**
 * Extended host interface for PDF-specific modules.
 *
 * Exposes pdfjs primitives that modules need to interact with the viewer,
 * page state, and persistence layer. Modules never touch the pdfjs internals
 * directly — they go through this host interface.
 */
export interface PDFModuleHost extends VisualModuleHost {
  // ── pdfjs primitives (read-only) ────────────────────────────
  // Only the primitives modules actually consume are exposed here.
  // `linkService`, `findController` are PDF-internal; access via the
  // navigator if a module ever needs them.
  readonly pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null;
  readonly pdfViewer: import("pdfjs-dist/web/pdf_viewer.mjs").PDFViewer;
  readonly eventBus: import("pdfjs-dist/web/pdf_viewer.mjs").EventBus;

  // ── Page state ──────────────────────────────────────────────
  readonly currentPage: number;
  readonly totalPages: number;
  readonly fingerprint: string | undefined;

  // ── Navigation ──────────────────────────────────────────────
  goToPage(page: number): void;

  // Persistence (`annotator`, `viewStore`) is no longer pulled from the
  // host — PDF modules receive it via constructor injection (mirrors
  // EpubBookmarkModule / EpubAnnotationModule).

  // ── Resource info ───────────────────────────────────────────
  readonly currentResourceLink: import("../model/v3").Link | undefined;
}

/**
 * Extended host interface for EPUB-specific modules.
 * Modules that need iframe DOM access, highlighter, or view use this.
 */
export interface EpubModuleHost extends VisualModuleHost {
  // ── EPUB content access ─────────────────────────────────────
  readonly iframes: HTMLIFrameElement[];
  readonly currentChapterLink: D2Link;
  readonly currentTocUrl: string | undefined;

  // ── Configuration ───────────────────────────────────────────
  readonly attributes?: IFrameAttributes;
  readonly requestConfig?: RequestConfig;
  readonly sample?: SampleRead;

  // ── View ────────────────────────────────────────────────────
  readonly view: Renderer;
  readonly errorMessage: HTMLDivElement;
  sideNavExpanded: boolean;

  // ── Highlighter ─────────────────────────────────────────────
  readonly highlighter?: TextHighlighter;

  // ── EPUB-specific methods ───────────────────────────────────
  reload(): void;
  stopReadAloud(): void;
  updatePositionInfo(save?: boolean): void | Promise<void>;
  hideLayer(layer: string): void;
  showLayer(layer: string): void;
  navigate(locator: Locator, history?: boolean): void;
}

/**
 * Host interface for audio-only navigators (AudiobookNavigator).
 *
 * Currently no audio-specific fields are required by any module —
 * `currentLocator()` from the base ModuleHost is enough to derive
 * the playback position (it includes `locations.time` for audiobook).
 * Add fields here only when a real module need surfaces (e.g. a
 * future TranscriptModule might want a typed audio-time accessor).
 */
export interface AudiobookModuleHost extends ModuleHost {
  /**
   * Hint the navigator to begin loading `readingOrder[index]` ahead of
   * time. Used by the timeline module: as the user drags the whole-book
   * scrubber across chapter boundaries, calling this for each crossed
   * chapter warms the audio cache so the post-release seek lands fast
   * instead of paying the cold-fetch latency.
   *
   * Fire-and-forget — calls are non-blocking, idempotent, and silently
   * no-op if the target is already cached or out of range.
   */
  prefetchResource(index: number): void;
}
