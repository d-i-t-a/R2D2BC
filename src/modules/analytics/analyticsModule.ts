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
import { xActor, xStatement } from "./xStatement";

export interface AnalyticsModuleProperties {
  hideLayer?: boolean;
}

export interface AnalyticsModuleConfig extends AnalyticsModuleProperties {
  annotator: Annotator;
  delegate: IFrameNavigator;
  headerMenu?: HTMLElement | null;
  publication: Publication;
}

export class AnalyticsModule implements ReaderModule {
  readonly annotator: Annotator | null;
  private delegate: IFrameNavigator;
  private readonly headerMenu?: HTMLElement | null;
  private publication: Publication;
  private properties: AnalyticsModuleProperties;

  private historyForwardAnchorElement: HTMLAnchorElement;
  private historyBackAnchorElement: HTMLAnchorElement;
  private timelineContainer: HTMLDivElement;
  private positionSlider: HTMLInputElement;

  private historyCurrentIndex: number;
  private history: Array<Locator> = [];

  private constructor(
    annotator: Annotator,
    delegate: IFrameNavigator,
    publication: Publication,
    properties: AnalyticsModuleProperties,
    headerMenu?: HTMLElement | null
  ) {
    this.headerMenu = headerMenu;
    this.delegate = delegate;
    this.publication = publication;
    this.properties = properties;
    this.annotator = annotator;
  }

  public static async create(config: AnalyticsModuleConfig) {
    const pageBreak = new this(
      config.annotator,
      config.delegate,
      config.publication,
      config as AnalyticsModuleProperties,
      config.headerMenu
    );
    await pageBreak.start();
    return pageBreak;
  }

  async stop() {
    log.log("Page Break module stop");
    removeEventListenerOptional(
      this.positionSlider,
      "click",
      this.handleSlider.bind(this)
    );
    removeEventListenerOptional(
      this.timelineContainer,
      "click",
      this.handleSlider.bind(this)
    );
  }

  async handleResize() {
    await this.setup();
  }

  setup() {



    /*
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
    }*/
  }

  async push(locator: Locator) {
        console.log(locator.displayInfo);
    
  }

  protected async start(): Promise<void> {
    this.delegate.analyticsModule = this;
    this.timelineContainer = HTMLUtilities.findElement(
      document,
      "#container-view-timeline"
    );
    this.positionSlider = HTMLUtilities.findElement(
      document,
      "#positionSlider"
    );

    addEventListenerOptional(
      this.positionSlider,
      "click",
      this.handleSlider.bind(this)
    );
    addEventListenerOptional(
      this.timelineContainer,
      "click",
      this.handleSlider.bind(this)
    );
    /*
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
    */

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

  private async handleSlider(event: MouseEvent) {
    console.log("hello");
    var s: xStatement = new xStatement();
    s.actor = new xActor();
    s.actor.name = "user user";
    const json = JSON.stringify(s);
    console.log(json);
    event.preventDefault();
    event.stopPropagation();
  }

  
}
