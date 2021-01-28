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

export default class TouchEventHandler {

    public onBackwardSwipe: (event: UIEvent) => void = () => { };
    public onForwardSwipe: (event: UIEvent) => void = () => { };

    public setupEvents = (element: HTMLElement | Document): void => {
        var pendingTouchEventStart: TouchEvent | null = null;
        // var pendingTouchEventEnd: TouchEvent | null = null;
        var self = this;

        element.addEventListener('touchstart', function (e: TouchEvent) {
            pendingTouchEventStart = e;
        }, false)

        element.addEventListener('touchend', function (e: TouchEvent) {

            const startTouch = pendingTouchEventStart.changedTouches[0];
            const endTouch = e.changedTouches[0];
            const devicePixelRatio = window.devicePixelRatio;
            const xDevicePixels = (startTouch.clientX - endTouch.clientX) / devicePixelRatio;
            // const yDevicePixels = (startTouch.clientY - endTouch.clientY) / devicePixelRatio;

            const slope = (startTouch.clientY - endTouch.clientY) / (startTouch.clientX - endTouch.clientX);
            if (Math.abs(slope) > 0.5) {
                pendingTouchEventStart = null;
                return;
            }

            if (xDevicePixels < 0) {
                self.onBackwardSwipe(e);
            } else {
                self.onForwardSwipe(e);
            }

        }, false)
    }
}