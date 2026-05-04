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

  /**
   * Debounced grow-to-content function. Defined once in the constructor
   * (rather than re-created per `growIframeToContent` call) so the 200ms
   * debounce actually coalesces rapid successive calls.
   */
  private readonly debouncedGrow: (iframe: any) => void;

  constructor(store: import("../store/Store").default) {
    super(store);
    this.debouncedGrow = debounce((iframe: any) => {
      if (!iframe) return;
      const win = iframe.contentWindow;
      const body = win?.document?.body;
      const html = win?.document?.documentElement;
      const height = Math.max(
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        html?.clientHeight ?? 0,
        html?.scrollHeight ?? 0,
        html?.offsetHeight ?? 0
      );
      const minHeight = BrowserUtilities.computeIframeContentHeight(
        iframe,
        this.attributes
      );
      const next = Math.max(minHeight, height);
      if (!height) return;
      iframe.height = next + "px";
    }, 200);
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
        html.style.setProperty("--USER__scroll", "readium-scroll-on");
        // Clear the paginated-mode height constraint left over from any
        // prior ColumnRenderer engage — scroll mode needs the document to
        // grow with its content, not be clamped to a single viewport.
        html.style.removeProperty("height");
      }
      doc
        .querySelectorAll('[id^="r2d2bc-column-spacer"]')
        .forEach((el) => el.remove());
    }
    // Iframe-scroll mode needs the iframe's own scrollbar; host-scroll mode
    // routes scrolling through #iframe-wrapper so the iframe stays "no".
    this.iframe.setAttribute(
      "scrolling",
      this.scrollContainerMode === "iframe" ? "auto" : "no"
    );
    // Always seed `this.height` so the iframe has a known viewport-size
    // starting point before reading content layout. Without this, when
    // ScrollRenderer is the very first renderer to engage (direct open
    // with scroll-mode preference), the iframe was created with height=0
    // and the host-scroll setSize path reads html.offsetHeight which
    // resolves to 0 because body has no containing block — empty screen.
    this.height = BrowserUtilities.computeIframeContentHeight(
      this.iframe,
      this.attributes
    );
    this.setSize();
    this.growIframeToContent(this.iframe);

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
    this.growIframeToContent(this.iframe);
  }

  setSize(): void {
    this.iframe.width =
      BrowserUtilities.computeIframeContentWidth(this.iframe, this.attributes) +
      "px";
    BrowserUtilities.applyIframeSafeAreaMargins(this.iframe, this.attributes);
    if (this.scrollContainerMode === "iframe") {
      this.iframe.height = this.height + "px";
    } else {
      // Host-scroll: iframe grows to content; #iframe-wrapper scrolls.
      // Fall back to the viewport height (`this.height`) when
      // `html.offsetHeight` reads 0 on the first engage — happens when
      // ScrollRenderer is the initial renderer (direct open in scroll
      // mode) and the iframe element was created at height=0, leaving
      // body without a containing block. growIframeToContent's debounce
      // grows to content after that.
      const win = this.iframe.contentWindow;
      const html = win?.document?.documentElement;
      const offset = html?.offsetHeight ?? 0;
      const next = Math.max(offset, this.height);
      this.iframe.height = next + "px";
    }
  }

  /**
   * Lifecycle hook called by EpubNavigator after iframe load and on
   * resize. Debounce-grows the iframe along its scroll axis to match
   * content extent. Host-scroll mode only — iframe-scroll is a no-op
   * (iframe stays at viewport size; its own scrollbar provides scroll).
   */
  growIframeToContent(iframe: any) {
    if (this.scrollContainerMode === "iframe") return;
    iframe.height = this.height + "px";
    this.debouncedGrow(iframe);
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
      BrowserUtilities.computeIframeContentHeight(this.iframe, this.attributes)
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

  getScrollSurface():
    | { kind: "host"; element: HTMLElement }
    | { kind: "iframe"; iframe: HTMLIFrameElement } {
    if (this.scrollContainerMode === "iframe") {
      return { kind: "iframe", iframe: this.iframe };
    }
    return {
      kind: "host",
      element: HTMLUtilities.findRequiredElement(document, "#iframe-wrapper"),
    };
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
