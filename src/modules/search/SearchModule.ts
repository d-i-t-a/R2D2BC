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
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import { AnnotationMarker, Locations, Locator } from "../../model/Locator";
import { IS_DEV } from "../../utils";
import { DEFAULT_BACKGROUND_COLOR } from "../highlight/TextHighlighter";
import { HighlightType, IHighlight } from "../highlight/common/highlight";
import { ISelectionInfo } from "../highlight/common/selection";
import { SHA256 } from "jscrypto";
import { searchDocDomSeek, reset } from "./searchWithDomSeek";
import { TextHighlighter } from "../highlight/TextHighlighter";

export interface SearchModuleAPI {}

export interface SearchModuleProperties {
  color?: string;
  current?: string;
  hideLayer?: boolean;
}

export interface SearchModuleConfig extends SearchModuleProperties {
  api?: SearchModuleAPI;
  publication: Publication;
  headerMenu?: HTMLElement | null;
  delegate: IFrameNavigator;
  highlighter: TextHighlighter;
}

export class SearchModule implements ReaderModule {
  private properties: SearchModuleProperties;
  // @ts-ignore
  private api?: SearchModuleAPI;
  private publication: Publication;
  private readonly headerMenu?: HTMLElement | null;
  private delegate: IFrameNavigator;
  private searchInput: HTMLInputElement;
  private searchGo: HTMLElement;
  private currentChapterSearchResult: any = [];
  private bookSearchResult: any = [];
  private currentSearchHighlights: any = [];
  private highlighter?: TextHighlighter;

  public static async create(config: SearchModuleConfig) {
    const search = new this(
      config.delegate,
      config.publication,
      config as SearchModuleProperties,
      config.highlighter,
      config.api,
      config.headerMenu
    );

    await search.start();
    return search;
  }

  private constructor(
    delegate: IFrameNavigator,
    publication: Publication,
    properties: SearchModuleProperties,
    highlighter: TextHighlighter,
    api?: SearchModuleAPI,
    headerMenu?: HTMLElement | null
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
      if (menuSearch) menuSearch.parentElement?.style.removeProperty("display");
    }
    setTimeout(() => {
      this.properties.hideLayer
        ? this.delegate.hideLayer("search")
        : this.delegate.showLayer("search");
    }, 10);
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
    if (this.headerMenu) {
      var searchResultDiv = HTMLUtilities.findElement(
        this.headerMenu,
        "#searchResultChapter"
      ) as HTMLDivElement;
    }

    self.currentChapterSearchResult = [];
    self.currentSearchHighlights = [];
    var localSearchResultChapter: any = [];
    if (this.delegate.rights?.enableContentProtection) {
      this.delegate.contentProtectionModule?.deactivate();
    }
    await this.searchAndPaintChapter(searchVal, index, async (result) => {
      localSearchResultChapter = result;
      goToResultPage(1);
      if (this.delegate.rights?.enableContentProtection) {
        this.delegate.contentProtectionModule?.recalculate(200);
      }
    });

    async function goToResultPage(page: number) {
      searchResultDiv.innerHTML = "";
      var paginated: {
        page: number;
        per_page: number;
        pre_page?: number | undefined;
        next_page?: number | undefined;
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
          linkElement.href = spineItem?.Href ?? "";
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
        if (paginated.pre_page !== undefined) {
          const pre_page = paginated.pre_page;
          previousResultPage.className = "waves-effect";
          addEventListenerOptional(
            previousResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(pre_page);
            }
          );
        }
        pagination.appendChild(previousResultPage);

        for (let index = 1; index <= paginated.total_pages; index++) {
          let activeElement: HTMLLIElement;
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
        if (paginated.next_page !== undefined) {
          const next_page = paginated.next_page;
          nextResultPage.className = "waves-effect";
          addEventListenerOptional(
            nextResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(next_page);
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
      this.publication.readingOrder[this.delegate.currentResource() ?? 0].Href
    );
    let tocItem = this.publication.getTOCItem(linkHref);
    if (tocItem === null) {
      tocItem = this.publication.readingOrder[
        this.delegate.currentResource() ?? 0
      ];
    }
    let localSearchResultChapter: any = [];

    // clear search results // needs more works
    this.highlighter?.destroyHighlights(HighlightType.Search);
    if (this.delegate.rights?.enableSearch) {
      this.drawSearch();
    }
    let i = 0;
    if (tocItem) {
      let href = this.publication.getAbsoluteHref(tocItem.Href);
      let doc = this.delegate.iframes[0].contentDocument;
      if (doc) {
        await fetch(href)
          .then((r) => r.text())
          .then(async (_data) => {
            // ({ data, tocItem });
            // TODO: this seems to break with obfuscation
            // var parser = new DOMParser();
            // var doc = parser.parseFromString(data, "text/html");
            if (tocItem) {
              searchDocDomSeek(term, doc, tocItem.Href, tocItem.Title).then(
                (result) => {
                  // searchDocDomSeek(searchVal, doc, tocItem.href, tocItem.title).then(result => {
                  result.forEach((searchItem) => {
                    let selectionInfo = {
                      rangeInfo: searchItem.rangeInfo,
                    };
                    setTimeout(() => {
                      let highlight;
                      if (i === index) {
                        highlight = this.createSearchHighlight(
                          selectionInfo,
                          this.properties?.current!!
                        );
                        this.jumpToMark(index);
                      } else {
                        highlight = this.createSearchHighlight(
                          selectionInfo,
                          this.properties?.color!!
                        );
                      }
                      searchItem.highlight = highlight;
                      localSearchResultChapter.push(searchItem);
                      this.currentChapterSearchResult.push(searchItem);
                      this.currentSearchHighlights.push(highlight);
                      i++;
                    }, 500);
                  });
                  setTimeout(() => {
                    callback(localSearchResultChapter);
                  }, 500);
                }
              );
            }
          });
      }
    }
  }

  createSearchHighlight(selectionInfo: ISelectionInfo, color: string) {
    try {
      var createColor: any = color;
      if (TextHighlighter.isHexColor(createColor)) {
        createColor = TextHighlighter.hexToRgbChannels(createColor);
      }

      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = "R2_SEARCH_" + sha256Hex;

      var pointerInteraction = false;
      const highlight: IHighlight = {
        color: createColor ? createColor : DEFAULT_BACKGROUND_COLOR,
        id,
        pointerInteraction,
        selectionInfo,
        marker: AnnotationMarker.Highlight,
        type: HighlightType.Search,
      };

      let highlightDom = this.highlighter?.createHighlightDom(
        this.delegate.iframes[0].contentWindow as any,
        highlight
      );
      highlight.position = parseInt(
        ((highlightDom?.hasChildNodes()
          ? highlightDom.childNodes[0]
          : highlightDom) as HTMLDivElement).style.top.replace("px", "")
      );
      return highlight;
    } catch (e) {
      throw "Can't create highlight: " + e;
    }
  }

  clearSearch() {
    this.currentChapterSearchResult = [];
    this.currentSearchHighlights = [];
    this.highlighter?.destroyHighlights(HighlightType.Search);
  }

  async search(term: string, current: boolean): Promise<any> {
    this.currentChapterSearchResult = [];
    this.currentSearchHighlights = [];
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
  async goToSearchID(href: string, index: number, current: boolean) {
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

  async goToSearchIndex(href: string, index: number, current: boolean) {
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
    if (self.headerMenu) {
      var searchResultBook = HTMLUtilities.findElement(
        self.headerMenu,
        "#searchResultBook"
      ) as HTMLDivElement;
    }
    goToResultPage(1);

    async function goToResultPage(page: number) {
      searchResultBook.innerHTML = "";
      var paginated: {
        page: number;
        per_page: number;
        pre_page?: number | undefined;
        next_page?: number | undefined;
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
          let pre_page = paginated.pre_page;
          previousResultPage.className = "waves-effect";
          addEventListenerOptional(
            previousResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(pre_page);
            }
          );
        }
        pagination.appendChild(previousResultPage);

        for (let index = 1; index <= paginated.total_pages; index++) {
          let activeElement: HTMLLIElement;
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
          let next_page = paginated.next_page;
          nextResultPage.className = "waves-effect";
          addEventListenerOptional(
            nextResultPage,
            "click",
            (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              goToResultPage(next_page);
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

    let localSearchResultBook: any = [];
    for (let index = 0; index < this.publication.readingOrder.length; index++) {
      const linkHref = this.publication.getAbsoluteHref(
        this.publication.readingOrder
          ? this.publication.readingOrder[this.delegate.currentResource() ?? 0]
              .Href
          : ""
      );
      let tocItem = this.publication.getTOCItem(linkHref);
      if (tocItem === undefined && this.publication.readingOrder) {
        tocItem = this.publication.readingOrder[index];
      }
      if (tocItem) {
        let href = this.publication.getAbsoluteHref(tocItem.Href);
        await fetch(href)
          .then((r) => r.text())
          .then(async (data) => {
            // ({ data, tocItem });
            let parser = new DOMParser();
            let doc = parser.parseFromString(data, "application/xhtml+xml");
            if (tocItem) {
              searchDocDomSeek(term, doc, tocItem.Href, tocItem.Title).then(
                (result) => {
                  result.forEach((searchItem) => {
                    localSearchResultBook.push(searchItem);
                    this.bookSearchResult.push(searchItem);
                  });
                }
              );
            }
          });
      }
      if (index === this.publication.readingOrder.length - 1) {
        return localSearchResultBook;
      }
    }
  }
  async searchChapter(term: string): Promise<any> {
    let localSearchResultBook: any = [];
    const linkHref = this.publication.getAbsoluteHref(
      this.publication.readingOrder[this.delegate.currentResource() ?? 0].Href
    );
    let tocItem = this.publication.getTOCItem(linkHref);
    if (tocItem === null) {
      tocItem = this.publication.readingOrder[
        this.delegate.currentResource() ?? 0
      ];
    }
    if (tocItem) {
      let href = this.publication.getAbsoluteHref(tocItem.Href);
      await fetch(href)
        .then((r) => r.text())
        .then(async (data) => {
          // ({ data, tocItem });
          let parser = new DOMParser();
          let doc = parser.parseFromString(data, "application/xhtml+xml");
          if (tocItem) {
            searchDocDomSeek(term, doc, tocItem.Href, tocItem.Title).then(
              (result) => {
                result.forEach((searchItem) => {
                  localSearchResultBook.push(searchItem);
                });
              }
            );
          }
        });
    }

    return localSearchResultBook;
  }

  drawSearch() {
    setTimeout(() => {
      this.currentSearchHighlights = [];
      this.currentChapterSearchResult.forEach((searchItem) => {
        let selectionInfo = {
          rangeInfo: searchItem.rangeInfo,
        };
        if (this.properties?.color) {
          let highlight = this.createSearchHighlight(
            selectionInfo,
            this.properties?.color
          );
          searchItem.highlight = highlight;
          this.currentSearchHighlights.push(highlight);
        }
      });
    }, 100);
  }

  async handleResize() {
    await this.highlighter?.destroyHighlights(HighlightType.Search);
    this.drawSearch();
  }

  jumpToMark(index: number) {
    setTimeout(() => {
      if (this.currentChapterSearchResult.length) {
        var current = this.currentChapterSearchResult[index];
        this.currentSearchHighlights.forEach((highlight) => {
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
        this.highlighter?.setAndResetSearchHighlight(
          current.highlight,
          this.currentSearchHighlights
        );

        this.delegate.view?.goToCssSelector(
          current.rangeInfo.startContainerElementCssSelector
        );
        this.delegate.updatePositionInfo();
      }
    }, 200);
  }

  paginate(items: Array<any>, page: number, per_page: number) {
    let _page = page || 1,
      _per_page = per_page || 10,
      offset = (_page - 1) * _per_page,
      paginatedItems = items.slice(offset).slice(0, _per_page),
      total_pages = Math.ceil(items.length / _per_page);
    return {
      page: _page,
      per_page: _per_page,
      pre_page: _page - 1 ? _page - 1 : undefined,
      next_page: total_pages > _page ? _page + 1 : undefined,
      total: items.length,
      total_pages: total_pages,
      data: paginatedItems,
    };
  }
}
