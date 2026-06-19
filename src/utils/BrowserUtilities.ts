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

import * as HTMLUtilities from "./HTMLUtilities";
import type { IFrameAttributes } from "../navigator/types";

/** Returns the current width of the document. */
export function getWidth(): number {
  const wrapper = HTMLUtilities.findRequiredElement(
    document,
    "#iframe-wrapper"
  );

  return wrapper.clientWidth;
}

/** Returns the current height of the document. */
export function getHeight(): number {
  const wrapper = HTMLUtilities.findRequiredElement(
    document,
    "#iframe-wrapper"
  );

  return wrapper.clientHeight;
}

/**
 * Compute the inset on one side imposed by an integrator-supplied
 * `safeArea` chrome element relative to a parent's edge.
 *
 * - top:    chrome.bottom − parent.top
 * - bottom: parent.bottom − chrome.top
 * - left:   chrome.right  − parent.left
 * - right:  parent.right  − chrome.left
 *
 * Floors at 0 so chrome that sits outside the parent doesn't add a
 * negative offset. When chrome is anchored at the parent's edge (e.g.
 * a header at top:0), this collapses to the chrome's dimension; when
 * chrome is offset (e.g. a timeline at left:2.5rem), the gap is part
 * of the inset so iframe content clears the chrome's far edge.
 */
function safeAreaInset(
  side: "top" | "bottom" | "left" | "right",
  parent: Element | null | undefined,
  attributes: IFrameAttributes | undefined
): number {
  const chrome = attributes?.safeArea?.[side]?.();
  if (!chrome || !parent) return 0;
  const chromeRect = chrome.getBoundingClientRect();
  // `display: none` (and detached) elements return an all-zero rect; treat
  // them as no chrome so the inset doesn't blow up to `parent.bottom - 0`.
  if (chromeRect.width === 0 && chromeRect.height === 0) return 0;
  const parentRect = parent.getBoundingClientRect();
  let inset = 0;
  if (side === "top") inset = chromeRect.bottom - parentRect.top;
  else if (side === "bottom") inset = parentRect.bottom - chromeRect.top;
  else if (side === "left") inset = chromeRect.right - parentRect.left;
  else if (side === "right") inset = parentRect.right - chromeRect.left;
  return Math.max(0, inset);
}

/**
 * Computes the target height for an iframe rendering reflowable content.
 *
 * Formula: `parent.clientHeight − safeAreaInset(top) −
 * safeAreaInset(bottom) − iframe padding − margin`. Falls back to
 * `getHeight()` if the iframe has no parent.
 *
 * Pair with `applyIframeSafeAreaMargins` to push the iframe past near-side
 * chrome.
 */
export function computeIframeContentHeight(
  iframe: HTMLIFrameElement | null | undefined,
  attributes: IFrameAttributes | undefined
): number {
  const parent = iframe?.parentElement ?? null;
  const parentHeight = parent?.clientHeight ?? getHeight();
  const top = safeAreaInset("top", parent, attributes);
  const bottom = safeAreaInset("bottom", parent, attributes);
  const computedStyle = iframe ? window.getComputedStyle(iframe) : null;
  const padding =
    (parseFloat(computedStyle?.paddingTop ?? "0") || 0) +
    (parseFloat(computedStyle?.paddingBottom ?? "0") || 0);
  const margin = attributes?.margin ?? 0;
  return parentHeight - top - bottom - padding - margin;
}

/**
 * Applies `safeArea` offsets as inline margins on all four sides of the
 * iframe so the reduced-dimension iframe (see
 * `computeIframeContentHeight/Width`) sits in a deterministic position
 * regardless of how its parent lays out children (flex, grid, RTL inline
 * direction, etc). With margins set on all four sides + iframe shrunk by
 * `L+R` / `T+B`, total = parent box, so the iframe lands flush against
 * each safeArea edge.
 *
 * Call from each renderer's `setSize` after writing `iframe.width` /
 * `iframe.height`.
 */
export function applyIframeSafeAreaMargins(
  iframe: HTMLIFrameElement | null | undefined,
  attributes: IFrameAttributes | undefined
): void {
  if (!iframe) return;
  const parent = iframe.parentElement;
  iframe.style.marginTop = safeAreaInset("top", parent, attributes) + "px";
  iframe.style.marginBottom =
    safeAreaInset("bottom", parent, attributes) + "px";
  iframe.style.marginLeft = safeAreaInset("left", parent, attributes) + "px";
  iframe.style.marginRight = safeAreaInset("right", parent, attributes) + "px";
}

/**
 * Compute the width the iframe element should be at viewport size.
 *
 * Mirror of {@link computeIframeContentHeight} on the X axis.
 *
 * Formula: `parent.clientWidth − safeAreaInset(left) −
 * safeAreaInset(right) − iframe horizontal padding − margin`. Falls back
 * to `getWidth()` if the iframe has no parent.
 */
export function computeIframeContentWidth(
  iframe: HTMLIFrameElement | null | undefined,
  attributes: IFrameAttributes | undefined
): number {
  const parent = iframe?.parentElement ?? null;
  const parentWidth = parent?.clientWidth ?? getWidth();
  const left = safeAreaInset("left", parent, attributes);
  const right = safeAreaInset("right", parent, attributes);
  const computedStyle = iframe ? window.getComputedStyle(iframe) : null;
  const padding =
    (parseFloat(computedStyle?.paddingLeft ?? "0") || 0) +
    (parseFloat(computedStyle?.paddingRight ?? "0") || 0);
  const margin = attributes?.margin ?? 0;
  return parentWidth - left - right - padding - margin;
}

/** Returns true if the browser is zoomed in with pinch-to-zoom on mobile. */
export function isZoomed(): boolean {
  return getWidth() !== window.innerWidth;
}

/**
 * Detect iPadOS (including iPadOS 13+, which reports a desktop Safari user agent).
 *
 * iPadOS 13 and later default to "request desktop website" and set the user agent
 * to match macOS Safari, so a plain UA check for "iPad" misses modern iPads.
 * The reliable modern signal is: UA claims Macintosh, but the device reports
 * multi-touch support — desktop Macs return `maxTouchPoints === 0`.
 */
export function isIPadOS(): boolean {
  const ua = navigator.userAgent;
  // Pre-iPadOS 13 devices, and iPhone/iPod (excluded) — match legacy iPad UA
  if (/iPad/.test(ua)) return true;
  // iPadOS 13+ reports as "Macintosh; Intel Mac OS X ..." with touch
  if (
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}
