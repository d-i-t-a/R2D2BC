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

import EventEmitter from "eventemitter3";
import Navigator from "./Navigator";
import { Locator } from "../model/v3";
import { Publication } from "../model/v3";
import { Link } from "../model/v3";
import { IFrameAttributes } from "./IFrameNavigator";

/**
 * Typed feature names for navigator capability queries.
 */
export const NavigatorFeature = {
  TTS: "tts",
  MediaOverlays: "mediaOverlays",
  Search: "search",
  Annotations: "annotations",
  Bookmarks: "bookmarks",
  Zoom: "zoom",
  LineFocus: "lineFocus",
  Definitions: "definitions",
  Citations: "citations",
  ContentProtection: "contentProtection",
  Consumption: "consumption",
  History: "history",
  Timeline: "timeline",
} as const;

export type NavigatorFeatureName =
  (typeof NavigatorFeature)[keyof typeof NavigatorFeature];

/**
 * Abstract base class for all visual navigators.
 *
 * Extends EventEmitter for the event system.
 * Implements the Navigator interface for backwards compatibility.
 *
 * Subclasses: EpubNavigator (reflowable + FXL), PDFNavigator (PDF.js),
 * and future navigators (AudiobookNavigator, DiViNaNavigator).
 */
export abstract class VisualNavigator
  extends EventEmitter
  implements Navigator
{
  abstract publication: Publication;

  // ── Required implementations ──────────────────────────────────

  abstract currentLocator(): Locator;
  abstract positions(): Locator[];
  abstract currentResource(): number | undefined;
  abstract totalResources(): number;

  abstract goTo(locator: Locator): void;
  abstract goToPosition(value: number): void;
  abstract goToPage(page: number): void;
  abstract nextPage(): void;
  abstract previousPage(): void;
  abstract nextResource(): void;
  abstract previousResource(): void;

  abstract atStart(): boolean;
  abstract atEnd(): boolean;

  abstract tableOfContents(): Link[];
  abstract landmarks(): Link[];
  abstract pageList(): Link[];
  abstract readingOrder(): Link[];

  abstract stop(): void;

  // ── Capability query ──────────────────────────────────────────

  /**
   * Check if this navigator supports a given feature.
   * Replaces instanceof checks in D2Reader.
   */
  supports(_feature: NavigatorFeatureName): boolean {
    return false;
  }

  // ── Default no-ops for optional features ──────────────────────
  // Subclasses override what they support. D2Reader calls these
  // without instanceof checks — if the navigator doesn't support
  // the feature, the no-op runs silently.

  startReadAloud(): void {}
  stopReadAloud(): void {}
  pauseReadAloud(): void {}
  resumeReadAloud(): void {}

  startReadAlong(): void {}
  stopReadAlong(): void {}
  pauseReadAlong(): void {}
  resumeReadAlong(): void {}

  hideLayer(_layer: string): void {}
  showLayer(_layer: string): void {}

  activateMarker(_id: string, _position: string): void {}
  deactivateMarker(): void {}

  snapToSelector?(_selector: string): void {}
  applyAttributes?(_value: IFrameAttributes): void {}

  mostRecentNavigatedTocItem?(): string | undefined {
    return undefined;
  }

  // ── RTL-aware navigation ──────────────────────────────────────

  /**
   * Navigate left — respects reading progression direction.
   * In LTR: goes to previous page. In RTL: goes to next page.
   */
  goLeft(): void {
    const rtl =
      this.publication.metadata?.readingProgression === "rtl" ||
      this.publication.metadata?.otherMetadata?.[
        "rendition:spread-direction"
      ] === "rtl";
    if (rtl) {
      this.nextPage();
    } else {
      this.previousPage();
    }
  }

  /**
   * Navigate right — respects reading progression direction.
   * In LTR: goes to next page. In RTL: goes to previous page.
   */
  goRight(): void {
    const rtl =
      this.publication.metadata?.readingProgression === "rtl" ||
      this.publication.metadata?.otherMetadata?.[
        "rendition:spread-direction"
      ] === "rtl";
    if (rtl) {
      this.previousPage();
    } else {
      this.nextPage();
    }
  }

  // ── Zoom (for FXL and PDF) ────────────────────────────────────
  // Default no-ops. PDFNavigator and EpubNavigator (FXL) override.

  fitToPage(): void {}
  fitToWidth(): void {}
  zoomIn(): void {}
  zoomOut(): void {}
  activateHand(): void {}
  deactivateHand(): void {}
}
