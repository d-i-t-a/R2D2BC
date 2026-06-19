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

import { Link as ReadiumLink, Links as ReadiumLinks } from "@readium/shared";

/**
 * Simple link interface for external use.
 */
export interface D2Link {
  href: string;
  type?: string;
  title?: string;
}

/**
 * DITA Toolkit Link — extends @readium/shared Link with DITA Toolkit extensions.
 *
 * All property access uses camelCase directly (href, type, title, etc.).
 * No Proxy, no PascalCase compat layer — clean code.
 *
 * DITA Toolkit extensions: contentLength, contentWeight, mediaOverlayNode
 */
export class Link extends ReadiumLink {
  /** Byte size of the resource (used for position calculation) */
  contentLength?: number;
  /** Percentage weight for reading progression */
  contentWeight?: number;
  /** Parsed media overlay node (set by MediaOverlayModule after fetching SMIL) */
  mediaOverlayNode?: any;

  /**
   * Media overlay URL from link properties.
   */
  /**
   * Media overlay URL from link properties.
   * The manifest JSON uses hyphenated key "media-overlay".
   */
  get mediaOverlay(): string | undefined {
    return (
      this.properties?.otherProperties?.["media-overlay"] ??
      this.properties?.otherProperties?.["mediaOverlay"]
    );
  }

  /**
   * Decoded href (URL-decoded).
   */
  get hrefDecoded(): string | undefined {
    try {
      return decodeURI(this.href);
    } catch {
      return this.href;
    }
  }

  /**
   * Rels as array (convenience — @readium/shared uses Set).
   */
  get relArray(): string[] {
    return this.rels ? Array.from(this.rels) : [];
  }
}

export { ReadiumLinks as Links };
