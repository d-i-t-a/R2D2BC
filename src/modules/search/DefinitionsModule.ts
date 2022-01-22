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

import { Publication } from "../../model/Publication";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import ReaderModule from "../ReaderModule";
import { IS_DEV } from "../../utils";
import TextHighlighter, {
  _highlights,
  CLASS_HIGHLIGHT_AREA,
  DEFAULT_BACKGROUND_COLOR,
} from "../highlight/TextHighlighter";
import * as lodash from "lodash";
import { searchDocDomSeek } from "./searchWithDomSeek";
import { HighlightType, IHighlight } from "../highlight/common/highlight";
import { debounce } from "debounce";
import { ISelectionInfo } from "../highlight/common/selection";
import { SHA256 } from "jscrypto/es6/SHA256";
import { AnnotationMarker } from "../../model/Locator";

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
  fullWordSearch?: boolean;
  hideLayer?: boolean;
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
    setTimeout(() => {
      this.properties.hideLayer
        ? this.delegate.hideLayer("definitions")
        : this.delegate.showLayer("definitions");
    }, 10);
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
        for (const termKey of item.terms) {
          const tindex = item.terms.indexOf(termKey);
          await searchDocDomSeek(
            termKey,
            this.delegate.iframes[0].contentDocument,
            tocItem.Href,
            tocItem.Title,
            this.delegate.definitionsModule.properties.fullWordSearch
          ).then((result) => {
            let i: number = undefined;
            if (item.result == 1) {
              i = 0;
            } else if (item.result == 2) {
              i = Math.floor(Math.random() * result.length - 1) + 1;
            }
            result.forEach((searchItem, index) => {
              if (i === undefined || i === index) {
                const selectionInfo = {
                  rangeInfo: searchItem.rangeInfo,
                  cleanText: null,
                  rawText: null,
                  range: null,
                };
                  const highlight = this.createDefinitionHighlight(
                    selectionInfo,
                    item
                  );
                  searchItem.highlight = highlight;
                  localSearchDefinitions.push(
                    lodash.omit(highlight, "definition")
                  );
                  this.currentChapterPopupResult.push(searchItem);
                  this.currentPopupHighlights.push(highlight);
              }
            });

            if (tindex === item.terms.length - 1) {
                callback(localSearchDefinitions);
            }
          });
        }
      });
  }

  definitions = debounce(async () => {
    await this.highlighter.destroyHighlights(HighlightType.Definition);
    for (const item of this.properties.definitions) {
      await this.define(item);
    }
  }, 200);

  async define(item: Definition) {
    await this.searchAndPaint(item, async (result) => {
      if (this.api?.success) {
        this.api?.success(lodash.omit(item, "callbacks"), result);

        if (this.api?.visible) {
          result.forEach((highlight) => {
            let highlightParent =
              this.delegate.iframes[0].contentDocument.querySelector(
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

  async drawDefinitions() {
    setTimeout(async () => {
      await this.definitions();
    }, 100);
  }

  async handleResize() {
    await this.drawDefinitions();
  }
  createDefinitionHighlight(selectionInfo: ISelectionInfo, item: Definition) {
    try {
      let createColor: any = this.delegate.definitionsModule.properties.color;
      if (TextHighlighter.isHexColor(createColor)) {
        createColor = TextHighlighter.hexToRgbChannels(createColor);
      }

      const uniqueStr = `${selectionInfo.rangeInfo.startContainerElementCssSelector}${selectionInfo.rangeInfo.startContainerChildTextNodeIndex}${selectionInfo.rangeInfo.startOffset}${selectionInfo.rangeInfo.endContainerElementCssSelector}${selectionInfo.rangeInfo.endContainerChildTextNodeIndex}${selectionInfo.rangeInfo.endOffset}`;
      const sha256Hex = SHA256.hash(uniqueStr);
      const id = "R2_DEFINITION_" + sha256Hex;
      this.highlighter.destroyHighlight(
        this.delegate.iframes[0].contentDocument,
        id
      );

      const highlight: IHighlight = {
        color: createColor ? createColor : DEFAULT_BACKGROUND_COLOR,
        id,
        pointerInteraction: true,
        selectionInfo,
        marker: AnnotationMarker.Underline,
        type: HighlightType.Definition,
      };
      _highlights.push(highlight);

      let highlightDom = this.highlighter.createHighlightDom(
        this.delegate.iframes[0].contentWindow as any,
        highlight
      );
      if (item.definition) {
        highlightDom.dataset.definition = item.definition;
      }
      highlightDom.dataset.order = String(item.order);
      highlight.definition = item;
      highlight.position = parseInt(
        (
          (highlightDom.hasChildNodes
            ? highlightDom.childNodes[0]
            : highlightDom) as HTMLDivElement
        ).style.top.replace("px", "")
      );
      return highlight;
    } catch (e) {
      throw "Can't create definitions highlight: " + e;
    }
  }

  async addDefinition(definition) {
    await this.define(definition);
  }

  async clearDefinitions() {
    await this.highlighter.destroyHighlights(HighlightType.Definition);
  }
}
