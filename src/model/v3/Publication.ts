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

import {
  Manifest,
  Link as ReadiumLink,
  Publication as ReadiumPublication,
} from "@readium/shared";
import { Locator } from "./Locator";
import { Link } from "./Link";
import {
  GetContentBytesLength,
  RequestConfig,
  SampleRead,
} from "../../navigator/EpubNavigator";

/**
 * Convert a @readium/shared Link into an DITA Toolkit Link.
 * Creates a proper Link instance with all DITA Toolkit extensions available.
 */
function toLink(link: ReadiumLink): Link {
  if (link instanceof Link) return link;
  return new Link({
    href: link.href,
    templated: link.templated,
    type: link.type,
    title: link.title,
    rels: link.rels,
    properties: link.properties,
    height: link.height,
    width: link.width,
    size: link.size,
    duration: link.duration,
    bitrate: link.bitrate,
    languages: link.languages,
    alternates: link.alternates,
    children: link.children,
  });
}

function toLinks(links: ReadiumLink[] | undefined): Link[] {
  return (links ?? []).map(toLink);
}

/**
 * DITA Toolkit Publication — wraps @readium/shared Manifest with
 * all DITA Toolkit-specific extensions (positions, sample read, spine helpers).
 *
 * No Proxies. Clean property access. All camelCase.
 */
export class Publication {
  readonly manifest: Manifest;
  manifestUrl: URL;
  public positions: Array<Locator> = [];
  sample?: SampleRead;

  /** Cached converted links — extensions persist across accesses */
  private _readingOrder?: Link[];
  private _resources?: Link[];
  private _toc?: Link[];
  private _links?: Link[];
  /** Lazy Readium `Publication` for delegating accessors like `getCover()`. */
  private _readiumPublication?: ReadiumPublication;

  constructor(manifest: Manifest, manifestUrl: URL) {
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
  }

  /**
   * Create a Publication from a raw JSON object.
   * Handles both RWPM (camelCase) and legacy (PascalCase) key formats.
   * Returns null if the JSON cannot be parsed.
   */
  static fromJSON(json: any, url: URL): Publication | null {
    const normalized: any = {
      metadata: json.metadata ?? json.Metadata ?? { title: "" },
      links: json.links ?? json.Links ?? [],
      readingOrder: json.readingOrder ?? json.spine ?? json.Spine ?? [],
      resources: json.resources ?? json.Resources,
      toc: json.toc ?? json.TOC,
    };
    if (!normalized.metadata.title) {
      normalized.metadata.title = normalized.metadata.Title ?? "";
    }
    const manifest = Manifest.deserialize(normalized);
    if (!manifest) return null;
    manifest.setSelfLink(url.href);
    return new Publication(manifest, url);
  }

  static async fromUrl(
    url: URL,
    requestConfig: RequestConfig | undefined,
    fetcher: import("../../fetcher/Fetcher").Fetcher
  ): Promise<Publication> {
    const resource = await fetcher.getByHref(url.href);
    const manifestJSON = JSON.parse(resource.text);
    const manifest = Manifest.deserialize(manifestJSON);
    if (!manifest) {
      throw new Error(`Failed to parse manifest from ${url.href}`);
    }
    manifest.setSelfLink(url.href);
    return new Publication(manifest, url);
  }

  // ── Core properties (camelCase) ──────────────────────────────

  get metadata() {
    return this.manifest.metadata;
  }

  get readingOrder(): Link[] {
    if (!this._readingOrder) {
      this._readingOrder = toLinks(this.manifest.readingOrder?.items);
    }
    return this._readingOrder;
  }

  get resources(): Link[] {
    if (!this._resources) {
      this._resources = toLinks(this.manifest.resources?.items);
    }
    return this._resources;
  }

  get tableOfContents(): Link[] {
    if (this.sample?.isSampleRead && this.positions?.length > 0) {
      return this.limitedTOC();
    }
    if (!this._toc) {
      this._toc = toLinks(this.manifest.toc?.items);
    }
    return this._toc;
  }

  get landmarks(): Link[] {
    return toLinks(
      this.manifest.subcollections?.get("landmarks")?.[0]?.links?.items
    );
  }

  get pageList(): Link[] {
    return toLinks(
      this.manifest.subcollections?.get("pageList")?.[0]?.links?.items
    );
  }

  get links(): Link[] {
    if (!this._links) {
      this._links = toLinks(this.manifest.links?.items);
    }
    return this._links;
  }

  /**
   * The publication's cover image, if any. Delegates to Readium
   * shared's `Publication.getCover()` — first looks for `rel="cover"`
   * across links / resources / readingOrder, then falls back to any
   * bitmap or SVG image. Returns `undefined` when nothing matches.
   * Resolve to a usable URL with `getAbsoluteHref(cover.href)`.
   */
  get cover(): Link | undefined {
    const found = this.readiumPublication.getCover();
    return found ? toLink(found) : undefined;
  }

  /**
   * The publication's timeline — readingOrder cross-referenced with
   * the table of contents. Each readingOrder item becomes one
   * top-level `TimelineItem`; TOC entries with fragments (e.g. an
   * audio `#t=60` cue, EPUB anchor `#section-2`) become flat
   * children of the matching item. Useful for rendering a chapter
   * list with parts/sections nested below each chapter.
   *
   * Built once and cached on first access. Delegates to Readium
   * shared's `Publication.timeline`.
   */
  get timeline() {
    return this.readiumPublication.timeline;
  }

  /** Lazy Readium Publication instance — used by `cover`, `timeline`, etc. */
  private get readiumPublication(): ReadiumPublication {
    if (!this._readiumPublication) {
      this._readiumPublication = new ReadiumPublication({
        manifest: this.manifest,
      });
    }
    return this._readiumPublication;
  }

  // ── Layout detection ─────────────────────────────────────────

  get isFixedLayout(): boolean {
    // @readium/shared uses metadata.layout for RWPM "layout" key
    if (this.metadata?.layout === "fixed") return true;
    // EPUB streamers output layout in different formats:
    // "rendition:layout": "pre-paginated" (colon key)
    // "rendition": { "layout": "fixed" } (nested object)
    const renditionLayout =
      this.metadata?.otherMetadata?.["rendition:layout"] ??
      this.metadata?.otherMetadata?.rendition?.layout;
    return renditionLayout === "pre-paginated" || renditionLayout === "fixed";
  }

  get isReflowable(): boolean {
    return !this.isFixedLayout;
  }

  get layout(): "fixed" | "reflowable" {
    return this.isFixedLayout ? "fixed" : "reflowable";
  }

  get hasMediaOverlays(): boolean {
    return this.readingOrder?.some((el) => el.mediaOverlay != null) ?? false;
  }

  // ── Convenience metadata accessors (camelCase) ───────────────

  get publicationLanguages(): string[] | undefined {
    return this.metadata?.languages;
  }

  get publicationTitle(): any {
    return this.metadata?.title;
  }

  get publicationReadingProgression(): string | undefined {
    return this.metadata?.readingProgression;
  }

  // ── Spine navigation ─────────────────────────────────────────

  public getStartLink(): Link | undefined {
    if (this.readingOrder !== undefined && this.readingOrder.length > 0) {
      return this.readingOrder[0];
    }
    return undefined;
  }

  public getPreviousSpineItem(href: string): Link | undefined {
    const index = this.getSpineIndex(href);
    if (index !== undefined && index > 0) {
      return this.readingOrder[index - 1];
    }
    return undefined;
  }

  public getNextSpineItem(href: string): Link | undefined {
    const index = this.getSpineIndex(href);
    if (index !== undefined && index < this.readingOrder.length - 1) {
      return this.readingOrder[index + 1];
    }
    return undefined;
  }

  public getSpineItem(href: string): Link | undefined {
    const index = this.getSpineIndex(href);
    if (index !== undefined) {
      return this.readingOrder[index];
    }
    return undefined;
  }

  public getSpineIndex(href: string): number | undefined {
    const idx = this.readingOrder?.findIndex(
      (item) => item.href && this.getAbsoluteHref(item.href) === href
    );
    return idx !== undefined && idx >= 0 ? idx : undefined;
  }

  // ── URL resolution ───────────────────────────────────────────

  public getAbsoluteHref(href: string): string {
    return new URL(href, this.manifestUrl.href).href;
  }

  public getRelativeHref(href: string): string {
    const manifest = this.manifestUrl.href.replace("/manifest.json", "");
    let h = href.replace(manifest, "");
    if (h.indexOf("#") > 0) {
      h = h.slice(0, h.indexOf("#"));
    }
    if (h.charAt(0) === "/") {
      h = h.substring(1);
    }
    return h;
  }

  // ── TOC lookup ───────────────────────────────────────────────

  public getTOCItemAbsolute(href: string): Link | undefined {
    const absolute = this.getAbsoluteHref(href);
    const findItem = (href: string, links: Array<Link>): Link | undefined => {
      for (const item of links) {
        if (item.href) {
          const hrefAbsolute =
            item.href.indexOf("#") !== -1
              ? item.href.slice(0, item.href.indexOf("#"))
              : item.href;
          const itemUrl = this.getAbsoluteHref(hrefAbsolute);
          if (itemUrl === href) {
            return item;
          }
        }
        if (item.children?.items) {
          const childItem = findItem(href, item.children.items as Link[]);
          if (childItem !== undefined) {
            return childItem;
          }
        }
      }
      return undefined;
    };
    let link = findItem(absolute, this.tableOfContents);
    if (link === undefined) {
      link = findItem(absolute, this.readingOrder);
    }
    return link;
  }

  public getTOCItem(href: string): Link | undefined {
    const findItem = (href: string, links: Array<Link>): Link | undefined => {
      for (const item of links) {
        if (item.href) {
          const itemUrl = this.getAbsoluteHref(item.href);
          if (itemUrl === href) {
            return item;
          }
        }
        if (item.children?.items) {
          const childItem = findItem(href, item.children.items as Link[]);
          if (childItem !== undefined) {
            return childItem;
          }
        }
      }
      return undefined;
    };
    let link = findItem(href, this.tableOfContents);
    if (link === undefined) {
      link = findItem(href, this.readingOrder);
    }
    if (link === undefined) {
      if (href.indexOf("#") !== -1) {
        const newResource = href.slice(0, href.indexOf("#"));
        link = findItem(newResource, this.tableOfContents);
        if (link === undefined) {
          link = findItem(newResource, this.readingOrder);
        }
      }
    }
    return link;
  }

  // ── Position management ──────────────────────────────────────

  public positionsByHref(href: string) {
    const decodedHref = decodeURI(href) ?? "";
    return this.positions?.filter((p: Locator) => decodedHref.includes(p.href));
  }

  async autoGeneratePositions(
    requestConfig: RequestConfig | undefined,
    getContentBytesLength: GetContentBytesLength
  ) {
    let startPosition = 0;
    let totalContentLength = 0;
    const positions: Locator[] = [];

    if (this.readingOrder !== undefined) {
      for (const link of this.readingOrder) {
        if (this.isFixedLayout) {
          const locator: Locator = {
            href: link.href,
            locations: {
              progression: 0,
              position: startPosition + 1,
            },
            type: link.type,
          };
          positions.push(locator);
          startPosition = startPosition + 1;
        } else {
          let href = this.getAbsoluteHref(link.href);
          let length = await getContentBytesLength(href, requestConfig);
          link.contentLength = length;
          totalContentLength += length;
          let positionLength = 1024;
          let positionCount = Math.max(1, Math.ceil(length / positionLength));
          for (let position = 0; position < positionCount; position++) {
            const locator: Locator = {
              href: link.href,
              locations: {
                progression: position / positionCount,
                position: startPosition + (position + 1),
              },
              type: link.type,
            };
            positions.push(locator);
          }
          startPosition = startPosition + positionCount;
        }
      }
    }

    var totalweight = 0;
    if (this.isReflowable && this.readingOrder !== undefined) {
      for (const link of this.readingOrder) {
        if (!link.contentLength) {
          console.error("Link is missing contentLength", link);
          return;
        }
        link.contentWeight = (100 / totalContentLength) * link.contentLength;
        totalweight = totalweight + link.contentWeight;
      }
    }

    for (const locator of positions) {
      const resource = positions.filter(
        (el: Locator) => el.href === decodeURI(locator.href)
      );
      const positionIndex = Math.ceil(
        (locator.locations.progression ? locator.locations.progression : 0) *
          (resource.length - 1)
      );
      if (locator.locations.position) {
        locator.locations.totalProgression =
          (locator.locations.position - 1) / positions.length;
      }
      locator.locations.remainingPositions = Math.abs(
        positionIndex - (resource.length - 1)
      );
      if (locator.locations.position) {
        locator.locations.totalRemainingPositions = Math.abs(
          locator.locations.position - 1 - (positions.length - 1)
        );
      }
    }

    this.positions = positions;
  }

  async fetchPositionsFromService(
    href: string,
    fetcher: import("../../fetcher/Fetcher").Fetcher
  ) {
    const resource = await fetcher.getByHref(href);
    const content = JSON.parse(resource.text);
    this.positions = content.positions;
  }

  async fetchWeightsFromService(
    href: string,
    fetcher: import("../../fetcher/Fetcher").Fetcher
  ) {
    if (this.isFixedLayout) {
      console.warn(
        "Not fetching weights from service for fixed layout publication."
      );
      return;
    }
    const resource = await fetcher.getByHref(href);
    const weights = JSON.parse(resource.text);
    if (this.readingOrder !== undefined) {
      this.readingOrder.forEach((link) => {
        link.contentWeight = weights[link.href];
      });
    }
  }

  // ── Sample read ──────────────────────────────────────────────

  private limitedTOC(): Link[] {
    type MutableHref = {
      href: string | undefined;
      children?: { items?: MutableHref[] };
    };

    function disableChildren(item: MutableHref) {
      for (const child of item.children?.items ?? []) {
        child.href = undefined;
        if (child.children) {
          disableChildren(child);
        }
      }
    }

    let toc = (this._toc ?? toLinks(this.manifest.toc?.items)).map((item) => {
      if (item.href) {
        const positions = this.positionsByHref(this.getRelativeHref(item.href));
        if (positions?.length > 0) {
          const locator = positions[0];
          let progress = Math.round(
            (locator.locations.totalProgression
              ? locator.locations.totalProgression
              : 0) * 100
          );
          if (this.sample?.limit) {
            let valid = progress <= this.sample.limit;
            if (!valid) {
              (item as unknown as MutableHref).href = undefined;
              if (item.children?.items) {
                disableChildren(item as unknown as MutableHref);
              }
            }
          }
        }
      }
      return item;
    });
    return toc || [];
  }
}
