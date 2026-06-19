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

import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import Annotator, { AnnotationType } from "../../store/Annotator";
import { InitialAnnotations } from "../../navigator/ReaderConfig";
import { EpubModuleHost } from "../ModuleHost";
import { ReaderModule, HostType, RightsKey } from "../ReaderModule";
import { IBookmarkModule } from "../interfaces";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { icons as IconLib } from "../../utils/IconLib";
import {
  Annotation,
  AnnotationMarker,
  Bookmark,
  Locator,
  Link,
  Publication,
} from "../../model/v3";
import { v4 as uuid } from "uuid";
import { getCurrentSelectionInfo } from "../highlight/renderer/iframe/selection";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import {
  HighlightType,
  IHighlight,
  SelectionMenuItem,
} from "../highlight/common/highlight";
import { getClientRectsNoOverlap } from "../highlight/common/rect-utils";
import { _highlights } from "../highlight/TextHighlighter";
import log from "loglevel";
import { Action } from "./ConsumptionModule";
import { ReaderEvent } from "../../utils/Events";

export interface BookmarkModuleAPI {
  addBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
  deleteBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
}

export interface BookmarkModuleProperties {
  hideLayer?: boolean;
}

export interface BookmarkModuleConfig extends BookmarkModuleProperties {
  annotator: Annotator;
  headerMenu?: HTMLElement | null;
  publication: Publication;
  initialAnnotations?: InitialAnnotations;
  properties?: BookmarkModuleProperties;
  api?: BookmarkModuleAPI;
}

export class BookmarkModule
  implements ReaderModule<EpubModuleHost>, IBookmarkModule<EpubModuleHost>
{
  readonly name = NavigatorFeature.Bookmarks;
  readonly hostType = HostType.Epub;
  readonly rightsKey = RightsKey.Bookmarks;
  private readonly annotator: Annotator | null;
  private publication: Publication;
  private bookmarksView: HTMLDivElement;
  private sideNavSectionBookmarks: HTMLElement;
  private readonly headerMenu?: HTMLElement | null;
  private readonly initialAnnotations?: InitialAnnotations;
  private host!: EpubModuleHost;
  attach(host: EpubModuleHost): void {
    this.host = host;
  }
  private readonly properties: BookmarkModuleProperties;
  private readonly api?: BookmarkModuleAPI;

  public static async create(config: BookmarkModuleConfig): Promise<any> {
    const module = new this(
      config.annotator,
      config.publication,
      config as BookmarkModuleProperties,
      config.initialAnnotations,
      config.api,
      config.headerMenu
    );
    await module.start();
    return new Promise((resolve) => resolve(module));
  }

  public constructor(
    annotator: Annotator,
    publication: Publication,
    properties: BookmarkModuleProperties,
    initialAnnotations?: any,
    api?: BookmarkModuleAPI,
    headerMenu?: HTMLElement | null
  ) {
    this.annotator = annotator;
    this.publication = publication;
    this.headerMenu = headerMenu;
    this.initialAnnotations = initialAnnotations;
    this.properties = properties;
    this.api = api;
  }

  stop() {
    log.log("Bookmark module stop");
  }

  protected async start(): Promise<void> {
    if (this.headerMenu)
      this.bookmarksView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-bookmarks"
      );

    if (this.headerMenu)
      this.sideNavSectionBookmarks = HTMLUtilities.findElement(
        this.headerMenu,
        "#sidenav-section-bookmarks"
      );

    if (this.headerMenu) {
      const menuBookmark = HTMLUtilities.findElement(
        this.headerMenu,
        "#menu-button-bookmark"
      );
      if (menuBookmark)
        menuBookmark.parentElement?.style.removeProperty("display");
      if (menuBookmark)
        addEventListenerOptional(
          menuBookmark,
          "click",
          this.saveBookmark.bind(this)
        );
    }

    // Treat initialAnnotations as source of truth — overwrite local
    // storage even when empty so a prior user's bookmarks on a shared
    // browser don't leak through.
    if (this.initialAnnotations) {
      this.annotator?.initBookmarks(this.initialAnnotations.bookmarks ?? []);
    }
  }

  async handleResize() {
    setTimeout(async () => {
      await this.drawBookmarks();
      await this.showBookmarks();
      setTimeout(() => {
        this.properties.hideLayer
          ? this.host.hideLayer("highlights")
          : this.host.showLayer("highlights");
      }, 10);
    }, 100);
  }

  initialize() {
    return new Promise(async (resolve) => {
      await (document as any).fonts.ready;
      if (this.host.rights.enableBookmarks) {
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

        log.log("Bookmark deleted " + JSON.stringify(deleted));
        this.host.emit(ReaderEvent.BookmarkDeleted, bookmark);
        await this.showBookmarks();
        await this.drawBookmarks();
        return deleted;
      } else {
        let deleted = await this.annotator.deleteBookmark(bookmark);

        log.log("Bookmark deleted " + JSON.stringify(deleted));
        this.host.emit(ReaderEvent.BookmarkDeleted, bookmark);
        await this.showBookmarks();
        await this.drawBookmarks();
        return deleted;
      }
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  async saveBookmarkPlus(): Promise<any> {
    await this.addBookmarkPlus();
  }

  async saveBookmark(): Promise<any> {
    if (this.annotator) {
      const href = this.getCurrentChapterHref();
      if (href) {
        const progression = this.host.view?.getCurrentPosition();
        const id: string = uuid();
        const positionLocator = this.getCurrentPositionLocator(progression);
        let bookmark: Bookmark;
        if (positionLocator) {
          bookmark = {
            ...positionLocator,
            id: id,
            href: href,
            created: new Date(),
            title: this.host.currentChapterLink.title,
          };
        } else {
          bookmark = {
            id: id,
            href: href,
            locations: {
              progression: progression,
            },
            created: new Date(),
            type: this.host.currentChapterLink.type,
            title: this.host.currentChapterLink.title,
          };
        }
        if (!this.annotator.locatorExists(bookmark, AnnotationType.Bookmark)) {
          this.host
            .getModule(NavigatorFeature.Consumption)
            ?.trackAction(bookmark, Action.BookmarkCreated);
          if (this.api?.addBookmark) {
            const result = await this.api.addBookmark(bookmark);
            if (result) {
              bookmark = result;
            }
            log.log(bookmark);
            let saved = this.annotator.saveBookmark(bookmark);

            log.log("Bookmark added " + JSON.stringify(saved));
            this.host.emit(ReaderEvent.BookmarkCreated, bookmark);
            this.showBookmarks();
            await this.drawBookmarks();
            return saved;
          } else {
            let saved = this.annotator.saveBookmark(bookmark);

            log.log("Bookmark added " + JSON.stringify(saved));
            this.host.emit(ReaderEvent.BookmarkCreated, bookmark);
            this.showBookmarks();
            await this.drawBookmarks();
            return saved;
          }
        }
      }
    }
  }

  private async addBookmarkPlus(): Promise<any> {
    let self = this;

    let node = this.host.highlighter?.visibleTextRects[0];
    let doc = this.host.iframes[0].contentDocument;
    if (doc) {
      const range = this.host.highlighter
        ?.dom(doc.body)
        .getWindow()
        .document.createRange();

      const selection = this.host.highlighter
        ?.dom(this.host.iframes[0].contentDocument?.body)
        .getSelection();
      selection.removeAllRanges();
      if (node) {
        range.selectNodeContents(node.node);
      }
      selection.addRange(range);

      const clientRects = getClientRectsNoOverlap(range, false);

      let index = 0;
      for (const rect of clientRects) {
        if (!this.host.highlighter?.isOutsideViewport(rect)) {
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
    }
    function getCssSelector(element: Element): string | undefined {
      const options = {};
      let doc = self.host.iframes[0].contentDocument;
      if (doc) {
        return uniqueCssSelector(
          element,
          self.host.highlighter?.dom(doc.body).getDocument(),
          options
        );
      } else {
        return undefined;
      }
    }

    let win = this.host.iframes[0].contentWindow;
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
    if (win !== null) {
      let selectionInfo = getCurrentSelectionInfo(win, getCssSelector);
      if (selectionInfo === undefined) {
        let doc = self.host.iframes[0].contentDocument;
        const annotations = this.host.getModule(
          NavigatorFeature.Annotations
        ) as import("./AnnotationModule").AnnotationModule | undefined;
        selectionInfo =
          annotations?.annotator?.getTemporarySelectionInfo(doc) ?? undefined;
      }
      let doc = self.host.iframes[0].contentDocument;
      if (selectionInfo && doc) {
        let book = this.host.highlighter?.createHighlight(
          this.host.highlighter?.dom(doc.body).getWindow(),
          selectionInfo,
          menuItem.highlight?.color,
          true,
          AnnotationMarker.Bookmark,
          menuItem.icon,
          menuItem.popup,
          menuItem.highlight?.style
        );
        this.host.iframes[0].contentDocument?.getSelection()?.removeAllRanges();
        if (book) {
          return this.saveAnnotation(book[0]).then((anno) => {
            log.log("saved bookmark " + anno?.id);
          });
        }
      }
    }
  }

  public async saveAnnotation(
    highlight: IHighlight
  ): Promise<Annotation | undefined> {
    if (this.annotator) {
      var tocItem = this.publication.getTOCItem(
        this.host.currentChapterLink.href
      );
      if (this.host.currentTocUrl) {
        tocItem = this.publication.getTOCItem(this.host.currentTocUrl);
      }

      if (tocItem === null) {
        tocItem = this.publication.getTOCItemAbsolute(
          this.host.currentChapterLink.href
        );
      }

      const bookmarkPosition = this.host.view?.getCurrentPosition();

      let doc = this.host.iframes[0].contentDocument;
      if (doc) {
        const body = HTMLUtilities.findRequiredIframeElement(
          doc,
          "body"
        ) as HTMLBodyElement;

        const progression = highlight.position
          ? highlight.position / body.scrollHeight
          : bookmarkPosition;

        const id: string = uuid();
        let annotation: Annotation | undefined;

        if (tocItem) {
          let href = tocItem.href;
          if (href.indexOf("#") > 0) {
            href = href.slice(0, href.indexOf("#"));
          }

          if (
            (this.host.rights.autoGeneratePositions &&
              this.publication.positions) ||
            this.publication.positions
          ) {
            const positions = this.publication.positionsByHref(
              this.publication.getRelativeHref(
                this.host.currentChapterLink.href
              )
            );
            const positionIndex = Math.ceil(
              (progression ?? 0) * (positions.length - 1)
            );
            const locator = positions[positionIndex];

            annotation = {
              ...locator,
              id: id,
              href: href,
              created: new Date(),
              title: this.host.currentChapterLink.title,
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
              type: this.host.currentChapterLink.type,
              title: this.host.currentChapterLink.title,
              highlight: highlight,
              text: {
                highlight: highlight.selectionInfo.cleanText,
              },
            };
          }
        }

        if (annotation) {
          this.host
            .getModule(NavigatorFeature.Consumption)
            ?.trackAction(annotation, Action.BookmarkCreated);
          if (this.api?.addBookmark) {
            let result = await this.api.addBookmark(annotation);
            const saved = await this.annotator.saveAnnotation(result);
            this.host.emit(ReaderEvent.BookmarkCreated, annotation);
            await this.showBookmarks();
            await this.drawBookmarks();
            return new Promise<Annotation>((resolve) => resolve(saved));
          } else {
            const saved = await this.annotator.saveAnnotation(annotation);
            this.host.emit(ReaderEvent.BookmarkCreated, annotation);
            await this.showBookmarks();
            await this.drawBookmarks();
            return new Promise<Annotation>((resolve) => resolve(saved));
          }
        }
      }
    }
    return new Promise<any>((resolve) => resolve(undefined));
  }

  getBookmarks(): any {
    let bookmarks: Array<any> = [];
    if (this.annotator) {
      bookmarks = this.annotator.getBookmarks() as Array<any>;
    }
    return bookmarks;
  }

  public showBookmarks() {
    let bookmarks: Array<any> = [];
    if (this.annotator) {
      bookmarks = this.annotator.getBookmarks() as Array<any>;
    }

    let highlights: Array<any> = [];
    if (this.annotator) {
      highlights = this.annotator.getAnnotations() as Array<any>;
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
    if (this.host.rights.enableBookmarks && this.host.highlighter) {
      if (this.api) {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.host.highlighter &&
          highlights &&
          this.host.iframes[0].contentDocument?.readyState === "complete"
        ) {
          await this.host.highlighter.destroyHighlights(
            HighlightType.Annotation
          );

          for (const rangeRepresentation of highlights) {
            _highlights.push(rangeRepresentation.highlight);

            const annotation: Annotation = rangeRepresentation;

            let currentLocation = this.host.currentChapterLink.href;

            var tocItem = this.publication.getTOCItem(currentLocation);
            if (this.host.currentTocUrl) {
              tocItem = this.publication.getTOCItem(this.host.currentTocUrl);
            }

            if (tocItem === undefined) {
              tocItem = this.publication.getTOCItemAbsolute(
                this.host.currentChapterLink.href
              );
            }

            if (tocItem) {
              let href = tocItem.href;
              if (href.indexOf("#") > 0) {
                href = href.slice(0, href.indexOf("#"));
              }

              if (annotation.href === href) {
                await this.host.highlighter.createHighlightDom(
                  this.host.iframes[0].contentWindow as any,
                  rangeRepresentation.highlight
                );
              }
            }
          }
        }
      } else {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.host.highlighter &&
          highlights &&
          this.host.iframes[0].contentDocument?.readyState === "complete"
        ) {
          await this.host.highlighter.destroyHighlights(
            HighlightType.Annotation
          );

          for (const rangeRepresentation of highlights) {
            _highlights.push(rangeRepresentation.highlight);

            const annotation: Annotation = rangeRepresentation;

            let currentLocation = this.host.currentChapterLink.href;

            let tocItem = this.publication.getTOCItem(currentLocation);
            if (this.host.currentTocUrl) {
              tocItem = this.publication.getTOCItem(this.host.currentTocUrl);
            }

            if (tocItem === undefined) {
              tocItem = this.publication.getTOCItemAbsolute(
                this.host.currentChapterLink.href
              );
            }
            if (tocItem) {
              let href = tocItem.href;
              if (href.indexOf("#") > 0) {
                href = href.slice(0, href.indexOf("#"));
              }

              if (annotation.href === href) {
                await this.host.highlighter.createHighlightDom(
                  this.host.iframes[0].contentWindow as any,
                  rangeRepresentation.highlight
                );
              }
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

      log.log("Highlight deleted " + JSON.stringify(deleted));
      await this.showBookmarks();
      await this.drawBookmarks();
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
            if (link.href) {
              const linkHref = this.publication.getAbsoluteHref(link.href);
              const tocItemAbs = this.publication.getTOCItemAbsolute(linkHref);
              linkElement.href = linkHref;
              linkElement.innerHTML = tocItemAbs?.title || "";
              chapterHeader.appendChild(linkElement);
            } else {
              spanElement.innerHTML = link.title || "";
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
                  type: link.type,
                  title: linkElement.title,
                };

                this.host.stopReadAloud();
                this.host.navigate(position);
              }
            );

            const bookmarkList: HTMLUListElement = document.createElement("ol");
            annotations.forEach(function (locator: any) {
              const href =
                link.href.indexOf("#") !== -1
                  ? link.href.slice(0, link.href.indexOf("#"))
                  : link.href;

              if (link.href && locator.href.endsWith(href)) {
                let bookmarkItem: HTMLLIElement = document.createElement("li");
                bookmarkItem.className = "annotation-item";
                let bookmarkLink: HTMLAnchorElement =
                  document.createElement("a");
                bookmarkLink.setAttribute("href", locator.href);

                if (type === AnnotationType.Bookmark) {
                  bookmarkLink.className = "bookmark-link";

                  let title: HTMLSpanElement = document.createElement("span");
                  let formattedProgression =
                    Math.round((locator.locations.progression ?? 0) * 100) +
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
                if (self.host.sideNavExpanded) {
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
            if (link.children?.items && link.children.items.length > 0) {
              createAnnotationTree(
                parentElement,
                link.children.items as Link[]
              );
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
      this.host.stopReadAloud();
      this.host.navigate(locator);
    } else {
      log.log("bookmark data missing: ", event);
    }
  }

  private handleAnnotationLinkDeleteClick(
    type: AnnotationType,
    event: MouseEvent,
    locator: any
  ): void {
    log.log("bookmark data locator: ", locator);
    if (locator) {
      if (type === AnnotationType.Bookmark) {
        this.deleteBookmark(locator);
      }
    } else {
      log.log("bookmark data missing: ", event);
    }
  }

  private static readableTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    return date.toDateString() + " " + date.toLocaleTimeString();
  }
  public async getAnnotation(highlight: IHighlight): Promise<any> {
    return this.annotator?.getAnnotation(highlight);
  }
  public async getAnnotationByID(id: string): Promise<any> {
    return this.annotator?.getAnnotationByID(id);
  }

  // ── IBookmarkModule contract ────────────────────────────────
  // Thin shims over the existing EPUB-specific methods so
  // integrator code can target the shared interface.

  save(): Promise<Bookmark | null> {
    return this.saveBookmark().then((r) => r ?? null);
  }
  delete(bookmark: Bookmark): Promise<void> {
    return this.deleteBookmark(bookmark).then(() => undefined);
  }
  list(): Bookmark[] {
    return this.getBookmarks() as Bookmark[];
  }
  /**
   * Resolves the canonical href for the current chapter — the same
   * derivation `saveBookmark` uses (TOC lookup chain + fragment strip).
   * Returns null if no TOC entry matches.
   */
  private getCurrentChapterHref(): string | null {
    let tocItem = this.publication.getTOCItem(
      this.host.currentChapterLink.href
    );
    if (this.host.currentTocUrl) {
      tocItem = this.publication.getTOCItem(this.host.currentTocUrl);
    }
    if (tocItem === undefined) {
      tocItem = this.publication.getTOCItemAbsolute(
        this.host.currentChapterLink.href
      );
    }
    if (!tocItem) return null;
    let href = tocItem.href;
    if (href.indexOf("#") > 0) href = href.slice(0, href.indexOf("#"));
    return href;
  }

  /**
   * Resolves the positions-array locator at the current reading position,
   * or null if positions aren't available. Used by `saveBookmark` to spread
   * into the saved bookmark and by `findBookmarkAt` to compute the
   * progression that matches what's stored.
   */
  private getCurrentPositionLocator(rawProgression?: number): Locator | null {
    const hasPositions =
      (this.host.rights.autoGeneratePositions && this.publication.positions) ||
      this.publication.positions;
    if (!hasPositions) return null;
    const positions = this.publication.positionsByHref(
      this.publication.getRelativeHref(this.host.currentChapterLink.href)
    );
    if (positions.length === 0) return null;
    const progression =
      rawProgression ?? this.host.view?.getCurrentPosition() ?? 0;
    const positionIndex = Math.ceil(progression * (positions.length - 1));
    return (positions[positionIndex] as Locator) ?? null;
  }

  /**
   * Returns the saved bookmark at a given reading position, or null.
   * When `locator` is omitted, uses the reader's current locator.
   *
   * Uses the same href/progression derivation as `saveBookmark` so the
   * lookup matches what was actually stored.
   *
   * For publications with a positions array, matches on `position` (the
   * page index) instead of `progression` so the indicator stays stable
   * across all scroll positions within the same page rather than flicker
   * when raw progression edges past a positions-array boundary.
   */
  findBookmarkAt(locator?: Locator): Bookmark | null {
    if (!this.annotator) return null;
    const stored = this.getBookmarks() as Bookmark[];

    // Resolve target href + progression from the supplied locator or the
    // reader's current state.
    const href = locator?.href ?? this.getCurrentChapterHref();
    if (!href) return null;
    const rawProgression =
      locator?.locations?.progression ?? this.host.view?.getCurrentPosition();
    if (rawProgression === undefined) return null;

    // Prefer position-matching when available (positions array gives stable
    // page-aligned identity across scroll subpixel changes).
    const explicitPosition = locator?.locations?.position;
    const derivedPosition =
      explicitPosition ??
      this.getCurrentPositionLocator(rawProgression)?.locations?.position;
    if (derivedPosition !== undefined) {
      return (
        stored.find(
          (b) => b.href === href && b.locations?.position === derivedPosition
        ) ?? null
      );
    }

    // Non-positions fallback: tolerance-match on raw progression so tiny
    // float differences (subpixel scroll, re-derivation rounding) don't
    // mask a saved bookmark stored at "the same" position.
    const tolerance = 0.001;
    return (
      stored.find(
        (b) =>
          b.href === href &&
          typeof b.locations?.progression === "number" &&
          Math.abs(b.locations.progression - rawProgression) < tolerance
      ) ?? null
    );
  }

  hasBookmarkAt(locator?: Locator): boolean {
    return this.findBookmarkAt(locator) !== null;
  }
}
