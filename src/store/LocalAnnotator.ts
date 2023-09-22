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
import { TextHighlighter } from "../modules/highlight/TextHighlighter";
import { convertRangeInfo } from "../modules/highlight/renderer/iframe/selection";

export interface LocalAnnotatorConfig {
  store: Store;
}

/** Annotator that stores annotations locally, in the browser. */
export default class LocalAnnotator implements Annotator {
  private readonly store: Store;
  private static readonly LAST_READING_POSITION = "last-reading-position";
  private static readonly BOOKMARKS = "bookmarks";
  private static readonly ANNOTATIONS = "annotations";
  private static readonly SELECTIONINFO = "selectionInfo";

  public constructor(config: LocalAnnotatorConfig) {
    this.store = config.store;
  }

  public getLastReadingPosition(): any {
    const positionString = this.store.get(LocalAnnotator.LAST_READING_POSITION);
    if (positionString) {
      const position = JSON.parse(positionString);
      return position;
    }
    return null;
  }

  public initLastReadingPosition(position: ReadingPosition) {
    if (typeof position === "string") {
      this.store.set(LocalAnnotator.LAST_READING_POSITION, position);
    } else {
      const positionString = JSON.stringify(position);
      this.store.set(LocalAnnotator.LAST_READING_POSITION, positionString);
    }
  }

  public saveLastReadingPosition(position: any) {
    if (typeof position === "string") {
      this.store.set(LocalAnnotator.LAST_READING_POSITION, position);
    } else {
      const positionString = JSON.stringify(position);
      this.store.set(LocalAnnotator.LAST_READING_POSITION, positionString);
    }
  }

  public initBookmarks(list: any): any {
    if (typeof list === "string") {
      let savedBookmarksObj = JSON.parse(list);
      this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(savedBookmarksObj)
      );
    } else {
      this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(list));
    }
    return list;
  }

  public saveBookmark(bookmark: any): any {
    let savedBookmarks = this.store.get(LocalAnnotator.BOOKMARKS);

    if (savedBookmarks) {
      let savedBookmarksObj = JSON.parse(savedBookmarks);
      savedBookmarksObj.push(bookmark);
      this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(savedBookmarksObj)
      );
    } else {
      let bookmarksAry: any[] = [];
      bookmarksAry.push(bookmark);
      this.store.set(LocalAnnotator.BOOKMARKS, JSON.stringify(bookmarksAry));
    }

    return bookmark;
  }

  public locatorExists(locator: any, type: AnnotationType): any | null {
    let storeType;
    switch (type) {
      case AnnotationType.Bookmark:
        storeType = LocalAnnotator.BOOKMARKS;
        break;
    }
    const locatorsString = this.store.get(storeType);
    if (locatorsString) {
      const locators = JSON.parse(locatorsString) as Array<any>;
      const filteredLocators = locators.filter(
        (el: any) =>
          el.href === locator.href &&
          el.locations.progression === locator.locations.progression
      );
      if (filteredLocators.length > 0) {
        return locator;
      }
    }
    return null;
  }

  public deleteBookmark(bookmark: any): any {
    let savedBookmarks = this.store.get(LocalAnnotator.BOOKMARKS);
    if (savedBookmarks) {
      let savedBookmarksObj = JSON.parse(savedBookmarks) as Array<any>;
      savedBookmarksObj = savedBookmarksObj.filter(
        (el: any) => el.id !== bookmark.id
      );
      this.store.set(
        LocalAnnotator.BOOKMARKS,
        JSON.stringify(savedBookmarksObj)
      );
    }
    return bookmark;
  }

  public getBookmarks(href?: string): any {
    const bookmarksString = this.store.get(LocalAnnotator.BOOKMARKS);
    if (bookmarksString) {
      let bookmarks = JSON.parse(bookmarksString);
      if (href) {
        let filteredResult = bookmarks.filter((el: any) => el.href === href);
        filteredResult = filteredResult.sort((n1: Bookmark, n2: Bookmark) => {
          if (n1.locations.progression && n2.locations.progression) {
            return n1.locations.progression - n2.locations.progression;
          } else {
            return undefined;
          }
        });
        return filteredResult;
      }
      bookmarks = bookmarks.sort((n1: Bookmark, n2: Bookmark) => {
        if (n1.locations.progression && n2.locations.progression) {
          return n1.locations.progression - n2.locations.progression;
        } else {
          return undefined;
        }
      });
      return bookmarks;
    }
    return [];
  }

  public initAnnotations(list: any): any {
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
      let rangeColor: any;
      if (rangeRepresentation.highlight.color) {
        rangeColor = rangeRepresentation.highlight.color;
      } else if (rangeRepresentation.color) {
        rangeColor = rangeRepresentation.color;
      }
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

    this.store.set(
      LocalAnnotator.ANNOTATIONS,
      JSON.stringify(annotationsToStore)
    );
    return annotationsToStore;
  }

  public saveTemporarySelectionInfo(selectionInfo: any) {
    this.store.set(LocalAnnotator.SELECTIONINFO, JSON.stringify(selectionInfo));
  }
  public getTemporarySelectionInfo(doc: any): any {
    const selectionInfos = this.store.get(LocalAnnotator.SELECTIONINFO);
    if (selectionInfos) {
      let selectionInfo = JSON.parse(selectionInfos);
      selectionInfo!.range = convertRangeInfo(doc!, selectionInfo!.rangeInfo);
      return selectionInfo;
    }
    return [];
  }
  public deleteTemporarySelectionInfo() {
    this.store.remove(LocalAnnotator.SELECTIONINFO);
  }

  public saveAnnotation(annotation: any): any {
    let savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations);
      annotations.push(annotation);
      this.store.set(LocalAnnotator.ANNOTATIONS, JSON.stringify(annotations));
    } else {
      let annotations: any[] = [];
      annotations.push(annotation);
      this.store.set(LocalAnnotator.ANNOTATIONS, JSON.stringify(annotations));
    }
    return annotation;
  }

  public deleteAnnotation(id: any): any {
    let savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations) as Array<any>;
      annotations = annotations.filter((el: any) => el.id !== id);
      this.store.set(LocalAnnotator.ANNOTATIONS, JSON.stringify(annotations));
    }
    return id;
  }

  public deleteSelectedAnnotation(annotation: any): any {
    let savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations) as Array<any>;
      annotations = annotations.filter(
        (el: Annotation) => el.highlight?.id !== annotation.highlight.id
      );
      this.store.set(LocalAnnotator.ANNOTATIONS, JSON.stringify(annotations));
    }
    return annotation;
  }

  public getAnnotations(): any {
    const savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations);
      annotations = annotations.sort((n1: Annotation, n2: Annotation) => {
        if (n1.locations.progression && n2.locations.progression) {
          return n1.locations.progression - n2.locations.progression;
        } else {
          return undefined;
        }
      });
      return annotations;
    }
    return [];
  }

  public getAnnotationsByChapter(chapter: string): any {
    const savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      let annotations = JSON.parse(savedAnnotations);
      annotations = annotations.filter(
        (annotation) => annotation.href === chapter
      );
      annotations = annotations.sort((n1: Annotation, n2: Annotation) => {
        if (n1.locations.progression && n2.locations.progression) {
          return n1.locations.progression - n2.locations.progression;
        } else {
          return undefined;
        }
      });
      return annotations;
    }
    return [];
  }

  public getAnnotationPosition(id: any, iframeWin): any {
    const savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter(
        (el: Annotation) => el.highlight?.id === id || el.id === id
      );
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
              if (top < position || position === 0) {
                position = top;
              }
            }
          } else {
            position = parseInt(
              (foundElement as HTMLDivElement).style.top.replace("px", "")
            );
          }
          return position;
        }
      }
    }
    return null;
  }

  public getAnnotationElement(id: any, iframeWin): any {
    const savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter(
        (el: Annotation) => el.highlight?.id === id
      );
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
              if (top < position || position === 0) {
                position = top;
                return childNode;
              }
            }
          } else {
            position = parseInt(
              (foundElement as HTMLDivElement).style.top.replace("px", "")
            );
          }
          return foundElement;
        }
      }
    }
    return null;
  }
  public getAnnotation(highlight: IHighlight): any {
    const savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter(
        (el: Annotation) => el.highlight?.id === highlight.id
      );
      if (filtered.length > 0) {
        return filtered[0];
      }
    }
    return null;
  }
  public getAnnotationByID(id: string): any {
    const savedAnnotations = this.store.get(LocalAnnotator.ANNOTATIONS);
    if (savedAnnotations) {
      const annotations = JSON.parse(savedAnnotations);
      const filtered = annotations.filter(
        (el: Annotation) => el.highlight?.id === id
      );
      if (filtered.length > 0) {
        return filtered[0];
      }
    }
    return null;
  }
}
