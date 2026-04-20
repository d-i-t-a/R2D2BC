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

import { ReaderModule, HostType, RightsKey } from "../ReaderModule";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { EpubModuleHost } from "../ModuleHost";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import debounce from "debounce";
import { delay } from "../../utils";
import { addListener, launch } from "devtools-detector";
import log from "loglevel";
import { getCurrentSelectionInfo } from "../highlight/renderer/iframe/selection";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import { _blacklistIdClassForCssSelectors } from "../highlight/TextHighlighter";
import { getUserAgentRegex } from "browserslist-useragent-regexp";

export interface ContentProtectionModuleProperties {
  enforceSupportedBrowsers: boolean;
  enableEncryption: boolean;
  enableObfuscation: boolean;
  disablePrint: boolean;
  disableCopy: boolean;
  canCopy: boolean;
  charactersToCopy: number;
  detectInspect: boolean;
  clearOnInspect: boolean;
  detectInspectInitDelay: number;
  disableKeys: boolean;
  disableContextMenu: boolean;
  hideTargetUrl: boolean;
  disableDrag: boolean;
  supportedBrowsers: string[];
  excludeNodes: string[];
}

export interface ContentProtectionModuleConfig extends Partial<ContentProtectionModuleProperties> {
  api?: ContentProtectionModuleAPI;
}

export interface ContentProtectionModuleAPI {
  inspectDetected: () => void;
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

export class ContentProtectionModule implements ReaderModule<EpubModuleHost> {
  readonly name = NavigatorFeature.ContentProtection;
  readonly hostType = HostType.Epub;
  readonly rightsKey = RightsKey.ContentProtection;
  private rects: Array<ContentProtectionRect>;
  private host!: EpubModuleHost;
  attach(host: EpubModuleHost): void {
    this.host = host;
  }
  properties?: ContentProtectionModuleProperties;
  private hasEventListener: boolean = false;
  private isHacked: boolean = false;
  private securityContainer: HTMLDivElement;
  private mutationObserver: MutationObserver;
  private wrapper: HTMLDivElement;
  citation: boolean;
  public static async setupPreloadProtection(
    config: Partial<ContentProtectionModuleConfig>
  ): Promise<void> {
    if (this.isCurrentBrowserSupported(config)) {
      if (config.detectInspect) {
        await this.startInspectorProtection(config);
      }
    } else {
      throw new Error("Browser not supported");
    }
  }

  public static async create(config: ContentProtectionModuleConfig) {
    const security = new this(config as ContentProtectionModuleProperties);
    await security.start();
    return security;
  }

  public constructor(properties?: ContentProtectionModuleProperties) {
    this.properties = properties;
  }

  private static async startInspectorProtection(
    config: Partial<ContentProtectionModuleConfig>
  ): Promise<void> {
    const onInspectorOpened = (isOpen): void => {
      if (isOpen) {
        if (config.clearOnInspect) {
          console.clear();
          window.localStorage.clear();
          window.sessionStorage.clear();
          window.location.replace(window.location.origin);
        }
        if (
          config.detectInspect &&
          typeof config.api?.inspectDetected === "function"
        ) {
          config.api.inspectDetected();
        }
      }
    };
    addListener(onInspectorOpened);
    launch();
    await delay(config.detectInspectInitDelay ?? 100);
  }

  private static isCurrentBrowserSupported(
    config: Partial<ContentProtectionModuleConfig>
  ): boolean {
    if (!config.enforceSupportedBrowsers) {
      return true;
    }
    let browsers: string[] = [];

    (config.supportedBrowsers ?? []).forEach((browser: string) => {
      browsers.push("last 1 " + browser + " version");
    });

    const supportedBrowsers = getUserAgentRegex({
      browsers: browsers,
      allowHigherVersions: true,
    });
    return supportedBrowsers.test(navigator.userAgent);
  }

  protected async start(): Promise<void> {
    if (this.properties?.enableObfuscation) {
      this.wrapper = HTMLUtilities.findRequiredElement(
        document,
        "#iframe-wrapper"
      );

      this.securityContainer = HTMLUtilities.findElement(
        document,
        "#container-view-security"
      );

      var self = this;

      // create an observer instance
      this.mutationObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          log.log(mutation.type);
          self.isHacked = true;
        });
      });
    }
  }

  async stop() {
    log.log("Protection module stop");
    if (this.properties?.enableObfuscation) {
      this.mutationObserver.disconnect();
    }
    if (this.properties?.disableKeys) {
      removeEventListenerOptional(
        this.host.mainElement,
        "keydown",
        this.disableSave
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "keydown",
        this.disableSave
      );
      for (const iframe of this.host.iframes) {
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
        this.host.mainElement,
        "copy",
        this.preventCopy
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "copy",
        this.preventCopy
      );
      for (const iframe of this.host.iframes) {
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
        this.host.mainElement,
        "cut",
        this.preventCopy
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "cut",
        this.preventCopy
      );
      for (const iframe of this.host.iframes) {
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
      removeEventListenerOptional(
        this.host.mainElement,
        "keydown",
        this.preventCopyKey
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "keydown",
        this.preventCopyKey
      );
      for (const iframe of this.host.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.preventCopyKey
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "keydown",
          this.preventCopyKey
        );
      }
      removeEventListenerOptional(window, "keydown", this.preventCopyKey);
      removeEventListenerOptional(document, "keydown", this.preventCopyKey);
    } else if (this.properties?.canCopy) {
      removeEventListenerOptional(
        this.host.mainElement,
        "copy",
        this.restrictCopy
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "copy",
        this.restrictCopy
      );
      for (const iframe of this.host.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "copy",
          this.restrictCopy
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "copy",
          this.restrictCopy
        );
      }

      removeEventListenerOptional(window, "copy", this.restrictCopy);
      removeEventListenerOptional(document, "copy", this.restrictCopy);
      removeEventListenerOptional(
        this.host.mainElement,
        "cut",
        this.restrictCopy
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "cut",
        this.restrictCopy
      );
      for (const iframe of this.host.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "cut",
          this.restrictCopy
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "cut",
          this.restrictCopy
        );
      }
      removeEventListenerOptional(window, "cut", this.restrictCopy);
      removeEventListenerOptional(document, "cut", this.restrictCopy);
      removeEventListenerOptional(
        this.host.mainElement,
        "keydown",
        this.restrictCopyKey
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "keydown",
        this.restrictCopyKey
      );
      for (const iframe of this.host.iframes) {
        removeEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.restrictCopyKey
        );
        removeEventListenerOptional(
          iframe.contentWindow,
          "keydown",
          this.restrictCopyKey
        );
      }
      removeEventListenerOptional(window, "keydown", this.restrictCopyKey);
      removeEventListenerOptional(document, "keydown", this.restrictCopyKey);
    }
    if (this.properties?.disablePrint) {
      removeEventListenerOptional(
        this.host.mainElement,
        "beforeprint",
        this.beforePrint.bind(this)
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "beforeprint",
        this.beforePrint.bind(this)
      );
      for (const iframe of this.host.iframes) {
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
        this.host.mainElement,
        "afterprint",
        this.afterPrint.bind(this)
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "afterprint",
        this.afterPrint.bind(this)
      );
      for (const iframe of this.host.iframes) {
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
        this.host.mainElement,
        "contextmenu",
        this.disableContext
      );
      removeEventListenerOptional(
        this.host.headerMenu,
        "contextmenu",
        this.disableContext
      );
      for (const iframe of this.host.iframes) {
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

    removeEventListenerOptional(
      this.wrapper,
      "scroll",
      this.handleScroll.bind(this)
    );
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
      for (const iframe of this.host.iframes) {
        if (iframe.contentDocument) {
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
  }
  private setupEvents(): void {
    if (this.properties?.disableKeys) {
      addEventListenerOptional(
        this.host.mainElement,
        "keydown",
        this.disableSave
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "keydown",
        this.disableSave
      );
      for (const iframe of this.host.iframes) {
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
          iframe.contentWindow?.document,
          "keydown",
          this.disableSave
        );
      }
      addEventListenerOptional(window, "keydown", this.disableSave);
      addEventListenerOptional(document, "keydown", this.disableSave);
    }
    if (this.properties?.disableCopy) {
      addEventListenerOptional(this.host.mainElement, "copy", this.preventCopy);
      addEventListenerOptional(this.host.headerMenu, "copy", this.preventCopy);
      for (const iframe of this.host.iframes) {
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
          iframe.contentWindow?.document,
          "copy",
          this.preventCopy
        );
      }
      addEventListenerOptional(window, "copy", this.preventCopy);
      addEventListenerOptional(document, "copy", this.preventCopy);

      addEventListenerOptional(this.host.mainElement, "cut", this.preventCopy);
      addEventListenerOptional(this.host.headerMenu, "cut", this.preventCopy);
      for (const iframe of this.host.iframes) {
        addEventListenerOptional(iframe, "cut", this.preventCopy);
        addEventListenerOptional(iframe.ownerDocument, "cut", this.preventCopy);
        addEventListenerOptional(
          iframe.contentDocument,
          "cut",
          this.preventCopy
        );
        addEventListenerOptional(iframe.contentWindow, "cut", this.preventCopy);
        addEventListenerOptional(
          iframe.contentWindow?.document,
          "cut",
          this.preventCopy
        );
      }

      addEventListenerOptional(window, "cut", this.preventCopy);
      addEventListenerOptional(document, "cut", this.preventCopy);
      addEventListenerOptional(
        this.host.mainElement,
        "keydown",
        this.preventCopyKey
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "keydown",
        this.preventCopyKey
      );
      for (const iframe of this.host.iframes) {
        addEventListenerOptional(iframe, "keydown", this.preventCopyKey);
        addEventListenerOptional(
          iframe.ownerDocument,
          "keydown",
          this.preventCopyKey
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.preventCopyKey
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "keydown",
          this.preventCopyKey
        );
        addEventListenerOptional(
          iframe.contentWindow?.document,
          "keydown",
          this.preventCopyKey
        );
      }
      addEventListenerOptional(window, "keydown", this.preventCopyKey);
      addEventListenerOptional(document, "keydown", this.preventCopyKey);
    } else if (this.properties?.canCopy) {
      addEventListenerOptional(
        this.host.mainElement,
        "copy",
        this.restrictCopy.bind(this)
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "copy",
        this.restrictCopy.bind(this)
      );
      for (const iframe of this.host.iframes) {
        addEventListenerOptional(iframe, "copy", this.restrictCopy);
        addEventListenerOptional(
          iframe.ownerDocument,
          "copy",
          this.restrictCopy.bind(this)
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "copy",
          this.restrictCopy.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "copy",
          this.restrictCopy.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow?.document,
          "copy",
          this.restrictCopy.bind(this)
        );
      }
      addEventListenerOptional(window, "copy", this.restrictCopy.bind(this));
      addEventListenerOptional(document, "copy", this.restrictCopy.bind(this));

      addEventListenerOptional(
        this.host.mainElement,
        "cut",
        this.restrictCopy.bind(this)
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "cut",
        this.restrictCopy.bind(this)
      );
      for (const iframe of this.host.iframes) {
        addEventListenerOptional(iframe, "cut", this.restrictCopy.bind(this));
        addEventListenerOptional(
          iframe.ownerDocument,
          "cut",
          this.restrictCopy.bind(this)
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "cut",
          this.restrictCopy.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "cut",
          this.restrictCopy.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow?.document,
          "cut",
          this.restrictCopy.bind(this)
        );
      }

      addEventListenerOptional(window, "cut", this.restrictCopy.bind(this));
      addEventListenerOptional(document, "cut", this.restrictCopy.bind(this));
      addEventListenerOptional(
        this.host.mainElement,
        "keydown",
        this.restrictCopyKey.bind(this)
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "keydown",
        this.restrictCopyKey.bind(this)
      );
      for (const iframe of this.host.iframes) {
        addEventListenerOptional(
          iframe,
          "keydown",
          this.restrictCopyKey.bind(this)
        );
        addEventListenerOptional(
          iframe.ownerDocument,
          "keydown",
          this.restrictCopyKey.bind(this)
        );
        addEventListenerOptional(
          iframe.contentDocument,
          "keydown",
          this.restrictCopyKey.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow,
          "keydown",
          this.restrictCopyKey.bind(this)
        );
        addEventListenerOptional(
          iframe.contentWindow?.document,
          "keydown",
          this.restrictCopyKey.bind(this)
        );
      }
      addEventListenerOptional(
        window,
        "keydown",
        this.restrictCopyKey.bind(this)
      );
      addEventListenerOptional(
        document,
        "keydown",
        this.restrictCopyKey.bind(this)
      );
    }
    if (this.properties?.disablePrint) {
      addEventListenerOptional(
        this.host.mainElement,
        "beforeprint",
        this.beforePrint
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "beforeprint",
        this.beforePrint
      );
      for (const iframe of this.host.iframes) {
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
          iframe.contentWindow?.document,
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
        this.host.mainElement,
        "afterprint",
        this.afterPrint
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "afterprint",
        this.afterPrint
      );
      for (const iframe of this.host.iframes) {
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
          iframe.contentWindow?.document,
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
        this.host.mainElement,
        "contextmenu",
        this.disableContext
      );
      addEventListenerOptional(
        this.host.headerMenu,
        "contextmenu",
        this.disableContext
      );
      for (const iframe of this.host.iframes) {
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
          iframe.contentWindow?.document,
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

  public async initialize(iframe: HTMLIFrameElement) {
    if (this.properties?.enableObfuscation) {
      return new Promise<void>(async (resolve) => {
        await (document as any).fonts.ready;
        if (iframe.contentDocument) {
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
                this.wrapper,
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
  async handleResize() {
    if (this.properties?.enableObfuscation) {
      const onDoResize = debounce(() => {
        this.calcRects(this.rects);
        if (this.rects !== undefined) {
          this.rects.forEach((rect) =>
            this.toggleRect(rect, this.securityContainer, this.isHacked)
          );
        }
      }, 50);
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
    log.log("copy action initiated");
    event.clipboardData.setData("text/plain", "copy not allowed");
    event.stopPropagation();
    event.preventDefault();
    return false;
  }
  preventCopyKey(event: {
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
        : event.ctrlKey && (event.key === "c" || event.keyCode === 67)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    return true;
  }

  restrictCopy(event: {
    clipboardData: {
      getData: (arg0: string) => any;
      setData: (arg0: string, arg1: any) => void;
    };
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (this.citation) {
      return;
    }
    log.log("copy action initiated");
    let win = this.host.iframes[0].contentWindow;
    if (win) {
      let self = this;
      function getCssSelector(element: Element): string | undefined {
        const options = {
          className: (str: string) => {
            return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
          },
          idName: (str: string) => {
            return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
          },
        };
        let doc = self.host.iframes[0].contentDocument;
        if (doc) {
          return uniqueCssSelector(element, doc, options);
        } else {
          return undefined;
        }
      }
      let selectionInfo = getCurrentSelectionInfo(win, getCssSelector);
      if (selectionInfo === undefined) {
        let doc = this.host.iframes[0].contentDocument;
        selectionInfo =
          (
            this.host.getModule(NavigatorFeature.Annotations) as
              | import("./AnnotationModule").AnnotationModule
              | undefined
          )?.annotator?.getTemporarySelectionInfo(doc) ?? undefined;
      }

      event.clipboardData.setData(
        "text/plain",
        selectionInfo?.cleanText?.substring(
          0,
          this.properties?.charactersToCopy ?? 0
        )
      );
    } else {
      event.clipboardData.setData("text/plain", "");
    }

    event.stopPropagation();
    event.preventDefault();
    return false;
  }
  restrictCopyKey(event) {
    if (
      navigator.platform === "MacIntel" || navigator.platform.match("Mac")
        ? event.metaKey
        : event.ctrlKey && (event.key === "c" || event.keyCode === 67)
    ) {
      let win = this.host.iframes[0].contentWindow;
      if (win) {
        let self = this;
        function getCssSelector(element: Element): string | undefined {
          const options = {
            className: (str: string) => {
              return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
            },
            idName: (str: string) => {
              return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
            },
          };
          let doc = self.host.iframes[0].contentDocument;
          if (doc) {
            return uniqueCssSelector(element, doc, options);
          } else {
            return undefined;
          }
        }
        let selectionInfo = getCurrentSelectionInfo(win, getCssSelector);
        if (selectionInfo === undefined) {
          let doc = this.host.iframes[0].contentDocument;
          selectionInfo =
            (
              this.host.getModule(NavigatorFeature.Annotations) as
                | import("./AnnotationModule").AnnotationModule
                | undefined
            )?.annotator?.getTemporarySelectionInfo(doc) ?? undefined;
        }
        this.copyToClipboard(
          selectionInfo?.cleanText?.substring(
            0,
            this.properties?.charactersToCopy ?? 0
          )
        );
        // event.clipboardData.setData(
        //   "text/plain",
        //   selectionInfo?.cleanText?.substring(
        //     0,
        //     this.properties?.charactersToCopy ?? 0
        //   )
        // );
      } else {
        this.copyToClipboard("");

        // event.clipboardData.setData("text/plain", "");
      }

      event.stopPropagation();
      event.preventDefault();
      return false;
    }
    return true;
  }
  copyToClipboard(textToClipboard: string | undefined) {
    textToClipboard = textToClipboard?.substring(
      0,
      this.properties?.charactersToCopy ?? 0
    );
    if (!textToClipboard) return;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textToClipboard).catch(() => {
        this.execCommandCopy(textToClipboard!);
      });
    } else {
      this.execCommandCopy(textToClipboard);
    }
  }

  private execCommandCopy(text: string) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-10000px";
    el.style.top = "-10000px";
    el.textContent = text;
    el.contentEditable = "true";
    document.body.appendChild(el);

    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    try {
      document.execCommand("copy", false);
    } catch (e) {
      // fallback failed silently
    }
    document.body.removeChild(el);
  }
  beforePrint(event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    log.log("before print");

    if (this.host && this.host.headerMenu) {
      this.host.headerMenu.style.display = "none";
      this.host.mainElement.style.display = "none";
    }

    event.stopPropagation();
    event.preventDefault();
    return false;
  }
  afterPrint(event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    log.log("after print");

    if (this.host && this.host.headerMenu) {
      this.host.headerMenu.style.removeProperty("display");
      this.host.mainElement.style.removeProperty("display");
    }

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
    for (const iframe of this.host.iframes) {
      const aElements = iframe.contentDocument?.querySelectorAll("a");

      aElements?.forEach((aElement) => {
        const dataHref = aElement.getAttribute("data-href");
        const href = aElement.getAttribute("href");
        if (!dataHref && href) {
          aElement.setAttribute("data-href", href);
          aElement.setAttribute("data-href-resolved", aElement.href);
        }
      });

      if (activate) {
        aElements?.forEach((aElement) => {
          aElement.setAttribute("href", "");
          aElement.addEventListener("click", onAElementClick);
        });
      } else {
        aElements?.forEach((aElement) => {
          const dataHref = aElement.getAttribute("data-href");
          if (dataHref) {
            aElement.setAttribute("href", dataHref);
          }
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
    for (const iframe of this.host.iframes) {
      const bodyStyle =
        iframe.contentDocument?.body.getAttribute("style") || "";

      if (activate) {
        iframe.contentDocument?.body.addEventListener("dragstart", onDragstart);
        iframe.contentDocument?.body.setAttribute(
          "style",
          bodyStyle + dragStyle
        );
      } else {
        iframe.contentDocument?.body.removeEventListener(
          "dragstart",
          onDragstart
        );
        iframe.contentDocument?.body.setAttribute(
          "style",
          bodyStyle.replace(dragStyle, "")
        );
      }
    }
  }

  recalculate(delay: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.properties?.enableObfuscation) {
        const onDoResize = debounce(() => {
          this.calcRects(this.rects);
          if (this.rects !== undefined) {
            this.rects.forEach((rect) =>
              this.toggleRect(rect, this.securityContainer, this.isHacked)
            );
          }
          resolve(true);
        }, delay);
        if (this.rects) {
          this.observe();
          onDoResize();
        } else {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
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
          log.log("error " + error);
          log.log(rect);
          log.log(rect.node);
          log.log("scrambledTextContent " + rect.scrambledTextContent);
          log.log("textContent " + rect.textContent);
          log.log("isObfuscated " + rect.isObfuscated);
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
        node.parentElement &&
        ((this.properties?.excludeNodes &&
          this.properties?.excludeNodes.indexOf(
            node.parentElement.nodeName.toLowerCase()
          ) > -1) ||
          node.parentElement?.nodeName.toLowerCase() === "option" ||
          node.parentElement?.nodeName.toLowerCase() === "script")
          ? node.textContent
          : this.obfuscateText(node.textContent ?? "");
      let rect: ContentProtectionRect = {
        top: top,
        height: height,
        width: width,
        left: left,
        node: node,
        textContent: node.textContent ?? "",
        scrambledTextContent: scrambled ?? "",
        isObfuscated: false,
      };
      return rect;
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
      log.log("measureTextNode " + error);
      log.log("measureTextNode " + node);
      log.log(node.textContent);
    }
  }

  isBeingHacked(element: HTMLElement): boolean {
    if (
      element.style.animation ||
      element.style.transition ||
      element.style.position ||
      element.hasAttribute("style")
    ) {
      log.log("content being hacked");
      return true;
    }
    return false;
  }

  isOutsideViewport(rect: ContentProtectionRect): boolean {
    const windowLeft = this.wrapper.scrollLeft;
    const windowRight = windowLeft + this.wrapper.clientWidth;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const windowTop =
      this.wrapper.scrollTop -
      (rect.node.parentElement
        ? parseInt(
            getComputedStyle(rect.node.parentElement).lineHeight.replace(
              "px",
              ""
            )
          )
        : 10);
    const windowBottom =
      windowTop +
      this.wrapper.clientHeight +
      (rect.node.parentElement
        ? parseInt(
            getComputedStyle(rect.node.parentElement).lineHeight.replace(
              "px",
              ""
            )
          )
        : 10);

    const isAbove = bottom < windowTop;
    const isBelow = rect.top > windowBottom;

    // Consider left boundary to be one full screen width left of the leftmost
    // edge of the viewing area. This is so text originating on the previous
    // screen does not flow onto the current screen scrambled.
    const isLeft = right < windowLeft - window.innerWidth;

    // Consider right boundary to be one full screen width right of the rightmost
    // edge of the viewing area. This is so quickly paging through the book
    // does not result in visible page descrambling.
    const isRight = rect.left > windowRight + window.innerWidth;

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
        if (element.textContent?.trim()) {
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
        return word.includes("-") ? word : scramble(word.split("")).join("");
      });
    }
    return paragraph ? scramble(words).join(" ") : words.join(" ");
  }
}
