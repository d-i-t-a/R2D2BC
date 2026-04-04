/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
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

/**
 * @deprecated Import from "./v3/Link" instead. This file re-exports for backwards compatibility.
 */
export { Link, D2Link, Links } from "./v3/Link";

/**
 * @deprecated No longer needed — @readium/shared uses camelCase natively.
 * Kept for backwards compatibility with code that calls convertAndCamel().
 */
export function convertAndCamel(o: any): any {
  if (o == null) return o;
  // Unwrap @readium/shared Links objects to plain arrays
  if (o.items && Array.isArray(o.items)) {
    return convertAndCamel(o.items);
  }
  let newO: any, origKey: string, newKey: string, value: any;
  if (o instanceof Array) {
    return o.map(function (value: any) {
      if (typeof value === "object") {
        value = convertAndCamel(value);
      }
      return value;
    });
  } else {
    newO = {};
    for (origKey in o) {
      if (o.hasOwnProperty(origKey)) {
        newKey = (
          origKey.charAt(0).toLowerCase() + origKey.slice(1) || origKey
        ).toString();
        value = o[origKey];
        // Unwrap Links objects
        if (value && value.items && Array.isArray(value.items)) {
          value = convertAndCamel(value.items);
        } else if (
          value instanceof Array ||
          (value !== null &&
            value !== undefined &&
            value.constructor === Object)
        ) {
          value = convertAndCamel(value);
        }
        if (newKey === "href1") {
          newO["href"] = value;
        } else if (newKey === "typeLink") {
          newO["type"] = value;
        } else {
          newO[newKey] = value;
        }
      }
    }
  }
  return newO;
}
