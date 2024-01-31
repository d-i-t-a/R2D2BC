/*
 * Copyright 2018-2020 DITA (AM Consulting LLC)
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

import { UserProperty } from "../model/user-settings/UserProperties";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import Store from "../store/Store";
import BookView from "./BookView";
import {
  IFrameAttributes,
  IFrameNavigator,
} from "../navigator/IFrameNavigator";
import debounce from "debounce";

export default class ReflowableBookView implements BookView {
  layout = "reflowable";

  private readonly USERSETTINGS = "userSetting";
  private readonly store: Store;
  private scrollMode: boolean;
  navigator: IFrameNavigator;
  constructor(store: Store) {
    this.store = store;

    if (this.scrollMode) {
      this.name = "readium-scroll-on";
      this.label = "Scrolling";
    } else {
      this.name = "readium-scroll-off";
      this.label = "Paginated";
    }
  }

  setMode(scroll: boolean) {
    this.scrollMode = scroll;
    if (scroll) {
      this.name = "readium-scroll-on";
      this.label = "Scrolling";
      let doc = this.iframe.contentDocument;
      if (doc) {
        const head = HTMLUtilities.findIframeElement(
          doc,
          "head"
        ) as HTMLHeadElement;
        if (head) {
          const viewport = HTMLUtilities.findElement(
            head,
            "meta[name=viewport]"
          );
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
      }
      this.setSize();
      this.setIframeHeight(this.iframe);
    } else {
      this.height = BrowserUtilities.getHeight() - 40 - this.attributes.margin;
      this.name = "readium-scroll-off";
      this.label = "Paginated";
      // any is necessary because CSSStyleDeclaration type does not include
      // all the vendor-prefixed attributes.

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
    }
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate();
    }
  }

  name: string;
  label: string;
  iframe: HTMLIFrameElement;
  sideMargin: number = 20;
  height: number = 0;
  attributes: IFrameAttributes = { margin: 0 };

  start(): void {
    if (this.scrollMode) {
      let doc = this.iframe.contentDocument;
      if (doc) {
        const head = HTMLUtilities.findIframeElement(
          doc,
          "head"
        ) as HTMLHeadElement;

        if (head) {
          const viewport = HTMLUtilities.findElement(
            head,
            "meta[name=viewport]"
          );
          if (viewport) {
            viewport.remove();
          }
        }
      }
      this.setSize();
      this.setIframeHeight(this.iframe);
    } else {
      this.iframe.height = "0";
      this.iframe.width = "0";

      // any is necessary because CSSStyleDeclaration type does not include
      // all the vendor-prefixed attributes.
      this.setSize();
      const viewportElement = document.createElement("meta");
      viewportElement.name = "viewport";
      viewportElement.content =
        "width=device-width, initial-scale=1, maximum-scale=1";

      this.checkForFixedScrollWidth();
    }
  }

  stop(): void {
    this.iframe.height = "0";
    this.iframe.width = "0";
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(
        this.iframe.contentDocument,
        "body"
      ) as HTMLBodyElement;
      const images = Array.prototype.slice.call(body.querySelectorAll("img"));
      for (const image of images) {
        image.style.maxWidth = "";
      }
    }
  }

  getCurrentPosition(): number {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );

    if (this.scrollMode) {
      return wrapper.scrollTop / this.scrollingElement.scrollHeight;
    } else {
      const width = this.getColumnWidth();
      const leftWidth = this.getLeftColumnsWidth();
      const rightWidth = this.getRightColumnsWidth();
      const totalWidth = leftWidth + width + rightWidth;
      return leftWidth / totalWidth;
    }
  }

  goToProgression(position: number): void {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    if (this.scrollMode) {
      wrapper.scrollTop = this.scrollingElement.scrollHeight * position;
    } else {
      // If the window has changed size since the columns were set up,
      // we need to reset position, so we can determine the new total width.

      const width = this.getColumnWidth();
      const leftWidth = this.getLeftColumnsWidth();
      const rightWidth = this.getRightColumnsWidth();
      const totalWidth = leftWidth + width + rightWidth;

      const newLeftWidth = position * totalWidth;

      // Round the new left width, so it's a multiple of the column width.

      let roundedLeftWidth = Math.round(newLeftWidth / width) * width;
      if (roundedLeftWidth >= totalWidth) {
        // We've gone too far and all the columns are off to the left.
        // Move one column back into the viewport.
        roundedLeftWidth = roundedLeftWidth - width;
      }
      this.setLeftColumnsWidth(roundedLeftWidth);
    }
  }

  goToCssSelector(cssSelector: string, relative?: boolean): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      let element = doc.querySelector(cssSelector) as HTMLElement;
      this.goToElement(element, relative);
    }
  }

  goToFragment(fragment: string, relative?: boolean): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const element = doc.getElementById(fragment) as HTMLElement;
      this.goToElement(element, relative);
    }
  }

  snap(element: HTMLElement | null, _relative?: boolean): void {
    if (element) {
      if (this.scrollMode) {
        //     // Put the element as close to the top as possible.
        //     document.scrollingElement.scrollTop = element.offsetTop;
      } else {
        // Get the element's position in the iframe, and
        // round that to figure out the column it's in.
        // There is a bug in Safari when using getBoundingClientRect
        // on an element that spans multiple columns. Temporarily
        // set the element's height to fit it on one column, so we
        // can determine the first column position.
        const originalHeight = element.style.height;
        element.style.height = "0";

        const width = this.getColumnWidth();
        const left =
          this.getLeftColumnsWidth() + element.getBoundingClientRect().left;
        let roundedLeftWidth = Math.floor(left / width) * width;

        // Restore element's original height.
        element.style.height = originalHeight;
        this.setLeftColumnsWidth(roundedLeftWidth);

        if (this.navigator.rights.enableContentProtection) {
          this.navigator.contentProtectionModule?.recalculate(0);
        }
      }
    }
  }

  goToElement(element: HTMLElement | null, relative?: boolean): void {
    if (this.scrollMode) {
      if (element) {
        element.scrollIntoView({ block: "center" });
      }
    } else {
      if (element) {
        // Get the element's position in the iframe, and
        // round that to figure out the column it's in.

        // There is a bug in Safari when using getBoundingClientRect
        // on an element that spans multiple columns. Temporarily
        // set the element's height to fit it on one column, so we
        // can determine the first column position.
        const originalHeight = element.style.height;
        element.style.height = "0";

        const left = element.getBoundingClientRect().left;
        const width = this.getColumnWidth();
        const diff = this.scrollingElement.scrollLeft - width;
        // let roundedLeftWidth = Math.ceil(left / width) * width;
        let roundedLeftWidth = Math.ceil(left / width) * width + diff;
        if (relative) {
          const origin = this.getLeftColumnsWidth();
          roundedLeftWidth = Math.ceil(left / width) * width + origin;
        }

        // Restore element's original height.
        element.style.height = originalHeight;
        this.setLeftColumnsWidth(roundedLeftWidth);
        if (this.navigator.rights.enableContentProtection) {
          this.navigator.contentProtectionModule?.recalculate(200);
        }
      }
    }
  }

  // at top in scroll mode
  atStart(): boolean {
    if (this.scrollMode) {
      const wrapper = HTMLUtilities.findRequiredElement(
        document,
        "#iframe-wrapper"
      );

      return wrapper.scrollTop === 0;
    } else {
      const leftWidth = this.getLeftColumnsWidth();
      return leftWidth <= 0;
    }
  }

  // at bottom in scroll mode
  atEnd(): boolean {
    if (this.scrollMode) {
      const wrapper = HTMLUtilities.findRequiredElement(
        document,
        "#iframe-wrapper"
      );
      return (
        Math.ceil(this.scrollingElement.scrollHeight - wrapper.scrollTop) - 1 <=
        BrowserUtilities.getHeight()
      );
    } else {
      // TODO: need to double check this, why sometimes we get "rightWidth 0.091064453125"
      const rightWidth = Math.floor(this.getRightColumnsWidth());
      return (
        rightWidth <= 0 ||
        Math.ceil(this.getCurrentPage()) === this.getPageCount()
      );
    }
  }

  goToPreviousPage(): void {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );

    if (this.scrollMode) {
      const leftHeight = wrapper.scrollTop;
      const height = this.getScreenHeight() - 40;
      const offset = leftHeight - height;
      if (offset >= 0) {
        wrapper.scrollTop = offset;
      } else {
        wrapper.scrollTop = 0;
      }
    } else {
      const leftWidth = this.getLeftColumnsWidth();
      const width = this.getColumnWidth();
      const offset = leftWidth - width;
      if (offset >= 0) {
        this.setLeftColumnsWidth(offset);
      } else {
        this.setLeftColumnsWidth(0);
      }
      this.navigator.checkResourcePosition();
    }
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate();
    }
  }

  goToNextPage(): void {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );

    if (this.scrollMode) {
      const leftHeight = wrapper.scrollTop;
      const height = this.getScreenHeight() - 40;
      const scrollHeight = this.scrollingElement.scrollHeight;
      const offset = leftHeight + height;
      if (offset < scrollHeight) {
        wrapper.scrollTop = offset;
      } else {
        wrapper.scrollTop = scrollHeight;
      }
    } else {
      const leftWidth = this.getLeftColumnsWidth();
      const width = this.getColumnWidth();
      const scrollWidth = this.scrollWidth;
      const offset = leftWidth + width;
      if (offset < scrollWidth) {
        this.setLeftColumnsWidth(offset);
      } else {
        this.setLeftColumnsWidth(scrollWidth);
      }
      this.navigator.checkResourcePosition();
    }
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate();
    }
  }

  // doesn't exist in scroll mode
  getCurrentPage(): number {
    if (this.scrollMode) {
      return 0;
    } else {
      return this.getCurrentPosition() * this.getPageCount() + 1;
    }
  }

  // doesn't exist in scroll mode
  getPageCount(): number {
    if (this.scrollMode) {
      return 0;
    } else {
      const width = this.getColumnWidth();
      return this.scrollWidth / width;
    }
  }

  isPaginated() {
    if (this.iframe) {
      let doc = this.iframe.contentDocument;
      if (doc) {
        const html = HTMLUtilities.findIframeElement(
          doc,
          "html"
        ) as HTMLHtmlElement;
        if (html) {
          const scroll =
            "readium-scroll-on" ===
            html.style.getPropertyValue("--USER__scroll");
          return !scroll;
        }
      }
    }
    return !this.scrollMode;
  }

  isScrollMode() {
    if (this.iframe) {
      let doc = this.iframe.contentDocument;
      if (doc) {
        const html = HTMLUtilities.findIframeElement(
          doc,
          "html"
        ) as HTMLHtmlElement;
        if (html) {
          return (
            "readium-scroll-on" ===
            html.style.getPropertyValue("--USER__scroll")
          );
        }
      }
    }
    return this.scrollMode;
  }

  async getProperty(name: string): Promise<UserProperty | null> {
    let array = await this.store.get(this.USERSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return null;
      }
      return properties[0];
    }
    return null;
  }

  // scrolling functions

  getScreenHeight(): number {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    return wrapper.clientHeight;
  }

  setIframeHeight(iframe: any) {
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
          const minHeight =
            BrowserUtilities.getHeight() - this.attributes.margin;
          iframe.height = Math.max(minHeight, height) + "px";
        }
      }
    }, 200);
    d(iframe);
  }

  // paginated functions

  protected hasFixedScrollWidth: boolean = false;

  protected checkForFixedScrollWidth(): void {
    // Determine if the scroll width changes when the left position
    // changes. This differs across browsers and sometimes across
    // books in the same browser.
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(doc, "body");
      const originalScrollWidth = body?.scrollWidth;
      this.hasFixedScrollWidth = body?.scrollWidth === originalScrollWidth;
    }
  }

  setSize(): void {
    this.iframe.width = BrowserUtilities.getWidth() + "px";
    if (!this.scrollMode) {
      let doc = this.iframe.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.style.height = this.height + "px";
      }
      this.iframe.height = this.height + "px";
    } else {
      let html = this.iframe.contentWindow?.document?.documentElement;
      this.iframe.height = html?.offsetHeight + "px";
    }
  }

  // TODO: if we changed the following functions to handle screen size (height and width) we can use it for both paginated and reflowable.
  // For example: getColumnWidth would be renamed to something that gives us either the offsetWidth when in paginated mode and the offsetHeight when in scroll mode. etc.
  // Since theses are the only 4 functions right now that are specifically used for paginated mode but gives us nothing for scroll mode, it would make sense to make them more universal

  /** Returns the total width of the columns that are currently
     positioned to the left of the iframe viewport. */
  private getLeftColumnsWidth(): number {
    return Math.ceil(this.scrollingElement.scrollLeft);
  }

  /** Returns the total width of the columns that are currently
     positioned to the right of the iframe viewport. */
  private getRightColumnsWidth(): number {
    const width = this.getColumnWidth();
    let rightWidth = this.scrollWidth - width;
    if (this.hasFixedScrollWidth) {
      // In some browsers (IE and Firefox with certain books),
      // scrollWidth doesn't change when some columns
      // are off to the left, so we need to subtract them.
      const leftWidth = this.getLeftColumnsWidth();
      rightWidth = Math.max(0, rightWidth - leftWidth);
    }
    return rightWidth;
  }

  /** Returns the width of one column. */
  private getColumnWidth(): number {
    return this.scrollingElement.clientWidth;
  }

  /** Shifts the columns so that the specified width is positioned
     to the left of the iframe viewport. */
  private setLeftColumnsWidth(width: number) {
    this.scrollingElement.scrollLeft = width;
  }

  get scrollingElement() {
    if (this.iframe.contentDocument?.scrollingElement) {
      return this.iframe.contentDocument?.scrollingElement;
    } else if (this.iframe.contentDocument?.body) {
      return this.iframe.contentDocument?.body;
    } else {
      // Note: this should never happen, but prevents any exceptions.
      // exception here could happen id the iframe s not loaded yet properly
      // but the scrolling element or body is accessed
      // for example, very fast next/previous resource changes
      return document.createElement("body");
    }
  }

  get scrollWidth() {
    const scrollWidth = this.scrollingElement?.scrollWidth;
    const width = this.getColumnWidth();
    const pages = Math.ceil(scrollWidth / width);
    return pages * width;
  }
}
