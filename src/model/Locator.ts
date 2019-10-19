
/*
 * Module: r2-shared-js
 * Developers: Aferdita Muriqi
 *
 * Copyright (c) 2018. Readium Foundation. All rights reserved.
 * Use of this source code is governed by a BSD-style license which is detailed in the
 * LICENSE file present in the project repository where this source code is maintained.
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
    id?: number; 
    created: Date;
}


