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
import {
  Locator,
  Bookmark,
  Annotation,
  Locations,
} from "../../src/model/Locator";

describe("Locator model", () => {
  it("creates a minimal Locator", () => {
    const loc: Locator = {
      href: "chapter1.xhtml",
      locations: { progression: 0.5 },
      title: "Chapter 1",
    };
    expect(loc.href).toBe("chapter1.xhtml");
    expect(loc.locations.progression).toBe(0.5);
  });

  it("supports totalProgression and position in Locations", () => {
    const locations: Locations = {
      progression: 0.25,
      totalProgression: 0.1,
      position: 5,
      remainingPositions: 45,
    };
    expect(locations.totalProgression).toBe(0.1);
    expect(locations.position).toBe(5);
    expect(locations.remainingPositions).toBe(45);
  });

  it("Bookmark extends Locator with id and created", () => {
    const bm: Bookmark = {
      id: "bm1",
      href: "chapter2.xhtml",
      locations: { progression: 0.75 },
      created: new Date(2025, 0, 1),
    };
    expect(bm.id).toBe("bm1");
    expect(bm.created).toBeInstanceOf(Date);
  });

  it("Annotation includes highlight data", () => {
    const ann: Annotation = {
      id: "ann1",
      href: "chapter1.xhtml",
      locations: { progression: 0.3 },
      created: new Date(),
      highlight: {
        id: "h1",
        selectionInfo: {
          rangeInfo: {
            startContainerElementCssSelector: "p.intro",
            startContainerChildTextNodeIndex: 0,
            startOffset: 10,
            endContainerElementCssSelector: "p.intro",
            endContainerChildTextNodeIndex: 0,
            endOffset: 25,
          },
          rawText: "sample text",
          cleanText: "sample text",
        },
        color: "#ffc800",
        marker: 0,
        pointerInteraction: true,
      },
    } as Annotation;

    expect(ann.highlight?.selectionInfo.rawText).toBe("sample text");
    expect(ann.highlight?.color).toBe("#ffc800");
  });
});
