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
    this.iframe.width = BrowserUtilities.getWidth() + "px";
    // Iframe and its document are constrained to the same height so columns
    // fit the viewport.
    let doc = this.iframe.contentDocument;
    if (doc && doc.documentElement) {
      doc.documentElement.style.height = this.height + "px";
    }
    this.iframe.height = this.height + "px";
  }

  getCurrentPosition(): number {
    const width = this.getColumnWidth();
    const leftWidth = this.getLeftColumnsWidth();
    const rightWidth = this.getRightColumnsWidth();
    const totalWidth = leftWidth + width + rightWidth;
    return leftWidth / totalWidth;
  }

  goToProgression(position: number): void {
    const width = this.getColumnWidth();
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

    const width = this.getColumnWidth();
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
    const width = this.getColumnWidth();
    const diff = this.scrollingElement.scrollLeft - width;
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
    const rightWidth = Math.floor(this.getRightColumnsWidth());
    if (rightWidth <= 0) return true;
    const doc = this.iframe.contentDocument;
    if (doc?.getElementById("r2d2bc-column-spacer")) return rightWidth <= 5;
    return Math.round(this.getCurrentPage()) >= this.getPageCount();
  }

  goToPreviousPage(): void {
    const leftWidth = this.getLeftColumnsWidth();
    const width = this.getColumnWidth();
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
    const width = this.getColumnWidth();
    const scrollWidth = this.scrollWidth;
    const offset = leftWidth + width;
    if (offset < scrollWidth) {
      this.setLeftColumnsWidth(offset);
    } else {
      this.setLeftColumnsWidth(scrollWidth);
    }
    this.host.checkResourcePosition();

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  getCurrentPage(): number {
    return this.getCurrentPosition() * this.getPageCount() + 1;
  }

  getPageCount(): number {
    const width = this.getColumnWidth();
    return this.scrollWidth / width;
  }

  protected checkForFixedScrollWidth(): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(doc, "body");
      const originalScrollWidth = body?.scrollWidth;
      this.hasFixedScrollWidth = body?.scrollWidth === originalScrollWidth;
    }
  }

  private getLeftColumnsWidth(): number {
    return Math.round(this.scrollingElement.scrollLeft);
  }

  private getRightColumnsWidth(): number {
    const width = this.getColumnWidth();
    let rightWidth = this.scrollWidth - width;
    if (this.hasFixedScrollWidth) {
      const leftWidth = this.getLeftColumnsWidth();
      rightWidth = Math.max(0, rightWidth - leftWidth);
    }
    return rightWidth;
  }

  private getColumnWidth(): number {
    return this.scrollingElement.clientWidth;
  }

  private setLeftColumnsWidth(width: number) {
    this.scrollingElement.scrollLeft = width;
  }

  get scrollWidth() {
    const scrollWidth = this.scrollingElement?.scrollWidth;
    const width = this.getColumnWidth();
    const pages = Math.ceil((scrollWidth - 1) / width);
    return Math.max(1, pages) * width;
  }

  padOddColumns(): boolean {
    const doc = this.iframe.contentDocument;
    if (!doc) return false;

    const existing = doc.getElementById("r2d2bc-column-spacer");
    if (existing) return false;

    const body = doc.body;
    if (!body) return false;

    const rawScrollWidth = body.scrollWidth;
    const viewportWidth = this.getColumnWidth();
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
}
