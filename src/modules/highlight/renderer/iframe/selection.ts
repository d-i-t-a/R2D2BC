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

import { IRangeInfo, ISelectionInfo } from "../../common/selection";
import log from "loglevel";

// https://developer.mozilla.org/en-US/docs/Web/API/Selection

export function clearCurrentSelection(win: Window) {
  const selection = win.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
}

export function getCurrentSelectionInfo(
  win: Window,
  getCssSelector: (element: Element) => string | undefined
): ISelectionInfo | undefined {
  const selection = win ? win.getSelection() : null;
  if (!selection) {
    return undefined;
  }
  if (selection.isCollapsed) {
    log.log("^^^ SELECTION COLLAPSED.");
    return undefined;
  }

  const rawText = selection.toString();
  const cleanText = rawText.trim().replace(/\n/g, " ").replace(/\s\s+/g, " ");
  if (cleanText.length === 0) {
    log.log("^^^ SELECTION TEXT EMPTY.");
    return undefined;
  }

  if (!selection.anchorNode || !selection.focusNode) {
    return undefined;
  }
  const r =
    selection.rangeCount === 1
      ? selection.getRangeAt(0)
      : createOrderedRange(
          selection.anchorNode,
          selection.anchorOffset,
          selection.focusNode,
          selection.focusOffset
        );
  if (!r || r.collapsed) {
    log.log("$$$$$$$$$$$$$$$$$ CANNOT GET NON-COLLAPSED SELECTION RANGE?!");
    return undefined;
  }

  const range = normalizeRange(r);
  if (range.startContainer !== r.startContainer) {
    log.log(
      ">>>>>>>>>>>>>>>>>>>>>>> SELECTION RANGE NORMALIZE diff: startContainer"
    );
    log.log(range.startContainer);
    log.log(r.startContainer);
  }
  if (range.startOffset !== r.startOffset) {
    log.log(
      ">>>>>>>>>>>>>>>>>>>>>>> SELECTION RANGE NORMALIZE diff: startOffset"
    );
    log.log(`${range.startOffset} !== ${r.startOffset}`);
  }
  if (range.endContainer !== r.endContainer) {
    log.log(
      ">>>>>>>>>>>>>>>>>>>>>>> SELECTION RANGE NORMALIZE diff: endContainer"
    );
    log.log(range.endContainer);
    log.log(r.endContainer);
  }
  if (range.endOffset !== r.endOffset) {
    log.log(
      ">>>>>>>>>>>>>>>>>>>>>>> SELECTION RANGE NORMALIZE diff: endOffset"
    );
    log.log(`${range.endOffset} !== ${r.endOffset}`);
  }

  const rangeInfo = convertRange(range, getCssSelector);
  if (!rangeInfo) {
    log.log("^^^ SELECTION RANGE INFO FAIL?!");
    return undefined;
  }

  // selection.removeAllRanges();
  //     // selection.addRange(range);

  return { rangeInfo, cleanText, rawText, range };
}

export function createOrderedRange(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number
): Range | undefined {
  try {
    const range = new Range(); // document.createRange()
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    if (!range.collapsed) {
      log.log(">>> createOrderedRange RANGE OK");
      return range;
    }

    log.log(">>> createOrderedRange COLLAPSED ... RANGE REVERSE?");
    const rangeReverse = new Range(); // document.createRange()
    rangeReverse.setStart(endNode, endOffset);
    rangeReverse.setEnd(startNode, startOffset);
    if (!rangeReverse.collapsed) {
      log.log(">>> createOrderedRange RANGE REVERSE OK.");
      return range;
    }

    log.log(">>> createOrderedRange RANGE REVERSE ALSO COLLAPSED?!");
    return undefined;
  } catch (err) {
    console.warn(err.message);
    return undefined;
  }
}

export function convertRange(
  range: Range,
  getCssSelector: (element: Element) => string | undefined
): IRangeInfo | undefined {
  // -----------------
  const startIsElement = range.startContainer.nodeType === Node.ELEMENT_NODE;
  const startContainerElement = startIsElement
    ? (range.startContainer as Element)
    : range.startContainer.parentNode &&
        range.startContainer.parentNode.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer.parentNode as Element)
      : undefined;
  if (!startContainerElement) {
    return undefined;
  }
  const startContainerChildTextNodeIndex = startIsElement
    ? -1
    : Array.from(startContainerElement.childNodes).indexOf(
        range.startContainer as ChildNode
      );
  if (startContainerChildTextNodeIndex < -1) {
    return undefined;
  }
  const startContainerElementCssSelector = getCssSelector(
    startContainerElement
  );
  // -----------------
  const endIsElement = range.endContainer.nodeType === Node.ELEMENT_NODE;
  const endContainerElement = endIsElement
    ? (range.endContainer as Element)
    : range.endContainer.parentNode &&
        range.endContainer.parentNode.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer.parentNode as Element)
      : undefined;
  if (!endContainerElement) {
    return undefined;
  }
  const endContainerChildTextNodeIndex = endIsElement
    ? -1
    : Array.from(endContainerElement.childNodes).indexOf(
        range.endContainer as ChildNode
      );
  if (endContainerChildTextNodeIndex < -1) {
    return undefined;
  }
  const endContainerElementCssSelector = getCssSelector(endContainerElement);
  // -----------------
  const commonElementAncestor = getCommonAncestorElement(
    range.startContainer,
    range.endContainer
  );
  if (!commonElementAncestor) {
    log.log("^^^ NO RANGE COMMON ANCESTOR?!");
    return undefined;
  }
  if (range.commonAncestorContainer) {
    const rangeCommonAncestorElement =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentNode;
    if (
      rangeCommonAncestorElement &&
      rangeCommonAncestorElement.nodeType === Node.ELEMENT_NODE
    ) {
      if (commonElementAncestor !== rangeCommonAncestorElement) {
        log.log(">>>>>> COMMON ANCESTOR CONTAINER DIFF??!");
        log.log(getCssSelector(commonElementAncestor));
        log.log(getCssSelector(rangeCommonAncestorElement as Element));
      }
    }
  }

  if (endContainerElementCssSelector && startContainerElementCssSelector) {
    return {
      endContainerChildTextNodeIndex,
      endContainerElementCssSelector,
      endOffset: range.endOffset,

      startContainerChildTextNodeIndex,
      startContainerElementCssSelector,
      startOffset: range.startOffset,
    };
  } else {
    return undefined;
  }
}

export function convertRangeInfo(
  documant: Document,
  rangeInfo: IRangeInfo
): Range | undefined {
  const startElement = documant.querySelector(
    rangeInfo.startContainerElementCssSelector
  );
  if (!startElement) {
    log.log("^^^ convertRangeInfo NO START ELEMENT CSS SELECTOR?!");
    return undefined;
  }
  let startContainer: Node = startElement;
  if (rangeInfo.startContainerChildTextNodeIndex >= 0) {
    if (
      rangeInfo.startContainerChildTextNodeIndex >=
      startElement.childNodes.length
    ) {
      log.log(
        "^^^ convertRangeInfo rangeInfo.startContainerChildTextNodeIndex >= startElement.childNodes.length?!"
      );
      return undefined;
    }
    startContainer =
      startElement.childNodes[rangeInfo.startContainerChildTextNodeIndex];
    if (startContainer.nodeType !== Node.TEXT_NODE) {
      log.log(
        "^^^ convertRangeInfo startContainer.nodeType !== Node.TEXT_NODE?!"
      );
      return undefined;
    }
  }
  const endElement = documant.querySelector(
    rangeInfo.endContainerElementCssSelector
  );
  if (!endElement) {
    log.log("^^^ convertRangeInfo NO END ELEMENT CSS SELECTOR?!");
    return undefined;
  }
  let endContainer: Node = endElement;
  if (rangeInfo.endContainerChildTextNodeIndex >= 0) {
    if (
      rangeInfo.endContainerChildTextNodeIndex >= endElement.childNodes.length
    ) {
      log.log(
        "^^^ convertRangeInfo rangeInfo.endContainerChildTextNodeIndex >= endElement.childNodes.length?!"
      );
      return undefined;
    }
    endContainer =
      endElement.childNodes[rangeInfo.endContainerChildTextNodeIndex];
    if (endContainer.nodeType !== Node.TEXT_NODE) {
      log.log(
        "^^^ convertRangeInfo endContainer.nodeType !== Node.TEXT_NODE?!"
      );
      return undefined;
    }
  }

  return createOrderedRange(
    startContainer,
    rangeInfo.startOffset,
    endContainer,
    rangeInfo.endOffset
  );
}

function getCommonAncestorElement(
  node1: Node,
  node2: Node
): Element | undefined {
  if (node1.nodeType === Node.ELEMENT_NODE && node1 === node2) {
    return node1 as Element;
  }

  if (node1.nodeType === Node.ELEMENT_NODE && node1.contains(node2)) {
    return node1 as Element;
  }

  if (node2.nodeType === Node.ELEMENT_NODE && node2.contains(node1)) {
    return node2 as Element;
  }

  const node1ElementAncestorChain: Element[] = [];
  let parent: Node | null = node1.parentNode;
  while (parent && parent.nodeType === Node.ELEMENT_NODE) {
    node1ElementAncestorChain.push(parent as Element);
    parent = parent.parentNode;
  }

  const node2ElementAncestorChain: Element[] = [];
  parent = node2.parentNode;
  while (parent && parent.nodeType === Node.ELEMENT_NODE) {
    node2ElementAncestorChain.push(parent as Element);
    parent = parent.parentNode;
  }

  let commonAncestor = node1ElementAncestorChain.find(
    (node1ElementAncestor) => {
      return node2ElementAncestorChain.indexOf(node1ElementAncestor) >= 0;
    }
  );
  if (!commonAncestor) {
    commonAncestor = node2ElementAncestorChain.find((node2ElementAncestor) => {
      return node1ElementAncestorChain.indexOf(node2ElementAncestor) >= 0;
    });
  }

  return commonAncestor;
}

//  https://github.com/webmodules/range-normalize/pull/2
//  "Normalizes" the DOM Range instance, such that slight variations in the start
//  and end containers end up being normalized to the same "base" representation.
//  The aim is to always have `startContainer` and `endContainer` pointing to
//  TextNode instances.
//  Pseudo-logic is as follows:
//  - Expand the boundaries if they fall between siblings.
//  - Narrow the boundaries until they point at leaf nodes.
//  - Is the start container excluded by its offset?
//    - Move it to the next leaf Node, but not past the end container.
//    - Is the start container a leaf Node but not a TextNode?
//      - Set the start boundary to be before the Node.
//  - Is the end container excluded by its offset?
//    - Move it to the previous leaf Node, but not past the start container.
//    - Is the end container a leaf Node but not a TextNode?
//      - Set the end boundary to be after the Node.
//  @param {Range} range - DOM Range instance to "normalize"
//  @return {Range} returns a "normalized" clone of `range`
export function normalizeRange(r: Range) {
  const range = r.cloneRange(); // new Range(); // document.createRange()

  let sc = range.startContainer;
  let so = range.startOffset;
  let ec = range.endContainer;
  let eo = range.endOffset;

  // Move the start container to the last leaf before any sibling boundary.
  if (sc.childNodes.length && so > 0) {
    sc = lastLeaf(sc.childNodes[so - 1]);
    so = (sc as CharacterData).length || 0;
  }

  // Move the end container to the first leaf after any sibling boundary.
  if (eo < ec.childNodes.length) {
    ec = firstLeaf(ec.childNodes[eo]);
    eo = 0;
  }

  // Move each container inward until it reaches a leaf Node.
  let start: Node | null = firstLeaf(sc);
  let end: Node | null = lastLeaf(ec);

  // Define a predicate to check if a Node is a leaf Node inside the Range.
  function isLeafNodeInRange(node: Node): boolean {
    if (node.childNodes.length) {
      return false;
    }

    const length = (node as CharacterData).length || 0;
    if (node === sc && so === length) {
      return false;
    }
    return !(node === ec && eo === 0);
  }

  // Move the start container until it is included or collapses to the end.
  while (start && !isLeafNodeInRange(start) && start !== end) {
    start = documentForward(start);
  }

  if (start === sc) {
    range.setStart(sc, so);
  } else if (start !== null) {
    if (start.nodeType === 3) {
      range.setStart(start, 0);
    } else {
      range.setStartBefore(start);
    }
  }

  // Move the end container until it is included or collapses to the start.
  while (end && !isLeafNodeInRange(end) && end !== start) {
    end = documentReverse(end);
  }

  if (end === ec) {
    range.setEnd(ec, eo);
  } else if (end !== null) {
    if (end.nodeType === 3) {
      range.setEnd(end, (end as CharacterData).length);
    } else {
      range.setEndAfter(end);
    }
  }

  return range;
}

// Return the next Node in a document order traversal.
// This order is equivalent to a classic pre-order.
function documentForward(node: Node): Node | null {
  if (node.firstChild) {
    return node.firstChild;
  }

  let n: Node | null = node;
  while (!n.nextSibling) {
    n = n.parentNode;
    if (!n) {
      return null;
    }
  }

  return n.nextSibling;
}

// Return the next Node in a reverse document order traversal.
// This order is equivalent to pre-order with the child order reversed.
function documentReverse(node: Node): Node | null {
  if (node.lastChild) {
    return node.lastChild;
  }

  let n: Node | null = node;
  while (!n.previousSibling) {
    n = n.parentNode;
    if (!n) {
      return null;
    }
  }

  return n.previousSibling;
}

function firstLeaf(node: Node): Node {
  while (node.firstChild) {
    node = node.firstChild;
  }
  return node;
}

function lastLeaf(node: Node): Node {
  while (node.lastChild) {
    node = node.lastChild;
  }
  return node;
}
