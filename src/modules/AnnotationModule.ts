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
import { Link } from "../model/Link";

export type Highlight = (highlight: Annotation) => Promise<Annotation>;

export interface AnnotationModuleAPI {
  addAnnotation: Highlight;
  deleteAnnotation: Highlight;
  selectedAnnotation: Highlight;
}
export interface AnnotationModuleProperties {
  initialAnnotationColor: string;
}

export interface AnnotationModuleConfig extends AnnotationModuleProperties {
  annotator: Annotator;
  headerMenu: HTMLElement;
  rights: ReaderRights;
  publication: Publication;
  delegate: IFrameNavigator;
  initialAnnotations?: any;
  api: AnnotationModuleAPI;
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
  properties: AnnotationModuleProperties;
  api: AnnotationModuleAPI;

  public static async create(config: AnnotationModuleConfig) {
    const annotations = new this(
      config.annotator,
      config.headerMenu,
      config.rights || { enableAnnotations: false, enableTTS: false },
      config.publication,
      config.delegate,
      config.initialAnnotations || null,
      config as AnnotationModuleProperties,
      config.api,
      config.highlighter
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
    properties: AnnotationModuleProperties | null = null,
    api: AnnotationModuleAPI | null = null,
    highlighter: TextHighlighter
  ) {
    this.annotator = annotator;
    this.rights = rights;
    this.publication = publication;
    this.headerMenu = headerMenu;
    this.delegate = delegate;
    this.initialAnnotations = initialAnnotations;
    this.highlighter = highlighter;
    this.properties = properties;
    this.api = api;
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
      if (this.rights?.enableAnnotations) {
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
      this.delegate.iframes[0].contentWindow as any
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
      if (this.delegate.rights?.enableMaterial) {
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
    if (this.api?.deleteAnnotation) {
      this.api?.deleteAnnotation(highlight).then(async () => {
        this.deleteLocalHighlight(highlight.id);
      });
    } else {
      this.deleteLocalHighlight(highlight.id);
    }
  }

  public async deleteSelectedHighlight(highlight: Annotation): Promise<any> {
    if (this.api?.deleteAnnotation) {
      this.api.deleteAnnotation(highlight).then(async () => {
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
        this.delegate.iframes[0].contentDocument,
        "body"
      ) as HTMLBodyElement;
      const progression = highlight.position
        ? highlight.position / body.scrollHeight
        : bookmarkPosition;
      const id: string = uuid();
      let annotation: Annotation;
      if (
        ((this.rights?.autoGeneratePositions ?? true) &&
          this.publication.positions) ||
        this.publication.positions
      ) {
        const chptHref: string = this.delegate.currentChapterLink.href;
        const positions = this.publication.positionsByHref(chptHref);
        const positionIndex = Math.ceil(progression * (positions.length - 1));
        const locator = positions[positionIndex];

        annotation = {
          ...locator,
          id: id,
          href: tocItem.Href,
          created: new Date(),
          title: this.delegate.currentChapterLink.title,
          highlight: highlight,
          color: this.highlighter.getColor(),
          marker: marker,
          text: {
            highlight: highlight.selectionInfo.cleanText,
          },
        };
      } else {
        annotation = {
          id: id,
          href: tocItem.Href,
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
      }

      if (this.api?.addAnnotation) {
        this.api.addAnnotation(annotation).then(async (result) => {
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
    if (this.rights?.enableAnnotations && this.highlighter) {
      if (this.api) {
        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = (await this.annotator.getAnnotations()) as Array<any>;
        }
        if (
          this.highlighter &&
          highlights &&
          this.delegate.iframes[0].contentDocument.readyState === "complete"
        ) {
          await this.highlighter.destroyAllhighlights(
            this.delegate.iframes[0].contentDocument
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

            if (annotation.href === tocItem.Href) {
              this.highlighter.setColor(annotation.color);

              await this.highlighter.createHighlightDom(
                this.delegate.iframes[0].contentWindow as any,
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
          this.delegate.iframes[0].contentDocument.readyState === "complete"
        ) {
          await this.highlighter.destroyAllhighlights(
            this.delegate.iframes[0].contentDocument
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

            if (annotation.href === tocItem.Href) {
              this.highlighter.setColor(annotation.color);

              await this.highlighter.createHighlightDom(
                this.delegate.iframes[0].contentWindow as any,
                rangeRepresentation.highlight
              );
            }
          });
        }
      }
      if (this.properties?.initialAnnotationColor) {
        this.highlighter.setColor(this.properties?.initialAnnotationColor);
      }
    }
    if (search && this.rights?.enableSearch) {
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
                      marker.style.backgroundColor = (
                        locator as Annotation
                      ).color;
                    }
                  }
                  title.appendChild(marker);
                  bookmarkLink.appendChild(title);

                  let subtitle: HTMLSpanElement =
                    document.createElement("span");
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
