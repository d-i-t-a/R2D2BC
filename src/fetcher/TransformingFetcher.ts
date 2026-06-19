/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { Link } from "../model/v3";
import type { Fetcher, Resource } from "./Fetcher";

/**
 * A transform function applied to resources in the Fetcher chain.
 *
 * Receives a Resource and returns a (possibly modified) Resource.
 * Return the original resource unchanged to pass it through.
 *
 * Transforms run after the inner Fetcher returns the resource,
 * so the content is already fetched/decoded when the transform sees it.
 */
export type ResourceTransform = (
  resource: Resource
) => Resource | Promise<Resource>;

/**
 * Fetcher that applies one or more transforms to resources.
 *
 * Wraps an inner Fetcher and passes every returned Resource through
 * a list of transform functions. Transforms run in order — the output
 * of one is the input of the next.
 *
 * Used for:
 * - Font deobfuscation (IDPF/Adobe XOR on encrypted font bytes)
 * - Future: LCP content key decryption, accessibility transforms
 *
 * Chain position:
 *   CacheFetcher → ContentFetcher → TransformingFetcher → HttpFetcher/ZipFetcher
 *
 * The CacheFetcher caches the TRANSFORMED result, so transforms
 * only run once per resource.
 */
export class TransformingFetcher implements Fetcher {
  private readonly transforms: ResourceTransform[];

  constructor(
    private readonly inner: Fetcher,
    ...transforms: ResourceTransform[]
  ) {
    this.transforms = transforms;
  }

  async get(link: Link): Promise<Resource> {
    let resource = await this.inner.get(link);
    for (const transform of this.transforms) {
      resource = await transform(resource);
    }
    return resource;
  }

  async getByHref(href: string): Promise<Resource> {
    let resource = await this.inner.getByHref(href);
    for (const transform of this.transforms) {
      resource = await transform(resource);
    }
    return resource;
  }

  cancel(href: string): void {
    this.inner.cancel?.(href);
  }

  destroy(): void {
    this.inner.destroy?.();
  }
}
