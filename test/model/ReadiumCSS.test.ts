/*
 * Copyright 2018-2025 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from "vitest";
import { ReadiumCSS } from "../../src/model/user-settings/ReadiumCSS";

describe("ReadiumCSS constants", () => {
  it("user-setting KEYs follow the --USER__<ref> pattern", () => {
    // Integrator-controlled settings live under --USER__*. Most have a
    // matching REF (the bare setting name); when a REF is present the
    // KEY must equal "--USER__" + REF. A few --USER__ keys are applied
    // only by DITA Toolkit internally (e.g. FONT_SIZE_NORMALIZE, a v1 fallback
    // activated when the browser does not support CSS zoom) and have no
    // integrator-facing REF.
    const userKeyEntries = Object.entries(ReadiumCSS).filter(
      ([name, value]) =>
        name.endsWith("_KEY") &&
        typeof value === "string" &&
        (value as string).startsWith("--USER__")
    );

    expect(userKeyEntries.length).toBeGreaterThan(0);

    for (const [name, value] of userKeyEntries) {
      expect(value).toMatch(/^--USER__\w+$/);
      const refName = name.replace("_KEY", "_REF");
      const ref = (ReadiumCSS as any)[refName];
      if (ref !== undefined) {
        expect(value).toBe("--USER__" + ref);
      }
    }
  });

  it("reading-system KEYs follow the --RS__<name> pattern", () => {
    // Reading-system properties (e.g. scroll padding) live under --RS__*.
    // They are applied directly by DITA Toolkit and don't expose a REF to the
    // integrator, so the pattern check is simpler.
    const rsKeyEntries = Object.entries(ReadiumCSS).filter(
      ([name, value]) =>
        name.endsWith("_KEY") &&
        typeof value === "string" &&
        (value as string).startsWith("--RS__")
    );

    for (const [, value] of rsKeyEntries) {
      expect(value).toMatch(/^--RS__\w+$/);
    }
  });

  it("has KEY/REF pairs for all 6 new v2.5 properties", () => {
    const newProps = [
      "BODY_HYPHENS",
      "PARA_SPACING",
      "PARA_INDENT",
      "TYPE_SCALE",
      "BACKGROUND_COLOR",
      "TEXT_COLOR",
    ];

    for (const prop of newProps) {
      const ref = (ReadiumCSS as any)[prop + "_REF"];
      const key = (ReadiumCSS as any)[prop + "_KEY"];
      expect(ref).toBeDefined();
      expect(key).toBeDefined();
      expect(key).toBe("--USER__" + ref);
    }
  });

  it("has all original properties", () => {
    const origProps = [
      "FONT_SIZE",
      "FONT_FAMILY",
      "FONT_OVERRIDE",
      "APPEARANCE",
      "SCROLL",
      "ADVANCED_SETTINGS",
      "TEXT_ALIGNMENT",
      "COLUMN_COUNT",
      "DIRECTION",
      "WORD_SPACING",
      "LETTER_SPACING",
      "PAGE_MARGINS",
      "LINE_HEIGHT",
    ];

    for (const prop of origProps) {
      expect((ReadiumCSS as any)[prop + "_REF"]).toBeDefined();
      expect((ReadiumCSS as any)[prop + "_KEY"]).toBeDefined();
    }
  });
});
