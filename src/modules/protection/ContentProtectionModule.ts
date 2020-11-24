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
import { addEventListenerOptional, removeEventListenerOptional } from "../../utils/EventHandler";
import { debounce } from "debounce";
import { IS_DEV } from "../..";
import { oc } from "ts-optchain";

export interface ContentProtectionModuleConfig {
    delegate: IFrameNavigator;
    protection: any;
}

interface ContentProtectionRect {
    node: Element,
    height: number,
    top: number,
    textContent: string,
    scrambledTextContent: string,
    isObfuscated: boolean
}

export default class ContentProtectionModule implements ReaderModule {

    private rects: Array<ContentProtectionRect>
    private delegate: IFrameNavigator
    private protection: any
    private hasEventListener: boolean = false
    private isHacked: boolean = false
    private securityContainer: HTMLDivElement;
    private mutationObserver: MutationObserver;

    public static async create(config: ContentProtectionModuleConfig) {
        const security = new this(
            config.delegate,
            config.protection
        );
        await security.start();
        return security;
    }

    public constructor(delegate: IFrameNavigator, protection: any) {
        this.delegate = delegate
        this.protection = protection
    }

    protected async start(): Promise<void> {
        this.delegate.contentProtectionModule = this

        if (oc(this.protection).enableObfuscation(false)) {
            this.securityContainer = HTMLUtilities.findElement(document, "#container-view-security") as HTMLDivElement;

            var self = this

            // create an observer instance
            this.mutationObserver = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (IS_DEV) { console.log(mutation.type); }
                    self.isHacked = true
                });
            });
        }

    }

    async stop() {
        if (IS_DEV) { console.log('Protection module stop'); }
        this.mutationObserver.disconnect()

        if (oc(this.protection).disableKeys(false)) {
            removeEventListenerOptional(this.delegate.mainElement, 'keydown', this.disableSave);
            removeEventListenerOptional(this.delegate.headerMenu, 'keydown', this.disableSave);
            removeEventListenerOptional(this.delegate.iframe.contentDocument, 'keydown', this.disableSave);
            removeEventListenerOptional(this.delegate.iframe.contentWindow, 'keydown', this.disableSave);
            removeEventListenerOptional(window, 'keydown', this.disableSave);
            removeEventListenerOptional(document, 'keydown', this.disableSave);
        }

        if (oc(this.protection).disbaleCopy(false)) {
            removeEventListenerOptional(this.delegate.mainElement, 'copy', this.preventCopy);
            removeEventListenerOptional(this.delegate.headerMenu, 'copy', this.preventCopy);
            removeEventListenerOptional(this.delegate.iframe.contentDocument, 'copy', this.preventCopy);
            removeEventListenerOptional(this.delegate.iframe.contentWindow, 'copy', this.preventCopy);
            removeEventListenerOptional(window, 'copy', this.preventCopy);
            removeEventListenerOptional(document, 'copy', this.preventCopy);
            removeEventListenerOptional(this.delegate.mainElement, 'cut', this.preventCopy);
            removeEventListenerOptional(this.delegate.headerMenu, 'cut', this.preventCopy);
            removeEventListenerOptional(this.delegate.iframe.contentDocument, 'cut', this.preventCopy);
            removeEventListenerOptional(this.delegate.iframe.contentWindow, 'cut', this.preventCopy);
            removeEventListenerOptional(window, 'cut', this.preventCopy);
            removeEventListenerOptional(document, 'cut', this.preventCopy);
        }
        if (oc(this.protection).disablePrint(false)) {
            removeEventListenerOptional(this.delegate.mainElement, 'beforeprint', this.beforePrint.bind(this));
            removeEventListenerOptional(this.delegate.headerMenu, 'beforeprint', this.beforePrint.bind(this));
            removeEventListenerOptional(this.delegate.iframe.contentDocument, 'beforeprint', this.beforePrint);
            removeEventListenerOptional(this.delegate.iframe.contentWindow, 'beforeprint', this.beforePrint);
            removeEventListenerOptional(window, 'beforeprint', this.beforePrint);
            removeEventListenerOptional(document, 'beforeprint', this.beforePrint);
            removeEventListenerOptional(this.delegate.mainElement, 'afterprint', this.afterPrint.bind(this));
            removeEventListenerOptional(this.delegate.headerMenu, 'afterprint', this.afterPrint.bind(this));
            removeEventListenerOptional(this.delegate.iframe.contentDocument, 'afterprint', this.afterPrint.bind(this));
            removeEventListenerOptional(this.delegate.iframe.contentWindow, 'afterprint', this.afterPrint.bind(this));
            removeEventListenerOptional(window, 'afterprint', this.afterPrint.bind(this));
            removeEventListenerOptional(document, 'afterprint', this.afterPrint.bind(this));

        }
        if (oc(this.protection).disableContextMenu(false)) {
            removeEventListenerOptional(this.delegate.mainElement, 'contextmenu', this.disableContext);
            removeEventListenerOptional(this.delegate.headerMenu, 'contextmenu', this.disableContext);
            removeEventListenerOptional(this.delegate.iframe.contentDocument, 'contextmenu', this.disableContext);
            removeEventListenerOptional(this.delegate.iframe.contentWindow, 'contextmenu', this.disableContext);
            removeEventListenerOptional(window, 'contextmenu', this.disableContext);
            removeEventListenerOptional(document, 'contextmenu', this.disableContext);
        }
        if (oc(this.protection).hideTargetUrl(false)) {
            this.hideTargetUrls(false)
        }
        if (oc(this.protection).disableDrag(false)) {
            this.preventDrag(false)
        }
 
        removeEventListenerOptional(window, 'scroll', this.handleScroll.bind(this))
    }

    observe(): any {

        if (oc(this.protection).enableObfuscation(false)) {

            if (this.securityContainer.hasAttribute("style")) {
                this.isHacked = true
            }

            // stop observing first
            this.mutationObserver.disconnect()

            // configuration of the observer:
            var config = { attributes: true, childList: true, characterData: true }

            // pass in the target node, as well as the observer options
            this.mutationObserver.observe(this.securityContainer, config);
        }
    }

    public async deactivate() {
        if (oc(this.protection).enableObfuscation(false)) {
            this.observe()
            this.rects.forEach((rect) => this.deactivateRect(rect, this.securityContainer, this.isHacked));
        }
    }

    public async activate() {
        this.observe()
        const body = HTMLUtilities.findRequiredIframeElement(this.delegate.iframe.contentDocument, 'body') as HTMLBodyElement;
        this.rects = this.findRects(body);
        this.rects.forEach((rect) => this.toggleRect(rect, this.securityContainer, this.isHacked));
    }
    private setupEvents(): void {

        var self = this
        if (oc(this.protection).detectInspect(false)) {
            var checkStatus = 'off';
            var div = document.createElement('div');
            Object.defineProperty(div, 'id', {
                get: function () {
                    checkStatus = 'on';
                    throw new Error("Dev tools checker");
                }
            });
            requestAnimationFrame(function check() {
                checkStatus = 'off';
                console.log(div)
                if (checkStatus === 'on') {
                    if (oc(self.protection).clearOnInspect(false)) {
                        console.clear();
                        window.localStorage.clear();
                        window.sessionStorage.clear();
                        window.location.replace(window.location.origin);
                    }
                    if (oc(self.protection).api(false) && oc(self.protection).api.inspectDetected(false)) {
                        self.protection.api.inspectDetected()
                    }
                }
                requestAnimationFrame(check);
            });
        }

        if (oc(this.protection).disableKeys(false)) {
            addEventListenerOptional(this.delegate.mainElement, 'keydown', this.disableSave);
            addEventListenerOptional(this.delegate.headerMenu, 'keydown', this.disableSave);
            addEventListenerOptional(this.delegate.iframe, 'keydown', this.disableSave);
            addEventListenerOptional(this.delegate.iframe.ownerDocument, 'keydown', this.disableSave);
            addEventListenerOptional(this.delegate.iframe.contentDocument, 'keydown', this.disableSave);
            addEventListenerOptional(this.delegate.iframe.contentWindow, 'keydown', this.disableSave);
            addEventListenerOptional(this.delegate.iframe.contentWindow.document, 'keydown', this.disableSave);
            addEventListenerOptional(window, 'keydown', this.disableSave);
            addEventListenerOptional(document, 'keydown', this.disableSave);

        }
        if (oc(this.protection).disbaleCopy(false)) {
            addEventListenerOptional(this.delegate.mainElement, 'copy', this.preventCopy);
            addEventListenerOptional(this.delegate.headerMenu, 'copy', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe, 'copy', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.ownerDocument, 'copy', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.contentDocument, 'copy', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.contentWindow, 'copy', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.contentWindow.document, 'copy', this.preventCopy);
            addEventListenerOptional(window, 'copy', this.preventCopy);
            addEventListenerOptional(document, 'copy', this.preventCopy);

            addEventListenerOptional(this.delegate.mainElement, 'cut', this.preventCopy);
            addEventListenerOptional(this.delegate.headerMenu, 'cut', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe, 'cut', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.ownerDocument, 'cut', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.contentDocument, 'cut', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.contentWindow, 'cut', this.preventCopy);
            addEventListenerOptional(this.delegate.iframe.contentWindow.document, 'cut', this.preventCopy);
            addEventListenerOptional(window, 'cut', this.preventCopy);
            addEventListenerOptional(document, 'cut', this.preventCopy);
        }

        if (oc(this.protection).disablePrint(false)) {
            addEventListenerOptional(this.delegate.mainElement, 'beforeprint', this.beforePrint);
            addEventListenerOptional(this.delegate.headerMenu, 'beforeprint', this.beforePrint);
            addEventListenerOptional(this.delegate.iframe, 'beforeprint', this.beforePrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.ownerDocument, 'beforeprint', this.beforePrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.contentDocument, 'beforeprint', this.beforePrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.contentWindow, 'beforeprint', this.beforePrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.contentWindow.document, 'beforeprint', this.beforePrint.bind(this));
            addEventListenerOptional(window, 'beforeprint', this.beforePrint.bind(this));
            addEventListenerOptional(document, 'beforeprint', this.beforePrint.bind(this));

            addEventListenerOptional(this.delegate.mainElement, 'afterprint', this.afterPrint);
            addEventListenerOptional(this.delegate.headerMenu, 'afterprint', this.afterPrint);
            addEventListenerOptional(this.delegate.iframe, 'afterprint', this.afterPrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.ownerDocument, 'afterprint', this.afterPrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.contentDocument, 'afterprint', this.afterPrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.contentWindow, 'afterprint', this.afterPrint.bind(this));
            addEventListenerOptional(this.delegate.iframe.contentWindow.document, 'afterprint', this.afterPrint.bind(this));
            addEventListenerOptional(window, 'afterprint', this.afterPrint.bind(this));
            addEventListenerOptional(document, 'afterprint', this.afterPrint.bind(this));
        }
        if (oc(this.protection).disableContextMenu(false)) {
            addEventListenerOptional(this.delegate.mainElement, 'contextmenu', this.disableContext);
            addEventListenerOptional(this.delegate.headerMenu, 'contextmenu', this.disableContext);
            addEventListenerOptional(this.delegate.iframe, 'contextmenu', this.disableContext);
            addEventListenerOptional(this.delegate.iframe.ownerDocument, 'contextmenu', this.disableContext);
            addEventListenerOptional(this.delegate.iframe.contentDocument, 'contextmenu', this.disableContext);
            addEventListenerOptional(this.delegate.iframe.contentWindow, 'contextmenu', this.disableContext);
            addEventListenerOptional(this.delegate.iframe.contentWindow.document, 'contextmenu', this.disableContext);
            addEventListenerOptional(window, 'contextmenu', this.disableContext);
            addEventListenerOptional(document, 'contextmenu', this.disableContext);
        }

    }

    initializeResource() {
        if (oc(this.protection).hideTargetUrl(false)) {
            this.hideTargetUrls(true)
        }
        if (oc(this.protection).disableDrag(false)) {
            this.preventDrag(true)
        } 
    }

    public async initialize() {

        if (oc(this.protection).enableObfuscation(false)) {

            return new Promise(async (resolve) => {
                await (document as any).fonts.ready;
                const body = HTMLUtilities.findRequiredIframeElement(this.delegate.iframe.contentDocument, 'body') as HTMLBodyElement;
                console.log(body)

                this.observe()

                setTimeout(() => {
                    this.rects = this.findRects(body);
                    this.rects.forEach((rect) => this.toggleRect(rect, this.securityContainer, this.isHacked));

                    this.setupEvents()
                    if (!this.hasEventListener) {
                        this.hasEventListener = true
                        addEventListenerOptional(window, 'scroll', this.handleScroll.bind(this))
                    }
                    resolve();
                }, 10);
            });
        }
    }

    handleScroll() {
        console.log("scroll")
        this.rects.forEach((rect) => this.toggleRect(rect, this.securityContainer, this.isHacked));
    }
    handleResize() {

        if (oc(this.protection).enableObfuscation(false)) {

            const onDoResize = debounce(() => {
                this.calcRects(this.rects);
                if (this.rects != undefined) {
                    this.rects.forEach((rect) => this.toggleRect(rect, this.securityContainer, this.isHacked));
                }
            }, 10);
            if (this.rects) {
                this.observe()
                console.log("resize")
                onDoResize();
            }
        }

    }

    disableContext(e: { preventDefault: () => void; stopPropagation: () => void; }) {
        e.preventDefault();
        e.stopPropagation()
        return false;
    }

    disableSave(event: { keyCode: any; metaKey: any; ctrlKey: any; key: string; preventDefault: () => void; stopPropagation: () => void; }) {
        if ((navigator.platform === "MacIntel" || navigator.platform.match("Mac")) ? event.metaKey : event.ctrlKey && (event.key === "s" || event.keyCode == 83)) {
            event.preventDefault()
            event.stopPropagation()
            return false;
        }
        return true
    }
    preventCopy(event: { clipboardData: { setData: (arg0: string, arg1: any) => void; }; preventDefault: () => void; stopPropagation: () => void; }) {
        if (IS_DEV) { console.log('copy action initiated'); }
        event.clipboardData.setData('text/plain', "copy not allowed");
        event.stopPropagation();
        event.preventDefault();
        return false;
    }

    beforePrint(event: { preventDefault: () => void; stopPropagation: () => void; }) {
        if (IS_DEV) { console.log("before print"); }
        this.delegate.headerMenu.style.display = "none";
        this.delegate.mainElement.style.display = "none";

        event.stopPropagation();
        event.preventDefault();
        return false;
    }
    afterPrint(event: { preventDefault: () => void; stopPropagation: () => void; }) {
        if (IS_DEV) { console.log("before print"); }
        this.delegate.headerMenu.style.removeProperty("display")
        this.delegate.mainElement.style.removeProperty("display")

        event.stopPropagation();
        event.preventDefault();
        return false;
    }

    
    hideTargetUrls(activate) {
        function onAElementClick(ev) {
            ev.preventDefault();    
            const href = ev.currentTarget.getAttribute('data-href-resolved');
            const aElement = document.createElement('a');
            aElement.setAttribute('href', href);
            aElement.click();
        };
        const aElements = this.delegate.iframe.contentDocument.querySelectorAll('a');

        aElements.forEach((aElement) => {
          const dataHref = aElement.getAttribute('data-href');
          if (!dataHref) {
            aElement.setAttribute('data-href', aElement.getAttribute('href'));
            aElement.setAttribute('data-href-resolved', aElement.href);
          }
        });
    
        if (activate) {
          aElements.forEach((aElement) => {
            aElement.setAttribute('href', '');
            aElement.addEventListener('click', onAElementClick);
          });
        } else {
          aElements.forEach((aElement) => {
            aElement.setAttribute('href', aElement.getAttribute('data-href'));
            aElement.removeEventListener('click', onAElementClick);
          });
        }
    };
    
    preventDrag(activate) {
        const dragStyle =
        '-webkit-user-drag: none; -khtml-user-drag: none; -moz-user-drag: none; -ms-user-drag: none; user-drag: none; -webkit-pointer-events: none; -khtml-pointer-events: none; -moz-pointer-events: none; -ms-pointer-events: none; pointer-events: none;';
        const onDragstart = (evt) => {
            evt.preventDefault();
        };
        const bodyStyle = this.delegate.iframe.contentDocument.body.getAttribute('style') || '';
    
        if (activate) {
            this.delegate.iframe.contentDocument.body.addEventListener('dragstart', onDragstart);
            this.delegate.iframe.contentDocument.body.setAttribute('style', bodyStyle + dragStyle);
        } else {
            this.delegate.iframe.contentDocument.body.removeEventListener('dragstart', onDragstart);
            this.delegate.iframe.contentDocument.body.setAttribute('style', bodyStyle.replace(dragStyle, ''));
        }
    }

    recalculate() {
        if (oc(this.protection).enableObfuscation(false)) {

            const onDoResize = debounce(() => {
                this.calcRects(this.rects);
                if (this.rects != undefined) {
                    this.rects.forEach((rect) => this.toggleRect(rect, this.securityContainer, this.isHacked));
                }
            }, 100);
            if (this.rects) {
                this.observe()
                console.log("recalculate")
                onDoResize();
            }
        }
    }

    calcRects(rects: Array<ContentProtectionRect>): void {
        if (rects != undefined) {
            rects.forEach((rect) => {
                try {
                    const { top, height } = this.measureTextNode(rect.node);
                    rect.top = top;
                    rect.height = height;
                } catch (error) {
                    console.log("error " + error)
                    console.log(rect)
                    console.log(rect.node)
                    console.log("scrambledTextContent " + rect.scrambledTextContent)
                    console.log("textContent " + rect.textContent)
                    console.log("isObfuscated " + rect.isObfuscated)
                }
            });
        }
    }

    deactivateRect(rect: ContentProtectionRect, securityContainer: HTMLElement, isHacked: boolean): void {
        const beingHacked = this.isBeingHacked(securityContainer)

        if (beingHacked || isHacked) {
            rect.node.textContent = rect.scrambledTextContent;
            rect.isObfuscated = true;
        } else {
            rect.node.textContent = rect.textContent;
            rect.isObfuscated = false;
        }

    }

    toggleRect(rect: ContentProtectionRect, securityContainer: HTMLElement, isHacked: boolean): void {
        const outsideViewport = this.isOutsideViewport(rect);
        const beingHacked = this.isBeingHacked(securityContainer)

        if (beingHacked || isHacked) {
            rect.node.textContent = rect.scrambledTextContent;
            rect.isObfuscated = true;
        } else if (outsideViewport) {
            rect.node.textContent = rect.scrambledTextContent;
            rect.isObfuscated = true;
        } else {
            rect.node.textContent = rect.textContent;
            rect.isObfuscated = false;
        }

    }

    findRects(parent: HTMLElement): Array<ContentProtectionRect> {
        const textNodes = this.findTextNodes(parent);

        return textNodes.map((node) => {
            const { top, height } = this.measureTextNode(node);
            const scrambled = (node.parentElement.nodeName == "option" || node.parentElement.nodeName == "script") ? node.textContent : this.obfuscateText(node.textContent)
            return {
                top,
                height,
                node,
                textContent: node.textContent,
                scrambledTextContent: scrambled,
                isObfuscated: false
            };
        });
    }

    obfuscateText(text: string): string {
        return this.scramble(text, true)
    }

    measureTextNode(node: Element): any {
        try {
            const range = document.createRange();
            range.selectNode(node);

            const rect = range.getBoundingClientRect();
            range.detach(); // frees up memory in older browsers

            return rect;
        } catch (error) {
            console.log("measureTextNode " + error)
            console.log("measureTextNode " + node)
            console.log(node.textContent)
        }
    }

    isBeingHacked(element: HTMLElement): boolean {
        if (element.style.animation || element.style.transition || element.style.position || element.hasAttribute("style")) {
            console.log("content being hacked")
            return true
        }
        return false
    }

    isOutsideViewport(rect: ContentProtectionRect): boolean {
        const bottom = rect.top + rect.height;
        const windowTop = window.scrollY;
        const windowBottom = windowTop + window.innerHeight;

        const isAbove = bottom < windowTop;
        const isBelow = rect.top > windowBottom;

        return isAbove || isBelow;
    };

    findTextNodes(parentElement: Element, nodes: Array<Element> = []): Array<Element> {
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
        var words = str.split(' ');

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
                return scramble(word.split('')).join('');
            });
        }
        return paragraph ? scramble(words).join(' ') : words.join(' ');
    }

}