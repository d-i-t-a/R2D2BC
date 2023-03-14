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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { ReadingPosition } from "../model/Locator";
import { IHighlight } from "../modules/highlight/common/highlight";

interface Annotator {
  initLastReadingPosition(position: ReadingPosition);
  getLastReadingPosition(): any;
  saveLastReadingPosition(position: any);

  initBookmarks(list: any): any;
  saveBookmark(bookmark: any): any;
  deleteBookmark(bookmark: any): any;
  getBookmarks(href?: string): any;
  locatorExists(locator: any, type: AnnotationType): any;

  initAnnotations(list: any): any;
  saveAnnotation(annotation: any): any;
  deleteAnnotation(id: any): any;
  deleteSelectedAnnotation(annotation: any): any;
  getAnnotations(): any;
  getAnnotationsByChapter(chapter: string): any;
  getAnnotation(annotation: IHighlight): any;
  getAnnotationByID(id: string): any;
  getAnnotationPosition(id: any, iframeWin: any): any;
  getAnnotationElement(id: any, iframeWin: any): any;

  saveTemporarySelectionInfo(selectionInfo: any);
  getTemporarySelectionInfo(doc: any): any;
  deleteTemporarySelectionInfo();
}

export enum AnnotationType {
  Bookmark,
  Annotation,
}

export default Annotator;
