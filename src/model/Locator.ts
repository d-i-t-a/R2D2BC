
/*
 * Module: r2-shared-js
 * Developers: Aferdita Muriqi
 *
 * Copyright (c) 2018. Readium Foundation. All rights reserved.
 * Use of this source code is governed by a BSD-style license which is detailed in the
 * LICENSE file present in the project repository where this source code is maintained.
 */


/**
 * Locator model - https://github.com/readium/architecture/tree/master/locators
 *
 * @val href: String -  The href of the resource the locator points at.
 * @val created: Long - The datetime of creation of the locator.
 * @val title: String - The title of the chapter or section which is more relevant in the context of this locator.
 * @val location: Location - One or more alternative expressions of the location.
 * @val text: LocatorText? - Textual context of the locator.
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

/**
 * Location : Interface that contain the different variables needed to localize a particular position
 *
 * @var fragment: Long? - Identifier of a specific fragment in the publication
 * @var progression?: Double - A percentage ( between 0 and 1 ) of the progression in a Publication
 * @var position?: Long - Index of a segment in the resource / synthetic page number!!??
 *
 */
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


