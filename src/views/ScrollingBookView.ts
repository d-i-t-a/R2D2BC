import BookView from "./BookView";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import * as HTMLUtilities from "../utils/HTMLUtilities";

export default class ScrollingBookView implements BookView {
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
        return (document.scrollingElement.scrollHeight - document.scrollingElement.scrollTop) === BrowserUtilities.getHeight();
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
