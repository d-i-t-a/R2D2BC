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

import {
  IFrameNavigator,
  IFrameAttributes,
} from "../navigator/IFrameNavigator";
import BookView from "./BookView";
import * as HTMLUtilities from "../utils/HTMLUtilities";

export default class FixedBookView implements BookView {
  layout = "fixed";
  navigator: IFrameNavigator;
  name: string;
  label: string;
  iframe: HTMLIFrameElement;
  iframe2: HTMLIFrameElement;
  sideMargin: number = 20;
  height: number = 0;
  attributes: IFrameAttributes = { margin: 0 };

  start(): void {}

  stop(): void {}

  getCurrentPosition(): number {
    return 0;
  }

  getScreenHeight(): number {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    return wrapper.clientHeight;
  }

  goToProgression(_position: number): void {}

  goToCssSelector(_cssSelector: string, _relative?: boolean): void {}

  goToFragment(_fragment: string, _relative?: boolean): void {}

  snap(_element: HTMLElement, _relative?: boolean): void {}

  getCurrentPage(): number {
    return 0;
  }

  getPageCount(): number {
    return 1;
  }

  setSize(): void {}

  isPaginated() {
    return true;
  }

  isScrollMode() {
    return false;
  }

  atEnd(): boolean {
    return true;
  }

  atStart(): boolean {
    return true;
  }
}
