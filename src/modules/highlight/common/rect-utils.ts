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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import log from "loglevel";

export interface IRectSimple {
  height: number;
  left: number;
  top: number;
  width: number;
}
export interface IRect extends IRectSimple {
  bottom: number;
  right: number;
}

export function getClientRectsNoOverlap(
  range: Range,
  doNotMergeHorizontallyAlignedRects: boolean
): IRect[] {
  const rangeClientRects = range.getClientRects(); // Array.from(range.getClientRects());
  return getClientRectsNoOverlap_(
    rangeClientRects,
    doNotMergeHorizontallyAlignedRects
  );
}

// tslint:disable-next-line:max-line-length
export function getClientRectsNoOverlap_(
  clientRects: DOMRectList,
  doNotMergeHorizontallyAlignedRects: boolean
): IRect[] {
  const tolerance = 1;

  const originalRects: IRect[] = [];
  for (const rangeClientRect of clientRects) {
    originalRects.push({
      bottom: rangeClientRect.bottom,
      height: rangeClientRect.height,
      left: rangeClientRect.left,
      right: rangeClientRect.right,
      top: rangeClientRect.top,
      width: rangeClientRect.width,
    });
  }

  const mergedRects = mergeTouchingRects(
    originalRects,
    tolerance,
    doNotMergeHorizontallyAlignedRects
  );
  const noContainedRects = removeContainedRects(mergedRects, tolerance);
  const newRects = replaceOverlappingRects(noContainedRects);

  const minArea = 2 * 2;
  for (let j = newRects.length - 1; j >= 0; j--) {
    const rect = newRects[j];
    const bigEnough = rect.width * rect.height > minArea;
    if (!bigEnough) {
      if (newRects.length > 1) {
        log.log("CLIENT RECT: remove small");
        newRects.splice(j, 1);
      } else {
        log.log("CLIENT RECT: remove small, but keep otherwise empty!");
        break;
      }
    }
  }

  checkOverlaps(newRects);

  log.log(
    `CLIENT RECT: reduced ${originalRects.length} --> ${newRects.length}`
  );
  return newRects;
}

// https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-core/lib/rect-helpers.js
// https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-core/lib/tappable-rects.js
function almostEqual(a: number, b: number, tolerance: number) {
  return Math.abs(a - b) <= tolerance;
}

export function rectIntersect(rect1: IRect, rect2: IRect): IRect {
  const maxLeft = Math.max(rect1.left, rect2.left);
  const minRight = Math.min(rect1.right, rect2.right);
  const maxTop = Math.max(rect1.top, rect2.top);
  const minBottom = Math.min(rect1.bottom, rect2.bottom);
  return {
    bottom: minBottom,
    height: Math.max(0, minBottom - maxTop),
    left: maxLeft,
    right: minRight,
    top: maxTop,
    width: Math.max(0, minRight - maxLeft),
  };
}

// rect1 - rect2
export function rectSubtract(rect1: IRect, rect2: IRect): IRect[] {
  const rectIntersected = rectIntersect(rect2, rect1);
  if (rectIntersected.height === 0 || rectIntersected.width === 0) {
    return [rect1];
  }

  const rects: IRect[] = [];

  {
    // left strip
    const rectA: IRect = {
      bottom: rect1.bottom,
      height: 0,
      left: rect1.left,
      right: rectIntersected.left,
      top: rect1.top,
      width: 0,
    };
    rectA.width = rectA.right - rectA.left;
    rectA.height = rectA.bottom - rectA.top;
    if (rectA.height !== 0 && rectA.width !== 0) {
      rects.push(rectA);
    }
  }

  {
    // inside strip
    const rectB: IRect = {
      bottom: rectIntersected.top,
      height: 0,
      left: rectIntersected.left,
      right: rectIntersected.right,
      top: rect1.top,
      width: 0,
    };
    rectB.width = rectB.right - rectB.left;
    rectB.height = rectB.bottom - rectB.top;
    if (rectB.height !== 0 && rectB.width !== 0) {
      rects.push(rectB);
    }
  }

  {
    // inside strip
    const rectC: IRect = {
      bottom: rect1.bottom,
      height: 0,
      left: rectIntersected.left,
      right: rectIntersected.right,
      top: rectIntersected.bottom,
      width: 0,
    };
    rectC.width = rectC.right - rectC.left;
    rectC.height = rectC.bottom - rectC.top;
    if (rectC.height !== 0 && rectC.width !== 0) {
      rects.push(rectC);
    }
  }

  {
    // right strip
    const rectD: IRect = {
      bottom: rect1.bottom,
      height: 0,
      left: rectIntersected.right,
      right: rect1.right,
      top: rect1.top,
      width: 0,
    };
    rectD.width = rectD.right - rectD.left;
    rectD.height = rectD.bottom - rectD.top;
    if (rectD.height !== 0 && rectD.width !== 0) {
      rects.push(rectD);
    }
  }

  return rects;
}

export function rectContainsPoint(
  rect: IRect,
  x: number,
  y: number,
  tolerance: number
) {
  return (
    (rect.left < x || almostEqual(rect.left, x, tolerance)) &&
    (rect.right > x || almostEqual(rect.right, x, tolerance)) &&
    (rect.top < y || almostEqual(rect.top, y, tolerance)) &&
    (rect.bottom > y || almostEqual(rect.bottom, y, tolerance))
  );
}

export function rectContains(rect1: IRect, rect2: IRect, tolerance: number) {
  return (
    rectContainsPoint(rect1, rect2.left, rect2.top, tolerance) && // top left corner
    rectContainsPoint(rect1, rect2.right, rect2.top, tolerance) && // top right corner
    rectContainsPoint(rect1, rect2.left, rect2.bottom, tolerance) && // bottom left corner
    rectContainsPoint(rect1, rect2.right, rect2.bottom, tolerance) // bottom right corner
  );
}

export function getBoundingRect(rect1: IRect, rect2: IRect): IRect {
  const left = Math.min(rect1.left, rect2.left);
  const right = Math.max(rect1.right, rect2.right);
  const top = Math.min(rect1.top, rect2.top);
  const bottom = Math.max(rect1.bottom, rect2.bottom);
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

export function rectsTouchOrOverlap(
  rect1: IRect,
  rect2: IRect,
  tolerance: number
) {
  return (
    (rect1.left < rect2.right ||
      (tolerance >= 0 && almostEqual(rect1.left, rect2.right, tolerance))) &&
    (rect2.left < rect1.right ||
      (tolerance >= 0 && almostEqual(rect2.left, rect1.right, tolerance))) &&
    (rect1.top < rect2.bottom ||
      (tolerance >= 0 && almostEqual(rect1.top, rect2.bottom, tolerance))) &&
    (rect2.top < rect1.bottom ||
      (tolerance >= 0 && almostEqual(rect2.top, rect1.bottom, tolerance)))
  );
}

export function mergeTouchingRects(
  rects: IRect[],
  tolerance: number,
  doNotMergeHorizontallyAlignedRects: boolean
): IRect[] {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const rect1 = rects[i];
      const rect2 = rects[j];
      if (rect1 === rect2) {
        log.log("mergeTouchingRects rect1 === rect2 ??!");
        continue;
      }

      const rectsLineUpVertically =
        almostEqual(rect1.top, rect2.top, tolerance) &&
        almostEqual(rect1.bottom, rect2.bottom, tolerance);

      const rectsLineUpHorizontally =
        almostEqual(rect1.left, rect2.left, tolerance) &&
        almostEqual(rect1.right, rect2.right, tolerance);

      const horizontalAllowed = !doNotMergeHorizontallyAlignedRects;
      // tslint:disable-next-line:max-line-length
      const aligned =
        (rectsLineUpHorizontally && horizontalAllowed) ||
        (rectsLineUpVertically && !rectsLineUpHorizontally);

      const canMerge = aligned && rectsTouchOrOverlap(rect1, rect2, tolerance);

      if (canMerge) {
        log.log(
          `CLIENT RECT: merging two into one, VERTICAL: ${rectsLineUpVertically} HORIZONTAL: ${rectsLineUpHorizontally} (${doNotMergeHorizontallyAlignedRects})`
        );
        const newRects = rects.filter((rect) => {
          return rect !== rect1 && rect !== rect2;
        });
        const replacementClientRect = getBoundingRect(rect1, rect2);
        newRects.push(replacementClientRect);

        return mergeTouchingRects(
          newRects,
          tolerance,
          doNotMergeHorizontallyAlignedRects
        );
      }
    }
  }

  return rects;
}

export function replaceOverlappingRects(rects: IRect[]): IRect[] {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const rect1 = rects[i];
      const rect2 = rects[j];
      if (rect1 === rect2) {
        log.log("replaceOverlappingRects rect1 === rect2 ??!");
        continue;
      }

      if (rectsTouchOrOverlap(rect1, rect2, -1)) {
        // negative tolerance for strict overlap test

        let toAdd: IRect[] = [];
        let toRemove: IRect;
        let toPreserve: IRect;

        // rect1 - rect2
        const subtractRects1 = rectSubtract(rect1, rect2); // discard #1, keep #2, add returned rects
        if (subtractRects1.length === 1) {
          toAdd = subtractRects1;
          toRemove = rect1;
          toPreserve = rect2;
        } else {
          // rect2 - rect1
          const subtractRects2 = rectSubtract(rect2, rect1); // discard #2, keep #1, add returned rects
          if (subtractRects1.length < subtractRects2.length) {
            toAdd = subtractRects1;
            toRemove = rect1;
            toPreserve = rect2;
          } else {
            toAdd = subtractRects2;
            toRemove = rect2;
            toPreserve = rect1;
          }
        }

        const toCheck: IRect[] = [];
        toCheck.push(toPreserve);
        Array.prototype.push.apply(toCheck, toAdd);
        checkOverlaps(toCheck);

        log.log(`CLIENT RECT: overlap, cut one rect into ${toAdd.length}`);
        const newRects = rects.filter((rect) => {
          return rect !== toRemove;
        });
        Array.prototype.push.apply(newRects, toAdd);

        return replaceOverlappingRects(newRects);
      }
    }
  }

  return rects;
}

export function getRectOverlapX(rect1: IRect, rect2: IRect) {
  return Math.max(
    0,
    Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left)
  );
}

export function getRectOverlapY(rect1: IRect, rect2: IRect) {
  return Math.max(
    0,
    Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top)
  );
}

export function removeContainedRects(
  rects: IRect[],
  tolerance: number
): IRect[] {
  const rectsToKeep = new Set(rects);

  for (const rect of rects) {
    const bigEnough = rect.width > 1 && rect.height > 1;
    if (!bigEnough) {
      log.log("CLIENT RECT: remove tiny");
      rectsToKeep.delete(rect);
      continue;
    }
    for (const possiblyContainingRect of rects) {
      if (rect === possiblyContainingRect) {
        continue;
      }
      if (!rectsToKeep.has(possiblyContainingRect)) {
        continue;
      }
      if (rectContains(possiblyContainingRect, rect, tolerance)) {
        log.log("CLIENT RECT: remove contained");
        rectsToKeep.delete(rect);
        break;
      }
    }
  }

  return Array.from(rectsToKeep);
}

export function checkOverlaps(rects: IRect[]) {
  const stillOverlappingRects: IRect[] = [];

  for (const rect1 of rects) {
    for (const rect2 of rects) {
      if (rect1 === rect2) {
        continue;
      }
      const has1 = stillOverlappingRects.indexOf(rect1) >= 0;
      const has2 = stillOverlappingRects.indexOf(rect2) >= 0;
      if (!has1 || !has2) {
        if (rectsTouchOrOverlap(rect1, rect2, -1)) {
          // negative tolerance for strict overlap test

          if (!has1) {
            stillOverlappingRects.push(rect1);
          }
          if (!has2) {
            stillOverlappingRects.push(rect2);
          }
          log.log("CLIENT RECT: overlap ---");
          // tslint:disable-next-line:max-line-length
          log.log(
            `#1 TOP:${rect1.top} BOTTOM:${rect1.bottom} LEFT:${rect1.left} RIGHT:${rect1.right} WIDTH:${rect1.width} HEIGHT:${rect1.height}`
          );
          // tslint:disable-next-line:max-line-length
          log.log(
            `#2 TOP:${rect2.top} BOTTOM:${rect2.bottom} LEFT:${rect2.left} RIGHT:${rect2.right} WIDTH:${rect2.width} HEIGHT:${rect2.height}`
          );

          const xOverlap = getRectOverlapX(rect1, rect2);
          log.log(`xOverlap: ${xOverlap}`);

          const yOverlap = getRectOverlapY(rect1, rect2);
          log.log(`yOverlap: ${yOverlap}`);
        }
      }
    }
  }
  if (stillOverlappingRects.length) {
    log.log(`CLIENT RECT: overlaps ${stillOverlappingRects.length}`);
  }
}
