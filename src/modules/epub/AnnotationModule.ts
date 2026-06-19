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
import { Publication } from "../../model/v3";
import {
  TextHighlighter,
  _highlights,
  CLASS_HIGHLIGHT_AREA,
  HighlightContainer,
} from "../highlight/TextHighlighter";
import { ReaderModule, HostType, RightsKey } from "../ReaderModule";
import { IAnnotationModule } from "../interfaces";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { HighlightType, IHighlight } from "../highlight/common/highlight";
import {
  Annotation,
  AnnotationMarker,
  Bookmark,
  Locator,
} from "../../model/v3";
import { icons as IconLib, iconTemplateColored } from "../../utils/IconLib";
import { v4 as uuid } from "uuid";
import { Link } from "../../model/v3";
import { convertRange } from "../highlight/renderer/iframe/selection";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import {
  _getCssSelectorOptions,
  ISelectionInfo,
} from "../highlight/common/selection";
import * as lodash from "lodash";
import log from "loglevel";
import { Action } from "./ConsumptionModule";
import { ReaderEvent } from "../../utils/Events";

export type Highlight = (highlight: Annotation) => Promise<Annotation>;

export interface AnnotationModuleAPI {
  addAnnotation: Highlight;
  deleteAnnotation: Highlight;
  updateAnnotation: Highlight;
  selectedAnnotation: Highlight;
  addCommentToAnnotation: Highlight;
}
export interface AnnotationModuleProperties {
  initialAnnotationColor?: string;
  hideLayer?: boolean;
  enableComments?: boolean;
}

export interface AnnotationModuleConfig extends AnnotationModuleProperties {
  annotator: Annotator;
  headerMenu?: HTMLElement | null;
  publication: Publication;
  initialAnnotations?: InitialAnnotations;
  api?: AnnotationModuleAPI;
  highlighter: TextHighlighter;
}

export class AnnotationModule
  implements ReaderModule<EpubModuleHost>, IAnnotationModule<EpubModuleHost>
{
  readonly name = NavigatorFeature.Annotations;
  readonly hostType = HostType.Epub;
  readonly rightsKey = RightsKey.Annotations;
  readonly annotator: Annotator | null;
  private publication: Publication;
  private highlightsView: HTMLDivElement;
  private commentGutter?: HTMLDivElement | null;
  private readonly headerMenu?: HTMLElement | null;
  private readonly highlighter?: TextHighlighter;
  private readonly initialAnnotations?: InitialAnnotations;
  private host!: EpubModuleHost;
  attach(host: EpubModuleHost): void {
    this.host = host;
  }
  properties?: AnnotationModuleProperties;
  api?: AnnotationModuleAPI;
  activeAnnotationMarkerId?: string;
  activeAnnotationMarkerPosition?: string;

  public static async create(config: AnnotationModuleConfig) {
    const annotations = new this(
      config.annotator,
      config.publication,
      config.initialAnnotations || null,
      config as AnnotationModuleProperties,
      config.highlighter,
      config.api,
      config.headerMenu
    );
    await annotations.start();
    return annotations;
  }

  public constructor(
    annotator: Annotator,
    publication: Publication,
    initialAnnotations: any,
    properties: AnnotationModuleProperties,
    highlighter: TextHighlighter,
    api?: AnnotationModuleAPI,
    headerMenu?: HTMLElement | null
  ) {
    this.annotator = annotator;
    this.publication = publication;
    this.headerMenu = headerMenu;
    this.initialAnnotations = initialAnnotations;
    this.highlighter = highlighter;
    this.properties = properties;
    this.api = api;
  }

  async stop() {
    log.log("Annotation module stop");
  }

  protected async start(): Promise<void> {
    if (this.headerMenu)
      this.highlightsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-highlights"
      ) as HTMLDivElement;

    // When the integrator supplies initialAnnotations, treat it as the
    // canonical source of truth and overwrite local storage — even if
    // `.highlights` is empty/missing. Otherwise a previous user's
    // highlights stored in LocalStorage on the same browser bleed
    // through to the next user (multi-user shared-device scenario).
    if (this.initialAnnotations) {
      this.annotator?.initAnnotations(this.initialAnnotations.highlights ?? []);
    }

    setTimeout(() => {
      this.properties?.hideLayer
        ? this.host.hideLayer("highlights")
        : this.host.showLayer("highlights");
    }, 10);
  }
  private hide: HTMLLinkElement = HTMLUtilities.findElement(
    document,
    "#menu-button-hide"
  );
  private show: HTMLLinkElement = HTMLUtilities.findElement(
    document,
    "#menu-button-show"
  );

  hideAnnotationLayer() {
    let doc = this.host.iframes[0].contentDocument;
    if (doc) {
      const container = HTMLUtilities.findElement(
        doc,
        "#R2_ID_HIGHLIGHTS_CONTAINER"
      );
      if (container) {
        container.style.display = "none";
      }
    }
    if (this.show && this.hide) {
      this.show.style.display = "block";
      this.hide.style.display = "none";
    }
  }
  showAnnotationLayer() {
    let doc = this.host.iframes[0].contentDocument;
    if (doc) {
      const container = HTMLUtilities.findElement(
        doc,
        "#R2_ID_HIGHLIGHTS_CONTAINER"
      );
      if (container) {
        container.style.display = "block";
      }
    }
    if (this.show && this.hide) {
      this.show.style.display = "none";
      this.hide.style.display = "block";
    }
  }

  async handleResize() {
    setTimeout(async () => {
      await this.drawHighlights();
      await this.showHighlights();
    }, 200);
  }

  initialize(iframe: HTMLIFrameElement) {
    return new Promise(async (resolve) => {
      await (document as any).fonts.ready;
      if (this.host.rights.enableAnnotations) {
        setTimeout(() => {
          this.drawHighlights();
          this.showHighlights();
          addEventListenerOptional(
            iframe.contentDocument?.body,
            "click",
            this.click.bind(this)
          );
        }, 300);
      }
      resolve(null);
    });
  }

  private click(_event: KeyboardEvent | MouseEvent | TouchEvent): void {
    if (this.activeAnnotationMarkerId) {
      let menuItems = this.highlighter?.properties?.selectionMenuItems?.filter(
        (menuItem) => menuItem.id === this.activeAnnotationMarkerId
      );
      if (menuItems && menuItems?.length > 0) {
        let menuItem = lodash.cloneDeep(menuItems[0]);
        menuItem.marker = AnnotationMarker.Custom;
        if (this.activeAnnotationMarkerPosition && menuItem.icon) {
          menuItem.icon.position = this.activeAnnotationMarkerPosition;
        }
        // menuItem.icon?.svgPath = `<path d="M4,16v6h16v-6c0-1.1-0.9-2-2-2H6C4.9,14,4,14.9,4,16z M18,18H6v-2h12V18z M12,2C9.24,2,7,4.24,7,7l5,7l5-7 C17,4.24,14.76,2,12,2z M12,11L9,7c0-1.66,1.34-3,3-3s3,1.34,3,3L12,11z"/>`;
        // menuItem.icon?.color = `#dc491d`;
        // menuItem.highlight?.color = `#dc491d`;
        if (menuItem.highlight?.style) {
          menuItem.highlight.style.default = undefined;
          menuItem.highlight.style.hover = undefined;
        }
        let doc = this.host.iframes[0].contentDocument;
        if (doc) {
          const selection = this.highlighter?.dom(doc.body).getSelection();
          let range = selection.getRangeAt(0);
          let node = selection.anchorNode;
          range.setStart(node, range.startOffset);
          range.setEnd(node, range.endOffset + 1);
          selection.removeAllRanges();
          selection.addRange(range);

          let self = this;

          function getCssSelector(element: Element): string {
            try {
              let doc = self.host.iframes[0].contentDocument;
              if (doc) {
                return uniqueCssSelector(element, doc, _getCssSelectorOptions);
              } else {
                return "";
              }
            } catch (err) {
              log.log("uniqueCssSelector:");
              log.error(err);
              return "";
            }
          }

          const rangeInfo = convertRange(range, getCssSelector);
          selection.removeAllRanges();
          if (rangeInfo) {
            let selectionInfo: ISelectionInfo = {
              rangeInfo: rangeInfo,
            };

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
            if (book) {
              this.saveAnnotation(book[0]).then((anno) => {
                log.log("saved bookmark " + anno.id);
              });
            }
          }
          doc.getSelection()?.removeAllRanges();
        }
      }
    }
  }

  async scrollToHighlight(id: any): Promise<any> {
    log.log("still need to scroll to " + id);
    var element = await this.annotator?.getAnnotationElement(
      id,
      this.host.iframes[0].contentWindow as any
    );
    element?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }

  async updateLocalHighlight(annotation: Annotation): Promise<any> {
    if (this.annotator && annotation.id) {
      let deleted = await this.annotator.deleteAnnotation(annotation.id);
      let added = await this.addAnnotation(annotation);

      log.log("Highlight deleted " + JSON.stringify(deleted));
      log.log("Highlight added " + JSON.stringify(added));
      await this.showHighlights();
      await this.drawHighlights();
      return added;
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  async deleteLocalHighlight(id: any): Promise<any> {
    if (this.annotator) {
      var deleted = await this.annotator.deleteAnnotation(id);

      log.log("Highlight deleted " + JSON.stringify(deleted));
      await this.showHighlights();
      await this.drawHighlights();
      return deleted;
    } else {
      return new Promise<any>((resolve) => resolve(null));
    }
  }

  public async deleteAnnotation(highlight: Annotation): Promise<any> {
    await this.deleteLocalHighlight(highlight.id);
    this.host.emit(ReaderEvent.AnnotationDeleted, highlight);
  }
  public async addAnnotation(highlight: Annotation): Promise<any> {
    await this.annotator?.saveAnnotation(highlight);
    this.host.emit(ReaderEvent.AnnotationCreated, highlight);
    await this.showHighlights();
    await this.drawHighlights();
  }

  public async deleteHighlight(highlight: Annotation): Promise<any> {
    if (this.api?.deleteAnnotation) {
      this.api?.deleteAnnotation(highlight).then(async () => {
        this.deleteLocalHighlight(highlight.id);
        this.host.emit(ReaderEvent.AnnotationDeleted, highlight);
      });
    } else {
      this.deleteLocalHighlight(highlight.id);
      this.host.emit(ReaderEvent.AnnotationDeleted, highlight);
    }
  }

  public async deleteSelectedHighlight(highlight: Annotation): Promise<any> {
    if (this.api?.deleteAnnotation) {
      this.api.deleteAnnotation(highlight).then(async () => {
        this.deleteLocalHighlight(highlight.id);
        this.host.emit(ReaderEvent.AnnotationDeleted, highlight);
      });
    } else {
      this.deleteLocalHighlight(highlight.id);
      this.host.emit(ReaderEvent.AnnotationDeleted, highlight);
    }
  }

  public async updateAnnotation(highlight: Annotation): Promise<any> {
    if (this.api?.updateAnnotation) {
      this.api.updateAnnotation(highlight).then(async () => {
        this.updateLocalHighlight(highlight);
        this.host.emit(ReaderEvent.AnnotationUpdated, highlight);
      });
    } else {
      this.updateLocalHighlight(highlight);
      this.host.emit(ReaderEvent.AnnotationUpdated, highlight);
    }
  }

  public async saveAnnotation(highlight: IHighlight): Promise<Annotation> {
    if (this.annotator) {
      var tocItem = this.publication.getTOCItem(
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
            ?.trackAction(annotation, Action.HighlightCreated);
          if (this.api?.addAnnotation) {
            try {
              let result = await this.api.addAnnotation(annotation);
              const saved = await this.annotator.saveAnnotation(result);
              this.host.emit(ReaderEvent.AnnotationCreated, saved);
              await this.showHighlights();
              await this.drawHighlights();
              return new Promise<Annotation>((resolve) => resolve(saved));
            } catch (error) {
              await this.showHighlights();
              await this.drawHighlights();
            }
          } else {
            const saved = await this.annotator.saveAnnotation(annotation);
            this.host.emit(ReaderEvent.AnnotationCreated, saved);
            await this.showHighlights();
            await this.drawHighlights();
            return new Promise<Annotation>((resolve) => resolve(saved));
          }
        }
      }
    }
    return new Promise<any>((resolve) => resolve(null));
  }

  getAnnotations(): any {
    let highlights: Array<any> = [];
    if (this.annotator) {
      highlights = this.annotator.getAnnotations() as Array<any>;
    }
    return highlights;
  }

  public showHighlights() {
    let highlights: Array<any> = [];
    if (this.annotator) {
      highlights = this.annotator.getAnnotations() as Array<any>;
      if (highlights) {
        highlights = highlights.filter(
          (rangeRepresentation) =>
            rangeRepresentation.highlight.marker !== AnnotationMarker.Bookmark
        );

        highlights.forEach((rangeRepresentation) => {
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

  async drawHighlights(): Promise<void> {
    if (this.host.rights.enableAnnotations && this.highlighter) {
      if (this.api) {
        let highlights: Array<any> = [];
        const locator = this.host.currentLocator();
        if (this.annotator && locator?.href) {
          highlights = this.annotator.getAnnotationsByChapter(
            locator.href
          ) as Array<any>;
        }
        if (
          this.highlighter &&
          highlights &&
          this.host.iframes[0].contentDocument?.readyState === "complete"
        ) {
          await this.highlighter.destroyHighlights(HighlightType.Annotation);

          for (const rangeRepresentation of highlights) {
            _highlights.push(rangeRepresentation.highlight);

            const annotation: Annotation = rangeRepresentation;

            let currentLocation = this.host.currentChapterLink.href;

            var tocItem = this.publication.getTOCItem(currentLocation);
            if (this.host.currentTocUrl !== undefined) {
              tocItem = this.publication.getTOCItem(this.host.currentTocUrl);
            }

            if (tocItem === null) {
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
                await this.highlighter.createHighlightDom(
                  this.host.iframes[0].contentWindow as any,
                  rangeRepresentation.highlight
                );

                setTimeout(async () => {
                  if (
                    annotation.highlight?.marker === AnnotationMarker.Underline
                  ) {
                    const position =
                      await this.annotator?.getAnnotationPosition(
                        rangeRepresentation.id,
                        this.host.iframes[0].contentWindow as any
                      );

                    const commentTemplate =
                      `<div class="comment" style="top: ` +
                      position +
                      `px;width:20px"></div>`;

                    let comment: HTMLDivElement = document.createElement("div");
                    comment.innerHTML = commentTemplate;
                    let div = comment.childNodes[0] as HTMLDivElement;
                    let icon: HTMLElement = document.createElement("i");
                    icon.innerHTML = "sticky_note_2";
                    icon.className = "material-icons";
                    icon.style.color = annotation.highlight.color;

                    div.appendChild(icon);

                    addEventListenerOptional(
                      comment,
                      "click",
                      (event: MouseEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.scrollToHighlight(annotation.id);
                      }
                    );
                  }
                }, 100);
              }
            }
          }
        }
      } else {
        let highlights: Array<any> = [];
        const locator = this.host.currentLocator();
        if (this.annotator && locator?.href) {
          highlights = this.annotator.getAnnotationsByChapter(
            locator.href
          ) as Array<any>;
        }
        if (
          this.highlighter &&
          highlights &&
          this.host.iframes[0].contentDocument?.readyState === "complete"
        ) {
          await this.highlighter.destroyHighlights(HighlightType.Annotation);

          for (const rangeRepresentation of highlights) {
            _highlights.push(rangeRepresentation.highlight);

            const annotation: Annotation = rangeRepresentation;

            let currentLocation = this.host.currentChapterLink.href;

            let tocItem = this.publication.getTOCItem(currentLocation);
            if (this.host.currentTocUrl) {
              tocItem = this.publication.getTOCItem(this.host.currentTocUrl);
            }

            if (tocItem === null) {
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
                await this.highlighter.createHighlightDom(
                  this.host.iframes[0].contentWindow as any,
                  rangeRepresentation.highlight
                );

                setTimeout(async () => {
                  if (
                    annotation.highlight?.marker === AnnotationMarker.Underline
                  ) {
                    const position =
                      await this.annotator?.getAnnotationPosition(
                        rangeRepresentation.id,
                        this.host.iframes[0].contentWindow as any
                      );

                    const commentTemplate =
                      `<div class="comment" style="top: ` +
                      position +
                      `px;background: ` +
                      annotation.highlight?.color +
                      `;width:20px"></div>`;

                    let comment: HTMLDivElement = document.createElement("div");
                    comment.innerHTML = commentTemplate;
                    (comment.childNodes[0] as HTMLDivElement).innerHTML =
                      IconLib.note;
                    addEventListenerOptional(
                      comment,
                      "click",
                      (event: MouseEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.scrollToHighlight(annotation.id);
                      }
                    );
                  }
                }, 100);
              }
            }
          }
        }
      }
      if (this.properties?.initialAnnotationColor) {
        this.highlighter.setColor(this.properties?.initialAnnotationColor);
      }
      this.repositionGutters();
    }
  }

  repositionGutters(): any {
    let doc = this.host.iframes[0].contentDocument;
    if (doc) {
      this.commentGutter = doc.getElementById(
        HighlightContainer.R2_ID_GUTTER_RIGHT_CONTAINER
      ) as HTMLDivElement;
      if (this.host.view?.isScrollMode() && this.properties?.enableComments) {
        this.commentGutter?.style.removeProperty("display");
      } else {
        this.commentGutter?.style.setProperty("display", "none");
      }
      if (
        this.commentGutter &&
        this.host.view?.isScrollMode() &&
        this.properties?.enableComments
      ) {
        this.commentGutter.innerHTML = "";

        let highlights: Array<any> = [];
        if (this.annotator) {
          highlights = this.annotator.getAnnotationsByChapter(
            this.host.currentLocator().href
          ) as Array<any>;
          if (highlights) {
            highlights = highlights.filter(
              (rangeRepresentation) =>
                rangeRepresentation.highlight?.note?.length > 0
            );
            highlights = this.syncPosition(highlights);
            highlights = this.reposition(highlights);

            highlights.forEach((rangeRepresentation) => {
              let icon: HTMLElement = document.createElement("i");
              icon.innerHTML = "sticky_note_2";
              icon.className = "material-icons";
              icon.style.color = rangeRepresentation.highlight.color;

              let container = doc!.getElementById("R2_ID_HIGHLIGHTS_CONTAINER");
              let highlightArea;
              let highlightIcon;
              if (container) {
                highlightArea = container.querySelector(
                  `#${rangeRepresentation.highlight.id}`
                );
              }

              let nodeList =
                highlightArea.getElementsByClassName(CLASS_HIGHLIGHT_AREA);
              highlightIcon = nodeList[0];

              const size = parseInt(
                highlightIcon.style.height.replace("px", "")
              );

              const position = rangeRepresentation.highlight.position;

              const highlightAreaIcon = doc!.createElement("div");

              highlightAreaIcon.setAttribute(
                "style",
                `position: absolute;top:${
                  // position - size / 2
                  position
                }px;display: flex;max-width: 250px !important;height:${size}px;width: 200px;align-items: center;`
              );

              const iconSpan = doc!.createElement("div");
              highlightAreaIcon.appendChild(iconSpan);

              let color: any = rangeRepresentation.highlight.color;
              if (TextHighlighter.isHexColor(color)) {
                color = TextHighlighter.hexToRgbChannels(color);
              }

              highlightAreaIcon.innerHTML = iconTemplateColored(
                ``,
                ``,
                `<path d="M24 24H0V0h24v24z" fill="none"/><circle cx="12" cy="12" r="8"/>`,
                `icon open`,
                10,
                `rgba(${color.red}, ${color.green}, ${color.blue}, 1) !important`
              );

              const span = doc!.createElement("div");
              span.innerHTML = rangeRepresentation.highlight?.note;
              span.setAttribute(
                "style",
                `height:${size}px;overflow: hidden;padding-left: 5px;`
              );

              highlightAreaIcon.appendChild(span);

              addEventListenerOptional(
                highlightAreaIcon,
                "click",
                (event: MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  this.scrollToHighlight(rangeRepresentation.highlight.id);
                }
              );
              this.commentGutter?.appendChild(highlightAreaIcon);
            });
          }
        }
      }
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

                if (type === AnnotationType.Annotation) {
                  bookmarkLink.className = "highlight-link";
                  let title: HTMLSpanElement = document.createElement("span");
                  let marker: HTMLSpanElement = document.createElement("span");
                  title.className = "title";
                  marker.innerHTML = locator.highlight.selectionInfo.cleanText;

                  if (
                    (locator as Annotation).highlight?.marker ===
                    AnnotationMarker.Underline
                  ) {
                    if (
                      typeof (locator as Annotation).highlight?.color ===
                      "object"
                    ) {
                      let color = (locator as Annotation).highlight?.color;
                      if (color) {
                        marker.style.setProperty(
                          "border-bottom",
                          `2px solid ${TextHighlighter.hexToRgbA(color)}`,
                          "important"
                        );
                      }
                    } else {
                      marker.style.setProperty(
                        "border-bottom",
                        `2px solid ${(locator as Annotation).highlight?.color}`,
                        "important"
                      );
                    }
                  } else {
                    if (
                      typeof (locator as Annotation).highlight?.color ===
                      "object"
                    ) {
                      let color = (locator as Annotation).highlight?.color;
                      if (color) {
                        marker.style.backgroundColor =
                          TextHighlighter.hexToRgbA(color);
                      }
                    } else {
                      let color = (locator as Annotation).highlight?.color;
                      if (color) {
                        marker.style.backgroundColor = color;
                      }
                    }
                  }
                  title.appendChild(marker);
                  bookmarkLink.appendChild(title);

                  let subtitle: HTMLSpanElement =
                    document.createElement("span");
                  let formattedProgression =
                    Math.round((locator.locations.progression ?? 0) * 100) +
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
      log.log("annotation data missing: ", event);
    }
  }

  private handleAnnotationLinkDeleteClick(
    type: AnnotationType,
    event: MouseEvent,
    locator: any
  ): void {
    log.log("annotation data locator: ", locator);
    if (locator) {
      if (type === AnnotationType.Annotation) {
        this.deleteHighlight(locator);
      }
    } else {
      log.log("annotation data missing: ", event);
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
  syncPosition(highlights: Array<any>) {
    let doc = this.host.iframes[0].contentDocument;

    const positionAnnotations = (newArray: Array<any>, currentElement: any) => {
      let container = doc!.getElementById("R2_ID_HIGHLIGHTS_CONTAINER");
      let highlightArea;
      let highlightIcon;
      if (container) {
        highlightArea = container.querySelector(
          `#${currentElement.highlight.id}`
        );
      }

      let nodeList = highlightArea.getElementsByClassName(CLASS_HIGHLIGHT_AREA);
      highlightIcon = nodeList[0];

      const newY = parseInt(highlightIcon.style.top.replace("px", ""));

      const updatedAnnotation = {
        ...currentElement,
        highlight: {
          ...currentElement.highlight,
          position: newY,
        },
      };

      return [...newArray, updatedAnnotation];
    };

    return highlights.reduce(positionAnnotations, []);
  }

  reposition(highlights: Array<any>) {
    let doc = this.host.iframes[0].contentDocument;

    const positionAnnotations = (
      newArray: Array<any>,
      currentElement: any,
      currentIndex: number
    ) => {
      const high = highlights[0];

      let container = doc!.getElementById("R2_ID_HIGHLIGHTS_CONTAINER");
      let highlightArea;
      let highlightIcon;
      if (container) {
        highlightArea = container.querySelector(`#${high.highlight.id}`);
      }

      let nodeList = highlightArea.getElementsByClassName(CLASS_HIGHLIGHT_AREA);
      highlightIcon = nodeList[0];

      const size = parseInt(highlightIcon.style.height.replace("px", ""));

      let originY = currentElement.highlight.position;

      const preY =
        newArray[currentIndex - 1] &&
        newArray[currentIndex - 1].highlight.position;

      const preHeight = size;

      const preBottomY = currentIndex === 0 ? 0 : preY + preHeight + 0;
      const newY = preBottomY > originY ? preBottomY : originY;

      const updatedAnnotation = {
        ...currentElement,
        highlight: {
          ...currentElement.highlight,
          position: newY,
        },
      };
      return [...newArray, updatedAnnotation];
    };

    return highlights
      .sort(function (a: any, b: any) {
        return a.highlight.position - b.highlight.position;
      })
      .reduce(positionAnnotations, []);
  }

  // ── IAnnotationModule contract ─────────────────────────────
  getAll(): unknown[] {
    return this.getAnnotations() as unknown[];
  }
  clear(): void {
    // Delegate to the existing annotator-based clear pattern.
    if (!this.annotator) return;
    const highlights = this.annotator.getAnnotations() as Annotation[];
    if (!highlights) return;
    for (const h of highlights) {
      this.deleteAnnotation(h);
    }
  }
}

export function repositionHighlights(highlights: Array<any>) {
  const positionAnnotations = (
    newArray: Array<any>,
    currentElement: any,
    currentIndex: number
  ) => {
    let originY = currentElement.position;

    if (currentElement?.icon?.position === "right") {
    } else {
      originY = 0;
    }

    const preY =
      newArray[currentIndex - 1] && newArray[currentIndex - 1].position;

    const preHeight = newArray[currentIndex - 1] && 24;

    const preBottomY = currentIndex === 0 ? 0 : preY + preHeight + 0;
    const newY =
      preBottomY > originY && currentElement?.icon?.position === "right"
        ? preBottomY
        : originY;

    const updatedAnnotation = {
      ...currentElement,
      position: newY,
    };
    return [...newArray, updatedAnnotation];
  };

  return highlights
    .sort(function (a: any, b: any) {
      return a.position - b.position;
    })
    .reduce(positionAnnotations, []);
}
