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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import * as BrowserUtilities from "../utils/BrowserUtilities";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import ContinuousBookView from "./ContinuousBookView";

export default class ScrollingBookView implements ContinuousBookView {

    public goToPreviousPage(): void {
        const leftHeight = document.scrollingElement.scrollTop;
        const height = this.getScreenHeight();
        var offset = leftHeight - height;
        if (offset >= 0) {
            document.scrollingElement.scrollTop = offset;
        } else {
            document.scrollingElement.scrollTop = 0;
        }
    }

    public goToNextPage(): void {
        const leftHeight = document.scrollingElement.scrollTop;
        const height = this.getScreenHeight();
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        const scrollHeight = html.scrollHeight;    
        var offset = leftHeight + height;
        if (offset < scrollHeight) {
            document.scrollingElement.scrollTop = offset;
        } else {
            document.scrollingElement.scrollTop = scrollHeight;
        }
    }
    
    private getScreenHeight(): number {
        const windowTop = window.scrollY;
        const windowBottom = windowTop + window.innerHeight;
        return windowBottom - windowTop - 100
    }

    public readonly name = "scrolling-book-view";
    public readonly label = "Scrolling";

    public iframe: HTMLIFrameElement;
    public sideMargin: number = 20;
    public height: number = 0;

    setIframeHeight(iframe:any) {
        if (iframe) {
            var iframeWin = iframe.contentWindow || iframe.contentDocument.parentWindow;
            if (iframeWin.document.body) {
                // iframe.height = iframeWin.document.documentElement.scrollHeight || iframeWin.document.body.scrollHeight;
                const minHeight = BrowserUtilities.getHeight() - 120;
                const bodyHeight = iframeWin.document.documentElement.scrollHeight || iframeWin.document.body.scrollHeight;        
                iframe.height = Math.max(minHeight, bodyHeight);
            }
        }
    };
    
    private setIFrameSize(): void {
        // Remove previous iframe height so body scroll height will be accurate.
        this.iframe.height = "0";
        this.iframe.width = BrowserUtilities.getWidth() + "px";

        const body = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "body") as HTMLBodyElement;

        const width = (BrowserUtilities.getWidth() - this.sideMargin * 2) + "px";
        this.setIframeHeight(this.iframe)      

        const images = Array.prototype.slice.call(body.querySelectorAll("img"));
        for (const image of images) {
            if (image.hasAttribute("width")) {
                image.style.width = image.width + "px";
            }
            if (image.hasAttribute("height")) {
                image.style.height = image.height + "px";
            }
            if (image.width > width) {
               image.style.maxWidth = width;
            }

            this.setIframeHeight(this.iframe)      

        }
    }

    public start(): void {
        const head = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "head") as HTMLHeadElement;

        if (head) {
            const viewport = HTMLUtilities.findElement(head, 'meta[name=viewport]') as HTMLMetaElement;
            if(viewport) {
                viewport.remove();
            }
        }

        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as any;
        html.style.setProperty("--USER__scroll", "readium-scroll-on");
        this.setIFrameSize();
    }

    public stop(): void {
        this.iframe.height = "0";
        this.iframe.width = "0";

        const body = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "body") as HTMLBodyElement;

        const images = Array.prototype.slice.call(body.querySelectorAll("img"));
        for (const image of images) {
            image.style.maxWidth = "";
        }
    }

    public getCurrentPosition(): number {
        const body = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "body") as HTMLBodyElement;
        return document.scrollingElement.scrollTop / body.scrollHeight;
    }

    public atBottom(): boolean {
        return (Math.ceil(document.scrollingElement.scrollHeight - document.scrollingElement.scrollTop) - 1) <= BrowserUtilities.getHeight();
    }

    public atTop(): boolean {
        return document.scrollingElement.scrollTop === 0;
    }

    public goToPosition(position: number) {
        this.setIFrameSize();
        document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight * position;
    }

    public goToElement(elementId: string) {
        this.setIFrameSize();
        const element = (this.iframe.contentDocument as any).getElementById(elementId);
        if (element) {
            // Put the element as close to the top as possible.
            document.scrollingElement.scrollTop = element.offsetTop;
        }
    }
}
