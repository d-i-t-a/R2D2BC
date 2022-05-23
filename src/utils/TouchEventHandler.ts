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

export default class TouchEventHandler {
  navigator: IFrameNavigator;
  constructor(navigator: IFrameNavigator) {
    this.navigator = navigator;
  }

  private static readonly TAP_TOLERANCE = 10;
  private static readonly LONG_PRESS_MS = 500;
  private static readonly SLOW_SWIPE_MS = 500;

  public onBackwardSwipe: (event: UIEvent) => void = () => {};
  public onForwardSwipe: (event: UIEvent) => void = () => {};

  public setupEvents = (element: HTMLElement | Document | null): void => {
    let touchEventStart: TouchEvent | null = null;
    let touchEventEnd: TouchEvent | null = null;
    let self = this;
    if (element) {
      element.addEventListener(
        "touchstart",
        function (event: TouchEvent) {
          if (event.changedTouches.length !== 1) {
            return;
          }
          touchEventStart = event;
        },
        false
      );

      element.addEventListener(
        "touchend",
        function (event: TouchEvent) {
          if (event.changedTouches.length !== 1) {
            return;
          }

          if (!touchEventStart) {
            return;
          }

          const startTouch = touchEventStart.changedTouches[0];
          const endTouch = event.changedTouches[0];

          if (!startTouch) {
            return;
          }

          const devicePixelRatio = window.devicePixelRatio;
          const xDevicePixels =
            (startTouch.clientX - endTouch.clientX) / devicePixelRatio;
          const yDevicePixels =
            (startTouch.clientY - endTouch.clientY) / devicePixelRatio;

          if (
            Math.abs(xDevicePixels) < TouchEventHandler.TAP_TOLERANCE &&
            Math.abs(yDevicePixels) < TouchEventHandler.TAP_TOLERANCE
          ) {
            if (touchEventEnd) {
              touchEventStart = null;
              touchEventEnd = null;
              return;
            }

            if (
              event.timeStamp - touchEventStart.timeStamp >
              TouchEventHandler.LONG_PRESS_MS
            ) {
              touchEventStart = null;
              touchEventEnd = null;
              return;
            }

            touchEventStart = null;
            touchEventEnd = event;
            return;
          }

          touchEventEnd = null;

          if (
            event.timeStamp - touchEventStart.timeStamp >
            TouchEventHandler.SLOW_SWIPE_MS
          ) {
            touchEventStart = null;
            return;
          }

          const slope =
            (startTouch.clientY - endTouch.clientY) /
            (startTouch.clientX - endTouch.clientX);
          if (Math.abs(slope) > 0.5) {
            touchEventStart = null;
            return;
          }

          if (xDevicePixels < 0) {
            self.onBackwardSwipe(event);
          } else {
            self.onForwardSwipe(event);
          }

          touchEventStart = null;
        },
        false
      );
    }
  };
}
