/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import { ISelectionInfo } from "./selection";
import { AnnotationMarker } from "../../../model/Locator";

export interface IColor {
    red: number;
    green: number;
    blue: number;
}

export interface IHighlight {
    id: string;
    selectionInfo: ISelectionInfo;
    color: IColor;
    pointerInteraction: boolean;
    marker: AnnotationMarker;
    position?: number;
}

export interface IHighlightDefinition {
    selectionInfo: ISelectionInfo | undefined;
    color: IColor | undefined;
}
