import * as BrowserUtilities from "./BrowserUtilities";


export function addEventListenerOptional(element: any, eventType: string, eventListener: any) {
    if (element) {
        element.addEventListener(eventType, eventListener);
    }
}
export function removeEventListenerOptional(element: any, eventType: string, eventListener: any) {
    if (element) {
        element.removeEventListener(eventType, eventListener);
    }
}


export default class EventHandler {
    private pendingMouseEventStart: MouseEvent | null = null;
    private pendingMouseEventEnd: MouseEvent | null = null;
    private pendingTouchEventStart: TouchEvent | null = null;
    private pendingTouchEventEnd: TouchEvent | null = null;

    public onLeftTap: (event: UIEvent) => void = () => {};
    public onMiddleTap: (event: UIEvent) => void = () => {};
    public onRightTap: (event: UIEvent) => void = () => {};
    public onBackwardSwipe: (event: UIEvent) => void = () => {};
    public onForwardSwipe: (event: UIEvent) => void = () => {};

    public onLeftArrow: (event: UIEvent) => void = () => {};
    public onRightArrow: (event: UIEvent) => void = () => {};

    public onLeftHover: () => void = () => {};
    public onRightHover: () => void = () => {};
    public onRemoveHover: () => void = () => {};

    public onInternalLink: (event: UIEvent) => void = () => {};

    private static readonly CLICK_PIXEL_TOLERANCE = 10;
    private static readonly TAP_PIXEL_TOLERANCE = 10;
    private static readonly DOUBLE_CLICK_MS = 200;
    private static readonly LONG_PRESS_MS = 500;
    private static readonly DOUBLE_TAP_MS = 200;
    private static readonly SLOW_SWIPE_MS = 500;

    public setupEvents(element: HTMLElement | Document | null) {
        if (element !== null) {
            element.addEventListener("touchstart", this.handleTouchEventStart.bind(this));
            element.addEventListener("touchend", this.handleTouchEventEnd.bind(this));
            element.addEventListener("mousedown", this.handleMouseEventStart.bind(this));
            element.addEventListener("mouseup", this.handleMouseEventEnd.bind(this));
            element.addEventListener("mouseenter", this.handleMouseMove.bind(this));
            element.addEventListener("mousemove", this.handleMouseMove.bind(this));
            element.addEventListener("mouseleave", this.handleMouseLeave.bind(this));

            // Most click handling is done in the touchend and mouseup event handlers,
            // but if there's a click on an external link we need to cancel the click
            // event to prevent it from opening in the iframe.
            element.addEventListener("click", this.handleLinks.bind(this));

        } else {
            throw "cannot setup events for null";
        }
    }

    private handleMouseEventStart = (event: MouseEvent): void => {
        this.pendingMouseEventStart = event;
    }

    private handleTouchEventStart = (event: TouchEvent): void => {
        if (BrowserUtilities.isZoomed()) {
            return;
        }

        if (event.changedTouches.length !== 1) {
            // This is a multi-touch event. Ignore.
            return;
        }

        this.pendingTouchEventStart = event;
    }

    private handleMouseEventEnd = (event: MouseEvent): void => {
        if (!this.pendingMouseEventStart) {
            // Somehow we got an end event without a start event. Ignore it.
            return;
        }

        const devicePixelRatio = window.devicePixelRatio;

        const xDevicePixels = (this.pendingMouseEventStart.clientX - event.clientX) / devicePixelRatio;
        const yDevicePixels = (this.pendingMouseEventStart.clientY - event.clientY) / devicePixelRatio;

        // Is the end event in the same place as the start event?
        if (Math.abs(xDevicePixels) < EventHandler.CLICK_PIXEL_TOLERANCE && Math.abs(yDevicePixels) < EventHandler.CLICK_PIXEL_TOLERANCE) {
            if (this.pendingMouseEventEnd) {
                // This was a double click. Let the browser handle it.
                this.pendingMouseEventStart = null;
                this.pendingMouseEventEnd = null;
                return;
            }

            // This was a single click.
            this.pendingMouseEventStart = null;
            this.pendingMouseEventEnd = event;
            setTimeout(this.handleClick, EventHandler.DOUBLE_CLICK_MS);
            return;
        }

        this.pendingMouseEventEnd = null;

        // This is a swipe or highlight. Let the browser handle it.
        // (Swipes aren't handled on desktop.)
        this.pendingMouseEventStart = null;
    }

    private handleTouchEventEnd = (event: TouchEvent): void => {
        event.preventDefault();
        if (BrowserUtilities.isZoomed()) {
            return;
        }

        if (event.changedTouches.length !== 1) {
            // This is a multi-touch event. Ignore.
            return;
        }

        if (!this.pendingTouchEventStart) {
            // Somehow we got an end event without a start event. Ignore it.
            return;
        }

        const startTouch = this.pendingTouchEventStart.changedTouches[0];
        const endTouch = event.changedTouches[0];

        if (!startTouch) {
            // Somehow we saved a touch event with no touches.
            return;
        }

        const devicePixelRatio = window.devicePixelRatio;

        const xDevicePixels = (startTouch.clientX - endTouch.clientX) / devicePixelRatio;
        const yDevicePixels = (startTouch.clientY - endTouch.clientY) / devicePixelRatio;

        // Is the end event in the same place as the start event?
        if (Math.abs(xDevicePixels) < EventHandler.TAP_PIXEL_TOLERANCE && Math.abs(yDevicePixels) < EventHandler.TAP_PIXEL_TOLERANCE) {
            if (this.pendingTouchEventEnd) {
                // This was a double tap. Let the browser handle it.
                this.pendingTouchEventStart = null;
                this.pendingTouchEventEnd = null;
                return;
            }

            // This was a single tap or long press.
            if (event.timeStamp - this.pendingTouchEventStart.timeStamp > EventHandler.LONG_PRESS_MS) {
                // This was a long press. Let the browser handle it.
                this.pendingTouchEventStart = null;
                this.pendingTouchEventEnd = null;
                return;
            }

            // This was a single tap.
            this.pendingTouchEventStart = null;
            this.pendingTouchEventEnd = event;
            setTimeout(this.handleTap, EventHandler.DOUBLE_TAP_MS);
            return;
        }

        this.pendingTouchEventEnd = null;

        if (event.timeStamp - this.pendingTouchEventStart.timeStamp > EventHandler.SLOW_SWIPE_MS) {
            // This is a slow swipe / highlight. Let the browser handle it.
            this.pendingTouchEventStart = null;
            return;
        }

        // This is a swipe. 
        const slope = (startTouch.clientY - endTouch.clientY) / (startTouch.clientX - endTouch.clientX);
        if (Math.abs(slope) > 0.5) {
            // This is a mostly vertical swipe. Ignore.
            this.pendingTouchEventStart = null;
            return;
        }

        // This was a horizontal swipe.
        if (xDevicePixels < 0) {
            this.onBackwardSwipe(event);
        } else {
            this.onForwardSwipe(event);
        }
        this.pendingTouchEventStart = null;
    }

    private handleClick = (): void => {
        if (!this.pendingMouseEventEnd) {
            // Another click happened already.
            return;
        }

        if (this.checkForLink(this.pendingMouseEventEnd)) {
            // This was a single click on a link. Do nothing.
            this.pendingMouseEventEnd = null;
            return;
        }

        // This was a single click.
        const x = this.pendingMouseEventEnd.clientX;
        const width = window.innerWidth;
        if (x / width < 0.05) {
            this.onLeftTap(this.pendingMouseEventEnd);
        } else if (x / width > 0.95) {
            this.onRightTap(this.pendingMouseEventEnd);
        } else {
            this.onMiddleTap(this.pendingMouseEventEnd);
        }
        this.pendingMouseEventEnd = null;
        return;
    }

    private handleTap = (): void => {
        if (!this.pendingTouchEventEnd) {
            // Another tap happened already.
            return;
        }

        if (this.checkForLink(this.pendingTouchEventEnd)) {
            this.handleLinks(this.pendingTouchEventEnd);
            
            // This was a single tap on a link. Do nothing.
            this.pendingTouchEventEnd = null;
            return;
        }

        // This was a single tap.
        const touch = this.pendingTouchEventEnd.changedTouches[0];
        if (!touch) {
            // Somehow we got a touch event with no touches.
            return;
        }

        const x = touch.clientX;
        const width = window.innerWidth;
        if (x / width < 0.05) {
            this.onLeftTap(this.pendingTouchEventEnd);
        } else if (x / width > 0.95) {
            this.onRightTap(this.pendingTouchEventEnd);
        } else {
            this.onMiddleTap(this.pendingTouchEventEnd);
        }
        this.pendingTouchEventEnd = null;
        return;
    }

    private checkForLink = (event: MouseEvent | TouchEvent): HTMLAnchorElement | null => {
        let nextElement = event.target as any;
        while (nextElement && nextElement.tagName.toLowerCase() !== "body") {
            if (nextElement.tagName.toLowerCase() === "a" && (nextElement as HTMLAnchorElement).href) {
                return (nextElement as HTMLAnchorElement);
            } else {
                (nextElement as any) = nextElement.parentElement;
            }
        }
        return null;
    }

    private handleMouseMove = (event: MouseEvent): void => {
        const x = event.clientX;
        const width = window.innerWidth;
        if (x / width < 0.05) {
            this.onLeftHover();
        } else if (x / width > 0.95) {
            this.onRightHover();
        } else {
            this.onRemoveHover();
        }
    }

    private handleMouseLeave = (): void => {
        this.onRemoveHover();
    }

    private handleLinks = (event: MouseEvent | TouchEvent): void => {
        const link = this.checkForLink(event);
        if (link) {
            // Open external links in new tabs.
            const isSameOrigin = (
                window.location.protocol === link.protocol &&
                window.location.port === link.port &&
                window.location.hostname === link.hostname
            );
            const isInternal = (link.href.indexOf("#"));
            if (!isSameOrigin) {
                window.open(link.href, "_blank");
                event.preventDefault();
                event.stopPropagation();
            }else { 
                (event.target as HTMLAnchorElement).href = link.href
                if (isSameOrigin && isInternal !== -1) {
                    this.onInternalLink(event);
                } else if (isSameOrigin && isInternal === -1) {
                    // TODO needs some more refactoring when handling other types of links or elements 
                    // link.click();
                    this.onInternalLink(event);
                }
         }
        }
    }

}