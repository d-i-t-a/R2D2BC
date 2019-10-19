/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. Aferdita Muriqi. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import BookView from "./BookView";

interface PaginatedBookView extends BookView {
    onFirstPage(): boolean;
    onLastPage(): boolean;
    goToPreviousPage(): void;
    goToNextPage(): void;
    getCurrentPage(): number;
    getPageCount(): number;
}
export default PaginatedBookView;