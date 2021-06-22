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
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { Locator } from "./Locator";
import { Link } from "./Link";
import { Publication as R2Publication } from "r2-shared-js/dist/es6-es2015/src/models/publication";
import { Link as R2Link } from "r2-shared-js/dist/es6-es2015/src/models/publication-link";
import { JsonObject } from "ta-json-x";
import { TaJsonDeserialize } from "../utils/JsonUtil";

@JsonObject()
export default class Publication extends R2Publication {
  manifestUrl: URL;

  public positions: Array<Locator>;

  /**
   * Initialize a publication from a manifest URL
   */
  static async fromUrl(url: URL): Promise<Publication> {
    const response = await fetch(url.href, {
      credentials: "same-origin",
    });
    const manifestJSON = await response.json();
    let publication = TaJsonDeserialize<Publication>(manifestJSON, Publication);
    publication.manifestUrl = url;
    return publication;
  }

  get readingOrder(): Link[] {
    return this.Spine;
  }
  get tableOfContents() {
    return this.TOC;
  }
  get landmarks() {
    return this.Landmarks;
  }
  get pageList() {
    return this.PageList;
  }
  get isFixedLayout() {
    return this.Metadata.Rendition?.Layout === "fixed";
  }
  get isReflowable() {
    return !this.isFixedLayout;
  }
  get layout(): "fixed" | "reflowable" {
    return this.isFixedLayout ? "fixed" : "reflowable";
  }

  public getStartLink(): Link | null {
    if (this.readingOrder.length > 0) {
      return this.readingOrder[0] as Link;
    }
    return null;
  }

  public getPreviousSpineItem(href: string): Link | null {
    const index = this.getSpineIndex(href);
    if (index !== null && index > 0) {
      return this.readingOrder[index - 1] as Link;
    }
    return null;
  }

  public getNextSpineItem(href: string): Link | null {
    const index = this.getSpineIndex(href);
    if (index !== null && index < this.readingOrder.length - 1) {
      return this.readingOrder[index + 1] as Link;
    }
    return null;
  }

  public getSpineItem(href: string): Link | null {
    const index = this.getSpineIndex(href);
    if (index !== null) {
      return this.readingOrder[index] as Link;
    }
    return null;
  }

  public getSpineIndex(href: string): number | null {
    return this.readingOrder.findIndex(
      (item) =>
        item.Href && new URL(item.Href, this.manifestUrl.href).href === href
    );
  }

  public getAbsoluteHref(href: string): string | null {
    return new URL(href, this.manifestUrl.href).href;
  }
  public getRelativeHref(href: string): string | null {
    const manifest = this.manifestUrl.href.replace("/manifest.json", ""); //new URL(this.manifestUrl.href, this.manifestUrl.href).href;
    var href = href.replace(manifest, "");
    if (href.charAt(0) === "/") {
      href = href.substring(1);
    }
    return href;
  }

  public getTOCItemAbsolute(href: string): Link | null {
    const absolute = this.getAbsoluteHref(href);
    const findItem = (href: string, links: Array<R2Link>): Link | null => {
      for (let index = 0; index < links.length; index++) {
        const item = links[index] as Link;
        if (item.Href) {
          const hrefAbsolutre =
            item.Href.indexOf("#") !== -1
              ? item.Href.slice(0, item.Href.indexOf("#"))
              : item.Href;
          const itemUrl = new URL(hrefAbsolutre, this.manifestUrl.href).href;
          if (itemUrl === href) {
            return item;
          }
        }
        if (item.Children) {
          const childItem = findItem(href, item.Children);
          if (childItem !== null) {
            return childItem;
          }
        }
      }
      return null;
    };
    let link = findItem(absolute, this.tableOfContents);
    if (link === null) {
      link = findItem(absolute, this.readingOrder);
    }
    return link;
  }

  public getTOCItem(href: string): Link | null {
    const findItem = (href: string, links: Array<R2Link>): Link | null => {
      for (let index = 0; index < links.length; index++) {
        const item = links[index] as Link;
        if (item.Href) {
          const itemUrl = new URL(item.Href, this.manifestUrl.href).href;
          if (itemUrl === href) {
            return item;
          }
        }
        if (item.Children) {
          const childItem = findItem(href, item.Children);
          if (childItem !== null) {
            return childItem;
          }
        }
      }
      return null;
    };
    let link = findItem(href, this.tableOfContents);
    if (link === null) {
      link = findItem(href, this.readingOrder);
    }
    if (link === null) {
      if (href.indexOf("#") !== -1) {
        const newResource = href.slice(0, href.indexOf("#"));
        link = findItem(newResource, this.tableOfContents);
        if (link === null) {
          link = findItem(newResource, this.readingOrder);
        }
      }
    }
    return link;
  }

  /**
   * positionsByHref
   */
  public positionsByHref(href: string) {
    return this.positions
      ? this.positions.filter((el: Locator) => el.href === decodeURI(href))
      : undefined;
  }

  /**
   * Fetches the contents to build up the positions manually,
   * at least for fluid layout pubs
   */
  async autoGeneratePositions() {
    let startPosition = 0;
    let totalContentLength = 0;
    const positions = [];

    /**
     * For each item in the reading order, get its length and calculate
     * the number of positions in it, then add them all up into the totals.
     */
    const promises = this.readingOrder.map(async (link) => {
      // if it is fixed layout, there is no need to fetch, each item is
      // just a single page.
      if (this.isFixedLayout) {
        const locator: Locator = {
          href: link.Href,
          locations: {
            progression: 0,
            position: startPosition + 1,
          },
          type: link.TypeLink,
        };
        positions.push(locator);
        startPosition = startPosition + 1;
      } else {
        const href = this.getAbsoluteHref(link.Href);
        // Are we fetching every item in the readingOrder to generate positions?
        // maybe in the future this can be done in the background?
        const result = await fetch(href);
        const length = (await result.blob()).size;
        link.contentLength = length;
        totalContentLength += length;
        const positionLength = 1024;
        const positionCount = Math.max(1, Math.ceil(length / positionLength));
        Array.from(Array(positionCount).keys()).forEach((_, position) => {
          const locator: Locator = {
            href: link.Href,
            locations: {
              progression: position / positionCount,
              position: startPosition + (position + 1),
            },
            type: link.TypeLink,
          };
          positions.push(locator);
        });
        startPosition = startPosition + positionCount;
      }
    });

    // Once you have all the positions, you can update all the progressions and total progressions and remaining.
    positions.map((locator, _index) => {
      const resource = positions.filter(
        (el: Locator) => el.href === decodeURI(locator.href)
      );
      const positionIndex = Math.ceil(
        locator.locations.progression * (resource.length - 1)
      );
      locator.locations.totalProgression =
        (locator.locations.position - 1) / positions.length;
      locator.locations.remainingPositions = Math.abs(
        positionIndex - (resource.length - 1)
      );
      locator.locations.totalRemainingPositions = Math.abs(
        locator.locations.position - 1 - (positions.length - 1)
      );
      return locator;
    });

    // update the link.contentWeight to be a portion of the total and
    // build up a map of link weights for non fixed layout publications
    // @aferditamuriqi but what is the "weight" object ultimately used for?
    const weight = {};
    if (this.isReflowable) {
      this.readingOrder.forEach((link) => {
        // I don't totally know what this formula is saying haha, maybe we can
        // add a comment
        link.contentWeight = (100 / totalContentLength) * link.contentLength;
        weight[link.Href] = link.contentWeight;
      });
    }

    // we need to wait for all of them to complete, meaning everything has bee
    // fetched and counted
    await Promise.all(promises);

    this.positions = positions;
  }

  /**
   * Fetches the positions from a given service href
   */
  async fetchPositionsFromService(href: string) {
    const result = await fetch(href);
    const content = await result.json();
    this.positions = content.positions;
  }

  /**
   * Fetches weights from a given service href
   */
  async fetchWeightsFromService(href: string) {
    if (this.isFixedLayout) {
      console.warn(
        "Not fetching weights from service for fixed layout publication."
      );
      return;
    }
    const result = await fetch(href);
    const weights = await result.json();
    this.readingOrder.forEach((link) => {
      link.contentWeight = weights[link.Href];
    });
  }
}
