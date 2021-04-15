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
import Publication, { Link } from "../model/Publication";
import TextHighlighter, { _highlights } from "./highlight/TextHighlighter";
import ReaderModule from "./ReaderModule";
import { addEventListenerOptional } from "../utils/EventHandler";
import { IHighlight } from "./highlight/common/highlight";
import {
  Annotation,
  AnnotationMarker,
  Bookmark,
  Locator,
} from "../model/Locator";
import { IS_DEV } from "..";
import { toast } from "materialize-css";
import { icons as IconLib } from "../utils/IconLib";
import { v4 as uuid } from "uuid";
import { oc } from "ts-optchain";

export type Highlight = (highlight: Annotation) => Promise<Annotation>;

export interface AnnotationModuleAPI {
  addAnnotation: Highlight;
  deleteAnnotation: Highlight;
  selectedAnnotation: Highlight;
}
export interface AnnotationModuleConfig {
  initialAnnotationColor: string;
  api: AnnotationModuleAPI;
}

export interface AnnotationModuleProperties {
  annotator: Annotator;
  headerMenu: HTMLElement;
  rights: ReaderRights;
  publication: Publication;
  delegate: IFrameNavigator;
  initialAnnotations?: any;
  config: AnnotationModuleConfig;
  highlighter: TextHighlighter;
}

export default class AnnotationModule implements ReaderModule {
  private readonly annotator: Annotator | null;
  private rights: ReaderRights;
  private publication: Publication;
  private highlightsView: HTMLDivElement;
  private readonly headerMenu: HTMLElement;
  private readonly highlighter: TextHighlighter;
  private readonly initialAnnotations: any;
  private delegate: IFrameNavigator;
  config: AnnotationModuleConfig;

  public static async create(properties: AnnotationModuleProperties) {
    const annotations = new this(
      properties.annotator,
      properties.headerMenu,
      properties.rights || { enableAnnotations: false, enableTTS: false },
      properties.publication,
      properties.delegate,
      properties.initialAnnotations || null,
      properties.config,
      properties.highlighter
    );
    await annotations.start();
    return annotations;
  }

  public constructor(
    annotator: Annotator,
    headerMenu: HTMLElement,
    rights: ReaderRights,
    publication: Publication,
    delegate: IFrameNavigator,
    initialAnnotations: any | null = null,
    config: AnnotationModuleConfig | null = null,
    highlighter: TextHighlighter
  ) {
    this.annotator = annotator;
    this.rights = rights;
    this.publication = publication;
    this.headerMenu = headerMenu;
    this.delegate = delegate;
    this.initialAnnotations = initialAnnotations;
    this.highlighter = highlighter;
    this.config = config;
  }

  async stop() {
    if (IS_DEV) {
      console.log("Annotation module stop");
    }
  }

  protected async start(): Promise<void> {
    this.delegate.annotationModule = this;

    if (this.headerMenu)
      this.highlightsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-highlights"
      ) as HTMLDivElement;

    if (this.initialAnnotations) {
      var highlights = this.initialAnnotations["highlights"] || null;
      if (highlights) {
        this.annotator.initAnnotations(highlights);
      }
    }
  }

  handleResize() {
    setTimeout(() => {
      this.drawHighlights();
    }, 10);
  }

  initialize() {
    return new Promise(async (resolve) => {
      await (document as any).fonts.ready;
      if (oc(this.rights).enableAnnotations(false)) {
        setTimeout(() => {
          this.drawHighlights();
        }, 300);
      }
      resolve(null);
    });
  }

  async scrollToHighlight(id: any): Promise<any> {
    if (IS_DEV) {
      console.log("still need to scroll to " + id);
    }
    var position = await this.annotator.getAnnotationPosition(
      id,
      this.delegate.iframe.contentWindow as any
    );
    window.scrollTo(0, position - window.innerHeight / 3);
  }

  async deleteLocalHighlight(id: any): Promise<any> {
    if (this.annotator) {
      var deleted = await this.annotator.deleteAnnotation(id);

      if (IS_DEV) {
        console.log("Highlight deleted " + JSON.stringify(deleted));
      }
      await this.showHighlights();
      await this.drawHighlights();
      if (oc(this.delegate.rights).enableMaterial(false)) {
        toast({ html: "highlight deleted" });
      }
      return deleted;
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  public async deleteAnnotation(highlight: Annotation): Promise<any> {
    this.deleteLocalHighlight(highlight.id);
  }
  public async addAnnotation(highlight: Annotation): Promise<any> {
    await this.annotator.saveAnnotation(highlight);
    await this.showHighlights();
    await this.drawHighlights();
  }

  public async deleteHighlight(highlight: Annotation): Promise<any> {
    if (this.config.api && this.config.api.deleteAnnotation) {
      this.config.api.deleteAnnotation(highlight).then(async () => {
        this.deleteLocalHighlight(highlight.id);
      });
    } else {
      this.deleteLocalHighlight(highlight.id);
    }
  }

  public async deleteSelectedHighlight(highlight: Annotation): Promise<any> {
    if (this.config.api && this.config.api.deleteAnnotation) {
      this.config.api.deleteAnnotation(highlight).then(async () => {
        this.deleteLocalHighlight(highlight.id);
      });
    } else {
      this.deleteLocalHighlight(highlight.id);
    }
  }

  public async saveAnnotation(
    highlight: IHighlight,
    marker: AnnotationMarker
  ): Promise<any> {
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
        this.delegate.iframe.contentDocument,
        "body"
      ) as HTMLBodyElement;
      const progression = highlight.position
        ? highlight.position / body.scrollHeight
        : bookmarkPosition;
      const id: string = uuid();

      const annotation: Annotation = {
        id: id,
        href: tocItem.href,
        locations: {
          progression: progression,
        },
        created: new Date(),
        type: this.delegate.currentChapterLink.type,
        title: this.delegate.currentChapterLink.title,
        highlight: highlight,
        color: this.highlighter.getColor(),
        marker: marker,
        text: {
          highlight: highlight.selectionInfo.cleanText,
        },
      };
      if (this.config.api && this.config.api.addAnnotation) {
        this.config.api.addAnnotation(annotation).then(async (result) => {
          annotation.id = result.id;
          var saved = await this.annotator.saveAnnotation(annotation);
          await this.showHighlights();
          await this.drawHighlights();
          return saved;
        });
      } else {
        var saved = await this.annotator.saveAnnotation(annotation);
        await this.showHighlights();
        await this.drawHighlights();
        return saved;
      }
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  async getAnnotations(): Promise<any> {
    let highlights: Array<any> = [];
    if (this.annotator) {
      highlights = (await this.annotator.getAnnotations()) as Array<any>;
    }
    return highlights;
  }

  public async showHighlights(): Promise<void> {
    let highlights: Array<any> = [];
    if (this.annotator) {
      highlights = (await this.annotator.getAnnotations()) as Array<any>;
      if (highlights) {
        highlights.forEach((rangeRepresentation) => {
          rangeRepresentation.highlight.marker = rangeRepresentation.marker;
          _highlights.push(rangeRepresentation.highlight);
        });
      }
    }
    if (this.highlightsView)
      this.createTree(
        AnnotationType.Annotation,
        highlights,
        this.highlightsView
      );
  }

  async drawHighlights(search: boolean = true): Promise<void> {
    if (oc(this.rights).enableAnnotations(false) && this.highlighter) {
      if (this.config.api) {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.highlighter &&
          highlights &&
          this.delegate.iframe.contentDocument.readyState === "complete"
        ) {
          await this.highlighter.destroyAllhighlights(
            this.delegate.iframe.contentDocument
          );

          highlights.forEach(async (rangeRepresentation) => {
            rangeRepresentation.highlight.marker = rangeRepresentation.marker;

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

            if (annotation.href === tocItem.href) {
              this.highlighter.setColor(annotation.color);

              await this.highlighter.createHighlightDom(
                this.delegate.iframe.contentWindow as any,
                rangeRepresentation.highlight
              );
            }
          });
        }
      } else {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.highlighter &&
          highlights &&
          this.delegate.iframe.contentDocument.readyState === "complete"
        ) {
          await this.highlighter.destroyAllhighlights(
            this.delegate.iframe.contentDocument
          );

          highlights.forEach(async (rangeRepresentation) => {
            rangeRepresentation.highlight.marker = rangeRepresentation.marker;

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

            if (annotation.href === tocItem.href) {
              this.highlighter.setColor(annotation.color);

              await this.highlighter.createHighlightDom(
                this.delegate.iframe.contentWindow as any,
                rangeRepresentation.highlight
              );
            }
          });
        }
      }
      if (this.config && oc(this.config).initialAnnotationColor !== undefined) {
        this.highlighter.setColor(this.config.initialAnnotationColor);
      }
    }
    if (search && oc(this.rights).enableSearch(false)) {
      this.delegate.searchModule.drawSearch();
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
              linkElement.innerHTML = tocItemAbs.title || "";
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

                this.delegate.stopReadAloud();
                this.delegate.navigate(position);
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
                let bookmarkLink: HTMLAnchorElement = document.createElement(
                  "a"
                );
                bookmarkLink.setAttribute("href", locator.href);

                if (type === AnnotationType.Annotation) {
                  bookmarkLink.className = "highlight-link";
                  let title: HTMLSpanElement = document.createElement("span");
                  let marker: HTMLSpanElement = document.createElement("span");
                  title.className = "title";
                  marker.innerHTML = locator.highlight.selectionInfo.cleanText;

                  if (
                    (locator as Annotation).marker ===
                    AnnotationMarker.Underline
                  ) {
                    if (typeof (locator as Annotation).color === "object") {
                      marker.style.setProperty(
                        "border-bottom",
                        `2px solid ${TextHighlighter.hexToRgbA(
                          (locator as Annotation).color
                        )}`,
                        "important"
                      );
                    } else {
                      marker.style.setProperty(
                        "border-bottom",
                        `2px solid ${(locator as Annotation).color}`,
                        "important"
                      );
                    }
                  } else {
                    if (typeof (locator as Annotation).color === "object") {
                      marker.style.backgroundColor = TextHighlighter.hexToRgbA(
                        (locator as Annotation).color
                      );
                    } else {
                      marker.style.backgroundColor = (locator as Annotation).color;
                    }
                  }
                  title.appendChild(marker);
                  bookmarkLink.appendChild(title);

                  let subtitle: HTMLSpanElement = document.createElement(
                    "span"
                  );
                  let formattedProgression =
                    Math.round(locator.locations.progression!! * 100) +
                    "% " +
                    "through resource";
                  subtitle.className = "subtitle";
                  subtitle.innerHTML = formattedProgression;
                  bookmarkLink.appendChild(subtitle);
                }

                let timestamp: HTMLSpanElement = document.createElement("span");
                timestamp.className = "timestamp";
                timestamp.innerHTML = AnnotationModule.readableTimestamp(
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
                    oc(self.delegate.rights).enableMaterial(false)) ||
                  !oc(self.delegate.rights).enableMaterial(false)
                ) {
                  let bookmarkDeleteLink: HTMLElement = document.createElement(
                    "button"
                  );
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
            if (link.children && link.children.length > 0) {
              createAnnotationTree(parentElement, link.children);
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
        console.log("annotation data missing: ", event);
      }
    }
  }

  private handleAnnotationLinkDeleteClick(
    type: AnnotationType,
    event: MouseEvent,
    locator: any
  ): void {
    if (IS_DEV) {
      console.log("annotation data locator: ", locator);
    }
    if (locator) {
      if (type === AnnotationType.Annotation) {
        this.deleteHighlight(locator);
      }
    } else {
      if (IS_DEV) {
        console.log("annotation data missing: ", event);
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
}
