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
import { IS_DEV } from "../../utils";
import { icons, iconTemplateColored } from "../../utils/IconLib";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import TTSModule from "../TTS/TTSModule";
import TTSModule2 from "../TTS/TTSModule2";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import * as lodash from "lodash";
import Popup from "../search/Popup";

export const ID_HIGHLIGHTS_CONTAINER = "R2_ID_HIGHLIGHTS_CONTAINER";
export const ID_READALOUD_CONTAINER = "R2_ID_READALOUD_CONTAINER";
export const ID_PAGEBREAK_CONTAINER = "R2_ID_PAGEBREAK_CONTAINER";
export const ID_SEARCH_CONTAINER = "R2_ID_SEARCH_CONTAINER";
export const ID_POPUP_CONTAINER = "R2_ID_POPUP_CONTAINER";

export const CLASS_HIGHLIGHT_CONTAINER = "R2_CLASS_HIGHLIGHT_CONTAINER";
export const CLASS_HIGHLIGHT_AREA = "R2_CLASS_HIGHLIGHT_AREA";
export const CLASS_HIGHLIGHT_ICON = "R2_CLASS_HIGHLIGHT_ICON";
export const CLASS_HIGHLIGHT_BOUNDING_AREA = "R2_CLASS_HIGHLIGHT_BOUNDING_AREA";

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

let NODE_TYPE = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
};

const _blacklistIdClassForCssSelectors = [
  ID_HIGHLIGHTS_CONTAINER,
  ID_PAGEBREAK_CONTAINER,
  ID_SEARCH_CONTAINER,
  ID_READALOUD_CONTAINER,
  ID_POPUP_CONTAINER,
  CLASS_HIGHLIGHT_CONTAINER,
  CLASS_HIGHLIGHT_AREA,
  CLASS_HIGHLIGHT_BOUNDING_AREA,
];

let lastMouseDownX = -1;
let lastMouseDownY = -1;
let bodyEventListenersSet = false;
let bodyEventListenersSet2 = false;

export interface TextHighlighterProperties {
  selectionMenuItems: Array<SelectionMenuItem>;
}

export interface TextHighlighterConfig extends TextHighlighterProperties {
  delegate: IFrameNavigator;
  api: TextSelectorAPI;
}

export default class TextHighlighter {
  private options: any;
  private readonly delegate: IFrameNavigator;
  properties: TextHighlighterProperties;
  private api: TextSelectorAPI;
  private hasEventListener: boolean;
  activeAnnotationMarkerId?: string = undefined;

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
    for (let index = 0; index < this.delegate.iframes.length; index++) {
      let iframe = this.delegate.iframes[index];
      this.dom(iframe.contentDocument.body).addClass(this.options.contextClass);
      this.bindEvents(index, this.hasEventListener);
    }

    this.initializeToolbox();

    lastMouseDownX = -1;
    lastMouseDownY = -1;
    bodyEventListenersSet = false;
    bodyEventListenersSet2 = false;
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

  bindEvents(iframeIndex: number, hasEventListener: boolean) {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    iframeDocument.addEventListener(
      "keyup",
      this.toolboxShowDelayed.bind(this, iframeIndex)
    );
    iframeBody.addEventListener(
      "mouseup",
      this.toolboxShowDelayed.bind(this, iframeIndex)
    );
    iframeBody.addEventListener(
      "touchend",
      this.toolboxShowDelayed.bind(this, iframeIndex)
    );
    iframeDocument.addEventListener(
      "selectstart",
      this.toolboxShowDelayed.bind(this, iframeIndex)
    );

    if (!hasEventListener) {
      window.addEventListener(
        "resize",
        this.toolboxPlacement.bind(this, iframeIndex)
      );
    }
    iframeDocument.addEventListener(
      "selectionchange",
      this.toolboxPlacement.bind(this, iframeIndex)
    );

    iframeBody.addEventListener("mousedown", this.toolboxHide.bind(this));
    iframeBody.addEventListener("touchstart", this.toolboxHide.bind(this));

    if (this.isAndroid()) {
      iframeBody.addEventListener("contextmenu", this.disableContext);
    }

    this.hasEventListener = true;
  }

  unbindEvents(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    iframeDocument.removeEventListener(
      "keyup",
      this.toolboxShowDelayed.bind(this)
    );
    iframeBody.removeEventListener(
      "mouseup",
      this.toolboxShowDelayed.bind(this)
    );
    iframeBody.removeEventListener(
      "touchend",
      this.toolboxShowDelayed.bind(this)
    );
    iframeDocument.removeEventListener(
      "selectstart",
      this.toolboxShowDelayed.bind(this)
    );

    window.removeEventListener("resize", this.toolboxPlacement.bind(this));
    iframeDocument.removeEventListener(
      "selectionchange",
      this.toolboxPlacement.bind(this)
    );

    iframeBody.removeEventListener("mousedown", this.toolboxHide.bind(this));
    iframeBody.removeEventListener("touchstart", this.toolboxHide.bind(this));

    if (this.isAndroid()) {
      iframeBody.removeEventListener("contextmenu", this.disableContext);
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
    for (
      let iframeIndex = 0;
      iframeIndex < this.delegate.iframes.length;
      iframeIndex++
    ) {
      this.unbindEvents(iframeIndex);
      this.dom(
        this.delegate.iframes[iframeIndex].contentDocument.body
      ).removeClass(this.options.contextClass);
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
  toolboxShowDelayed(iframeIndex: number) {
    let self = this;
    setTimeout(function () {
      if (!self.isAndroid()) {
        self.snapSelectionToWord(iframeIndex);
      }
      self.toolboxShow(iframeIndex);
    }, 100);
  }

  snapSelectionToWord(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    let el = iframe.contentDocument.body;

    let self = this;
    // Check for existence of window.getSelection() and that it has a
    // modify() method. IE 9 has both selection APIs but no modify() method.
    if (self.dom(el)) {
      var selection = self.dom(el).getWindow().getSelection();
      if (!selection.isCollapsed) {
        // Detect if selection is backwards
        let range = document.createRange();
        range.setStart(selection.anchorNode, selection.anchorOffset);
        range.setEnd(selection.focusNode, selection.focusOffset);
        let backwards = range.collapsed;
        range.detach();

        // modify() works on the focus of the selection
        let endNode = selection.focusNode,
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
        this.selection(selection.toString(), selection);
      }
    }

    return selection;
  }

  toolboxShow(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    let el = iframe.contentDocument.body;

    if (this.activeAnnotationMarkerId == undefined) {
      let self = this;
      let toolboxAddOptions = document.getElementById(
        "highlight-toolbox-mode-add"
      );
      let range = this.dom(el).getRange();

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
        el.removeEventListener(
          "selectionchange",
          this.toolboxPlacement.bind(this)
        );
        setTimeout(function () {
          let selection = self.dom(el).getSelection();
          selection.removeAllRanges();
          setTimeout(function () {
            selection.addRange(range);
          }, 5);
        }, 100);
      }

      this.toolboxPlacement(iframeIndex);
      this.toolboxHandler(iframeIndex);
    }
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
      for (let index = 0; index < this.delegate.iframes.length; index++) {
        this.dom(
          this.delegate.iframes[index].contentDocument.body
        ).removeAllRanges();
      }
      this.isSelectionMenuOpen = false;
      if (this.api?.selectionMenuClose) this.api?.selectionMenuClose();
    }
  }, 100);
  selection = debounce((text, selection) => {
    if (this.api?.selection) this.api?.selection(text, selection);
  }, 100);

  toolboxPlacement(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    let el = iframe.contentDocument.body;

    let range = this.dom(el).getRange();
    if (!range || range.collapsed) {
      return;
    }

    let iframeRect = iframe.getBoundingClientRect();
    let rect = range.getBoundingClientRect();
    let toolbox = document.getElementById("highlight-toolbox");

    if (toolbox) {
      toolbox.style.top =
        rect.top + (this.delegate.attributes?.navHeight ?? 0) + "px";
      toolbox.style.left = (rect.right - rect.left) / 2 + rect.left + "px";
      if (this.delegate.view.layout === "fixed") {
        toolbox.style.left =
          iframeRect.left + (rect.right - rect.left) / 2 + rect.left + "px";
      }
    }
  }

  toolboxHandler(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

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
              self.doHighlight(iframeIndex, false, AnnotationMarker.Highlight);
              self.toolboxHide();
              highlightIcon.removeEventListener("click", highlightEvent);
            }
            highlightIcon.addEventListener("click", highlightEvent);
          }
          if (underlineIcon) {
            function commentEvent() {
              self.doHighlight(iframeIndex, false, AnnotationMarker.Underline);
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
              self.speak(iframeIndex);
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
                  iframe.contentDocument,
                  options
                );
              }

              const selectionInfo = getCurrentSelectionInfo(
                iframe.contentWindow,
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
                      iframeIndex,
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
                        .saveAnnotation(highlight[0], iframe.src)
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
              self.callbackComplete(iframeIndex);
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
  doHighlight(
    iframeIndex: number,
    keepRange?: boolean,
    marker?: AnnotationMarker
  ) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    function getCssSelector(element: Element): string {
      const options = {
        className: (str: string) => {
          return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
        },
        idName: (str: string) => {
          return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
        },
      };
      return uniqueCssSelector(element, iframe.contentDocument, options);
    }

    const selectionInfo = getCurrentSelectionInfo(
      iframe.contentWindow,
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
          iframeIndex,
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
          this.delegate.annotationModule.saveAnnotation(
            highlight[0],
            iframe.src
          );
        } else if (
          this.delegate.rights?.enableBookmarks &&
          marker == AnnotationMarker.Bookmark
        ) {
          this.delegate.bookmarkModule.saveAnnotation(highlight[0]);
        }
      }

      if (!keepRange) {
        this.dom(iframe.contentDocument.body).removeAllRanges();
      }
    } else {
      if (!keepRange) {
        this.dom(iframe.contentDocument.body).removeAllRanges();
      }
    }
  }

  speak(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

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
        return uniqueCssSelector(element, iframe.contentDocument, options);
      }

      const selectionInfo = getCurrentSelectionInfo(
        iframe.contentWindow,
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
      const selection = self
        .dom(self.delegate.iframes[0].contentDocument.body)
        .getSelection();
      selection.removeAllRanges();
      const toolbox = document.getElementById("highlight-toolbox");
      toolbox.style.display = "none";
      this.selectionMenuClosed();
    }
  }
  stopReadAloud(iframeIndex: number) {
    // let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    if (this.delegate.rights?.enableTTS) {
      this.doneSpeaking(iframeIndex);
    }
  }

  speakAll(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

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
          self.dom(iframeBody).getDocument(),
          options
        );
      }

      const selectionInfo = getCurrentSelectionInfo(
        this.dom(iframeBody).getWindow(),
        getCssSelector
      );
      if (selectionInfo !== undefined) {
        self.speak(iframeIndex);
      } else {
        var node = this.dom(iframeBody).getWindow().document.body;
        if (IS_DEV) console.log(iframe.contentDocument);
        const selection = self.dom(iframeBody).getSelection();
        const range = this.dom(iframeBody).getWindow().document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
        const selectionInfo = getCurrentSelectionInfo(
          iframe.contentWindow,
          getCssSelector
        );

        if (selectionInfo !== undefined && selectionInfo.cleanText) {
          if (this.delegate.tts?.enableSplitter) {
            (this.delegate.ttsModule as TTSModule).speak(
              selectionInfo as any,
              false,
              () => {
                var selection = self.dom(iframeBody).getSelection();
                selection.removeAllRanges();
                self.toolboxHide();
              }
            );
          } else {
            (this.delegate.ttsModule as TTSModule2).speak(
              selectionInfo as any,
              false,
              () => {
                var selection = self.dom(iframeBody).getSelection();
                selection.removeAllRanges();
                self.toolboxHide();
              }
            );
          }
        } else {
          self.dom(iframeBody).getSelection().removeAllRanges();
          self.toolboxHide();
        }
      }
    }
  }

  callbackComplete(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    this.toolboxHide();
    this.dom(iframeBody).removeAllRanges();
  }

  visibleTextRects(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    const body = HTMLUtilities.findRequiredIframeElement(
      iframe.contentDocument,
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

  doneSpeaking(iframeIndex: number, reload: boolean = false) {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    if (this.delegate.rights?.enableTTS) {
      this.toolboxHide();
      this.dom(iframeBody).removeAllRanges();

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

  resetHighlightBoundingStyle(highlightBounding: HTMLElement) {
    highlightBounding.style.outline = "none";
    highlightBounding.style.setProperty(
      "background-color",
      "transparent",
      "important"
    );
  }

  resetHighlightAreaStyle(
    highlightArea: HTMLElement,
    id_container: string,
    iframeIndex: number
  ) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

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

        let _highlightsContainer: HTMLElement = iframeDocument.getElementById(
          ID_HIGHLIGHTS_CONTAINER
        );
        let _highlightsReadAloudContainer: HTMLElement =
          iframeDocument.getElementById(ID_READALOUD_CONTAINER);
        let _highlightsPageBreakContainer: HTMLElement =
          iframeDocument.getElementById(ID_PAGEBREAK_CONTAINER);
        let _highlightsSearchContainer: HTMLElement =
          iframeDocument.getElementById(ID_SEARCH_CONTAINER);
        let _highlightsPopupContainer: HTMLElement =
          iframeDocument.getElementById(ID_POPUP_CONTAINER);

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

        if (_highlightsPopupContainer && id_container == ID_POPUP_CONTAINER) {
          highlightParent = _highlightsPopupContainer.querySelector(
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
    highlightAreas: Array<HTMLElement>,
    highlight: IHighlight,
    iframeIndex: number
  ) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

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

      let _highlightsContainer: HTMLElement = iframeDocument.getElementById(
        ID_HIGHLIGHTS_CONTAINER
      );

      if (highlight.type !== HighlightType.Popup) {
        let highlightParent = _highlightsContainer.querySelector(
          `#${highlight.id}`
        );
        let nodeList =
          highlightParent.getElementsByClassName(CLASS_HIGHLIGHT_ICON);
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

  setAndResetSearchHighlight(highlight, highlights, iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    let _highlightsSearchContainer: HTMLElement =
      iframeDocument.getElementById(ID_SEARCH_CONTAINER);

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
  getScrollingElement = (iframeDocument: Document): Element => {
    if (iframeDocument.scrollingElement) {
      return iframeDocument.scrollingElement;
    }
    return iframeDocument.body;
  };

  async processMouseEvent(iframeIndex: number, ev: MouseEvent) {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    // relative to fixed window top-left corner
    // (unlike pageX/Y which is relative to top-left rendered content area, subject to scrolling)
    const x = ev.clientX;
    const y = ev.clientY;

    let _highlightsContainer: HTMLElement = iframeDocument.getElementById(
      ID_HIGHLIGHTS_CONTAINER
    );
    let _highlightsReadAloudContainer: HTMLElement =
      iframeDocument.getElementById(ID_READALOUD_CONTAINER);
    let _highlightsPageBreakContainer: HTMLElement =
      iframeDocument.getElementById(ID_PAGEBREAK_CONTAINER);
    let _highlightsSearchContainer: HTMLElement =
      iframeDocument.getElementById(ID_SEARCH_CONTAINER);
    let _highlightsPopupContainer: HTMLElement =
      iframeDocument.getElementById(ID_POPUP_CONTAINER);

    if (
      !_highlightsContainer &&
      !_highlightsSearchContainer &&
      !_highlightsPageBreakContainer &&
      !_highlightsReadAloudContainer &&
      !_highlightsPopupContainer
    ) {
      return;
    }

    const paginated = this.delegate.view.isPaginated();
    const bodyRect = iframeBody.getBoundingClientRect();
    const scrollElement = this.getScrollingElement(iframeDocument);

    const xOffset = paginated ? -scrollElement.scrollLeft : bodyRect.left;
    const yOffset = paginated ? -scrollElement.scrollTop : bodyRect.top;

    let foundHighlight: IHighlight | undefined;
    let foundElement: IHTMLDivElementWithRect | undefined;

    for (let i = _highlights.length - 1; i >= 0; i--) {
      const highlight = _highlights[i];

      let highlightParent = iframeDocument.getElementById(`${highlight.id}`);
      if (!highlightParent && _highlightsContainer) {
        highlightParent = _highlightsContainer.querySelector(
          `#${highlight.id}`
        );
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
          this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
        }
      }
      if (_highlightsSearchContainer) {
        const highlightBoundings2 = _highlightsSearchContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );
        for (const highlightBounding of highlightBoundings2) {
          this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
        }
      }
      if (_highlightsReadAloudContainer) {
        const highlightBoundings3 =
          _highlightsReadAloudContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
        for (const highlightBounding of highlightBoundings3) {
          this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
        }
      }
      if (_highlightsPageBreakContainer) {
        const highlightBoundings4 =
          _highlightsPageBreakContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );
        for (const highlightBounding of highlightBoundings4) {
          this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
        }
      }
      if (_highlightsPopupContainer) {
        const highlightBoundings5 = _highlightsPopupContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
        );
        for (const highlightBounding of highlightBoundings5) {
          this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
        }
      }

      if (_highlightsContainer) {
        const allHighlightAreas = Array.from(
          _highlightsContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );
        for (const highlightArea of allHighlightAreas) {
          this.resetHighlightAreaStyle(
            highlightArea as HTMLElement,
            ID_HIGHLIGHTS_CONTAINER,
            iframeIndex
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
            highlightArea as HTMLElement,
            ID_SEARCH_CONTAINER,
            iframeIndex
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
            highlightArea as HTMLElement,
            ID_READALOUD_CONTAINER,
            iframeIndex
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
            highlightArea as HTMLElement,
            ID_PAGEBREAK_CONTAINER,
            iframeIndex
          );
        }
      }
      if (_highlightsPopupContainer) {
        const allHighlightAreas5 = Array.from(
          _highlightsPopupContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`)
        );
        for (const highlightArea of allHighlightAreas5) {
          this.resetHighlightAreaStyle(
            highlightArea as HTMLElement,
            ID_POPUP_CONTAINER,
            iframeIndex
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
        const allHighlightAreas5 = _highlightsPopupContainer.querySelectorAll(
          `.${CLASS_HIGHLIGHT_AREA}`
        );

        for (const highlightArea of allHighlightAreas) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              highlightArea as HTMLElement,
              ID_HIGHLIGHTS_CONTAINER,
              iframeIndex
            );
          }
        }
        for (const highlightArea of allHighlightAreas2) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              highlightArea as HTMLElement,
              ID_SEARCH_CONTAINER,
              iframeIndex
            );
          }
        }
        for (const highlightArea of allHighlightAreas3) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              highlightArea as HTMLElement,
              ID_READALOUD_CONTAINER,
              iframeIndex
            );
          }
        }
        for (const highlightArea of allHighlightAreas4) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              highlightArea as HTMLElement,
              ID_PAGEBREAK_CONTAINER,
              iframeIndex
            );
          }
        }
        for (const highlightArea of allHighlightAreas5) {
          if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
            this.resetHighlightAreaStyle(
              highlightArea as HTMLElement,
              ID_POPUP_CONTAINER,
              iframeIndex
            );
          }
        }

        this.setHighlightAreaStyle(
          foundElementHighlightAreas as HTMLElement[],
          foundHighlight,
          iframeIndex
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
        const allHighlightBoundings5 =
          _highlightsPopupContainer.querySelectorAll(
            `.${CLASS_HIGHLIGHT_BOUNDING_AREA}`
          );

        for (const highlightBounding of allHighlightBoundings) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
          }
        }
        for (const highlightBounding of allHighlightBoundings2) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
          }
        }
        for (const highlightBounding of allHighlightBoundings3) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
          }
        }
        for (const highlightBounding of allHighlightBoundings4) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
          }
        }
        for (const highlightBounding of allHighlightBoundings5) {
          if (
            !foundElementHighlightBounding ||
            highlightBounding !== foundElementHighlightBounding
          ) {
            this.resetHighlightBoundingStyle(highlightBounding as HTMLElement);
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

        if (payload.highlight.type === HighlightType.Annotation) {
          this.delegate.annotationModule?.api
            ?.selectedAnnotation(anno)
            .then(async () => {});
        }

        if (anno?.id) {
          if (IS_DEV) {
            console.log("selected highlight " + anno.id);
          }
          let iframeRect = iframe.getBoundingClientRect();

          var toolbox = document.getElementById("highlight-toolbox");

          toolbox.style.top =
            ev.clientY + (this.delegate.attributes?.navHeight ?? 0) + "px";
          toolbox.style.left = ev.clientX + "px";
          if (this.delegate.view.layout === "fixed") {
            toolbox.style.left = iframeRect.left + ev.clientX + "px";
          }

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
        } else {
          if (foundElement.dataset.definition) {
            const popup = new Popup(this.delegate);
            popup.showPopup(foundElement.dataset.definition, ev);
          }
          let result =
            this.delegate.definitionsModule?.properties?.definitions.filter(
              (el: any) => el.order === Number(foundElement.dataset.order)
            )[0];
          if (this.delegate.definitionsModule.api?.click) {
            this.delegate.definitionsModule.api?.click(
              lodash.omit(result, "callbacks"),
              lodash.omit(foundHighlight, "definition")
            );
          }
        }
      }
    }
  }

  ensureHighlightsContainer(id: string, iframeIndex: number): HTMLElement {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    var self = this;
    let _highlightsContainer: HTMLElement = iframeDocument.getElementById(
      ID_HIGHLIGHTS_CONTAINER
    );
    let _highlightsReadAloudContainer: HTMLElement =
      iframeDocument.getElementById(ID_READALOUD_CONTAINER);
    let _highlightsPageBreakContainer: HTMLElement =
      iframeDocument.getElementById(ID_PAGEBREAK_CONTAINER);
    let _highlightsSearchContainer: HTMLElement =
      iframeDocument.getElementById(ID_SEARCH_CONTAINER);
    let _highlightsPopupContainer: HTMLElement =
      iframeDocument.getElementById(ID_POPUP_CONTAINER);
    if (
      (!_highlightsContainer && id == ID_HIGHLIGHTS_CONTAINER) ||
      (!_highlightsSearchContainer && id == ID_SEARCH_CONTAINER) ||
      (!_highlightsReadAloudContainer && id == ID_READALOUD_CONTAINER) ||
      (!_highlightsPageBreakContainer && id == ID_PAGEBREAK_CONTAINER) ||
      (!_highlightsPopupContainer && id == ID_POPUP_CONTAINER)
    ) {
      if (
        (!bodyEventListenersSet && iframeIndex == 0) ||
        (!bodyEventListenersSet2 && iframeIndex == 1)
      ) {
        if (iframeIndex == 0) {
          bodyEventListenersSet = true;
        }
        if (iframeIndex == 1) {
          bodyEventListenersSet2 = true;
        }

        async function mousedown(ev: MouseEvent) {
          lastMouseDownX = ev.clientX;
          lastMouseDownY = ev.clientY;
        }

        async function mouseup(ev: MouseEvent) {
          if (
            Math.abs(lastMouseDownX - ev.clientX) < 3 &&
            Math.abs(lastMouseDownY - ev.clientY) < 3
          ) {
            self.processMouseEvent(iframeIndex, ev);
          }
        }
        async function mousemove(ev: MouseEvent) {
          self.processMouseEvent(iframeIndex, ev);
        }

        iframeBody.addEventListener("mousedown", mousedown, false);
        iframeBody.addEventListener("mouseup", mouseup, false);
        iframeBody.addEventListener("mousemove", mousemove, false);

        iframeBody.addEventListener("touchstart", mousedown, false);
        iframeBody.addEventListener("touchend", mouseup, false);
        iframeBody.addEventListener("touchmove", mousemove, false);
      }

      if (id == ID_HIGHLIGHTS_CONTAINER) {
        _highlightsContainer = iframeDocument.createElement("div");
        _highlightsContainer.setAttribute("id", id);
        _highlightsContainer.style.setProperty("pointer-events", "none");
        if (this.delegate.view.layout === "fixed") {
          _highlightsContainer.style.setProperty("position", "absolute");
          _highlightsContainer.style.setProperty("top", "0");
          _highlightsContainer.style.setProperty("left", "0");
        }
        iframeBody.append(_highlightsContainer);
      } else if (id == ID_SEARCH_CONTAINER) {
        _highlightsSearchContainer = iframeDocument.createElement("div");
        _highlightsSearchContainer.setAttribute("id", id);
        _highlightsSearchContainer.style.setProperty("pointer-events", "none");
        if (this.delegate.view.layout === "fixed") {
          _highlightsSearchContainer.style.setProperty("position", "absolute");
          _highlightsSearchContainer.style.setProperty("top", "0");
          _highlightsSearchContainer.style.setProperty("left", "0");
        }
        iframeBody.append(_highlightsSearchContainer);
      } else if (id == ID_READALOUD_CONTAINER) {
        _highlightsReadAloudContainer = iframeDocument.createElement("div");
        _highlightsReadAloudContainer.setAttribute("id", id);
        _highlightsReadAloudContainer.style.setProperty(
          "pointer-events",
          "none"
        );
        if (this.delegate.view.layout === "fixed") {
          _highlightsReadAloudContainer.style.setProperty(
            "position",
            "absolute"
          );
          _highlightsReadAloudContainer.style.setProperty("top", "0");
          _highlightsReadAloudContainer.style.setProperty("left", "0");
        }
        iframeBody.append(_highlightsReadAloudContainer);
      } else if (id == ID_PAGEBREAK_CONTAINER) {
        _highlightsPageBreakContainer = iframeDocument.createElement("div");
        _highlightsPageBreakContainer.setAttribute("id", id);
        _highlightsPageBreakContainer.style.setProperty(
          "pointer-events",
          "none"
        );
        if (this.delegate.view.layout === "fixed") {
          _highlightsPageBreakContainer.style.setProperty(
            "position",
            "absolute"
          );
          _highlightsPageBreakContainer.style.setProperty("top", "0");
          _highlightsPageBreakContainer.style.setProperty("left", "0");
        }
        iframeBody.append(_highlightsPageBreakContainer);
      } else if (id == ID_POPUP_CONTAINER) {
        _highlightsPopupContainer = iframeDocument.createElement("div");
        _highlightsPopupContainer.setAttribute("id", id);
        _highlightsPopupContainer.style.setProperty("pointer-events", "none");
        if (this.delegate.view.layout === "fixed") {
          _highlightsPopupContainer.style.setProperty("position", "absolute");
          _highlightsPopupContainer.style.setProperty("top", "0");
          _highlightsPopupContainer.style.setProperty("left", "0");
        }
        iframeBody.append(_highlightsPopupContainer);
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
    } else if (id == ID_POPUP_CONTAINER) {
      return _highlightsPopupContainer;
    }
    return _highlightsContainer;
  }

  hideAllHighlights(iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    let _highlightsContainer: HTMLElement = iframeDocument.getElementById(
      ID_HIGHLIGHTS_CONTAINER
    );
    let _highlightsReadAloudContainer: HTMLElement =
      iframeDocument.getElementById(ID_READALOUD_CONTAINER);
    let _highlightsPageBreakContainer: HTMLElement =
      iframeDocument.getElementById(ID_PAGEBREAK_CONTAINER);
    let _highlightsSearchContainer: HTMLElement =
      iframeDocument.getElementById(ID_SEARCH_CONTAINER);
    let _highlightsPopupContainer: HTMLElement =
      iframeDocument.getElementById(ID_POPUP_CONTAINER);

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
    if (_highlightsPopupContainer) {
      _highlightsPopupContainer.remove();
      _highlightsPopupContainer = null;
    }
  }

  destroyAllHighlights(iframeIndex: number) {
    // let iframe = this.delegate.iframes[index];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    this.hideAllHighlights(iframeIndex);
    _highlights.splice(0, _highlights.length);
  }

  destroyHighlights(type: HighlightType, iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    let _highlightsContainer: HTMLElement = iframeDocument.getElementById(
      ID_HIGHLIGHTS_CONTAINER
    );
    let _highlightsReadAloudContainer: HTMLElement =
      iframeDocument.getElementById(ID_READALOUD_CONTAINER);
    let _highlightsPageBreakContainer: HTMLElement =
      iframeDocument.getElementById(ID_PAGEBREAK_CONTAINER);
    let _highlightsSearchContainer: HTMLElement =
      iframeDocument.getElementById(ID_SEARCH_CONTAINER);
    let _highlightsPopupContainer: HTMLElement =
      iframeDocument.getElementById(ID_POPUP_CONTAINER);

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
      case HighlightType.Popup:
        if (_highlightsPopupContainer) {
          _highlightsPopupContainer.remove();
          _highlightsPopupContainer = null;
        }
        break;
      case HighlightType.Annotation:
        if (_highlightsContainer) {
          _highlightsContainer.remove();
          _highlightsContainer = null;
        }
        _highlights.splice(0, _highlights.length);
        break;
    }
  }

  destroyHighlight(id: string, iframeIndex: number) {
    let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;
    let i = -1;
    const highlight = _highlights.find((h, j) => {
      i = j;
      return h.id === id;
    });
    if (highlight && i >= 0 && i < _highlights.length) {
      _highlights.splice(i, 1);
    }

    const highlightContainer = (
      iframe.contentWindow as any
    ).document.getElementById(id);
    if (highlightContainer) {
      highlightContainer.remove();
    }
  }

  createHighlight(
    iframeIndex,
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
    // let iframe = this.delegate.iframes[iframeIndex];
    // let el = iframe.contentDocument.body;
    // let iframeDocument = iframe.contentDocument.body.ownerDocument;

    try {
      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = (prefix ? prefix : "R2_HIGHLIGHT_") + sha256Hex;

      this.destroyHighlight(id, iframeIndex);

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
        type == HighlightType.Annotation ||
        type == HighlightType.Popup ||
        type == undefined
      ) {
        _highlights.push(highlight);
      }

      let highlightDom = this.createHighlightDom(iframeIndex, highlight);
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
    iframeIndex: number,
    highlight: IHighlight
  ): HTMLDivElement | undefined {
    let iframe = this.delegate.iframes[iframeIndex];
    let iframeBody = iframe.contentDocument.body;
    let iframeDocument = iframe.contentDocument.body.ownerDocument;

    const range = convertRangeInfo(
      iframeDocument,
      highlight.selectionInfo.rangeInfo
    );
    if (!range) {
      return undefined;
    }

    const highlightsContainer = this.ensureHighlightsContainer(
      ID_HIGHLIGHTS_CONTAINER,
      iframeIndex
    );
    const highlightsReadAloudContainer = this.ensureHighlightsContainer(
      ID_READALOUD_CONTAINER,
      iframeIndex
    );
    const highlightsPageBreakContainer = this.ensureHighlightsContainer(
      ID_PAGEBREAK_CONTAINER,
      iframeIndex
    );
    const highlightsSearchContainer = this.ensureHighlightsContainer(
      ID_SEARCH_CONTAINER,
      iframeIndex
    );
    const highlightsPopupContainer = this.ensureHighlightsContainer(
      ID_POPUP_CONTAINER,
      iframeIndex
    );

    const highlightParent = iframeDocument.createElement(
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
      iframeBody.style.position = "revert";
    } else {
      iframeBody.style.position = "relative";
    }
    const bodyRect = iframeBody.getBoundingClientRect();
    const scrollElement = this.getScrollingElement(iframeDocument);

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
      const highlightArea = iframeDocument.createElement(
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
      if (top < position || position == 0) {
        position = top;
      }

      size = parseInt(highlightArea.style.height.replace("px", ""));
      if (drawStrikeThrough) {
        const highlightAreaLine = iframeDocument.createElement(
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

      let viewportWidth = iframe.contentWindow.innerWidth;
      let columnCount = parseInt(
        getComputedStyle(
          iframe.contentDocument.documentElement
        ).getPropertyValue("column-count")
      );

      let columnWidth = parseInt(
        getComputedStyle(
          iframe.contentDocument.documentElement
        ).getPropertyValue("column-width")
      );
      let padding = parseInt(
        getComputedStyle(iframe.contentDocument.body).getPropertyValue(
          "padding-left"
        )
      );

      let pageWidth = viewportWidth / (columnCount || 1);
      if (pageWidth < columnWidth) {
        pageWidth = viewportWidth;
      }
      if (!paginated) {
        pageWidth = parseInt(
          getComputedStyle(iframe.contentDocument.body).width.replace("px", "")
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
        iframe.contentDocument.documentElement.style.getPropertyValue(
          "--USER__pageMargins"
        )
      );
      if (pagemargin >= 2) {
        right = right + padding / columnCount;
        left = left - padding / columnCount;
      }

      if (!paginated) {
        left = parseInt(
          getComputedStyle(iframe.contentDocument.body).width.replace("px", "")
        );
        right =
          parseInt(
            getComputedStyle(iframe.contentDocument.body).width.replace(
              "px",
              ""
            )
          ) - pageWidth;

        if (pagemargin >= 2) {
          right = right + padding / 2;
          left = left - padding / 2;
        }
      }
    }

    const rangeBoundingClientRect = range.getBoundingClientRect();
    const highlightBounding = iframeDocument.createElement(
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

    const highlightAreaIcon = iframeDocument.createElement("div");
    highlightAreaIcon.setAttribute("class", CLASS_HIGHLIGHT_ICON);

    if (highlight.icon?.position === "left") {
      highlightAreaIcon.setAttribute(
        "style",
        `position: absolute;top:${position}px;left:${
          right + iframe.contentDocument.scrollingElement.scrollLeft
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
            left + iframe.contentDocument.scrollingElement.scrollLeft
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
      } else {
        highlightAreaIcon.innerHTML = highlight.icon?.title;
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
    if (
      highlight.type != HighlightType.PageBreak &&
      highlight.type != HighlightType.Popup
    ) {
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

        let iframeRect = iframe.getBoundingClientRect();
        var toolbox = document.getElementById("highlight-toolbox");
        toolbox.style.top =
          ev.clientY + (self.delegate.attributes?.navHeight ?? 0) + "px";
        toolbox.style.left = ev.clientX + "px";
        if (self.delegate.view.layout === "fixed") {
          toolbox.style.left = iframeRect.left + ev.clientX + "px";
        }

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
          foundElementHighlightAreas as HTMLElement[],
          highlight,
          iframeIndex
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
        highlightsReadAloudContainer.append(highlightParent);
        break;
      case HighlightType.PageBreak:
        highlightsPageBreakContainer.append(highlightParent);
        break;
      case HighlightType.Popup:
        highlightsPopupContainer.append(highlightParent);
        break;
      default:
        highlightsContainer.append(highlightParent);
        break;
    }

    return highlightParent;
  }
}
