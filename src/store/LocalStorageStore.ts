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
import MemoryStore from "./MemoryStore";

export interface LocalStorageStoreConfig {
  /** String to prepend to keys in localStorage. If the same prefix is shared
        across LocalStorageStores on the same domain, they will have the same
        value for each key. */
  prefix: string;
  useLocalStorage: boolean;
  useStorageType: string | undefined;
}

/** Class that stores key/value pairs in localStorage if possible
    but falls back to an in-memory store. */
export default class LocalStorageStore implements Store {
  private readonly fallbackStore: MemoryStore | null;
  private readonly prefix: string;
  private readonly useLocalStorage: boolean;
  private readonly useStorageType: string | undefined;

  public constructor(config: LocalStorageStoreConfig) {
    this.prefix = config.prefix;
    this.useLocalStorage = config.useLocalStorage;
    this.useStorageType = config.useStorageType;
    try {
      // In some browsers (eg iOS Safari in private mode),
      // localStorage exists but throws an exception when
      // you try to write to it.
      const testKey = config.prefix + "-" + String(Math.random());
      if (this.useStorageType === "memory") {
        this.fallbackStore = new MemoryStore();
      } else if (this.useStorageType === "local" || this.useLocalStorage) {
        window.localStorage.setItem(testKey, "test");
        window.localStorage.removeItem(testKey);
        this.fallbackStore = null;
      } else if (this.useStorageType === "session" || !this.useLocalStorage) {
        window.sessionStorage.setItem(testKey, "test");
        window.sessionStorage.removeItem(testKey);
        this.fallbackStore = null;
      }
    } catch (e) {
      this.fallbackStore = new MemoryStore();
    }
  }

  private getLocalStorageKey(key: string): string {
    return this.prefix + "-" + key;
  }

  public get(key: string): any | null {
    let value: string | null;
    if (!this.fallbackStore) {
      if (this.useStorageType === "local" || this.useLocalStorage) {
        value = window.localStorage.getItem(this.getLocalStorageKey(key));
      } else {
        value = window.sessionStorage.getItem(this.getLocalStorageKey(key));
      }
    } else {
      value = this.fallbackStore.get(key);
    }
    return value;
  }

  public set(key: string, value: any) {
    if (!this.fallbackStore) {
      if (this.useStorageType === "local" || this.useLocalStorage) {
        window.localStorage.setItem(this.getLocalStorageKey(key), value);
      } else {
        window.sessionStorage.setItem(this.getLocalStorageKey(key), value);
      }
    } else {
      this.fallbackStore.set(key, value);
    }
  }

  public remove(key: string) {
    if (!this.fallbackStore) {
      if (this.useStorageType === "local" || this.useLocalStorage) {
        window.localStorage.removeItem(this.getLocalStorageKey(key));
      } else {
        window.sessionStorage.removeItem(this.getLocalStorageKey(key));
      }
    } else {
      this.fallbackStore.remove(key);
    }
  }
}
