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
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

export const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

document.addEventListener(
  "click",
  async (_event) => {
    // var htmlElement = event.target as HTMLElement
    if (IS_DEV) console.log("Empty Click Handler");
    // console.log(htmlElement.outerHTML)
  },
  true
);
