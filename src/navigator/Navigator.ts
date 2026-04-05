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
import { Publication } from "../model/Publication";
import { Link } from "../model/Link";

interface Navigator {
  publication: Publication;
  rights?: Record<string, boolean>;
  hasMediaOverlays?: boolean;

  addListener?(event: string, handler: (...args: any[]) => void): void;

  startReadAloud?(): void;

  stopReadAloud?(): void;

  pauseReadAloud?(): void;

  resumeReadAloud?(): void;

  startReadAlong?(): void;

  stopReadAlong?(): void;

  pauseReadAlong?(): void;

  resumeReadAlong?(): void;

  hideLayer?(layer: string): void;

  showLayer?(layer: string): void;

  activateMarker?(id: string, position: string): void;

  deactivateMarker?(): void;

  tableOfContents(): Link[];
  landmarks(): Link[];
  pageList(): Link[];

  readingOrder(): Link[];

  /** Returns the spine index of the current resource, or undefined if not yet loaded. */
  currentResource(): number | undefined;

  mostRecentNavigatedTocItem?(): string | undefined;

  totalResources(): number;

  currentLocator(): Locator;

  positions(): Locator[];

  goTo(locator: Locator): void | Promise<void>;

  goToPosition(value: number): void | Promise<void>;

  goToPage(page: number): void | Promise<void>;

  nextResource(): void | Promise<void>;

  previousResource(): void | Promise<void>;

  nextPage(): void | Promise<void>;

  previousPage(): void | Promise<void>;

  atStart?(): boolean;

  atEnd?(): boolean;

  snapToSelector?(selector: string): void;

  applyAttributes?(value: IFrameAttributes): void;

  stop(): void;
}

export default Navigator;
