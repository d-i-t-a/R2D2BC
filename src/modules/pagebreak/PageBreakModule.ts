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

import { IS_DEV } from "../..";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import ReaderModule from "../ReaderModule";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import { convertRange } from "../highlight/renderer/iframe/selection";
import { HighlightType } from "../highlight/common/highlight";
import { _getCssSelectorOptions } from "../highlight/common/selection";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { Publication } from "../../model/Publication";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { Link } from "../../model/Link";
import { Locations, Locator } from "../../model/Locator";

export interface PageBreakModuleConfig {
  delegate: IFrameNavigator;
  headerMenu: HTMLElement;
  publication: Publication;
}

export default class PageBreakModule implements ReaderModule {
  private delegate: IFrameNavigator;
  private readonly headerMenu: HTMLElement;
  private publication: Publication;

  private goToPageView: HTMLLIElement;
  private goToPageNumberInput: HTMLInputElement;
  private goToPageNumberButton: HTMLButtonElement;

  public static async create(config: PageBreakModuleConfig) {
    const pageBreak = new this(
      config.headerMenu,
      config.delegate,
      config.publication
    );
    await pageBreak.start();
    return pageBreak;
  }

  private constructor(
    headerMenu: HTMLElement,
    delegate: IFrameNavigator,
    publication: Publication
  ) {
    this.headerMenu = headerMenu;
    this.delegate = delegate;
    this.publication = publication;
  }

  async stop() {
    if (IS_DEV) {
      console.log("Page Break module stop");
    }
  }

  protected async start(): Promise<void> {
    this.delegate.pageBreakModule = this;

    if (this.headerMenu)
      this.goToPageView = HTMLUtilities.findElement(
        this.headerMenu,
        "#sidenav-section-gotopage"
      ) as HTMLLIElement;
    if (this.headerMenu)
      this.goToPageNumberInput = HTMLUtilities.findElement(
        this.headerMenu,
        "#goToPageNumberInput"
      ) as HTMLInputElement;
    if (this.headerMenu)
      this.goToPageNumberButton = HTMLUtilities.findElement(
        this.headerMenu,
        "#goToPageNumberButton"
      ) as HTMLButtonElement;

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
        this.goToPageView.parentElement.removeChild(this.goToPageView);
      }
    }
  }
  private async goToPageNumber(event: any): Promise<any> {
    if (
      this.goToPageNumberInput.value &&
      (event.key === "Enter" || event.type === "click")
    ) {
      var filteredPages = this.publication.pageList.filter(
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

        this.delegate.goTo(position);
      }
    }
  }

  async handleResize() {
    await this.delegate.highlighter.destroyHighlights(HighlightType.PageBreak);
    await this.drawPageBreaks();
  }

  async drawPageBreaks() {
    setTimeout(() => {
      const body = this.delegate.iframes[0].contentDocument.body;
      let pageBreaks = body.querySelectorAll('[*|type="pagebreak"]');
      let self = this;

      function getCssSelector(element: Element): string {
        try {
          return uniqueCssSelector(
            element,
            self.delegate.iframes[0].contentDocument,
            _getCssSelectorOptions
          );
        } catch (err) {
          console.log("uniqueCssSelector:");
          console.log(err);
          return "";
        }
      }

      for (let i = 0; i < pageBreaks.length; i++) {
        let img = pageBreaks[i] as HTMLElement;
        if (IS_DEV) console.log(img);

        let title = img.innerHTML;
        let hide = false;
        if (img.innerHTML.length === 0) {
          title = img.getAttribute("title");
          img.innerHTML = title;
          hide = true;
        }

        const range = this.delegate.highlighter
          .dom(this.delegate.iframes[0].contentDocument.body)
          .getWindow()
          .document.createRange();
        const selection = this.delegate.highlighter
          .dom(this.delegate.iframes[0].contentDocument.body)
          .getSelection();
        selection.removeAllRanges();
        range.selectNodeContents(img);
        selection.addRange(range);

        const rangeInfo = convertRange(range, getCssSelector);
        selection.removeAllRanges();

        this.delegate.highlighter.createPageBreakHighlight(
          {
            rangeInfo: rangeInfo,
            cleanText: "",
            rawText: "",
            range: undefined,
          },
          title
        );

        if (hide) {
          img.innerHTML = "";
        }
      }
    }, 200);
  }
}
