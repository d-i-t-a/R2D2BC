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
import debounce from "debounce";

/**
 * Scroll-mode reflowable renderer with vertical scroll axis.
 * Used for `ltr`, `rtl`, and `cjk-horizontal` script modes when the user
 * has enabled scroll mode. Vertical-script content uses VerticalRenderer
 * instead, which handles the horizontal scroll axis.
 *
 * Honors `IFrameAttributes.scrollContainer`:
 * - `"host"` (default) — `#iframe-wrapper` scrolls; iframe grows to content.
 * - `"iframe"` — iframe stays at viewport height; iframe document scrolls.
 */
export default class ScrollRenderer extends ReflowableRenderer {
  name = "readium-scroll-on";
  label = "Scrolling";

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
        html.style.setProperty("--USER__scroll", "readium-scroll-on");
      }
      const spacer = doc.getElementById("r2d2bc-column-spacer");
      if (spacer) spacer.remove();
    }
    // Iframe-scroll mode needs the iframe's own scrollbar; host-scroll mode
    // routes scrolling through #iframe-wrapper so the iframe stays "no".
    this.iframe.setAttribute(
      "scrolling",
      this.scrollContainerMode === "iframe" ? "auto" : "no"
    );
    if (this.scrollContainerMode === "iframe") {
      this.height = BrowserUtilities.computeIframeContentHeight(
        this.iframe,
        this.attributes
      );
    }
    this.setSize();
    this.setIframeHeight(this.iframe);

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
    this.setIframeHeight(this.iframe);
  }

  setSize(): void {
    this.iframe.width = BrowserUtilities.getWidth() + "px";
    if (this.scrollContainerMode === "iframe") {
      this.iframe.height = this.height + "px";
    } else {
      let html = this.iframe.contentWindow?.document?.documentElement;
      this.iframe.height = html?.offsetHeight + "px";
    }
  }

  setIframeHeight(iframe: any) {
    if (this.scrollContainerMode === "iframe") return;
    let d = debounce((iframe: any) => {
      if (iframe) {
        let body = iframe.contentWindow.document.body,
          html = iframe.contentWindow.document.documentElement;

        let height = Math.max(
          body?.scrollHeight,
          body?.offsetHeight,
          html?.clientHeight,
          html?.scrollHeight,
          html?.offsetHeight
        );
        if (height) {
          const minHeight = BrowserUtilities.computeIframeContentHeight(
            iframe,
            this.attributes
          );
          iframe.height = Math.max(minHeight, height) + "px";
        }
      }
    }, 200);
    d(iframe);
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
      element.scrollIntoView({ block: "center" });
    }
  }

  atStart(): boolean {
    return this.getScrollOffset() === 0;
  }

  atEnd(): boolean {
    return (
      Math.ceil(this.getScrollExtent() - this.getScrollOffset()) - 1 <=
      BrowserUtilities.getHeight()
    );
  }

  goToPreviousPage(): void {
    const leftHeight = this.getScrollOffset();
    const height = this.getScreenHeight() - 40;
    const offset = leftHeight - height;
    this.setScrollOffset(offset >= 0 ? offset : 0);

    if (this.host.isContentProtectionEnabled()) {
      this.host.recalculateContentProtection();
    }
  }

  goToNextPage(): void {
    const leftHeight = this.getScrollOffset();
    const height = this.getScreenHeight() - 40;
    const scrollHeight = this.getScrollExtent();
    const offset = leftHeight + height;
    this.setScrollOffset(offset < scrollHeight ? offset : scrollHeight);

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

  private get scrollContainerMode(): "host" | "iframe" {
    return this.attributes?.scrollContainer === "iframe" ? "iframe" : "host";
  }

  private getScrollOffset(): number {
    if (this.scrollContainerMode === "iframe") {
      return this.scrollingElement?.scrollTop ?? 0;
    }
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    return wrapper.scrollTop;
  }

  private setScrollOffset(value: number): void {
    if (this.scrollContainerMode === "iframe") {
      if (this.scrollingElement) this.scrollingElement.scrollTop = value;
      return;
    }
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    wrapper.scrollTop = value;
  }

  private getScrollExtent(): number {
    return this.scrollingElement?.scrollHeight ?? 0;
  }
}
