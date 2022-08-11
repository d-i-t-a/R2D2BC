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

// https://developer.mozilla.org/en-US/docs/Web/API/Selection
// https://developer.mozilla.org/en-US/docs/Web/API/Range

// A serializable mapping with DOM Range
// (simply encodes a CSS Selector for element, and if text node, then encodes its parent element)
import log from "loglevel";

export interface IRangeInfo {
  // always references an element,
  // either Range.startContainer if its nodeType == Node.ELEMENT_NODE
  // or Range.startContainer.parentElement if Range.startContainer.nodeType == Node.TEXT_NODE
  startContainerElementCssSelector: string;

  // if i == -1, Range.startContainer is the above element
  // if i >=0 and i < element.childNodes.length, Range.startContainer is the above element.childNodes[i]
  // and element.childNodes[i].nodeType == Node.TEXT_NODE
  startContainerChildTextNodeIndex: number;

  // if Range.startContainer.nodeType == Node.TEXT_NODE
  // then if j >=0 and j < Range.startContainer.data.length, Range.startContainer.data[j] is the first char,
  // or if j >= Range.startContainer.data.length, the Range starts after the text but before the text node ends
  //
  // if Range.startContainer.nodeType == Node.ELEMENT_NODE
  // then if j >=0 and j < Range.startContainer.childNodes.length,
  // Range.startContainer.childNodes[j] is the first node inclusive of the range,
  // and if j >= Range.startContainer.childNodes.length, the Range starts after the last node,
  /// but before the parent contents ends
  startOffset: number;

  endContainerElementCssSelector: string;
  endContainerChildTextNodeIndex: number;
  endOffset: number;

  // cfi: string | undefined;
}

export function sameRanges(r1: IRangeInfo, r2: IRangeInfo): boolean {
  if (!r1 || !r2) {
    return false;
  }

  if (
    r1.startContainerElementCssSelector !== r2.startContainerElementCssSelector
  ) {
    return false;
  }
  if (
    r1.startContainerChildTextNodeIndex !== r2.startContainerChildTextNodeIndex
  ) {
    return false;
  }
  if (r1.startOffset !== r2.startOffset) {
    return false;
  }

  if (r1.endContainerElementCssSelector !== r2.endContainerElementCssSelector) {
    return false;
  }
  if (r1.endContainerChildTextNodeIndex !== r2.endContainerChildTextNodeIndex) {
    return false;
  }
  return r1.endOffset === r2.endOffset;
}

export interface ISelectionInfo {
  rangeInfo: IRangeInfo;
  cleanText?: string;
  rawText?: string;
  range?: Range;
}

export function sameSelections(
  sel1: ISelectionInfo,
  sel2: ISelectionInfo
): boolean {
  if (!sel1 || !sel2) {
    return false;
  }
  if (!sameRanges(sel1.rangeInfo, sel2.rangeInfo)) {
    return false;
  }
  if (sel1.cleanText !== sel2.cleanText) {
    log.log("SAME RANGES BUT DIFFERENT CLEAN TEXT??");
    return false;
  }
  if (sel1.rawText !== sel2.rawText) {
    log.log("SAME RANGES BUT DIFFERENT RAW TEXT??");
    return false;
  }
  return true;
}

export const _getCssSelectorOptions = {
  className: (_str: string) => {
    return true;
  },
  idName: (_str: string) => {
    return true;
  },
  tagName: (_str: string) => {
    return true;
  },
};
