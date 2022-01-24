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

/** Returns a single element matching the selector within the parentElement,
    or null if no element matches. */
export function findElement(
  parentElement: Element | Document,
  selector: string
): any | null {
  return parentElement.querySelector(selector);
}

/** Returns a single element matching the selector within the parent element,
    or throws an exception if no element matches. */
export function findRequiredElement(
  parentElement: Element | Document,
  selector: string
): any {
  const element = findElement(parentElement, selector);
  if (element && element instanceof HTMLElement) {
    return element;
  } else {
    throw new Error("required element " + selector + " not found");
  }
}

/** Returns a single element matching the selector within the parentElement in the iframe context,
    or null if no element matches. */
export function findIframeElement(
  parentElement: Document | null,
  selector: string
): Element | null {
  if (parentElement === null) {
    throw new Error("parent element is null");
  } else {
    return parentElement.querySelector(selector);
  }
}

/** Returns a single element matching the selector within the parent element in an iframe context,
        or throws an exception if no element matches. */
export function findRequiredIframeElement(
  parentElement: Document,
  selector: string
): Element {
  const element = findIframeElement(parentElement, selector);
  if (!element) {
    throw new Error("required element " + selector + " not found in iframe");
  } else {
    return element;
  }
}

/** Sets an attribute and its value for an HTML element */
export function setAttr(
  element: HTMLElement,
  attr: string,
  value: string
): void {
  element.setAttribute(attr, value);
}

/** Removes an attribute for an HTML element */
export function removeAttr(element: HTMLElement, attr: string): void {
  element.removeAttribute(attr);
}

/** Creates an internal stylesheet in an HTML element */
export function createStylesheet(
  element: Document | HTMLElement,
  id: string,
  cssStyles: string
): void {
  const head = element.querySelector("head") as HTMLHeadElement;
  const stylesheet = document.createElement("style");
  stylesheet.id = id;
  stylesheet.textContent = cssStyles;
  head.appendChild(stylesheet);
}

/** Removes an existing internal stylesheet in an HTML element */
export function removeStylesheet(
  element: Document | HTMLElement,
  id: string
): void {
  const head = element.querySelector("head") as HTMLHeadElement;
  const stylesheet = head.querySelector("#" + id) as HTMLStyleElement;
  head.removeChild(stylesheet);
}
