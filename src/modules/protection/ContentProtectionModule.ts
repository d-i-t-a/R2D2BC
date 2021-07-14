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
 * Developed on behalf of: DITA, Bokbasen AS (https://www.bokbasen.no), Bluefire Productions, LLC (https://www.bluefirereader.com/)
 * Licensed to: Bluefire Productions, LLC, Bibliotheca LLC, Bokbasen AS and CAST under one or more contributor license agreements.
 */

import ReaderModule from "../ReaderModule";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import { debounce } from "debounce";
import { IS_DEV } from "../..";

export interface ContentProtectionModuleProperties {
  enforceSupportedBrowsers: boolean;
  enableEncryption: boolean;
  enableObfuscation: boolean;
  disablePrint: boolean;
  disableCopy: boolean;
  detectInspect: boolean;
  clearOnInspect: boolean;
  disableKeys: boolean;
  disableContextMenu: boolean;
  hideTargetUrl: boolean;
  disableDrag: boolean;
  supportedBrowsers: [];
}

export interface ContentProtectionModuleConfig
  extends ContentProtectionModuleProperties {
  delegate: IFrameNavigator;
  api: ContentProtectionModuleAPI;
}

export interface ContentProtectionModuleAPI {
  inspectDetected: any;
}

interface ContentProtectionRect {
  node: Element;
  height: number;
  top: number;
  width: number;
  left: number;
  textContent: string;
  scrambledTextContent: string;
  isObfuscated: boolean;
}

export default class ContentProtectionModule implements ReaderModule {
  private rects: Array<ContentProtectionRect>;
  private delegate: IFrameNavigator;
  private properties: ContentProtectionModuleProperties;
  private api: ContentProtectionModuleAPI;
  private hasEventListener: boolean = false;
  private isHacked: boolean = false;
  private securityContainer: HTMLDivElement;
  private mutationObserver: MutationObserver;

  public static async create(config: ContentProtectionModuleConfig) {
    const security = new this(
      config.delegate,
      config as ContentProtectionModuleProperties,
      config.api
    );
    await security.start();
    return security;
  }

  public constructor(
    delegate: IFrameNavigator,
    properties: ContentProtectionModuleProperties | null = null,
    api: ContentProtectionModuleAPI | null = null
  ) {
    this.delegate = delegate;
    this.properties = properties;
    this.api = api;
  }

  protected async start(): Promise<void> {
    this.delegate.contentProtectionModule = this;

    if (this.properties?.enableObfuscation) {
      this.securityContainer = HTMLUtilities.findElement(
        document,
        "#container-view-security"
      ) as HTMLDivElement;

      var self = this;

      // create an observer instance
      this.mutationObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (IS_DEV) {
            console.log(mutation.type);
          }
          self.isHacked = true;
        });
      });
    }
  }

  async stop() {
    if (IS_DEV) {
      console.log("Protection module stop");
    }
    this.mutationObserver.disconnect();

    if (this.properties?.disableKeys) {
      removeEventListenerOptional(
        this.delegate.mainElement,
        "keydown",
        this.disableSave
      );
      removeEventListenerOptional(
        this.delegate.headerMenu,
        "keydown",
        this.disableSave
      );
      for (const iframe of this.delegate.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.disableSave
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "keydown",
          this.disableSave
        );
      }
      removeEventListenerOptional(window, "keydown", this.disableSave);
      removeEventListenerOptional(document, "keydown", this.disableSave);
    }

    if (this.properties?.disableCopy) {
      removeEventListenerOptional(
        this.delegate.mainElement,
        "copy",
        this.preventCopy
      );
      removeEventListenerOptional(
        this.delegate.headerMenu,
        "copy",
        this.preventCopy
      );
      for (const iframe of this.delegate.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "copy",
          this.preventCopy
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "copy",
          this.preventCopy
        );
      }

      removeEventListenerOptional(window, "copy", this.preventCopy);
      removeEventListenerOptional(document, "copy", this.preventCopy);
      removeEventListenerOptional(
        this.delegate.mainElement,
        "cut",
        this.preventCopy
      );
      removeEventListenerOptional(
        this.delegate.headerMenu,
        "cut",
        this.preventCopy
      );
      for (const iframe of this.delegate.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "cut",
          this.preventCopy
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "cut",
          this.preventCopy
        );
      }
      removeEventListenerOptional(window, "cut", this.preventCopy);
      removeEventListenerOptional(document, "cut", this.preventCopy);
    }
    if (this.properties?.disablePrint) {
      removeEventListenerOptional(
        this.delegate.mainElement,
        "beforeprint",
        this.beforePrint.bind(this)
      );
      removeEventListenerOptional(
        this.delegate.headerMenu,
        "beforeprint",
        this.beforePrint.bind(this)
      );
      for (const iframe of this.delegate.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "beforeprint",
          this.beforePrint
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "beforeprint",
          this.beforePrint
        );
      }
      removeEventListenerOptional(window, "beforeprint", this.beforePrint);
      removeEventListenerOptional(document, "beforeprint", this.beforePrint);
      removeEventListenerOptional(
        this.delegate.mainElement,
        "afterprint",
        this.afterPrint.bind(this)
      );
      removeEventListenerOptional(
        this.delegate.headerMenu,
        "afterprint",
        this.afterPrint.bind(this)
      );
      for (const iframe of this.delegate.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "afterprint",
          this.afterPrint.bind(this)
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "afterprint",
          this.afterPrint.bind(this)
        );
      }
      removeEventListenerOptional(
        window,
        "afterprint",
        this.afterPrint.bind(this)
      );
      removeEventListenerOptional(
        document,
        "afterprint",
        this.afterPrint.bind(this)
      );
    }
    if (this.properties?.disableContextMenu) {
      removeEventListenerOptional(
        this.delegate.mainElement,
        "contextmenu",
        this.disableContext
      );
      removeEventListenerOptional(
        this.delegate.headerMenu,
        "contextmenu",
        this.disableContext
      );
      for (const iframe of this.delegate.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "contextmenu",
          this.disableContext
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "contextmenu",
          this.disableContext
        );
      }
      removeEventListenerOptional(window, "contextmenu", this.disableContext);
      removeEventListenerOptional(document, "contextmenu", this.disableContext);
    }
    if (this.properties?.hideTargetUrl) {
      this.hideTargetUrls(false);
    }
    if (this.properties?.disableDrag) {
      this.preventDrag(false);
    }

    removeEventListenerOptional(window, "scroll", this.handleScroll.bind(this));
  }

  observe(): any {
    if (this.properties?.enableObfuscation) {
      if (this.securityContainer.hasAttribute("style")) {
        this.isHacked = true;
      }

      // stop observing first
      this.mutationObserver.disconnect();

      // configuration of the observer:
      var config = { attributes: true, childList: true, characterData: true };

      // pass in the target node, as well as the observer options
      this.mutationObserver.observe(this.securityContainer, config);
    }
  }

  public async deactivate() {
    if (this.properties?.enableObfuscation) {
      this.observe();
      this.rects.forEach((rect) =>
        this.deactivateRect(rect, this.securityContainer, this.isHacked)
      );
    }
  }

  public async activate() {
    if (this.properties?.enableObfuscation) {
      this.observe();
      for (const iframe of this.delegate.iframes) {
        const body = HTMLUtilities.findRequiredIframeElement(
          iframe.contentDocument,
          "body"
        ) as HTMLBodyElement;
        this.rects = this.findRects(body);
        this.rects.forEach((rect) =>
          this.toggleRect(rect, this.securityContainer, this.isHacked)
        );
      }
    }
  }
  private setupEvents(): void {
    var self = this;
    if (this.properties?.detectInspect) {
      var checkStatus = "off";
      var div = document.createElement("div");
      Object.defineProperty(div, "id", {
        get: function () {
          checkStatus = "on";
          throw new Error("Dev tools checker");
        },
      });
      requestAnimationFrame(function check() {
        checkStatus = "off";
        console.log(div);
        if (checkStatus === "on") {
          if (self.properties?.clearOnInspect) {
            console.clear();
            window.localStorage.clear();
            window.sessionStorage.clear();
            window.location.replace(window.location.origin);
          }
          self.api?.inspectDetected();
        }
        requestAnimationFrame(check);
      });
    }

    if (this.properties?.disableKeys) {
      addEventListenerOptional(
        this.delegate.mainElement,
        "keydown",
        this.disableSave
      );
      addEventListenerOptional(
        this.delegate.headerMenu,
        "keydown",
        this.disableSave
      );
      for (const iframe of this.delegate.iframes) {
        addEventListenerOptional(iframe, "keydown", this.disableSave);
        addEventListenerOptional(
          iframe.ownerDocument,
          "keydown",
          this.disableSave
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.disableSave
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "keydown",
          this.disableSave
        );
        addEventListenerOptional(
          iframe.contentWindow.document,
          "keydown",
          this.disableSave
        );
      }
      addEventListenerOptional(window, "keydown", this.disableSave);
      addEventListenerOptional(document, "keydown", this.disableSave);
    }
    if (this.properties?.disableCopy) {
      addEventListenerOptional(
        this.delegate.mainElement,
        "copy",
        this.preventCopy
      );
      addEventListenerOptional(
        this.delegate.headerMenu,
        "copy",
        this.preventCopy
      );
      for (const iframe of this.delegate.iframes) {
        addEventListenerOptional(iframe, "copy", this.preventCopy);
        addEventListenerOptional(
          iframe.ownerDocument,
          "copy",
          this.preventCopy
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "copy",
          this.preventCopy
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "copy",
          this.preventCopy
        );
        addEventListenerOptional(
          iframe.contentWindow.document,
          "copy",
          this.preventCopy
        );
      }
      addEventListenerOptional(window, "copy", this.preventCopy);
      addEventListenerOptional(document, "copy", this.preventCopy);

      addEventListenerOptional(
        this.delegate.mainElement,
        "cut",
        this.preventCopy
      );
      addEventListenerOptional(
        this.delegate.headerMenu,
        "cut",
        this.preventCopy
      );
      for (const iframe of this.delegate.iframes) {
        addEventListenerOptional(iframe, "cut", this.preventCopy);
        addEventListenerOptional(iframe.ownerDocument, "cut", this.preventCopy);
        addEventListenerOptional(
          iframe.contentDocument,
          "cut",
          this.preventCopy
        );
        addEventListenerOptional(iframe.contentWindow, "cut", this.preventCopy);
        addEventListenerOptional(
          iframe.contentWindow.document,
          "cut",
          this.preventCopy
        );
      }

      addEventListenerOptional(window, "cut", this.preventCopy);
      addEventListenerOptional(document, "cut", this.preventCopy);
    }

    if (this.properties?.disablePrint) {
      addEventListenerOptional(
        this.delegate.mainElement,
        "beforeprint",
        this.beforePrint
      );
      addEventListenerOptional(
        this.delegate.headerMenu,
        "beforeprint",
        this.beforePrint
      );
      for (const iframe of this.delegate.iframes) {
        addEventListenerOptional(
          iframe,
          "beforeprint",
          this.beforePrint.bind(this)
        );
        addEventListenerOptional(
          iframe.ownerDocument,
          "beforeprint",
          this.beforePrint.bind(this)
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "beforeprint",
          this.beforePrint.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "beforeprint",
          this.beforePrint.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow.document,
          "beforeprint",
          this.beforePrint.bind(this)
        );
      }
      addEventListenerOptional(
        window,
        "beforeprint",
        this.beforePrint.bind(this)
      );
      addEventListenerOptional(
        document,
        "beforeprint",
        this.beforePrint.bind(this)
      );

      addEventListenerOptional(
        this.delegate.mainElement,
        "afterprint",
        this.afterPrint
      );
      addEventListenerOptional(
        this.delegate.headerMenu,
        "afterprint",
        this.afterPrint
      );
      for (const iframe of this.delegate.iframes) {
        addEventListenerOptional(
          iframe,
          "afterprint",
          this.afterPrint.bind(this)
        );
        addEventListenerOptional(
          iframe.ownerDocument,
          "afterprint",
          this.afterPrint.bind(this)
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "afterprint",
          this.afterPrint.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "afterprint",
          this.afterPrint.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow.document,
          "afterprint",
          this.afterPrint.bind(this)
        );
      }
      addEventListenerOptional(
        window,
        "afterprint",
        this.afterPrint.bind(this)
      );
      addEventListenerOptional(
        document,
        "afterprint",
        this.afterPrint.bind(this)
      );
    }
    if (this.properties?.disableContextMenu) {
      addEventListenerOptional(
        this.delegate.mainElement,
        "contextmenu",
        this.disableContext
      );
      addEventListenerOptional(
        this.delegate.headerMenu,
        "contextmenu",
        this.disableContext
      );
      for (const iframe of this.delegate.iframes) {
        addEventListenerOptional(iframe, "contextmenu", this.disableContext);
        addEventListenerOptional(
          iframe.ownerDocument,
          "contextmenu",
          this.disableContext
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "contextmenu",
          this.disableContext
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "contextmenu",
          this.disableContext
        );
        addEventListenerOptional(
          iframe.contentWindow.document,
          "contextmenu",
          this.disableContext
        );
      }
      addEventListenerOptional(window, "contextmenu", this.disableContext);
      addEventListenerOptional(document, "contextmenu", this.disableContext);
    }
  }

  initializeResource() {
    if (this.properties?.hideTargetUrl) {
      this.hideTargetUrls(true);
    }
    if (this.properties?.disableDrag) {
      this.preventDrag(true);
    }
  }

  public async initialize() {
    if (this.properties?.enableObfuscation) {
      return new Promise<void>(async (resolve) => {
        await (document as any).fonts.ready;
        for (const iframe of this.delegate.iframes) {
          const body = HTMLUtilities.findRequiredIframeElement(
            iframe.contentDocument,
            "body"
          ) as HTMLBodyElement;

          this.observe();

          setTimeout(() => {
            this.rects = this.findRects(body);
            this.rects.forEach((rect) =>
              this.toggleRect(rect, this.securityContainer, this.isHacked)
            );

            this.setupEvents();
            if (!this.hasEventListener) {
              this.hasEventListener = true;
              addEventListenerOptional(
                window,
                "scroll",
                this.handleScroll.bind(this)
              );
            }
            resolve();
          }, 10);
        }
      });
    }
  }

  handleScroll() {
    this.rects.forEach((rect) =>
      this.toggleRect(rect, this.securityContainer, this.isHacked)
    );
  }
  handleResize() {
    if (this.properties?.enableObfuscation) {
      const onDoResize = debounce(() => {
        this.calcRects(this.rects);
        if (this.rects !== undefined) {
          this.rects.forEach((rect) =>
            this.toggleRect(rect, this.securityContainer, this.isHacked)
          );
        }
      }, 10);
      if (this.rects) {
        this.observe();
        onDoResize();
      }
    }
  }

  disableContext(e: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  disableSave(event: {
    keyCode: any;
    metaKey: any;
    ctrlKey: any;
    key: string;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (
      navigator.platform === "MacIntel" || navigator.platform.match("Mac")
        ? event.metaKey
        : event.ctrlKey && (event.key === "s" || event.keyCode === 83)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return true;
  }
  preventCopy(event: {
    clipboardData: { setData: (arg0: string, arg1: any) => void };
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (IS_DEV) {
      console.log("copy action initiated");
    }
    event.clipboardData.setData("text/plain", "copy not allowed");
    event.stopPropagation();
    event.preventDefault();
    return false;
  }

  beforePrint(event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (IS_DEV) {
      console.log("before print");
    }
    this.delegate.headerMenu.style.display = "none";
    this.delegate.mainElement.style.display = "none";

    event.stopPropagation();
    event.preventDefault();
    return false;
  }
  afterPrint(event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (IS_DEV) {
      console.log("before print");
    }
    this.delegate.headerMenu.style.removeProperty("display");
    this.delegate.mainElement.style.removeProperty("display");

    event.stopPropagation();
    event.preventDefault();
    return false;
  }

  hideTargetUrls(activate) {
    function onAElementClick(ev) {
      ev.preventDefault();
      const href = ev.currentTarget.getAttribute("data-href-resolved");
      const aElement = document.createElement("a");
      aElement.setAttribute("href", href);
      aElement.click();
    }
    for (const iframe of this.delegate.iframes) {
      const aElements = iframe.contentDocument.querySelectorAll("a");

      aElements.forEach((aElement) => {
        const dataHref = aElement.getAttribute("data-href");
        if (!dataHref) {
          aElement.setAttribute("data-href", aElement.getAttribute("href"));
          aElement.setAttribute("data-href-resolved", aElement.href);
        }
      });

      if (activate) {
        aElements.forEach((aElement) => {
          aElement.setAttribute("href", "");
          aElement.addEventListener("click", onAElementClick);
        });
      } else {
        aElements.forEach((aElement) => {
          aElement.setAttribute("href", aElement.getAttribute("data-href"));
          aElement.removeEventListener("click", onAElementClick);
        });
      }
    }
  }

  preventDrag(activate) {
    const dragStyle =
      "-webkit-user-drag: none; -khtml-user-drag: none; -moz-user-drag: none; -ms-user-drag: none; user-drag: none; -webkit-pointer-events: none; -khtml-pointer-events: none; -moz-pointer-events: none; -ms-pointer-events: none; pointer-events: none;";
    const onDragstart = (evt) => {
      evt.preventDefault();
    };
    for (const iframe of this.delegate.iframes) {
      const bodyStyle = iframe.contentDocument.body.getAttribute("style") || "";

      if (activate) {
        iframe.contentDocument.body.addEventListener("dragstart", onDragstart);
        iframe.contentDocument.body.setAttribute(
          "style",
          bodyStyle + dragStyle
        );
      } else {
        iframe.contentDocument.body.removeEventListener(
          "dragstart",
          onDragstart
        );
        iframe.contentDocument.body.setAttribute(
          "style",
          bodyStyle.replace(dragStyle, "")
        );
      }
    }
  }

  recalculate(delay: number = 0) {
    if (this.properties?.enableObfuscation) {
      const onDoResize = debounce(() => {
        this.calcRects(this.rects);
        if (this.rects !== undefined) {
          this.rects.forEach((rect) =>
            this.toggleRect(rect, this.securityContainer, this.isHacked)
          );
        }
      }, delay);
      if (this.rects) {
        this.observe();
        onDoResize();
      }
    }
  }

  calcRects(rects: Array<ContentProtectionRect>): void {
    if (rects !== undefined) {
      rects.forEach((rect) => {
        try {
          const { top, height, left, width } = this.measureTextNode(rect.node);
          rect.top = top;
          rect.height = height;
          rect.width = width;
          rect.left = left;
        } catch (error) {
          if (IS_DEV) {
            console.log("error " + error);
            console.log(rect);
            console.log(rect.node);
            console.log("scrambledTextContent " + rect.scrambledTextContent);
            console.log("textContent " + rect.textContent);
            console.log("isObfuscated " + rect.isObfuscated);
          }
        }
      });
    }
  }

  deactivateRect(
    rect: ContentProtectionRect,
    securityContainer: HTMLElement,
    isHacked: boolean
  ): void {
    const beingHacked = this.isBeingHacked(securityContainer);

    if (beingHacked || isHacked) {
      rect.node.textContent = rect.scrambledTextContent;
      rect.isObfuscated = true;
    } else {
      rect.node.textContent = rect.textContent;
      rect.isObfuscated = false;
    }
  }

  toggleRect(
    rect: ContentProtectionRect,
    securityContainer: HTMLElement,
    isHacked: boolean
  ): void {
    const outsideViewport = this.isOutsideViewport(rect);
    const beingHacked = this.isBeingHacked(securityContainer);

    if (rect.isObfuscated && !outsideViewport && !beingHacked && !isHacked) {
      rect.node.textContent = rect.textContent;
      rect.isObfuscated = false;
    }

    if (!rect.isObfuscated && (outsideViewport || beingHacked || isHacked)) {
      rect.node.textContent = rect.scrambledTextContent;
      rect.isObfuscated = true;
    }
  }

  findRects(parent: HTMLElement): Array<ContentProtectionRect> {
    const textNodes = this.findTextNodes(parent);

    return textNodes.map((node) => {
      const { top, height, left, width } = this.measureTextNode(node);
      const scrambled =
        node.parentElement.nodeName === "option" ||
        node.parentElement.nodeName === "script"
          ? node.textContent
          : this.obfuscateText(node.textContent);
      return {
        top,
        height,
        width,
        left,
        node,
        textContent: node.textContent,
        scrambledTextContent: scrambled,
        isObfuscated: false,
      };
    });
  }

  obfuscateText(text: string): string {
    return this.scramble(text, true);
  }

  measureTextNode(node: Element): any {
    try {
      const range = document.createRange();
      range.selectNode(node);

      const rect = range.getBoundingClientRect();
      range.detach(); // frees up memory in older browsers

      return rect;
    } catch (error) {
      if (IS_DEV) {
        console.log("measureTextNode " + error);
        console.log("measureTextNode " + node);
        console.log(node.textContent);
      }
    }
  }

  isBeingHacked(element: HTMLElement): boolean {
    if (
      element.style.animation ||
      element.style.transition ||
      element.style.position ||
      element.hasAttribute("style")
    ) {
      if (IS_DEV) console.log("content being hacked");
      return true;
    }
    return false;
  }

  isOutsideViewport(rect: ContentProtectionRect): boolean {
    const windowLeft = window.scrollX;
    const windowRight = windowLeft + window.innerWidth;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const windowTop = window.scrollY;
    const windowBottom = windowTop + window.innerHeight;

    const isAbove = bottom < windowTop;
    const isBelow = rect.top > windowBottom;

    const isLeft = right < windowLeft;
    const isRight = rect.left > windowRight;

    return isAbove || isBelow || isLeft || isRight;
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
        if (element.textContent.trim()) {
          nodes.push(element);
        }
      }

      element = element.nextSibling as Element;
    }

    return nodes;
  }
  scramble(str: any, letters: boolean = false, paragraph: boolean = false) {
    var words = str.split(" ");

    function scramble(arr: any) {
      var len = arr.length;
      var swap;
      var i;

      while (len > 0) {
        i = Math.floor(Math.random() * len);
        len--;
        swap = arr[len];
        arr[len] = arr[i];
        arr[i] = swap;
      }
      return arr;
    }

    if (letters) {
      words = words.map(function (word: any) {
        return scramble(word.split("")).join("");
      });
    }
    return paragraph ? scramble(words).join(" ") : words.join(" ");
  }
}
