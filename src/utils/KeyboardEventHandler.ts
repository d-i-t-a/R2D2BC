/*
 * Copyright 2018-2021 DITA (AM Consulting LLC)
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
 * Licensed to: CAST under one or more contributor license agreements.
 */

import { IFrameNavigator } from "../navigator/IFrameNavigator";

export default class KeyboardEventHandler {
  navigator: IFrameNavigator;
  rtl: boolean;
  constructor(navigator: IFrameNavigator) {
    this.navigator = navigator;
    this.rtl = false;
  }

  public onBackwardSwipe: (event: UIEvent) => void = () => {};
  public onForwardSwipe: (event: UIEvent) => void = () => {};
  public onKeydown: (event: UIEvent) => void = () => {};

  public setupEvents = (element: HTMLElement | Document | null): void => {
    if (element) {
      this.focusin(element);
      this.keydown(element);
    }
  };

  public removeEvents = (element: HTMLElement | Document | null): void => {
    if (element) {
      const self = this;
      element.removeEventListener("focusin", this.onFocusIn(self), true);
      element.removeEventListener("keydown", this.onKeyDown(self), false);
    }
  };

  public focusin = (element: HTMLElement | Document): void => {
    const self = this;
    element.addEventListener("focusin", this.onFocusIn(self), true);
  };

  public keydown = (element: HTMLElement | Document): void => {
    const self = this;
    if (!this.navigator.rights.customKeyboardEvents) {
      element.addEventListener("keydown", this.onKeyDown(self), false);
    }
  };

  // store the generated event handlers, so they can be returned
  // when removing the event listeners
  private handlers = {};

  private onFocusIn(self: this) {
    return (
      this.handlers["onFocusIn"] ||
      (this.handlers["onFocusIn"] = function (event: KeyboardEvent) {
        self.navigator.view?.snap(event.target as HTMLElement);
      })
    );
  }

  private onKeyDown(self: this) {
    return (
      this.handlers["onKeyDown"] ||
      (this.handlers["onKeyDown"] = function (event: KeyboardEvent) {
        // Ignore input elements
        const eventTarget = event.target as HTMLElement;
        if (/input|select|option|textarea/i.test(eventTarget.tagName)) {
          return;
        }

        // Ignore when active text selection
        const ownerDocument = (eventTarget.ownerDocument ||
          eventTarget) as HTMLDocument;
        const ownerWindow = ownerDocument.defaultView as Window;
        const selection = ownerWindow.getSelection() as Selection;
        if (!selection.isCollapsed) {
          return;
        }

        const key = event.key;
        switch (key) {
          case "ArrowRight":
            self.rtl ? self.onBackwardSwipe(event) : self.onForwardSwipe(event);
            return;
          case "ArrowLeft":
            self.rtl ? self.onForwardSwipe(event) : self.onBackwardSwipe(event);
            return;
        }
        switch (event.code) {
          case "Space":
            if (event.ctrlKey) {
              self.onBackwardSwipe(event);
              return;
            } else {
              self.onForwardSwipe(event);
              return;
            }
        }
        self.onKeydown(event);
      })
    );
  }
}
