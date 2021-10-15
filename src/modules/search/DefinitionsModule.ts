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
 * Developed on behalf of: CAST (http://www.cast.org) and DITA
 * Licensed to: CAST under one or more contributor license agreements.
 */

import IFrameNavigator from "../../navigator/IFrameNavigator";
import ReaderModule from "../ReaderModule";
import TextHighlighter, {
  CLASS_HIGHLIGHT_AREA,
} from "../highlight/TextHighlighter";
import * as lodash from "lodash";
import { searchDocDomSeek } from "./searchWithDomSeek";
import { HighlightType } from "../highlight/common/highlight";
import Publication from "../../model/Publication";
import { IS_DEV } from "../../utils";

export interface DefinitionsModuleAPI {
  success?: any;
  click?: any;
  visible?: any;
}

export interface Definition {
  order: number;
  terms: [string];
  result?: number;
  definition?: string;
}

export interface DefinitionsModuleProperties {
  definitions: Definition[];
  color?: string;
  api?: DefinitionsModuleAPI;
}

export interface DefinitionsModuleConfig extends DefinitionsModuleProperties {
  api: DefinitionsModuleAPI;
  publication: Publication;
  delegate: IFrameNavigator;
  highlighter: TextHighlighter;
}

export default class DefinitionsModule implements ReaderModule {
  properties: DefinitionsModuleProperties;
  // @ts-ignore
  api: DefinitionsModuleAPI;
  private publication: Publication;
  private delegate: IFrameNavigator;
  private currentChapterPopupResult: any = [];
  private currentPopupHighlights: any = [];
  private highlighter: TextHighlighter;

  public static async create(config: DefinitionsModuleConfig) {
    const search = new this(
      config.delegate,
      config.publication,
      config as DefinitionsModuleProperties,
      config.api,
      config.highlighter
    );

    await search.start();
    return search;
  }

  private constructor(
    delegate: IFrameNavigator,
    publication: Publication,
    properties: DefinitionsModuleProperties,
    api: DefinitionsModuleAPI,
    highlighter: TextHighlighter
  ) {
    this.delegate = delegate;
    this.publication = publication;
    this.properties = properties;
    this.api = api;
    this.highlighter = highlighter;
  }

  async stop() {
    if (IS_DEV) {
      console.log("Definitions module stop");
    }
  }

  protected async start(): Promise<void> {
    this.delegate.definitionsModule = this;
  }

  async searchAndPaint(item: Definition, callback: (result: any) => any) {
    const linkHref = this.publication.getAbsoluteHref(
      this.publication.readingOrder[this.delegate.currentResource()].Href
    );
    let tocItem = this.publication.getTOCItem(linkHref);
    if (tocItem === null) {
      tocItem = this.publication.readingOrder[this.delegate.currentResource()];
    }
    let localSearchDefinitions: any = [];

    const href = this.publication.getAbsoluteHref(tocItem.Href);
    await fetch(href)
      .then((r) => r.text())
      .then(async (_data) => {
        item.terms.forEach((termKey, index) => {
          // for (const termKey in item.term) {
          console.log(termKey);
          searchDocDomSeek(
            termKey,
            this.delegate.iframes[0].contentDocument,
            tocItem.Href,
            tocItem.Title
          ).then((result) => {
            // searchDocDomSeek(searchVal, doc, tocItem.href, tocItem.title).then(result => {

            let i: number = undefined;
            if (item.result == 1) {
              i = 0;
            } else if (item.result == 2) {
              i = Math.floor(Math.random() * result.length - 1) + 1;
            }
            console.log(i);
            result.forEach((searchItem, index) => {
              if (i === undefined || i === index) {
                const selectionInfo = {
                  rangeInfo: searchItem.rangeInfo,
                  cleanText: null,
                  rawText: null,
                  range: null,
                };
                setTimeout(() => {
                  const highlight = this.highlighter.createPopupHighlight(
                    selectionInfo,
                    item
                  );
                  searchItem.highlight = highlight;
                  localSearchDefinitions.push(
                    lodash.omit(highlight, "definition")
                  );
                  this.currentChapterPopupResult.push(searchItem);
                  this.currentPopupHighlights.push(highlight);
                }, 500);
              }
            });

            if (index == item.terms.length - 1) {
              setTimeout(() => {
                callback(localSearchDefinitions);
              }, 500);
            }
          });
        });
      });
  }

  async definitions() {
    for (const item of this.properties.definitions) {
      await this.define(item);
    }
  }

  async define(item: Definition) {
    await this.searchAndPaint(item, async (result) => {
      if (this.api?.success) {
        this.api?.success(lodash.omit(item, "callbacks"), result);

        if (this.api?.visible) {
          result.forEach((highlight) => {
            console.log(this.delegate.iframes[0].contentDocument);
            let highlightParent = this.delegate.iframes[0].contentDocument.querySelector(
              `#${highlight.id}`
            );
            const highlightFragments = highlightParent.querySelectorAll(
              `.${CLASS_HIGHLIGHT_AREA}`
            );
            let observer = new IntersectionObserver(
              (entries, _observer) => {
                entries.forEach((entry) => {
                  if (entry.intersectionRatio == 1) {
                    this.api?.visible(
                      lodash.omit(item, "callbacks"),
                      lodash.omit(highlight, "definition")
                    );
                  }
                });
              },
              { threshold: 1 }
            );
            observer.observe(highlightFragments[0]);
          });
        }
      }
    });
  }

  drawDefinitions() {
    setTimeout(async () => {
      await this.definitions();
      //   this.currentPopupHighlights = [];
      //   this.currentChapterPopupResult.forEach((searchItem) => {
      //     var selectionInfo = {
      //       rangeInfo: searchItem.rangeInfo,
      //       cleanText: null,
      //       rawText: null,
      //       range: null,
      //     };
      //     const highlight = this.highlighter.createPopupHighlight(
      //       selectionInfo,
      //       searchItem.highlight.definition
      //     );
      //
      //     searchItem.highlight = highlight;
      //     this.currentPopupHighlights.push(highlight);
      //   });
    }, 100);
  }

  async handleResize() {
    await this.highlighter.destroyHighlights(HighlightType.Popup);
    this.drawDefinitions();
  }
}
