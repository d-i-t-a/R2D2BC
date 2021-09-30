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

export interface PageBreakModuleConfig {
  delegate: IFrameNavigator;
}

export default class PageBreakModule implements ReaderModule {
  private delegate: IFrameNavigator;

  public static async create(config: PageBreakModuleConfig) {
    const pageBreak = new this(config.delegate);
    await pageBreak.start();
    return pageBreak;
  }

  private constructor(delegate: IFrameNavigator) {
    this.delegate = delegate;
  }

  async stop() {
    if (IS_DEV) {
      console.log("Page Break module stop");
    }
  }

  protected async start(): Promise<void> {
    this.delegate.pageBreakModule = this;
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
