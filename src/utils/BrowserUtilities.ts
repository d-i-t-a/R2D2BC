import { getUserAgentRegExp } from "browserslist-useragent-regexp";
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

import { ReaderConfig } from "../navigator/IFrameNavigator";

/** Returns the current width of the document. */
export function getWidth(): number {
  return document.documentElement.clientWidth;
}

/** Returns the current height of the document. */
export function getHeight(): number {
  return document.documentElement.clientHeight;
}

/** Returns true if the browser is zoomed in with pinch-to-zoom on mobile. */
export function isZoomed(): boolean {
  return getWidth() !== window.innerWidth;
}

/**
 * If enforceSupportedBrowsers is true, will get supported browsers
 * from the config and throw an error if the user is not on a supported
 * browser.
 */
export function enforceSupportedBrowsers(config: ReaderConfig) {
  if (!config.protection?.enforceSupportedBrowsers) {
    return;
  }

  const browsers = (config.protection.supportedBrowsers ?? []).map(
    (browser) => `last 1 ${browser} version`
  );

  const supportedBrowsers = getUserAgentRegExp({
    browsers: browsers,
    allowHigherVersions: true,
  });

  if (!supportedBrowsers.test(navigator.userAgent)) {
    throw new Error("Browser not supported.");
  }
}
