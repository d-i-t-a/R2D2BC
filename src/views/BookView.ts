/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. Aferdita Muriqi. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

interface BookView {
    name: string;
    label: string;

    iframe: Element;
    sideMargin: number;
    height: number;

    /** Load this view in its book element, at the specified position. */
    start(): void;

    /** Remove this view from its book element. */
    stop(): void;

    getCurrentPosition(): number;
    goToPosition(position: number): void;
    goToElement(elementId: string, relative?: boolean): void;
}
export default BookView;