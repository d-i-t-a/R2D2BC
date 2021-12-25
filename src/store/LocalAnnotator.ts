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
import { SHA256 } from "jscrypto/es6/SHA256";
import Annotator, { AnnotationType } from "./Annotator";
import Store from "./Store";
import { Annotation, Bookmark, ReadingPosition } from "../model/Locator";
import { IHighlight } from "../modules/highlight/common/highlight";
import TextHighlighter from "../modules/highlight/TextHighlighter";

export interface LocalAnnotatorConfig {
  store: Store;
}

/** Annotator that stores annotations locally, in the browser. */
export default class LocalAnnotator implements Annotator {
  private readonly store: Store;
  private static readonly LAST_READING_POSITION = "last-reading-position";
  private static readonly BOOKMARKS = "bookmarks";
  private static readonly ANNOTATIONS = "annotations";

  public constructor(config: LocalAnnotatorConfig) {
    this.store = config.store;
  }

  public async getLastReadingPosition(): Promise<any> {
    const positionString = await this.store.get(
      LocalAnnotator.LAST_READING_POSITION
    );
    if (positionString) {
      const position = JSON.parse(positionString);
      return new Promise((resolve) => resolve(position));
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async initLastReadingPosition(
    position: ReadingPosition
  ): Promise<void> {
    if (typeof position === "string") {
      await this.store.set(LocalAnnotator.LAST_READING_POSITION, position);
    } else {
      const positionString = JSON.stringify(position);
      await this.store.set(
        LocalAnnotator.LAST_READING_POSITION,
        positionString
      );
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async saveLastReadingPosition(position: any): Promise<void> {
    if (typeof position === "string") {
      await this.store.set(LocalAnnotator.LAST_READING_POSITION, position);
    } else {
      const positionString = JSON.stringify(position);
      await this.store.set(
        LocalAnnotator.LAST_READING_POSITION,
        positionString
      );
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async initBookmarks(list: any): Promise<any> {
    if (typeof list === "string") {
      let savedBookmarksObj = JSON.parse(list);
      await this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(savedBookmarksObj)
      );
      return new Promise((resolve) => resolve(list));
    } else {
      await this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(list));
      return new Promise((resolve) => resolve(list));
    }
  }

  public async saveBookmark(bookmark: any): Promise<any> {
    let savedBookmarks = await this.store.get(LocalAnnotator.BOOKMARKS);

    if (savedBookmarks) {
      let savedBookmarksObj = JSON.parse(savedBookmarks);
      savedBookmarksObj.push(bookmark);
      await this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(savedBookmarksObj)
      );
    } else {
      let bookmarksAry = [];
      bookmarksAry.push(bookmark);
      await this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(bookmarksAry)
      );
    }

    return new Promise((resolve) => resolve(bookmark));
  }

  public async locatorExists(locator: any, type: AnnotationType): Promise<any> {
    let storeType;
    switch (type) {
      case AnnotationType.Bookmark:
        storeType = LocalAnnotator.BOOKMARKS;
        break;
    }
    const locatorsString = await this.store.get(storeType);
    if (locatorsString) {
      const locators = JSON.parse(locatorsString) as Array<any>;
      const filteredLocators = locators.filter(
        (el: any) =>
          el.href === locator.href &&
          el.locations.progression === locator.locations.progression
      );
      if (filteredLocators.length > 0) {
        return new Promise((resolve) => resolve(locator));
      }
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async deleteBookmark(bookmark: any): Promise<any> {
    let savedBookmarks = await this.store.get(LocalAnnotator.BOOKMARKS);
    if (savedBookmarks) {
      let savedBookmarksObj = JSON.parse(savedBookmarks) as Array<any>;
      savedBookmarksObj = savedBookmarksObj.filter(
        (el: any) => el.id !== bookmark.id
      );
      await this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(savedBookmarksObj)
      );
    }
    return new Promise((resolve) => resolve(bookmark));
  }

  public async getBookmarks(href?: string): Promise<any> {
    const bookmarksString = await this.store.get(LocalAnnotator.BOOKMARKS);
    if (bookmarksString) {
      let bookmarks = JSON.parse(bookmarksString);
      if (href) {
        let filteredResult = bookmarks.filter((el: any) => el.href === href);
        filteredResult = filteredResult.sort(
          (n1: Bookmark, n2: Bookmark) =>
            n1.locations.progression - n2.locations.progression
        );
        return new Promise((resolve) => resolve(filteredResult));
      }
      bookmarks = bookmarks.sort(
        (n1: Bookmark, n2: Bookmark) =>
          n1.locations.progression - n2.locations.progression
      );
      return new Promise((resolve) => resolve(bookmarks));
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async initAnnotations(list: any): Promise<any> {
    let annotations: Array<any>;

    if (typeof list === "string") {
      annotations = JSON.parse(list);
    } else {
      annotations = list;
    }

    let annotationsToStore: Array<any> = [];
    annotations.forEach((rangeRepresentation) => {
      const uniqueStr = `${rangeRepresentation.highlight.selectionInfo.rangeInfo.startContainerElementCssSelector}${rangeRepresentation.highlight.selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${rangeRepresentation.highlight.selectionInfo.rangeInfo.startOffset}${rangeRepresentation.highlight.selectionInfo.rangeInfo.endContainerElementCssSelector}${rangeRepresentation.highlight.selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${rangeRepresentation.highlight.selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      rangeRepresentation.highlight.id = "R2_HIGHLIGHT_" + sha256Hex;

      // Highlight color as string passthrough
      var rangeColor: any;
      rangeColor = rangeRepresentation.color;
      if (TextHighlighter.isHexColor(rangeColor)) {
        rangeColor = TextHighlighter.hexToRgbString(rangeColor);
      }

      rangeRepresentation.highlight.color = rangeColor;
      rangeRepresentation.highlight.pointerInteraction = true;

      rangeRepresentation.highlight.selectionInfo.cleanText =
        rangeRepresentation.highlight.selectionInfo.rawText
          .trim()
          .replace(/\n/g, " ")
          .replace(/\s\s+/g, " ");

      annotationsToStore.push(rangeRepresentation);
    });

    await this.store.set(
      LocalAnnotator.ANNOTATIONS,
      JSON.stringify(annotationsToStore)
    );
    return new Promise((resolve) => resolve(annotationsToStore));
  }

  public async saveAnnotation(annotation: any): Promise<any> {
    let savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations);
      annotations.push(annotation);
      await this.store.set(
        LocalAnnotator.ANNOTATIONS,
        JSON.stringify(annotations)
      );
    } else {
      let annotations = [];
      annotations.push(annotation);
      await this.store.set(
        LocalAnnotator.ANNOTATIONS,
        JSON.stringify(annotations)
      );
    }
    return new Promise((resolve) => resolve(annotation));
  }

  public async deleteAnnotation(id: any): Promise<any> {
    let savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations) as Array<any>;
      annotations = annotations.filter((el: any) => el.id !== id);
      await this.store.set(
        LocalAnnotator.ANNOTATIONS,
        JSON.stringify(annotations)
      );
    }
    return new Promise((resolve) => resolve(id));
  }

  public async deleteSelectedAnnotation(annotation: any): Promise<any> {
    let savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations) as Array<any>;
      annotations = annotations.filter(
        (el: Annotation) => el.highlight.id !== annotation.highlight.id
      );
      await this.store.set(
        LocalAnnotator.ANNOTATIONS,
        JSON.stringify(annotations)
      );
    }
    return new Promise((resolve) => resolve(annotation));
  }

  public async getAnnotations(): Promise<any> {
    const savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations);
      annotations = annotations.sort(
        (n1: Annotation, n2: Annotation) =>
          n1.locations.progression - n2.locations.progression
      );
      return new Promise((resolve) => resolve(annotations));
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async getAnnotationPosition(id: any, iframeWin): Promise<any> {
    const savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter((el: Annotation) => el.id === id);
      if (filtered.length > 0) {
        let foundElement = iframeWin.document.getElementById(
          `${filtered[0].highlight.id}`
        );
        if (foundElement) {
          let position = 0;
          if (foundElement.hasChildNodes) {
            for (let i = 0; i < foundElement.childNodes.length; i++) {
              let childNode = foundElement.childNodes[i] as HTMLDivElement;
              let top = parseInt(childNode.style.top.replace("px", ""));
              if (top < position || position == 0) {
                position = top;
              }
            }
          } else {
            position = parseInt(
              (foundElement as HTMLDivElement).style.top.replace("px", "")
            );
          }
          return new Promise((resolve) => resolve(position));
        }
      }
    }
    return new Promise<void>((resolve) => resolve());
  }

  public async getAnnotation(highlight: IHighlight): Promise<any> {
    const savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter(
        (el: Annotation) => el.highlight.id === highlight.id
      );
      if (filtered.length > 0) {
        return new Promise((resolve) => resolve(filtered[0]));
      }
    }
    return new Promise<void>((resolve) => resolve());
  }
  public async getAnnotationByID(id: string): Promise<any> {
    const savedAnnotations = await this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter(
        (el: Annotation) => el.highlight.id === id
      );
      if (filtered.length > 0) {
        return new Promise((resolve) => resolve(filtered[0]));
      }
    }
    return new Promise<void>((resolve) => resolve());
  }
}
