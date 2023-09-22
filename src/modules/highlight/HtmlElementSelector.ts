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

export interface HtmlElementSelector {
  /** selector */
  selector: string;

  /** childIndexOf */
  childIndexOf: number;

  /** offset */
  offset: number;
}

export const find = (result: HtmlElementSelector, document: Document): Node => {
  const element = document.querySelector(result.selector);
  if (!element) {
    throw new Error("Unable to find element with selector: " + result.selector);
  }
  return element.childNodes[result.childIndexOf];
};

export const generateSelector = (
  node: Node,
  relativeTo: Node
): HtmlElementSelector => {
  let currentNode = node as HTMLElement;
  const tagNames: String[] = [];
  let textNodeIndex = 0;
  if (node.parentNode) {
    textNodeIndex = childNodeIndexOf(node.parentNode, node);

    while (currentNode) {
      const tagName = currentNode.tagName;

      if (tagName) {
        const nthIndex = computedNthIndex(currentNode);
        let selector = tagName;

        if (nthIndex > 1) {
          selector += ":nth-of-type(" + nthIndex + ")";
        }

        tagNames.push(selector);
      }

      currentNode = (currentNode.parentNode ||
        currentNode.parentElement) as HTMLElement;

      if (currentNode === (relativeTo.parentNode || relativeTo.parentElement)) {
        break;
      }
    }
  }
  return {
    selector: tagNames.reverse().join(">").toLowerCase(),
    childIndexOf: textNodeIndex,
    offset: 0,
  };
};

export const childNodeIndexOf = (parentNode: Node, childNode: Node) => {
  const childNodes = parentNode.childNodes;
  let result = 0;
  for (let i = 0, l = childNodes.length; i < l; i++) {
    if (childNodes[i] === childNode) {
      result = i;
      break;
    }
  }
  return result;
};

export const computedNthIndex = (childElement: HTMLElement) => {
  let elementsWithSameTag = 0;

  const parent = childElement.parentNode || childElement.parentElement;

  if (parent) {
    for (var i = 0, l = parent.childNodes.length; i < l; i++) {
      const currentHtmlElement = parent.childNodes[i] as HTMLElement;
      if (currentHtmlElement === childElement) {
        elementsWithSameTag++;
        break;
      }
      if (currentHtmlElement.tagName === childElement.tagName) {
        elementsWithSameTag++;
      }
    }
  }
  return elementsWithSameTag;
};
