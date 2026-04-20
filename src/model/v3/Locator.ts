/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
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
 * Developed on behalf of: DITA (AM Consulting LLC)
 */

import { IHighlight } from "../../modules/highlight/common/highlight";

/**
 * Locator model aligned with the Readium Locator spec.
 * https://github.com/readium/architecture/tree/master/models/locators
 *
 * R2D2BC extensions (remainingPositions, totalRemainingPositions, displayInfo)
 * are preserved for backwards compatibility.
 */
export interface Locator {
  href: string;
  type?: string;
  title?: string;
  locations: Locations;
  text?: LocatorText;
  /** @deprecated R2D2BC extension — may be removed in a future version */
  displayInfo?: any;
}

export interface LocatorText {
  after?: string;
  before?: string;
  highlight?: string;
}

export interface Locations {
  /** Fragment identifier (TOC, page lists, landmarks) */
  fragment?: string;
  /** Progression in the resource expressed as a percentage (0–1) */
  progression?: number;
  /** An index in the publication (>= 1) */
  position?: number;
  /** Progression in the publication expressed as a percentage (0–1) */
  totalProgression?: number;
  /** R2D2BC extension: remaining positions in current resource */
  remainingPositions?: number;
  /** R2D2BC extension: remaining positions in publication */
  totalRemainingPositions?: number;
}

export interface ReadingPosition extends Locator {
  created: Date;
}

export interface Bookmark extends Locator {
  id?: any;
  created: Date;
}

export enum AnnotationMarker {
  Highlight,
  Underline,
  Bookmark,
  Custom,
  Comment,
}

export interface Annotation extends Locator {
  id?: any;
  created: Date;
  highlight?: IHighlight;
}
