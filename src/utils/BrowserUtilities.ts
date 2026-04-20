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

import * as HTMLUtilities from "./HTMLUtilities";

/** Returns the current width of the document. */
export function getWidth(): number {
  const wrapper = HTMLUtilities.findRequiredElement(
    document,
    "#iframe-wrapper"
  );

  return wrapper.clientWidth;
}

/** Returns the current height of the document. */
export function getHeight(): number {
  const wrapper = HTMLUtilities.findRequiredElement(
    document,
    "#iframe-wrapper"
  );

  return wrapper.clientHeight;
}

/** Returns true if the browser is zoomed in with pinch-to-zoom on mobile. */
export function isZoomed(): boolean {
  return getWidth() !== window.innerWidth;
}

/**
 * Detect iPadOS (including iPadOS 13+, which reports a desktop Safari user agent).
 *
 * iPadOS 13 and later default to "request desktop website" and set the user agent
 * to match macOS Safari, so a plain UA check for "iPad" misses modern iPads.
 * The reliable modern signal is: UA claims Macintosh, but the device reports
 * multi-touch support — desktop Macs return `maxTouchPoints === 0`.
 */
export function isIPadOS(): boolean {
  const ua = navigator.userAgent;
  // Pre-iPadOS 13 devices, and iPhone/iPod (excluded) — match legacy iPad UA
  if (/iPad/.test(ua)) return true;
  // iPadOS 13+ reports as "Macintosh; Intel Mac OS X ..." with touch
  if (
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}
