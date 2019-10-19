/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import { ReadingPosition } from "../model/Locator";

interface Annotator {
    initLastReadingPosition(position: ReadingPosition): Promise<void>;
    getLastReadingPosition(): Promise<any>;
    saveLastReadingPosition(position: any): Promise<void>;

    initBookmarks(list: any): Promise<any>;
    saveBookmark(bookmark: any): Promise<any>;
    deleteBookmark(bookmark: any): Promise<any>;
    getBookmarks(href?:string): Promise<any>;
    locatorExists(locator: any, type:AnnotationType): Promise<any>;
}

export enum AnnotationType {
    Bookmark
}

export default Annotator;