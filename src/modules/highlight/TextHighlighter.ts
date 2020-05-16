/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

 import * as crypto from "crypto";
import { debounce } from "debounce";

import { POPUP_DIALOG_CLASS,
    ROOT_CLASS_INVISIBLE_MASK,
    ROOT_CLASS_KEYBOARD_INTERACT,
    ROOT_CLASS_NO_FOOTNOTES,
    TTS_CLASS_INJECTED_SPAN,
    TTS_CLASS_INJECTED_SUBSPAN,
    TTS_ID_INJECTED_PARENT,
    TTS_ID_SPEAKING_DOC_ELEMENT} from "./common/styles";


import { IEventPayload_R2_EVENT_HIGHLIGHT_CLICK } from "./common/events";
import { IColor, IHighlight } from "./common/highlight";
import { ISelectionInfo } from "./common/selection";
import { IRectSimple, getClientRectsNoOverlap } from "./common/rect-utils";
import { convertRangeInfo, getCurrentSelectionInfo } from "./renderer/iframe/selection";
import { IReadiumIFrameWindow } from "./renderer/iframe/state";
import { uniqueCssSelector } from "./renderer/common/cssselector2";
import AnnotationModule from "../AnnotationModule";
import { Annotation, AnnotationMarker } from "../../model/Locator";
import { IS_DEV } from "../..";
import { icons } from "../../utils/IconLib";
import TTSModule from "../TTSModule";
import { SelectionMenuItem } from "../../navigator/IFrameNavigator";


export const ID_HIGHLIGHTS_CONTAINER = "R2_ID_HIGHLIGHTS_CONTAINER";
export const CLASS_HIGHLIGHT_CONTAINER = "R2_CLASS_HIGHLIGHT_CONTAINER";
export const CLASS_HIGHLIGHT_AREA = "R2_CLASS_HIGHLIGHT_AREA";
export const CLASS_HIGHLIGHT_BOUNDING_AREA = "R2_CLASS_HIGHLIGHT_BOUNDING_AREA";

const DEFAULT_BACKGROUND_COLOR_OPACITY = 0.5;
const ALT_BACKGROUND_COLOR_OPACITY = 0.75;
const DEFAULT_BACKGROUND_COLOR: IColor = {
    blue: 100,
    green: 50,
    red: 230,
};

export const _highlights: IHighlight[] = [];

interface IWithRect {
    rect: IRectSimple;
    scale: number;
}
export interface IHTMLDivElementWithRect extends HTMLDivElement, IWithRect {
}

/**
 * Attribute added by default to every highlight.
 * @type {string}
 */
let DATA_ATTR: string = 'data-highlighted';

/**
 * Attribute used to group highlight wrappers.
 * @type {string}
 */
let TIMESTAMP_ATTR: string = 'data-timestamp';

let NODE_TYPE = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3
};

const _blacklistIdClassForCssSelectors = [POPUP_DIALOG_CLASS, TTS_CLASS_INJECTED_SPAN, TTS_CLASS_INJECTED_SUBSPAN, ID_HIGHLIGHTS_CONTAINER, CLASS_HIGHLIGHT_CONTAINER, CLASS_HIGHLIGHT_AREA, CLASS_HIGHLIGHT_BOUNDING_AREA, TTS_ID_INJECTED_PARENT, TTS_ID_SPEAKING_DOC_ELEMENT, ROOT_CLASS_KEYBOARD_INTERACT, ROOT_CLASS_INVISIBLE_MASK, ROOT_CLASS_NO_FOOTNOTES];

let lastMouseDownX = -1;
let lastMouseDownY = -1;
let bodyEventListenersSet = false;

// TODO this needs to refelct layer name 
let _highlightsContainer: HTMLElement | null;

export default class TextHighlighter {
    el: HTMLElement;
    options: any;
    delegate:AnnotationModule;
    ttsDelegate:TTSModule;
    lastSelectedHighlight:number = undefined;
    selectionMenuItems: Array<SelectionMenuItem>;

    public constructor(delegate: AnnotationModule, element: HTMLElement, selectionMenuItems:Array<SelectionMenuItem>, options: any) {
        if (!element) {
            throw 'Missing anchor element';
        }
        this.delegate = delegate
        this.selectionMenuItems = selectionMenuItems;

        this.el = element;
        this.options = this.defaults(options, {
            color: '#fce300',
            highlightedClass: 'highlighted',
            contextClass: 'highlighter-context',
            onBeforeHighlight: function () { return true; },
            onAfterHighlight: function () { }
        });

        this.dom(this.el).addClass(this.options.contextClass);
        this.bindEvents(this.el, this);
        
        this.initializeToolbox();

        lastMouseDownX = -1;
        lastMouseDownY = -1;
        bodyEventListenersSet = false;

        var self = this
        async function unselect(){
            if (self.lastSelectedHighlight == undefined) {
                // self.delegate.api.highlightUnSelected().then(async () => {
                //     if (IS_DEV) {console.log("highlightUnSelected,  click on existing")}
                // })
            } else {
                self.lastSelectedHighlight = undefined
            }
        }
        setTimeout(async () => {
            await self.el.addEventListener("click", unselect);
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
    defaults(obj: { [x: string]: any; }, source: { [x: string]: any; color?: string; highlightedClass?: string; contextClass?: string; onBeforeHighlight?: () => boolean; onAfterHighlight?: () => void; container?: any; andSelf?: boolean; grouped?: boolean; hasOwnProperty?: any; }): object {
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
    unique(arr: { filter: (arg0: (value: any, idx: any, self: any) => boolean) => void; }) {
        return arr.filter(function (value, idx, self) {
            return self.indexOf(value) === idx;
        });
    }

    /**
     * Takes range object as parameter and refines it boundaries
     * @param range
     * @returns {object} refined boundaries and initial state of highlighting algorithm.
     */
    refineRangeBoundaries(range: { startContainer: any; endContainer: any; commonAncestorContainer: any; endOffset: number; startOffset: number; }): object {
        let startContainer = range.startContainer,
            endContainer = range.endContainer,
            ancestor = range.commonAncestorContainer,
            goDeeper = true;

        if (range.endOffset === 0) {
            while (!endContainer.previousSibling && endContainer.parentNode !== ancestor) {
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
            goDeeper: goDeeper
        };
    }

    /**
     * Sorts array of DOM elements by its depth in DOM tree.
     * @param {HTMLElement[]} arr - array to sort.
     * @param {boolean} descending - order of sort.
     */
    sortByDepth(arr: { sort: (arg0: (a: any, b: any) => number) => void; }, descending: boolean) {
        var self = this
        arr.sort(function (a, b) {
            return self.dom(descending ? b : a).parents().length - self.dom(descending ? a : b).parents().length;
        });
    }

    /**
     * Groups given highlights by timestamp.
     * @param {Array} highlights
     * @returns {Array} Grouped highlights.
     */
    groupHighlights(highlights: { forEach: (arg0: (hl: any) => void) => void; }): Array<any> {
        var order: any[] = [],
            chunks: any = {},
            grouped: any | { chunks: any; timestamp: any; toString: () => any; }[] = [];

        highlights.forEach(function (hl) {
            let timestamp = hl.getAttribute(TIMESTAMP_ATTR);

            if (typeof chunks[timestamp] === 'undefined') {
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
                    return group.map(function (h: any) {
                        return h.textContent;
                    }).join('');
                }
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
                    el.className += ' ' + className;
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
                        new RegExp('(^|\\b)' + className + '(\\b|$)', 'gi'), ' '
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
                var parent, path = [];

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
                    while (el.nextSibling && el.nextSibling.nodeType === NODE_TYPE.TEXT_NODE) {
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
                var div = document.createElement('div');
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
                var toolbox = document.getElementById("highlight-toolbox");
                toolbox.style.display = "none";
                var backdrop = document.getElementById("toolbox-backdrop");
                backdrop.style.display = "none";
                self.ttsDelegate.cancel()
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
            }

        };
    };

    bindEvents(el: any, _scope: any) {
        el.addEventListener('mouseup', this.toolboxHandler.bind(this));
        el.addEventListener('touchend', this.toolboxHandler.bind(this));
    }

    unbindEvents(el: any, _scope: any) {
        el.removeEventListener('mouseup', this.toolboxHandler.bind(this));
        el.removeEventListener('touchend', this.toolboxHandler.bind(this));
    }

    /**
     * Permanently disables highlighting.
     * Unbinds events and remove context element class.
     * @memberof TextHighlighter
     */
    destroy() {
        this.unbindEvents(this.el, this);
        this.dom(this.el).removeClass(this.options.contextClass);        
    };


    initializeToolbox() {
        var toolboxColorsOptions = document.getElementById("highlight-toolbox-mode-colors");
        var colors = ["#fce300", "#48e200", "#00bae5", "#157cf9", "#6a39b7", "#ea426a", "#ff8500"]
        var colorIcon = document.getElementById("colorIcon");
        var colorIconSymbol = colorIcon.lastChild as HTMLElement;
        var dismissIcon = document.getElementById("dismissIcon");
        dismissIcon.innerHTML = icons.close;
        
        var self = this
            colors.forEach(color => {
                var colorButton = document.getElementById(color);
                if (toolboxColorsOptions.contains(colorButton)) {
                    toolboxColorsOptions.removeChild(colorButton)
                }
            })	

        var colorElements: HTMLButtonElement[] = [];

        // Open toolbox color options
        colorIcon.addEventListener("click", function(){ 
            self.toolboxMode('colors');
        });

        // Close toolbox color options
        dismissIcon.addEventListener("click", function(){ 
            self.toolboxMode('add');
        });

        // Generate color options
        colors.forEach(color => {
            var colorButton = colorIcon.cloneNode(true) as HTMLButtonElement;
            var colorButtonSymbol = colorButton.lastChild as HTMLElement;
            colorButtonSymbol.style.backgroundColor = color;
            colorButton.id = color;
            colorButton.style.display = "unset";
            colorElements.push(colorButton)

            var highlightIcon = document.getElementById("highlightIcon");
            var underlineIcon = document.getElementById("underlineIcon");
            // Set color and close color options
            colorButton.addEventListener("click", function () {
                self.setColor(color);
                colorIconSymbol.style.backgroundColor = color;
                (highlightIcon.getElementsByTagName("span")[0] as HTMLSpanElement).style.backgroundColor = self.getColor();
                (underlineIcon.getElementsByTagName("span")[0] as HTMLSpanElement).style.borderBottomColor = self.getColor();
                self.toolboxMode('add');
            });

            toolboxColorsOptions.insertBefore(colorButton, dismissIcon);
        });

        // Hide color options by default
        self.toolboxMode('add');
    }

    toolboxMode( mode: 'colors' | 'edit' | 'add' ) {
      var toolboxColorsOptions = document.getElementById("highlight-toolbox-mode-colors");
      var toolboxAddOptions = document.getElementById("highlight-toolbox-mode-add");
      var toolboxEditOptions = document.getElementById("highlight-toolbox-mode-edit");

      switch(mode) {
        case 'colors':
          toolboxColorsOptions.style.display = "unset"
          toolboxAddOptions.style.display = "none"
          toolboxEditOptions.style.display = "none"
          break;
        case 'edit':
          toolboxColorsOptions.style.display = "none"
          toolboxAddOptions.style.display = "none"
          toolboxEditOptions.style.display = "unset"
          break;
        default:
          toolboxColorsOptions.style.display = "none"
          toolboxAddOptions.style.display = "unset"
          toolboxEditOptions.style.display = "none"
          break;
      }
    }

    toolboxHandler(_event:MouseEvent) {

        if(this.delegate.rights.enableAnnotations) {

        
            var range = this.dom(this.el).getRange();        
            if (!range || range.collapsed) {
                return;
            }

            if(this.isIOS() ||this.isAndroid()) {
                var self = this
                setTimeout(function() {
                    var selection = self.dom(self.el).getSelection();        
                    selection.removeAllRanges()
                    setTimeout(function() {
                        selection.addRange(range)
                    }, 5);
                }, 100);
            }

            var rect = range.getBoundingClientRect();  // and convert this to useful data
            var toolbox = document.getElementById("highlight-toolbox");
            var backdrop = document.getElementById("toolbox-backdrop");
            toolbox.style.top = rect.top + 'px'; 
            toolbox.style.left = (rect.right - rect.left)/2 + rect.left + "px"; 

            if(getComputedStyle(toolbox).display === "none") {
                toolbox.style.display = "block";
                if (!this.isIOS() && !this.isAndroid()) {
                    backdrop.style.display = "block";
                }

                var self = this

                self.toolboxMode('add');
                var highlightIcon = document.getElementById("highlightIcon");
                var underlineIcon = document.getElementById("underlineIcon");
                var speakIcon = document.getElementById("speakIcon");
                var colorIcon = document.getElementById("colorIcon");

                highlightIcon.style.display = "unset";
                (highlightIcon.getElementsByTagName("span")[0] as HTMLSpanElement).style.background = this.getColor();
                (highlightIcon.getElementsByTagName("span")[0] as HTMLSpanElement).innerHTML = icons.text;

                underlineIcon.style.display = "unset";
                (underlineIcon.getElementsByTagName("span")[0] as HTMLSpanElement).style.borderBottomColor = this.getColor();
                (underlineIcon.getElementsByTagName("span")[0] as HTMLSpanElement).innerHTML = icons.text;

                colorIcon.style.display = "unset";

                var colorIconSymbol = colorIcon.lastChild as HTMLElement;
                colorIconSymbol.style.backgroundColor = this.getColor();
                
                (speakIcon.getElementsByTagName("span")[0] as HTMLSpanElement).innerHTML = icons.speak;

                // speaker_notes
                // add_comment
                // file_copy
                // delete
                // share
                // edit

                function highlightEvent(){
                    self.doHighlight(false, AnnotationMarker.Highlight);
                    toolbox.style.display = "none";
                    backdrop.style.display = "none";
                    highlightIcon.removeEventListener("click", highlightEvent);
                }
                highlightIcon.addEventListener("click", highlightEvent);

                function commentEvent(){
                    self.doHighlight(false, AnnotationMarker.Underline);
                    toolbox.style.display = "none";
                    backdrop.style.display = "none";
                    underlineIcon.removeEventListener("click", commentEvent);
                }
                underlineIcon.addEventListener("click", commentEvent);
                
                function speakEvent(){
                    // self.doHighlight(false, AnnotationMarker.Underline);
                    speakIcon.removeEventListener("click", speakEvent);
                    self.speak();
                }
                speakIcon.addEventListener("click", speakEvent);


                this.selectionMenuItems.forEach(menuItem => {
                
                    var itemElement = document.getElementById(menuItem.id);
                    if (menuItem.icon) {
                        (itemElement.getElementsByTagName("span")[0] as HTMLSpanElement).innerHTML = menuItem.icon;
                    }
                    var self = this

                    function itemEvent(){
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
                            return uniqueCssSelector(element, self.dom(self.el).getDocument(), options);
                        }
                    
                        const selectionInfo = getCurrentSelectionInfo(self.dom(self.el).getWindow(), getCssSelector)                

                        menuItem.callback(selectionInfo.cleanText);
                    }
                    itemElement.addEventListener("click", itemEvent);

                })



                var backdropButton = document.getElementById("toolbox-backdrop");

                function backdropEvent(){
                    try {
                        self.dom(self.el).removeAllRanges();
                    } catch (err) {
                        console.error(err)
                    }
                    toolbox.style.display = "none";
                    // self.delegate.api.highlightUnSelected().then(async () => {
                    //     if (IS_DEV) {console.log("highlightUnSelected,  click on backdrop (click, mousedown,mouseup )")}
                    // })
                    backdropButton.removeEventListener("click", backdropEvent);
                    backdropButton.removeEventListener("mousedown", backdropEvent);
                    backdropButton.removeEventListener("mouseup", backdropEvent);
                }

                backdropButton.addEventListener("click", backdropEvent);
                backdropButton.addEventListener("mousedown", backdropEvent);
                backdropButton.addEventListener("mouseup", backdropEvent);

            }
        }
    };

    /**
     * Highlights current range.
     * @param {boolean} keepRange - Don't remove range after highlighting. Default: false.
     * @memberof TextHighlighter
     */
    doHighlight(keepRange?: boolean, marker?:AnnotationMarker) {
        var self = this
        function getCssSelector(element: Element): string {
            const options = {
                className: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                },
                idName: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                },
            };
            return uniqueCssSelector(element, self.dom(self.el).getDocument(), options);
        }
    
        const selectionInfo = getCurrentSelectionInfo(this.dom(this.el).getWindow(), getCssSelector)
        if (selectionInfo) {
            if (this.options.onBeforeHighlight(selectionInfo) === true) {
                var highlight = this.createHighlight(self.dom(self.el).getWindow(), selectionInfo,  TextHighlighter.hexToColor(this.getColor()),true, marker)
                this.options.onAfterHighlight(highlight, marker);
            }

            if (!keepRange) {
                this.dom(this.el).removeAllRanges();
            }
        }
    };

    speak() {
        var self = this
        function getCssSelector(element: Element): string {
            const options = {
                className: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                },
                idName: (str: string) => {
                    return _blacklistIdClassForCssSelectors.indexOf(str) < 0;
                },
            };
            return uniqueCssSelector(element, self.dom(self.el).getDocument(), options);
        }
    
        const selectionInfo = getCurrentSelectionInfo(this.dom(this.el).getWindow(), getCssSelector)
        if (selectionInfo) {
            // if (this.options.onBeforeHighlight(selectionInfo) === true) {
            //     var highlight = this.createHighlight(self.dom(self.el).getWindow(), selectionInfo,  TextHighlighter.hexToColor(this.getColor()),true, marker)
            //     this.options.onAfterHighlight(highlight, marker);
            // }
            this.ttsDelegate.speak(selectionInfo as any);
            
        }
    };

    doneSpeaking() {
        var toolbox = document.getElementById("highlight-toolbox");
        var backdrop = document.getElementById("toolbox-backdrop");

        toolbox.style.display = "none";
        backdrop.style.display = "none";
        this.dom(this.el).removeAllRanges();
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

        // this.flattenNestedHighlights(highlights);
        // this.mergeSiblingHighlights(highlights);

        // omit removed nodes
        normalizedHighlights = highlights.filter(function (hl: any) {
            return hl.parentElement ? hl : null;
        });

        normalizedHighlights = this.unique(normalizedHighlights);
        normalizedHighlights.sort(function (a: any, b: any) {
            return a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft;
        });

        return normalizedHighlights;
    };

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
    };

    /**
     * Merges sibling highlights and normalizes descendant text nodes.
     * Note: this method changes input highlights - their order and number after calling this method may change.
     * @param highlights
     * @memberof TextHighlighter
     */
    mergeSiblingHighlights(highlights: any) {
        var self = this;

        function shouldMerge(current: any, node: any) {
            return node && node.nodeType === NODE_TYPE.ELEMENT_NODE &&
                self.haveSameColor(current, node) &&
                self.isHighlight(node);
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
    };

    /**
     * Sets highlighting color.
     * @param {string} color - valid CSS color.
     * @memberof TextHighlighter
     */
    setColor(color: any) {
        this.options.color = color;
    };

    /**
     * Returns highlighting color.
     * @returns {string}
     * @memberof TextHighlighter
     */
    getColor(): string {
        return this.options.color;
    };


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
            container: this.el,
            andSelf: true,
            grouped: false
        });

        var nodeList = params.container.querySelectorAll('[' + DATA_ATTR + ']'),
            highlights = Array.prototype.slice.call(nodeList);

        if (params.andSelf === true && params.container.hasAttribute(DATA_ATTR)) {
            highlights.push(params.container);
        }

        if (params.grouped) {
            highlights = this.groupHighlights(highlights);
        }

        return highlights;
    };

    /**
     * Returns true if element is a highlight.
     * All highlights have 'data-highlighted' attribute.
     * @param el - element to check.
     * @returns {boolean}
     * @memberof TextHighlighter
     */
    isHighlight(el: any): boolean {
        return el && el.nodeType === NODE_TYPE.ELEMENT_NODE && el.hasAttribute(DATA_ATTR);
    };

    /**
     * Serializes all highlights in the element the highlighter is applied to.
     * @returns {string} - stringified JSON with highlights definition
     * @memberof TextHighlighter
     */
    serializeHighlights(): string {
        var highlights = this.getHighlights(),
            refEl = this.el,
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

            wrapper.innerHTML = '';
            wrapper = wrapper.outerHTML;

            if (highlight.previousSibling && highlight.previousSibling.nodeType === NODE_TYPE.TEXT_NODE) {
                offset = highlight.previousSibling.length;
            }

            hlDescriptors.push([
                wrapper,
                highlight.textContent,
                hlPath.join(':'),
                offset,
                length
            ]);
        });

        return JSON.stringify(hlDescriptors);
    };

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
                path: hlDescriptor[2].split(':'),
                offset: hlDescriptor[3],
                length: hlDescriptor[4]
            },
                elIndex = hl.path.pop(),
                node: any = self.el,
                hlNode,
                highlight,
                idx;

            while (!!(idx = hl.path.shift())) {
                node = node.childNodes[idx];
            }

            if (node.childNodes[elIndex - 1] && node.childNodes[elIndex - 1].nodeType === NODE_TYPE.TEXT_NODE) {
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
    };


    /**
     * Creates wrapper for highlights.
     * TextHighlighter instance calls this method each time it needs to create highlights and pass options retrieved
     * in constructor.
     * @param {object} options - the same object as in TextHighlighter constructor.
     * @returns {HTMLElement}
     * @memberof TextHighlighter
     * @static
     */
    createWrapper(): HTMLElement {
        var span = document.createElement('mark');
        span.style.background = "linear-gradient(" + TextHighlighter.hexToRgbA(this.options.color) + ", " + TextHighlighter.hexToRgbA(this.options.color) + ")"
        span.className = this.options.highlightedClass;
        return span;
    };
    

    public static hexToColor(hex: string) {
        var c: any;
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
            c = hex.substring(1).split('');
            if (c.length == 3) {
                c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c = '0x' + c.join('');
            return {
                red: (c >> 16) & 255,
                green: (c >> 8) & 255,
                blue: c & 255
            }
            // return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',.5)';
        }
        throw new Error('Bad Hex');
    }
    
    public static hexToRgbA(hex: string) {
        var c: any;
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
            c = hex.substring(1).split('');
            if (c.length == 3) {
                c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c = '0x' + c.join('');
            return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',.5)';
        }
        throw new Error('Bad Hex');
    }


    resetHighlightBoundingStyle(_win: IReadiumIFrameWindow, highlightBounding: HTMLElement) {
        highlightBounding.style.outline = "none";
        highlightBounding.style.setProperty("background-color", "transparent", "important");
    }
    
    resetHighlightAreaStyle(_win: IReadiumIFrameWindow, highlightArea: HTMLElement) {
        const id = ((highlightArea.parentNode && highlightArea.parentNode.nodeType === Node.ELEMENT_NODE && (highlightArea.parentNode as Element).getAttribute) ? (highlightArea.parentNode as Element).getAttribute("id") : undefined);
        if (id) {
            const highlight = _highlights.find((h) => {
                return h.id === id;
            });
            if (highlight) {
                const opacity = DEFAULT_BACKGROUND_COLOR_OPACITY;
                if(highlight.marker == AnnotationMarker.Underline) {
                    highlightArea.style.setProperty("background-color", `rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${0})`, "important");
                    highlightArea.style.setProperty("border-bottom", `2px solid rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${1})`, "important");
                } else {
                    highlightArea.style.setProperty("background-color", `rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${opacity})`, "important");
                }
            }
        }
    }
    
    setHighlightAreaStyle(_win: IReadiumIFrameWindow, highlightAreas: Array<HTMLElement>, highlight: IHighlight) {
        for (const highlightArea of highlightAreas) {
            const opacity = ALT_BACKGROUND_COLOR_OPACITY;
            if(highlight.marker == AnnotationMarker.Underline) {
                highlightArea.style.setProperty("background-color", `rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${0.1})`, "important");
                highlightArea.style.setProperty("border-bottom", `2px solid rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${1})`, "important");
            } else {
                highlightArea.style.setProperty("background-color", `rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${opacity})`, "important");
            }
        }
    }
    
    isIOS() {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i) != null;
    }
    isAndroid() {
        return navigator.userAgent.match(/Android/i) != null;
    }
      
    async processMouseEvent(win: IReadiumIFrameWindow, ev: MouseEvent) {
        const documant = win.document;
        // const scrollElement = getScrollingElement(documant);
        // relative to fixed window top-left corner
        // (unlike pageX/Y which is relative to top-left rendered content area, subject to scrolling)
        const x = ev.clientX;
        const y = ev.clientY;
    
        // const highlightsContainer = documant.getElementById(`${ID_HIGHLIGHTS_CONTAINER}`);
        if (!_highlightsContainer) {
            return;
        }
    
        // const paginated = isPaginated(documant);
        const bodyRect = documant.body.getBoundingClientRect();
        const xOffset = bodyRect.left;
        const yOffset = bodyRect.top;
    
        let foundHighlight: IHighlight | undefined;
        let foundElement: IHTMLDivElementWithRect | undefined;
        // for (const highlight of _highlights) {
        for (let i = _highlights.length - 1; i >= 0; i--) {
            const highlight = _highlights[i];
    
            let highlightParent = documant.getElementById(`${highlight.id}`);
            if (!highlightParent) { // ??!!
                highlightParent = _highlightsContainer.querySelector(`#${highlight.id}`); // .${CLASS_HIGHLIGHT_CONTAINER}
            }
            if (!highlightParent) { // what?
                continue;
            }
    
            let hit = false;
            const highlightFragments = highlightParent.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`);
            for (const highlightFragment of highlightFragments) {
                const withRect = (highlightFragment as unknown) as IWithRect;    
                const left = withRect.rect.left + xOffset; // (paginated ? withRect.xOffset : xOffset);
                const top = withRect.rect.top + yOffset; // (paginated ? withRect.yOffset : yOffset);
                if (x >= left &&
                    x < (left + withRect.rect.width) &&
                    y >= top &&
                    y < (top + withRect.rect.height)
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
            const highlightBoundings = _highlightsContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_BOUNDING_AREA}`);
            for (const highlightBounding of highlightBoundings) {
                this.resetHighlightBoundingStyle(win, highlightBounding as HTMLElement);
            }
            const allHighlightAreas = Array.from(_highlightsContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`));
            for (const highlightArea of allHighlightAreas) {
                this.resetHighlightAreaStyle(win, highlightArea as HTMLElement); 
            }
            return;
        }

        if (foundElement.getAttribute("data-click")) {
            if (ev.type === "mousemove" || ev.type === "touchmove") {
                const foundElementHighlightAreas = Array.from(foundElement.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`));
                const allHighlightAreas = _highlightsContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_AREA}`);
                for (const highlightArea of allHighlightAreas) {
                    if (foundElementHighlightAreas.indexOf(highlightArea) < 0) {
                        this.resetHighlightAreaStyle(win, highlightArea as HTMLElement); 
                    }
                }
                this.setHighlightAreaStyle(win, foundElementHighlightAreas as HTMLElement[], foundHighlight); 
    
                const foundElementHighlightBounding = foundElement.querySelector(`.${CLASS_HIGHLIGHT_BOUNDING_AREA}`);
                const allHighlightBoundings = _highlightsContainer.querySelectorAll(`.${CLASS_HIGHLIGHT_BOUNDING_AREA}`);
                for (const highlightBounding of allHighlightBoundings) {
                    if (!foundElementHighlightBounding || highlightBounding !== foundElementHighlightBounding) {
                        this.resetHighlightBoundingStyle(win, highlightBounding as HTMLElement);
                    }
                }

            } else if (ev.type === "mouseup" || ev.type === "click" || ev.type === "touchup") {

                const payload: IEventPayload_R2_EVENT_HIGHLIGHT_CLICK = {
                    highlight: foundHighlight,
                };
                if (IS_DEV) {console.log(payload)}
                var self = this
                var anno = await this.delegate.annotator.getAnnotation(payload.highlight) as Annotation
                // if(anno.comment) {
                    // this.delegate.api.highlightSelected(anno).then(async () => {
                        if (IS_DEV) { console.log("selected highlight "+anno.id)}
                        self.lastSelectedHighlight = anno.id                       
                    // })
                // } else {
                    var toolbox = document.getElementById("highlight-toolbox");
                    var backdrop = document.getElementById("toolbox-backdrop");
                    // toolbox.style.top = ev.clientY + 74 + 'px'; 
                    toolbox.style.top = ev.clientY  + 'px'; 
                    toolbox.style.left = ev.clientX + "px"; 

                    if(getComputedStyle(toolbox).display === "none") {
                        toolbox.style.display = "block";
                        
                        if (!this.isIOS() && !this.isAndroid()) {
                            backdrop.style.display = "block";
                        }
                        this.toolboxMode('edit');
                        
                        var colorIcon = document.getElementById("colorIcon");
                        var highlightIcon = document.getElementById("highlightIcon");
                        // edhighlightIconitIcon.innerHTML = icons.highlight;

                        colorIcon.style.display = "none";
                        highlightIcon.style.display = "none";
                
                        
                        // var commentIcon = document.getElementById("addCommentIcon");
                        // // commentIcon.innerHTML = icons.note;

                        // function addCommenH(){
                        //     // var position = parseInt((foundElement.childNodes[0] as HTMLDivElement).style.top.replace("px",""))

                        //     anno.comment = true
                        //     // self.delegate.api.addCommentToHighlight(anno, position).then(async () => {
                        //         if (IS_DEV) { console.log("add comment to existing highlight "+anno.id)}
                        //         toolbox.style.display = "none";
                        //         backdrop.style.display = "none";
                        //     // })
                        //     commentIcon.removeEventListener("click", addCommenH);
                        // }
                        // commentIcon.addEventListener("click", addCommenH);
                            
                        var deleteIcon = document.getElementById("deleteIcon");
                        deleteIcon.style.display = "unset";
                        deleteIcon.innerHTML = icons.delete;
                        function deleteH(){
                            self.delegate.deleteSelectedHighlight(anno).then(async () => {
                                if (IS_DEV) {console.log("delete highlight "+anno.id)}
                                toolbox.style.display = "none";
                                backdrop.style.display = "none";
                            })
                            deleteIcon.removeEventListener("click", deleteH);
                        };
                        deleteIcon.addEventListener("click", deleteH);

                        var backdropButton = document.getElementById("toolbox-backdrop");

                        function backdropEvent(){
                            try {
                                self.dom(self.el).removeAllRanges();
                            } catch (err) {
                                console.error(err)
                            }

                            toolbox.style.display = "none";
                            // self.delegate.api.highlightUnSelected().then(async () => {
                            //     if (IS_DEV) {console.log("highlightUnSelected,  click on backdrop (click, mousedown,mouseup )")}
                            // })
                            deleteIcon.removeEventListener("click", deleteH);
                            // commentIcon.removeEventListener("click", addCommenH);

                            backdropButton.removeEventListener("click", backdropEvent);
                            backdropButton.removeEventListener("mousedown", backdropEvent);
                            backdropButton.removeEventListener("mouseup", backdropEvent);
                            
                            
                        }
        
                        backdropButton.addEventListener("click", backdropEvent);
                        backdropButton.addEventListener("mousedown", backdropEvent);
                        backdropButton.addEventListener("mouseup", backdropEvent);
            
                    } else {
                        toolbox.style.display = "none";
                        void toolbox.offsetWidth;
                        toolbox.style.display = "block";
                    }
                // }


            }
        }
    }
    
    ensureHighlightsContainer(win: IReadiumIFrameWindow): HTMLElement {
        const documant = win.document;
        var self = this
        if (!_highlightsContainer) {
    
            if (!bodyEventListenersSet) {
                bodyEventListenersSet = true;
    
                async function mousedown(ev: MouseEvent){
                    console.log('mousedown')
                    lastMouseDownX = ev.clientX;
                    lastMouseDownY = ev.clientY;
                }

                async function mouseup(ev: MouseEvent){
                    console.log('mouseup')
                    if ((Math.abs(lastMouseDownX - ev.clientX) < 3) &&
                        (Math.abs(lastMouseDownY - ev.clientY) < 3)) {
                        self.processMouseEvent(win, ev);
                    }
                }
                async function mousemove(ev: MouseEvent){
                    console.log('mousemove')
                    self.processMouseEvent(win, ev);
                }

                documant.body.addEventListener("mousedown", mousedown, false);
                documant.body.addEventListener("mouseup", mouseup, false);
                documant.body.addEventListener("mousemove", mousemove, false);

                documant.body.addEventListener("touchstart", mousedown, false);
                documant.body.addEventListener("touchend", mouseup, false);
                documant.body.addEventListener("touchmove", mousemove, false);
                
            }
    
            _highlightsContainer = documant.createElement("div");
            _highlightsContainer.setAttribute("id", ID_HIGHLIGHTS_CONTAINER);
            _highlightsContainer.style.setProperty("pointer-events", "none");
            documant.body.append(_highlightsContainer);
        }
        return _highlightsContainer;
    }
    
    hideAllhighlights(_documant: Document) {
        if (_highlightsContainer) {
            _highlightsContainer.remove();
            _highlightsContainer = null;
        }
    }
    
    destroyAllhighlights(documant: Document) {
        this.hideAllhighlights(documant);
        _highlights.splice(0, _highlights.length);
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
    
    
    createHighlight(
        win: IReadiumIFrameWindow,
        selectionInfo: ISelectionInfo,
        color: IColor | undefined,
        pointerInteraction: boolean,
        marker: AnnotationMarker): IHighlight {
    
        try {
            const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
            // const unique = new Buffer(JSON.stringify(selectionInfo.rangeInfo, null, "")).toString("base64");
            // const unique = new Buffer(uniqueStr).toString("base64");
            // const id = "R2_HIGHLIGHT_" + unique.replace(/\+/, "_").replace(/=/, "-").replace(/\//, ".");
            const checkSum = crypto.createHash("sha256");
            checkSum.update(uniqueStr);
            const sha256Hex = checkSum.digest("hex");
            const id = "R2_HIGHLIGHT_" + sha256Hex;
        
            this.destroyHighlight(win.document, id);
        
            const highlight: IHighlight = {
                color: color ? color : DEFAULT_BACKGROUND_COLOR,
                id,
                pointerInteraction,
                selectionInfo,
                marker: marker
            };
            _highlights.push(highlight);
        
            let highlightDom = this.createHighlightDom(win, highlight);
            var position = parseInt(((highlightDom.hasChildNodes ? highlightDom.childNodes[0] : highlightDom) as HTMLDivElement).style.top.replace("px",""))
            highlight.position = position    

            return highlight;
        } catch (e) {
            throw "Can't create highlight: " + e;
        }
    }
    
    createHighlightDom(win: IReadiumIFrameWindow, highlight: IHighlight): HTMLDivElement | undefined {
    
        const documant = win.document;
    
        const range = convertRangeInfo(documant, highlight.selectionInfo.rangeInfo);
        if (!range) {
            return undefined;
        }
    
        const highlightsContainer = this.ensureHighlightsContainer(win);

        const highlightParent = documant.createElement("div") as IHTMLDivElementWithRect;
        highlightParent.setAttribute("id", highlight.id);
        highlightParent.setAttribute("class", CLASS_HIGHLIGHT_CONTAINER);
        highlightParent.style.setProperty("pointer-events", "none");
        if (highlight.pointerInteraction) {
            highlightParent.setAttribute("data-click", "1");
        }
    
        // Resize Sensor sets body position to "relative" (default static),
        // which may breaks things!
        // (e.g. highlights CSS absolute/fixed positioning)
        // Also note that ReadiumCSS default to (via stylesheet :root):
        documant.body.style.position = "relative";
    
        const bodyRect = documant.body.getBoundingClientRect();
    
        const xOffset = bodyRect.left;
        const yOffset = bodyRect.top;
    
        const scale = 1 / (1);
     
        const drawUnderline = false;
        const drawStrikeThrough = false;
    
        const doNotMergeHorizontallyAlignedRects = drawUnderline || drawStrikeThrough;
        const clientRects =  getClientRectsNoOverlap(range, doNotMergeHorizontallyAlignedRects);
        
        const roundedCorner = 3;
        const underlineThickness = 2;
        const strikeThroughLineThickness = 3;
    
        for (const clientRect of clientRects) {
            const opacity = DEFAULT_BACKGROUND_COLOR_OPACITY;
    
            const highlightArea = documant.createElement("div") as IHTMLDivElementWithRect;
            highlightArea.setAttribute("class", CLASS_HIGHLIGHT_AREA);

            let extra = "";
            if (drawUnderline) {
                extra += `border-bottom: ${underlineThickness * scale}px solid rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${opacity}) !important`;
            }
            if(highlight.marker == AnnotationMarker.Underline) {
                highlightArea.setAttribute("style", `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; background-color: rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${0}) !important; ${extra}`);
                highlightArea.style.setProperty("border-bottom", `2px solid rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${1})`, "important");
            } else {
                highlightArea.setAttribute("style", `mix-blend-mode: multiply; border-radius: ${roundedCorner}px !important; background-color: rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${opacity}) !important; ${extra}`);
            }
            highlightArea.style.setProperty("pointer-events", "none");
            highlightArea.style.position =  "absolute";
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

            if (drawStrikeThrough) {

                const highlightAreaLine = documant.createElement("div") as IHTMLDivElementWithRect;
                highlightAreaLine.setAttribute("class", CLASS_HIGHLIGHT_AREA);

                highlightAreaLine.setAttribute("style", `background-color: rgba(${highlight.color.red}, ${highlight.color.green}, ${highlight.color.blue}, ${opacity}) !important;`);
                highlightAreaLine.style.setProperty("pointer-events", "none");
                highlightAreaLine.style.position =  "absolute";
                highlightAreaLine.scale = scale;
                highlightAreaLine.rect = {
                    height: clientRect.height,
                    left: clientRect.left - xOffset,
                    top: clientRect.top - yOffset,
                    width: clientRect.width,
                };
                highlightAreaLine.style.width = `${highlightAreaLine.rect.width * scale}px`;
                highlightAreaLine.style.height = `${strikeThroughLineThickness * scale}px`;
                highlightAreaLine.style.left = `${highlightAreaLine.rect.left * scale}px`;
                highlightAreaLine.style.top = `${(highlightAreaLine.rect.top + (highlightAreaLine.rect.height / 2) - (strikeThroughLineThickness / 2)) * scale}px`;

                highlightParent.append(highlightAreaLine);
            }
            
        }
        
        const rangeBoundingClientRect = range.getBoundingClientRect();
        const highlightBounding = documant.createElement("div") as IHTMLDivElementWithRect;
        highlightBounding.setAttribute("class", CLASS_HIGHLIGHT_BOUNDING_AREA);
        highlightBounding.style.setProperty("pointer-events", "none");
        highlightBounding.style.position =  "absolute";
        highlightBounding.scale = scale;
        highlightBounding.rect = {
            height: rangeBoundingClientRect.height,
            left: rangeBoundingClientRect.left - xOffset,
            top: rangeBoundingClientRect.top - yOffset,
            width: rangeBoundingClientRect.width,
        };
        highlightBounding.style.width = `${highlightBounding.rect.width * scale}px`;
        highlightBounding.style.height = `${highlightBounding.rect.height * scale}px`;
        highlightBounding.style.left = `${highlightBounding.rect.left * scale}px`;
        highlightBounding.style.top = `${highlightBounding.rect.top * scale}px`;
        highlightParent.append(highlightBounding);
    
        highlightsContainer.append(highlightParent);
        return highlightParent;
    }
    
}