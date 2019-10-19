
import PaginatedBookView from "./PaginatedBookView";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import * as BrowserUtilities from "../utils/BrowserUtilities";

export default class ColumnsPaginatedBookView implements PaginatedBookView {
    public readonly name = "columns-paginated-view";
    public readonly label = "Paginated";

    public iframe: HTMLIFrameElement;
    public sideMargin: number = 0;
    public height: number = 0;

    protected hasFixedScrollWidth: boolean = false;

    public start(): void {
        // any is necessary because CSSStyleDeclaration type does not include
        // all the vendor-prefixed attributes.
        this.setSize();
        const viewportElement = document.createElement("meta");
        viewportElement.name = "viewport";
        viewportElement.content = "width=device-width, initial-scale=1, maximum-scale=1";

        this.checkForFixedScrollWidth();

        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as any;
        html.style.setProperty("--USER__scroll", "readium-scroll-off");

    }

    protected checkForFixedScrollWidth(): void {
        // Determine if the scroll width changes when the left position
        // changes. This differs across browsers and sometimes across
        // books in the same browser.
        const body = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "body") as any;
        const originalScrollWidth = body.scrollWidth;
        this.hasFixedScrollWidth = (body.scrollWidth === originalScrollWidth);
    }

    private setSize(): void {
        // any is necessary because CSSStyleDeclaration type does not include
        // all the vendor-prefixed attributes.
        const body = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "body") as any;

        (this.iframe.contentDocument as any).documentElement.style.height = (this.height) + "px";
        this.iframe.height = (this.height) + "px";
        this.iframe.width = BrowserUtilities.getWidth() + "px";

        const images = body.querySelectorAll("img");
        for (const image of images) {
            image.style.width = image.width + "px";
        }
    }

    public stop(): void {

    }

    /** Returns the total width of the columns that are currently
        positioned to the left of the iframe viewport. */
    private getLeftColumnsWidth(): number {
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        return html.scrollLeft;
    }

    /** Returns the total width of the columns that are currently
        positioned to the right of the iframe viewport. */
    private getRightColumnsWidth(): number {
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        const scrollWidth = html.scrollWidth;

        const width = this.getColumnWidth();
        let rightWidth = scrollWidth - width;
        if (this.hasFixedScrollWidth) {
            // In some browsers (IE and Firefox with certain books), 
            // scrollWidth doesn't change when some columns
            // are off to the left, so we need to subtract them.
            const leftWidth = this.getLeftColumnsWidth();
            rightWidth = Math.max(0, rightWidth - leftWidth);
        }
        return rightWidth;
    }

    /** Returns the width of one column. */
    private getColumnWidth(): number {
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        return html.offsetWidth;
    }

    /** Shifts the columns so that the specified width is positioned
        to the left of the iframe viewport. */
    private setLeftColumnsWidth(width: number) {
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        html.scrollLeft = width;
    }

    /** Returns number in range [0..1) representing the
        proportion of columns that are currently positioned
        to the left of the iframe viewport. */
    public getCurrentPosition(): number {
        const width = this.getColumnWidth();
        const leftWidth = this.getLeftColumnsWidth();
        const rightWidth = this.getRightColumnsWidth();
        const totalWidth = leftWidth + width + rightWidth;
        return leftWidth / totalWidth;
    }

    /** Returns the current 1-indexed page number. */
    public getCurrentPage(): number {
        return this.getCurrentPosition() * this.getPageCount() + 1;
    }

    /** Returns the total number of pages. */
    public getPageCount(): number {
        const width = this.getColumnWidth();
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        return html.scrollWidth / width;
    }

    public onFirstPage(): boolean {
        const leftWidth = this.getLeftColumnsWidth();

        return (leftWidth <= 0);
    }

    public onLastPage(): boolean {
        const rightWidth = this.getRightColumnsWidth();

        return (rightWidth <= 0);
    }

    public goToPreviousPage(): void {
        const leftWidth = this.getLeftColumnsWidth();
        const width = this.getColumnWidth();

        var offset = leftWidth - width;
        if (offset >= 0) {
            this.setLeftColumnsWidth(offset);
        } else {
            this.setLeftColumnsWidth(0);
        }
    }

    public goToNextPage(): void {
        const leftWidth = this.getLeftColumnsWidth();
        const width = this.getColumnWidth();
        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as HTMLElement;
        const scrollWidth = html.scrollWidth;
        
        var offset = leftWidth + width;
        if (offset < scrollWidth) {
            this.setLeftColumnsWidth(offset);
        } else {
            this.setLeftColumnsWidth(scrollWidth);
        }
    }
    /** Goes to a position specified by a number in the range [0..1].
        The position should be a number as returned by getCurrentPosition,
        or 1 to go to the last page. The position will be rounded down so
        it matches the position of one of the columns. */
    /** @param position Number in range [0..1] */
    public goToPosition(position: number) {
        this.setSize();
        // If the window has changed size since the columns were set up,
        // we need to reset position so we can determine the new total width.

        const width = this.getColumnWidth();
        const rightWidth = this.getRightColumnsWidth();
        const totalWidth = width + rightWidth;

        const newLeftWidth = position * totalWidth;

        // Round the new left width so it's a multiple of the column width.

        let roundedLeftWidth = Math.round(newLeftWidth / width) * width;
        if (roundedLeftWidth >= totalWidth) {
            // We've gone too far and all the columns are off to the left.
            // Move one column back into the viewport.
            roundedLeftWidth = roundedLeftWidth - width;
        }
        this.setLeftColumnsWidth(roundedLeftWidth);
    }

    public goToElement(elementId: string, relative?: boolean) {
        const element = (this.iframe.contentDocument as any).getElementById(elementId);
        if (element) {
            // Get the element's position in the iframe, and
            // round that to figure out the column it's in.

            // There is a bug in Safari when using getBoundingClientRect
            // on an element that spans multiple columns. Temporarily
            // set the element's height to fit it on one column so we
            // can determine the first column position.
            const originalHeight = element.style.height;
            element.style.height = "0";

            const left = element.getBoundingClientRect().left;
            const width = this.getColumnWidth();
            let roundedLeftWidth = Math.floor(left / width) * width;
            if (relative) {
                const origin = this.getLeftColumnsWidth();
                roundedLeftWidth = (Math.floor(left / width) * width) + origin;
            }

            // Restore element's original height.
            element.style.height = originalHeight;

            this.setLeftColumnsWidth(roundedLeftWidth);
        }
    }
}
