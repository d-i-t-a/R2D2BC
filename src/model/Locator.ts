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

import { IHighlight } from "../modules/highlight/common/highlight";

export interface Locator {
    href: string;
    type?: string;
    title?: string;
    locations: Locations;
    text?: LocatorText;
    displayInfo?: any;
}


export interface LocatorText {
    after?: string;
    before?: string;
    highlight?: string;
}

export interface Locations {
    fragment?: string;        // 2 = fragment identifier (toc, page lists, landmarks)
    progression?: number;     // 3 = bookmarks
    position?: number;        // 4 = goto page
    totalProgression?: number;
    remainingPositions?: number;
    totalRemainingPositions?: number;
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
    range: Range;
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
