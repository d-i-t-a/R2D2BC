/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import Store from "./Store";

/** Class that stores key/value pairs in memory. */
export default class MemoryStore implements Store {
    private readonly store: {[key: string]: string};

    public constructor() {
        this.store = {};
    }

    public get(key: string): Promise<string | null> {
        const value = this.store[key] || null;
        return new Promise<string | null>(resolve => resolve(value));
    }

    public set(key: string, value: string): Promise<void> {
        this.store[key] = value;
        return new Promise<void>(resolve => resolve());
    }
}