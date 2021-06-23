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
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import { Link as R2Link } from "r2-shared-js/dist/es6-es2015/src/models/publication-link";
import { JsonObject } from "ta-json-x";

export class D2Link {
  href?: string;
  type?: string;
  title?: string;
}

@JsonObject()
export class Link extends R2Link {
  contentLength?: number;
  contentWeight?: number;
}
