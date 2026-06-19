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

import Navigator from "./Navigator";
import { Locator } from "../model/v3";
import type { IFrameAttributes } from "./types";

import {
  NavigatorFeature,
  type NavigatorFeatureName,
} from "./NavigatorFeature";
export { NavigatorFeature, type NavigatorFeatureName };

/**
 * Abstract base class for visual navigators (EPUB, PDF, future DiViNa).
 *
 * Extends `Navigator` to inherit module registry, event emitter,
 * publication-derived list accessors, and the navigation contract.
 * Adds visual-only concerns: RTL-aware goLeft/goRight, page navigation,
 * and default no-ops for read-aloud / read-along / layer / marker /
 * zoom features that concrete subclasses override.
 */
export abstract class VisualNavigator extends Navigator {
  // ── Visual-only abstracts ─────────────────────────────────────
  // Page navigation is a visual concept (paginated/scrolled rendered
  // content). Audiobook navigators don't have pages — they use time
  // and resource indices instead.
  abstract goToPage(page: number): void | Promise<void>;
  abstract nextPage(): void | Promise<void>;
  abstract previousPage(): void | Promise<void>;

  /**
   * Position list for the visual publication. EPUB and PDF both source
   * this from `publication.positions` (auto-generated for EPUB, derived
   * from page count for PDF). Override only if a subclass needs to
   * compute it differently.
   */
  positions(): Locator[] {
    return this.publication.positions ?? [];
  }

  // ── Default no-ops for optional visual features ──────────────
  // EPUB and PDF override what they support. Audiobook is not a
  // VisualNavigator and therefore never inherits these.

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

  snapToSelector(_selector: string): void {}
  applyAttributes(_value: IFrameAttributes): void {}

  mostRecentNavigatedTocItem(): string | undefined {
    return undefined;
  }

  // ── RTL-aware navigation ──────────────────────────────────────

  /** True when the publication renders right-to-left. */
  private isRtl(): boolean {
    return (
      this.publication.metadata?.readingProgression === "rtl" ||
      this.publication.metadata?.otherMetadata?.[
        "rendition:spread-direction"
      ] === "rtl"
    );
  }

  /**
   * Navigate left — respects reading progression direction.
   * In LTR: goes to previous page. In RTL: goes to next page.
   */
  goLeft(): void {
    if (this.isRtl()) this.nextPage();
    else this.previousPage();
  }

  /**
   * Navigate right — respects reading progression direction.
   * In LTR: goes to next page. In RTL: goes to previous page.
   */
  goRight(): void {
    if (this.isRtl()) this.previousPage();
    else this.nextPage();
  }

  // ── Zoom (for FXL and PDF) — defaults overridden by subclasses ──
  fitToPage(): void {}
  fitToWidth(): void {}
  zoomIn(): void {}
  zoomOut(): void {}
  activateHand(): void {}
  deactivateHand(): void {}

  // ── PDF scroll-mode toggle (PDFNavigator overrides) ──────────
  scroll?(value: boolean, direction?: string): void | Promise<void>;
}
