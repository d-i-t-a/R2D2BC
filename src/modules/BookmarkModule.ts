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
import { Bookmark, Locator } from "../model/Locator";
import { IS_DEV } from "..";
import { toast } from "materialize-css";
import { v4 as uuid } from "uuid";
import { Link } from "../model/Link";

export interface BookmarkModuleAPI {
  addBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
  deleteBookmark: (bookmark: Bookmark) => Promise<Bookmark>;
  getBookmarks: Array<any>;
}

export interface BookmarkModuleProperties {}

export interface BookmarkModuleConfig {
  annotator: Annotator;
  headerMenu: HTMLElement;
  rights: ReaderRights;
  publication: Publication;
  delegate: IFrameNavigator;
  initialAnnotations?: any;
  properties: BookmarkModuleProperties;
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
      config.properties,
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

    this.showBookmarks();
  }

  async deleteBookmark(bookmark: Bookmark): Promise<any> {
    if (this.annotator) {
      if (this.api?.deleteBookmark) {
        this.api?.deleteBookmark(bookmark).then(async (_result) => {
          var deleted = await this.annotator.deleteBookmark(bookmark);

          if (IS_DEV) {
            console.log("Bookmark deleted " + JSON.stringify(deleted));
          }
          await this.showBookmarks();
          if (this.delegate.rights?.enableMaterial) {
            toast({ html: "bookmark deleted" });
          }
          return deleted;
        });
      } else {
        var deleted = await this.annotator.deleteBookmark(bookmark);

        if (IS_DEV) {
          console.log("Bookmark deleted " + JSON.stringify(deleted));
        }
        await this.showBookmarks();
        if (this.delegate.rights?.enableMaterial) {
          toast({ html: "bookmark deleted" });
        }
        return deleted;
      }
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
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

      const progression = this.delegate.view.getCurrentPosition();
      const id: string = uuid();
      let bookmark: Bookmark;
      if (
        ((this.rights?.autoGeneratePositions ?? true) &&
          this.publication.positions) ||
        this.publication.positions
      ) {
        const chptHref: string = this.delegate.currentChapterLink.href;
        const positions = this.publication.positionsByHref(chptHref);
        const positionIndex = Math.ceil(progression * (positions.length - 1));
        const locator = positions[positionIndex];

        bookmark = {
          ...locator,
          id: id,
          href: tocItem.Href,
          created: new Date(),
          title: this.delegate.currentChapterLink.title,
        };
      } else {
        bookmark = {
          id: id,
          href: tocItem.Href,
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
          this.api.addBookmark(bookmark).then(async (bookmark) => {
            if (IS_DEV) console.log(bookmark);
            var saved = await this.annotator.saveBookmark(bookmark);

            if (IS_DEV) {
              console.log("Bookmark added " + JSON.stringify(saved));
            }
            if (this.delegate.rights?.enableMaterial) {
              toast({ html: "bookmark added" });
            }
            await this.showBookmarks();
            return saved;
          });
        } else {
          var saved = await this.annotator.saveBookmark(bookmark);

          if (IS_DEV) {
            console.log("Bookmark added " + JSON.stringify(saved));
          }
          if (this.delegate.rights?.enableMaterial) {
            toast({ html: "bookmark added" });
          }
          await this.showBookmarks();
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

    if (this.bookmarksView)
      this.createTree(AnnotationType.Bookmark, bookmarks, this.bookmarksView);
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
}
