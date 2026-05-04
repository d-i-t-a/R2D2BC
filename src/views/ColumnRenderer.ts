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
 * Paginated reflowable renderer using CSS multi-column layout.
 * Page-flip = column shift via `scrollLeft` on the iframe scrollingElement.
 *
 * Used for `ltr`, `rtl`, and `cjk-horizontal` script modes when the user
 * hasn't enabled scroll mode.
 */
export default class ColumnRenderer extends ReflowableRenderer {
  name = "readium-scroll-off";
  label = "Paginated";

  protected hasFixedScrollWidth: boolean = false;

  /**
   * Publication-declared RTL flag. Drives the *initial* assumption
   * before content loads. After the iframe document is parsed we re-
   * detect from the iframe's computed `direction` so we behave
   * correctly even when the integrator hasn't injected a matching
   * RTL ReadiumCSS bundle (in which case the document is LTR-flowed
   * regardless of the `dir` attribute).
   */
  readonly publicationRtl: boolean;

  /**
   * @param store  Persistence store for user property reads.
   * @param rtl    `true` for RTL publications (Arabic, Hebrew, RTL CJK).
   *               Defaults to `false` for backward compatibility with
   *               LTR / cjk-horizontal callers that don't pass it.
   */
  constructor(store: import("../store/Store").default, rtl: boolean = false) {
    super(store);
    this.publicationRtl = rtl;
  }

  /**
   * `true` when the publication should be scrolled RTL.
   *
   * Trusts the publication-declared flag from `getScriptMode` first.
   * Computed CSS `direction` always resolves to a value (defaults to
   * `"ltr"` when the RTL bundle hasn't applied yet), so reading it
   * before falling back would shadow a true `publicationRtl` with a
   * stale `"ltr"` during the iframe-load → CSS-settle window.
   *
   * The computed-style check serves only as a discovery fallback when
   * `publicationRtl` is `false`: an integrator may have injected an RTL
   * stylesheet without flagging the publication's `readingProgression`.
   * In that case the iframe document settles to `direction: rtl` and we
   * pick it up.
   */
  private get rtl(): boolean {
    if (this.publicationRtl) return true;
    const doc = this.iframe?.contentDocument;
    const html = doc?.documentElement;
    if (html && doc?.defaultView) {
      return doc.defaultView.getComputedStyle(html).direction === "rtl";
    }
    return false;
  }

  isScrollMode(): boolean {
    return false;
  }

  isPaginated(): boolean {
    return true;
  }

  engage(): void {
    // Paginated columns overflow horizontally to drive scrollLeft-based
    // page-flip; the iframe must never expose that as a real scrollbar.
    this.iframe.setAttribute("scrolling", "no");

    this.height = BrowserUtilities.computeIframeContentHeight(
      this.iframe,
      this.attributes
    );

    this.checkForFixedScrollWidth();

    let doc = this.iframe.contentDocument;
    if (doc) {
      const html = HTMLUtilities.findIframeElement(
        doc,
        "html"
      ) as HTMLHtmlElement;
      if (html) {
        html.style.setProperty("--USER__scroll", "readium-scroll-off");
      }
    }
    this.setSize();
    // padOddColumns intentionally NOT called here. Pre-settled layout at
    // this point (mid-applyProperties, before fonts.ready / images, before
    // multi-column flow has stabilized) produces non-deterministic
    // remainder math — sometimes injects a spacer that isn't needed. The
    // call sites in handleIFrameLoad / navigate / hideLoadingMessage all
    // fire after layout has settled and handle this correctly.

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  start(): void {
    this.iframe.height = "0";
    this.iframe.width = "0";

    this.setSize();
    const viewportElement = document.createElement("meta");
    viewportElement.name = "viewport";
    viewportElement.content =
      "width=device-width, initial-scale=1, maximum-scale=1";

    this.checkForFixedScrollWidth();
  }

  setSize(): void {
    this.iframe.width =
      BrowserUtilities.computeIframeContentWidth(this.iframe, this.attributes) +
      "px";
    BrowserUtilities.applyIframeSafeAreaMargins(this.iframe, this.attributes);
    // Iframe and its document are constrained to the same height so columns
    // fit the viewport.
    let doc = this.iframe.contentDocument;
    if (doc && doc.documentElement) {
      doc.documentElement.style.height = this.height + "px";
    }
    this.iframe.height = this.height + "px";
  }

  getCurrentPosition(): number {
    const width = this.getPageWidth();
    const leftWidth = this.getLeftColumnsWidth();
    const rightWidth = this.getRightColumnsWidth();
    const totalWidth = leftWidth + width + rightWidth;
    return leftWidth / totalWidth;
  }

  goToProgression(position: number): void {
    const width = this.getPageWidth();
    const leftWidth = this.getLeftColumnsWidth();
    const rightWidth = this.getRightColumnsWidth();
    const totalWidth = leftWidth + width + rightWidth;

    const newLeftWidth = position * totalWidth;

    let roundedLeftWidth = Math.round(newLeftWidth / width) * width;
    if (roundedLeftWidth >= totalWidth) {
      roundedLeftWidth = roundedLeftWidth - width;
    }
    this.setLeftColumnsWidth(roundedLeftWidth);
  }

  snap(element: HTMLElement | null, _relative?: boolean): void {
    if (!element) return;
    const originalHeight = element.style.height;
    element.style.height = "0";

    const width = this.getPageWidth();
    const left =
      this.getLeftColumnsWidth() + element.getBoundingClientRect().left;
    let roundedLeftWidth = Math.floor(left / width) * width;

    element.style.height = originalHeight;
    this.setLeftColumnsWidth(roundedLeftWidth);

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection(0);
    }
  }

  goToElement(element: HTMLElement | null, relative?: boolean): void {
    if (!element) return;
    const originalHeight = element.style.height;
    element.style.height = "0";

    const left = element.getBoundingClientRect().left;
    const width = this.getPageWidth();
    // Normalize: scrollLeft is negative in RTL paginated documents.
    const diff = Math.abs(this.scrollingElement.scrollLeft) - width;
    let roundedLeftWidth = Math.ceil(left / width) * width + diff;
    if (relative) {
      const origin = this.getLeftColumnsWidth();
      roundedLeftWidth = Math.ceil(left / width) * width + origin;
    }

    element.style.height = originalHeight;
    this.setLeftColumnsWidth(roundedLeftWidth);
    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection(200);
    }
  }

  atStart(): boolean {
    return this.getLeftColumnsWidth() <= 0;
  }

  atEnd(): boolean {
    // Direct page-aligned check: are we at or past the start of the last
    // page? Trusts `getPageCount()` (raw-scrollWidth-based, phantom-tolerant
    // up to <1 page) rather than the rounded `scrollWidth` getter, which
    // overestimates and previously let navigation walk past content into a
    // blank phantom page.
    const pageCount = this.getPageCount();
    if (pageCount <= 1) return true;
    const lastPageStart = (pageCount - 1) * this.getPageWidth();
    return this.getLeftColumnsWidth() >= lastPageStart - 1;
  }

  goToPreviousPage(): void {
    const leftWidth = this.getLeftColumnsWidth();
    const width = this.getPageWidth();
    const offset = leftWidth - width;
    if (offset >= 0) {
      this.setLeftColumnsWidth(offset);
    } else {
      this.setLeftColumnsWidth(0);
    }
    this.host.checkResourcePosition();

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  goToNextPage(): void {
    const leftWidth = this.getLeftColumnsWidth();
    const width = this.getPageWidth();
    // Page-aligned cap: clamp at the start of the last real page rather
    // than at the rounded `scrollWidth` (which over-rounds to a phantom
    // page boundary, allowing one advance past content into a blank page).
    const lastPageStart = (this.getPageCount() - 1) * width;
    const offset = leftWidth + width;
    if (offset <= lastPageStart) {
      this.setLeftColumnsWidth(offset);
    } else {
      this.setLeftColumnsWidth(lastPageStart);
    }
    this.host.checkResourcePosition();

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  getCurrentPage(): number {
    return this.getCurrentPosition() * this.getPageCount() + 1;
  }

  getScrollSurface():
    | { kind: "host"; element: HTMLElement }
    | { kind: "iframe"; iframe: HTMLIFrameElement } {
    if (this.attributes?.scrollContainer === "iframe") {
      return { kind: "iframe", iframe: this.iframe };
    }
    return {
      kind: "host",
      element: HTMLUtilities.findRequiredElement(document, "#iframe-wrapper"),
    };
  }

  getPageCount(): number {
    const pageWidth = this.getPageWidth();
    if (pageWidth <= 0) return 1;
    // Count reachable pages from raw scroll extent. The browser caps
    // `scrollLeft` at `rawScrollWidth − pageWidth`, so the number of unique
    // viewport positions = `floor((raw − pageWidth) / pageWidth) + 1`.
    // Using raw (not the rounded `this.scrollWidth` getter) avoids
    // advertising an extra page when content has trailing whitespace,
    // padding, or sub-pixel layout that pushes scrollWidth past a clean
    // page boundary without a corresponding reachable position.
    const raw = this.scrollingElement?.scrollWidth ?? 0;
    return Math.max(1, Math.floor((raw - pageWidth) / pageWidth) + 1);
  }

  protected checkForFixedScrollWidth(): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(doc, "body");
      const originalScrollWidth = body?.scrollWidth;
      this.hasFixedScrollWidth = body?.scrollWidth === originalScrollWidth;
    }
  }

  /**
   * Distance scrolled from the start of the chapter, normalized to a
   * positive value. `scrollLeft` is negative when scrolled in an RTL
   * paginated document; `Math.abs()` collapses RTL and LTR to one
   * distance-from-start metric so the rest of the column math doesn't
   * have to know the direction.
   */
  private getLeftColumnsWidth(): number {
    return Math.round(Math.abs(this.scrollingElement.scrollLeft));
  }

  private getRightColumnsWidth(): number {
    const width = this.getPageWidth();
    let rightWidth = this.scrollWidth - width;
    if (this.hasFixedScrollWidth) {
      const leftWidth = this.getLeftColumnsWidth();
      rightWidth = Math.max(0, rightWidth - leftWidth);
    }
    return rightWidth;
  }

  private getPageWidth(): number {
    return this.scrollingElement.clientWidth;
  }

  /**
   * Shift columns so that the given (positive, distance-from-start)
   * width is positioned to the left of the iframe viewport. For RTL,
   * the sign is flipped because the browser expects a negative
   * `scrollLeft` value when scrolled away from the start.
   */
  private setLeftColumnsWidth(width: number) {
    this.scrollingElement.scrollLeft = this.rtl ? -width : width;
  }

  get scrollWidth() {
    const scrollWidth = this.scrollingElement?.scrollWidth;
    const width = this.getPageWidth();
    const pages = Math.ceil((scrollWidth - 1) / width);
    return Math.max(1, pages) * width;
  }

  /**
   * Remove all spacers added by `padOddColumns`. Called before re-padding
   * when column count or layout changes (window resize, settings change
   * 2→3 col, etc.). The existing-spacer guards in each padding variant
   * would otherwise block re-padding with the new count.
   */
  clearSpacers(): void {
    const doc = this.iframe.contentDocument;
    if (!doc) return;
    doc
      .querySelectorAll('[id^="r2d2bc-column-spacer"]')
      .forEach((el) => el.remove());
    // Force reflow so a subsequent padOddColumns reads a fresh
    // body.scrollWidth (without the just-removed spacers).
    if (doc.body) void doc.body.scrollWidth;
  }

  padOddColumns(): boolean {
    const colCount = this.getResolvedColumnCount();
    // 1 col: content always page-aligned by construction; spacer never needed.
    if (colCount <= 1) return false;
    // 2 col: direction-mirrored single-spacer paths.
    if (colCount === 2) {
      return this.rtl
        ? this.padOddColumnsRtlSingle()
        : this.padOddColumnsLtrSingle();
    }
    // 3+ col: multi-spacer paths (still subject to integer-col limitation).
    return this.rtl
      ? this.padOddColumnsRtl(colCount)
      : this.padOddColumnsLtrMulti(colCount);
  }

  /**
   * Resolve the actually-rendered column count from the iframe's
   * scrolling element computed style. Reading the computed value resolves
   * `var()` indirection and v1's @media-query-driven `--RS__colCount`,
   * but the literal CSS keyword `auto` passes through and parseInt'd to
   * NaN — fall back to 1 in that case.
   */
  private getResolvedColumnCount(): number {
    const html = this.iframe.contentDocument?.documentElement;
    const win = this.iframe.contentWindow;
    if (!html || !win) return 1;
    return parseInt(win.getComputedStyle(html).columnCount, 10) || 1;
  }

  /**
   * Original single-spacer logic, used for 2-col LTR. Long-stable behavior.
   */
  private padOddColumnsLtrSingle(): boolean {
    const doc = this.iframe.contentDocument;
    if (!doc) return false;

    const existing = doc.getElementById("r2d2bc-column-spacer");
    if (existing) return false;

    const body = doc.body;
    if (!body) return false;

    const rawScrollWidth = body.scrollWidth;
    const viewportWidth = this.getPageWidth();
    const remainder = rawScrollWidth % viewportWidth;

    const bodyLeft = body.getBoundingClientRect().left;
    const last = body.lastElementChild as HTMLElement | null;
    if (last) {
      const realContentRight = last.getBoundingClientRect().right - bodyLeft;
      if (rawScrollWidth - realContentRight > viewportWidth * 0.5) {
        return false;
      }
    }

    if (remainder > viewportWidth * 0.25) {
      const spacer = doc.createElement("div");
      spacer.id = "r2d2bc-column-spacer";
      spacer.style.breakBefore = "column";
      spacer.style.height = "100%";
      spacer.style.visibility = "hidden";
      body.appendChild(spacer);
      void body.scrollWidth;
      return true;
    }
    return false;
  }

  /**
   * Multi-spacer LTR for 3+ column layouts: appends column-break spacers
   * until body.scrollWidth aligns to a whole-page boundary.
   *
   * Spacer count is computed upfront from the initial body.scrollWidth —
   * not via a loop reading scrollWidth after each append. The iterative
   * approach was non-deterministic when browser sync layout produced
   * inconsistent scrollWidth values between iterations.
   */
  private padOddColumnsLtrMulti(columnCount: number): boolean {
    const doc = this.iframe.contentDocument;
    if (!doc) return false;
    const existing = doc.querySelector('[id^="r2d2bc-column-spacer"]');
    if (existing) return false;
    const body = doc.body;
    if (!body) return false;

    const pageWidth = this.getPageWidth();
    const oneColumnWidth = pageWidth / columnCount;
    if (body.scrollWidth <= pageWidth) return false;

    // LTR: body.scrollWidth slightly UNDER-counts due to sub-pixel rounding
    // (e.g. 14 real cols read as 13.999), so ceil rounds up to the true count.
    // RTL takes the opposite path (floor) because there body.scrollWidth
    // OVER-counts by a phantom column.
    const visibleCols = Math.ceil(body.scrollWidth / oneColumnWidth);
    if (visibleCols <= 0) return false;
    const totalPagesNeeded = Math.ceil(visibleCols / columnCount);
    const spacersNeeded = totalPagesNeeded * columnCount - visibleCols;
    if (spacersNeeded <= 0) return false;

    for (let i = 0; i < spacersNeeded; i++) {
      const spacer = doc.createElement("div");
      spacer.id = `r2d2bc-column-spacer-${i}`;
      spacer.style.breakBefore = "column";
      spacer.style.height = "100%";
      spacer.style.visibility = "hidden";
      body.appendChild(spacer);
    }
    void body.scrollWidth;
    return true;
  }

  /**
   * RTL single-spacer logic, used for 2-col RTL. Mirror of
   * `padOddColumnsLtrSingle` with the extent calculation flipped for
   * RTL flow (body.right is flow start, last child's left is flow end).
   */
  private padOddColumnsRtlSingle(): boolean {
    const doc = this.iframe.contentDocument;
    if (!doc) return false;

    const existing = doc.querySelector('[id^="r2d2bc-column-spacer-rtl"]');
    if (existing) return false;

    const body = doc.body;
    if (!body) return false;

    const rawScrollWidth = body.scrollWidth;
    const viewportWidth = this.getPageWidth();
    const remainder = rawScrollWidth % viewportWidth;

    const last = body.lastElementChild as HTMLElement | null;
    if (last) {
      const bodyRect = body.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      // RTL flow: body.right is start, last child's left is flow end.
      const realContentExtent = bodyRect.right - lastRect.left;
      if (rawScrollWidth - realContentExtent > viewportWidth * 0.5) {
        return false;
      }
    }

    if (remainder > viewportWidth * 0.25) {
      const spacer = doc.createElement("div");
      spacer.id = "r2d2bc-column-spacer-rtl";
      spacer.style.breakBefore = "column";
      spacer.style.height = "100%";
      spacer.style.visibility = "hidden";
      body.appendChild(spacer);
      void body.scrollWidth;
      return true;
    }
    return false;
  }

  /**
   * RTL multi-spacer padding (used for 3+ col RTL layouts). Same upfront-
   * compute strategy as `padOddColumnsLtrMulti`; only the extent calc
   * differs (RTL flow: body.right is start, last child's left is end).
   */
  private padOddColumnsRtl(columnCount: number): boolean {
    const doc = this.iframe.contentDocument;
    if (!doc) return false;

    const existing = doc.querySelector('[id^="r2d2bc-column-spacer-rtl"]');
    if (existing) return false;

    const body = doc.body;
    if (!body) return false;

    const pageWidth = this.getPageWidth();
    const oneColumnWidth = pageWidth / columnCount;

    if (body.scrollWidth <= pageWidth) return false;

    // Use body.scrollWidth (scroll-position-independent) with floor to
    // count fully-filled columns. Body's scrollWidth may include a
    // fractional phantom (sub-pixel layout drift, trailing padding) —
    // floor strips that, giving the integer column count the user sees.
    const visibleCols = Math.floor(body.scrollWidth / oneColumnWidth);
    if (visibleCols <= 0) return false;
    const totalPagesNeeded = Math.ceil(visibleCols / columnCount);
    const spacersNeeded = totalPagesNeeded * columnCount - visibleCols;
    if (spacersNeeded <= 0) return false;

    for (let i = 0; i < spacersNeeded; i++) {
      const spacer = doc.createElement("div");
      spacer.id = `r2d2bc-column-spacer-rtl-${i}`;
      spacer.style.breakBefore = "column";
      spacer.style.height = "100%";
      spacer.style.visibility = "hidden";
      body.appendChild(spacer);
    }
    void body.scrollWidth;
    return true;
  }
}
