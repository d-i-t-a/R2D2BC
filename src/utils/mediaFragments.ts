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
 * Developed on behalf of: DITA (AM Consulting LLC)
 */

/**
 * Media Fragments URI 1.0 helpers.
 * https://www.w3.org/TR/media-frags/
 *
 * Used by audiobook (and other time-based) Locators to round-trip
 * temporal positions through the spec-aligned `fragments` array,
 * and to interoperate with other Readium implementations that emit
 * `t=...` fragments per the spec.
 *
 * Supported temporal forms (spec section 4.2.1):
 *   t=N           NPT seconds (default form)
 *   t=N,M         NPT range
 *   t=,M          NPT end-only (start = 0)
 *   t=N,          NPT start-only (open end)
 *   t=npt:N       explicit NPT prefix
 *   t=hh:mm:ss    NPT timecode hh:mm:ss[.fraction]
 *   t=mm:ss       NPT timecode mm:ss[.fraction]
 *
 * SMPTE and UTC time forms are not parsed (audiobook content does not
 * use them in practice). Spatial (xywh) and track fragments pass
 * through opaquely via the underlying `fragments` array.
 */

export interface TimeFragment {
  start?: number;
  end?: number;
}

const TIME_PREFIX = /^t=/;
const NPT_PREFIX = /^npt:/;
const TIMECODE = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/;

/**
 * Parse a single Media Fragments time component (e.g. "120", "60.5", "00:02:00", "npt:60,120").
 * Returns the seconds value, or undefined if the input is not a valid NPT time.
 */
function parseNpt(value: string): number | undefined {
  if (!value) return undefined;

  const stripped = value.replace(NPT_PREFIX, "");
  if (!stripped) return undefined;

  const timecode = TIMECODE.exec(stripped);
  if (timecode) {
    const a = Number(timecode[1]);
    const b = Number(timecode[2]);
    const c = timecode[3] !== undefined ? Number(timecode[3]) : undefined;
    if (c !== undefined) {
      // hh:mm:ss[.f]
      return a * 3600 + b * 60 + c;
    }
    // mm:ss[.f]
    return a * 60 + b;
  }

  const seconds = Number(stripped);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;

  return undefined;
}

/**
 * Parse a single fragment string. Returns a `TimeFragment` if the
 * fragment is a temporal fragment (`t=...`), otherwise `null`.
 *
 * The fragment string is the value as it appears in the Locator's
 * `fragments` array — without any leading `#`.
 */
export function parseTimeFragment(fragment: string): TimeFragment | null {
  if (!fragment || !TIME_PREFIX.test(fragment)) return null;

  const value = fragment.replace(TIME_PREFIX, "");
  if (!value) return null;

  // t=,M or t=N, or t=N,M
  if (value.includes(",")) {
    const [rawStart, rawEnd] = value.split(",", 2);
    const start = rawStart ? parseNpt(rawStart) : undefined;
    const end = rawEnd ? parseNpt(rawEnd) : undefined;
    if (start === undefined && end === undefined) return null;
    return { start, end };
  }

  const start = parseNpt(value);
  if (start === undefined) return null;
  return { start };
}

/**
 * Convenience: extract a start-time in seconds from a fragments array.
 * Scans for the first `t=...` fragment that parses to a usable start.
 * Returns undefined if no temporal fragment is present.
 */
export function parseTimeFromFragments(
  fragments: string[] | undefined
): number | undefined {
  if (!fragments || fragments.length === 0) return undefined;
  for (const frag of fragments) {
    const parsed = parseTimeFragment(frag);
    if (parsed?.start !== undefined) return parsed.start;
  }
  return undefined;
}

/**
 * Serialize a time fragment to its spec-form string.
 *
 * - `serializeTimeFragment(120)` → `"t=120"`
 * - `serializeTimeFragment(60, 120)` → `"t=60,120"`
 * - `serializeTimeFragment(0, 120)` → `"t=0,120"` (preserved; spec allows open start `t=,120` but we emit explicit `0`)
 *
 * Numbers are emitted without `npt:` prefix (the spec default).
 * Non-finite or negative inputs throw.
 */
export function serializeTimeFragment(start: number, end?: number): string {
  if (!Number.isFinite(start) || start < 0) {
    throw new RangeError(`serializeTimeFragment: invalid start ${start}`);
  }
  if (end !== undefined) {
    if (!Number.isFinite(end) || end < start) {
      throw new RangeError(`serializeTimeFragment: invalid end ${end}`);
    }
    return `t=${start},${end}`;
  }
  return `t=${start}`;
}
