/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import log from "loglevel";
import { ReaderModule } from "./ReaderModule";
import type { ModuleHost } from "./ModuleHost";
import type {
  NavigatorFeatureKey,
  NavigatorFeatureMap,
} from "./NavigatorFeatureMap";
import type { ReaderRights } from "../navigator/types";

/**
 * Registry for reader feature modules.
 *
 * - Typed lookups via NavigatorFeatureMap — `get("bookmarks")` returns
 *   `BookmarkModule | undefined` without casts.
 * - Rights gating — modules declare a `rightsKey`; the registry filters
 *   them out of lookups and lifecycle calls when the flag is false.
 * - Dependency ordering — `setupAll()` topologically sorts modules by
 *   their declared `dependencies`, breaking cycles with a warning.
 */
export class ModuleRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private modules = new Map<string, ReaderModule<any>>();

  constructor(
    private readonly rightsProvider: () => Partial<ReaderRights> = () => ({})
  ) {}

  register<H extends ModuleHost>(module: ReaderModule<H>, host: H): void {
    module.attach(host);
    this.modules.set(module.name, module);
  }

  /** Typed lookup for built-in features. */
  get<K extends NavigatorFeatureKey>(
    name: K
  ): NavigatorFeatureMap[K] | undefined;
  /** Untyped lookup for custom modules not in NavigatorFeatureMap. */
  get<T extends ReaderModule = ReaderModule>(name: string): T | undefined;
  get(name: string): ReaderModule | undefined {
    const mod = this.modules.get(name);
    if (!mod) return undefined;
    if (!this.isRightsEnabled(mod)) return undefined;
    return mod;
  }

  /** Returns true if a module is registered AND its rights flag (if any) is enabled. */
  has(name: string): boolean {
    const mod = this.modules.get(name);
    if (!mod) return false;
    return this.isRightsEnabled(mod);
  }

  private isRightsEnabled(module: ReaderModule): boolean {
    if (!module.rightsKey) return true;
    const rights = this.rightsProvider();
    return !!rights[module.rightsKey];
  }

  async setupAll(): Promise<void> {
    const ordered = this.topoSort();
    for (const module of ordered) {
      if (!this.isRightsEnabled(module)) continue;
      await module.setup?.();
    }
  }

  notifyResourceReady(): void {
    for (const module of this.modules.values()) {
      if (!this.isRightsEnabled(module)) continue;
      module.onResourceReady?.();
    }
  }

  stopAll(): void {
    // stop() is called even for rights-gated modules — they may hold
    // resources from a prior session. Modules should be no-op-safe.
    for (const module of this.modules.values()) {
      module.stop();
    }
  }

  /**
   * Topological sort by declared dependencies. Kahn's algorithm.
   * Missing dependencies are warned and ignored. Cycles are warned
   * and broken by falling back to insertion order for remaining modules.
   */
  private topoSort(): ReaderModule[] {
    const all = [...this.modules.values()];
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const mod of all) {
      indegree.set(mod.name, 0);
      dependents.set(mod.name, []);
    }
    for (const mod of all) {
      for (const depName of mod.dependencies ?? []) {
        if (!this.modules.has(depName)) {
          log.warn(
            `Module "${mod.name}" depends on "${depName}" which is not registered — skipping dependency.`
          );
          continue;
        }
        indegree.set(mod.name, (indegree.get(mod.name) ?? 0) + 1);
        dependents.get(depName)!.push(mod.name);
      }
    }

    const queue: string[] = all
      .filter((m) => (indegree.get(m.name) ?? 0) === 0)
      .map((m) => m.name);
    const result: ReaderModule[] = [];

    while (queue.length > 0) {
      const name = queue.shift()!;
      const mod = this.modules.get(name);
      if (mod) result.push(mod);
      for (const dep of dependents.get(name) ?? []) {
        const next = (indegree.get(dep) ?? 0) - 1;
        indegree.set(dep, next);
        if (next === 0) queue.push(dep);
      }
    }

    if (result.length < all.length) {
      const remaining = all.filter((m) => !result.includes(m));
      log.warn(
        `Module dependency cycle detected involving: ${remaining
          .map((m) => m.name)
          .join(", ")} — falling back to insertion order for these.`
      );
      result.push(...remaining);
    }

    return result;
  }
}
