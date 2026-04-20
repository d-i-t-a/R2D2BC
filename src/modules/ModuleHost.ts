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

import BookView from "../views/BookView";
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
  NavigatorAPI,
  ReaderRights,
  RequestConfig,
  SampleRead,
} from "../navigator/EpubNavigator";
import { UserSettings } from "../model/user-settings/UserSettings";
import { TextHighlighter } from "./highlight/TextHighlighter";

/**
 * Base interface that all modules use to interact with any navigator.
 * Both EpubNavigator and PDFNavigator implement this.
 */
export interface ModuleHost {
  // ── Core ────────────────────────────────────────────────────
  readonly publication: Publication;
  readonly settings: UserSettings;
  readonly rights: Partial<ReaderRights>;
  readonly api?: Partial<NavigatorAPI>;

  // ── DOM access (shared by both navigators) ──────────────────
  readonly mainElement: HTMLElement;
  readonly headerMenu?: HTMLElement | null;

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
 * Extended host interface for PDF-specific modules.
 *
 * Exposes pdfjs primitives that modules need to interact with the viewer,
 * page state, and persistence layer. Modules never touch the pdfjs internals
 * directly — they go through this host interface.
 */
export interface PDFModuleHost extends ModuleHost {
  // ── pdfjs primitives (read-only) ────────────────────────────
  readonly pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null;
  readonly pdfViewer: import("pdfjs-dist/web/pdf_viewer.mjs").PDFViewer;
  readonly findController: import("pdfjs-dist/web/pdf_viewer.mjs").PDFFindController;
  readonly eventBus: import("pdfjs-dist/web/pdf_viewer.mjs").EventBus;
  readonly linkService: import("pdfjs-dist/web/pdf_viewer.mjs").PDFLinkService;

  // ── Page state ──────────────────────────────────────────────
  readonly currentPage: number;
  readonly totalPages: number;
  readonly fingerprint: string | undefined;

  // ── Navigation ──────────────────────────────────────────────
  goToPage(page: number): void;

  // ── Persistence ─────────────────────────────────────────────
  readonly viewStore?: import("../store/Store").default;
  readonly annotator?: import("../store/Annotator").default;

  // ── Resource info ───────────────────────────────────────────
  readonly currentResourceLink: import("../model/v3").Link | undefined;
}

/**
 * Extended host interface for EPUB-specific modules.
 * Modules that need iframe DOM access, highlighter, or view use this.
 */
export interface EpubModuleHost extends ModuleHost {
  // ── EPUB content access ─────────────────────────────────────
  readonly iframes: HTMLIFrameElement[];
  readonly currentChapterLink: D2Link;
  readonly currentTocUrl: string | undefined;

  // ── Configuration ───────────────────────────────────────────
  readonly attributes?: IFrameAttributes;
  readonly requestConfig?: RequestConfig;
  readonly sample?: SampleRead;

  // ── View ────────────────────────────────────────────────────
  readonly view: BookView;
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
