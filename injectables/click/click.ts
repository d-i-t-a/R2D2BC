/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */
export const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

document.addEventListener("click", async (_event) => {

    // var htmlElement = event.target as HTMLElement
    if (IS_DEV) console.log("Empty Click Handler")
    // console.log(htmlElement.outerHTML)
        
}, true);
