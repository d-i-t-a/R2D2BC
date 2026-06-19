/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { unzipSync } from "fflate";
import type { Container } from "./Container";

/**
 * Container backed by a ZIP archive (EPUB, CBZ, etc.).
 *
 * Parses the ZIP on construction and provides read-only access to
 * entries by path. All paths are as stored in the ZIP — no
 * basePath resolution happens here (that's the Fetcher's job).
 */
export class ZipContainer implements Container {
  private data: Record<string, Uint8Array>;

  constructor(input: ArrayBuffer | Uint8Array) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.data = unzipSync(bytes);
  }

  entries(): string[] {
    return Object.keys(this.data);
  }

  get(path: string): Uint8Array | undefined {
    return this.data[path];
  }

  has(path: string): boolean {
    return path in this.data;
  }

  destroy(): void {
    this.data = {};
  }
}
