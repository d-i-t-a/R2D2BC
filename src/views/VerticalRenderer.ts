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
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import * as HTMLUtilities from "../utils/HTMLUtilities";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import ReflowableRenderer from "./ReflowableRenderer";

/**
 * Scroll-mode reflowable renderer with HORIZONTAL scroll axis.
 *
 * Axis-swap of {@link ScrollRenderer}: ScrollRenderer is horizontal-text
 * content scrolling vertically (Y axis); VerticalRenderer is vertical-text
 * content scrolling horizontally (X axis). Wherever ScrollRenderer reads
 * or writes a HEIGHT-related dimension, this reads/writes the WIDTH analog;
 * wherever ScrollRenderer touches `scrollTop`, this touches `scrollLeft`.
 *
 * Used for `cjk-vertical` and `mongolian-vertical` script modes — selected
 * by UserSettings.swapRenderer based on publication scriptMode regardless
 * of the user's verticalScroll preference (vertical scripts are scroll-only
 * by design; no in-resource pagination).
 *
 * Always runs in iframe-scroll mode regardless of `attributes.scrollContainer`.
 * Host-scroll on vertical-rl is unreliable (negative `scrollLeft` semantics,
 * scroll-position invalidation on iframe.width writes, visible flicker on
 * the reading axis when iframe resizes), so the integrator's setting is
 * ignored for vertical scripts. The iframe stays at viewport width and
 * the iframe document scrolls horizontally internally.
 *
 * `vertical-rl` (CJK vertical) browsers expose `scrollLeft` as negative
 * when scrolled away from the start. Reads use `Math.abs()`; writes flip
 * sign for vertical-rl so progression math is mode-agnostic.
 */
export default class VerticalRenderer extends ReflowableRenderer {
  name = "readium-scroll-on";
  label = "Scrolling";

  readonly verticalRtl: boolean;

  /**
   * Scroll-axis viewport size (X axis). Analog of ScrollRenderer's
   * `this.height`. Updated each `setSize()` so window resizes are
   * picked up.
   */
  private width: number = 0;

  /**
   * @param store         Persistence store for user property reads.
   * @param verticalRtl   `true` for `cjk-vertical` (writing-mode:
   *                      vertical-rl, scrollLeft negative when scrolled).
   *                      `false` for `mongolian-vertical` (writing-mode:
   *                      vertical-lr, scrollLeft positive when scrolled).
   */
  constructor(store: import("../store/Store").default, verticalRtl: boolean) {
    super(store);
    this.verticalRtl = verticalRtl;
  }

  isScrollMode(): boolean {
    return true;
  }

  isPaginated(): boolean {
    return false;
  }

  engage(): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const head = HTMLUtilities.findIframeElement(
        doc,
        "head"
      ) as HTMLHeadElement;
      if (head) {
        const viewport = HTMLUtilities.findElement(head, "meta[name=viewport]");
        if (viewport) {
          viewport.remove();
        }
      }
      const html = HTMLUtilities.findIframeElement(
        doc,
        "html"
      ) as HTMLHtmlElement;
      if (html) {
        // Clear any inherited inline width or height from a prior renderer.
        // ColumnRenderer sets `documentElement.style.height` for paginated
        // mode; if left in place it caps the multicol container and the
        // vertical-rl scroll math measures wrong.
        html.style.removeProperty("width");
        html.style.removeProperty("height");
      }
      doc
        .querySelectorAll('[id^="r2d2bc-column-spacer"]')
        .forEach((el) => el.remove());
    }

    // Vertical always uses iframe-scroll: bake in `scrolling="auto"` so the
    // iframe document's internal horizontal scrollbar is enabled. Reasserting
    // here covers any post-creation drift.
    this.iframe.setAttribute("scrolling", "auto");
    this.setSize();

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  start(): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const head = HTMLUtilities.findIframeElement(
        doc,
        "head"
      ) as HTMLHeadElement;
      if (head) {
        const viewport = HTMLUtilities.findElement(head, "meta[name=viewport]");
        if (viewport) {
          viewport.remove();
        }
      }
    }
    this.setSize();
  }

  setSize(): void {
    // Refresh scroll-axis size each call so window resizes resize the
    // iframe — this.width set during engage goes stale otherwise.
    this.width = BrowserUtilities.computeIframeContentWidth(
      this.iframe,
      this.attributes
    );
    // Iframe stays at viewport width; the iframe document's
    // `documentElement` (with `overflow-x: auto` from the cjk-vertical
    // injectable) scrolls horizontally to reveal multicol columns.
    // Don't size the iframe to content extent — vertical-rl scrollWidth
    // measurements are unreliable (browsers report 2× or higher due to
    // scroll-origin phantom regions).
    this.iframe.width = this.width + "px";
    // Perpendicular dimension: viewport height minus safeArea top/bottom.
    this.iframe.height =
      BrowserUtilities.computeIframeContentHeight(
        this.iframe,
        this.attributes
      ) + "px";
    BrowserUtilities.applyIframeSafeAreaMargins(this.iframe, this.attributes);
  }

  getCurrentPosition(): number {
    const extent = this.getScrollExtent();
    return extent > 0 ? this.getScrollOffset() / extent : 0;
  }

  goToProgression(position: number): void {
    this.setScrollOffset(this.getScrollExtent() * position);
  }

  snap(_element: HTMLElement | null, _relative?: boolean): void {
    // No snap in scroll mode — kept for Renderer interface compliance.
  }

  goToElement(element: HTMLElement | null, _relative?: boolean): void {
    if (element) {
      element.scrollIntoView({ inline: "center" });
    }
  }

  atStart(): boolean {
    return this.getScrollOffset() === 0;
  }

  atEnd(): boolean {
    return (
      Math.ceil(this.getScrollExtent() - this.getScrollOffset()) - 1 <=
      BrowserUtilities.computeIframeContentWidth(this.iframe, this.attributes)
    );
  }

  goToPreviousPage(): void {
    const offset = this.getScrollOffset();
    const step =
      BrowserUtilities.computeIframeContentWidth(this.iframe, this.attributes) -
      40;
    const next = offset - step;
    this.setScrollOffset(next >= 0 ? next : 0);
    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  goToNextPage(): void {
    const offset = this.getScrollOffset();
    const step =
      BrowserUtilities.computeIframeContentWidth(this.iframe, this.attributes) -
      40;
    const extent = this.getScrollExtent();
    const next = offset + step;
    this.setScrollOffset(next < extent ? next : extent);
    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  getCurrentPage(): number {
    return 0;
  }

  getPageCount(): number {
    return 0;
  }

  getScrollSurface():
    | { kind: "host"; element: HTMLElement }
    | { kind: "iframe"; iframe: HTMLIFrameElement } {
    // VerticalRenderer always uses iframe-internal scroll regardless of
    // integrator's `scrollContainer` setting (vertical scripts are
    // scroll-only by design and host-scroll on vertical-rl is unreliable).
    return { kind: "iframe", iframe: this.iframe };
  }

  /**
   * Scroll offset along the X axis, normalized to a positive distance-
   * from-start. The iframe document is in `vertical-rl` (or `vertical-lr`
   * for Mongolian); browsers expose `scrollLeft` as negative when scrolled
   * away from the right-edge start in vertical-rl. `Math.abs()` collapses
   * to a positive distance.
   */
  private getScrollOffset(): number {
    return Math.abs(this.scrollingElement?.scrollLeft ?? 0);
  }

  /**
   * Set scroll offset along the X axis. Caller passes a positive
   * distance-from-start; we translate to the underlying scroll surface's
   * coordinate system (negative for vertical-rl, positive for vertical-lr).
   */
  private setScrollOffset(value: number): void {
    const signed = this.verticalRtl ? -value : value;
    if (this.scrollingElement) this.scrollingElement.scrollLeft = signed;
  }

  /**
   * Total horizontal content extent (scrollWidth — full content size,
   * NOT scrollWidth − clientWidth). Mirrors `ScrollRenderer.getScrollExtent`
   * which returns `scrollHeight`. The atEnd math relies on extent being
   * the full content size so the one-viewport slack lands exactly at the
   * actual end (when offset reaches `scrollWidth − clientWidth`).
   */
  private getScrollExtent(): number {
    return this.scrollingElement?.scrollWidth ?? 0;
  }
}
