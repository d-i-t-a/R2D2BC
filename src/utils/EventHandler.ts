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

import { Link } from "../model/Link";
import { EpubNavigator } from "../navigator/EpubNavigator";
import { Popup } from "../modules/epub/search/Popup";
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
  navigator: EpubNavigator;
  popup: Popup;
  constructor(navigator: EpubNavigator) {
    this.navigator = navigator;
    this.popup = new Popup(this.navigator);
  }

  public onInternalLink: (event: UIEvent) => void = () => {};
  public onClickThrough: (event: UIEvent) => void = () => {};

  public setupEvents(element: HTMLElement | Document | null) {
    if (element !== null) {
      element.addEventListener("click", async (event: TouchEvent) => {
        const link = this.checkForLink(event);
        if (link) {
          await this.handleLinks(event);
          event.preventDefault();
          event.stopPropagation();
        }
        if (this.clickTimeout !== null) {
          clearTimeout(this.clickTimeout);
          this.clickTimeout = null;
          // Handle double click here
          log.log("Double Click Detected");
          let htmlElement = event.target as HTMLElement;
          if (event.target && htmlElement.tagName.toLowerCase() === "img") {
            await this.popup.showPopover(htmlElement, event);
          }
        } else {
          this.clickTimeout = window.setTimeout(async () => {
            // Handle single click here
            log.log("Single Click Detected");
            await this.handleLinks(event);
            this.clickTimeout = null;
          }, 200); // Adjust timeout duration as needed
        }
      });

      // Most click handling is done in the touchend and mouseup event handlers,
      // but if there's a click on an external link we need to cancel the click
      // event to prevent it from opening in the iframe.
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
        !(link.rels ? Array.from(link.rels) : []).includes("external") &&
        this.navigator.publication
          .getRelativeHref(clickedHref)
          .includes(link.href)
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

  private clickTimeout: number | null = null;

  private handleLinks = async (
    event: MouseEvent | TouchEvent
  ): Promise<void> => {
    log.log("R2 Click Handler");

    const link = this.checkForLink(event);
    if (link) {
      const isSameOrigin =
        window.location.protocol === link.protocol &&
        window.location.port === link.port &&
        window.location.hostname === link.hostname;

      const isEpubInternal = this.isReadingOrderInternal(link);
      const isResourceInternal = this.isResourceInternal(link);

      if (!isResourceInternal) {
        await this.popup.hidePopover();
      }

      const isInternal = link.href.indexOf("#") !== -1;

      if (!isEpubInternal && !isResourceInternal) {
        window.open(link.href, link.target ?? "_blank");
        event.preventDefault();
        event.stopPropagation();
      } else {
        (event.target as HTMLAnchorElement).href = link.href;
        if ((isSameOrigin || isEpubInternal) && isInternal) {
          const linkElement = event.target as HTMLLIElement;
          if (linkElement) {
            const attribute =
              linkElement.getAttribute("epub:type") === "noteref";
            if (attribute) {
              await this.popup.handleFootnote(linkElement, event);
            } else if (isResourceInternal && !isEpubInternal) {
              await this.popup.showPopover(linkElement, event);
            } else {
              this.onInternalLink(event);
            }
          } else {
            this.onInternalLink(event);
          }
        } else if ((isSameOrigin || isEpubInternal) && !isInternal) {
          this.onInternalLink(event);
        }
      }
    } else {
      if (!this.navigator.highlighter?.isSelectionMenuOpen) {
        this.onClickThrough(event);
      }
    }
  };
}
