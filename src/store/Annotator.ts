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

import { Annotation, Bookmark, Comment, ReadingPosition } from "../model/v3";
import { IHighlight } from "../modules/highlight/common/highlight";
import { ISelectionInfo } from "../modules/highlight/common/selection";

interface Annotator {
  initLastReadingPosition(position: ReadingPosition): void;
  getLastReadingPosition(): ReadingPosition | null;
  saveLastReadingPosition(position: ReadingPosition | string): void;

  initBookmarks(list: Bookmark[] | string): Bookmark[];
  saveBookmark(bookmark: Bookmark): Bookmark;
  deleteBookmark(bookmark: Bookmark): Bookmark;
  getBookmarks(href?: string): Bookmark[];
  locatorExists(locator: Bookmark, type: AnnotationType): Bookmark | null;

  initAnnotations(list: Annotation[] | string): Annotation[];
  saveAnnotation(annotation: Annotation): Annotation;
  deleteAnnotation(id: string): string;
  deleteSelectedAnnotation(annotation: Annotation): Annotation;
  getAnnotations(): Annotation[];
  getAnnotationsByChapter(chapter: string): Annotation[];
  getAnnotation(annotation: IHighlight): Annotation | null;
  getAnnotationByID(id: string): Annotation | null;
  /** Returns the pixel top offset of the annotation highlight element, or null if not found. */
  getAnnotationPosition(id: string, iframeWin: Window): number | null;
  /** Returns the highlight DOM element for an annotation, or null if not found. */
  getAnnotationElement(id: string, iframeWin: Window): HTMLElement | null;

  saveTemporarySelectionInfo(selectionInfo: ISelectionInfo): void;
  /** Returns the reconstituted selection info with a live Range, or null. */
  getTemporarySelectionInfo(doc: Document | null): ISelectionInfo | null;
  deleteTemporarySelectionInfo(): void;

  initComments(list: Comment[] | string): Comment[];
  saveComment(comment: Comment): Comment;
  deleteComment(id: string): string;
  getComments(href?: string): Comment[];
  getCommentByID(id: string): Comment | null;
  updateComment(id: string, body: string): Comment | null;
}

export enum AnnotationType {
  Bookmark,
  Annotation,
}

export default Annotator;
