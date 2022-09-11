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

import { ISelectionInfo } from "./selection";
import { AnnotationMarker } from "../../../model/Locator";
import { Definition } from "../../search/DefinitionsModule";

export interface IColor {
  red: number;
  green: number;
  blue: number;
}

export interface IStyleProperty {
  property: string;
  value: string;
  priority?: string;
}

export interface IStyle {
  default?: [IStyleProperty] | undefined;
  hover?: [IStyleProperty] | undefined;
  defaultClass?: string | undefined;
  hoverClass?: string | undefined;
}

export interface IPopupStyle {
  background?: string;
  textColor?: string;
  class?: string;
}

export interface IHighlightStyle {
  style?: IStyle;
  color?: string;
}

export interface IMarkerIcon {
  id: string;
  position: string;
  title: string;
  svgPath?: string;
  color?: string;
  class?: string;
}

export enum HighlightType {
  Annotation = 0,
  Search = 1,
  ReadAloud = 2,
  PageBreak = 3,
  Definition = 4,
  LineFocus = 5,
  Comment = 6,
}

export interface IHighlight {
  id: string;
  selectionInfo: ISelectionInfo;
  pointerInteraction: boolean;
  marker: AnnotationMarker;

  icon?: IMarkerIcon | undefined;
  popup?: IPopupStyle | undefined;

  color: string;
  style?: IStyle | undefined;

  position?: number;
  note?: string | null | undefined;
  definition?: Definition | undefined;

  type: HighlightType;
}

export interface SelectionMenuItem {
  id: string;
  callback?: any;
  marker?: AnnotationMarker;
  icon?: IMarkerIcon;
  popup?: IPopupStyle;
  highlight?: IHighlightStyle;
  note?: boolean;
}

export interface IHighlightDefinition {
  selectionInfo: ISelectionInfo | undefined;
  color: string | undefined;
}
