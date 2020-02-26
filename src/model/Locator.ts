import { IHighlight } from "../modules/highlight/common/highlight";

/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

export interface Locator {
    href: string;
    type?: string;
    title: string;
    locations: Locations;
    text?: LocatorText;
}


export interface LocatorText {
    after?: string;
    before?: string;
    hightlight?: string;
}

export interface Locations {
    fragment?: string;        // 2 = fragment identifier (toc, page lists, landmarks)
    progression?: number;     // 3 = bookmarks
    position?: number;        // 4 = goto page
    totalProgression?: number;
}

export interface ReadingPosition extends Locator {
    created: Date;
}

export interface Bookmark extends Locator {
    id?: any; 
    created: Date;
}

export enum AnnotationMarker {
    Highlight,
    Underline
}

export interface Annotation extends Locator {
    id?: any;
    created: Date;
    highlight?: IHighlight;
    marker: AnnotationMarker;
    color: string;
}

export interface ISelectionInfo {
    rangeInfo: IRangeInfo;
    cleanText: string;
    rawText: string;
    color: string;
}

export interface IRangeInfo {
    startContainerElementCssSelector: string;
    startContainerChildTextNodeIndex: number;
    startOffset: number;
    endContainerElementCssSelector: string;
    endContainerChildTextNodeIndex: number;
    endOffset: number;
}

export interface ChapterWeight {
    chapterHref: string, 
    weight: number 
}
