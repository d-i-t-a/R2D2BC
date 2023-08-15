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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { SHA256 } from "jscrypto/es6/SHA256";
import { debounce } from "debounce";

import { IEventPayload_R2_EVENT_HIGHLIGHT_CLICK } from "./common/events";
import {
  HighlightType,
  IColor,
  IHighlight,
  IMarkerIcon,
  IPopupStyle,
  IStyle,
  IStyleProperty,
  SelectionMenuItem,
} from "./common/highlight";
import { ISelectionInfo } from "./common/selection";
import { getClientRectsNoOverlap, IRectSimple } from "./common/rect-utils";
import {
  convertRangeInfo,
  getCurrentSelectionInfo,
} from "./renderer/iframe/selection";
import { uniqueCssSelector } from "./renderer/common/cssselector2";
import { Annotation, AnnotationMarker } from "../../model/Locator";
import { icons, iconTemplateColored } from "../../utils/IconLib";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { TTSModule2 } from "../TTS/TTSModule2";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import * as lodash from "lodash";
import { LayerSettings } from "./LayerSettings";
import { Switchable } from "../../model/user-settings/UserProperties";
import { Popup } from "../search/Popup";
import log from "loglevel";

export enum HighlightContainer {
  R2_ID_HIGHLIGHTS_CONTAINER = "R2_ID_HIGHLIGHTS_CONTAINER",
  R2_ID_BOOKMAKRS_CONTAINER = "R2_ID_BOOKMAKRS_CONTAINER",
  R2_ID_READALOUD_CONTAINER = "R2_ID_READALOUD_CONTAINER",
  R2_ID_PAGEBREAK_CONTAINER = "R2_ID_PAGEBREAK_CONTAINER",
  R2_ID_SEARCH_CONTAINER = "R2_ID_SEARCH_CONTAINER",
  R2_ID_DEFINITIONS_CONTAINER = "R2_ID_DEFINITIONS_CONTAINER",
  R2_ID_LINEFOCUS_CONTAINER = "R2_ID_LINEFOCUS_CONTAINER",
  R2_ID_GUTTER_RIGHT_CONTAINER = "R2_ID_GUTTER_RIGHT_CONTAINER",
}

export const CLASS_HIGHLIGHT_CONTAINER = "R2_CLASS_HIGHLIGHT_CONTAINER";
export const CLASS_HIGHLIGHT_BOUNDING_AREA = "R2_CLASS_HIGHLIGHT_BOUNDING_AREA";
export const CLASS_HIGHLIGHT_AREA = "R2_CLASS_HIGHLIGHT_AREA";
export const CLASS_HIGHLIGHT_ICON = "R2_CLASS_HIGHLIGHT_ICON";

const DEFAULT_BACKGROUND_COLOR_OPACITY = 0.5;
const ALT_BACKGROUND_COLOR_OPACITY = 0.75;
export const DEFAULT_BACKGROUND_COLOR = {
  blue: 100,
  green: 50,
  red: 230,
};
export interface TextSelectorAPI {
  selectionMenuOpen: any;
  selectionMenuClose: any;
  selection: any;
}

export const _highlights: IHighlight[] = [];

interface IWithRect {
  rect: IRectSimple;
  scale: number;
}
export interface IHTMLDivElementWithRect extends HTMLDivElement, IWithRect {}

export interface HTMLElementRect {
  node: Element;
  height: number;
  top: number;
  width: number;
  left: number;
  textContent: string;
}

/**
 * Attribute added by default to every highlight.
 * @type {string}
 */
let DATA_ATTR: string = "data-highlighted";

/**
 * Attribute used to group highlight wrappers.
 * @type {string}
 */
let TIMESTAMP_ATTR: string = "data-timestamp";

let NODE_TYPE = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
};

export enum MenuPosition {
  INLINE = "inline",
  TOP = "top",
  BOTTOM = "bottom",
}

export const _blacklistIdClassForCssSelectors = [
  HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER,
  HighlightContainer.R2_ID_PAGEBREAK_CONTAINER,
  HighlightContainer.R2_ID_SEARCH_CONTAINER,
  HighlightContainer.R2_ID_READALOUD_CONTAINER,
  HighlightContainer.R2_ID_BOOKMAKRS_CONTAINER,
  HighlightContainer.R2_ID_DEFINITIONS_CONTAINER,
  HighlightContainer.R2_ID_LINEFOCUS_CONTAINER,
  HighlightContainer.R2_ID_GUTTER_RIGHT_CONTAINER,
  CLASS_HIGHLIGHT_CONTAINER,
  CLASS_HIGHLIGHT_AREA,
  CLASS_HIGHLIGHT_BOUNDING_AREA,
];

let lastMouseDownX = -1;
let lastMouseDownY = -1;

export interface TextHighlighterProperties {
  selectionMenuItems?: Array<SelectionMenuItem>;
  menuPosition?: MenuPosition;
}

export interface TextHighlighterConfig extends TextHighlighterProperties {
  api?: TextSelectorAPI;
  layerSettings: LayerSettings;
}

export class TextHighlighter {
  private options: any;
  navigator: IFrameNavigator;
  layerSettings: LayerSettings;
  private lastSelectedHighlight?: number = undefined;
  properties: TextHighlighterProperties;
  private api?: TextSelectorAPI;
  private hasEventListener: boolean;
  activeAnnotationMarkerId?: string = undefined;

  public static async create(config: TextHighlighterConfig): Promise<any> {
    const module = new this(
      config.layerSettings,
      config as TextHighlighterProperties,
      false,
      {},
      config.api
    );
    return new Promise((resolve) => resolve(module));
  }

  private constructor(
    layerSettings: LayerSettings,
    properties: TextHighlighterProperties,
    hasEventListener: boolean,
    options: any,
    api?: TextSelectorAPI
  ) {
    this.layerSettings = layerSettings;
    this.properties = properties;
    if (this.properties.menuPosition == undefined) {
      this.properties.menuPosition = MenuPosition.INLINE;
    }
    this.api = api;
    this.hasEventListener = hasEventListener;
    this.options = this.defaults(options, {
      color: "#fce300",
      highlightedClass: "highlighted",
      contextClass: "highlighter-context",
      onBeforeHighlight: function () {
        return true;
      },
      onAfterHighlight: function () {},
    });
  }
  async initialize() {
    let doc = this.navigator.iframes[0].contentDocument;
    if (doc) {
      this.dom(doc.body).addClass(this.options.contextClass);
    }
    this.bindEvents(
      this.navigator.iframes[0].contentDocument?.body,
      this,
      this.hasEventListener
    );

    this.initializeToolbox();

    lastMouseDownX = -1;
    lastMouseDownY = -1;

    let self = this;
    async function unselect() {
      if (self.lastSelectedHighlight === undefined) {
        // self.delegate.api.highlightUnSelected().then(async () => {
        //     if (IS_DEV) {console.log("highlightUnSelected,  click on existing")}
        // })
      } else {
        self.lastSelectedHighlight = undefined;
      }
    }
    setTimeout(async () => {
      let doc = this.navigator.iframes[0].contentDocument;
      if (doc) {
        await doc.body?.addEventListener("click", unselect);
      }
    }, 100);
  }

  /**
   * Returns true if elements a i b have the same color.
   * @param {Node} a
   * @param {Node} b
   * @returns {boolean}
   */
  haveSameColor(a: any, b: any): boolean {
    return this.dom(a).color() === this.dom(b).color();
  }

  /**
   * Fills undefined values in obj with default properties with the same name from source object.
   * @param {object} obj - target object
   * @param {object} source - source object with default values
   * @returns {object}
   */
  defaults(
    obj: { [x: string]: any },
    source: {
      [x: string]: any;
      color?: string;
      highlightedClass?: string;
      contextClass?: string;
      onBeforeHighlight?: () => boolean;
      onAfterHighlight?: () => void;
      container?: any;
      andSelf?: boolean;
      grouped?: boolean;
      hasOwnProperty?: any;
    }
  ): object {
    obj = obj || {};

    for (let prop in source) {
      if (source.hasOwnProperty(prop) && obj[prop] === void 0) {
        obj[prop] = source[prop];
      }
    }

    return obj;
  }

  /**
   * Returns array without duplicated values.
   * @param {Array} arr
   * @returns {Array}
   */
  unique(arr: {
    filter: (arg0: (value: any, idx: any, self: any) => boolean) => void;
  }) {
    return arr.filter(function (value, idx, self) {
      return self.indexOf(value) === idx;
    });
  }

  /**
   * Takes range object as parameter and refines it boundaries
   * @param range
   * @returns {object} refined boundaries and initial state of highlighting algorithm.
   */
  refineRangeBoundaries(range: {
    startContainer: any;
    endContainer: any;
    commonAncestorContainer: any;
    endOffset: number;
    startOffset: number;
  }): object {
    let startContainer = range.startContainer,
      endContainer = range.endContainer,
      ancestor = range.commonAncestorContainer,
      goDeeper = true;

    if (range.endOffset === 0) {
      while (
        !endContainer.previousSibling &&
        endContainer.parentNode !== ancestor
      ) {
        endContainer = endContainer.parentNode;
      }
      endContainer = endContainer.previousSibling;
    } else if (endContainer.nodeType === NODE_TYPE.TEXT_NODE) {
      if (range.endOffset < endContainer.nodeValue.length) {
        endContainer.splitText(range.endOffset);
      }
    } else if (range.endOffset > 0) {
      endContainer = endContainer.childNodes.item(range.endOffset - 1);
    }

    if (startContainer.nodeType === NODE_TYPE.TEXT_NODE) {
      if (range.startOffset === startContainer.nodeValue.length) {
        goDeeper = false;
      } else if (range.startOffset > 0) {
        startContainer = startContainer.splitText(range.startOffset);
        if (endContainer === startContainer.previousSibling) {
          endContainer = startContainer;
        }
      }
    } else if (range.startOffset < startContainer.childNodes.length) {
      startContainer = startContainer.childNodes.item(range.startOffset);
    } else {
      startContainer = startContainer.nextSibling;
    }

    return {
      startContainer: startContainer,
      endContainer: endContainer,
      goDeeper: goDeeper,
    };
  }

  /**
   * Sorts array of DOM elements by its depth in DOM tree.
   * @param {HTMLElement[]} arr - array to sort.
   * @param {boolean} descending - order of sort.
   */
  sortByDepth(
    arr: { sort: (arg0: (a: any, b: any) => number) => void },
    descending: boolean
  ) {
    let self = this;
    arr.sort(function (a, b) {
      return (
        self.dom(descending ? b : a).parents().length -
        self.dom(descending ? a : b).parents().length
      );
    });
  }

  /**
   * Groups given highlights by timestamp.
   * @param {Array} highlights
   * @returns {Array} Grouped highlights.
   */
  groupHighlights(highlights: {
    forEach: (arg0: (hl: any) => void) => void;
  }): Array<any> {
    let order: any[] = [],
      chunks: any = {},
      grouped:
        | any
        | { chunks: any; timestamp: any; toString: () => any }[] = [];

    highlights.forEach(function (hl) {
      let timestamp = hl.getAttribute(TIMESTAMP_ATTR);

      if (typeof chunks[timestamp] === "undefined") {
        chunks[timestamp] = [];
        order.push(timestamp);
      }

      chunks[timestamp].push(hl);
    });

    order.forEach(function (timestamp) {
      let group = chunks[timestamp];

      grouped.push({
        chunks: group,
        timestamp: timestamp,
        toString: function () {
          return group
            .map(function (h: any) {
              return h.textContent;
            })
            .join("");
        },
      });
    });

    return grouped;
  }

  /**
   * Utility functions to make DOM manipulation easier.
   * @param {Node|HTMLElement} [el] - base DOM element to manipulate
   * @returns {object}
   */
  dom(el?: any): any {
    let self = this;

    return /** @lends dom **/ {
      /**
       * Adds class to element.
       * @param {string} className
       */
      addClass: function (className: string) {
        if (el.classList) {
          el.classList.add(className);
        } else {
          el.className += " " + className;
        }
      },

      /**
       * Removes class from element.
       * @param {string} className
       */
      removeClass: function (className: string) {
        if (el.classList) {
          el.classList.remove(className);
        } else {
          el.className = el.className.replace(
            new RegExp("(^|\\b)" + className + "(\\b|$)", "gi"),
            " "
          );
        }
      },

      /**
       * Prepends child nodes to base element.
       * @param {Node[]} nodesToPrepend
       */
      prepend: function (nodesToPrepend: Node[]) {
        let nodes = Array.prototype.slice.call(nodesToPrepend),
          i = nodes.length;

        while (i--) {
          el.insertBefore(nodes[i], el.firstChild);
        }
      },

      /**
       * Appends child nodes to base element.
       * @param {Node[]} nodesToAppend
       */
      append: function (nodesToAppend: Node[]) {
        let nodes = Array.prototype.slice.call(nodesToAppend);

        for (let i = 0, len = nodes.length; i < len; ++i) {
          el.appendChild(nodes[i]);
        }
      },

      /**
       * Inserts base element after refEl.
       * @param {Node} refEl - node after which base element will be inserted
       * @returns {Node} - inserted element
       */
      insertAfter: function (refEl: Node): Node {
        return refEl.parentNode?.insertBefore(el, refEl.nextSibling);
      },

      /**
       * Inserts base element before refEl.
       * @param {Node} refEl - node before which base element will be inserted
       * @returns {Node} - inserted element
       */
      insertBefore: function (refEl: Node): Node {
        return refEl.parentNode?.insertBefore(el, refEl);
      },

      /**
       * Removes base element from DOM.
       */
      remove: function () {
        el.parentNode.removeChild(el);
        el = null;
      },

      /**
       * Returns true if base element contains given child.
       * @param {Node|HTMLElement} child
       * @returns {boolean}
       */
      contains: function (child: Node | HTMLElement): boolean {
        return el !== child && el.contains(child);
      },

      /**
       * Wraps base element in wrapper element.
       * @param {HTMLElement} wrapper
       * @returns {HTMLElement} wrapper element
       */
      wrap: function (wrapper: any) {
        if (el.parentNode) {
          el.parentNode.insertBefore(wrapper, el);
        }

        wrapper.appendChild(el);
        return wrapper;
      },

      /**
       * Unwraps base element.
       * @returns {Node[]} - child nodes of unwrapped element.
       */
      unwrap: function (): Node[] {
        let nodes = Array.prototype.slice.call(el.childNodes),
          wrapper;

        nodes.forEach(function (node: any) {
          wrapper = node.parentNode;
          self.dom(node).insertBefore(node.parentNode);
          self.dom(wrapper).remove();
        });

        return nodes;
      },

      /**
       * Returns array of base element parents.
       * @returns {HTMLElement[]}
       */
      parents: function (): HTMLElement[] {
        let parent,
          path: HTMLElement[] = [];

        while (!!(parent = el.parentNode)) {
          path.push(parent);
          el = parent;
        }

        return path;
      },

      /**
       * Normalizes text nodes within base element, ie. merges sibling text nodes and assures that every
       * element node has only one text node.
       * It should does the same as standard element.normalize, but IE implements it incorrectly.
       */
      normalizeTextNodes: function () {
        if (!el) {
          return;
        }

        if (el.nodeType === NODE_TYPE.TEXT_NODE) {
          while (
            el.nextSibling &&
            el.nextSibling.nodeType === NODE_TYPE.TEXT_NODE
          ) {
            el.nodeValue += el.nextSibling.nodeValue;
            el.parentNode.removeChild(el.nextSibling);
          }
        } else {
          self.dom(el.firstChild).normalizeTextNodes();
        }
        self.dom(el.nextSibling).normalizeTextNodes();
      },

      /**
       * Returns element background color.
       * @returns {CSSStyleDeclaration.backgroundColor}
       */
      color: function (): any {
        return el.style.backgroundColor;
      },

      /**
       * Creates dom element from given html string.
       * @param {string} html
       * @returns {NodeList}
       */
      fromHTML: function (html: string): NodeList {
        let div = document.createElement("div");
        div.innerHTML = html;
        return div.childNodes;
      },

      /**
       * Returns first range of the window of base element.
       * @returns {Range}
       */
      getRange: function (): Range {
        let selection = self.dom(el)?.getSelection(),
          range;

        if (selection?.rangeCount > 0) {
          range = selection?.getRangeAt(0);
        }

        return range;
      },

      /**
       * Removes all ranges of the window of base element.
       */
      removeAllRanges: function () {
        let selection = self.dom(el)?.getSelection();
        selection?.removeAllRanges();
        self.toolboxHide();
      },

      /**
       * Returns selection object of the window of base element.
       * @returns {Selection}
       */
      getSelection: function (): Selection {
        return self.dom(el).getWindow()?.getSelection();
      },

      /**
       * Returns window of the base element.
       * @returns {Window}
       */
      getWindow: function (): Window {
        return self.dom(el).getDocument()?.defaultView;
      },

      /**
       * Returns document of the base element.
       * @returns {HTMLDocument}
       */
      getDocument: function (): HTMLDocument {
        // if ownerDocument is null then el is the document itself.
        return el?.ownerDocument || el;
      },
    };
  }

  disableContext(e: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  bindEvents(el: any, _scope: any, hasEventListener: boolean) {
    let doc = el.ownerDocument;

    el.addEventListener("mouseup", this.toolboxShowDelayed.bind(this));
    el.addEventListener("touchend", this.toolboxShowDelayed.bind(this));
    doc.addEventListener("mouseup", this.toolboxShowDelayed.bind(this));
    doc.addEventListener("touchend", this.toolboxShowDelayed.bind(this));
    // doc.addEventListener("selectstart", this.toolboxShowDelayed.bind(this));

    if (!hasEventListener) {
      window.addEventListener("resize", this.toolboxPlacement.bind(this));
    }
    doc.addEventListener("selectionchange", this.toolboxPlacement.bind(this));
    doc.addEventListener("selectionchange", this.toolboxShowDelayed.bind(this));

    el.addEventListener("mousedown", this.toolboxHide.bind(this));
    el.addEventListener("touchstart", this.toolboxHide.bind(this));

    if (this.isAndroid()) {
      el.addEventListener("contextmenu", this.disableContext);
    }

    el.addEventListener("mousedown", this.mousedown.bind(this));
    el.addEventListener("mouseup", this.mouseup.bind(this));
    el.addEventListener("mousemove", this.mousemove.bind(this));

    el.addEventListener("touchstart", this.mousedown.bind(this));
    el.addEventListener("touchend", this.mouseup.bind(this));
    el.addEventListener("touchmove", this.mousemove.bind(this));

    this.hasEventListener = true;
  }
  async mousedown(ev: MouseEvent) {
    lastMouseDownX = ev.clientX;
    lastMouseDownY = ev.clientY;
  }

  async mouseup(ev: MouseEvent) {
    if (
      Math.abs(lastMouseDownX - ev.clientX) < 3 &&
      Math.abs(lastMouseDownY - ev.clientY) < 3
    ) {
      await this.processMouseEvent(ev);
    }
  }

  async mousemove(ev: MouseEvent) {
    await this.processMouseEvent(ev);
  }

  unbindEvents(el: any, _scope: any) {
    let doc = el.ownerDocument;

    el.removeEventListener("mouseup", this.toolboxShowDelayed.bind(this));
    el.removeEventListener("touchend", this.toolboxShowDelayed.bind(this));
    doc.removeEventListener("mouseup", this.toolboxShowDelayed.bind(this));
    doc.removeEventListener("touchend", this.toolboxShowDelayed.bind(this));
    // doc.removeEventListener("selectstart", this.toolboxShowDelayed.bind(this));

    window.removeEventListener("resize", this.toolboxPlacement.bind(this));
    doc.removeEventListener(
      "selectionchange",
      this.toolboxPlacement.bind(this)
    );

    el.removeEventListener("mousedown", this.toolboxHide.bind(this));
    el.removeEventListener("touchstart", this.toolboxHide.bind(this));

    if (this.isAndroid()) {
      el.removeEventListener("contextmenu", this.disableContext);
    }

    el.removeEventListener("mousedown", this.mousedown.bind(this));
    el.removeEventListener("mouseup", this.mouseup.bind(this));
    el.removeEventListener("mousemove", this.mousemove.bind(this));

    el.removeEventListener("touchstart", this.mousedown.bind(this));
    el.removeEventListener("touchend", this.mouseup.bind(this));
    el.removeEventListener("touchmove", this.mousemove.bind(this));

    this.hasEventListener = false;
  }

  /**
   * Permanently disables highlighting.
   * Unbinds events and remove context element class.
   * @memberof TextHighlighter
   */
  destroy() {
    this.toolboxHide();
    let doc = this.navigator.iframes[0].contentDocument;
    if (doc) {
      this.unbindEvents(doc.body, this);
      this.dom(doc.body).removeClass(this.options.contextClass);
    }
  }

  initializeToolbox() {
    let toolboxColorsOptions = document.getElementById(
      "highlight-toolbox-mode-colors"
    );
    let toolboxOptions = document.getElementById("highlight-toolbox-mode-add");
    let colors = [
      "#fce300",
      "#48e200",
      "#00bae5",
      "#157cf9",
      "#6a39b7",
      "#ea426a",
      "#ff8500",
    ];
    let colorIcon = document.getElementById("colorIcon");
    let actionIcon = document.getElementById("actionIcon");
    let dismissIcon = document.getElementById("dismissIcon");
    let collapseIcon = document.getElementById("collapseIcon");
    let highlightIcon = document.getElementById("highlightIcon");

    let self = this;

    if (dismissIcon) {
      dismissIcon.innerHTML = icons.close;
      // Close toolbox color options
      dismissIcon.addEventListener("click", function () {
        self.toolboxMode("add");
      });
    }
    if (collapseIcon) {
      collapseIcon.innerHTML = icons.close;
      // Close toolbox color options
      collapseIcon.addEventListener("click", function () {
        self.toolboxMode("add");
      });
    }
    if (colorIcon) {
      colorIcon.style.position = "relative";
      colorIcon.style.zIndex = "20";

      colors.forEach((color) => {
        let colorButton = document.getElementById(color);
        let cButton = document.getElementById(`c${color}`);
        if (colorButton && toolboxColorsOptions?.contains(colorButton)) {
          toolboxColorsOptions.removeChild(colorButton);
        }
        if (toolboxOptions && cButton && toolboxOptions.contains(cButton)) {
          toolboxOptions.removeChild(cButton);
        }
      });

      const colorElements: HTMLButtonElement[] = [];
      const colorRainbow: HTMLButtonElement[] = [];

      // Open toolbox color options
      colorIcon.addEventListener("click", function () {
        self.toolboxMode("colors");
      });

      if (this.navigator.rights.enableAnnotations) {
        let index = 10;
        colors.forEach((color) => {
          index--;
          const colorButton = colorIcon?.cloneNode(true) as HTMLButtonElement;
          const colorButtonSymbol = colorButton.lastChild as HTMLElement;
          let c = TextHighlighter.hexToRgbChannels(color);
          colorButtonSymbol.style.backgroundColor =
            "rgba(" + [c.red, c.green, c.blue].join(",") + ",.5)";

          colorButton.id = `c${color}`;
          colorButton.style.display = "unset";
          colorButton.style.position = "relative";
          colorButton.style.zIndex = `${index}`;
          colorButton.style.marginLeft = `-30px`;
          colorRainbow.push(colorButton);
          toolboxOptions?.insertBefore(colorButton, highlightIcon);
        });
      }

      // Generate color options
      colors.forEach((color) => {
        const colorButton = colorIcon?.cloneNode(true) as HTMLButtonElement;
        const colorButtonSymbol = colorButton.lastChild as HTMLElement;
        colorButtonSymbol.style.backgroundColor = color;
        colorButton.id = color;
        colorButton.style.position = "relative";
        colorButton.style.display = "unset";
        colorElements.push(colorButton);

        // Set color and close color options
        if (colorIcon) {
          colorButton.addEventListener("click", function () {
            self.setColor(color);
            let colorIconSymbol = colorIcon?.lastChild as HTMLElement;
            if (colorIconSymbol) {
              colorIconSymbol.style.backgroundColor = color;
            }
            const highlightIcon = document.getElementById("highlightIcon");
            const underlineIcon = document.getElementById("underlineIcon");
            const noteIcon = document.getElementById("noteIcon");
            if (
              (highlightIcon?.getElementsByTagName?.("span").length ?? 0) > 0
            ) {
              (highlightIcon?.getElementsByTagName(
                "span"
              )[0] as HTMLSpanElement).style.background = self.getColor();
            }
            if (
              (underlineIcon?.getElementsByTagName?.("span").length ?? 0) > 0
            ) {
              (underlineIcon?.getElementsByTagName(
                "span"
              )[0] as HTMLSpanElement).style.borderBottomColor = self.getColor();
            }
            if ((noteIcon?.getElementsByTagName?.("span").length ?? 0) > 0) {
              (noteIcon?.getElementsByTagName(
                "span"
              )[0] as HTMLSpanElement).style.borderBottomColor = self.getColor();
            }

            self.toolboxMode("add");
          });
        }

        toolboxColorsOptions?.insertBefore(colorButton, dismissIcon);
      });
    }
    if (actionIcon) {
      // Open toolbox color options
      actionIcon.addEventListener("click", function () {
        self.toolboxMode("action");
      });
    }

    // Hide color options by default
    self.toolboxMode("add");
  }

  toolboxMode(mode: "colors" | "edit" | "add" | "action") {
    let toolboxColorsOptions = document.getElementById(
      "highlight-toolbox-mode-colors"
    );
    let toolboxAddOptions = document.getElementById(
      "highlight-toolbox-mode-add"
    );
    let toolboxEditOptions = document.getElementById(
      "highlight-toolbox-mode-edit"
    );
    let toolboxMarkOptions = document.getElementById(
      "highlight-toolbox-mode-action"
    );

    switch (mode) {
      case "colors":
        if (toolboxColorsOptions) toolboxColorsOptions.style.display = "unset";
        if (toolboxAddOptions) toolboxAddOptions.style.display = "none";
        if (toolboxEditOptions) toolboxEditOptions.style.display = "none";
        if (toolboxMarkOptions) toolboxMarkOptions.style.display = "none";
        break;
      case "edit":
        if (toolboxColorsOptions) toolboxColorsOptions.style.display = "none";
        if (toolboxAddOptions) toolboxAddOptions.style.display = "none";
        if (toolboxEditOptions) toolboxEditOptions.style.display = "unset";
        if (toolboxMarkOptions) toolboxMarkOptions.style.display = "none";
        break;
      case "action":
        if (toolboxColorsOptions) toolboxColorsOptions.style.display = "none";
        if (toolboxAddOptions) toolboxAddOptions.style.display = "none";
        if (toolboxEditOptions) toolboxEditOptions.style.display = "none";
        if (toolboxMarkOptions) toolboxMarkOptions.style.display = "unset";
        break;
      default:
        if (toolboxColorsOptions) toolboxColorsOptions.style.display = "none";
        if (toolboxAddOptions) toolboxAddOptions.style.display = "unset";
        if (toolboxEditOptions) toolboxEditOptions.style.display = "none";
        if (toolboxMarkOptions) toolboxMarkOptions.style.display = "none";
        break;
    }
  }

  toolboxHide() {
    let toolbox = document.getElementById("highlight-toolbox");
    if (toolbox) toolbox.style.display = "none";
    this.selectionMenuClosed();
  }

  // Use short timeout to let the selection updated to 'finish', otherwise some
  // browsers can get wrong or incomplete selection data.
  toolboxShowDelayed(event: TouchEvent | MouseEvent) {
    this.showTool(event.detail === 1);
  }

  showTool = debounce(
    (b: boolean) => {
      if (!this.isAndroid()) {
        this.snapSelectionToWord(b);
      }
      this.toolboxShow();
    },
    navigator.userAgent.toLowerCase().indexOf("firefox") > -1 ? 200 : 100
  );

  snapSelectionToWord(trimmed: boolean = false) {
    let self = this;
    let doc = this.navigator.iframes[0].contentDocument;
    if (doc) {
      let selection = self.dom(doc.body)?.getSelection();
      // Check for existence of window.getSelection() and that it has a
      // modify() method. IE 9 has both selection APIs but no modify() method.
      if (self.dom(doc.body)) {
        if (selection && !selection?.isCollapsed) {
          let text = selection.toString();
          let startOffsetTemp = text.length - text.trimStart().length;
          let endOffsetTemp = text.length - text.trimEnd().length;
          function removeTrailingPunctuation(text) {
            const match = text.match(new RegExp(`[^a-zA-Z0-9]+$`));
            // No match found
            if (!match || !match.index) {
              return text;
            }
            // Return sliced text
            return text.slice(0, match.index);
          }

          let length = text.length;
          var regex_symbols = /[-!$%^&*()_+|~=`{}[\]:/;<>?,.@#]/;
          text = text.replace(regex_symbols, "");
          startOffsetTemp = length - text.trimStart().length;
          text = removeTrailingPunctuation(text);
          endOffsetTemp = length - text.trimEnd().length;

          // Detect if selection is backwards
          let range = document.createRange();
          if (trimmed) {
            range.setStart(
              selection.anchorNode,
              selection.anchorOffset + startOffsetTemp
            );
            range.setEnd(
              selection.focusNode,
              selection.focusOffset - endOffsetTemp
            );
          } else {
            range.setStart(selection.anchorNode, selection.anchorOffset);
            range.setEnd(selection.focusNode, selection.focusOffset);
          }

          let backwards = range.collapsed;
          range.detach();

          // modify() works on the focus of the selection
          let endNode = selection.focusNode;
          let endOffset;
          if (trimmed) {
            endOffset = selection.focusOffset - endOffsetTemp;
            selection.collapse(
              selection.anchorNode,
              selection.anchorOffset + startOffsetTemp
            );
          } else {
            endOffset = selection.focusOffset;
            selection.collapse(selection.anchorNode, selection.anchorOffset);
          }

          let direction = ["forward", "backward"];
          if (backwards) {
            direction = ["backward", "forward"];
          }

          if (trimmed) {
            selection.modify("move", direction[0], "character");
            selection.modify("move", direction[1], "word");
            selection.extend(endNode, endOffset);
            selection.modify("extend", direction[1], "character");
            selection.modify("extend", direction[0], "word");
          } else {
            selection.extend(endNode, endOffset);
          }
          this.selection(selection.toString(), selection);
        }
      }
      return selection;
    }
  }

  toolboxShow() {
    if (this.activeAnnotationMarkerId === undefined) {
      let self = this;
      let toolboxAddOptions = document.getElementById(
        "highlight-toolbox-mode-add"
      );
      let range = this.dom(
        this.navigator.iframes[0].contentDocument?.body
      ).getRange();

      if ((!range || range.collapsed) && toolboxAddOptions) {
        // Only force hide for `toolboxMode('add')`
        if (getComputedStyle(toolboxAddOptions).display !== "none") {
          self.toolboxHide();
        }
        return;
      }

      if (this.isIOS()) {
        setTimeout(function () {
          let doc = self.navigator.iframes[0].contentDocument;
          if (doc) {
            let selection = self.dom(doc.body).getSelection();
            selection.removeAllRanges();
            setTimeout(function () {
              selection.addRange(range);
              function getCssSelector(element: Element): string | undefined {
                const options = {
                  className: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                  },
                  idName: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                  },
                };
                let doc = self.navigator.iframes[0].contentDocument;
                if (doc) {
                  return uniqueCssSelector(element, doc, options);
                } else {
                  return undefined;
                }
              }

              let win = self.navigator.iframes[0].contentWindow;
              const selectionInfo = getCurrentSelectionInfo(
                win!,
                getCssSelector
              );
              self.navigator.annotationModule?.annotator?.saveTemporarySelectionInfo(
                selectionInfo
              );
            }, 5);
          }
        }, 100);
      }

      this.toolboxPlacement();
      this.toolboxHandler();
    }
  }

  isSelectionMenuOpen = false;
  selectionMenuOpened = debounce(() => {
    if (!this.isSelectionMenuOpen) {
      this.isSelectionMenuOpen = true;
      if (this.api?.selectionMenuOpen) this.api?.selectionMenuOpen();
      this.navigator.emit("toolbox.opened", "opened");
    }
  }, 100);
  selectionMenuClosed = debounce(() => {
    if (this.isSelectionMenuOpen) {
      this.isSelectionMenuOpen = false;
      if (this.api?.selectionMenuClose) this.api?.selectionMenuClose();
      this.navigator.emit("toolbox.closed", "closed");
    }
  }, 100);

  selection = debounce((text, selection) => {
    if (this.api?.selection) this.api?.selection(text, selection);
  }, 100);

  toolboxPlacement() {
    let range = this.dom(
      this.navigator.iframes[0].contentDocument?.body
    ).getRange();
    if (!range || range.collapsed) {
      return;
    }

    let rect = range.getBoundingClientRect();
    let toolbox = document.getElementById("highlight-toolbox");

    if (toolbox) {
      if (this.properties?.menuPosition === MenuPosition.TOP) {
        toolbox.style.left = "0px";
        toolbox.style.transform = "revert";
        toolbox.style.width = "100%";
        toolbox.style.textAlign = "center";
        toolbox.style.position = "absolute";
        toolbox.style.setProperty("--content", "revert");
      } else if (this.properties?.menuPosition === MenuPosition.BOTTOM) {
        toolbox.style.bottom = "0px";
        toolbox.style.left = "0px";
        toolbox.style.transform = "revert";
        toolbox.style.width = "100%";
        toolbox.style.textAlign = "center";
        toolbox.style.position = "absolute";
        toolbox.style.setProperty("--content", "revert");
      } else {
        const paginated = this.navigator.view?.isPaginated();
        if (paginated) {
          toolbox.style.top =
            rect.top + (this.navigator.attributes?.navHeight ?? 0) + "px";
        } else {
          toolbox.style.top = rect.top + "px";
        }
        toolbox.style.left = (rect.right - rect.left) / 2 + rect.left + "px";
      }
    }
  }

  toolboxHandler() {
    let toolbox = document.getElementById("highlight-toolbox");
    if (toolbox) {
      if (getComputedStyle(toolbox).display === "none") {
        toolbox.style.display = "block";
        const paginated = this.navigator.view?.isPaginated();
        if (paginated) {
          toolbox.style.position = "absolute";
        } else {
          toolbox.style.position = "relative";
        }
        this.selectionMenuOpened();

        let self = this;

        self.toolboxMode("add");
        let highlightIcon = document.getElementById("highlightIcon");
        let collapseIcon = document.getElementById("collapseIcon");
        let underlineIcon = document.getElementById("underlineIcon");
        let noteIcon = document.getElementById("noteIcon");
        let colorIcon = document.getElementById("colorIcon");
        let speakIcon = document.getElementById("speakIcon");
        if (this.navigator.rights.enableAnnotations) {
          if (highlightIcon) {
            highlightIcon.style.display = "unset";
            if (colorIcon) {
              if (highlightIcon.getElementsByTagName("span").length > 0) {
                (highlightIcon.getElementsByTagName(
                  "span"
                )[0] as HTMLSpanElement).style.background = this.getColor();
              }
            }
          }
          if (underlineIcon) {
            underlineIcon.style.display = "unset";
            if (colorIcon) {
              if (underlineIcon.getElementsByTagName("span").length > 0) {
                (underlineIcon.getElementsByTagName(
                  "span"
                )[0] as HTMLSpanElement).style.borderBottomColor = this.getColor();
              }
            }
          }
          if (noteIcon) {
            noteIcon.style.display = "unset";
            if (colorIcon) {
              if (noteIcon.getElementsByTagName("span").length > 0) {
                (noteIcon.getElementsByTagName(
                  "span"
                )[0] as HTMLSpanElement).style.borderBottomColor = this.getColor();
              }
            }
          }

          if (colorIcon) {
            colorIcon.style.display = "unset";
            let colorIconSymbol = colorIcon.lastChild as HTMLElement;
            colorIconSymbol.style.backgroundColor = this.getColor();
          }
          if (highlightIcon) {
            function highlightEvent() {
              self.doHighlight(false, AnnotationMarker.Highlight);
              self.toolboxHide();
              highlightIcon?.removeEventListener("click", highlightEvent);
            }
            const clone = highlightIcon.cloneNode(true);
            highlightIcon?.parentNode?.replaceChild(clone, highlightIcon);
            highlightIcon = document.getElementById("highlightIcon");
            highlightIcon?.addEventListener("click", highlightEvent);
          }
          if (underlineIcon) {
            function commentEvent() {
              self.doHighlight(false, AnnotationMarker.Underline);
              self.toolboxHide();
              underlineIcon?.removeEventListener("click", commentEvent);
            }
            const clone = underlineIcon.cloneNode(true);
            underlineIcon?.parentNode?.replaceChild(clone, underlineIcon);
            underlineIcon = document.getElementById("underlineIcon");
            underlineIcon?.addEventListener("click", commentEvent);
          }
          if (noteIcon) {
            function commentEvent() {
              self.doHighlight(false, AnnotationMarker.Comment);
              self.toolboxHide();
              noteIcon?.removeEventListener("click", commentEvent);
            }
            const clone = noteIcon.cloneNode(true);
            noteIcon?.parentNode?.replaceChild(clone, noteIcon);
            noteIcon = document.getElementById("noteIcon");
            noteIcon?.addEventListener("click", commentEvent);
          }
        } else {
          if (highlightIcon) {
            highlightIcon.style.setProperty("display", "none");
          }
          if (underlineIcon) {
            underlineIcon.style.setProperty("display", "none");
          }
          if (noteIcon) {
            noteIcon.style.setProperty("display", "none");
          }
          if (colorIcon) {
            colorIcon.style.setProperty("display", "none");
          }
          if (collapseIcon) {
            collapseIcon.style.setProperty("display", "none");
          }
        }
        if (this.navigator.rights.enableTTS) {
          if (speakIcon) {
            function speakEvent() {
              speakIcon?.removeEventListener("click", speakEvent);
              self.speak();
            }
            const clone = speakIcon.cloneNode(true);
            speakIcon?.parentNode?.replaceChild(clone, speakIcon);
            speakIcon = document.getElementById("speakIcon");
            speakIcon?.addEventListener("click", speakEvent);
          }
        } else {
          if (speakIcon) {
            speakIcon.style.setProperty("display", "none");
          }
        }

        if (this.properties?.selectionMenuItems ?? []) {
          (this.properties?.selectionMenuItems ?? []).forEach((menuItem) => {
            if (menuItem.icon) {
              menuItem.icon.id = menuItem.id;
            }
            let itemElement = document.getElementById(menuItem.id);
            const self = this;

            function itemEvent() {
              itemElement?.removeEventListener("click", itemEvent);

              function getCssSelector(element: Element): string | undefined {
                const options = {
                  className: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                  },
                  idName: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                  },
                };
                let doc = self.navigator.iframes[0].contentDocument;
                if (doc) {
                  return uniqueCssSelector(element, doc, options);
                } else {
                  return undefined;
                }
              }

              let win = self.navigator.iframes[0].contentWindow;
              if (win) {
                let selectionInfo = getCurrentSelectionInfo(
                  win,
                  getCssSelector
                );
                if (selectionInfo === undefined) {
                  let doc = self.navigator.iframes[0].contentDocument;
                  selectionInfo = self.navigator.annotationModule?.annotator?.getTemporarySelectionInfo(
                    doc
                  );
                }

                if (selectionInfo !== undefined) {
                  if (menuItem.callback) {
                    menuItem.callback(
                      selectionInfo.cleanText,
                      selectionInfo.range?.startContainer.parentElement
                    );
                  } else {
                    let style = menuItem.highlight?.style;
                    let marker = menuItem.marker
                      ? menuItem.marker
                      : AnnotationMarker.Custom;

                    if (
                      (marker === AnnotationMarker.Custom &&
                        self.navigator.rights.enableAnnotations) ||
                      (marker === AnnotationMarker.Bookmark &&
                        self.navigator.rights.enableBookmarks)
                    ) {
                      let doc = self.navigator.iframes[0].contentDocument;
                      if (doc) {
                        let highlight = self.createHighlight(
                          self.dom(doc.body).getWindow(),
                          selectionInfo,
                          menuItem.highlight?.color,
                          true,
                          marker,
                          menuItem.icon,
                          menuItem.popup,
                          style
                        );
                        self.options.onAfterHighlight(highlight, marker);

                        if (self.navigator.rights.enableAnnotations) {
                          self.navigator.annotationModule
                            ?.saveAnnotation(highlight[0])
                            .then((anno) => {
                              if (menuItem?.note) {
                                if (anno.highlight) {
                                  // notes on custom icons , new note
                                  self.navigator.annotationModule?.api
                                    ?.addCommentToAnnotation(anno)
                                    .then((result) => {
                                      self.navigator.annotationModule
                                        ?.updateAnnotation(result)
                                        .then(async () => {
                                          log.log(
                                            "update highlight " + result.id
                                          );
                                        });
                                    });
                                }
                              }
                            });
                        } else if (self.navigator.rights.enableBookmarks) {
                          self.navigator.bookmarkModule?.saveAnnotation(
                            highlight[0]
                          );
                        }
                      }
                    }
                  }
                }
              }
              self.callbackComplete();
            }
            if (itemElement) {
              const clone = itemElement.cloneNode(true);
              itemElement?.parentNode?.replaceChild(clone, itemElement);
              itemElement = document.getElementById(menuItem.id);
              itemElement?.addEventListener("click", itemEvent);
            }
          });
        }
      }
    }
  }

  /**
   * Highlights current range.
   * @param {boolean} keepRange - Don't remove range after highlighting. Default: false.
   * @param marker
   * @memberof TextHighlighter
   */
  doHighlight(keepRange?: boolean, marker?: AnnotationMarker) {
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
      let doc = self.navigator.iframes[0].contentDocument;
      if (doc) {
        return uniqueCssSelector(element, doc, options);
      } else {
        return undefined;
      }
    }
    let win = self.navigator.iframes[0].contentWindow;
    if (win) {
      let selectionInfo = getCurrentSelectionInfo(win, getCssSelector);

      if (selectionInfo === undefined) {
        let doc = self.navigator.iframes[0].contentDocument;
        selectionInfo = this.navigator.annotationModule?.annotator?.getTemporarySelectionInfo(
          doc
        );
      }

      if (selectionInfo) {
        if (this.options.onBeforeHighlight(selectionInfo) === true) {
          let createColor: any;
          createColor = this.getColor();
          if (TextHighlighter.isHexColor(createColor)) {
            createColor = TextHighlighter.hexToRgbChannels(createColor);
          }
          let doc = self.navigator.iframes[0].contentDocument;
          if (doc) {
            let highlight = this.createHighlight(
              self.dom(doc.body).getWindow(),
              selectionInfo,
              createColor,
              true,
              marker ?? AnnotationMarker.Highlight
            );

            this.options.onAfterHighlight(highlight, marker);

            if (
              this.navigator.rights.enableAnnotations &&
              marker !== AnnotationMarker.Bookmark
            ) {
              this.navigator.annotationModule?.saveAnnotation(highlight[0]);
            } else if (
              this.navigator.rights.enableBookmarks &&
              marker === AnnotationMarker.Bookmark
            ) {
              this.navigator.bookmarkModule?.saveAnnotation(highlight[0]);
            }
          }
        }

        if (!keepRange) {
          this.dom(
            this.navigator.iframes[0].contentDocument?.body
          ).removeAllRanges();
        }
      } else {
        if (!keepRange) {
          this.dom(
            this.navigator.iframes[0].contentDocument?.body
          ).removeAllRanges();
        }
      }
    }
  }

  speak() {
    if (this.navigator.rights.enableTTS) {
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
        let doc = self.navigator.iframes[0].contentDocument;
        if (doc) {
          return uniqueCssSelector(element, doc, options);
        } else {
          return undefined;
        }
      }
      let win = self.navigator.iframes[0].contentWindow;
      if (win) {
        let selectionInfo = getCurrentSelectionInfo(win, getCssSelector);
        if (selectionInfo === undefined) {
          let doc = self.navigator.iframes[0].contentDocument;
          selectionInfo = self.navigator.annotationModule?.annotator?.getTemporarySelectionInfo(
            doc
          );
        }

        if (selectionInfo !== undefined) {
          (this.navigator.ttsModule as TTSModule2).speak(
            selectionInfo as any,
            true,
            () => {}
          );
        }
      }
      let doc = self.navigator.iframes[0].contentDocument;
      if (doc) {
        const selection = self.dom(doc.body).getSelection();
        selection.removeAllRanges();
      }
      const toolbox = document.getElementById("highlight-toolbox");
      if (toolbox) {
        toolbox.style.display = "none";
      }
      this.selectionMenuClosed();
    }
  }
  stopReadAloud() {
    if (this.navigator.rights.enableTTS) {
      this.doneSpeaking();
    }
  }

  callbackComplete() {
    this.toolboxHide();
    let doc = this.navigator.iframes[0].contentDocument;
    if (doc) {
      this.dom(doc.body).removeAllRanges();
    }
  }

  isOutsideViewport(rect): boolean {
    let wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    const windowLeft = wrapper.scrollLeft;
    const windowRight = windowLeft + wrapper.clientWidth;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const windowTop = wrapper.scrollTop;
    const windowBottom = windowTop + wrapper.clientHeight;

    const isAbove = bottom < windowTop;
    const isBelow = rect.top > windowBottom;

    const isLeft = right < windowLeft;
    const isRight = rect.left > windowRight;

    return isAbove || isBelow || isLeft || isRight;
  }

  isInsideViewport(rect): boolean {
    let wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    const windowTop = wrapper.scrollTop;
    const windowBottom = windowTop + wrapper.clientHeight;
    const isAbove = rect.top + 20 >= windowTop;
    const isBelow = rect.top <= windowBottom;

    const windowLeft = wrapper.scrollLeft;
    const windowRight = windowLeft + wrapper.clientWidth;
    const right = rect.left + rect.width;
    const isLeft = rect.left > windowLeft;
    const isRight = right < windowRight;

    return isAbove && isBelow && isLeft && isRight;
  }

  get visibleTextRects() {
    let doc = this.navigator.iframes[0].contentDocument;
    if (doc) {
      const body = HTMLUtilities.findRequiredIframeElement(
        doc,
        "body"
      ) as HTMLBodyElement;

      function findTextNodes(
        parentElement: Element,
        nodes: Array<Element> = []
      ): Array<Element> {
        let element = parentElement.firstChild as Element;
        while (element) {
          if (element.nodeType === 1) {
            findTextNodes(element, nodes);
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

      function findRects(parent: HTMLElement): Array<HTMLElementRect> {
        const textNodes = findTextNodes(parent);

        return textNodes.map((node) => {
          const { top, height, left, width } = measureTextNode(node);
          return {
            top,
            height,
            width,
            left,
            node,
            textContent: node.textContent ?? "",
          };
        });
      }

      function measureTextNode(node: Element): any {
        try {
          const range = document.createRange();
          range.selectNode(node);

          const rect = range.getBoundingClientRect();
          range.detach(); // frees up memory in older browsers

          return rect;
        } catch (error) {
          log.log("measureTextNode " + error);
          log.log("measureTextNode " + node);
          log.log(`${node.textContent}`);
        }
      }

      const textNodes = findRects(body);
      return textNodes.filter((rect) => this.isInsideViewport(rect));
    }
    return [];
  }

  doneSpeaking(reload: boolean = false) {
    if (this.navigator.rights.enableTTS) {
      this.toolboxHide();
      let doc = this.navigator.iframes[0].contentDocument;
      if (doc) {
        this.dom(doc.body).removeAllRanges();
      }
      (this.navigator.ttsModule as TTSModule2).cancel();
      if (reload) {
        this.navigator.reload();
      }
    }
  }

  /**
   * Normalizes highlights. Ensures that highlighting is done with use of the smallest possible number of
   * wrapping HTML elements.
   * Flattens highlights structure and merges sibling highlights. Normalizes text nodes within highlights.
   * @param {Array} highlights - highlights to normalize.
   * @returns {Array} - array of normalized highlights. Order and number of returned highlights may be different than
   * input highlights.
   * @memberof TextHighlighter
   */
  normalizeHighlights(highlights: any): any {
    var normalizedHighlights: any;

    // omit removed nodes
    normalizedHighlights = highlights.filter(function (hl: any) {
      return hl.parentElement ? hl : null;
    });

    normalizedHighlights = this.unique(normalizedHighlights);
    normalizedHighlights.sort(function (a: any, b: any) {
      return a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft;
    });

    return normalizedHighlights;
  }

  /**
   * Flattens highlights structure.
   * Note: this method changes input highlights - their order and number after calling this method may change.
   * @param {Array} highlights - highlights to flatten.
   * @memberof TextHighlighter
   */
  flattenNestedHighlights(highlights: any) {
    let again;
    let self = this;

    self.sortByDepth(highlights, true);

    function flattenOnce() {
      let again = false;

      highlights.forEach(function (hl: any, i: any) {
        let parent = hl.parentElement,
          parentPrev = parent.previousSibling,
          parentNext = parent.nextSibling;

        if (self.isHighlight(parent)) {
          if (!self.haveSameColor(parent, hl)) {
            if (!hl.nextSibling) {
              self.dom(hl).insertBefore(parentNext || parent);
              again = true;
            }

            if (!hl.previousSibling) {
              self.dom(hl).insertAfter(parentPrev || parent);
              again = true;
            }

            if (!parent.hasChildNodes()) {
              self.dom(parent).remove();
            }
          } else {
            parent.replaceChild(hl.firstChild, hl);
            highlights[i] = parent;
            again = true;
          }
        }
      });

      return again;
    }

    do {
      again = flattenOnce();
    } while (again);
  }

  /**
   * Merges sibling highlights and normalizes descendant text nodes.
   * Note: this method changes input highlights - their order and number after calling this method may change.
   * @param highlights
   * @memberof TextHighlighter
   */
  mergeSiblingHighlights(highlights: any) {
    let self = this;

    function shouldMerge(current: any, node: any) {
      return (
        node &&
        node.nodeType === NODE_TYPE.ELEMENT_NODE &&
        self.haveSameColor(current, node) &&
        self.isHighlight(node)
      );
    }

    highlights.forEach(function (highlight: any) {
      let prev = highlight.previousSibling,
        next = highlight.nextSibling;

      if (shouldMerge(highlight, prev)) {
        self.dom(highlight).prepend(prev.childNodes);
        self.dom(prev).remove();
      }
      if (shouldMerge(highlight, next)) {
        self.dom(highlight).append(next.childNodes);
        self.dom(next).remove();
      }

      self.dom(highlight).normalizeTextNodes();
    });
  }

  /**
   * Sets highlighting color.
   * @param {string} color - valid CSS color.
   * @memberof TextHighlighter
   */
  setColor(color: any) {
    this.options.color = color;
  }

  /**
   * Returns highlighting color.
   * @returns {string}
   * @memberof TextHighlighter
   */
  getColor(): string {
    return this.options.color;
  }

  /**
   * Returns true if element is a highlight.
   * All highlights have 'data-highlighted' attribute.
   * @param el - element to check.
   * @returns {boolean}
   * @memberof TextHighlighter
   */
  isHighlight(el: any): boolean {
    return (
      el && el.nodeType === NODE_TYPE.ELEMENT_NODE && el.hasAttribute(DATA_ATTR)
    );
  }

  /**
   * Creates wrapper for highlights.
   * TextHighlighter instance calls this method each time it needs to create highlights and pass options retrieved
   * in constructor.
   * @returns {HTMLElement}
   * @memberof TextHighlighter
   * @static
   */
  createWrapper(): HTMLElement {
    let span = document.createElement("mark");
    span.style.background =
      "linear-gradient(" +
      TextHighlighter.hexToRgbA(this.options.color) +
      ", " +
      TextHighlighter.hexToRgbA(this.options.color) +
      ")";
    span.className = this.options.highlightedClass;
    return span;
  }

  public static isHexColor(hex: string) {
    return /^#([A-Fa-f0-9]{3}){1,2}$/.test(hex);
  }

  public static hexToRgbString(hex: string) {
    let c: any;
    c = hex.substring(1).split("");
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = "0x" + c.join("");
    return c;
  }

  public static hexToRgbChannels(hex: string) {
    let c: any;
    if (this.isHexColor(hex)) {
      c = this.hexToRgbString(hex);
      return {
        red: (c >> 16) & 255,
        green: (c >> 8) & 255,
        blue: c & 255,
      };
    }
    throw new Error("Bad Hex");
  }

  public static hexToRgbA(hex: string) {
    let c: any;
    if (this.isHexColor(hex)) {
      c = this.hexToRgbChannels(hex);
      return "rgba(" + [c.red, c.green, c.blue].join(",") + ",.5)";
    } else if (typeof hex === "object") {
      let c = hex as IColor;
      return "rgba(" + [c.red, c.green, c.blue].join(",") + ",.5)";
    }
    throw new Error("Bad Hex");
  }

  public static hexToRgbAWithOpacity(hex: string, opacity: number) {
    let c: any;
    if (this.isHexColor(hex)) {
      c = this.hexToRgbChannels(hex);
      return "rgba(" + [c.red, c.green, c.blue].join(",") + "," + opacity + ")";
    } else if (typeof hex === "object") {
      let c = hex as IColor;
      return "rgba(" + [c.red, c.green, c.blue].join(",") + "," + opacity + ")";
    }
    throw new Error("Bad Hex");
  }

  resetHighlightBoundingStyle(highlightBounding: HTMLElement) {
    highlightBounding.style.outline = "none";
    highlightBounding.style.setProperty(
      "background-color",
      "transparent",
      "important"
    );
  }

  resetHighlightAreaStyle(highlightArea: HTMLElement, id_container: string) {
    let doc = this.navigator.iframes[0].contentWindow?.document;
    const id =
      highlightArea.parentNode &&
      highlightArea.parentNode.nodeType === Node.ELEMENT_NODE &&
      (highlightArea.parentNode as Element).getAttribute
        ? (highlightArea.parentNode as Element).getAttribute("id")
        : undefined;
    if (id) {
      const highlight = _highlights.find((h) => {
        return h.id === id;
      });
      if (highlight) {
        if (
          highlight.marker === AnnotationMarker.Custom ||
          highlight.marker === AnnotationMarker.Bookmark
        ) {
          if (highlight.style?.hover) {
            if (highlight.style?.hover) {
              for (let i = 0; i < highlight.style?.hover?.length; i++) {
                let style = highlight.style?.hover[i] as IStyleProperty;
                highlightArea.style.removeProperty(style.property);
              }
            }
            let extra = ``;
            if (highlight.style?.default) {
              for (let i = 0; i < highlight.style?.default?.length; i++) {
                let style = highlight.style?.default[i] as IStyleProperty;
                highlightArea.style.removeProperty(style.property);
                extra += `${style.property}: ${style.value} !${style.priority};`;
              }
            }
            highlightArea.setAttribute(
              "style",
              `${highlightArea.getAttribute("style")}; ${extra}`
            );
          } else if (highlight.style?.hoverClass) {
            if (highlight.style?.hoverClass) {
              highlightArea.classList.remove(highlight.style?.hoverClass);
            }
            let extra = ``;
            if (highlight.style?.defaultClass) {
              highlightArea.classList.add(highlight.style?.defaultClass);
            }
            highlightArea.setAttribute(
              "style",
              `${highlightArea.getAttribute("style")}; ${extra}`
            );
          } else {
            if (TextHighlighter.isHexColor(highlight.color)) {
              let color = TextHighlighter.hexToRgbChannels(highlight.color);
              highlightArea.style.setProperty(
                "background-color",
                `rgba(${color.red}, ${color.green}, ${color.blue}, ${0})`,
                "important"
              );
            } else {
              highlightArea.classList.remove("hover");
            }
          }
        } else if (
          highlight.marker === AnnotationMarker.Underline ||
          highlight.marker === AnnotationMarker.Comment
        ) {
          // Highlight color as string check
          if (typeof highlight.color === "object") {
            let color = highlight.color as IColor;
            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${0})`,
              "important"
            );
            highlightArea.style.setProperty(
              "border-bottom",
              `2px solid rgba(${color.red}, ${color.green}, ${
                color.blue
              }, ${1})`,
              "important"
            );
          } else if (TextHighlighter.isHexColor(highlight.color)) {
            let color = TextHighlighter.hexToRgbChannels(highlight.color);
            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${0})`,
              "important"
            );
            highlightArea.style.setProperty(
              "border-bottom",
              `2px solid rgba(${color.red}, ${color.green}, ${
                color.blue
              }, ${1})`,
              "important"
            );
          } else {
            highlightArea.classList.remove("hover");
          }
        } else {
          // Highlight color as string check
          if (typeof highlight.color === "object") {
            let color = highlight.color as IColor;
            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY})`,
              "important"
            );
          } else if (TextHighlighter.isHexColor(highlight.color)) {
            let color = TextHighlighter.hexToRgbChannels(highlight.color);
            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY})`,
              "important"
            );
          } else {
            highlightArea.classList.remove("hover");
          }
        }

        let highlightParent;
        if (doc) {
          let container = doc.getElementById(id_container);
          if (container) {
            highlightParent = container.querySelector(`#${highlight.id}`);
          }
        }
        if (highlightParent) {
          let nodeList = highlightParent.getElementsByClassName(
            CLASS_HIGHLIGHT_ICON
          );
          if (nodeList.length > 0) {
            const tooltip = nodeList
              .item(0)
              .getElementsByClassName("icon-tooltip");
            if (tooltip.length > 0) {
              (tooltip.item(0) as HTMLElement).style.removeProperty("display");
            }
          }
        }
      }
    }
  }

  setHighlightAreaStyle(
    doc: any,
    highlightAreas: Array<HTMLElement>,
    highlight: IHighlight
  ) {
    for (const highlightArea of highlightAreas) {
      if (
        highlight.marker === AnnotationMarker.Custom ||
        highlight.marker === AnnotationMarker.Bookmark
      ) {
        if (highlight.style?.hover) {
          if (highlight.style?.default) {
            for (let i = 0; i < highlight.style?.default?.length; i++) {
              let style = highlight.style?.default[i] as IStyleProperty;
              highlightArea.style.removeProperty(style.property);
            }
          }
          let extra = ``;
          for (let i = 0; i < highlight.style?.hover?.length; i++) {
            let style = highlight.style?.hover[i] as IStyleProperty;
            highlightArea.style.removeProperty(style.property);
            extra += `${style.property}: ${style.value} !${style.priority};`;
          }
          highlightArea.setAttribute(
            "style",
            `${highlightArea.getAttribute("style")}; ${extra}`
          );
        } else if (highlight.style?.hoverClass) {
          if (highlight.style?.defaultClass) {
            highlightArea.classList.remove(highlight.style?.defaultClass);
          }
          let extra = ``;
          highlightArea.classList.add(highlight.style?.hoverClass);
          highlightArea.setAttribute(
            "style",
            `${highlightArea.getAttribute("style")}; ${extra}`
          );
        } else {
          if (TextHighlighter.isHexColor(highlight.color)) {
            let color = TextHighlighter.hexToRgbChannels(highlight.color);
            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${0.1})`,
              "important"
            );
          } else {
            highlightArea.classList.add("hover");
          }
        }
      } else if (
        highlight.marker === AnnotationMarker.Underline ||
        highlight.marker === AnnotationMarker.Comment
      ) {
        // Highlight color as string check
        if (typeof highlight.color === "object") {
          let color = highlight.color as IColor;
          highlightArea.style.setProperty(
            "background-color",
            `rgba(${color.red}, ${color.green}, ${color.blue}, ${0.1})`,
            "important"
          );
          highlightArea.style.setProperty(
            "border-bottom",
            `2px solid rgba(${color.red}, ${color.green}, ${color.blue}, ${1})`,
            "important"
          );
        } else if (TextHighlighter.isHexColor(highlight.color)) {
          let color = TextHighlighter.hexToRgbChannels(highlight.color);
          highlightArea.style.setProperty(
            "background-color",
            `rgba(${color.red}, ${color.green}, ${color.blue}, ${0.1})`,
            "important"
          );
          highlightArea.style.setProperty(
            "border-bottom",
            `2px solid rgba(${color.red}, ${color.green}, ${color.blue}, ${1})`,
            "important"
          );
        } else {
          highlightArea.classList.add("hover");
        }
      } else {
        // Highlight color as string check
        if (typeof highlight.color === "object") {
          let color = highlight.color as IColor;
          highlightArea.style.setProperty(
            "background-color",
            `rgba(${color.red}, ${color.green}, ${color.blue}, ${ALT_BACKGROUND_COLOR_OPACITY})`,
            "important"
          );
        } else if (TextHighlighter.isHexColor(highlight.color)) {
          let color = TextHighlighter.hexToRgbChannels(highlight.color);
          highlightArea.style.setProperty(
            "background-color",
            `rgba(${color.red}, ${color.green}, ${color.blue}, ${ALT_BACKGROUND_COLOR_OPACITY})`,
            "important"
          );
        } else {
          highlightArea.classList.add("hover");
        }
      }
      if (highlight.type !== HighlightType.Definition) {
        let highlightParent = doc
          .getElementById(HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER)
          .querySelector(`#${highlight.id}`);
        let nodeList = highlightParent.getElementsByClassName(
          CLASS_HIGHLIGHT_ICON
        );
        if (nodeList.length > 0) {
          const tooltip = nodeList
            .item(0)
            .getElementsByClassName("icon-tooltip");
          if (tooltip.length > 0) {
            (tooltip.item(0) as HTMLElement).style.setProperty(
              "display",
              "block"
            );
          }
        }
      }
    }
  }

  setAndResetSearchHighlight(highlight, highlights) {
    let doc = this.navigator.iframes[0].contentWindow?.document as any;

    const allHighlightAreas = Array.from(
      doc
        .getElementById(HighlightContainer.R2_ID_SEARCH_CONTAINER)
        .querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
    );
    for (const highlighta of allHighlightAreas) {
      let highlightArea = highlighta as HTMLElement;
      const id =
        highlightArea.parentNode &&
        highlightArea.parentNode.nodeType === Node.ELEMENT_NODE &&
        (highlightArea.parentNode as Element).getAttribute
          ? (highlightArea.parentNode as Element).getAttribute("id")
          : undefined;

      highlights.forEach((highlight) => {
        if (id === highlight.id) {
          if (highlight) {
            // Highlight color as string check
            if (typeof highlight.color === "object") {
              let color = highlight.color as IColor;

              highlightArea.style.setProperty(
                "background-color",
                `rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY})`,
                "important"
              );
            } else if (TextHighlighter.isHexColor(highlight.color)) {
              let color = TextHighlighter.hexToRgbChannels(highlight.color);

              highlightArea.style.setProperty(
                "background-color",
                `rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY})`,
                "important"
              );
            } else {
              highlightArea.classList.remove("hover");
            }
            let highlightParent = doc
              .getElementById(HighlightContainer.R2_ID_SEARCH_CONTAINER)
              .querySelector(`#${highlight.id}`);
            let nodeList = highlightParent.getElementsByClassName(
              CLASS_HIGHLIGHT_ICON
            );
            if (nodeList.length > 0) {
              const tooltip = nodeList
                .item(0)
                .getElementsByClassName("icon-tooltip");
              if (tooltip.length > 0) {
                (tooltip.item(0) as HTMLElement).style.removeProperty(
                  "display"
                );
              }
            }
          }
        }
      });
      if (id === highlight.id) {
        if (highlight) {
          // Highlight color as string check
          if (typeof highlight.color === "object") {
            let color = highlight.color as IColor;

            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY})`,
              "important"
            );
          } else if (TextHighlighter.isHexColor(highlight.color)) {
            let color = TextHighlighter.hexToRgbChannels(highlight.color);
            highlightArea.style.setProperty(
              "background-color",
              `rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY})`,
              "important"
            );
          } else {
            highlightArea.classList.remove("hover");
          }
          let highlightParent = doc
            .getElementById(HighlightContainer.R2_ID_SEARCH_CONTAINER)
            .querySelector(`#${highlight.id}`);
          let nodeList = highlightParent.getElementsByClassName(
            CLASS_HIGHLIGHT_ICON
          );
          if (nodeList.length > 0) {
            const tooltip = nodeList
              .item(0)
              .getElementsByClassName("icon-tooltip");
            if (tooltip.length > 0) {
              (tooltip.item(0) as HTMLElement).style.removeProperty("display");
            }
          }
        }
      }
    }
  }

  isIOS() {
    // Second test is needed for iOS 13+
    return (
      navigator.userAgent.match(/iPhone|iPad|iPod/i) != null ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }
  isAndroid() {
    return navigator.userAgent.match(/Android/i) != null;
  }
  getScrollingElement = (doc: Document | undefined): Element => {
    if (doc?.scrollingElement) {
      return doc?.scrollingElement;
    } else if (doc?.body) {
      return doc?.body;
    } else {
      // Note: this should never happen, but prevents any exceptions.
      // exception here could happen id the iframe s not loaded yet properly
      // but the scrolling element or body is accessed
      // for example, super-fast next/previous resource changes
      return document.createElement("body");
    }
  };

  async processMouseEvent(ev: MouseEvent) {
    const doc = this.navigator.iframes[0].contentWindow?.document;
    // relative to fixed window top-left corner
    // (unlike pageX/Y which is relative to top-left rendered content area, subject to scrolling)
    const x = ev.clientX;
    const y = ev.clientY;
    if (!doc) {
      return;
    }
    if (
      !doc.getElementById(HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER) &&
      !doc.getElementById(HighlightContainer.R2_ID_SEARCH_CONTAINER) &&
      !doc.getElementById(HighlightContainer.R2_ID_PAGEBREAK_CONTAINER) &&
      !doc.getElementById(HighlightContainer.R2_ID_READALOUD_CONTAINER) &&
      !doc.getElementById(HighlightContainer.R2_ID_DEFINITIONS_CONTAINER)
    ) {
      return;
    }

    const paginated = this.navigator.view?.isPaginated();
    const bodyRect = doc.body.getBoundingClientRect();
    const scrollElement = this.getScrollingElement(doc);

    const xOffset = paginated ? -scrollElement.scrollLeft : bodyRect.left;
    const yOffset = paginated ? -scrollElement.scrollTop : bodyRect.top;

    let foundHighlight: IHighlight | undefined;
    let foundElement: IHTMLDivElementWithRect | undefined;

    for (let i = _highlights.length - 1; i >= 0; i--) {
      const highlight = _highlights[i];

      let highlightParent = doc.getElementById(`${highlight.id}`);
      if (!highlightParent) {
        // ??!!
        let container = doc.getElementById(
          HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER
        );
        if (container) {
          highlightParent = container.querySelector(`#${highlight.id}`); // .${CLASS_HIGHLIGHT_CONTAINER}
        }
      }
      if (!highlightParent) {
        // what?
        continue;
      }

      let hit = false;
      const highlightFragments = highlightParent.querySelectorAll(
        `.${CLASS_HIGHLIGHT_AREA}`
      );
      for (const highlightFragment of highlightFragments) {
        const withRect = (highlightFragment as unknown) as IWithRect;
        const left = withRect.rect.left + xOffset; // (paginated ? withRect.xOffset : xOffset);
        const top = withRect.rect.top + yOffset; // (paginated ? withRect.yOffset : yOffset);
        if (
          x >= left &&
          x < left + withRect.rect.width &&
          y >= top &&
          y < top + withRect.rect.height
        ) {
          hit = true;
          break;
        }
      }
      if (hit) {
        foundHighlight = highlight;
        foundElement = highlightParent as IHTMLDivElementWithRect;
        break;
      }
    }

    if (!foundHighlight || !foundElement) {
      for (let id in HighlightContainer) {
        let container = doc.getElementById(id);
        if (container) {
          const highlightBoundings = container.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
          for (const highlightBounding of highlightBoundings) {
            this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
          }
          const allHighlightAreas = Array.from(
            container.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
          );
          for (const highlightArea of allHighlightAreas) {
            this.resetHighlightAreaStyle(highlightArea as HTMLElement, id);
          }
        }
      }

      return;
    }

    if (foundElement.getAttribute("data-click")) {
      if (
        (ev.type === "mousemove" || ev.type === "touchmove") &&
        foundElement.parentElement?.style.display !== "none"
      ) {
        const foundElementHighlightAreas = Array.from(
          foundElement.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );

        for (let id in HighlightContainer) {
          let container = doc.getElementById(id);
          if (container) {
            const allHighlightAreas = container.querySelectorAll(
              `.${CLASS_HIGHLIGHT_AREA}`
            );
            for (const highlightArea of allHighlightAreas) {
              if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
                this.resetHighlightAreaStyle(highlightArea as HTMLElement, id);
              }
            }
          }
        }

        this.setHighlightAreaStyle(
          doc,
          foundElementHighlightAreas as HTMLElement[],
          foundHighlight
        );

        const foundElementHighlightBounding = foundElement.querySelector(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );

        for (let id in HighlightContainer) {
          let container = doc.getElementById(id);
          if (container) {
            const allHighlightBoundings = container.querySelectorAll(
              `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
            );
            for (const highlightBounding of allHighlightBoundings) {
              if (
                !foundElementHighlightBounding ||
                highlightBounding !== foundElementHighlightBounding
              ) {
                this.resetHighlightBoundingStyle(
                  highlightBounding as HTMLElement
                );
              }
            }
          }
        }
      } else if (
        (ev.type === "mouseup" ||
          ev.type === "click" ||
          ev.type === "touchup") &&
        foundElement.parentElement?.style.display !== "none"
      ) {
        const payload: IEventPayload_R2_EVENT_HIGHLIGHT_CLICK = {
          highlight: foundHighlight,
        };
        log.log(JSON.stringify(payload));
        let self = this;
        let anno;
        if (self.navigator.rights.enableAnnotations) {
          anno = (await this.navigator.annotationModule?.getAnnotation(
            payload.highlight
          )) as Annotation;
        } else if (self.navigator.rights.enableBookmarks) {
          anno = (await this.navigator.bookmarkModule?.getAnnotation(
            payload.highlight
          )) as Annotation;
        }

        if (payload.highlight.type === HighlightType.Annotation) {
          this.navigator.annotationModule?.api
            ?.selectedAnnotation(anno)
            .then(async () => {});
        }

        if (anno?.id) {
          log.log("selected highlight " + anno.id);
          self.lastSelectedHighlight = anno.id;

          let toolbox = document.getElementById("highlight-toolbox");

          if (toolbox) {
            toolbox.style.top =
              ev.clientY + (this.navigator.attributes?.navHeight ?? 0) + "px";
            toolbox.style.left = ev.clientX + "px";

            if (getComputedStyle(toolbox).display === "none") {
              toolbox.style.display = "block";

              this.toolboxMode("edit");

              let colorIcon = document.getElementById("colorIcon");
              let highlightIcon = document.getElementById("highlightIcon");

              if (colorIcon) {
                colorIcon.style.display = "none";
              }
              if (highlightIcon) {
                highlightIcon.style.display = "none";
              }
              function noteH() {
                // existing note
                self.navigator.annotationModule?.api
                  ?.addCommentToAnnotation(anno)
                  .then((result) => {
                    self.navigator.annotationModule
                      ?.updateAnnotation(result)
                      .then(async () => {
                        log.log("update highlight " + result.id);
                        if (toolbox) {
                          toolbox.style.display = "none";
                        }
                        self.selectionMenuClosed();
                      });
                    if (toolbox) {
                      toolbox.style.display = "none";
                    }
                    self.selectionMenuClosed();
                    commentIcon?.removeEventListener("click", noteH, false);
                  });
              }
              let commentIcon = document.getElementById("commentIcon");
              let cloneCommentIcon = document.getElementById(
                "cloneCommentIcon"
              );
              if (cloneCommentIcon) {
                let parent = cloneCommentIcon.parentElement;
                if (parent) {
                  parent.removeChild(cloneCommentIcon);
                }
              }
              if (commentIcon) {
                commentIcon.style.display = "none";
                let clone = commentIcon.cloneNode(true) as HTMLButtonElement;
                let parent = commentIcon.parentElement;
                clone.style.display = "unset";
                clone.id = "cloneCommentIcon";
                clone.addEventListener("click", noteH, false);
                if (parent) {
                  parent.append(clone);
                }
              }

              function deleteH() {
                if (self.navigator.rights.enableAnnotations) {
                  self.navigator.annotationModule
                    ?.deleteSelectedHighlight(anno)
                    .then(async () => {
                      log.log("delete highlight " + anno.id);
                      if (toolbox) {
                        toolbox.style.display = "none";
                      }
                      self.selectionMenuClosed();
                    });
                } else if (self.navigator.rights.enableBookmarks) {
                  self.navigator.bookmarkModule
                    ?.deleteSelectedHighlight(anno)
                    .then(async () => {
                      log.log("delete highlight " + anno.id);
                      if (toolbox) {
                        toolbox.style.display = "none";
                      }
                      self.selectionMenuClosed();
                    });
                }
              }

              let deleteIcon = document.getElementById("deleteIcon");
              let cloneDeleteIcon = document.getElementById("cloneDeleteIcon");
              if (cloneDeleteIcon) {
                let parent = cloneDeleteIcon.parentElement;
                if (parent) {
                  parent.removeChild(cloneDeleteIcon);
                }
              }
              if (deleteIcon) {
                deleteIcon.style.display = "none";
                let clone = deleteIcon.cloneNode(true) as HTMLButtonElement;
                let parent = deleteIcon.parentElement;
                clone.style.display = "unset";
                clone.id = "cloneDeleteIcon";
                clone.addEventListener("click", deleteH, false);
                if (parent) {
                  parent.append(clone);
                }
              }
            } else {
              toolbox.style.display = "none";
              this.selectionMenuClosed();
              void toolbox.offsetWidth;
              toolbox.style.display = "block";
            }
          }
        } else {
          if (foundElement.dataset.definition) {
            const popup = new Popup(this.navigator);
            popup.showPopup(foundElement.dataset.definition, ev);
          }
          let result = this.navigator.definitionsModule?.properties?.definitions?.filter(
            (el: any) => el.order === Number(foundElement?.dataset.order)
          )[0];
          log.log(result);
          if (this.navigator.definitionsModule?.api?.click) {
            this.navigator.definitionsModule.api?.click(
              lodash.omit(result, "callbacks"),
              lodash.omit(foundHighlight, "definition")
            );
            this.navigator.emit("definition.click", result, foundHighlight);
          }
        }
      }
    }
  }
  async prepareContainers(win: any) {
    for (let container in HighlightContainer) {
      await this.ensureHighlightsContainer(win, container);
    }
  }
  async ensureHighlightsContainer(win: any, id: string): Promise<HTMLElement> {
    const doc = win.document;
    if (!doc.getElementById(id)) {
      let container = doc.createElement("div");
      container.setAttribute("id", id);
      if (id !== HighlightContainer.R2_ID_GUTTER_RIGHT_CONTAINER) {
        container.style.setProperty("pointer-events", "none");
      }
      if (this.navigator.view?.layout === "fixed") {
        container.style.setProperty("position", "absolute");
        container.style.setProperty("top", "0");
        container.style.setProperty("left", "0");
      }
      if (doc.body) {
        doc.body.append(container);
      }
      if (
        ((await this.layerSettings.getProperty(id)) as Switchable)?.value ===
        false
      ) {
        container.style.display = "none";
      }
    }

    return doc.getElementById(id);
  }

  hideAllhighlights(doc: Document) {
    this.removeAllChildNodes(
      doc.getElementById(HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER)
    );
    this.removeAllChildNodes(
      doc.getElementById(HighlightContainer.R2_ID_SEARCH_CONTAINER)
    );
    this.removeAllChildNodes(
      doc.getElementById(HighlightContainer.R2_ID_READALOUD_CONTAINER)
    );
    this.removeAllChildNodes(
      doc.getElementById(HighlightContainer.R2_ID_PAGEBREAK_CONTAINER)
    );
    this.removeAllChildNodes(
      doc.getElementById(HighlightContainer.R2_ID_DEFINITIONS_CONTAINER)
    );
  }

  destroyAllhighlights(doc: Document) {
    this.hideAllhighlights(doc);
    _highlights.splice(0, _highlights.length);
  }
  removeAllChildNodes(parent) {
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }
  }

  destroyHighlights(type: HighlightType) {
    let doc = this.navigator.iframes[0].contentWindow?.document;
    if (doc) {
      let container;
      switch (type) {
        case HighlightType.ReadAloud:
          container = doc.getElementById(
            HighlightContainer.R2_ID_READALOUD_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          break;
        case HighlightType.Search:
          container = doc.getElementById(
            HighlightContainer.R2_ID_SEARCH_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          break;
        case HighlightType.PageBreak:
          container = doc.getElementById(
            HighlightContainer.R2_ID_PAGEBREAK_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          break;
        case HighlightType.Definition:
          container = doc.getElementById(
            HighlightContainer.R2_ID_DEFINITIONS_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          break;
        case HighlightType.LineFocus:
          container = doc.getElementById(
            HighlightContainer.R2_ID_LINEFOCUS_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          break;
        case HighlightType.Comment:
          container = doc.getElementById(
            HighlightContainer.R2_ID_GUTTER_RIGHT_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          break;
        default:
          container = doc.getElementById(
            HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER
          );
          if (container) {
            this.removeAllChildNodes(container);
          }
          _highlights.splice(0, _highlights.length);
          break;
      }
    }
  }

  destroyHighlight(doc: Document | null, id: string) {
    if (!doc) {
      return;
    }
    let i = -1;
    const highlight = _highlights.find((h, j) => {
      i = j;
      return h.id === id;
    });
    if (highlight && i >= 0 && i < _highlights.length) {
      _highlights.splice(i, 1);
    }

    const highlightContainer = doc.getElementById(id);
    if (highlightContainer) {
      this.removeAllChildNodes(highlightContainer);
    }
  }

  createHighlight(
    win: any,
    selectionInfo: ISelectionInfo,
    color: string | undefined,
    pointerInteraction: boolean,
    marker: AnnotationMarker,
    icon?: IMarkerIcon | undefined,
    popup?: IPopupStyle | undefined,
    style?: IStyle | undefined,
    type?: HighlightType | undefined,
    prefix?: string | undefined
  ): [IHighlight, HTMLDivElement?] {
    try {
      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = (prefix ? prefix : "R2_HIGHLIGHT_") + sha256Hex;

      this.destroyHighlight(win.document, id);

      let defaultColor = `rgb(${DEFAULT_BACKGROUND_COLOR.red}, ${DEFAULT_BACKGROUND_COLOR.green}, ${DEFAULT_BACKGROUND_COLOR.blue})`;

      const highlight: IHighlight = {
        color: color ? color : defaultColor,
        id,
        pointerInteraction,
        selectionInfo,
        marker: marker,
        icon: icon,
        popup: popup,
        style: style,
        type: type ? type : HighlightType.Annotation,
      };
      if (
        type === HighlightType.Annotation ||
        type === HighlightType.Definition ||
        type === undefined
      ) {
        _highlights.push(highlight);
      }

      let highlightDom = this.createHighlightDom(win, highlight);
      highlight.position = parseInt(
        ((highlightDom?.hasChildNodes()
          ? highlightDom.childNodes[0]
          : highlightDom) as HTMLDivElement).style.top.replace("px", "")
      );

      return [highlight, highlightDom];
    } catch (e) {
      throw "Can't create highlight: " + e;
    }
  }
  createHighlightDom(
    win: any,
    highlight: IHighlight
  ): HTMLDivElement | undefined {
    const doc = win.document;

    const range = convertRangeInfo(doc, highlight.selectionInfo.rangeInfo);
    if (!range) {
      return undefined;
    }

    for (let container in HighlightContainer) {
      this.ensureHighlightsContainer(win, container);
    }

    const highlightParent = doc.createElement("div") as IHTMLDivElementWithRect;
    highlightParent.setAttribute("id", highlight.id);
    highlightParent.setAttribute("class", CLASS_HIGHLIGHT_CONTAINER);
    highlightParent.style.setProperty("pointer-events", "none");
    if (highlight.pointerInteraction) {
      highlightParent.setAttribute("data-click", "1");
    }

    const paginated = this.navigator.view?.isPaginated();

    // Resize Sensor sets body position to "relative" (default static),
    // which may breaks things!
    // (e.g. highlights CSS absolute/fixed positioning)
    // Also note that ReadiumCSS default to (via stylesheet :root):

    if (paginated) {
      doc.body.style.position = "revert";
    } else {
      doc.body.style.position = "relative";
    }
    const bodyRect = doc.body.getBoundingClientRect();
    const scrollElement = this.getScrollingElement(doc);

    const xOffset = paginated ? -scrollElement.scrollLeft : bodyRect.left;
    const yOffset = paginated ? -scrollElement.scrollTop : bodyRect.top;

    const scale = 1;

    let drawUnderline = false;
    let drawStrikeThrough = false;
    let drawBackground = false;

    let doNotMergeHorizontallyAlignedRects =
      drawUnderline || drawStrikeThrough || drawBackground;
    log.debug(doNotMergeHorizontallyAlignedRects);
    // TODO: override doNotMergeHorizontallyAlignedRects to always be true, will need to come back to this if any changes need to be done, or the above removed
    doNotMergeHorizontallyAlignedRects = true;

    const clientRects = getClientRectsNoOverlap(
      range,
      doNotMergeHorizontallyAlignedRects
    );

    const roundedCorner = 3;
    const underlineThickness = 2;
    const strikeThroughLineThickness = 3;
    let position = 0;
    let size = 24;
    let left, right;
    for (const clientRect of clientRects) {
      const highlightArea = doc.createElement("div") as IHTMLDivElementWithRect;
      highlightArea.setAttribute("class", CLASS_HIGHLIGHT_AREA);
      highlightArea.dataset.marker = "" + highlight.marker;

      let extra = "";
      if (
        drawUnderline &&
        highlight.marker !== AnnotationMarker.Custom &&
        highlight.marker !== AnnotationMarker.Bookmark &&
        highlight.marker !== AnnotationMarker.Comment
      ) {
        let color: any = highlight.color;
        if (TextHighlighter.isHexColor(color)) {
          color = TextHighlighter.hexToRgbChannels(color);
        }

        extra += `border-bottom: ${underlineThickness * scale}px solid rgba(${
          color.red
        }, ${color.green}, ${
          color.blue
        }, ${DEFAULT_BACKGROUND_COLOR_OPACITY}) !important`;
      }

      if (
        highlight.marker === AnnotationMarker.Custom ||
        highlight.marker === AnnotationMarker.Bookmark
      ) {
        if (highlight.style?.default) {
          for (let i = 0; i < highlight.style?.default?.length; i++) {
            let style = highlight.style?.default[i] as IStyleProperty;
            extra += `${style.property}: ${style.value} !${style.priority};`;
          }
          highlightArea.setAttribute(
            "style",
            `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; ${extra}`
          );
        } else if (highlight.style?.defaultClass) {
          highlightArea.classList.add(highlight.style?.defaultClass);
          highlightArea.setAttribute(
            "style",
            `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; ${extra}`
          );
        }
      } else if (
        highlight.marker === AnnotationMarker.Underline ||
        highlight.marker === AnnotationMarker.Comment
      ) {
        // Highlight color as string check
        if (typeof highlight.color === "object") {
          let color = highlight.color as IColor;

          highlightArea.setAttribute(
            "style",
            `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; background-color: rgba(${
              color.red
            }, ${color.green}, ${color.blue}, ${0}) !important; ${extra}`
          );
          highlightArea.style.setProperty(
            "border-bottom",
            `2px solid rgba(${color.red}, ${color.green}, ${color.blue}, ${1})`,
            "important"
          );
        } else if (TextHighlighter.isHexColor(highlight.color)) {
          let color = TextHighlighter.hexToRgbChannels(highlight.color);
          highlightArea.setAttribute(
            "style",
            `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; background-color: rgba(${
              color.red
            }, ${color.green}, ${color.blue}, ${0}) !important; ${extra}`
          );
          highlightArea.style.setProperty(
            "border-bottom",
            `2px solid rgba(${color.red}, ${color.green}, ${color.blue}, ${1})`,
            "important"
          );
        } else {
          highlightArea.setAttribute(
            "style",
            `border-radius: ${roundedCorner}px !important; ${extra}`
          );
        }
      } else {
        // Highlight color as string check
        if (typeof highlight.color === "object") {
          let color = highlight.color as IColor;

          highlightArea.setAttribute(
            "style",
            `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY}) !important; ${extra}`
          );
        } else if (TextHighlighter.isHexColor(highlight.color)) {
          let color = TextHighlighter.hexToRgbChannels(highlight.color);
          highlightArea.setAttribute(
            "style",
            `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY}) !important; ${extra}`
          );
        } else {
          highlightArea.setAttribute(
            "style",
            `border-radius: ${roundedCorner}px !important; ${extra}`
          );
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
      if (highlight.pointerInteraction) {
        highlightArea.setAttribute("data-click", "1");
        highlightArea.tabIndex = 0;
      }
      highlightArea.style.width = `${highlightArea.rect.width * scale}px`;
      highlightArea.style.height = `${highlightArea.rect.height * scale}px`;
      highlightArea.style.left = `${highlightArea.rect.left * scale}px`;
      highlightArea.style.top = `${highlightArea.rect.top * scale}px`;

      highlightParent.append(highlightArea);

      let top = parseInt(highlightArea.style.top.replace("px", ""));
      if (top < position || position === 0) {
        position = top;
      }

      size = parseInt(highlightArea.style.height.replace("px", ""));
      if (drawStrikeThrough) {
        const highlightAreaLine = doc.createElement(
          "div"
        ) as IHTMLDivElementWithRect;
        highlightAreaLine.setAttribute("class", CLASS_HIGHLIGHT_AREA);
        let color: any = highlight.color;
        if (TextHighlighter.isHexColor(color)) {
          color = TextHighlighter.hexToRgbChannels(color);
        }

        highlightAreaLine.setAttribute(
          "style",
          `background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${DEFAULT_BACKGROUND_COLOR_OPACITY}) !important;`
        );
        highlightAreaLine.style.setProperty("pointer-events", "none");
        highlightAreaLine.style.position = "absolute";
        highlightAreaLine.scale = scale;
        highlightAreaLine.rect = {
          height: clientRect.height,
          left: clientRect.left - xOffset,
          top: clientRect.top - yOffset,
          width: clientRect.width,
        };
        highlightAreaLine.style.width = `${
          highlightAreaLine.rect.width * scale
        }px`;
        highlightAreaLine.style.height = `${
          strikeThroughLineThickness * scale
        }px`;
        highlightAreaLine.style.left = `${
          highlightAreaLine.rect.left * scale
        }px`;
        highlightAreaLine.style.top = `${
          (highlightAreaLine.rect.top +
            highlightAreaLine.rect.height / 2 -
            strikeThroughLineThickness / 2) *
          scale
        }px`;

        highlightParent.append(highlightAreaLine);
      }

      let viewportWidth = this.navigator.iframes[0].contentWindow?.innerWidth;
      let columnCount = parseInt(
        getComputedStyle(doc.documentElement).getPropertyValue("column-count")
      );

      let columnWidth = parseInt(
        getComputedStyle(doc.documentElement).getPropertyValue("column-width")
      );
      let padding = parseInt(
        getComputedStyle(doc.body).getPropertyValue("padding-left")
      );

      let pageWidth = viewportWidth!! / (columnCount || 1);
      if (pageWidth < columnWidth) {
        pageWidth = viewportWidth!!;
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

      let addLeft = 0 * ratio;
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
        this.navigator.iframes[0].contentDocument!!.documentElement.style.getPropertyValue(
          "--USER__pageMargins"
        )
      );
      if (pagemargin >= 2) {
        right = right + padding / columnCount;
        left = left - padding / columnCount;
      }

      if (!paginated) {
        left = parseInt(
          getComputedStyle(
            this.navigator.iframes[0].contentDocument?.body!!
          ).width.replace("px", "")
        );
        right =
          parseInt(
            getComputedStyle(
              this.navigator.iframes[0].contentDocument?.body!!
            ).width.replace("px", "")
          ) - pageWidth;

        if (pagemargin >= 2) {
          right = right + padding / 2;
          left = left - padding / 2;
        }
      }
    }

    const rangeBoundingClientRect = range.getBoundingClientRect();
    const highlightBounding = doc.createElement(
      "div"
    ) as IHTMLDivElementWithRect;
    highlightBounding.setAttribute("class", CLASS_HIGHLIGHT_BOUNDING_AREA);
    highlightBounding.style.setProperty("pointer-events", "none");
    highlightBounding.style.position = "absolute";
    highlightBounding.scale = scale;
    highlightBounding.rect = {
      height: rangeBoundingClientRect.height,
      left: rangeBoundingClientRect.left - xOffset,
      top: rangeBoundingClientRect.top - yOffset,
      width: rangeBoundingClientRect.width,
    };
    highlightBounding.style.width = `${highlightBounding.rect.width * scale}px`;
    highlightBounding.style.height = `${
      highlightBounding.rect.height * scale
    }px`;
    highlightBounding.style.left = `${highlightBounding.rect.left * scale}px`;
    highlightBounding.style.top = `${highlightBounding.rect.top * scale}px`;
    highlightParent.append(highlightBounding);

    const highlightAreaIcon = doc.createElement("div");
    highlightAreaIcon.setAttribute("class", CLASS_HIGHLIGHT_ICON);

    if (highlight.icon?.position === "left") {
      highlightAreaIcon.setAttribute(
        "style",
        `position: absolute;top:${position}px;left:${
          right +
          this.navigator.iframes[0].contentDocument?.scrollingElement
            ?.scrollLeft
        }px;height:${size}px; width:${size}px;`
      );
    } else if (highlight.icon?.position === "inline") {
      highlightAreaIcon.setAttribute(
        "style",
        `position: absolute;top:${position - size / 2}px;left:${
          parseInt(highlightBounding.style.left.replace("px", "")) +
          parseInt(highlightBounding.style.width.replace("px", "")) -
          size / 2
        }px;height:${size}px; width:${size}px;`
      );
    } else if (highlight.icon?.position === "center") {
      // let sizeIcon = parseInt(highlightAreaIcon.style.width.replace("px", ""));

      let third = size / 3;
      let half = third * 2;
      highlightAreaIcon.setAttribute(
        "style",
        `position: absolute;top:${position}px;left:${
          parseInt(highlightBounding.style.left.replace("px", "")) +
          parseInt(highlightBounding.style.width.replace("px", "")) -
          half
        }px;height:${size}px; width:${size}px;`
      );
    } else {
      if (
        highlight.note &&
        highlight.marker !== AnnotationMarker.Custom &&
        highlight.marker !== AnnotationMarker.Bookmark &&
        highlight.marker !== AnnotationMarker.Comment &&
        highlight.marker !== AnnotationMarker.Highlight &&
        highlight.marker !== AnnotationMarker.Underline
      ) {
        highlightAreaIcon.setAttribute(
          "style",
          `position: absolute;top:${position - size / 2}px;left:${
            parseInt(highlightBounding.style.left.replace("px", "")) +
            parseInt(highlightBounding.style.width.replace("px", "")) -
            size / 2
          }px;height:${size}px; width:${size}px;`
        );
      } else if (
        (highlight.note && highlight.marker === AnnotationMarker.Comment) ||
        highlight.marker === AnnotationMarker.Highlight ||
        highlight.marker === AnnotationMarker.Underline
      ) {
        // TODO: double check !!!!
        highlightAreaIcon.setAttribute(
          "style",
          `position: absolute;top:${position}px;left:${
            left +
            this.navigator.iframes[0].contentDocument?.scrollingElement
              ?.scrollLeft
          }px;height:${size}px; width:${size}px;`
        );
      } else {
        highlightAreaIcon.setAttribute(
          "style",
          `position: absolute;top:${position}px;left:${
            left +
            this.navigator.iframes[0].contentDocument?.scrollingElement
              ?.scrollLeft
          }px;height:${size}px; width:${size}px;`
        );
      }
    }

    if (
      highlight.marker === AnnotationMarker.Custom ||
      highlight.marker === AnnotationMarker.Bookmark
    ) {
      if (highlight.icon?.class) {
        highlightAreaIcon.classList.add(highlight.icon?.class);
        highlightAreaIcon.id = highlight.icon?.id;
      } else if (highlight.icon?.svgPath) {
        highlightAreaIcon.innerHTML = iconTemplateColored(
          `${highlight.icon?.id}`,
          `${highlight.icon?.title}`,
          `${highlight.icon?.svgPath}`,
          `icon open`,
          size,
          `${highlight.icon?.color} !important`
        );
      } else if (highlight.icon?.title) {
        highlightAreaIcon.innerHTML = highlight.icon?.title;
      }
    } else {
      if (highlight.note) {
        let color: any = highlight.color;
        if (TextHighlighter.isHexColor(color)) {
          color = TextHighlighter.hexToRgbChannels(color);
        }
        if (
          highlight.marker === AnnotationMarker.Comment ||
          highlight.marker === AnnotationMarker.Highlight ||
          highlight.marker === AnnotationMarker.Underline
        ) {
          highlightAreaIcon.innerHTML = iconTemplateColored(
            ``,
            ``,
            `<path d="M24 24H0V0h24v24z" fill="none"/><circle cx="12" cy="12" r="14"/>`,
            `icon open`,
            size / 2,
            `rgba(${color.red}, ${color.green}, ${color.blue}, 1) !important`
          );
        } else {
          highlightAreaIcon.innerHTML = iconTemplateColored(
            `note-icon`,
            `Note`,
            `<rect fill="none" height="24" width="24"/><path d="M19,5v9l-5,0l0,5H5V5H19 M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h10l6-6V5C21,3.9,20.1,3,19,3z M12,14H7v-2h5V14z M17,10H7V8h10V10z"/>`,
            `icon open`,
            size,
            `rgba(${color.red}, ${color.green}, ${color.blue}, 1) !important`
          );
        }
      }
    }

    highlightAreaIcon.style.setProperty("pointer-events", "all");
    let self = this;
    if (
      highlight.type !== HighlightType.PageBreak &&
      highlight.type !== HighlightType.Definition
    ) {
      highlightAreaIcon.addEventListener("click", async function (ev) {
        let anno;
        if (self.navigator.rights.enableAnnotations) {
          anno = (await self.navigator.annotationModule?.getAnnotationByID(
            highlight.id
          )) as Annotation;
          self.navigator.annotationModule?.api
            ?.selectedAnnotation(anno)
            .then(async () => {});
        } else if (self.navigator.rights.enableBookmarks) {
          anno = (await self.navigator.bookmarkModule?.getAnnotationByID(
            highlight.id
          )) as Annotation;
        }

        log.log("selected highlight " + anno.id);

        self.lastSelectedHighlight = anno.id;
        let toolbox = document.getElementById("highlight-toolbox");
        if (toolbox) {
          toolbox.style.top =
            ev.clientY + (self.navigator.attributes?.navHeight ?? 0) + "px";
          toolbox.style.left = ev.clientX + "px";

          if (getComputedStyle(toolbox).display === "none") {
            toolbox.style.display = "block";

            self.toolboxMode("edit");

            let colorIcon = document.getElementById("colorIcon");
            let highlightIcon = document.getElementById("highlightIcon");
            if (colorIcon) {
              colorIcon.style.display = "none";
            }
            if (highlightIcon) {
              highlightIcon.style.display = "none";
            }

            let commentIcon = document.getElementById("commentIcon");
            let cloneCommentIcon = document.getElementById("cloneCommentIcon");
            if (cloneCommentIcon) {
              let parent = cloneCommentIcon.parentElement;
              if (parent) {
                parent.removeChild(cloneCommentIcon);
              }
            }
            if (commentIcon) {
              commentIcon.style.display = "none";
            }

            function deleteH() {
              if (self.navigator.rights.enableAnnotations) {
                self.navigator.annotationModule
                  ?.deleteSelectedHighlight(anno)
                  .then(async () => {
                    log.log("delete highlight " + anno.id);
                    toolbox!!.style.display = "none";
                    self.selectionMenuClosed();
                  });
              } else if (self.navigator.rights.enableBookmarks) {
                self.navigator.bookmarkModule
                  ?.deleteSelectedHighlight(anno)
                  .then(async () => {
                    log.log("delete highlight " + anno.id);
                    toolbox!!.style.display = "none";
                    self.selectionMenuClosed();
                  });
              }
            }

            let deleteIcon = document.getElementById("deleteIcon");
            let cloneDeleteIcon = document.getElementById("cloneDeleteIcon");
            if (cloneDeleteIcon) {
              let parent = cloneDeleteIcon.parentElement;
              if (parent) {
                parent.removeChild(cloneDeleteIcon);
              }
            }
            if (deleteIcon) {
              deleteIcon.style.display = "none";
              let clone = deleteIcon.cloneNode(true) as HTMLButtonElement;
              let parent = deleteIcon.parentElement;
              clone.style.display = "unset";
              clone.id = "cloneDeleteIcon";
              clone.addEventListener("click", deleteH, false);
              if (parent) {
                parent.append(clone);
              }
            }
          } else {
            toolbox.style.display = "none";
            self.selectionMenuClosed();
            void toolbox.offsetWidth;
            toolbox.style.display = "block";
          }
        }
        const foundElementHighlightAreas = Array.from(
          highlightParent.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );
        self.setHighlightAreaStyle(
          doc,
          foundElementHighlightAreas as HTMLElement[],
          highlight
        );
      });
    }

    if (highlight.note) {
      let tooltip = document.createElement("span");
      tooltip.innerHTML = highlight.note;
      tooltip.className = "icon-tooltip";
      if (
        highlight.marker === AnnotationMarker.Custom ||
        highlight.marker === AnnotationMarker.Bookmark
      ) {
        if (highlight.popup?.background) {
          tooltip.style.setProperty("background", highlight.popup.background);
        }
        if (highlight.popup?.textColor) {
          tooltip.style.setProperty("color", highlight.popup.textColor);
        }
        if (highlight.popup?.class) {
          tooltip.classList.add(highlight.popup.class);
        }
      } else {
        tooltip.style.setProperty("background", "lightyellow");
        tooltip.style.setProperty("color", "black");
      }
      // highlightAreaIcon.insertBefore(tooltip, highlightAreaIcon.childNodes[0]);
    }
    if (
      highlight.note ||
      highlight.marker === AnnotationMarker.Custom ||
      highlight.marker === AnnotationMarker.Bookmark
      // &&
      // highlight.marker !== AnnotationMarker.Comment
    ) {
      highlightParent.append(highlightAreaIcon);
    }

    switch (highlight.type) {
      case HighlightType.Search:
        doc
          .getElementById(HighlightContainer.R2_ID_SEARCH_CONTAINER)
          .append(highlightParent);
        break;
      case HighlightType.ReadAloud:
        doc
          .getElementById(HighlightContainer.R2_ID_READALOUD_CONTAINER)
          .append(highlightParent);
        break;
      case HighlightType.PageBreak:
        doc
          .getElementById(HighlightContainer.R2_ID_PAGEBREAK_CONTAINER)
          .append(highlightParent);
        break;
      case HighlightType.Definition:
        doc
          .getElementById(HighlightContainer.R2_ID_DEFINITIONS_CONTAINER)
          .append(highlightParent);
        break;
      default:
        doc
          .getElementById(HighlightContainer.R2_ID_HIGHLIGHTS_CONTAINER)
          .append(highlightParent);
        break;
    }

    return highlightParent;
  }

  addSelectionMenuItem(citationIconMenu: SelectionMenuItem) {
    if (this.properties?.selectionMenuItems ?? []) {
      (this.properties?.selectionMenuItems ?? []).push(citationIconMenu);
    }
  }
}
