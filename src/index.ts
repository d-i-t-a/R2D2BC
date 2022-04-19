/*
 * Copyright 2018-2021 DITA (AM Consulting LLC)
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
 * Developed on behalf of: NYPL, Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: NYPL, Bokbasen AS and CAST under one or more contributor license agreements.
 */
import D2Reader from "./reader";

/** R2D2BC Reader */
export default D2Reader;

/** for interop with \<script\> based usage */
export const load = D2Reader.load;

export { Link } from "./model/Link";
export { Locator, ReadingPosition } from "./model/Locator";
