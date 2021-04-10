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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { IDocInfo } from "./document";
import { IHighlight, IHighlightDefinition } from "./highlight";
// import { IPaginationInfo } from "./pagination";
import { ISelectionInfo } from "./selection";
import { Locator } from "../../../model/Locator";

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_SCROLLTO = "R2_EVENT_SCROLLTO";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_SCROLLTO {
  goto: string | undefined;
  hash: string | undefined;
  previous: boolean;
}

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_PAGE_TURN = "R2_EVENT_PAGE_TURN";

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_PAGE_TURN_RES = "R2_EVENT_PAGE_TURN_RES";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_PAGE_TURN {
  direction: string;
  go: string;
}

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_READING_LOCATION = "R2_EVENT_READING_LOCATION";

// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_READING_LOCATION extends Locator {
  selectionInfo: ISelectionInfo | undefined;
  docInfo: IDocInfo | undefined;
  selectionIsNew: boolean | undefined;
}

// in MAIN: browserWindow.webContents.send()
// in RENDERER: ipcRenderer.on()
// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_LINK = "R2_EVENT_LINK";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_LINK {
  url: string;
}

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_SHIFT_VIEW_X = "R2_EVENT_SHIFT_VIEW_X";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_SHIFT_VIEW_X {
  offset: number;
  backgroundColor: string | undefined;
}

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_CLICK_ENABLE = "R2_EVENT_TTS_CLICK_ENABLE";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_TTS_CLICK_ENABLE {
  doEnable: boolean;
}

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_DO_PLAY = "R2_EVENT_TTS_DO_PLAY";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_TTS_DO_PLAY {
  rootElement: string; // CSS selector
  startElement: string | undefined; // CSS selector
}

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_DO_PAUSE = "R2_EVENT_TTS_DO_PAUSE";

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_DO_RESUME = "R2_EVENT_TTS_DO_RESUME";

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_DO_STOP = "R2_EVENT_TTS_DO_STOP";

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_TTS_IS_STOPPED = "R2_EVENT_TTS_IS_STOPPED";

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_TTS_IS_PAUSED = "R2_EVENT_TTS_IS_PAUSED";

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_TTS_IS_PLAYING = "R2_EVENT_TTS_IS_PLAYING";

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_DO_NEXT = "R2_EVENT_TTS_DO_NEXT";

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_TTS_DO_PREVIOUS = "R2_EVENT_TTS_DO_PREVIOUS";

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_HIGHLIGHT_CREATE = "R2_EVENT_HIGHLIGHT_CREATE";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_HIGHLIGHT_CREATE {
  highlightDefinitions: IHighlightDefinition[] | undefined;
  highlights: Array<IHighlight | null> | undefined; // return value, see below (R2_EVENT_HIGHLIGHT_CREATE_RES)
}
// // in WEBVIEW: ipcRenderer.sendToHost()
// // in RENDERER: webview.addEventListener("ipc-message")
// export const R2_EVENT_HIGHLIGHT_CREATE_RES = "R2_EVENT_HIGHLIGHT_CREATE_RES";
// // tslint:disable-next-line:class-name
// export interface IEventPayload_R2_EVENT_HIGHLIGHT_CREATE_RES {
//     highlightID: string;
// }

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_HIGHLIGHT_REMOVE = "R2_EVENT_HIGHLIGHT_REMOVE";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_HIGHLIGHT_REMOVE {
  highlightIDs: string[];
}

// in RENDERER: webview.send()
// in WEBVIEW: ipcRenderer.on()
export const R2_EVENT_HIGHLIGHT_REMOVE_ALL = "R2_EVENT_HIGHLIGHT_REMOVE_ALL";

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_HIGHLIGHT_CLICK = "R2_EVENT_HIGHLIGHT_CLICK";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_HIGHLIGHT_CLICK {
  highlight: IHighlight;
}

// in WEBVIEW: ipcRenderer.sendToHost()
// in RENDERER: webview.addEventListener("ipc-message")
export const R2_EVENT_WEBVIEW_KEYDOWN = "R2_EVENT_WEBVIEW_KEYDOWN";
// tslint:disable-next-line:class-name
export interface IEventPayload_R2_EVENT_WEBVIEW_KEYDOWN {
  keyCode: number;
}
