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
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { UserProperty } from "../model/user-settings/UserProperties";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import Store from "../store/Store";
import Renderer, { RendererHost } from "./Renderer";
import { IFrameAttributes } from "../navigator/types";

/**
 * Shared base for reflowable renderers (column-paginated and scroll).
 * Holds state common to both: iframe handle, host callbacks, attributes,
 * sizing slots, and helpers for resolving the iframe scrolling element.
 *
 * Mode-specific behavior lives in concrete subclasses:
 * - {@link ColumnRenderer} — paginated columns
 * - {@link ScrollRenderer} — scroll mode (vertical scroll axis)
 */
export default abstract class ReflowableRenderer implements Renderer {
  layout = "reflowable";

  protected readonly USERSETTINGS = "userSetting";
  protected readonly store: Store;

  host: RendererHost;
  iframe: HTMLIFrameElement;
  attributes: IFrameAttributes = {};
  sideMargin: number = 20;
  height: number = 0;

  abstract name: string;
  abstract label: string;

  constructor(store: Store) {
    this.store = store;
  }

  /**
   * Apply mode-specific iframe setup after the iframe content is loaded.
   * Replaces the historical `setMode(scroll)` body — UserSettings calls this
   * after constructing or swapping the renderer.
   */
  abstract engage(): void;

  abstract isScrollMode(): boolean;
  abstract isPaginated(): boolean;

  abstract start(): void;
  abstract setSize(): void;

  abstract getCurrentPosition(): number;
  abstract goToProgression(position: number): void;
  abstract atStart(): boolean;
  abstract atEnd(): boolean;
  abstract goToPreviousPage(): void;
  abstract goToNextPage(): void;
  abstract getCurrentPage(): number;
  abstract getPageCount(): number;

  abstract goToElement(element: HTMLElement | null, relative?: boolean): void;
  abstract snap(element: HTMLElement | null, relative?: boolean): void;

  // ── shared ──────────────────────────────────────────────────────

  stop(): void {
    this.iframe.height = "0";
    this.iframe.width = "0";
    let doc = this.iframe.contentDocument;
    if (doc) {
      const body = HTMLUtilities.findIframeElement(
        this.iframe.contentDocument,
        "body"
      ) as HTMLBodyElement;
      const images = Array.prototype.slice.call(body.querySelectorAll("img"));
      for (const image of images) {
        image.style.maxWidth = "";
      }
    }
  }

  goToCssSelector(cssSelector: string, relative?: boolean): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      let element = doc.querySelector(cssSelector) as HTMLElement;
      this.goToElement(element, relative);
    }
  }

  goToFragment(fragment: string, relative?: boolean): void {
    let doc = this.iframe.contentDocument;
    if (doc) {
      const element = doc.getElementById(fragment) as HTMLElement;
      this.goToElement(element, relative);
    }
  }

  getScreenHeight(): number {
    const wrapper = HTMLUtilities.findRequiredElement(
      document,
      "#iframe-wrapper"
    );
    return wrapper.clientHeight;
  }

  async getProperty(name: string): Promise<UserProperty | null> {
    let array = await this.store.get(this.USERSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return null;
      }
      return properties[0];
    }
    return null;
  }

  get scrollingElement() {
    if (this.iframe.contentDocument?.scrollingElement) {
      return this.iframe.contentDocument?.scrollingElement;
    } else if (this.iframe.contentDocument?.body) {
      return this.iframe.contentDocument?.body;
    } else {
      // Iframe not loaded yet (e.g. very fast next/previous resource changes).
      return document.createElement("body");
    }
  }
}
