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
import { IReadiumIFrameWindow } from "./renderer/iframe/state";
import { uniqueCssSelector } from "./renderer/common/cssselector2";
import { Annotation, AnnotationMarker } from "../../model/Locator";
import { IS_DEV } from "../..";
import { icons, iconTemplateColored } from "../../utils/IconLib";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import TTSModule from "../TTS/TTSModule";
import TTSModule2 from "../TTS/TTSModule2";
import * as HTMLUtilities from "../../utils/HTMLUtilities";

export const ID_HIGHLIGHTS_CONTAINER = "R2_ID_HIGHLIGHTS_CONTAINER";
export const ID_READALOUD_CONTAINER = "R2_ID_READALOUD_CONTAINER";
export const ID_PAGEBREAK_CONTAINER = "R2_ID_PAGEBREAK_CONTAINER";
export const ID_SEARCH_CONTAINER = "R2_ID_SEARCH_CONTAINER";

export const CLASS_HIGHLIGHT_CONTAINER = "R2_CLASS_HIGHLIGHT_CONTAINER";
export const CLASS_HIGHLIGHT_AREA = "R2_CLASS_HIGHLIGHT_AREA";
export const CLASS_HIGHLIGHT_ICON = "R2_CLASS_HIGHLIGHT_ICON";
export const CLASS_HIGHLIGHT_BOUNDING_AREA = "R2_CLASS_HIGHLIGHT_BOUNDING_AREA";

const DEFAULT_BACKGROUND_COLOR_OPACITY = 0.5;
const ALT_BACKGROUND_COLOR_OPACITY = 0.75;
const DEFAULT_BACKGROUND_COLOR = {
  blue: 100,
  green: 50,
  red: 230,
};
export interface TextSelectorAPI {
  selectionMenuOpen: any;
  selectionMenuClose: any;
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

const _blacklistIdClassForCssSelectors = [
  ID_HIGHLIGHTS_CONTAINER,
  CLASS_HIGHLIGHT_CONTAINER,
  CLASS_HIGHLIGHT_AREA,
  CLASS_HIGHLIGHT_BOUNDING_AREA,
];

let lastMouseDownX = -1;
let lastMouseDownY = -1;
let bodyEventListenersSet = false;

// TODO this needs to reflect layer name
let _highlightsContainer: HTMLElement | null;
let _highlightsReadAloudContainer: HTMLElement | null;
let _highlightsPageBreakContainer: HTMLElement | null;
let _highlightsSearchContainer: HTMLElement | null;

export interface TextHighlighterProperties {
  selectionMenuItems: Array<SelectionMenuItem>;
}

export interface TextHighlighterConfig extends TextHighlighterProperties {
  delegate: IFrameNavigator;
  api: TextSelectorAPI;
}

export default class TextHighlighter {
  private options: any;
  private delegate: IFrameNavigator;
  private lastSelectedHighlight: number = undefined;
  private properties: TextHighlighterProperties;
  private api: TextSelectorAPI;
  private hasEventListener: boolean;

  public static async create(config: TextHighlighterConfig): Promise<any> {
    const module = new this(
      config.delegate,
      config as TextHighlighterProperties,
      config.api,
      false,
      {}
    );
    return new Promise((resolve) => resolve(module));
  }

  private constructor(
    delegate: IFrameNavigator,
    properties: TextHighlighterProperties,
    api: TextSelectorAPI,
    hasEventListener: boolean,
    options: any
  ) {
    this.delegate = delegate;
    this.properties = properties;
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
    this.delegate.highlighter = this;
  }
  async initialize() {
    this.dom(this.delegate.iframes[0].contentDocument.body).addClass(
      this.options.contextClass
    );
    this.bindEvents(
      this.delegate.iframes[0].contentDocument.body,
      this,
      this.hasEventListener
    );

    this.initializeToolbox();

    lastMouseDownX = -1;
    lastMouseDownY = -1;
    bodyEventListenersSet = false;

    var self = this;
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
      await this.delegate.iframes[0].contentDocument.body.addEventListener(
        "click",
        unselect
      );
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
    var self = this;
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
    var order: any[] = [],
      chunks: any = {},
      grouped: any | { chunks: any; timestamp: any; toString: () => any }[] =
        [];

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
    var self = this;

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
        var nodes = Array.prototype.slice.call(nodesToPrepend),
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
        var nodes = Array.prototype.slice.call(nodesToAppend);

        for (var i = 0, len = nodes.length; i < len; ++i) {
          el.appendChild(nodes[i]);
        }
      },

      /**
       * Inserts base element after refEl.
       * @param {Node} refEl - node after which base element will be inserted
       * @returns {Node} - inserted element
       */
      insertAfter: function (refEl: Node): Node {
        return refEl.parentNode.insertBefore(el, refEl.nextSibling);
      },

      /**
       * Inserts base element before refEl.
       * @param {Node} refEl - node before which base element will be inserted
       * @returns {Node} - inserted element
       */
      insertBefore: function (refEl: Node): Node {
        return refEl.parentNode.insertBefore(el, refEl);
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
        var nodes = Array.prototype.slice.call(el.childNodes),
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
        var parent,
          path = [];

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
        var div = document.createElement("div");
        div.innerHTML = html;
        return div.childNodes;
      },

      /**
       * Returns first range of the window of base element.
       * @returns {Range}
       */
      getRange: function (): Range {
        var selection = self.dom(el).getSelection(),
          range;

        if (selection.rangeCount > 0) {
          range = selection.getRangeAt(0);
        }

        return range;
      },

      /**
       * Removes all ranges of the window of base element.
       */
      removeAllRanges: function () {
        var selection = self.dom(el).getSelection();
        selection.removeAllRanges();
        self.toolboxHide();
      },

      /**
       * Returns selection object of the window of base element.
       * @returns {Selection}
       */
      getSelection: function (): Selection {
        return self.dom(el).getWindow().getSelection();
      },

      /**
       * Returns window of the base element.
       * @returns {Window}
       */
      getWindow: function (): Window {
        return self.dom(el).getDocument().defaultView;
      },

      /**
       * Returns document of the base element.
       * @returns {HTMLDocument}
       */
      getDocument: function (): HTMLDocument {
        // if ownerDocument is null then el is the document itself.
        return el.ownerDocument || el;
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
    var documant = el.ownerDocument;

    documant.addEventListener("keyup", this.toolboxShowDelayed.bind(this));
    el.addEventListener("mouseup", this.toolboxShowDelayed.bind(this));
    el.addEventListener("touchend", this.toolboxShowDelayed.bind(this));
    documant.addEventListener(
      "selectstart",
      this.toolboxShowDelayed.bind(this)
    );

    if (!hasEventListener) {
      window.addEventListener("resize", this.toolboxPlacement.bind(this));
    }
    documant.addEventListener(
      "selectionchange",
      this.toolboxPlacement.bind(this)
    );

    el.addEventListener("mousedown", this.toolboxHide.bind(this));
    el.addEventListener("touchstart", this.toolboxHide.bind(this));

    if (this.isAndroid()) {
      el.addEventListener("contextmenu", this.disableContext);
    }

    this.hasEventListener = true;
  }

  unbindEvents(el: any, _scope: any) {
    var documant = el.ownerDocument;

    documant.removeEventListener("keyup", this.toolboxShowDelayed.bind(this));
    el.removeEventListener("mouseup", this.toolboxShowDelayed.bind(this));
    el.removeEventListener("touchend", this.toolboxShowDelayed.bind(this));
    documant.removeEventListener(
      "selectstart",
      this.toolboxShowDelayed.bind(this)
    );

    window.removeEventListener("resize", this.toolboxPlacement.bind(this));
    documant.removeEventListener(
      "selectionchange",
      this.toolboxPlacement.bind(this)
    );

    el.removeEventListener("mousedown", this.toolboxHide.bind(this));
    el.removeEventListener("touchstart", this.toolboxHide.bind(this));

    if (this.isAndroid()) {
      el.removeEventListener("contextmenu", this.disableContext);
    }
    this.hasEventListener = false;
  }

  /**
   * Permanently disables highlighting.
   * Unbinds events and remove context element class.
   * @memberof TextHighlighter
   */
  destroy() {
    this.toolboxHide();
    this.unbindEvents(this.delegate.iframes[0].contentDocument.body, this);
    this.dom(this.delegate.iframes[0].contentDocument.body).removeClass(
      this.options.contextClass
    );
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
        var colorButton = document.getElementById(color);
        var cButton = document.getElementById(`c${color}`);
        if (toolboxColorsOptions.contains(colorButton)) {
          toolboxColorsOptions.removeChild(colorButton);
        }
        if (toolboxOptions.contains(cButton)) {
          toolboxOptions.removeChild(cButton);
        }
      });

      const colorElements: HTMLButtonElement[] = [];
      const colorRainbow: HTMLButtonElement[] = [];

      // Open toolbox color options
      colorIcon.addEventListener("click", function () {
        self.toolboxMode("colors");
      });

      if (this.delegate.rights?.enableAnnotations) {
        let index = 10;
        colors.forEach((color) => {
          index--;
          const colorButton = colorIcon.cloneNode(true) as HTMLButtonElement;
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
          toolboxOptions.insertBefore(colorButton, highlightIcon);
        });
      }

      // Generate color options
      colors.forEach((color) => {
        const colorButton = colorIcon.cloneNode(true) as HTMLButtonElement;
        const colorButtonSymbol = colorButton.lastChild as HTMLElement;
        colorButtonSymbol.style.backgroundColor = color;
        colorButton.id = color;
        colorButton.style.position = "relative";
        colorButton.style.display = "unset";
        colorElements.push(colorButton);

        const highlightIcon = document.getElementById("highlightIcon");
        const underlineIcon = document.getElementById("underlineIcon");
        // Set color and close color options
        if (colorIcon) {
          colorButton.addEventListener("click", function () {
            self.setColor(color);
            var colorIconSymbol = colorIcon.lastChild as HTMLElement;
            if (colorIconSymbol) {
              colorIconSymbol.style.backgroundColor = color;
            }
            if (highlightIcon.getElementsByTagName("span").length > 0) {
              (
                highlightIcon.getElementsByTagName("span")[0] as HTMLSpanElement
              ).style.background = self.getColor();
            }
            if (underlineIcon.getElementsByTagName("span").length > 0) {
              (
                underlineIcon.getElementsByTagName("span")[0] as HTMLSpanElement
              ).style.borderBottomColor = self.getColor();
            }

            self.toolboxMode("add");
          });
        }

        toolboxColorsOptions.insertBefore(colorButton, dismissIcon);
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
    var toolboxColorsOptions = document.getElementById(
      "highlight-toolbox-mode-colors"
    );
    var toolboxAddOptions = document.getElementById(
      "highlight-toolbox-mode-add"
    );
    var toolboxEditOptions = document.getElementById(
      "highlight-toolbox-mode-edit"
    );
    var toolboxMarkOptions = document.getElementById(
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
    var toolbox = document.getElementById("highlight-toolbox");
    if (toolbox) toolbox.style.display = "none";
    this.selectionMenuClosed();
  }

  // Use short timeout to let the selection updated to 'finish', otherwise some
  // browsers can get wrong or incomplete selection data.
  toolboxShowDelayed() {
    var self = this;
    setTimeout(function () {
      if (!self.isAndroid()) {
        self.snapSelectionToWord();
      }
      self.toolboxShow();
    }, 100);
  }

  snapSelectionToWord() {
    var self = this;
    // Check for existence of window.getSelection() and that it has a
    // modify() method. IE 9 has both selection APIs but no modify() method.
    if (self.dom(this.delegate.iframes[0].contentDocument.body)) {
      var selection = self
        .dom(this.delegate.iframes[0].contentDocument.body)
        .getWindow()
        .getSelection();
      if (!selection.isCollapsed) {
        // Detect if selection is backwards
        var range = document.createRange();
        range.setStart(selection.anchorNode, selection.anchorOffset);
        range.setEnd(selection.focusNode, selection.focusOffset);
        var backwards = range.collapsed;
        range.detach();

        // modify() works on the focus of the selection
        var endNode = selection.focusNode,
          endOffset = selection.focusOffset;
        selection.collapse(selection.anchorNode, selection.anchorOffset);

        let direction = ["forward", "backward"];
        if (backwards) {
          direction = ["backward", "forward"];
        }

        selection.modify("move", direction[0], "character");
        selection.modify("move", direction[1], "word");
        selection.extend(endNode, endOffset);
        selection.modify("extend", direction[1], "character");
        selection.modify("extend", direction[0], "word");
      }
    }
    return selection;
  }

  toolboxShow() {
    var self = this;
    var toolboxAddOptions = document.getElementById(
      "highlight-toolbox-mode-add"
    );
    var range = this.dom(
      this.delegate.iframes[0].contentDocument.body
    ).getRange();

    if ((!range || range.collapsed) && toolboxAddOptions) {
      // Only force hide for `toolboxMode('add')`
      if (getComputedStyle(toolboxAddOptions).display !== "none") {
        self.toolboxHide();
      }
      return;
    }

    // Hide the iOS Safari context menu
    // Reference: https://stackoverflow.com/a/30046936
    if (this.isIOS()) {
      this.delegate.iframes[0].contentDocument.body.removeEventListener(
        "selectionchange",
        this.toolboxPlacement.bind(this)
      );
      setTimeout(function () {
        var selection = self
          .dom(self.delegate.iframes[0].contentDocument.body)
          .getSelection();
        selection.removeAllRanges();
        setTimeout(function () {
          selection.addRange(range);
        }, 5);
      }, 100);
    }

    this.toolboxPlacement();
    this.toolboxHandler();
  }

  isSelectionMenuOpen = false;
  selectionMenuOpened = debounce(() => {
    if (!this.isSelectionMenuOpen) {
      this.isSelectionMenuOpen = true;
      if (this.api?.selectionMenuOpen) this.api?.selectionMenuOpen();
    }
  }, 100);
  selectionMenuClosed = debounce(() => {
    if (this.isSelectionMenuOpen) {
      this.isSelectionMenuOpen = false;
      if (this.api?.selectionMenuClose) this.api?.selectionMenuClose();
    }
  }, 100);

  toolboxPlacement() {
    var range = this.dom(
      this.delegate.iframes[0].contentDocument.body
    ).getRange();
    if (!range || range.collapsed) {
      return;
    }

    var rect = range.getBoundingClientRect();
    var toolbox = document.getElementById("highlight-toolbox");

    if (toolbox) {
      toolbox.style.top =
        rect.top + (this.delegate.attributes?.navHeight ?? 0) + "px";
      toolbox.style.left = (rect.right - rect.left) / 2 + rect.left + "px";
    }
  }

  toolboxHandler() {
    var toolbox = document.getElementById("highlight-toolbox");
    if (toolbox) {
      if (getComputedStyle(toolbox).display === "none") {
        toolbox.style.display = "block";
        this.selectionMenuOpened();

        var self = this;

        self.toolboxMode("add");
        var highlightIcon = document.getElementById("highlightIcon");
        var collapseIcon = document.getElementById("collapseIcon");
        var underlineIcon = document.getElementById("underlineIcon");
        var colorIcon = document.getElementById("colorIcon");
        var speakIcon = document.getElementById("speakIcon");
        if (this.delegate.rights?.enableAnnotations) {
          if (highlightIcon) {
            highlightIcon.style.display = "unset";
            if (colorIcon) {
              if (highlightIcon.getElementsByTagName("span").length > 0) {
                (
                  highlightIcon.getElementsByTagName(
                    "span"
                  )[0] as HTMLSpanElement
                ).style.background = this.getColor();
              }
            }
          }
          if (underlineIcon) {
            underlineIcon.style.display = "unset";
            if (colorIcon) {
              if (underlineIcon.getElementsByTagName("span").length > 0) {
                (
                  underlineIcon.getElementsByTagName(
                    "span"
                  )[0] as HTMLSpanElement
                ).style.borderBottomColor = this.getColor();
              }
            }
          }
          if (colorIcon) {
            colorIcon.style.display = "unset";
            var colorIconSymbol = colorIcon.lastChild as HTMLElement;
            colorIconSymbol.style.backgroundColor = this.getColor();
          }
          if (highlightIcon) {
            function highlightEvent() {
              self.doHighlight(false, AnnotationMarker.Highlight);
              self.toolboxHide();
              highlightIcon.removeEventListener("click", highlightEvent);
            }
            highlightIcon.addEventListener("click", highlightEvent);
          }
          if (underlineIcon) {
            function commentEvent() {
              self.doHighlight(false, AnnotationMarker.Underline);
              self.toolboxHide();
              underlineIcon.removeEventListener("click", commentEvent);
            }
            underlineIcon.addEventListener("click", commentEvent);
          }
        } else {
          if (highlightIcon) {
            highlightIcon.style.setProperty("display", "none");
          }
          if (underlineIcon) {
            underlineIcon.style.setProperty("display", "none");
          }
          if (colorIcon) {
            colorIcon.style.setProperty("display", "none");
          }
          if (collapseIcon) {
            collapseIcon.style.setProperty("display", "none");
          }
        }
        if (this.delegate.rights?.enableTTS) {
          if (speakIcon) {
            function speakEvent() {
              speakIcon.removeEventListener("click", speakEvent);
              self.speak();
            }
            speakIcon.addEventListener("click", speakEvent);
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
            const itemElement = document.getElementById(menuItem.id);
            const self = this;

            function itemEvent() {
              itemElement.removeEventListener("click", itemEvent);

              function getCssSelector(element: Element): string {
                const options = {
                  className: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                  },
                  idName: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                  },
                };
                return uniqueCssSelector(
                  element,
                  self.delegate.iframes[0].contentDocument,
                  options
                );
              }

              const selectionInfo = getCurrentSelectionInfo(
                self.delegate.iframes[0].contentWindow,
                getCssSelector
              );
              if (selectionInfo !== undefined) {
                if (menuItem.callback) {
                  menuItem.callback(
                    selectionInfo.cleanText,
                    selectionInfo.range.startContainer.parentElement
                  );
                } else {
                  let style = menuItem.highlight.style;
                  let marker = menuItem.marker
                    ? menuItem.marker
                    : AnnotationMarker.Custom;

                  if (
                    (marker == AnnotationMarker.Custom &&
                      self.delegate.rights?.enableAnnotations) ||
                    (marker == AnnotationMarker.Bookmark &&
                      self.delegate.rights?.enableBookmarks)
                  ) {
                    let highlight = self.createHighlight(
                      self
                        .dom(self.delegate.iframes[0].contentDocument.body)
                        .getWindow(),
                      selectionInfo,
                      menuItem.highlight.color,
                      true,
                      marker,
                      menuItem.icon,
                      menuItem.popup,
                      style
                    );
                    self.options.onAfterHighlight(highlight, marker);
                    if (self.delegate.rights?.enableAnnotations) {
                      self.delegate.annotationModule
                        .saveAnnotation(highlight[0])
                        .then((anno) => {
                          if (menuItem?.note) {
                            let note = prompt("Add your note here:");
                            anno.highlight.note = note;
                            self.delegate.annotationModule
                              .updateAnnotation(anno)
                              .then(async () => {
                                if (IS_DEV) {
                                  console.log("update highlight " + anno.id);
                                }
                              });
                          }
                        });
                    } else if (self.delegate.rights?.enableBookmarks) {
                      self.delegate.bookmarkModule.saveAnnotation(highlight[0]);
                    }
                  }
                }
              }
              self.callbackComplete();
            }
            itemElement.addEventListener("click", itemEvent);
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
    var self = this;
    function getCssSelector(element: Element): string {
      const options = {
        className: (str: string) => {
          return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
        },
        idName: (str: string) => {
          return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
        },
      };
      return uniqueCssSelector(
        element,
        self.delegate.iframes[0].contentDocument,
        options
      );
    }

    const selectionInfo = getCurrentSelectionInfo(
      self.delegate.iframes[0].contentWindow,
      getCssSelector
    );
    if (selectionInfo) {
      if (this.options.onBeforeHighlight(selectionInfo) === true) {
        var createColor: any;
        createColor = this.getColor();
        if (TextHighlighter.isHexColor(createColor)) {
          createColor = TextHighlighter.hexToRgbChannels(createColor);
        }

        var highlight = this.createHighlight(
          self.dom(self.delegate.iframes[0].contentDocument.body).getWindow(),
          selectionInfo,
          createColor,
          true,
          marker
        );
        this.options.onAfterHighlight(highlight, marker);
        if (
          this.delegate.rights?.enableAnnotations &&
          marker != AnnotationMarker.Bookmark
        ) {
          this.delegate.annotationModule.saveAnnotation(highlight[0]);
        } else if (
          this.delegate.rights?.enableBookmarks &&
          marker == AnnotationMarker.Bookmark
        ) {
          this.delegate.bookmarkModule.saveAnnotation(highlight[0]);
        }
      }

      if (!keepRange) {
        this.dom(
          this.delegate.iframes[0].contentDocument.body
        ).removeAllRanges();
      }
    } else {
      if (!keepRange) {
        this.dom(
          this.delegate.iframes[0].contentDocument.body
        ).removeAllRanges();
      }
    }
  }

  speak() {
    if (this.delegate.rights?.enableTTS) {
      var self = this;
      function getCssSelector(element: Element): string {
        const options = {
          className: (str: string) => {
            return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
          },
          idName: (str: string) => {
            return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
          },
        };
        return uniqueCssSelector(
          element,
          self.delegate.iframes[0].contentDocument,
          options
        );
      }

      const selectionInfo = getCurrentSelectionInfo(
        self.delegate.iframes[0].contentWindow,
        getCssSelector
      );
      if (selectionInfo !== undefined) {
        if (this.delegate.tts?.enableSplitter) {
          (this.delegate.ttsModule as TTSModule).speak(
            selectionInfo as any,
            true,
            () => {}
          );
        } else {
          (this.delegate.ttsModule as TTSModule2).speak(
            selectionInfo as any,
            true,
            () => {}
          );
        }
      }
      if (this.delegate.tts?.enableSplitter) {
        const selection = self
          .dom(self.delegate.iframes[0].contentDocument.body)
          .getSelection();
        selection.removeAllRanges();
        var toolbox = document.getElementById("highlight-toolbox");
        toolbox.style.display = "none";
        this.selectionMenuClosed();
      }
    }
  }
  stopReadAloud() {
    if (this.delegate.rights?.enableTTS) {
      this.doneSpeaking();
    }
  }
  speakAll() {
    if (this.delegate.rights?.enableTTS) {
      var self = this;
      function getCssSelector(element: Element): string {
        const options = {
          className: (str: string) => {
            return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
          },
          idName: (str: string) => {
            return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
          },
        };
        return uniqueCssSelector(
          element,
          self.dom(self.delegate.iframes[0].contentDocument.body).getDocument(),
          options
        );
      }

      const selectionInfo = getCurrentSelectionInfo(
        this.dom(this.delegate.iframes[0].contentDocument.body).getWindow(),
        getCssSelector
      );
      if (selectionInfo !== undefined) {
        self.speak();
      } else {
        var node = this.dom(
          self.delegate.iframes[0].contentDocument.body
        ).getWindow().document.body;
        if (IS_DEV) console.log(self.delegate.iframes[0].contentDocument);
        const selection = self
          .dom(self.delegate.iframes[0].contentDocument.body)
          .getSelection();
        const range = this.dom(self.delegate.iframes[0].contentDocument.body)
          .getWindow()
          .document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
        const selectionInfo = getCurrentSelectionInfo(
          this.delegate.iframes[0].contentWindow,
          getCssSelector
        );

        if (selectionInfo !== undefined && selectionInfo.cleanText) {
          if (this.delegate.tts?.enableSplitter) {
            (this.delegate.ttsModule as TTSModule).speak(
              selectionInfo as any,
              false,
              () => {
                var selection = self
                  .dom(self.delegate.iframes[0].contentDocument.body)
                  .getSelection();
                selection.removeAllRanges();
                self.toolboxHide();
              }
            );
          } else {
            (this.delegate.ttsModule as TTSModule2).speak(
              selectionInfo as any,
              false,
              () => {
                var selection = self
                  .dom(self.delegate.iframes[0].contentDocument.body)
                  .getSelection();
                selection.removeAllRanges();
                self.toolboxHide();
              }
            );
          }
        } else {
          self
            .dom(self.delegate.iframes[0].contentDocument.body)
            .getSelection()
            .removeAllRanges();
          self.toolboxHide();
        }
      }
    }
  }

  callbackComplete() {
    this.toolboxHide();
    this.dom(this.delegate.iframes[0].contentDocument.body).removeAllRanges();
  }

  get visibleTextRects() {
    const body = HTMLUtilities.findRequiredIframeElement(
      this.delegate.iframes[0].contentDocument,
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
          if (element.textContent.trim()) {
            nodes.push(element);
          }
        }
        element = element.nextSibling as Element;
      }
      return nodes;
    }

    function isOutsideViewport(rect): boolean {
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
          textContent: node.textContent,
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
        if (IS_DEV) {
          console.log("measureTextNode " + error);
          console.log("measureTextNode " + node);
          console.log(node.textContent);
        }
      }
    }

    const textNodes = findRects(body);
    const visible = textNodes.filter((rect) => !isOutsideViewport(rect));
    return visible;
  }

  doneSpeaking(reload: boolean = false) {
    if (this.delegate.rights?.enableTTS) {
      this.toolboxHide();
      this.dom(this.delegate.iframes[0].contentDocument.body).removeAllRanges();
      if (this.delegate.tts?.enableSplitter) {
        (this.delegate.ttsModule as TTSModule).cancel();
      } else {
        (this.delegate.ttsModule as TTSModule2).cancel();
      }
      if (reload) {
        this.delegate.reload();
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
    var again,
      self = this;

    self.sortByDepth(highlights, true);

    function flattenOnce() {
      var again = false;

      highlights.forEach(function (hl: any, i: any) {
        var parent = hl.parentElement,
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
    var self = this;

    function shouldMerge(current: any, node: any) {
      return (
        node &&
        node.nodeType === NODE_TYPE.ELEMENT_NODE &&
        self.haveSameColor(current, node) &&
        self.isHighlight(node)
      );
    }

    highlights.forEach(function (highlight: any) {
      var prev = highlight.previousSibling,
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
   * Returns highlights from given container.
   * @param params
   * @param {HTMLElement} [params.container] - return highlights from this element. Default: the element the
   * highlighter is applied to.
   * @param {boolean} [params.andSelf] - if set to true and container is a highlight itself, add container to
   * returned results. Default: true.
   * @param {boolean} [params.grouped] - if set to true, highlights are grouped in logical groups of highlights added
   * in the same moment. Each group is an object which has got array of highlights, 'toString' method and 'timestamp'
   * property. Default: false.
   * @returns {Array} - array of highlights.
   * @memberof TextHighlighter
   */
  getHighlights(params?: any): Array<any> {
    params = this.defaults(params, {
      container: this.delegate.iframes[0].contentDocument.body,
      andSelf: true,
      grouped: false,
    });

    var nodeList = params.container.querySelectorAll("[" + DATA_ATTR + "]"),
      highlights = Array.prototype.slice.call(nodeList);

    if (params.andSelf === true && params.container.hasAttribute(DATA_ATTR)) {
      highlights.push(params.container);
    }

    if (params.grouped) {
      highlights = this.groupHighlights(highlights);
    }

    return highlights;
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
   * Serializes all highlights in the element the highlighter is applied to.
   * @returns {string} - stringified JSON with highlights definition
   * @memberof TextHighlighter
   */
  serializeHighlights(): string {
    var highlights = this.getHighlights(),
      refEl = this.delegate.iframes[0].contentDocument.body,
      hlDescriptors: any = [];

    function getElementPath(el: any, refElement: any) {
      var path = [],
        childNodes;

      do {
        childNodes = Array.prototype.slice.call(el.parentNode.childNodes);
        path.unshift(childNodes.indexOf(el));
        el = el.parentNode;
      } while (el !== refElement || !el);

      return path;
    }

    this.sortByDepth(highlights, false);

    highlights.forEach(function (highlight: any) {
      var offset = 0, // Hl offset from previous sibling within parent node.
        length = highlight.textContent.length,
        hlPath = getElementPath(highlight, refEl),
        wrapper = highlight.cloneNode(true);

      wrapper.innerHTML = "";
      wrapper = wrapper.outerHTML;

      if (
        highlight.previousSibling &&
        highlight.previousSibling.nodeType === NODE_TYPE.TEXT_NODE
      ) {
        offset = highlight.previousSibling.length;
      }

      hlDescriptors.push([
        wrapper,
        highlight.textContent,
        hlPath.join(":"),
        offset,
        length,
      ]);
    });

    return JSON.stringify(hlDescriptors);
  }

  /**
   * Deserializes highlights.
   * @throws exception when can't parse JSON or JSON has invalid structure.
   * @param {object} json - JSON object with highlights definition.
   * @returns {Array} - array of deserialized highlights.
   * @memberof TextHighlighter
   */
  deserializeHighlights(json: any): Array<any> {
    var hlDescriptors,
      highlights: any = [],
      self = this;

    if (!json) {
      return highlights;
    }

    try {
      hlDescriptors = JSON.parse(json);
    } catch (e) {
      throw "Can't parse JSON: " + e;
    }

    function deserializationFn(hlDescriptor: any) {
      var hl = {
          wrapper: hlDescriptor[0],
          text: hlDescriptor[1],
          path: hlDescriptor[2].split(":"),
          offset: hlDescriptor[3],
          length: hlDescriptor[4],
        },
        elIndex = hl.path.pop(),
        node: any = self.delegate.iframes[0].contentDocument.body,
        hlNode,
        highlight,
        idx;

      while (!!(idx = hl.path.shift())) {
        node = node.childNodes[idx];
      }

      if (
        node.childNodes[elIndex - 1] &&
        node.childNodes[elIndex - 1].nodeType === NODE_TYPE.TEXT_NODE
      ) {
        elIndex -= 1;
      }

      node = node.childNodes[elIndex];
      hlNode = node.splitText(hl.offset);
      hlNode.splitText(hl.length);

      if (hlNode.nextSibling && !hlNode.nextSibling.nodeValue) {
        self.dom(hlNode.nextSibling).remove();
      }

      if (hlNode.previousSibling && !hlNode.previousSibling.nodeValue) {
        self.dom(hlNode.previousSibling).remove();
      }

      highlight = self.dom(hlNode).wrap(self.dom().fromHTML(hl.wrapper)[0]);
      highlights.push(highlight);
    }

    hlDescriptors.forEach(function (hlDescriptor: any) {
      try {
        deserializationFn(hlDescriptor);
      } catch (e) {
        if (console && console.warn) {
          console.warn("Can't deserialize highlight descriptor. Cause: " + e);
        }
      }
    });

    return highlights;
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
    var span = document.createElement("mark");
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
    var c: any;
    c = hex.substring(1).split("");
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = "0x" + c.join("");
    return c;
  }

  public static hexToRgbChannels(hex: string) {
    var c: any;
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
    var c: any;
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
    var c: any;
    if (this.isHexColor(hex)) {
      c = this.hexToRgbChannels(hex);
      return "rgba(" + [c.red, c.green, c.blue].join(",") + "," + opacity + ")";
    } else if (typeof hex === "object") {
      let c = hex as IColor;
      return "rgba(" + [c.red, c.green, c.blue].join(",") + "," + opacity + ")";
    }
    throw new Error("Bad Hex");
  }

  resetHighlightBoundingStyle(
    _win: IReadiumIFrameWindow,
    highlightBounding: HTMLElement
  ) {
    highlightBounding.style.outline = "none";
    highlightBounding.style.setProperty(
      "background-color",
      "transparent",
      "important"
    );
  }

  resetHighlightAreaStyle(
    _win: IReadiumIFrameWindow,
    highlightArea: HTMLElement,
    id_container: string
  ) {
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
        } else if (highlight.marker === AnnotationMarker.Underline) {
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
        if (_highlightsContainer && id_container == ID_HIGHLIGHTS_CONTAINER) {
          highlightParent = _highlightsContainer.querySelector(
            `#${highlight.id}`
          );
        }
        if (_highlightsSearchContainer && id_container == ID_SEARCH_CONTAINER) {
          highlightParent = _highlightsSearchContainer.querySelector(
            `#${highlight.id}`
          );
        }
        if (
          _highlightsReadAloudContainer &&
          id_container == ID_READALOUD_CONTAINER
        ) {
          highlightParent = _highlightsReadAloudContainer.querySelector(
            `#${highlight.id}`
          );
        }

        if (
          _highlightsPageBreakContainer &&
          id_container == ID_PAGEBREAK_CONTAINER
        ) {
          highlightParent = _highlightsPageBreakContainer.querySelector(
            `#${highlight.id}`
          );
        }

        let nodeList =
          highlightParent.getElementsByClassName(CLASS_HIGHLIGHT_ICON);
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

  setHighlightAreaStyle(
    _win: IReadiumIFrameWindow,
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
      } else if (highlight.marker === AnnotationMarker.Underline) {
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
      let highlightParent = _highlightsContainer.querySelector(
        `#${highlight.id}`
      );
      let nodeList =
        highlightParent.getElementsByClassName(CLASS_HIGHLIGHT_ICON);
      if (nodeList.length > 0) {
        const tooltip = nodeList.item(0).getElementsByClassName("icon-tooltip");
        if (tooltip.length > 0) {
          (tooltip.item(0) as HTMLElement).style.setProperty(
            "display",
            "block"
          );
        }
      }
    }
  }

  setAndResetSearchHighlight(highlight, highlights) {
    const allHighlightAreas = Array.from(
      _highlightsSearchContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
    );
    for (const highlighta of allHighlightAreas) {
      var highlightArea = highlighta as HTMLElement;
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
            let highlightParent = _highlightsSearchContainer.querySelector(
              `#${highlight.id}`
            );
            let nodeList =
              highlightParent.getElementsByClassName(CLASS_HIGHLIGHT_ICON);
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
          let highlightParent = _highlightsSearchContainer.querySelector(
            `#${highlight.id}`
          );
          let nodeList =
            highlightParent.getElementsByClassName(CLASS_HIGHLIGHT_ICON);
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
  getScrollingElement = (documant: Document): Element => {
    if (documant.scrollingElement) {
      return documant.scrollingElement;
    }
    return documant.body;
  };

  async processMouseEvent(win: IReadiumIFrameWindow, ev: MouseEvent) {
    const documant = win.document;
    // relative to fixed window top-left corner
    // (unlike pageX/Y which is relative to top-left rendered content area, subject to scrolling)
    const x = ev.clientX;
    const y = ev.clientY;

    if (
      !_highlightsContainer &&
      !_highlightsSearchContainer &&
      !_highlightsPageBreakContainer &&
      !_highlightsReadAloudContainer
    ) {
      return;
    }

    const paginated = this.delegate.view.isPaginated();
    const bodyRect = documant.body.getBoundingClientRect();
    const scrollElement = this.getScrollingElement(documant);

    const xOffset = paginated ? -scrollElement.scrollLeft : bodyRect.left;
    const yOffset = paginated ? -scrollElement.scrollTop : bodyRect.top;

    let foundHighlight: IHighlight | undefined;
    let foundElement: IHTMLDivElementWithRect | undefined;

    for (let i = _highlights.length - 1; i >= 0; i--) {
      const highlight = _highlights[i];

      let highlightParent = documant.getElementById(`${highlight.id}`);
      if (!highlightParent) {
        // ??!!
        highlightParent = _highlightsContainer.querySelector(
          `#${highlight.id}`
        ); // .${CLASS_HIGHLIGHT_CONTAINER}
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
        const withRect = highlightFragment as unknown as IWithRect;
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
      if (_highlightsContainer) {
        const highlightBoundings = _highlightsContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );
        for (const highlightBounding of highlightBoundings) {
          this.resetHighlightBoundingStyle(
            win,
            highlightBounding as HTMLElement
          );
        }
      }
      if (_highlightsSearchContainer) {
        const highlightBoundings2 = _highlightsSearchContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );
        for (const highlightBounding of highlightBoundings2) {
          this.resetHighlightBoundingStyle(
            win,
            highlightBounding as HTMLElement
          );
        }
      }
      if (_highlightsReadAloudContainer) {
        const highlightBoundings3 =
          _highlightsReadAloudContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
        for (const highlightBounding of highlightBoundings3) {
          this.resetHighlightBoundingStyle(
            win,
            highlightBounding as HTMLElement
          );
        }
      }
      if (_highlightsPageBreakContainer) {
        const highlightBoundings4 =
          _highlightsPageBreakContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
        for (const highlightBounding of highlightBoundings4) {
          this.resetHighlightBoundingStyle(
            win,
            highlightBounding as HTMLElement
          );
        }
      }

      if (_highlightsContainer) {
        const allHighlightAreas = Array.from(
          _highlightsContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );
        for (const highlightArea of allHighlightAreas) {
          this.resetHighlightAreaStyle(
            win,
            highlightArea as HTMLElement,
            ID_HIGHLIGHTS_CONTAINER
          );
        }
      }
      if (_highlightsSearchContainer) {
        const allHighlightAreas2 = Array.from(
          _highlightsSearchContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_AREA}`
          )
        );
        for (const highlightArea of allHighlightAreas2) {
          this.resetHighlightAreaStyle(
            win,
            highlightArea as HTMLElement,
            ID_SEARCH_CONTAINER
          );
        }
      }
      if (_highlightsReadAloudContainer) {
        const allHighlightAreas3 = Array.from(
          _highlightsReadAloudContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_AREA}`
          )
        );
        for (const highlightArea of allHighlightAreas3) {
          this.resetHighlightAreaStyle(
            win,
            highlightArea as HTMLElement,
            ID_READALOUD_CONTAINER
          );
        }
      }
      if (_highlightsPageBreakContainer) {
        const allHighlightAreas4 = Array.from(
          _highlightsPageBreakContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_AREA}`
          )
        );
        for (const highlightArea of allHighlightAreas4) {
          this.resetHighlightAreaStyle(
            win,
            highlightArea as HTMLElement,
            ID_PAGEBREAK_CONTAINER
          );
        }
      }

      return;
    }

    if (foundElement.getAttribute("data-click")) {
      if (ev.type === "mousemove" || ev.type === "touchmove") {
        const foundElementHighlightAreas = Array.from(
          foundElement.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );
        const allHighlightAreas = _highlightsContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_AREA}`
        );
        const allHighlightAreas2 = _highlightsSearchContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_AREA}`
        );
        const allHighlightAreas3 =
          _highlightsReadAloudContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_AREA}`
          );
        const allHighlightAreas4 =
          _highlightsPageBreakContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_AREA}`
          );

        for (const highlightArea of allHighlightAreas) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              win,
              highlightArea as HTMLElement,
              ID_HIGHLIGHTS_CONTAINER
            );
          }
        }
        for (const highlightArea of allHighlightAreas2) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              win,
              highlightArea as HTMLElement,
              ID_SEARCH_CONTAINER
            );
          }
        }
        for (const highlightArea of allHighlightAreas3) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              win,
              highlightArea as HTMLElement,
              ID_READALOUD_CONTAINER
            );
          }
        }
        for (const highlightArea of allHighlightAreas4) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              win,
              highlightArea as HTMLElement,
              ID_PAGEBREAK_CONTAINER
            );
          }
        }

        this.setHighlightAreaStyle(
          win,
          foundElementHighlightAreas as HTMLElement[],
          foundHighlight
        );

        const foundElementHighlightBounding = foundElement.querySelector(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );
        const allHighlightBoundings = _highlightsContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );
        const allHighlightBoundings2 =
          _highlightsSearchContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
        const allHighlightBoundings3 =
          _highlightsReadAloudContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
        const allHighlightBoundings4 =
          _highlightsPageBreakContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );

        for (const highlightBounding of allHighlightBoundings) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(
              win,
              highlightBounding as HTMLElement
            );
          }
        }
        for (const highlightBounding of allHighlightBoundings2) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(
              win,
              highlightBounding as HTMLElement
            );
          }
        }
        for (const highlightBounding of allHighlightBoundings3) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(
              win,
              highlightBounding as HTMLElement
            );
          }
        }
        for (const highlightBounding of allHighlightBoundings4) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(
              win,
              highlightBounding as HTMLElement
            );
          }
        }
      } else if (
        ev.type === "mouseup" ||
        ev.type === "click" ||
        ev.type === "touchup"
      ) {
        const payload: IEventPayload_R2_EVENT_HIGHLIGHT_CLICK = {
          highlight: foundHighlight,
        };
        if (IS_DEV) {
          console.log(payload);
        }
        var self = this;
        var anno;
        if (self.delegate.rights?.enableAnnotations) {
          anno = (await this.delegate.annotationModule.getAnnotation(
            payload.highlight
          )) as Annotation;
        } else if (self.delegate.rights?.enableBookmarks) {
          anno = (await this.delegate.bookmarkModule.getAnnotation(
            payload.highlight
          )) as Annotation;
        }

        this.delegate.annotationModule.api
          ?.selectedAnnotation(anno)
          .then(async () => {});

        if (IS_DEV) {
          console.log("selected highlight " + anno.id);
        }
        self.lastSelectedHighlight = anno.id;

        var toolbox = document.getElementById("highlight-toolbox");

        toolbox.style.top =
          ev.clientY + (this.delegate.attributes?.navHeight ?? 0) + "px";
        toolbox.style.left = ev.clientX + "px";

        if (getComputedStyle(toolbox).display === "none") {
          toolbox.style.display = "block";

          this.toolboxMode("edit");

          var colorIcon = document.getElementById("colorIcon");
          var highlightIcon = document.getElementById("highlightIcon");

          if (colorIcon) {
            colorIcon.style.display = "none";
          }
          highlightIcon.style.display = "none";

          function noteH() {
            let note = prompt("Add your note here:");
            anno.highlight.note = note;
            self.delegate.annotationModule
              .updateAnnotation(anno)
              .then(async () => {
                if (IS_DEV) {
                  console.log("update highlight " + anno.id);
                }
                toolbox.style.display = "none";
                self.selectionMenuClosed();
              });

            toolbox.style.display = "none";
            self.selectionMenuClosed();
            commentIcon.removeEventListener("click", noteH, false);
          }
          let commentIcon = document.getElementById("commentIcon");
          let cloneCommentIcon = document.getElementById("cloneCommentIcon");
          if (cloneCommentIcon) {
            let parent = cloneCommentIcon.parentElement;
            parent.removeChild(cloneCommentIcon);
          }
          if (commentIcon) {
            commentIcon.style.display = "none";
            let clone = commentIcon.cloneNode(true) as HTMLButtonElement;
            let parent = commentIcon.parentElement;
            clone.style.display = "unset";
            clone.id = "cloneCommentIcon";
            clone.addEventListener("click", noteH, false);
            parent.append(clone);
          }

          function deleteH() {
            if (self.delegate.rights?.enableAnnotations) {
              self.delegate.annotationModule
                .deleteSelectedHighlight(anno)
                .then(async () => {
                  if (IS_DEV) {
                    console.log("delete highlight " + anno.id);
                  }
                  toolbox.style.display = "none";
                  self.selectionMenuClosed();
                });
            } else if (self.delegate.rights?.enableBookmarks) {
              self.delegate.bookmarkModule
                .deleteSelectedHighlight(anno)
                .then(async () => {
                  if (IS_DEV) {
                    console.log("delete highlight " + anno.id);
                  }
                  toolbox.style.display = "none";
                  self.selectionMenuClosed();
                });
            }
          }

          let deleteIcon = document.getElementById("deleteIcon");
          let cloneDeleteIcon = document.getElementById("cloneDeleteIcon");
          if (cloneDeleteIcon) {
            let parent = cloneDeleteIcon.parentElement;
            parent.removeChild(cloneDeleteIcon);
          }
          if (deleteIcon) {
            deleteIcon.style.display = "none";
            let clone = deleteIcon.cloneNode(true) as HTMLButtonElement;
            let parent = deleteIcon.parentElement;
            clone.style.display = "unset";
            clone.id = "cloneDeleteIcon";
            clone.addEventListener("click", deleteH, false);
            parent.append(clone);
          }
        } else {
          toolbox.style.display = "none";
          this.selectionMenuClosed();
          void toolbox.offsetWidth;
          toolbox.style.display = "block";
        }
      }
    }
  }

  ensureHighlightsContainer(
    win: IReadiumIFrameWindow,
    id: string
  ): HTMLElement {
    const documant = win.document;
    var self = this;
    if (
      (!_highlightsContainer && id == ID_HIGHLIGHTS_CONTAINER) ||
      (!_highlightsSearchContainer && id == ID_SEARCH_CONTAINER) ||
      (!_highlightsReadAloudContainer && id == ID_READALOUD_CONTAINER) ||
      (!_highlightsPageBreakContainer && id == ID_PAGEBREAK_CONTAINER)
    ) {
      if (!bodyEventListenersSet) {
        bodyEventListenersSet = true;

        async function mousedown(ev: MouseEvent) {
          lastMouseDownX = ev.clientX;
          lastMouseDownY = ev.clientY;
        }

        async function mouseup(ev: MouseEvent) {
          if (
            Math.abs(lastMouseDownX - ev.clientX) < 3 &&
            Math.abs(lastMouseDownY - ev.clientY) < 3
          ) {
            self.processMouseEvent(win, ev);
          }
        }
        async function mousemove(ev: MouseEvent) {
          self.processMouseEvent(win, ev);
        }

        documant.body.addEventListener("mousedown", mousedown, false);
        documant.body.addEventListener("mouseup", mouseup, false);
        documant.body.addEventListener("mousemove", mousemove, false);

        documant.body.addEventListener("touchstart", mousedown, false);
        documant.body.addEventListener("touchend", mouseup, false);
        documant.body.addEventListener("touchmove", mousemove, false);
      }

      if (id == ID_HIGHLIGHTS_CONTAINER) {
        _highlightsContainer = documant.createElement("div");
        _highlightsContainer.setAttribute("id", id);
        _highlightsContainer.style.setProperty("pointer-events", "none");
        documant.body.append(_highlightsContainer);
      } else if (id == ID_SEARCH_CONTAINER) {
        _highlightsSearchContainer = documant.createElement("div");
        _highlightsSearchContainer.setAttribute("id", id);
        _highlightsSearchContainer.style.setProperty("pointer-events", "none");
        documant.body.append(_highlightsSearchContainer);
      } else if (id == ID_READALOUD_CONTAINER) {
        _highlightsReadAloudContainer = documant.createElement("div");
        _highlightsReadAloudContainer.setAttribute("id", id);
        _highlightsReadAloudContainer.style.setProperty(
          "pointer-events",
          "none"
        );
        documant.body.append(_highlightsReadAloudContainer);
      } else if (id == ID_PAGEBREAK_CONTAINER) {
        _highlightsPageBreakContainer = documant.createElement("div");
        _highlightsPageBreakContainer.setAttribute("id", id);
        _highlightsPageBreakContainer.style.setProperty(
          "pointer-events",
          "none"
        );
        documant.body.append(_highlightsPageBreakContainer);
      }
    }
    if (id == ID_HIGHLIGHTS_CONTAINER) {
      return _highlightsContainer;
    } else if (id == ID_SEARCH_CONTAINER) {
      return _highlightsSearchContainer;
    } else if (id == ID_READALOUD_CONTAINER) {
      return _highlightsReadAloudContainer;
    } else if (id == ID_PAGEBREAK_CONTAINER) {
      return _highlightsPageBreakContainer;
    }
    return _highlightsContainer;
  }

  hideAllhighlights(_documant: Document) {
    if (_highlightsContainer) {
      _highlightsContainer.remove();
      _highlightsContainer = null;
    }
    if (_highlightsSearchContainer) {
      _highlightsSearchContainer.remove();
      _highlightsSearchContainer = null;
    }
    if (_highlightsReadAloudContainer) {
      _highlightsReadAloudContainer.remove();
      _highlightsReadAloudContainer = null;
    }
    if (_highlightsPageBreakContainer) {
      _highlightsPageBreakContainer.remove();
      _highlightsPageBreakContainer = null;
    }
  }

  destroyAllhighlights(documant: Document) {
    this.hideAllhighlights(documant);
    _highlights.splice(0, _highlights.length);
  }

  destroyHighlights(type: HighlightType) {
    switch (type) {
      case HighlightType.ReadAloud:
        if (_highlightsReadAloudContainer) {
          _highlightsReadAloudContainer.remove();
          _highlightsReadAloudContainer = null;
        }
        break;
      case HighlightType.Search:
        if (_highlightsSearchContainer) {
          _highlightsSearchContainer.remove();
          _highlightsSearchContainer = null;
        }
        break;
      case HighlightType.PageBreak:
        if (_highlightsPageBreakContainer) {
          _highlightsPageBreakContainer.remove();
          _highlightsPageBreakContainer = null;
        }
        break;
      default:
        if (_highlightsContainer) {
          _highlightsContainer.remove();
          _highlightsContainer = null;
        }
        _highlights.splice(0, _highlights.length);
        break;
    }
  }

  destroyHighlight(documant: Document, id: string) {
    let i = -1;
    const highlight = _highlights.find((h, j) => {
      i = j;
      return h.id === id;
    });
    if (highlight && i >= 0 && i < _highlights.length) {
      _highlights.splice(i, 1);
    }

    const highlightContainer = documant.getElementById(id);
    if (highlightContainer) {
      highlightContainer.remove();
    }
  }

  recreateAllHighlightsRaw(win: IReadiumIFrameWindow) {
    this.hideAllhighlights(win.document);
    for (const highlight of _highlights) {
      this.createHighlightDom(win, highlight);
    }
  }

  recreateAllHighlightsDebounced = debounce((win: IReadiumIFrameWindow) => {
    this.recreateAllHighlightsRaw(win);
  }, 500);

  recreateAllHighlights(win: IReadiumIFrameWindow) {
    this.hideAllhighlights(win.document);
    this.recreateAllHighlightsDebounced(win);
  }

  createSearchHighlight(selectionInfo: ISelectionInfo, color: string) {
    try {
      var createColor: any = color;
      if (TextHighlighter.isHexColor(createColor)) {
        createColor = TextHighlighter.hexToRgbChannels(createColor);
      }

      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = "R2_SEARCH_" + sha256Hex;

      var pointerInteraction = false;
      const highlight: IHighlight = {
        color: createColor ? createColor : DEFAULT_BACKGROUND_COLOR,
        id,
        pointerInteraction,
        selectionInfo,
        marker: AnnotationMarker.Highlight,
        type: HighlightType.Search,
      };
      _highlights.push(highlight);

      let highlightDom = this.createHighlightDom(
        this.delegate.iframes[0].contentWindow as any,
        highlight
      );
      highlight.position = parseInt(
        (
          (highlightDom.hasChildNodes
            ? highlightDom.childNodes[0]
            : highlightDom) as HTMLDivElement
        ).style.top.replace("px", "")
      );
      return highlight;
    } catch (e) {
      throw "Can't create highlight: " + e;
    }
  }
  createPageBreakHighlight(selectionInfo: ISelectionInfo, title: string) {
    try {
      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = "R2_PAGEBREAK_" + sha256Hex;

      var pointerInteraction = false;

      const highlight: IHighlight = {
        color: "#000000",
        id,
        pointerInteraction,
        selectionInfo,
        marker: AnnotationMarker.Custom,
        icon: {
          id: `pageBreak`,
          title: title,
          color: `#000000`,
          position: "left",
        },
        type: HighlightType.PageBreak,
      };
      _highlights.push(highlight);

      let highlightDom = this.createHighlightDom(
        this.delegate.iframes[0].contentWindow as any,
        highlight
      );
      highlight.position = parseInt(
        (
          (highlightDom.hasChildNodes
            ? highlightDom.childNodes[0]
            : highlightDom) as HTMLDivElement
        ).style.top.replace("px", "")
      );
      return highlight;
    } catch (e) {
      throw "Can't create highlight: " + e;
    }
  }

  createHighlight(
    win: IReadiumIFrameWindow,
    selectionInfo: ISelectionInfo,
    color: string | undefined,
    pointerInteraction: boolean,
    marker: AnnotationMarker,
    icon?: IMarkerIcon | undefined,
    popup?: IPopupStyle | undefined,
    style?: IStyle | undefined,
    type?: HighlightType | undefined,
    prefix?: string | undefined
  ): [IHighlight, HTMLDivElement] {
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
      if (type == HighlightType.Annotation || type == undefined) {
        _highlights.push(highlight);
      }

      let highlightDom = this.createHighlightDom(win, highlight);
      highlight.position = parseInt(
        (
          (highlightDom.hasChildNodes
            ? highlightDom.childNodes[0]
            : highlightDom) as HTMLDivElement
        ).style.top.replace("px", "")
      );

      return [highlight, highlightDom];
    } catch (e) {
      throw "Can't create highlight: " + e;
    }
  }
  createHighlightDom(
    win: IReadiumIFrameWindow,
    highlight: IHighlight
  ): HTMLDivElement | undefined {
    const documant = win.document;

    const range = convertRangeInfo(documant, highlight.selectionInfo.rangeInfo);
    if (!range) {
      return undefined;
    }

    const highlightsContainer = this.ensureHighlightsContainer(
      win,
      ID_HIGHLIGHTS_CONTAINER
    );
    const highlightsReadaloudContainer = this.ensureHighlightsContainer(
      win,
      ID_READALOUD_CONTAINER
    );
    const highlightsPageBreakContainer = this.ensureHighlightsContainer(
      win,
      ID_PAGEBREAK_CONTAINER
    );
    const highlightsSearchContainer = this.ensureHighlightsContainer(
      win,
      ID_SEARCH_CONTAINER
    );

    const highlightParent = documant.createElement(
      "div"
    ) as IHTMLDivElementWithRect;
    highlightParent.setAttribute("id", highlight.id);
    highlightParent.setAttribute("class", CLASS_HIGHLIGHT_CONTAINER);
    highlightParent.style.setProperty("pointer-events", "none");
    if (highlight.pointerInteraction) {
      highlightParent.setAttribute("data-click", "1");
    }

    const paginated = this.delegate.view.isPaginated();

    // Resize Sensor sets body position to "relative" (default static),
    // which may breaks things!
    // (e.g. highlights CSS absolute/fixed positioning)
    // Also note that ReadiumCSS default to (via stylesheet :root):

    if (paginated) {
      documant.body.style.position = "revert";
    } else {
      documant.body.style.position = "relative";
    }
    const bodyRect = documant.body.getBoundingClientRect();
    const scrollElement = this.getScrollingElement(documant);

    const xOffset = paginated ? -scrollElement.scrollLeft : bodyRect.left;
    const yOffset = paginated ? -scrollElement.scrollTop : bodyRect.top;

    const scale = 1;

    let drawUnderline = false;
    let drawStrikeThrough = false;
    let drawBackground = false;

    const doNotMergeHorizontallyAlignedRects =
      drawUnderline || drawStrikeThrough || drawBackground;

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
      const highlightArea = documant.createElement(
        "div"
      ) as IHTMLDivElementWithRect;
      highlightArea.setAttribute("class", CLASS_HIGHLIGHT_AREA);
      highlightArea.dataset.marker = "" + highlight.marker;

      let extra = "";
      if (
        drawUnderline &&
        highlight.marker !== AnnotationMarker.Custom &&
        highlight.marker !== AnnotationMarker.Bookmark
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
      } else if (highlight.marker === AnnotationMarker.Underline) {
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
      highlightArea.style.width = `${highlightArea.rect.width * scale}px`;
      highlightArea.style.height = `${highlightArea.rect.height * scale}px`;
      highlightArea.style.left = `${highlightArea.rect.left * scale}px`;
      highlightArea.style.top = `${highlightArea.rect.top * scale}px`;

      highlightParent.append(highlightArea);

      let top = parseInt(highlightArea.style.top.replace("px", ""));
      if (top < position || position == 0) {
        position = top;
      }

      size = parseInt(highlightArea.style.height.replace("px", ""));
      if (drawStrikeThrough) {
        const highlightAreaLine = documant.createElement(
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

      let viewportWidth = this.delegate.iframes[0].contentWindow.innerWidth;
      let columnCount = parseInt(
        getComputedStyle(
          this.delegate.iframes[0].contentDocument.documentElement
        ).getPropertyValue("column-count")
      );

      let columnWidth = parseInt(
        getComputedStyle(
          this.delegate.iframes[0].contentDocument.documentElement
        ).getPropertyValue("column-width")
      );
      let padding = parseInt(
        getComputedStyle(
          this.delegate.iframes[0].contentDocument.body
        ).getPropertyValue("padding-left")
      );

      let pageWidth = viewportWidth / (columnCount || 1);
      if (pageWidth < columnWidth) {
        pageWidth = viewportWidth;
      }
      if (!paginated) {
        pageWidth = parseInt(
          getComputedStyle(
            this.delegate.iframes[0].contentDocument.body
          ).width.replace("px", "")
        );
      }

      let ratio = this.delegate.settings.fontSize / 100;
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
        this.delegate.iframes[0].contentDocument.documentElement.style.getPropertyValue(
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
            this.delegate.iframes[0].contentDocument.body
          ).width.replace("px", "")
        );
        right =
          parseInt(
            getComputedStyle(
              this.delegate.iframes[0].contentDocument.body
            ).width.replace("px", "")
          ) - pageWidth;

        if (pagemargin >= 2) {
          right = right + padding / 2;
          left = left - padding / 2;
        }
      }
    }

    const rangeBoundingClientRect = range.getBoundingClientRect();
    const highlightBounding = documant.createElement(
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

    const highlightAreaIcon = documant.createElement("div");
    highlightAreaIcon.setAttribute("class", CLASS_HIGHLIGHT_ICON);

    if (highlight.icon?.position === "left") {
      highlightAreaIcon.setAttribute(
        "style",
        `position: absolute;top:${position}px;left:${
          right +
          this.delegate.iframes[0].contentDocument.scrollingElement.scrollLeft
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
    } else {
      if (
        highlight.note &&
        highlight.marker !== AnnotationMarker.Custom &&
        highlight.marker !== AnnotationMarker.Bookmark
      ) {
        highlightAreaIcon.setAttribute(
          "style",
          `position: absolute;top:${position - size / 2}px;left:${
            parseInt(highlightBounding.style.left.replace("px", "")) +
            parseInt(highlightBounding.style.width.replace("px", "")) -
            size / 2
          }px;height:${size}px; width:${size}px;`
        );
      } else {
        highlightAreaIcon.setAttribute(
          "style",
          `position: absolute;top:${position}px;left:${
            left +
            this.delegate.iframes[0].contentDocument.scrollingElement.scrollLeft
          }px;height:${size}px; width:${size}px;`
        );
      }
    }

    if (
      highlight.marker === AnnotationMarker.Custom ||
      highlight.marker === AnnotationMarker.Bookmark
    ) {
      if (highlight.icon?.class) {
        highlightAreaIcon.classList.add(highlight.icon.class);
        highlightAreaIcon.id = highlight.icon.id;
      } else if (highlight.icon.svgPath) {
        highlightAreaIcon.innerHTML = iconTemplateColored(
          `${highlight.icon.id}`,
          `${highlight.icon.title}`,
          `${highlight.icon.svgPath}`,
          `icon open`,
          size,
          `${highlight.icon.color} !important`
        );
      } else {
        highlightAreaIcon.innerHTML = highlight.icon.title;
      }
    } else {
      if (highlight.note) {
        let color: any = highlight.color;
        if (TextHighlighter.isHexColor(color)) {
          color = TextHighlighter.hexToRgbChannels(color);
        }
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

    highlightAreaIcon.style.setProperty("pointer-events", "all");
    let self = this;
    if (highlight.type != HighlightType.PageBreak) {
      highlightAreaIcon.addEventListener("click", async function (ev) {
        var anno;
        if (self.delegate.rights?.enableAnnotations) {
          anno = (await self.delegate.annotationModule.getAnnotationByID(
            highlight.id
          )) as Annotation;
          self.delegate.annotationModule.api
            ?.selectedAnnotation(anno)
            .then(async () => {});
        } else if (self.delegate.rights?.enableBookmarks) {
          anno = (await self.delegate.bookmarkModule.getAnnotationByID(
            highlight.id
          )) as Annotation;
        }

        if (IS_DEV) {
          console.log("selected highlight " + anno.id);
        }

        self.lastSelectedHighlight = anno.id;
        var toolbox = document.getElementById("highlight-toolbox");
        toolbox.style.top =
          ev.clientY + (self.delegate.attributes?.navHeight ?? 0) + "px";
        toolbox.style.left = ev.clientX + "px";

        if (getComputedStyle(toolbox).display === "none") {
          toolbox.style.display = "block";

          self.toolboxMode("edit");

          var colorIcon = document.getElementById("colorIcon");
          var highlightIcon = document.getElementById("highlightIcon");
          if (colorIcon) {
            colorIcon.style.display = "none";
          }
          highlightIcon.style.display = "none";

          function noteH() {
            let note = prompt("Add your note here:");
            anno.highlight.note = note;

            self.delegate.annotationModule
              .updateAnnotation(anno)
              .then(async () => {
                if (IS_DEV) {
                  console.log("update highlight " + anno.id);
                }
                toolbox.style.display = "none";
                self.selectionMenuClosed();
              });

            toolbox.style.display = "none";
            self.selectionMenuClosed();
          }
          let commentIcon = document.getElementById("commentIcon");
          let cloneCommentIcon = document.getElementById("cloneCommentIcon");
          if (cloneCommentIcon) {
            let parent = cloneCommentIcon.parentElement;
            parent.removeChild(cloneCommentIcon);
          }
          if (commentIcon) {
            commentIcon.style.display = "none";
            let clone = commentIcon.cloneNode(true) as HTMLButtonElement;
            let parent = commentIcon.parentElement;
            clone.style.display = "unset";
            clone.id = "cloneCommentIcon";
            clone.addEventListener("click", noteH, false);
            parent.append(clone);
          }

          function deleteH() {
            if (self.delegate.rights?.enableAnnotations) {
              self.delegate.annotationModule
                .deleteSelectedHighlight(anno)
                .then(async () => {
                  if (IS_DEV) {
                    console.log("delete highlight " + anno.id);
                  }
                  toolbox.style.display = "none";
                  self.selectionMenuClosed();
                });
            } else if (self.delegate.rights?.enableBookmarks) {
              self.delegate.bookmarkModule
                .deleteSelectedHighlight(anno)
                .then(async () => {
                  if (IS_DEV) {
                    console.log("delete highlight " + anno.id);
                  }
                  toolbox.style.display = "none";
                  self.selectionMenuClosed();
                });
            }
          }
          let deleteIcon = document.getElementById("deleteIcon");
          let cloneDeleteIcon = document.getElementById("cloneDeleteIcon");
          if (cloneDeleteIcon) {
            let parent = cloneDeleteIcon.parentElement;
            parent.removeChild(cloneDeleteIcon);
          }
          if (deleteIcon) {
            deleteIcon.style.display = "none";
            let clone = deleteIcon.cloneNode(true) as HTMLButtonElement;
            let parent = deleteIcon.parentElement;
            clone.style.display = "unset";
            clone.id = "cloneDeleteIcon";
            clone.addEventListener("click", deleteH, false);
            parent.append(clone);
          }
        } else {
          toolbox.style.display = "none";
          self.selectionMenuClosed();
          void toolbox.offsetWidth;
          toolbox.style.display = "block";
        }

        const foundElementHighlightAreas = Array.from(
          highlightParent.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );
        self.setHighlightAreaStyle(
          win,
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
      highlightAreaIcon.insertBefore(tooltip, highlightAreaIcon.childNodes[0]);
    }
    if (
      highlight.note ||
      highlight.marker === AnnotationMarker.Custom ||
      highlight.marker === AnnotationMarker.Bookmark
    ) {
      highlightParent.append(highlightAreaIcon);
    }

    switch (highlight.type) {
      case HighlightType.Search:
        highlightsSearchContainer.append(highlightParent);
        break;
      case HighlightType.ReadAloud:
        highlightsReadaloudContainer.append(highlightParent);
        break;
      case HighlightType.PageBreak:
        highlightsPageBreakContainer.append(highlightParent);
        break;
      default:
        highlightsContainer.append(highlightParent);
        break;
    }

    return highlightParent;
  }
}
