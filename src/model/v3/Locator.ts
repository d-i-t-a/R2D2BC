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
import {
  parseTimeFromFragments,
  serializeTimeFragment,
} from "../../utils/mediaFragments";

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
  /**
   * Spec-aligned fragment array — multiple Media Fragments URI 1.0
   * components attached to this position (e.g. `["t=120"]`,
   * `["xywh=0,0,100,100"]`). Used by audiobook (time-based) Locators
   * and any future fragment-typed positions. `fragment` (singular)
   * is preserved for backwards compat; new code should prefer this.
   * https://www.w3.org/TR/media-frags/
   */
  fragments?: string[];
  /** Progression in the resource expressed as a percentage (0–1) */
  progression?: number;
  /** An index in the publication (>= 1) */
  position?: number;
  /**
   * 1-based page number for paginated formats (PDF, fixed-layout EPUB).
   * Distinct from `position` (which is a document-wide index from the
   * publication's positionList per Readium spec).
   */
  page?: number;
  /**
   * Time offset in seconds within the resource. Used by audiobook
   * Locators; round-trips with `fragments` via `t=...` Media
   * Fragments URI components.
   */
  time?: number;
  /** Progression in the publication expressed as a percentage (0–1) */
  totalProgression?: number;
  /** R2D2BC extension: remaining positions in current resource */
  remainingPositions?: number;
  /** R2D2BC extension: remaining positions in publication */
  totalRemainingPositions?: number;
}

/**
 * Extract the page number from a Locations object.
 *
 * Accepts either the new `page` field (Readium-compliant) or the legacy
 * `position` field, which earlier R2D2BC PDF builds used to store page
 * numbers incorrectly. When only `position` is present, it's treated as
 * a page number for backwards compatibility. New writes should ALWAYS
 * use `page`.
 *
 * @returns the 1-based page number, or undefined if neither field is set
 */
export function getPageFromLocations(
  loc: Locations | undefined
): number | undefined {
  if (typeof loc?.page === "number") return loc.page;
  if (typeof loc?.position === "number") return loc.position;
  return undefined;
}

/**
 * Extract the time offset (in seconds) from a Locations object.
 *
 * Prefers the typed `time` field; falls back to parsing a `t=...`
 * component out of `fragments` for spec-aligned Locators that came
 * from another tool.
 *
 * @returns the time in seconds, or undefined if neither path resolves
 */
export function getTimeFromLocations(
  loc: Locations | undefined
): number | undefined {
  if (typeof loc?.time === "number") return loc.time;
  return parseTimeFromFragments(loc?.fragments);
}

/**
 * Build a Locations object that carries a time offset on both the
 * typed `time` field and the spec-aligned `fragments` array. Use this
 * when constructing a Locator for an audiobook position so the result
 * is both ergonomic for our code and interoperable with other Readium
 * implementations.
 *
 * Pass `base` to merge into an existing Locations (e.g. preserve
 * progression/position/page); the `time` and `fragments` fields on
 * the base are overwritten.
 */
export function locationsFromTime(
  seconds: number,
  base?: Partial<Locations>
): Locations {
  const fragment = serializeTimeFragment(seconds);
  const fragments = base?.fragments
    ? [...base.fragments.filter((f) => !/^t=/.test(f)), fragment]
    : [fragment];
  return {
    ...base,
    time: seconds,
    fragments,
  };
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

/**
 * A user note anchored to a position (visual: page/progression; audio: time).
 * Distinct from `Bookmark` (plain marker) and `Annotation` (selection-bound
 * highlight + note): a `Comment` carries free-text content but does not
 * require a text selection. Designed for media without rendered text
 * (audiobook) and for position-anchored notes on visual content where the
 * user wants to comment without highlighting a passage.
 *
 * `displayBefore` / `displayAfter` define the time window during which the
 * comment is shown on screen as playback nears its anchor (audiobook).
 * Visual navigators ignore them.
 */
export interface Comment extends Locator {
  id: string;
  created: Date;
  /** The user's free-text note. Named `body` (not `text`) to avoid colliding with the inherited `Locator.text` selection-context field. */
  body: string;
  editedAt?: Date;
  /** Seconds before anchor time to start showing the comment. Default 5. */
  displayBefore?: number;
  /** Seconds after anchor time to stop showing the comment. Default 10. */
  displayAfter?: number;
}
