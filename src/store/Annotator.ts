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
  initLastReadingPosition(position: ReadingPosition): Promise<void>;
  getLastReadingPosition(): Promise<any>;
  saveLastReadingPosition(position: any): Promise<void>;

  initBookmarks(list: any): Promise<any>;
  saveBookmark(bookmark: any): Promise<any>;
  deleteBookmark(bookmark: any): Promise<any>;
  getBookmarks(href?: string): Promise<any>;
  locatorExists(locator: any, type: AnnotationType): Promise<any>;

  initAnnotations(list: any): Promise<any>;
  saveAnnotation(annotation: any): Promise<any>;
  deleteAnnotation(id: any): Promise<any>;
  deleteSelectedAnnotation(annotation: any): Promise<any>;
  getAnnotations(): Promise<any>;
  getAnnotation(annotation: IHighlight): Promise<any>;
  getAnnotationByID(id: string): Promise<any>;
  getAnnotationPosition(id: any, iframeWin: any): Promise<any>;
}

export enum AnnotationType {
  Bookmark,
  Annotation,
}

export default Annotator;
