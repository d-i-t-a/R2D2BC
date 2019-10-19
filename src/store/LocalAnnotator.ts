/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import Annotator, { AnnotationType } from "./Annotator";
import Store from "./Store";
import { ReadingPosition, Bookmark } from "../model/Locator";

export interface LocalAnnotatorConfig {
    store: Store;
}

/** Annotator that stores annotations locally, in the browser. */
export default class LocalAnnotator implements Annotator {
    private readonly store: Store;
    private static readonly LAST_READING_POSITION = "last-reading-position";
    private static readonly BOOKMARKS = "bookmarks";

    public constructor(config: LocalAnnotatorConfig) {
        this.store = config.store;
    }

    public async getLastReadingPosition(): Promise<any> {
        const positionString = await this.store.get(LocalAnnotator.LAST_READING_POSITION);
        if (positionString) {
            const position = JSON.parse(positionString);
            return new Promise(resolve => resolve(position));
        }
        return new Promise(resolve => resolve());
    }

    public async initLastReadingPosition(position: ReadingPosition): Promise<void> {
        if(typeof position === 'string' ) {
            await this.store.set(LocalAnnotator.LAST_READING_POSITION, position);
        } else {
            const positionString = JSON.stringify(position);
            await this.store.set(LocalAnnotator.LAST_READING_POSITION, positionString);
        }
        return new Promise<void>(resolve => resolve());
    }    

    public async saveLastReadingPosition(position: any): Promise<void> {
        if(typeof position === 'string' ) {
            await this.store.set(LocalAnnotator.LAST_READING_POSITION, position);
        } else {
            const positionString = JSON.stringify(position);
            await this.store.set(LocalAnnotator.LAST_READING_POSITION, positionString);
        }
        return new Promise<void>(resolve => resolve());
    }    

    public async initBookmarks(list: any): Promise<any> {
        if(typeof list === 'string' ) {
            let savedBookmarksObj = JSON.parse(list);
            await this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(savedBookmarksObj));
            return new Promise(resolve => resolve(list));

        } else {
            await this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(list));
            return new Promise(resolve => resolve(list));
        }
    }

    public async saveBookmark(bookmark: any): Promise<any> {
        let savedBookmarks = await this.store.get(LocalAnnotator.BOOKMARKS);

        if (savedBookmarks) {
            let savedBookmarksObj = JSON.parse(savedBookmarks);
            savedBookmarksObj.push(bookmark);
            await this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(savedBookmarksObj));
        } else {
            let bookmarksAry = new Array();
            bookmarksAry.push(bookmark);
            await this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(bookmarksAry));
        }

        return new Promise(resolve => resolve(bookmark));
    }

    public async locatorExists(locator: any, type: AnnotationType): Promise<any> {
        let storeType 
        switch(type) {
            case AnnotationType.Bookmark:
                storeType = LocalAnnotator.BOOKMARKS
                break
        }
        const locatorsString = await this.store.get(storeType);
        if (locatorsString) {
            const locators = JSON.parse(locatorsString) as Array<any>;
            const filteredLocators = locators.filter( (el: any) => el.href === locator.href && el.locations.progression === locator.locations.progression);
            if(filteredLocators.length > 0) {
                return new Promise(resolve => resolve(locator));
            }
        }
        return new Promise(resolve => resolve());
    }

    public async deleteBookmark(bookmark: any): Promise<any> {
        let savedBookmarks = await this.store.get(LocalAnnotator.BOOKMARKS);
        if (savedBookmarks) {
            let savedBookmarksObj = JSON.parse(savedBookmarks) as Array<any>;
            savedBookmarksObj = savedBookmarksObj.filter( (el: any) => el.id !== bookmark.id );
            await this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(savedBookmarksObj));
        } 
        return new Promise(resolve => resolve(bookmark));
    }

    public async getBookmarks(href?:string): Promise<any> {
        const bookmarksString = await this.store.get(LocalAnnotator.BOOKMARKS);
        if (bookmarksString) {
            let bookmarks = JSON.parse(bookmarksString);
            if(href) {
                let filteredResult = bookmarks.filter( (el: any) => el.href === href);
                filteredResult  =  filteredResult.sort((n1:Bookmark,n2:Bookmark) => n1.locations.progression - n2.locations.progression);
                return new Promise(resolve => resolve(filteredResult));
            }
            bookmarks  =  bookmarks.sort((n1:Bookmark,n2:Bookmark) => n1.locations.progression - n2.locations.progression);
            return new Promise(resolve => resolve(bookmarks));
        }
        return new Promise(resolve => resolve());
    }
    
}