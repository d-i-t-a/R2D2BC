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
 * Developed on behalf of: Bibliotheca LLC
 * Licensed to: Bibliotheca LLC under one or more contributor license agreements.
 */

import debounce from "debounce";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";

export default class SampleReadEventHandler {
  navigator: IFrameNavigator;
  constructor(navigator: IFrameNavigator) {
    this.navigator = navigator;
  }

  enforceSampleRead = debounce((position) => {
    let progress = Math.round(position.locations.totalProgression * 100);
    let valid = false;
    if (this.navigator.sample?.limit) {
      valid = progress <= this.navigator.sample?.limit;
      if (this.navigator.view?.layout === "fixed") {
        if (
          !valid &&
          this.navigator.sample?.minimum &&
          position.locations.position <= this.navigator.sample?.minimum
        ) {
          valid = true;
        }
      }
    }
    // left: 37, up: 38, right: 39, down: 40,
    // spacebar: 32, pageup: 33, pagedown: 34, end: 35, home: 36
    let keys = {
      37: 1,
      38: 0,
      39: 1,
      40: 1,
      32: 1,
      33: 1,
      34: 1,
      35: 1,
      36: 1,
    };

    function preventDefault(e) {
      e.preventDefault();
    }

    function preventDefaultForScrollKeys(e) {
      if (keys[e.keyCode] && !valid) {
        preventDefault(e);
      }
    }

    // modern Chrome requires { passive: false } when adding event
    let supportsPassive = false;

    let opts =
      Object.defineProperty &&
      Object.defineProperty({}, "passive", {
        // eslint-disable-next-line getter-return
        get: function () {
          supportsPassive = true;
        },
      });
    window.addEventListener("test", function () {}, opts);

    let wheelOpt = supportsPassive ? { passive: false } : false;

    function MouseWheelHandler(e) {
      // cross-browser wheel delta
      e = e || window.event; // old IE support
      let delta = Math.max(-1, Math.min(1, e.wheelDelta || -e.detail));

      if (delta === 1) {
        // move up
      }
      if (delta === -1 && !valid) {
        // move down
        e.preventDefault();
        // e.stopPropagation();
        return false;
      }
      return false;
    }

    let lastY;

    function TouchMoveHandler(e) {
      e = e || window.event;
      let target = e.target || e.srcElement;

      let currentY = e.touches[0].clientY;
      if (currentY > lastY) {
        // move up
      } else if (currentY < lastY && !valid) {
        // move down
        if (!target.className.match(/\baltNav\b/)) {
          e.returnValue = false;
          if (e.cancelable) {
            e.cancelBubble = true;
          }
          if (e.preventDefault && e.cancelable) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
        return false;
      }
      lastY = currentY;
      return false;
    }
    function TouchStartHandler(e) {
      e = e || window.event;
      lastY = e.touches[0].clientY;
      return false;
    }

    // IE9, Chrome, Safari, Opera
    window.addEventListener("mousewheel", MouseWheelHandler, wheelOpt);
    // Firefox
    window.addEventListener("DOMMouseScroll", MouseWheelHandler, wheelOpt);
    // window.addEventListener(wheelEvent, preventDefault, wheelOpt); // modern desktop
    window.addEventListener("keydown", preventDefaultForScrollKeys, wheelOpt);
    window.addEventListener("touchmove", TouchMoveHandler, wheelOpt);
    window.addEventListener("touchstart", TouchStartHandler, wheelOpt);

    if (!valid) {
      this.navigator.iframes[0].blur();
      if (this.navigator.errorMessage) {
        this.navigator.errorMessage.style.display = "block";
        this.navigator.errorMessage.style.backgroundColor =
          "rgb(255, 255, 255)";
        this.navigator.errorMessage.innerHTML =
          `<span>${this.navigator.sample?.popup}</span>` ?? "";
      }
    } else {
      this.navigator.iframes[0].focus();
      if (this.navigator.errorMessage) {
        this.navigator.errorMessage.style.display = "none";
        this.navigator.errorMessage.style.removeProperty("background-color");
      }
    }
  }, 300);
}
