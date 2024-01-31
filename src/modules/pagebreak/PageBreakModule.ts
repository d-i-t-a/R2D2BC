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
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: CAST under one or more contributor license agreements.
 */

import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import { convertRange } from "../highlight/renderer/iframe/selection";
import { HighlightType, IHighlight } from "../highlight/common/highlight";
import {
  _getCssSelectorOptions,
  ISelectionInfo,
} from "../highlight/common/selection";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { Link } from "../../model/Link";
import { AnnotationMarker, Locations, Locator } from "../../model/Locator";
import { SHA256 } from "jscrypto/es6/SHA256";
import { _highlights } from "../highlight/TextHighlighter";
import { Publication } from "../../model/Publication";
import log from "loglevel";

export interface PageBreakModuleProperties {
  hideLayer?: boolean;
}

export interface PageBreakModuleConfig extends PageBreakModuleProperties {
  headerMenu?: HTMLElement | null;
  publication: Publication;
}

export class PageBreakModule implements ReaderModule {
  navigator: IFrameNavigator;
  private readonly headerMenu?: HTMLElement | null;
  private publication: Publication;
  private properties: PageBreakModuleProperties;

  private goToPageView: HTMLLIElement;
  private goToPageNumberInput: HTMLInputElement;
  private goToPageNumberButton: HTMLButtonElement;

  public static async create(config: PageBreakModuleConfig) {
    const pageBreak = new this(
      config.publication,
      config as PageBreakModuleProperties,
      config.headerMenu
    );
    await pageBreak.start();
    return pageBreak;
  }

  private constructor(
    publication: Publication,
    properties: PageBreakModuleProperties,
    headerMenu?: HTMLElement | null
  ) {
    this.headerMenu = headerMenu;
    this.publication = publication;
    this.properties = properties;
  }

  async stop() {
    log.log("Page Break module stop");
  }

  protected async start(): Promise<void> {
    if (this.headerMenu)
      this.goToPageView = HTMLUtilities.findElement(
        this.headerMenu,
        "#sidenav-section-gotopage"
      );
    if (this.headerMenu)
      this.goToPageNumberInput = HTMLUtilities.findElement(
        this.headerMenu,
        "#goToPageNumberInput"
      );
    if (this.headerMenu)
      this.goToPageNumberButton = HTMLUtilities.findElement(
        this.headerMenu,
        "#goToPageNumberButton"
      );

    addEventListenerOptional(
      this.goToPageNumberInput,
      "keypress",
      this.goToPageNumber.bind(this)
    );
    addEventListenerOptional(
      this.goToPageNumberButton,
      "click",
      this.goToPageNumber.bind(this)
    );

    if (this.goToPageView) {
      if (this.publication.pageList?.length) {
        //
      } else {
        this.goToPageView.parentElement?.removeChild(this.goToPageView);
      }
    }
    setTimeout(() => {
      this.properties.hideLayer
        ? this.navigator.hideLayer("pagebreak")
        : this.navigator.showLayer("pagebreak");
    }, 10);
  }
  async goToPageNumber(event: any): Promise<any> {
    if (
      this.goToPageNumberInput.value &&
      (event.key === "Enter" || event.type === "click")
    ) {
      var filteredPages = this.publication.pageList?.filter(
        (el: Link) =>
          el.Href.slice(el.Href.indexOf("#") + 1).replace(/[^0-9]/g, "") ===
          this.goToPageNumberInput.value
      );
      if (filteredPages && filteredPages.length > 0) {
        var firstPage = filteredPages[0];
        let locations: Locations = {
          progression: 0,
        };
        if (firstPage.Href.indexOf("#") !== -1) {
          const elementId = firstPage.Href.slice(
            firstPage.Href.indexOf("#") + 1
          );
          if (elementId !== null) {
            locations = {
              fragment: elementId,
            };
          }
        }
        const position: Locator = {
          href: this.publication.getAbsoluteHref(firstPage.Href),
          locations: locations,
          type: firstPage.TypeLink,
          title: firstPage.Title,
        };

        this.navigator.goTo(position);
      }
    }
  }

  async handleResize() {
    await this.navigator.highlighter?.destroyHighlights(
      HighlightType.PageBreak
    );
    await this.drawPageBreaks();
  }

  async drawPageBreaks() {
    setTimeout(() => {
      const body = this.navigator.iframes[0].contentDocument?.body;
      let pageBreaks = body?.querySelectorAll('[*|type="pagebreak"]');
      if (pageBreaks?.length === 0) {
        pageBreaks = body?.querySelectorAll("[epub\\:type='pagebreak']");
      }
      if (pageBreaks?.length === 0) {
        pageBreaks = body?.querySelectorAll("[role='doc-pagebreak']");
      }
      let self = this;

      function getCssSelector(element: Element): string {
        try {
          let doc = self.navigator.iframes[0].contentDocument;
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
      if (pageBreaks) {
        for (let i = 0; i < pageBreaks.length; i++) {
          let img = pageBreaks[i] as HTMLElement;
          log.log(img);

          let title = img.innerHTML;
          let hide = false;
          if (img.innerHTML.length === 0) {
            title = img.getAttribute("title") ?? "";
            img.innerHTML = title;
            hide = true;
          }
          if (img.innerHTML.length === 0) {
            title = (img.getAttribute("id") ?? "").replace(/[^0-9]/g, "");
            img.innerHTML = title;
            hide = true;
          }
          let doc = this.navigator.iframes[0].contentDocument;
          if (doc) {
            const range = this.navigator.highlighter
              ?.dom(doc.body)
              .getWindow()
              .document.createRange();
            const selection = this.navigator.highlighter
              ?.dom(doc.body)
              .getSelection();
            selection.removeAllRanges();
            range.selectNodeContents(img);
            selection.addRange(range);
            if (!selection.isCollapsed) {
              const rangeInfo = convertRange(range, getCssSelector);
              selection.removeAllRanges();
              if (rangeInfo) {
                this.createPageBreakHighlight(
                  {
                    rangeInfo: rangeInfo,
                    cleanText: "",
                    rawText: "",
                  },
                  title
                );
              }
            }
          }
          if (hide) {
            img.innerHTML = "";
          }
        }
      }
    }, 200);
  }

  createPageBreakHighlight(selectionInfo: ISelectionInfo, title: string) {
    try {
      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = "R2_PAGEBREAK_" + sha256Hex;

      var pointerInteraction = false;

      const highlight: IHighlight = {
        color: "#000000",
        id,
        pointerInteraction,
        selectionInfo,
        marker: AnnotationMarker.Custom,
        icon: {
          id: `pageBreak`,
          title: title,
          color: `#000000`,
          position: "left",
        },
        type: HighlightType.PageBreak,
      };
      _highlights.push(highlight);

      let highlightDom = this.navigator.highlighter?.createHighlightDom(
        this.navigator.iframes[0].contentWindow as any,
        highlight
      );
      highlight.position = parseInt(
        (
          (highlightDom?.hasChildNodes()
            ? highlightDom.childNodes[0]
            : highlightDom) as HTMLDivElement
        ).style.top.replace("px", "")
      );
      return highlight;
    } catch (e) {
      throw "Can't create highlight: " + e;
    }
  }
}
