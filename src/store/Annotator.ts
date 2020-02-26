/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import { ReadingPosition } from "../model/Locator";
import { IHighlight } from "../modules/highlight/common/highlight";
import { IReadiumIFrameWindow } from "../modules/highlight/renderer/iframe/state";

interface Annotator {
    initLastReadingPosition(position: ReadingPosition): Promise<void>;
    getLastReadingPosition(): Promise<any>;
    saveLastReadingPosition(position: any): Promise<void>;

    initBookmarks(list: any): Promise<any>;
    saveBookmark(bookmark: any): Promise<any>;
    deleteBookmark(bookmark: any): Promise<any>;
    getBookmarks(href?:string): Promise<any>;
    locatorExists(locator: any, type:AnnotationType): Promise<any>;

    initAnnotations(list: any): Promise<any>;
    saveAnnotation(annotation: any): Promise<any>;
    deleteAnnotation(id: any): Promise<any>;
    deleteSelectedAnnotation(annotation:any):Promise<any>;
    getAnnotations(): Promise<any>;
    getAnnotation(annotation:IHighlight): Promise<any>;
    getAnnotationPosition(id:any, iframeWin:IReadiumIFrameWindow): Promise<any>;

}

export enum AnnotationType {
    Bookmark,
    Annotation
}

export default Annotator;