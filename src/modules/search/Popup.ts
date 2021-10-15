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
 * Developed on behalf of: CAST (http://www.cast.org) and DITA
 * Licensed to: CAST under one or more contributor license agreements.
 */

import * as sanitize from "sanitize-html";
import IFrameNavigator from "../../navigator/IFrameNavigator";

export default class Popup {
  navigator: IFrameNavigator;

  constructor(navigator: IFrameNavigator) {
    this.navigator = navigator;
  }

  async handleFootnote(link: HTMLLIElement, event: MouseEvent | TouchEvent) {
    const href = link.getAttribute("href");
    if (href.indexOf("#") > 0) {
      const id = href.substring(href.indexOf("#") + 1);

      function getAbsoluteHref(href: string): string | null {
        const currentUrl = document.location.href;
        return new URL(href, currentUrl).href;
      }

      let absolute = getAbsoluteHref(href);
      absolute = absolute.substring(0, absolute.indexOf("#"));
      event.preventDefault();
      event.stopPropagation();

      await fetch(absolute)
        .then((r) => r.text())
        .then(async (data) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(data, "text/html");
          const element = doc.querySelector("#" + id);
          if (element) {
            event.preventDefault();
            event.stopPropagation();
            this.showPopup(element, event);
          }
        });
    }
  }

  showPopup(element: any, event: MouseEvent | TouchEvent) {
    let footnote =
      this.navigator.iframes[0].contentDocument.getElementById("d2-popup");
    if (footnote) {
      footnote.parentElement.removeChild(footnote);
    }

    const d2popup = document.createElement("aside");
    d2popup.id = "d2-popup";
    d2popup.className = "d2-popup is-active";

    const d2wrapper = document.createElement("div");
    d2wrapper.className = "d2-popup-wrapper";
    d2popup.appendChild(d2wrapper);

    const d2content = document.createElement("div");
    d2content.className = "d2-popup-content";
    d2wrapper.appendChild(d2content);

    const p = document.createElement("p");
    d2content.appendChild(p);

    if (typeof element === "string") {
      p.innerHTML = element;
    } else {
      p.innerHTML = sanitize(element.innerHTML, {
        allowedTags: [],
        allowedAttributes: {},
      });
    }

    const paginated = this.navigator.view.isPaginated();
    const scrollElement = this.getScrollingElement(
      this.navigator.iframes[0].contentDocument
    );

    const xOffset = paginated ? scrollElement.scrollLeft : 0;
    const yOffset = paginated ? scrollElement.scrollTop : 0;
    const left = (event as any).x + xOffset;
    const top = (event as any).y + yOffset;

    d2popup.style.top = top + "px";
    if (paginated) {
      d2popup.style.left = left + "px";
    }

    this.navigator.iframes[0].contentDocument.body.appendChild(d2popup);

    let self = this;
    this.navigator.iframes[0].contentWindow.onclick = function (ev) {
      if (event.target !== ev.target) {
        if (d2popup.parentElement) {
          d2popup.style.display = "none";
          d2popup.parentElement.removeChild(d2popup);
          self.navigator.iframes[0].contentWindow.onclick = undefined;
        }
      }
    };
  }
  private getScrollingElement = (documant: Document): Element => {
    if (documant.scrollingElement) {
      return documant.scrollingElement;
    }
    return documant.body;
  };
}
