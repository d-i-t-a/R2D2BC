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
import { GetContentBytesLength } from "../navigator/IFrameNavigator";

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

  get readingOrder(): Link[] | undefined {
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
  get hasMediaOverlays(): boolean {
    return this.readingOrder
      ? this.readingOrder.filter((el: Link) => el.Properties?.MediaOverlay)
          .length > 0
      : false;
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

  public getAbsoluteHref(href: string): string {
    return new URL(href, this.manifestUrl.href).href;
  }
  public getRelativeHref(href: string): string | null {
    const manifest = this.manifestUrl.href.replace("/manifest.json", ""); //new URL(this.manifestUrl.href, this.manifestUrl.href).href;
    let h = href.replace(manifest, "");
    if (h.indexOf("#") > 0) {
      h = h.slice(0, h.indexOf("#"));
    }
    if (h.charAt(0) === "/") {
      h = h.substring(1);
    }
    return h;
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
    const decodedHref = decodeURI(href) ?? "";
    return this.positions.filter((p: Locator) => decodedHref.includes(p.href));
  }

  /**
   * Fetches the contents to build up the positions manually,
   * at least for fluid layout pubs
   */
  async autoGeneratePositions(
    // allows passing in custom login to get length of resource, but defaults
    // to fetching the resource
    getContentBytesLength: GetContentBytesLength = fetchContentBytesLength
  ) {
    let startPosition = 0;
    let totalContentLength = 0;
    const positions: Locator[] = [];

    /**
     * For each item in the reading order, get its length and calculate
     * the number of positions in it, then add them all up into the totals.
     */
    for (const link of this.readingOrder) {
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
        let href = this.getAbsoluteHref(link.Href);
        let length = await getContentBytesLength(href);
        link.contentLength = length;
        totalContentLength += length;
        let positionLength = 1024;
        let positionCount = Math.max(1, Math.ceil(length / positionLength));
        // create a locator for every position and push it into the positions array
        for (let position = 0; position < positionCount; position++) {
          const locator: Locator = {
            href: link.Href,
            locations: {
              progression: position / positionCount,
              position: startPosition + (position + 1),
            },
            type: link.TypeLink,
          };
          positions.push(locator);
        }
        startPosition = startPosition + positionCount;
      }
    }

    // update the link.contentWeight to be a portion of the total and
    // build up a map of link weights for non fixed layout publications
    var totalweight = 0;
    if (this.isReflowable) {
      for (const link of this.readingOrder) {
        // bail out if the link is missing it's content length somehow
        if (!link.contentLength) {
          console.error("Link is missing contentLength", link);
          return;
        }
        // I (Kristo) don't totally know what this formula is saying...
        link.contentWeight = (100 / totalContentLength) * link.contentLength;
        totalweight = totalweight + link.contentWeight;
      }
    }

    // Once you have all the positions, you can update all the progressions and total progressions and remaining.
    for (const locator of positions) {
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
    }

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
      (link as Link).contentWeight = weights[link.Href];
    });
  }
}

const fetchContentBytesLength = async (href: string): Promise<number> => {
  const r = await fetch(href);
  const b = await r.blob();
  return b.size;
};
