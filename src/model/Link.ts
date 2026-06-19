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

export { Link, D2Link, Links } from "./v3/Link";

/**
 * Converts @readium/shared objects to plain JSON-safe objects.
 * Unwraps Links wrappers (.items), converts Sets to Arrays,
 * and recursively processes nested objects.
 */
export function toPlainObject(o: any): any {
  if (o == null) return o;
  if (o instanceof Set) return Array.from(o);
  if (o.items && Array.isArray(o.items)) return o.items.map(toPlainObject);
  if (Array.isArray(o)) return o.map(toPlainObject);
  if (typeof o !== "object") return o;

  const result: any = {};
  for (const key in o) {
    if (!o.hasOwnProperty(key)) continue;
    result[key] = toPlainObject(o[key]);
  }
  return result;
}

/**
 * @deprecated Use toPlainObject() instead.
 */
export const convertAndCamel = toPlainObject;
