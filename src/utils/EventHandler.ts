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

import { IS_DEV } from "..";

export function addEventListenerOptional(
  element: any,
  eventType: string,
  eventListener: any
) {
  if (element) {
    element.addEventListener(eventType, eventListener);
  }
}
export function removeEventListenerOptional(
  element: any,
  eventType: string,
  eventListener: any
) {
  if (element) {
    element.removeEventListener(eventType, eventListener);
  }
}

export default class EventHandler {
  public onInternalLink: (event: UIEvent) => void = () => {};
  public onClickThrough: (event: UIEvent) => void = () => {};

  public setupEvents(element: HTMLElement | Document | null) {
    if (element !== null) {
      // Most click handling is done in the touchend and mouseup event handlers,
      // but if there's a click on an external link we need to cancel the click
      // event to prevent it from opening in the iframe.
      element.addEventListener("click", this.handleLinks.bind(this));
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

  private handleLinks = (event: MouseEvent | TouchEvent): void => {
    if (IS_DEV) console.log("R2 Click Handler");

    const link = this.checkForLink(event);
    if (link) {
      // Open external links in new tabs.
      const isSameOrigin =
        window.location.protocol === link.protocol &&
        window.location.port === link.port &&
        window.location.hostname === link.hostname;
      const isInternal = link.href.indexOf("#");
      if (!isSameOrigin) {
        window.open(link.href, "_blank");
        event.preventDefault();
        event.stopPropagation();
      } else {
        (event.target as HTMLAnchorElement).href = link.href;
        if (isSameOrigin && isInternal !== -1) {
          this.onInternalLink(event);
        } else if (isSameOrigin && isInternal === -1) {
          // TODO needs some more refactoring when handling other types of links or elements
          // link.click();
          this.onInternalLink(event);
        }
      }
    } else {
      this.onClickThrough(event);
    }
  };
}
