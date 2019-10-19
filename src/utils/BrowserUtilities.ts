/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

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