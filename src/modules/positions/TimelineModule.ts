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
 * Developed on behalf of: DITA
 * Licensed to: Bibliotheca LLC, Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { Publication } from "../../model/Publication";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { Locator } from "../../model/Locator";
import { Link } from "../../model/Link";
import log from "loglevel";

export interface TimelineModuleConfig {
  publication: Publication;
}

export class TimelineModule implements ReaderModule {
  private publication: Publication;
  navigator: IFrameNavigator;
  private timelineContainer: HTMLDivElement;
  private positionSlider: HTMLInputElement;

  public static async create(config: TimelineModuleConfig) {
    const timeline = new this(config.publication);
    await timeline.start();
    return timeline;
  }

  private constructor(publication: Publication) {
    this.publication = publication;
  }

  async stop() {
    log.log("Timeline module stop");
  }

  protected async start(): Promise<void> {
    this.timelineContainer = HTMLUtilities.findElement(
      document,
      "#container-view-timeline"
    );
    this.positionSlider = HTMLUtilities.findElement(
      document,
      "#positionSlider"
    );

    if (this.publication.positions) {
      if (this.positionSlider) this.positionSlider.style.display = "block";
    } else {
      if (this.positionSlider) this.positionSlider.style.display = "none";
    }
  }

  async initialize() {
    return new Promise<void>(async (resolve) => {
      await (document as any).fonts.ready;

      let locator = this.navigator.currentLocator();
      if (
        (this.navigator.rights.autoGeneratePositions &&
          this.publication.positions) ||
        this.publication.positions
      ) {
        if (this.positionSlider)
          this.positionSlider.value = (
            locator.locations.position ?? 0
          ).toString();
        if (this.positionSlider)
          this.positionSlider.max = (
            (locator.locations.totalRemainingPositions ?? 0) +
            (locator.locations.position ?? 0)
          ).toString();
      }

      if (this.timelineContainer) {
        this.timelineContainer.innerHTML = "";
      }
      this.publication.readingOrder?.forEach((link) => {
        const linkHref = this.publication.getAbsoluteHref(link.Href);
        const tocItemAbs = this.publication.getTOCItemAbsolute(linkHref);
        const tocHref =
          tocItemAbs?.Href.indexOf("#") !== -1
            ? tocItemAbs?.Href.slice(0, tocItemAbs?.Href.indexOf("#"))
            : tocItemAbs.Href;
        const tocHrefAbs = this.publication.getAbsoluteHref(tocHref ?? "");

        var chapterHeight;
        if (
          this.publication.positions &&
          this.navigator.view?.layout !== "fixed"
        ) {
          if ((link as Link).contentWeight) {
            chapterHeight = (link as Link).contentWeight;
          } else {
            chapterHeight = 1;
          }
        } else {
          chapterHeight = 100 / (this.publication.readingOrder?.length ?? 0);
        }

        var chapter = document.createElement("div");
        chapter.style.height = chapterHeight + "%";
        chapter.style.width = "100%";
        chapter.className = "chapter";

        if (tocItemAbs?.Title !== undefined) {
          var tooltip = document.createElement("span");
          tooltip.innerHTML = tocItemAbs.Title;
          tooltip.className = "chapter-tooltip";
          chapter.appendChild(tooltip);
        }

        addEventListenerOptional(chapter, "click", (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          var position;
          if (
            this.publication.positions ||
            (this.navigator.rights.autoGeneratePositions &&
              this.publication.positions)
          ) {
            position = {
              ...this.publication.positions.filter(
                (el: Locator) => el.href === link.Href
              )[0],
            };
            position.href = this.publication.getAbsoluteHref(position.href);
          } else {
            position = {
              href: tocHrefAbs,
              locations: {
                progression: 0,
              },
              type: link.TypeLink,
              title: link.Title,
            };
          }
          log.log(position);
          this.navigator.navigate(position);
        });

        if (tocHrefAbs === this.navigator.currentChapterLink.href) {
          chapter.className += " active";
        } else {
          chapter.className = chapter.className.replace(" active", "");
        }

        // append bookmarks indicator
        // append notes indicator
        // append highlights indicator

        if (this.timelineContainer) {
          this.timelineContainer.appendChild(chapter);
        }
      });

      resolve();
    });
  }
}
