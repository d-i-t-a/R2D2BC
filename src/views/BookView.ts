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

import {
  IFrameNavigator,
  IFrameAttributes,
} from "../navigator/IFrameNavigator";

interface BookView {
  layout: string;
  name: string;
  label: string;

  iframe: Element;
  sideMargin: number;
  height: number;
  navigator: IFrameNavigator;
  attributes?: IFrameAttributes;

  setMode?(scroll: boolean);
  isScrollMode();
  isPaginated();
  goToElement?(element: HTMLElement | null, relative?: boolean): void;
  setSize(): void;
  setIframeHeight?(iframe: any);
  setSize(): void;
  getScreenHeight(): number;

  /** Load this view in its book element, at the specified position. */
  start(): void;

  /** Remove this view from its book element. */
  stop(): void;

  getCurrentPosition(): number;
  goToProgression(position: number): void;
  goToFragment(fragment: string): void;
  goToCssSelector(cssSelector: string): void;
  snap(element: HTMLElement | null, relative?: boolean): void;

  atStart(): boolean;
  atEnd(): boolean;
  goToPreviousPage?(): void;
  goToNextPage?(): void;
  getCurrentPage(): number;
  getPageCount(): number;
}
export default BookView;
