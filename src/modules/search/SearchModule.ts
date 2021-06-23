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
 * Developed on behalf of: DITA and Bibliotheca LLC (https://www.bibliotheca.com)
 * Licensed to: Bibliotheca LLC, Bokbasen AS and CAST under one or more contributor license agreements.
 */

import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { Publication } from "../../model/Publication";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import ReaderModule from "../ReaderModule";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import { Locator, Locations } from "../../model/Locator";
import { IS_DEV } from "../..";
import { searchDocDomSeek, reset } from "./searchWithDomSeek";
import TextHighlighter from "../highlight/TextHighlighter";

export interface SearchModuleAPI {}

export interface SearchModuleProperties {
  color: string;
  current: string;
}

export interface SearchModuleConfig extends SearchModuleProperties {
  api: SearchModuleAPI;
  publication: Publication;
  headerMenu: HTMLElement;
  delegate: IFrameNavigator;
  highlighter: TextHighlighter;
}

export default class SearchModule implements ReaderModule {
  private properties: SearchModuleProperties;
  // @ts-ignore
  private api: SearchModuleAPI;
  private publication: Publication;
  private readonly headerMenu: HTMLElement;
  private delegate: IFrameNavigator;
  private searchInput: HTMLInputElement;
  private searchGo: HTMLElement;
  private currentChapterSearchResult: any = [];
  private bookSearchResult: any = [];
  private currentHighlights: any = [];
  private highlighter: TextHighlighter;

  public static async create(config: SearchModuleConfig) {
    const search = new this(
      config.headerMenu,
      config.delegate,
      config.publication,
      config as SearchModuleProperties,
      config.api,
      config.highlighter
    );

    await search.start();
    return search;
  }

  private constructor(
    headerMenu: HTMLElement,
    delegate: IFrameNavigator,
    publication: Publication,
    properties: SearchModuleProperties,
    api: SearchModuleAPI,
    highlighter: TextHighlighter
  ) {
    this.delegate = delegate;
    this.headerMenu = headerMenu;
    this.publication = publication;
    this.properties = properties;
    this.api = api;
    this.highlighter = highlighter;
  }

  async stop() {
    if (IS_DEV) {
      console.log("Search module stop");
    }
    removeEventListenerOptional(
      this.searchInput,
      "keypress",
      this.handleSearch.bind(this)
    );
    removeEventListenerOptional(
      this.searchGo,
      "click",
      this.handleSearch.bind(this)
    );
  }

  protected async start(): Promise<void> {
    this.delegate.searchModule = this;

    if (this.headerMenu) {
      this.searchInput = HTMLUtilities.findElement(
        this.headerMenu,
        "#searchInput"
      ) as HTMLInputElement;
      addEventListenerOptional(
        this.searchInput,
        "keypress",
        this.handleSearch.bind(this)
      );

      this.searchGo = HTMLUtilities.findElement(
        this.headerMenu,
        "#searchGo"
      ) as HTMLElement;
      addEventListenerOptional(
        this.searchGo,
        "click",
        this.handleSearch.bind(this)
      );

      // CONTROL
      var menuSearch = HTMLUtilities.findElement(
        this.headerMenu,
        "#menu-button-search"
      ) as HTMLLinkElement;
      if (menuSearch) menuSearch.parentElement.style.removeProperty("display");
    }
  }

  private async handleSearch(event: any): Promise<void> {
    if (event.key === "Enter" || event.type === "click") {
      await this.handleSearchChapter();
      await this.handleSearchBook();
    }
  }

  async handleSearchChapter(index?: number) {
    var self = this;
    var searchVal = this.searchInput.value;
    let currentLocation = this.delegate.currentChapterLink.href;
    const spineItem = this.publication.getSpineItem(currentLocation);
    var searchResultDiv = HTMLUtilities.findElement(
      this.headerMenu,
      "#searchResultChapter"
    ) as HTMLDivElement;

    self.currentChapterSearchResult = [];
    self.currentHighlights = [];
    var localSearchResultChapter: any = [];
    if (this.delegate.rights?.enableContentProtection) {
      this.delegate.contentProtectionModule.deactivate();
    }
    await this.searchAndPaintChapter(searchVal, index, async (result) => {
      localSearchResultChapter = result;
      goToResultPage(1);
      if (this.delegate.rights?.enableContentProtection) {
        this.delegate.contentProtectionModule.recalculate(200);
      }
    });

    async function goToResultPage(page: number) {
      searchResultDiv.innerHTML = null;
      var paginated: {
        page: number;
        per_page: number;
        pre_page: number;
        next_page: number;
        total: number;
        total_pages: number;
        data: any[];
      };
      paginated = self.paginate(localSearchResultChapter, page, 5);
      if (paginated.total === 0) {
        const linkElement: HTMLAnchorElement = document.createElement("a");
        linkElement.className = "collection-item";
        linkElement.innerHTML = "nothing found"; //self.delegate.translateModule.reader_search_nothing_found
        searchResultDiv.appendChild(linkElement);
      } else {
        for (let index = 0; index < paginated.data.length; index++) {
          const linkElement: HTMLAnchorElement = document.createElement("a");
          const element = paginated.data[index];
          linkElement.className = "collection-item";
          linkElement.href = spineItem.Href;
          linkElement.innerHTML =
            "..." +
            element.textBefore +
            "<mark>" +
            element.textMatch +
            "</mark>" +
            element.textAfter +
            "..."; //   element.chapter_highlight
          addEventListenerOptional(
            linkElement,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              self.jumpToMark(index + page * 5 - 5);
            }
          );
          searchResultDiv.appendChild(linkElement);
        }
        let div: HTMLDivElement = document.createElement("div");
        div.style.textAlign = "center";
        div.style.marginTop = "10px";

        let pagination: HTMLUListElement = document.createElement("ul");
        pagination.className = "pagination";

        let previousResultPage: HTMLLIElement = document.createElement("li");
        previousResultPage.className = "disabled";

        previousResultPage.innerHTML = '<a href="#!">left</a>';
        if (paginated.pre_page != null) {
          previousResultPage.className = "waves-effect";
          addEventListenerOptional(
            previousResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(paginated.pre_page);
            }
          );
        }
        pagination.appendChild(previousResultPage);

        var activeElement: HTMLLIElement;
        for (let index = 1; index <= paginated.total_pages; index++) {
          let element: HTMLLIElement = document.createElement("li");
          element.className = "waves-effect";
          if (index === paginated.page) {
            element.className = "active";
            activeElement = element;
          }
          element.innerHTML = '<a href="#!">' + index + "</a>";

          addEventListenerOptional(element, "click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            activeElement.className = "waves-effect";
            element.className = "active";
            activeElement = element;
            goToResultPage(index);
          });

          pagination.appendChild(element);
        }

        let nextResultPage: HTMLLIElement = document.createElement("li");
        nextResultPage.className = "disabled";
        nextResultPage.innerHTML = '<a href="#!">right</a>';
        if (paginated.next_page != null) {
          nextResultPage.className = "waves-effect";
          addEventListenerOptional(
            nextResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(paginated.next_page);
            }
          );
        }
        pagination.appendChild(nextResultPage);
        div.appendChild(pagination);
        searchResultDiv.appendChild(div);
      }
    }
  }
  // Search Current Resource
  async searchAndPaintChapter(
    term: string,
    index: number = 0,
    callback: (result: any) => any
  ) {
    const linkHref = this.publication.getAbsoluteHref(
      this.publication.readingOrder[this.delegate.currentResource()].Href
    );
    let tocItem = this.publication.getTOCItem(linkHref);
    if (tocItem === null) {
      tocItem = this.publication.readingOrder[this.delegate.currentResource()];
    }
    var localSearchResultChapter: any = [];

    // clear search results // needs more works
    for (const iframe of this.delegate.iframes) {
      this.highlighter.destroyAllhighlights(iframe.contentDocument);
    }
    if (this.delegate.rights?.enableAnnotations) {
      this.delegate.annotationModule.drawHighlights();
    } else {
      if (this.delegate.rights?.enableSearch) {
        this.drawSearch();
      }
    }
    var i = 0;

    var href = this.publication.getAbsoluteHref(tocItem.Href);
    await fetch(href)
      .then((r) => r.text())
      .then(async (_data) => {
        // ({ data, tocItem });
        // TODO: this seems to break with obfuscation
        // var parser = new DOMParser();
        // var doc = parser.parseFromString(data, "text/html");
        searchDocDomSeek(
          term,
          this.delegate.iframes[0].contentDocument,
          tocItem.Href,
          tocItem.Title
        ).then((result) => {
          // searchDocDomSeek(searchVal, doc, tocItem.href, tocItem.title).then(result => {
          result.forEach((searchItem) => {
            var selectionInfo = {
              rangeInfo: searchItem.rangeInfo,
              cleanText: null,
              rawText: null,
              range: null,
            };
            setTimeout(() => {
              var highlight;
              if (i === index) {
                highlight = this.highlighter.createSearchHighlight(
                  selectionInfo,
                  this.properties?.current
                );
                this.jumpToMark(index);
              } else {
                highlight = this.highlighter.createSearchHighlight(
                  selectionInfo,
                  this.properties?.color
                );
              }
              searchItem.highlight = highlight;
              localSearchResultChapter.push(searchItem);
              this.currentChapterSearchResult.push(searchItem);
              this.currentHighlights.push(highlight);
              i++;
            }, 500);
          });
          setTimeout(() => {
            callback(localSearchResultChapter);
          }, 500);
        });
      });
  }
  clearSearch() {
    this.currentChapterSearchResult = [];
    this.currentHighlights = [];
    for (const iframe of this.delegate.iframes) {
      this.highlighter.destroyAllhighlights(iframe.contentDocument);
    }
    if (this.delegate.rights?.enableAnnotations) {
      this.delegate.annotationModule.drawHighlights();
    }
  }
  async search(term: any, current: boolean): Promise<any> {
    this.currentChapterSearchResult = [];
    this.currentHighlights = [];
    this.bookSearchResult = [];
    reset();

    this.searchAndPaintChapter(term, 0, async () => {});

    var chapter = this.searchChapter(term);
    var book = this.searchBook(term);

    if (current) {
      return chapter;
    } else {
      return book;
    }
  }
  async goToSearchID(href: any, index: number, current: boolean) {
    var filteredIndex = index;
    var item;
    let currentLocation = this.delegate.currentChapterLink.href;
    var absolutehref = this.publication.getAbsoluteHref(href);
    let filteredIndexes = this.bookSearchResult.filter(
      (el: any) => el.href === href
    );

    if (current) {
      item = this.currentChapterSearchResult.filter(
        (el: any) => el.uuid === index
      )[0];
      filteredIndex = this.currentChapterSearchResult.findIndex(
        (el: any) => el.uuid === index
      );
    } else {
      item = filteredIndexes.filter((el: any) => el.uuid === index)[0];
      filteredIndex = filteredIndexes.findIndex((el: any) => el.uuid === index);
    }
    if (item !== undefined) {
      if (currentLocation === absolutehref) {
        this.jumpToMark(filteredIndex);
      } else {
        let locations: Locations = {
          progression: 0,
        };

        const position: Locator = {
          href: absolutehref,
          // type: link.type,
          locations: locations,
          title: "title",
        };
        // TODO search index and total progression.
        // position.locations.totalProgression = self.delegate.calculateTotalProgresion(position)
        // position.locations.index = filteredIndex

        this.delegate.navigate(position);
        // Navigate to new chapter and search only in new current chapter,
        // this should refresh thesearch result of current chapter and highlight the selected index
        setTimeout(() => {
          this.searchAndPaintChapter(
            item.textMatch,
            filteredIndex,
            async () => {}
          );
        }, 300);
      }
    }
  }

  async goToSearchIndex(href: any, index: number, current: boolean) {
    var filteredIndex = index;
    var item;
    let currentLocation = this.delegate.currentChapterLink.href;
    var absolutehref = this.publication.getAbsoluteHref(href);
    let filteredIndexes = this.bookSearchResult.filter(
      (el: any) => el.href === href
    );

    if (current) {
      item = this.currentChapterSearchResult[filteredIndex];
    } else {
      item = filteredIndexes[filteredIndex];
    }
    if (item !== undefined) {
      if (currentLocation === absolutehref) {
        this.jumpToMark(filteredIndex);
      } else {
        let locations: Locations = {
          progression: 0,
        };

        const position: Locator = {
          href: absolutehref,
          // type: link.type,
          locations: locations,
          title: "title",
        };
        // TODO search index and total progression.
        // position.locations.totalProgression = self.delegate.calculateTotalProgresion(position)
        // position.locations.index = filteredIndex

        this.delegate.navigate(position);
        // Navigate to new chapter and search only in new current chapter,
        // this should refresh thesearch result of current chapter and highlight the selected index
        setTimeout(() => {
          this.searchAndPaintChapter(
            item.textMatch,
            filteredIndex,
            async () => {}
          );
        }, 300);
      }
    }
  }

  private async handleSearchBook() {
    var self = this;
    var searchVal = this.searchInput.value;
    // var searchResult = undefined
    var searchResultBook = HTMLUtilities.findElement(
      self.headerMenu,
      "#searchResultBook"
    ) as HTMLDivElement;
    goToResultPage(1);

    async function goToResultPage(page: number) {
      searchResultBook.innerHTML = null;
      var paginated: {
        page: number;
        per_page: number;
        pre_page: number;
        next_page: number;
        total: number;
        total_pages: number;
        data: any[];
      };
      var localSearchResultBook = await self.searchBook(searchVal);
      paginated = self.paginate(localSearchResultBook, page, 5);

      if (paginated.total === 0) {
        const linkElement: HTMLAnchorElement = document.createElement("a");
        linkElement.className = "collection-item";
        linkElement.innerHTML = "nothing found"; //self.delegate.translateModule.reader_search_nothing_found
        searchResultBook.appendChild(linkElement);
      } else {
        const paginatedGrouped = groupBy(paginated.data, (item) => item.href);
        paginatedGrouped.forEach((chapter) => {
          const divElement: HTMLDivElement = document.createElement("div");
          divElement.style.marginBottom = "10px";

          if (chapter[0].title) {
            const spanElement: HTMLSpanElement = document.createElement("span");
            spanElement.className = "collection-item";
            spanElement.style.display = "block";
            spanElement.innerHTML = chapter[0].title;
            divElement.appendChild(spanElement);
          }

          searchResultBook.appendChild(divElement);
          chapter.forEach((searchItem) => {
            const linkElement: HTMLAnchorElement = document.createElement("a");
            linkElement.className = "collection-item";

            var href = self.publication.getAbsoluteHref(searchItem.href);

            linkElement.innerHTML =
              "..." +
              searchItem.textBefore +
              "<mark>" +
              searchItem.textMatch +
              "</mark>" +
              searchItem.textAfter +
              "..."; //searchItem.chapter_highlight
            addEventListenerOptional(
              linkElement,
              "click",
              (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();

                let filteredIndexes = localSearchResultBook.filter(
                  (el: any) => el.href === searchItem.href
                );
                const filteredIndex = filteredIndexes.findIndex(
                  (el: any) => el === searchItem
                );

                let currentLocation = self.delegate.currentChapterLink.href;

                if (currentLocation === href) {
                  self.jumpToMark(filteredIndex);
                } else {
                  let locations: Locations = {
                    progression: 0,
                  };

                  const position: Locator = {
                    href: href,
                    // type: link.type,
                    locations: locations,
                    title: "title",
                  };
                  // TODO search index and total progression.
                  // position.locations.totalProgression = self.delegate.calculateTotalProgresion(position)
                  // position.locations.index = filteredIndex

                  self.delegate.navigate(position);
                  // Navigate to new chapter and search only in new current chapter,
                  // this should refresh thesearch result of current chapter and highlight the selected index
                  setTimeout(() => {
                    self.handleSearchChapter(filteredIndex);
                  }, 300);
                }
              }
            );
            divElement.appendChild(linkElement);
          });
        });

        let div: HTMLDivElement = document.createElement("div");
        div.style.textAlign = "center";
        div.style.marginTop = "10px";

        let pagination: HTMLUListElement = document.createElement("ul");
        pagination.className = "pagination";

        let previousResultPage: HTMLLIElement = document.createElement("li");
        previousResultPage.className = "disabled";
        previousResultPage.innerHTML = '<a href="#!">left</a>';
        if (paginated.pre_page != null) {
          previousResultPage.className = "waves-effect";
          addEventListenerOptional(
            previousResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(paginated.pre_page);
            }
          );
        }
        pagination.appendChild(previousResultPage);

        var activeElement: HTMLLIElement;
        for (let index = 1; index <= paginated.total_pages; index++) {
          let element: HTMLLIElement = document.createElement("li");
          element.className = "waves-effect";
          if (index === paginated.page) {
            element.className = "active";
            activeElement = element;
          }
          element.innerHTML = '<a href="#!">' + index + "</a>";

          addEventListenerOptional(element, "click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            activeElement.className = "waves-effect";
            element.className = "active";
            activeElement = element;
            goToResultPage(index);
          });

          pagination.appendChild(element);
        }

        let nextResultPage: HTMLLIElement = document.createElement("li");
        nextResultPage.className = "disabled";
        nextResultPage.innerHTML = '<a href="#!">right</a>';
        if (paginated.next_page != null) {
          nextResultPage.className = "waves-effect";
          addEventListenerOptional(
            nextResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(paginated.next_page);
            }
          );
        }
        pagination.appendChild(nextResultPage);
        div.appendChild(pagination);
        searchResultBook.appendChild(div);
      }
    }

    function groupBy<T, K>(list: T[], getKey: (item: T) => K) {
      const map = new Map<K, T[]>();
      list.forEach((item) => {
        const key = getKey(item);
        const collection = map.get(key);
        if (!collection) {
          map.set(key, [item]);
        } else {
          collection.push(item);
        }
      });
      return Array.from(map.values());
    }
  }
  // Search Entire Book
  async searchBook(term: string): Promise<any> {
    this.bookSearchResult = [];

    var localSearchResultBook: any = [];
    for (let index = 0; index < this.publication.readingOrder.length; index++) {
      const linkHref = this.publication.getAbsoluteHref(
        this.publication.readingOrder[index].Href
      );
      let tocItem = this.publication.getTOCItem(linkHref);
      if (tocItem === null) {
        tocItem = this.publication.readingOrder[index];
      }
      var href = this.publication.getAbsoluteHref(tocItem.Href);
      await fetch(href)
        .then((r) => r.text())
        .then(async (data) => {
          // ({ data, tocItem });
          var parser = new DOMParser();
          var doc = parser.parseFromString(data, "application/xhtml+xml");
          searchDocDomSeek(term, doc, tocItem.Href, tocItem.Title).then(
            (result) => {
              result.forEach((searchItem) => {
                localSearchResultBook.push(searchItem);
                this.bookSearchResult.push(searchItem);
              });
            }
          );
        });

      if (index === this.publication.readingOrder.length - 1) {
        return localSearchResultBook;
      }
    }
  }
  async searchChapter(term: string): Promise<any> {
    var localSearchResultBook: any = [];
    const linkHref = this.publication.getAbsoluteHref(
      this.publication.readingOrder[this.delegate.currentResource()].Href
    );
    let tocItem = this.publication.getTOCItem(linkHref);
    if (tocItem === null) {
      tocItem = this.publication.readingOrder[this.delegate.currentResource()];
    }
    var href = this.publication.getAbsoluteHref(tocItem.Href);
    await fetch(href)
      .then((r) => r.text())
      .then(async (data) => {
        // ({ data, tocItem });
        var parser = new DOMParser();
        var doc = parser.parseFromString(data, "application/xhtml+xml");
        searchDocDomSeek(term, doc, tocItem.Href, tocItem.Title).then(
          (result) => {
            result.forEach((searchItem) => {
              localSearchResultBook.push(searchItem);
            });
          }
        );
      });

    return localSearchResultBook;
  }

  drawSearch() {
    setTimeout(() => {
      this.currentHighlights = [];
      this.currentChapterSearchResult.forEach((searchItem) => {
        var selectionInfo = {
          rangeInfo: searchItem.rangeInfo,
          cleanText: null,
          rawText: null,
          range: null,
        };
        var highlight = this.highlighter.createSearchHighlight(
          selectionInfo,
          this.properties?.color
        );
        searchItem.highlight = highlight;
        this.currentHighlights.push(highlight);
      });
    }, 100);
  }

  async handleResize() {
    for (const iframe of this.delegate.iframes) {
      await this.highlighter.destroyAllhighlights(iframe.contentDocument);
    }
    this.drawSearch();
  }

  jumpToMark(index: number) {
    setTimeout(() => {
      if (this.currentChapterSearchResult.length) {
        var current = this.currentChapterSearchResult[index];
        this.currentHighlights.forEach((highlight) => {
          var createColor: any = this.properties?.color;
          if (TextHighlighter.isHexColor(createColor)) {
            createColor = TextHighlighter.hexToRgbChannels(createColor);
          }
          highlight.color = createColor;
        });
        var currentColor: any = this.properties?.current;
        if (TextHighlighter.isHexColor(currentColor)) {
          currentColor = TextHighlighter.hexToRgbChannels(currentColor);
        }
        current.highlight.color = currentColor;
        this.highlighter.setAndResetSearchHighlight(
          current.highlight,
          this.currentHighlights
        );

        this.delegate.view.goToCssSelector(
          current.rangeInfo.startContainerElementCssSelector
        );
        this.delegate.updatePositionInfo();
      }
    }, 200);
  }

  paginate(items: Array<any>, page: number, per_page: number) {
    var page = page || 1,
      per_page = per_page || 10,
      offset = (page - 1) * per_page,
      paginatedItems = items.slice(offset).slice(0, per_page),
      total_pages = Math.ceil(items.length / per_page);
    return {
      page: page,
      per_page: per_page,
      pre_page: page - 1 ? page - 1 : null,
      next_page: total_pages > page ? page + 1 : null,
      total: items.length,
      total_pages: total_pages,
      data: paginatedItems,
    };
  }
}
