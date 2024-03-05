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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { Link } from "r2-shared-js/dist/es6-es2015/src/models/publication-link";
import { IFrameNavigator } from "../navigator/IFrameNavigator";
import { Popup } from "../modules/search/Popup";
import log from "loglevel";

export function addEventListenerOptional(
  element: any,
  eventType: string,
  eventListener: any
) {
  if (element) {
    element.addEventListener(eventType, eventListener, true);
  }
}
export function removeEventListenerOptional(
  element: any,
  eventType: string,
  eventListener: any
) {
  if (element) {
    element.removeEventListener(eventType, eventListener, true);
  }
}

export default class EventHandler {
  navigator: IFrameNavigator;
  popup: Popup;
  constructor(navigator: IFrameNavigator) {
    this.navigator = navigator;
    this.popup = new Popup(this.navigator);
  }

  public onInternalLink: (event: UIEvent) => void = () => {};
  public onClickThrough: (event: UIEvent) => void = () => {};

  public setupEvents(element: HTMLElement | Document | null) {
    if (element !== null) {
      element.addEventListener(
        "dblclick",
        async (event: TouchEvent) => {
          let htmlElement = event.target as HTMLElement;
          if (event.target && htmlElement.tagName.toLowerCase() === "img") {
            await this.popup.showPopover(htmlElement, event);
          }
        },
        true
      );

      // Most click handling is done in the touchend and mouseup event handlers,
      // but if there's a click on an external link we need to cancel the click
      // event to prevent it from opening in the iframe.
      element.addEventListener("click", this.handleLinks.bind(this), true);
    } else {
      throw "cannot setup events for null";
    }
  }

  private checkForLink = (
    event: MouseEvent | TouchEvent
  ): HTMLAnchorElement | null => {
    let nextElement = event.target as any;
    while (nextElement && nextElement.tagName.toLowerCase() !== "body") {
      if (
        nextElement.tagName.toLowerCase() === "a" &&
        (nextElement as HTMLAnchorElement).href
      ) {
        return nextElement as HTMLAnchorElement;
      } else {
        (nextElement as any) = nextElement.parentElement;
      }
    }
    return null;
  };

  private linkInPublication = (readingOrder: Link[], clickedHref: string) =>
    readingOrder.some((link: Link) => {
      return (
        !link.Rel?.includes("external") &&
        this.navigator.publication
          .getRelativeHref(clickedHref)
          .includes(link.Href)
      );
    });

  /**
   *
   * This function checks the user clicked link inside the iframe
   * against the readingOrder list, it is an internal link if found.
   *
   */
  private isReadingOrderInternal = (
    clickedLink: HTMLAnchorElement
  ): boolean => {
    log.log("clickedLink: ", clickedLink);
    const isEpubInternal = this.linkInPublication(
      this.navigator.publication.readingOrder,
      clickedLink.href
    );
    return isEpubInternal;
  };

  private isResourceInternal = (clickedLink: HTMLAnchorElement): boolean => {
    log.log("clickedLink: ", clickedLink);
    const isEpubInternal = this.linkInPublication(
      this.navigator.publication.resources,
      clickedLink.href
    );
    return isEpubInternal;
  };

  clicks = 0;
  clickTimer: any = 0;
  dblClickTimeSpan = 300;

  private handleLinks = async (
    event: MouseEvent | TouchEvent
  ): Promise<void> => {
    log.log("R2 Click Handler");
    this.clicks++;
    if (this.clicks === 1) {
      this.clickTimer = setTimeout(async () => {
        this.clicks = 0;

        const link = this.checkForLink(event);
        if (link) {
          // Open external links in new tabs.
          const isSameOrigin =
            window.location.protocol === link.protocol &&
            window.location.port === link.port &&
            window.location.hostname === link.hostname;

          // If epub is hosted, rather than streamed, links to a resource inside the same epub should not be opened externally.
          const isEpubInternal = this.isReadingOrderInternal(link);

          const isResourceInternal = this.isResourceInternal(link);
          if (!isResourceInternal) {
            await this.popup.hidePopover();
          }

          const isInternal = link.href.indexOf("#");
          if (!isEpubInternal && !isResourceInternal) {
            window.open(link.href, link.target ?? "_blank");
            event.preventDefault();
            event.stopPropagation();
          } else {
            (event.target as HTMLAnchorElement).href = link.href;
            if ((isSameOrigin || isEpubInternal) && isInternal !== -1) {
              const link = event.target as HTMLLIElement;
              if (link) {
                const attribute = link.getAttribute("epub:type") === "noteref";
                if (attribute) {
                  await this.popup.handleFootnote(link, event);
                } else if (isResourceInternal && !isEpubInternal) {
                  await this.popup.showPopover(link, event);
                } else {
                  this.onInternalLink(event);
                }
              } else {
                this.onInternalLink(event);
              }
            } else if ((isSameOrigin || isEpubInternal) && isInternal === -1) {
              // TODO needs some more refactoring when handling other types of links or elements
              // link.click();
              this.onInternalLink(event);
            }
          }
        } else {
          setTimeout(() => {
            console.log("event.detail", event.detail);
            if (
              !this.navigator.highlighter?.isSelectionMenuOpen &&
              event.detail === 1
            ) {
              this.onClickThrough(event);
            }
          }, 100);
        }
      }, this.dblClickTimeSpan);
    }
    if (this.clicks === 2) {
      // it is the second click in double-click event
      clearTimeout(this.clickTimer);
      this.clicks = 0;
    }
  };
}
