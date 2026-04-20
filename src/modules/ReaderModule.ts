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

import type { ModuleHost } from "./ModuleHost";
import type { ReaderRights } from "../navigator/types";
import type { NavigatorFeatureKey } from "./NavigatorFeatureMap";

/**
 * Enum-like constant for navigator host types.
 * Modules declare `readonly hostType = HostType.Epub` (or .PDF).
 */
export const HostType = {
  Epub: "epub",
  PDF: "pdf",
} as const;
export type HostTypeName = (typeof HostType)[keyof typeof HostType];

/**
 * Enum-like constant for rights flag names.
 * Modules declare `readonly rightsKey = RightsKey.Bookmarks`.
 * Keys mirror the fields of `ReaderRights` — TypeScript enforces
 * the mapping via `keyof ReaderRights`.
 */
export const RightsKey = {
  Bookmarks: "enableBookmarks",
  Annotations: "enableAnnotations",
  TTS: "enableTTS",
  Search: "enableSearch",
  Definitions: "enableDefinitions",
  ContentProtection: "enableContentProtection",
  Timeline: "enableTimeline",
  MediaOverlays: "enableMediaOverlays",
  PageBreaks: "enablePageBreaks",
  LineFocus: "enableLineFocus",
  History: "enableHistory",
  Citations: "enableCitations",
  Consumption: "enableConsumption",
} as const satisfies Record<string, keyof ReaderRights>;
export type RightsKeyName = (typeof RightsKey)[keyof typeof RightsKey];

/**
 * Base interface for all optional reader feature modules.
 *
 * Modules register by `name` (matches NavigatorFeature constants)
 * and receive lifecycle callbacks from the navigator.
 *
 * The host is injected via `attach(host)` during registration — before
 * any other lifecycle method runs. Modules store it privately and use
 * it throughout their lifetime. The host is never exposed on the public
 * interface, so consumers can't mutate it after registration.
 *
 * @typeParam H — the host interface this module requires
 */
export interface ReaderModule<H extends ModuleHost = ModuleHost> {
  /** Unique capability key for registry lookup (e.g. "bookmarks", "search") */
  readonly name: string;

  /** Which navigator type this module requires. Must be declared. */
  readonly hostType: HostTypeName;

  /**
   * Optional rights flag that gates this module. When set, the registry
   * returns undefined from `get()`/`has()` for this module if the
   * corresponding rights flag is false. Custom modules may leave this
   * undefined (always available once registered).
   */
  readonly rightsKey?: keyof ReaderRights;

  /**
   * Optional list of feature keys that must be set up before this module.
   * The registry topologically sorts `setupAll()` to honor dependencies.
   * Missing or rights-gated dependencies emit a warning and are skipped.
   */
  readonly dependencies?: readonly NavigatorFeatureKey[];

  /**
   * Capture the host reference. Called exactly once by the registry
   * during `register()`, before any other lifecycle method.
   * Typical implementation: `attach(host) { this.host = host; }`.
   */
  attach(host: H): void;

  /** Called once after navigator setup is complete */
  setup?(): void | Promise<void>;

  /** Called when a new resource loads (iframe content ready) */
  onResourceReady?(): void;

  /** Clean up event listeners and resources when the reader is destroyed */
  stop(): void;
}
