/** Returns the current width of the document. */
export function getWidth(): number {
    return document.documentElement.clientWidth;
}

/** Returns the current height of the document. */
export function getHeight(): number {
    return document.documentElement.clientHeight;
}

/** Returns true if the browser is zoomed in with pinch-to-zoom on mobile. */
export function isZoomed(): boolean {
    return (getWidth() !== window.innerWidth);
}