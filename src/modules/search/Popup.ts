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

import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import sanitize from "sanitize-html";
import * as HTMLUtilities from "../../utils/HTMLUtilities";

export class Popup {
  navigator: IFrameNavigator;

  constructor(navigator: IFrameNavigator) {
    this.navigator = navigator;
  }

  async handleFootnote(link: HTMLLIElement, event: MouseEvent | TouchEvent) {
    const href = link.getAttribute("href");
    if (href && href.indexOf("#") > 0) {
      const id = href.substring(href.indexOf("#") + 1);

      function getAbsoluteHref(href: string): string | null {
        const currentUrl = document.location.href;
        return new URL(href, currentUrl).href;
      }

      let absolute = getAbsoluteHref(href);
      if (absolute) {
        absolute = absolute.substring(0, absolute.indexOf("#"));
        event.preventDefault();
        event.stopPropagation();

        if (this.navigator.api?.getContent) {
          await this.navigator.api?.getContent(href).then((content) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, "text/html");
            const element = doc.querySelector("#" + id);
            if (element) {
              event.preventDefault();
              event.stopPropagation();
              this.showPopup(element, event);
            }
          });
        } else {
          await fetch(absolute, this.navigator.requestConfig)
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
    }
  }

  async hidePopover() {
    let footnote =
      this.navigator.iframes[0].contentDocument?.getElementById("d2-popover");
    if (footnote) {
      footnote.parentElement?.removeChild(footnote);
    }
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    wrapper.style.overflow = "auto";
  }

  async showPopover(link: HTMLElement, event: MouseEvent | TouchEvent) {
    const href = link.getAttribute("href");
    const src = link.getAttribute("src");
    function getAbsoluteHref(href: string): string | null {
      const currentUrl = document.location.href;
      return new URL(href, currentUrl).href;
    }
    if (href) {
      let absolute = getAbsoluteHref(href);
      if (absolute) {
        event.preventDefault();
        event.stopPropagation();

        let popover =
          this.navigator.iframes[0].contentDocument?.getElementById(
            "d2-popover"
          );
        if (popover) {
          popover.parentElement?.removeChild(popover);
        }

        const d2popover = document.createElement("div");
        d2popover.id = "d2-popover";
        d2popover.className = "d2-popover is-active";

        const wrapper = HTMLUtilities.findRequiredElement(
          document,
          "#iframe-wrapper"
        );
        wrapper.style.overflow = "hidden";
        d2popover.style.top = wrapper.scrollTop + "px";
        d2popover.style.height = wrapper.clientHeight * 0.9 + "px";

        const d2wrapper = document.createElement("div");
        d2wrapper.className = "d2-popover-wrapper";
        d2popover.appendChild(d2wrapper);

        const d2content = document.createElement("div");
        d2content.className = "d2-popover-content";
        d2wrapper.appendChild(d2content);
        if (this.navigator.api?.getContent) {
          await this.navigator.api?.getContent(href).then((content) => {
            d2content.innerHTML = content;
            let doc = this.navigator.iframes[0].contentDocument;
            if (doc) {
              doc.body.appendChild(d2popover);
            }
          });
        } else {
          await fetch(absolute, this.navigator.requestConfig)
            .then((r) => r.text())
            .then(async (data) => {
              d2content.innerHTML = data;
              let doc = this.navigator.iframes[0].contentDocument;
              if (doc) {
                doc.body.appendChild(d2popover);
              }
            });
        }

        let win = this.navigator.iframes[0].contentWindow;
        if (!win) {
          return;
        }
        let self = this;
        win.addEventListener(
          "click",
          function (ev) {
            if (event.target !== ev.target) {
              if (d2popover.parentElement) {
                self.hidePopover();
                ev.stopImmediatePropagation();
              }
            }
          },
          {
            once: true,
            capture: true,
          }
        );
      }
    } else if (src) {
      let absolute = getAbsoluteHref(src);
      if (absolute) {
        event.preventDefault();
        event.stopPropagation();

        let popover =
          this.navigator.iframes[0].contentDocument?.getElementById(
            "d2-popover"
          );
        if (popover) {
          popover.parentElement?.removeChild(popover);
        }

        const d2popover = document.createElement("div");
        d2popover.id = "d2-popover";
        d2popover.className = "d2-popover is-active";

        const wrapper = HTMLUtilities.findRequiredElement(
          document,
          "#iframe-wrapper"
        );
        wrapper.style.overflow = "hidden";
        d2popover.style.top = wrapper.scrollTop + "px";
        d2popover.style.height = wrapper.clientHeight * 0.9 + "px";

        const d2wrapper = document.createElement("div");
        d2wrapper.className = "d2-popover-wrapper";
        d2popover.appendChild(d2wrapper);

        const d2content = document.createElement("img");
        d2content.className = "d2-popover-content";
        d2wrapper.appendChild(d2content);

        d2content.src = src;
        let doc = this.navigator.iframes[0].contentDocument;
        if (doc) {
          doc.body.appendChild(d2popover);
        }

        let win = this.navigator.iframes[0].contentWindow;
        if (!win) {
          return;
        }
        let self = this;
        win.addEventListener(
          "click",
          function (ev) {
            if (event.target !== ev.target) {
              if (d2popover.parentElement) {
                self.hidePopover();
                ev.stopImmediatePropagation();
              }
            }
          },
          {
            once: true,
            capture: true,
          }
        );
      }
    }
  }

  showPopup(element: any, event: MouseEvent | TouchEvent) {
    let footnote =
      this.navigator.iframes[0].contentDocument?.getElementById("d2-popup");
    if (footnote) {
      footnote.parentElement?.removeChild(footnote);
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

    const paginated = this.navigator.view?.isPaginated();
    let doc = this.navigator.iframes[0].contentDocument;
    if (!doc) {
      return;
    }
    const scrollElement = this.getScrollingElement(doc);

    const xOffset = paginated ? scrollElement.scrollLeft : 0;
    const yOffset = paginated ? scrollElement.scrollTop : 0;
    const left = (event as any).x + xOffset;
    const top = (event as any).y + yOffset;

    d2popup.style.top = top + "px";
    if (paginated) {
      d2popup.style.left = left + "px";
    }

    doc.body.appendChild(d2popup);

    let win = this.navigator.iframes[0].contentWindow;
    if (!win) {
      return;
    }
    win.onclick = function (ev) {
      if (event.target !== ev.target) {
        if (d2popup.parentElement) {
          d2popup.style.display = "none";
          d2popup.parentElement.removeChild(d2popup);
          if (win) {
            win.onclick = null;
          }
        }
      }
    };
  }
  private getScrollingElement = (doc: Document): Element => {
    if (doc.scrollingElement) {
      return doc.scrollingElement;
    }
    return doc.body;
  };
}
