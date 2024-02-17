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
  headerMenu?: HTMLElement | null;
  publication: Publication;
}

export class HistoryModule implements ReaderModule {
  readonly annotator: Annotator | null;
  navigator: IFrameNavigator;
  private readonly headerMenu?: HTMLElement | null;
  private publication: Publication;
  private properties: HistoryModuleProperties;

  private historyForwardAnchorElement: HTMLAnchorElement;
  private historyBackAnchorElement: HTMLAnchorElement;
  historyCurrentIndex: number;
  history: Array<Locator> = [];

  private constructor(
    annotator: Annotator,
    publication: Publication,
    properties: HistoryModuleProperties,
    headerMenu?: HTMLElement | null
  ) {
    this.headerMenu = headerMenu;
    this.publication = publication;
    this.properties = properties;
    this.annotator = annotator;
  }

  public static async create(config: HistoryModuleConfig) {
    const history = new this(
      config.annotator,
      config.publication,
      config as HistoryModuleProperties,
      config.headerMenu
    );
    await history.start();
    return history;
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
        this.historyForwardAnchorElement.className =
          this.historyForwardAnchorElement.className.replace(" disabled", "");
      } else {
        if (this.historyForwardAnchorElement) {
          this.historyForwardAnchorElement.removeAttribute("href");
          this.historyForwardAnchorElement.className += " disabled";
        }
      }
      if (this.historyBackAnchorElement && this.historyCurrentIndex > 0) {
        this.historyBackAnchorElement.className =
          this.historyBackAnchorElement.className.replace(" disabled", "");
      } else {
        if (this.historyBackAnchorElement) {
          this.historyBackAnchorElement.removeAttribute("href");
          this.historyBackAnchorElement.className += " disabled";
        }
      }
    }
  }

  async push(locator: Locator, history: boolean) {
    if (history && this.annotator) {
      let lastReadingPosition =
        (await this.annotator.getLastReadingPosition()) as
          | ReadingPosition
          | undefined;
      if (lastReadingPosition) {
        const linkHref = this.publication.getAbsoluteHref(
          lastReadingPosition.href
        );
        lastReadingPosition.href = linkHref;

        if (this.historyCurrentIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyCurrentIndex);
          this.history.push(lastReadingPosition);
          this.historyCurrentIndex = this.history.length - 1;
        } else if (
          lastReadingPosition?.locations.progression &&
          lastReadingPosition?.locations.progression > 0
        ) {
          this.history.push(lastReadingPosition);
          this.historyCurrentIndex = this.history.length - 1;
        } else {
          const lastInHistory = this.history[this.history.length - 1];
          if (
            (lastInHistory &&
              lastInHistory.href !== locator.href &&
              lastInHistory.locations !== locator.locations) ||
            lastInHistory === undefined
          ) {
            this.history.push(lastReadingPosition);
            this.historyCurrentIndex = this.history.length - 1;
          }
        }
      }

      if (this.historyCurrentIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyCurrentIndex);
      }
      const lastInHistory = this.history[this.history.length - 1];
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

  async handleHistoryForwardClick(event: MouseEvent) {
    await this.historyForward();
    event.preventDefault();
    event.stopPropagation();
  }

  async historyForward() {
    if (this.history.length > 0) {
      if (this.historyCurrentIndex + 1 < this.history.length) {
        this.historyCurrentIndex = this.historyCurrentIndex + 1;
        await this.navigator.navigate(
          this.history[this.historyCurrentIndex],
          false
        );
      }
    }
  }

  private async handleHistoryBackClick(event: MouseEvent) {
    await this.historyBack();
    event.preventDefault();
    event.stopPropagation();
  }

  async historyBack() {
    if (this.history.length > 0) {
      if (this.historyCurrentIndex > 0) {
        this.historyCurrentIndex = this.historyCurrentIndex - 1;
        await this.navigator.navigate(
          this.history[this.historyCurrentIndex],
          false
        );
      }
    }
  }
}
