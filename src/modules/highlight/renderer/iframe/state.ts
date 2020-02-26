
/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */


import { IEventPayload_R2_EVENT_READING_LOCATION } from "../../common/events";
import { Link } from '../../../../model/Publication';

export interface IReadiumIFrameWindowState {

    hashElement: Element | null;
    locationHashOverride: Element | undefined;
    locationHashOverrideInfo: IEventPayload_R2_EVENT_READING_LOCATION | undefined;

}
export interface IReadiumIFrameWindow extends Window {
    READIUM2: IReadiumIFrameWindowState;
}

export interface IReadiumIFrameState {
    id: number;
    link: Link | undefined;
}
export interface IReadiumIFrame extends HTMLIFrameElement {
    READIUM2: IReadiumIFrameState;
}
