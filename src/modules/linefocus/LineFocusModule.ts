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

import { Publication } from "../../model/Publication";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import {
  TextHighlighter,
  CLASS_HIGHLIGHT_AREA,
  HighlightContainer,
  HTMLElementRect,
  IHTMLDivElementWithRect,
} from "../highlight/TextHighlighter";
import { HighlightType } from "../highlight/common/highlight";
import {
  getClientRectsNoOverlap_,
  IRect,
} from "../highlight/common/rect-utils";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import * as BrowserUtilities from "../../utils/BrowserUtilities";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import log from "loglevel";

const DEFAULT_BACKGROUND_COLOR_OPACITY = 0.5;

export interface LineFocusModuleAPI {}

export interface LineFocusModuleProperties {
  api?: LineFocusModuleAPI;
  lines?: number;
  maxHeight?: number;
}

export interface LineFocusModuleConfig extends LineFocusModuleProperties {
  api?: LineFocusModuleAPI;
  publication: Publication;
  highlighter: TextHighlighter;
}

export default class LineFocusModule implements ReaderModule {
  properties: LineFocusModuleProperties;
  api?: LineFocusModuleAPI;
  navigator: IFrameNavigator;
  private highlighter: TextHighlighter;
  private hasEventListener: boolean = false;

  lines: Array<HTMLElement> = [];
  index = 0;
  isActive = false;
  isDebug = false;

  lineFocusContainer = document.getElementById(`lineFocusContainer`);
  readerContainer = document.getElementById(`D2Reader-Container`);
  lineFocusTopBlinder = document.getElementById(`lineFocusTopBlinder`);
  lineFocusBottomBlinder = document.getElementById(`lineFocusBottomBlinder`);

  public static async create(config: LineFocusModuleConfig) {
    const search = new this(
      config as LineFocusModuleProperties,
      config.highlighter,
      config.api
    );

    await search.start();
    return search;
  }

  private constructor(
    properties: LineFocusModuleProperties,
    highlighter: TextHighlighter,
    api?: LineFocusModuleAPI
  ) {
    this.properties = properties;
    this.api = api;
    this.highlighter = highlighter;
  }

  async stop() {
    log.log("Definitions module stop");
    this.hasEventListener = false;
    removeEventListenerOptional(document, "keydown", this.keydown.bind(this));
    removeEventListenerOptional(document, "keyup", this.keyup.bind(this));
    removeEventListenerOptional(
      this.navigator.iframes[0].contentDocument,
      "keydown",
      this.keydown.bind(this)
    );
    removeEventListenerOptional(
      this.navigator.iframes[0].contentDocument,
      "keyup",
      this.keyup.bind(this)
    );
  }

  protected async start(): Promise<void> {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    ) as HTMLDivElement;

    if (wrapper.style.height.length > 0) {
      this.wrapperHeight = wrapper.style.height;
      if (
        this.lineFocusContainer &&
        this.lineFocusContainer.style.height.length === 0
      )
        this.lineFocusContainer.style.height = this.wrapperHeight;
      if (
        this.readerContainer &&
        this.readerContainer.style.height.length === 0
      ) {
        this.readerContainer.style.height = this.wrapperHeight;
      }
      if (this.readerContainer) {
        this.readerContainer.style.overflow = "hidden";
      }
    }
  }

  initialize(iframe: HTMLIFrameElement) {
    return new Promise(async (resolve) => {
      await (document as any).fonts.ready;
      if (!this.hasEventListener) {
        this.hasEventListener = true;
        addEventListenerOptional(document, "keydown", this.keydown.bind(this));
        addEventListenerOptional(document, "keyup", this.keyup.bind(this));
        addEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.keydown.bind(this)
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "keyup",
          this.keyup.bind(this)
        );
      }
      resolve(null);
    });
  }

  private keydown(event: KeyboardEvent | MouseEvent | TouchEvent): void {
    if (event instanceof KeyboardEvent && this.isActive) {
      const key = event.key;
      switch (key) {
        case "ArrowUp":
          event.stopPropagation();
          break;
        case "ArrowDown":
          event.stopPropagation();
          break;
      }
    }
  }

  private keyup(event: KeyboardEvent | MouseEvent | TouchEvent): void {
    if (event instanceof KeyboardEvent && this.isActive) {
      const key = event.key;
      switch (key) {
        case "ArrowUp":
          this.lineUp();
          break;
        case "ArrowDown":
          this.lineDown();
          break;
      }
    }
  }

  handleResize() {
    if (this.isActive) {
      this.lineFocus();
    }
  }

  async enableLineFocus() {
    this.isActive = true;
    await this.navigator.settings.scroll(true);
    this.lineFocus();
  }

  wrapperHeight: string | undefined = undefined;

  disableLineFocus(resetHeight: boolean = true) {
    this.isActive = false;

    // document.body.style.removeProperty("overflow");
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    ) as HTMLDivElement;

    if (this.wrapperHeight) {
      wrapper.style.height = this.wrapperHeight;
    }
    if (!resetHeight) {
      this.index = 0;
    }

    const doc = this.navigator.iframes[0].contentDocument;
    const html = HTMLUtilities.findIframeElement(
      doc,
      "html"
    ) as HTMLHtmlElement;

    html.style.removeProperty("--USER__maxMediaHeight");

    this.wrapperHeight = undefined;

    if (this.lineFocusContainer) this.lineFocusContainer.style.display = "none";

    let timeline = document.getElementById("container-view-timeline");
    if (timeline) {
      timeline.style.removeProperty("display");
    }

    let divBefore = document.getElementById("divBefore");
    if (divBefore) {
      divBefore.remove();
    }

    let divAfter = document.getElementById("divAfter");
    if (divAfter) {
      divAfter.remove();
    }
    this.highlighter.destroyHighlights(HighlightType.LineFocus);
  }

  lineFocus() {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    ) as HTMLDivElement;

    const doc = this.navigator.iframes[0].contentDocument;
    const html = HTMLUtilities.findIframeElement(
      doc,
      "html"
    ) as HTMLHtmlElement;

    let maxHeight = this.properties.maxHeight
      ? (BrowserUtilities.getHeight() * this.properties.maxHeight) / 100
      : BrowserUtilities.getHeight() / 2;

    html.style.setProperty("--USER__maxMediaHeight", maxHeight + "px");

    function insertAfter(referenceNode, newNode) {
      referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    function insertBefore(referenceNode, newNode) {
      referenceNode.parentNode.insertBefore(newNode, referenceNode);
    }

    let timeline = document.getElementById("container-view-timeline");
    if (timeline) {
      timeline.style.display = "none";
    }

    if (this.lineFocusContainer)
      this.lineFocusContainer.style.removeProperty("display");

    let divBefore = document.getElementById("divBefore");
    if (divBefore) {
      divBefore.style.height = wrapper.clientHeight / 2 + "px";
    } else {
      let divBefore = document.createElement("div");
      divBefore.style.height = wrapper.clientHeight / 2 + "px";
      divBefore.id = "divBefore";
      insertBefore(wrapper, divBefore);
    }

    let divAfter = document.getElementById("divAfter");
    if (divAfter) {
      divAfter.style.height = wrapper.clientHeight / 2 + "px";
    } else {
      let divAfter = document.createElement("div");
      divAfter.style.height = wrapper.clientHeight / 2 + "px";
      divAfter.id = "divAfter";
      insertAfter(wrapper, divAfter);
    }

    this.lines = [];
    if (doc) {
      let textNodes = this.findRects(doc.body);
      textNodes = getClientRectsNoOverlap_(textNodes, true);

      textNodes = textNodes.sort(function (a: any, b: any) {
        return a.top - b.top;
      });

      let dups: any[] = [];
      textNodes = textNodes.filter(function (el) {
        const center = el.top;
        if (
          dups.indexOf(center) === -1 &&
          dups.indexOf(center + 1) === -1 &&
          dups.indexOf(center + 2) === -1 &&
          dups.indexOf(center + 3) === -1 &&
          dups.indexOf(center + 4) === -1 &&
          dups.indexOf(center - 1) === -1 &&
          dups.indexOf(center - 2) === -1 &&
          dups.indexOf(center - 3) === -1 &&
          dups.indexOf(center - 4) === -1
        ) {
          dups.push(center);
          return true;
        }
        return false;
      });

      this.highlighter.destroyHighlights(HighlightType.LineFocus);

      function random_rgba() {
        const o = Math.round,
          r = Math.random,
          s = 255;
        return {
          blue: o(r() * s),
          green: o(r() * s),
          red: o(r() * s),
        };
      }

      // merge lines into 1, 3 or 5
      function groupArr(data, n) {
        let group: any[] = [];
        for (let i = 0, j = 0; i < data.length; i++) {
          if (i >= n && i % n === 0) j++;
          group[j] = group[j] || [];
          group[j].push(data[i]);
        }
        return group;
      }

      function getBoundingRect(rect1: IRect, rect2: IRect): IRect {
        const left = Math.min(rect1.left, rect2.left);
        const right = Math.max(rect1.right, rect2.right);
        const top = Math.min(rect1.top, rect2.top);
        const bottom = Math.max(rect1.bottom, rect2.bottom);
        return {
          bottom,
          height: bottom - top,
          left,
          right,
          top,
          width: right - left,
        };
      }

      function mergeArr(data) {
        if (data.length > 1) {
          let first = getBoundingRect(data[0], data[1]);
          if (data.length > 2) {
            let second = getBoundingRect(first, data[2]);
            if (data.length > 3) {
              let third = getBoundingRect(second, data[3]);
              if (data.length > 4) {
                return getBoundingRect(third, data[4]);
              }
              return third;
            }
            return second;
          }
          return first;
        }
        return data[0];
      }

      let newGroupedLines: any[] = [];
      if (this.properties.lines && this.properties.lines > 1) {
        let threes = groupArr(textNodes, this.properties.lines);
        threes.forEach((data) => {
          newGroupedLines.push(mergeArr(data));
        });
      } else {
        newGroupedLines = textNodes;
      }

      const container = HTMLUtilities.findElement(
        doc,
        "#" + HighlightContainer.R2_ID_LINEFOCUS_CONTAINER
      );

      if (container) {
        for (const clientRect of newGroupedLines) {
          const highlightArea = document.createElement(
            "div"
          ) as IHTMLDivElementWithRect;
          highlightArea.setAttribute("class", CLASS_HIGHLIGHT_AREA);
          let color: any = random_rgba();
          if (TextHighlighter.isHexColor(color)) {
            color = TextHighlighter.hexToRgbChannels(color);
          }
          // enable debugging color
          if (this.isDebug) {
            let extra = `border-bottom: 1px solid rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY}) !important`;
            highlightArea.setAttribute(
              "style",
              `mix-blend-mode: multiply; border-radius: 1px !important; background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY}) !important; ${extra}`
            );
          }
          highlightArea.style.outline = "none";
          highlightArea.tabIndex = 0;

          const documant = (this.navigator.iframes[0].contentWindow as any)
            .document;

          const paginated = this.navigator.view.isPaginated();

          if (paginated) {
            documant.body.style.position = "revert";
          } else {
            documant.body.style.position = "relative";
          }
          const bodyRect = documant.body.getBoundingClientRect();
          const scrollElement = this.highlighter.getScrollingElement(documant);

          const xOffset = paginated ? -scrollElement.scrollLeft : bodyRect.left;
          const yOffset = paginated ? -scrollElement.scrollTop : bodyRect.top;

          const scale = 1;

          let size = 24;
          let left, right;
          let viewportWidth =
            this.navigator.iframes[0].contentWindow?.innerWidth;
          let columnCount = parseInt(
            getComputedStyle(doc.documentElement).getPropertyValue(
              "column-count"
            )
          );

          let columnWidth = parseInt(
            getComputedStyle(doc.documentElement).getPropertyValue(
              "column-width"
            )
          );
          let padding = parseInt(
            getComputedStyle(doc.body).getPropertyValue("padding-left")
          );
          if (viewportWidth) {
            let pageWidth = viewportWidth / (columnCount || 1);
            if (pageWidth < columnWidth) {
              pageWidth = viewportWidth;
            }
            if (!paginated) {
              pageWidth = parseInt(
                getComputedStyle(doc.body).width.replace("px", "")
              );
            }

            let ratio = this.navigator.settings.fontSize / 100;
            let addRight = 20 * ratio;

            if (ratio <= 1) {
              addRight = -60;
            }

            let addLeft = 0;
            if (ratio <= 1) {
              addLeft = -60;
            }

            left =
              Math.floor(clientRect.left / pageWidth) * pageWidth +
              pageWidth -
              (size < 40 ? 40 : size) +
              addLeft;

            right =
              Math.floor(clientRect.left / pageWidth) * pageWidth +
              (size < 40 ? 40 : size) -
              addRight;

            let pagemargin = parseInt(
              doc.documentElement.style.getPropertyValue("--USER__pageMargins")
            );
            if (pagemargin >= 2) {
              right = right + padding / columnCount;
              left = left - padding / columnCount;
            }

            if (!paginated) {
              left = parseInt(
                getComputedStyle(doc.body).width.replace("px", "")
              );
              right =
                parseInt(getComputedStyle(doc.body).width.replace("px", "")) -
                pageWidth;

              if (pagemargin >= 2) {
                right = right + padding / 2;
                left = left - padding / 2;
              }
            }
          }
          highlightArea.style.setProperty("pointer-events", "none");
          highlightArea.style.position = "absolute";
          highlightArea.scale = scale;
          highlightArea.rect = {
            height: clientRect.height,
            left: clientRect.left - xOffset,
            top: clientRect.top - yOffset,
            width: clientRect.width,
          };
          highlightArea.style.width = `${highlightArea.rect.width * scale}px`;
          highlightArea.style.height = `${highlightArea.rect.height * scale}px`;
          highlightArea.style.left = `${highlightArea.rect.left * scale}px`;
          highlightArea.style.top = `${highlightArea.rect.top * scale}px`;

          this.lines.push(highlightArea);
          container.append(highlightArea);
        }
      }
      setTimeout(() => {
        this.currentLine();
      }, 100);
    }
  }

  currentLine() {
    let current = this.lines[this.index];

    let top = current.style.top;
    let bottom =
      parseInt(current.style.top.replace("px", "")) +
      parseInt(current.style.height.replace("px", ""));
    let height = bottom - parseInt(top.replace("px", ""));

    if (this.lineFocusContainer) {
      let lineFocusHeight = parseInt(
        getComputedStyle(this.lineFocusContainer).height.replace("px", "")
      );

      let blindersHeight = (lineFocusHeight - height) / 2;
      if (this.lineFocusTopBlinder)
        this.lineFocusTopBlinder.style.height = blindersHeight + "px";
      if (this.lineFocusBottomBlinder)
        this.lineFocusBottomBlinder.style.height = blindersHeight + "px";
    }

    current.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }

  lineDown() {
    if (this.index < this.lines.length - 1) {
      this.index += 1;
      if (this.index > this.lines.length - 1) {
        this.index = this.lines.length - 1;
      }

      let current = this.lines[this.index];

      let top = current.style.top;
      let bottom =
        parseInt(current.style.top.replace("px", "")) +
        parseInt(current.style.height.replace("px", ""));
      let height = bottom - parseInt(top.replace("px", ""));

      if (this.lineFocusContainer) {
        let lineFocusHeight = parseInt(
          getComputedStyle(this.lineFocusContainer).height.replace("px", "")
        );

        let blindersHeight = (lineFocusHeight - height) / 2;

        if (this.lineFocusTopBlinder)
          this.lineFocusTopBlinder.style.height = blindersHeight + "px";
        if (this.lineFocusBottomBlinder)
          this.lineFocusBottomBlinder.style.height = blindersHeight + "px";
      }
      current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }

  lineUp() {
    if (this.index > 0) {
      this.index -= 1;
      if (this.index < 0) {
        this.index = 0;
      }

      let current = this.lines[this.index];

      let top = current.style.top;
      let bottom =
        parseInt(current.style.top.replace("px", "")) +
        parseInt(current.style.height.replace("px", ""));
      let height = bottom - parseInt(top.replace("px", ""));

      if (this.lineFocusContainer) {
        let lineFocusHeight = parseInt(
          getComputedStyle(this.lineFocusContainer).height.replace("px", "")
        );

        let blindersHeight = (lineFocusHeight - height) / 2;

        if (this.lineFocusTopBlinder)
          this.lineFocusTopBlinder.style.height = blindersHeight + "px";
        if (this.lineFocusBottomBlinder)
          this.lineFocusBottomBlinder.style.height = blindersHeight + "px";
      }
      current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }

  almostEqual(a: number, b: number, tolerance: number) {
    return Math.abs(a - b) <= tolerance;
  }

  findRects(parent: HTMLElement): any {
    const textNodes = this.findTextNodes(parent);
    const imageNodes = Array.from(parent.getElementsByTagName("img"));

    let newNodes: Array<HTMLElementRect> = [];
    textNodes.forEach((node) => {
      newNodes.push(...this.measureTextNodes(node));
    });
    imageNodes.forEach((node) => {
      newNodes.push(...this.measureImageNodes(node));
    });
    return newNodes;
  }

  findTextNodes(
    parentElement: Element,
    nodes: Array<Element> = []
  ): Array<Element> {
    let element = parentElement.firstChild as Element;
    while (element) {
      if (element.nodeType === 1) {
        this.findTextNodes(element, nodes);
      }
      if (element.nodeType === 3) {
        if (
          element.textContent?.trim() &&
          (element.textContent.trim().length > 1 ||
            element.parentElement?.tagName.toLowerCase() === "h1" ||
            element.parentElement?.tagName.toLowerCase() === "h2" ||
            element.parentElement?.tagName.toLowerCase() === "h3" ||
            element.parentElement?.tagName.toLowerCase() === "h4" ||
            element.parentElement?.tagName.toLowerCase() === "h5" ||
            element.parentElement?.tagName.toLowerCase() === "h6") &&
          element.parentElement &&
          getComputedStyle(element.parentElement).verticalAlign === "baseline"
        ) {
          nodes.push(element);
        }
      }
      element = element.nextSibling as Element;
    }
    return nodes;
  }

  measureTextNodes(node: Element): any {
    try {
      const range = document.createRange();
      range.selectNodeContents(node);

      const rect = Array.from(range.getClientRects());
      range.detach(); // frees up memory in older browsers
      return rect;
    } catch (error) {
      log.log("measureTextNode " + error);
      log.log("measureTextNode " + node);
      log.log(`${node.textContent}`);
    }
  }
  measureImageNodes(node: Element): any {
    try {
      const range = document.createRange();
      range.selectNode(node);

      const rect = Array.from(range.getClientRects());
      range.detach(); // frees up memory in older browsers
      return rect;
    } catch (error) {
      log.log("measureTextNode " + error);
      log.log("measureTextNode " + node);
      log.log(`${node.textContent}`);
    }
  }
}
