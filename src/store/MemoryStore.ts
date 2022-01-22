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

import Store from "./Store";

/** Class that stores key/value pairs in memory. */
export default class MemoryStore implements Store {
  private readonly store: { [key: string]: string | null };

  public constructor() {
    this.store = {};
  }

  public get(key: string): string | null {
    return this.store[key] || null;
  }

  public set(key: string, value: string): void {
    this.store[key] = value;
  }

  public remove(key: string): void {
    this.store[key] = null;
  }
}
