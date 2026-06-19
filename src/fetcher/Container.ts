/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Read-only container of named entries.
 *
 * A Container provides access to a collection of resources by path.
 * It knows what entries exist and can return their raw bytes, but
 * doesn't know anything about Fetcher, Resource, or media types.
 *
 * Implementations:
 * - ZipContainer — entries from a ZIP archive (EPUB, CBZ)
 * - Future: HttpContainer, FileSystemContainer, etc.
 */
export interface Container {
  /** All entry paths in the container. */
  entries(): string[];

  /** Get raw bytes for an entry, or undefined if not found. */
  get(path: string): Uint8Array | undefined;

  /** Check if an entry exists. */
  has(path: string): boolean;

  /** Release resources (close file handles, free memory). */
  destroy(): void;
}
