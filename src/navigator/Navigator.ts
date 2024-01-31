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

import { Locator } from "../model/Locator";
import { IFrameAttributes } from "./IFrameNavigator";

interface Navigator {
  publication: any;
  rights?: any;
  hasMediaOverlays?: any;

  addListener?(argument: any, argument2: any): void;

  startReadAloud?(): void;

  stopReadAloud?(): void;

  pauseReadAloud?(): void;

  resumeReadAloud?(): void;

  startReadAlong?(): void;

  stopReadAlong?(): void;

  pauseReadAlong?(): void;

  resumeReadAlong?(): void;

  hideLayer?(layer): any;

  showLayer?(layer): any;

  activateMarker?(id: string, position: string): any;

  deactivateMarker?(): any;

  tableOfContents(): any;
  landmarks(): any;
  pageList(): any;

  readingOrder(): any;

  currentResource(): any;

  mostRecentNavigatedTocItem?(): any;

  totalResources(): any;

  currentLocator(): any;

  positions(): any;

  goTo(locator: Locator): void;

  goToPosition(value: number);

  goToPage(page: number);

  nextResource(): void;

  previousResource(): void;

  nextPage(): void;

  previousPage(): void;

  atStart?(): any;

  atEnd?(): any;

  snapToSelector?(selector): void;

  applyAttributes?(value: IFrameAttributes): void;

  stop(): void;
}

export default Navigator;
