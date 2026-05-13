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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import EventEmitter from "eventemitter3";
import log from "loglevel";
import { Locator, Publication, Link } from "../model/v3";
import { ModuleRegistry } from "../modules/ModuleRegistry";
import { ModuleAccessors } from "../modules/ModuleAccessors";
import type { ReaderModule, HostTypeName } from "../modules/ReaderModule";
import type {
  NavigatorFeatureKey,
  NavigatorFeatureMap,
} from "../modules/NavigatorFeatureMap";
import type { NavigatorFeatureName } from "./NavigatorFeature";
import type { NavigatorAPI, ReaderRights } from "./types";

/**
 * Abstract base class for every navigator.
 *
 * Holds the infrastructure that every concrete navigator already
 * has — module registry, event emitter, publication-derived list
 * accessors. Subclasses implement the medium-specific methods
 * (currentLocator, goTo, etc.) and add their own surface
 * (visual rendering, audio playback, etc.).
 *
 * Used as a type by `D2Reader` so it can hold any navigator
 * regardless of medium and call the shared contract.
 */
abstract class Navigator extends EventEmitter {
  abstract readonly publication: Publication;
  abstract readonly rights: Partial<ReaderRights>;
  abstract readonly api?: Partial<NavigatorAPI>;

  // ── Module registry — composition shared by every navigator ──
  readonly registry: ModuleRegistry = new ModuleRegistry(() => this.rights);
  readonly modules: ModuleAccessors = new ModuleAccessors(this.registry);

  /** Whether this navigator supports a given feature (delegates to registry). */
  supports(feature: NavigatorFeatureName): boolean {
    return this.registry.has(feature);
  }

  /** Typed lookup for a built-in module by NavigatorFeature key. */
  getModule<K extends NavigatorFeatureKey>(
    name: K
  ): NavigatorFeatureMap[K] | undefined;
  /** Untyped lookup for custom modules not in NavigatorFeatureMap. */
  getModule<T extends ReaderModule = ReaderModule>(name: string): T | undefined;
  getModule(name: string): ReaderModule | undefined {
    return this.registry.get(name);
  }

  /**
   * Register the integrator-supplied modules with this navigator's
   * registry, validating each against the expected host type. Mismatched
   * modules are logged and skipped — same shape across every navigator.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected registerModules(
    modules: Array<ReaderModule<any> | undefined> | undefined,
    expectedHostType: HostTypeName
  ): void {
    for (const module of modules ?? []) {
      if (!module) continue;
      if (module.hostType !== expectedHostType) {
        log.warn(
          `Module "${module.name}" requires host type "${module.hostType}" but navigator is ${expectedHostType} — skipping`
        );
        continue;
      }
      this.registry.register(module, this);
    }
  }

  // ── Default impls — every concrete navigator had identical bodies ──
  tableOfContents(): Link[] {
    return this.publication.tableOfContents;
  }
  landmarks(): Link[] {
    return this.publication.landmarks;
  }
  pageList(): Link[] {
    return this.publication.pageList;
  }
  readingOrder(): Link[] {
    return this.publication.readingOrder;
  }
  totalResources(): number {
    return this.publication.readingOrder.length;
  }

  // ── Required from subclasses — medium-specific ──
  abstract currentLocator(): Locator;
  abstract currentResource(): number | undefined;
  abstract goTo(locator: Locator): void | Promise<void>;
  abstract goToPosition(value: number): void | Promise<void>;
  abstract nextResource(): void | Promise<void>;
  abstract previousResource(): void | Promise<void>;
  abstract atStart(): boolean;
  abstract atEnd(): boolean;
  abstract stop(): void;
}

export default Navigator;
