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

import * as HTMLUtilities from "../utils/HTMLUtilities";
import Annotator, { AnnotationType } from "../store/Annotator";
import IFrameNavigator, { ReaderRights } from "../navigator/IFrameNavigator";
import { Publication } from "../model/Publication";
import ReaderModule from "./ReaderModule";
import { addEventListenerOptional } from "../utils/EventHandler";
import { icons as IconLib } from "../utils/IconLib";
import {
  Annotation,
  AnnotationMarker,
  Bookmark,
  Locator,
} from "../model/Locator";
import { IS_DEV } from "../utils";
import { toast } from "materialize-css";
import { v4 as uuid } from "uuid";
import { Link } from "../model/Link";
import { getCurrentSelectionInfo } from "./highlight/renderer/iframe/selection";
import { uniqueCssSelector } from "./highlight/renderer/common/cssselector2";
import {
  HighlightType,
  IHighlight,
  SelectionMenuItem,
} from "./highlight/common/highlight";
import { getClientRectsNoOverlap } from "./highlight/common/rect-utils";
import { _highlights } from "./highlight/TextHighlighter";

export interface BookmarkModuleAPI {
  addBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
  deleteBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
  getBookmarks: Array<any>;
}

export interface BookmarkModuleProperties {
  hideLayer?: boolean;
}

export interface BookmarkModuleConfig extends BookmarkModuleProperties {
  annotator: Annotator;
  headerMenu: HTMLElement;
  rights: ReaderRights;
  publication: Publication;
  delegate: IFrameNavigator;
  initialAnnotations?: any;
  api: BookmarkModuleAPI;
}

export default class BookmarkModule implements ReaderModule {
  private readonly annotator: Annotator | null;
  private rights: ReaderRights;
  private publication: Publication;
  private bookmarksView: HTMLDivElement;
  private sideNavSectionBookmarks: HTMLElement;
  private readonly headerMenu: HTMLElement;
  private readonly initialAnnotations: any;
  private delegate: IFrameNavigator;
  // @ts-ignore
  private readonly properties: BookmarkModuleProperties;
  private readonly api: BookmarkModuleAPI;

  public static async create(config: BookmarkModuleConfig): Promise<any> {
    const module = new this(
      config.annotator,
      config.headerMenu,
      config.rights || { enableBookmarks: false },
      config.publication,
      config.delegate,
      config.initialAnnotations || null,
      config as BookmarkModuleProperties,
      config.api
    );
    await module.start();
    return new Promise((resolve) => resolve(module));
  }

  public constructor(
    annotator: Annotator,
    headerMenu: HTMLElement,
    rights: ReaderRights,
    publication: Publication,
    delegate: IFrameNavigator,
    initialAnnotations: any | null = null,
    properties: BookmarkModuleProperties | null = null,
    api: BookmarkModuleAPI | null = null
  ) {
    this.annotator = annotator;
    this.rights = rights;
    this.publication = publication;
    this.headerMenu = headerMenu;
    this.delegate = delegate;
    this.initialAnnotations = initialAnnotations;
    this.properties = properties;
    this.api = api;
  }

  async stop() {
    if (IS_DEV) {
      console.log("Bookmark module stop");
    }
  }

  protected async start(): Promise<void> {
    this.delegate.bookmarkModule = this;

    if (this.headerMenu)
      this.bookmarksView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-bookmarks"
      ) as HTMLDivElement;

    if (this.headerMenu)
      this.sideNavSectionBookmarks = HTMLUtilities.findElement(
        this.headerMenu,
        "#sidenav-section-bookmarks"
      ) as HTMLElement;

    if (this.headerMenu) {
      var menuBookmark = HTMLUtilities.findElement(
        this.headerMenu,
        "#menu-button-bookmark"
      ) as HTMLLinkElement;
      if (this.rights?.enableMaterial) {
        if (menuBookmark)
          menuBookmark.parentElement.style.removeProperty("display");
        if (menuBookmark)
          addEventListenerOptional(
            menuBookmark,
            "click",
            this.saveBookmark.bind(this)
          );
      } else {
        if (menuBookmark)
          menuBookmark.parentElement.style.setProperty("display", "none");
        if (this.sideNavSectionBookmarks)
          this.sideNavSectionBookmarks.style.setProperty("display", "none");
      }
    }

    if (this.initialAnnotations) {
      var bookmarks = this.initialAnnotations["bookmarks"] || null;
      if (bookmarks) {
        this.annotator.initBookmarks(bookmarks);
      }
    }

    await this.showBookmarks();
    await this.drawBookmarks();
    setTimeout(() => {
      this.properties.hideLayer
        ? this.delegate.hideLayer("highlights")
        : this.delegate.showLayer("highlights");
    }, 10);
  }

  async handleResize() {
    setTimeout(async () => {
      await this.drawBookmarks();
      await this.showBookmarks();
    }, 100);
  }

  initialize() {
    return new Promise(async (resolve) => {
      await (document as any).fonts.ready;
      if (this.rights?.enableBookmarks) {
        setTimeout(() => {
          this.drawBookmarks();
          this.showBookmarks();
        }, 300);
      }
      resolve(null);
    });
  }
  async deleteBookmark(bookmark: Bookmark): Promise<any> {
    if (this.annotator) {
      if (this.api?.deleteBookmark) {
        await this.api?.deleteBookmark(bookmark);
        let deleted = await this.annotator.deleteBookmark(bookmark);

        if (IS_DEV) {
          console.log("Bookmark deleted " + JSON.stringify(deleted));
        }
        await this.showBookmarks();
        await this.drawBookmarks();
        if (this.delegate.rights?.enableMaterial) {
          toast({ html: "bookmark deleted" });
        }
        return deleted;
      } else {
        let deleted = await this.annotator.deleteBookmark(bookmark);

        if (IS_DEV) {
          console.log("Bookmark deleted " + JSON.stringify(deleted));
        }
        await this.showBookmarks();
        await this.drawBookmarks();
        if (this.delegate.rights?.enableMaterial) {
          toast({ html: "bookmark deleted" });
        }
        return deleted;
      }
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  saveBookmarkPlus() {
    this.addBookmarkPlus();
  }

  async saveBookmark(): Promise<any> {
    if (this.annotator) {
      var tocItem = this.publication.getTOCItem(
        this.delegate.currentChapterLink.href
      );
      if (this.delegate.currentTocUrl !== null) {
        tocItem = this.publication.getTOCItem(this.delegate.currentTocUrl);
      }

      if (tocItem === null) {
        tocItem = this.publication.getTOCItemAbsolute(
          this.delegate.currentChapterLink.href
        );
      }
      let href = tocItem.Href;
      if (href.indexOf("#") > 0) {
        href = href.slice(0, href.indexOf("#"));
      }
      const progression = this.delegate.view.getCurrentPosition();
      const id: string = uuid();
      let bookmark: Bookmark;
      if (
        ((this.rights?.autoGeneratePositions ?? true) &&
          this.publication.positions) ||
        this.publication.positions
      ) {
        const positions = this.publication.positionsByHref(
          this.publication.getRelativeHref(
            this.delegate.currentChapterLink.href
          )
        );

        const positionIndex = Math.ceil(progression * (positions.length - 1));
        const locator = positions[positionIndex];

        bookmark = {
          ...locator,
          id: id,
          href: href,
          created: new Date(),
          title: this.delegate.currentChapterLink.title,
        };
      } else {
        bookmark = {
          id: id,
          href: href,
          locations: {
            progression: progression,
          },
          created: new Date(),
          type: this.delegate.currentChapterLink.type,
          title: this.delegate.currentChapterLink.title,
        };
      }

      if (
        !(await this.annotator.locatorExists(bookmark, AnnotationType.Bookmark))
      ) {
        if (this.api?.addBookmark) {
          const result = await this.api.addBookmark(bookmark);
          if (result) {
            bookmark = result;
          }
          if (IS_DEV) console.log(bookmark);
          let saved = await this.annotator.saveBookmark(bookmark);

          if (IS_DEV) {
            console.log("Bookmark added " + JSON.stringify(saved));
          }
          if (this.delegate.rights?.enableMaterial) {
            toast({ html: "bookmark added" });
          }
          await this.showBookmarks();
          await this.drawBookmarks();
          return saved;
        } else {
          let saved = await this.annotator.saveBookmark(bookmark);

          if (IS_DEV) {
            console.log("Bookmark added " + JSON.stringify(saved));
          }
          if (this.delegate.rights?.enableMaterial) {
            toast({ html: "bookmark added" });
          }
          await this.showBookmarks();
          await this.drawBookmarks();
          return saved;
        }
      } else {
        if (this.delegate.rights?.enableMaterial) {
          toast({ html: "bookmark exists" });
        }
      }
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  private addBookmarkPlus() {
    let self = this;

    let node = this.delegate.highlighter.visibleTextRects[0];
    const range = this.delegate.highlighter
      .dom(this.delegate.iframes[0].contentDocument.body)
      .getWindow()
      .document.createRange();

    const selection = this.delegate.highlighter
      .dom(this.delegate.iframes[0].contentDocument.body)
      .getSelection();
    selection.removeAllRanges();
    range.selectNodeContents(node.node);
    selection.addRange(range);

    const clientRects = getClientRectsNoOverlap(range, false);

    function isOutsideViewport(rect): boolean {
      const windowLeft = window.scrollX;
      const windowRight = windowLeft + window.innerWidth;
      const right = rect.left + rect.width;
      const bottom = rect.top + rect.height;
      const windowTop = window.scrollY;
      const windowBottom = windowTop + window.innerHeight;

      const isAbove = bottom < windowTop;
      const isBelow = rect.top > windowBottom;

      const isLeft = right < windowLeft;
      const isRight = rect.left > windowRight;

      return isAbove || isBelow || isLeft || isRight;
    }

    let index = 0;
    for (const rect of clientRects) {
      if (!isOutsideViewport(rect)) {
        const endNode = selection.focusNode;
        const endOffset = selection.focusOffset;

        selection.collapse(selection.anchorNode, selection.anchorOffset);

        for (let i = 0; i < index; i++) {
          selection.modify("move", "forward", "line");
        }
        selection.extend(endNode, endOffset);
        const endNode2 = selection.focusNode;

        const focusNodeLength = selection.focusNode.length;
        selection.collapse(selection.anchorNode, selection.anchorOffset);

        let endOffset2 = focusNodeLength;
        if (selection.anchorOffset > focusNodeLength) {
          endOffset2 = focusNodeLength;
        } else {
          endOffset2 = selection.anchorOffset + 1;
        }

        selection.modify("move", "forward", "character");
        selection.modify("move", "backward", "word");
        selection.extend(endNode2, endOffset2);
        selection.modify("extend", "backward", "character");
        selection.modify("extend", "forward", "word");

        break;
      }
      index++;
    }

    function getCssSelector(element: Element): string {
      const options = {};
      return uniqueCssSelector(
        element,
        self.delegate.highlighter
          .dom(self.delegate.iframes[0].contentDocument.body)
          .getDocument(),
        options
      );
    }

    const selectionInfo = getCurrentSelectionInfo(
      this.delegate.iframes[0].contentWindow,
      getCssSelector
    );

    let menuItem: SelectionMenuItem = {
      id: `bookmarkIcon`,
      marker: AnnotationMarker.Bookmark,
      icon: {
        id: `bookmarkIcon`,
        title: `Bookmark`,
        svgPath: `<path d="M0 0h24v24H0V0z" fill="none"/><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>`,
        color: `#000000`,
        position: "left",
      },
      popup: {
        background: `#000000`,
        textColor: `#ffffff`,
      },
      highlight: {
        color: `#000000`,
        style: {
          default: [
            {
              property: `border-bottom`,
              value: `0px dashed #000000`,
              priority: `important`,
            },
          ],
        },
      },
    };
    let book = this.delegate.highlighter.createHighlight(
      this.delegate.highlighter
        .dom(self.delegate.iframes[0].contentDocument.body)
        .getWindow(),
      selectionInfo,
      menuItem.highlight.color,
      true,
      AnnotationMarker.Bookmark,
      menuItem.icon,
      menuItem.popup,
      menuItem.highlight.style
    );
    this.saveAnnotation(book[0]).then((anno) => {
      if (IS_DEV) {
        console.log("saved bookmark " + anno.id);
      }
    });
    this.delegate.iframes[0].contentDocument.getSelection().removeAllRanges();
  }

  public async saveAnnotation(highlight: IHighlight): Promise<Annotation> {
    if (this.annotator) {
      var tocItem = this.publication.getTOCItem(
        this.delegate.currentChapterLink.href
      );
      if (this.delegate.currentTocUrl !== null) {
        tocItem = this.publication.getTOCItem(this.delegate.currentTocUrl);
      }

      if (tocItem === null) {
        tocItem = this.publication.getTOCItemAbsolute(
          this.delegate.currentChapterLink.href
        );
      }

      const bookmarkPosition = this.delegate.view.getCurrentPosition();

      const body = HTMLUtilities.findRequiredIframeElement(
        this.delegate.iframes[0].contentDocument,
        "body"
      ) as HTMLBodyElement;
      const progression = highlight.position
        ? highlight.position / body.scrollHeight
        : bookmarkPosition;
      const id: string = uuid();
      let annotation: Annotation;

      let href = tocItem.Href;
      if (href.indexOf("#") > 0) {
        href = href.slice(0, href.indexOf("#"));
      }

      if (
        ((this.rights?.autoGeneratePositions ?? true) &&
          this.publication.positions) ||
        this.publication.positions
      ) {
        const positions = this.publication.positionsByHref(
          this.publication.getRelativeHref(
            this.delegate.currentChapterLink.href
          )
        );
        const positionIndex = Math.ceil(progression * (positions.length - 1));
        const locator = positions[positionIndex];

        annotation = {
          ...locator,
          id: id,
          href: href,
          created: new Date(),
          title: this.delegate.currentChapterLink.title,
          highlight: highlight,
          text: {
            highlight: highlight.selectionInfo.cleanText,
          },
        };
      } else {
        annotation = {
          id: id,
          href: href,
          locations: {
            progression: progression,
          },
          created: new Date(),
          type: this.delegate.currentChapterLink.type,
          title: this.delegate.currentChapterLink.title,
          highlight: highlight,
          text: {
            highlight: highlight.selectionInfo.cleanText,
          },
        };
      }

      if (this.api?.addBookmark) {
        let result = await this.api.addBookmark(annotation);
        const saved = await this.annotator.saveAnnotation(result);
        await this.showBookmarks();
        await this.drawBookmarks();
        return new Promise<Annotation>((resolve) => resolve(saved));
      } else {
        const saved = await this.annotator.saveAnnotation(annotation);
        await this.showBookmarks();
        await this.drawBookmarks();
        return new Promise<Annotation>((resolve) => resolve(saved));
      }
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  async getBookmarks(): Promise<any> {
    let bookmarks: Array<any> = [];
    if (this.annotator) {
      bookmarks = (await this.annotator.getBookmarks()) as Array<any>;
    }
    return bookmarks;
  }

  public async showBookmarks(): Promise<void> {
    let bookmarks: Array<any> = [];
    if (this.annotator) {
      bookmarks = (await this.annotator.getBookmarks()) as Array<any>;
    }

    let highlights: Array<any> = [];
    if (this.annotator) {
      highlights = (await this.annotator.getAnnotations()) as Array<any>;
      if (highlights) {
        highlights = highlights.filter(
          (rangeRepresentation) =>
            rangeRepresentation.highlight.marker === AnnotationMarker.Bookmark
        );
        if (bookmarks) {
          bookmarks.push.apply(bookmarks, highlights);
        } else {
          bookmarks = highlights;
        }
      }
    }

    if (this.bookmarksView)
      this.createTree(AnnotationType.Bookmark, bookmarks, this.bookmarksView);
  }

  async drawBookmarks(): Promise<void> {
    if (this.rights?.enableBookmarks && this.delegate.highlighter) {
      if (this.api) {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.delegate.highlighter &&
          highlights &&
          this.delegate.iframes[0].contentDocument.readyState === "complete"
        ) {
          await this.delegate.highlighter.destroyHighlights(
            HighlightType.Annotation
          );

          for (const rangeRepresentation of highlights) {
            _highlights.push(rangeRepresentation.highlight);

            const annotation: Annotation = rangeRepresentation;

            let currentLocation = this.delegate.currentChapterLink.href;

            var tocItem = this.publication.getTOCItem(currentLocation);
            if (this.delegate.currentTocUrl !== null) {
              tocItem = this.publication.getTOCItem(
                this.delegate.currentTocUrl
              );
            }

            if (tocItem === null) {
              tocItem = this.publication.getTOCItemAbsolute(
                this.delegate.currentChapterLink.href
              );
            }

            let href = tocItem.Href;
            if (href.indexOf("#") > 0) {
              href = href.slice(0, href.indexOf("#"));
            }

            if (annotation.href === href) {
              await this.delegate.highlighter.createHighlightDom(
                this.delegate.iframes[0].contentWindow as any,
                rangeRepresentation.highlight
              );
            }
          }
        }
      } else {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.delegate.highlighter &&
          highlights &&
          this.delegate.iframes[0].contentDocument.readyState === "complete"
        ) {
          await this.delegate.highlighter.destroyHighlights(
            HighlightType.Annotation
          );

          for (const rangeRepresentation of highlights) {
            _highlights.push(rangeRepresentation.highlight);

            const annotation: Annotation = rangeRepresentation;

            let currentLocation = this.delegate.currentChapterLink.href;

            var tocItem = this.publication.getTOCItem(currentLocation);
            if (this.delegate.currentTocUrl !== null) {
              tocItem = this.publication.getTOCItem(
                this.delegate.currentTocUrl
              );
            }

            if (tocItem === null) {
              tocItem = this.publication.getTOCItemAbsolute(
                this.delegate.currentChapterLink.href
              );
            }

            let href = tocItem.Href;
            if (href.indexOf("#") > 0) {
              href = href.slice(0, href.indexOf("#"));
            }

            if (annotation.href === href) {
              await this.delegate.highlighter.createHighlightDom(
                this.delegate.iframes[0].contentWindow as any,
                rangeRepresentation.highlight
              );
            }
          }
        }
      }
    }
  }

  public async deleteSelectedHighlight(highlight: Annotation): Promise<any> {
    if (this.api?.deleteBookmark) {
      this.api.deleteBookmark(highlight).then(async () => {
        this.deleteLocalHighlight(highlight.id);
      });
    } else {
      this.deleteLocalHighlight(highlight.id);
    }
  }

  async deleteLocalHighlight(id: any): Promise<any> {
    if (this.annotator) {
      var deleted = await this.annotator.deleteAnnotation(id);

      if (IS_DEV) {
        console.log("Highlight deleted " + JSON.stringify(deleted));
      }
      await this.showBookmarks();
      await this.drawBookmarks();
      if (this.delegate.rights?.enableMaterial) {
        toast({ html: "highlight deleted" });
      }
      return deleted;
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  private createTree(
    type: AnnotationType,
    annotations: Array<any>,
    view: HTMLDivElement
  ) {
    if (annotations) {
      const self = this;
      const toc = this.publication.readingOrder;
      if (toc.length) {
        const createAnnotationTree = (
          parentElement: Element,
          links: Array<Link>
        ) => {
          let chapterList: HTMLUListElement = document.createElement("ul");
          chapterList.className = "sidenav-annotations";
          for (const link of links) {
            let chapterHeader: HTMLLIElement = document.createElement("li");
            const linkElement: HTMLAnchorElement = document.createElement("a");
            const spanElement: HTMLSpanElement = document.createElement("span");
            linkElement.tabIndex = -1;
            linkElement.className = "chapter-link";
            if (link.Href) {
              const linkHref = this.publication.getAbsoluteHref(link.Href);
              const tocItemAbs = this.publication.getTOCItemAbsolute(linkHref);
              linkElement.href = linkHref;
              linkElement.innerHTML = tocItemAbs.Title || "";
              chapterHeader.appendChild(linkElement);
            } else {
              spanElement.innerHTML = link.Title || "";
              spanElement.className = "chapter-title";
              chapterHeader.appendChild(spanElement);
            }

            addEventListenerOptional(
              linkElement,
              "click",
              (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();

                const position: Locator = {
                  href: linkElement.href,
                  locations: {
                    progression: 0,
                  },
                  type: link.TypeLink,
                  title: linkElement.title,
                };

                this.delegate.stopReadAloud();
                this.delegate.navigate(position);
              }
            );

            const bookmarkList: HTMLUListElement = document.createElement("ol");
            annotations.forEach(function (locator: any) {
              const href =
                link.Href.indexOf("#") !== -1
                  ? link.Href.slice(0, link.Href.indexOf("#"))
                  : link.Href;

              if (link.Href && locator.href.endsWith(href)) {
                let bookmarkItem: HTMLLIElement = document.createElement("li");
                bookmarkItem.className = "annotation-item";
                let bookmarkLink: HTMLAnchorElement =
                  document.createElement("a");
                bookmarkLink.setAttribute("href", locator.href);

                if (type === AnnotationType.Bookmark) {
                  bookmarkLink.className = "bookmark-link";

                  let title: HTMLSpanElement = document.createElement("span");
                  let formattedProgression =
                    Math.round(locator.locations.progression!! * 100) +
                    "% " +
                    "through resource";
                  title.className = "title";
                  title.innerHTML = formattedProgression;
                  bookmarkLink.appendChild(title);
                }

                let timestamp: HTMLSpanElement = document.createElement("span");
                timestamp.className = "timestamp";
                timestamp.innerHTML = BookmarkModule.readableTimestamp(
                  locator.created
                );
                bookmarkLink.appendChild(timestamp);

                addEventListenerOptional(
                  bookmarkLink,
                  "click",
                  (event: MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    self.handleAnnotationLinkClick(event, locator);
                  }
                );

                bookmarkItem.appendChild(bookmarkLink);
                if (
                  (self.delegate.sideNavExpanded &&
                    self.delegate.rights?.enableMaterial) ||
                  !self.delegate.rights?.enableMaterial
                ) {
                  let bookmarkDeleteLink: HTMLElement =
                    document.createElement("button");
                  bookmarkDeleteLink.className = "delete";
                  bookmarkDeleteLink.innerHTML = IconLib.delete;

                  addEventListenerOptional(
                    bookmarkDeleteLink,
                    "click",
                    (event: MouseEvent) => {
                      event.preventDefault();
                      event.stopPropagation();
                      self.handleAnnotationLinkDeleteClick(
                        type,
                        event,
                        locator
                      );
                    }
                  );
                  bookmarkItem.appendChild(bookmarkDeleteLink);
                }
                bookmarkList.appendChild(bookmarkItem);
              }
            });

            if (bookmarkList.children.length > 0) {
              chapterList.appendChild(chapterHeader);
              chapterList.appendChild(bookmarkList);
            }
            if (chapterList.children.length > 0) {
              parentElement.appendChild(chapterList);
            }
            if (link.Children && link.Children.length > 0) {
              createAnnotationTree(parentElement, link.Children);
            }
          }
        };
        view.innerHTML = "";
        createAnnotationTree(view, toc);
      }
    }
  }

  private handleAnnotationLinkClick(
    event: MouseEvent,
    locator: Bookmark
  ): void {
    if (locator) {
      locator.href = this.publication.getAbsoluteHref(locator.href);
      this.delegate.stopReadAloud();
      this.delegate.navigate(locator);
    } else {
      if (IS_DEV) {
        console.log("bookmark data missing: ", event);
      }
    }
  }

  private handleAnnotationLinkDeleteClick(
    type: AnnotationType,
    event: MouseEvent,
    locator: any
  ): void {
    if (IS_DEV) {
      console.log("bookmark data locator: ", locator);
    }
    if (locator) {
      if (type === AnnotationType.Bookmark) {
        this.deleteBookmark(locator);
      }
    } else {
      if (IS_DEV) {
        console.log("bookmark data missing: ", event);
      }
    }
  }

  private static readableTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    return date.toDateString() + " " + date.toLocaleTimeString();
  }
  public async getAnnotation(highlight: IHighlight): Promise<any> {
    return this.annotator.getAnnotation(highlight);
  }
  public async getAnnotationByID(id: string): Promise<any> {
    return this.annotator.getAnnotationByID(id);
  }
}
