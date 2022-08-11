/*
 * Copyright 2018-2022 DITA (AM Consulting LLC)
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
 * Developed on behalf of: Allvit (http://www.allvit.no)
 * Licensed to: Allvit under one or more contributor license agreements.
 */

import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import { Locator, ReadingPosition } from "../../model/Locator";
import { Publication } from "../../model/Publication";
import Annotator from "../../store/Annotator";
import log from "loglevel";

export interface HistoryModuleProperties {
  hideLayer?: boolean;
}

export interface HistoryModuleConfig extends HistoryModuleProperties {
  annotator: Annotator;
  delegate: IFrameNavigator;
  headerMenu?: HTMLElement | null;
  publication: Publication;
}

export class HistoryModule implements ReaderModule {
  readonly annotator: Annotator | null;
  private delegate: IFrameNavigator;
  private readonly headerMenu?: HTMLElement | null;
  private publication: Publication;
  private properties: HistoryModuleProperties;

  private historyForwardAnchorElement: HTMLAnchorElement;
  private historyBackAnchorElement: HTMLAnchorElement;
  private historyCurrentIndex: number;
  private history: Array<Locator> = [];

  private constructor(
    annotator: Annotator,
    delegate: IFrameNavigator,
    publication: Publication,
    properties: HistoryModuleProperties,
    headerMenu?: HTMLElement | null
  ) {
    this.headerMenu = headerMenu;
    this.delegate = delegate;
    this.publication = publication;
    this.properties = properties;
    this.annotator = annotator;
  }

  public static async create(config: HistoryModuleConfig) {
    const pageBreak = new this(
      config.annotator,
      config.delegate,
      config.publication,
      config as HistoryModuleProperties,
      config.headerMenu
    );
    await pageBreak.start();
    return pageBreak;
  }

  async stop() {
    log.log("Page Break module stop");
    removeEventListenerOptional(
      this.historyForwardAnchorElement,
      "click",
      this.handleHistoryForwardClick.bind(this)
    );
    removeEventListenerOptional(
      this.historyBackAnchorElement,
      "click",
      this.handleHistoryBackClick.bind(this)
    );
  }

  async handleResize() {
    await this.setup();
  }

  setup() {
    if (this.history.length > 0) {
      if (
        this.historyForwardAnchorElement &&
        this.historyCurrentIndex + 1 < this.history.length
      ) {
        this.historyForwardAnchorElement.className = this.historyForwardAnchorElement.className.replace(
          " disabled",
          ""
        );
      } else {
        if (this.historyForwardAnchorElement) {
          this.historyForwardAnchorElement.removeAttribute("href");
          this.historyForwardAnchorElement.className += " disabled";
        }
      }
      if (this.historyBackAnchorElement && this.historyCurrentIndex > 0) {
        this.historyBackAnchorElement.className = this.historyBackAnchorElement.className.replace(
          " disabled",
          ""
        );
      } else {
        if (this.historyBackAnchorElement) {
          this.historyBackAnchorElement.removeAttribute("href");
          this.historyBackAnchorElement.className += " disabled";
        }
      }
    }
  }

  async push(locator: Locator, history: boolean) {
    let lastInHistory;
    if (history && this.annotator) {
      let lastReadingPosition = (await this.annotator.getLastReadingPosition()) as
        | ReadingPosition
        | undefined;
      if (
        lastReadingPosition &&
        lastReadingPosition.locations.progression &&
        lastReadingPosition.locations.progression > 0
      ) {
        if (this.historyCurrentIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyCurrentIndex);
        }
        lastInHistory = this.history[this.history.length - 1];
        if (
          (lastInHistory && lastInHistory.href !== lastReadingPosition.href) ||
          lastInHistory === undefined
        ) {
          const linkHref = this.publication.getAbsoluteHref(
            lastReadingPosition.href
          );
          log.log(lastReadingPosition.href);
          log.log(linkHref);
          lastReadingPosition.href = linkHref;

          this.history.push(lastReadingPosition);
          this.historyCurrentIndex = this.history.length - 1;
        }
      }

      if (this.historyCurrentIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyCurrentIndex);
      }
      lastInHistory = this.history[this.history.length - 1];
      if (
        (lastInHistory && lastInHistory.href !== locator.href) ||
        lastInHistory === undefined
      ) {
        this.history.push(locator);
        this.historyCurrentIndex = this.history.length - 1;
      }
    }
  }

  protected async start(): Promise<void> {
    this.delegate.historyModule = this;

    if (this.headerMenu)
      this.historyForwardAnchorElement = HTMLUtilities.findElement(
        this.headerMenu,
        "#history-forward"
      ) as HTMLAnchorElement;

    if (this.headerMenu)
      this.historyBackAnchorElement = HTMLUtilities.findElement(
        this.headerMenu,
        "#history-back"
      ) as HTMLAnchorElement;

    this.historyCurrentIndex = this.history.length - 1;

    addEventListenerOptional(
      this.historyForwardAnchorElement,
      "click",
      this.handleHistoryForwardClick.bind(this)
    );
    addEventListenerOptional(
      this.historyBackAnchorElement,
      "click",
      this.handleHistoryBackClick.bind(this)
    );
  }

  private async handleHistoryForwardClick(event: MouseEvent) {
    if (this.history.length > 0) {
      if (this.historyCurrentIndex + 1 < this.history.length) {
        this.historyCurrentIndex = this.historyCurrentIndex + 1;
        await this.delegate.navigate(
          this.history[this.historyCurrentIndex],
          false
        );
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private async handleHistoryBackClick(event: MouseEvent) {
    if (this.history.length > 0) {
      if (this.historyCurrentIndex > 0) {
        this.historyCurrentIndex = this.historyCurrentIndex - 1;
        await this.delegate.navigate(
          this.history[this.historyCurrentIndex],
          false
        );
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }
}
