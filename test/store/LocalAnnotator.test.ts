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
import LocalAnnotator from "../../src/store/LocalAnnotator";
import MemoryStore from "../../src/store/MemoryStore";
import { AnnotationType } from "../../src/store/Annotator";
import { Bookmark, Annotation } from "../../src/model/Locator";

function makeAnnotator(): LocalAnnotator {
  return new LocalAnnotator({ store: new MemoryStore() });
}

function makeBookmark(
  href: string,
  progression: number,
  id = Math.random().toString(36).slice(2)
): Bookmark {
  return {
    id,
    href,
    locations: { progression },
    created: new Date(),
  };
}

function makeAnnotation(
  href: string,
  progression: number,
  highlightId = "h_" + Math.random().toString(36).slice(2)
): Annotation {
  return {
    id: highlightId,
    href,
    locations: { progression },
    created: new Date(),
    highlight: {
      id: highlightId,
      selectionInfo: {
        rangeInfo: {
          startContainerElementCssSelector: "p",
          startContainerChildTextNodeIndex: 0,
          startOffset: 0,
          endContainerElementCssSelector: "p",
          endContainerChildTextNodeIndex: 0,
          endOffset: 5,
        },
        rawText: "hello",
        cleanText: "hello",
      },
      color: "#ffff00",
      marker: 0,
      pointerInteraction: true,
    },
  } as Annotation;
}

// ─── Reading Position ────────────────────────────────────────────────────────

describe("LocalAnnotator – reading position", () => {
  it("returns null when nothing stored", () => {
    const a = makeAnnotator();
    expect(a.getLastReadingPosition()).toBeNull();
  });

  it("round-trips a reading position", () => {
    const a = makeAnnotator();
    const pos = makeBookmark("chapter1.xhtml", 0.5) as any;
    pos.created = new Date();
    a.initLastReadingPosition(pos);
    const result = a.getLastReadingPosition() as any;
    expect(result.href).toBe("chapter1.xhtml");
    expect(result.locations.progression).toBe(0.5);
  });

  it("saveLastReadingPosition overwrites previous", () => {
    const a = makeAnnotator();
    const pos1 = {
      ...makeBookmark("ch1.xhtml", 0.1),
      created: new Date(),
    } as any;
    const pos2 = {
      ...makeBookmark("ch2.xhtml", 0.9),
      created: new Date(),
    } as any;
    a.saveLastReadingPosition(pos1);
    a.saveLastReadingPosition(pos2);
    const result = a.getLastReadingPosition() as any;
    expect(result.href).toBe("ch2.xhtml");
  });
});

// ─── Bookmarks ───────────────────────────────────────────────────────────────

describe("LocalAnnotator – bookmarks", () => {
  it("returns empty array when no bookmarks", () => {
    const a = makeAnnotator();
    expect(a.getBookmarks()).toEqual([]);
  });

  it("saves and retrieves a bookmark", () => {
    const a = makeAnnotator();
    const bm = makeBookmark("chapter1.xhtml", 0.25);
    a.saveBookmark(bm);
    const result = a.getBookmarks();
    expect(result).toHaveLength(1);
    expect(result[0].href).toBe("chapter1.xhtml");
  });

  it("filters bookmarks by href", () => {
    const a = makeAnnotator();
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.1));
    a.saveBookmark(makeBookmark("ch2.xhtml", 0.5));
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.8));

    const ch1 = a.getBookmarks("ch1.xhtml");
    expect(ch1).toHaveLength(2);
    ch1.forEach((bm) => expect(bm.href).toBe("ch1.xhtml"));
  });

  it("returns bookmarks sorted by progression ascending", () => {
    const a = makeAnnotator();
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.9));
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.1));
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.5));

    const sorted = a.getBookmarks("ch1.xhtml");
    const progressions = sorted.map((b) => b.locations.progression!);
    expect(progressions).toEqual([0.1, 0.5, 0.9]);
  });

  it("deletes a bookmark by id", () => {
    const a = makeAnnotator();
    const bm = makeBookmark("ch1.xhtml", 0.3, "to-delete");
    a.saveBookmark(bm);
    expect(a.getBookmarks()).toHaveLength(1);
    a.deleteBookmark(bm);
    expect(a.getBookmarks()).toHaveLength(0);
  });

  it("does not delete a bookmark with a different id", () => {
    const a = makeAnnotator();
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.3, "keep-me"));
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.7, "also-keep"));
    a.deleteBookmark(makeBookmark("ch1.xhtml", 0.3, "nonexistent"));
    expect(a.getBookmarks()).toHaveLength(2);
  });

  it("initBookmarks seeds from an array", () => {
    const a = makeAnnotator();
    const list = [
      makeBookmark("ch1.xhtml", 0.2),
      makeBookmark("ch2.xhtml", 0.6),
    ];
    a.initBookmarks(list);
    expect(a.getBookmarks()).toHaveLength(2);
  });

  it("locatorExists returns the locator when it matches", () => {
    const a = makeAnnotator();
    const bm = makeBookmark("ch1.xhtml", 0.5);
    a.saveBookmark(bm);
    const found = a.locatorExists(bm, AnnotationType.Bookmark);
    expect(found).not.toBeNull();
    expect(found!.href).toBe("ch1.xhtml");
  });

  it("locatorExists returns null for no match", () => {
    const a = makeAnnotator();
    a.saveBookmark(makeBookmark("ch1.xhtml", 0.5));
    const other = makeBookmark("ch1.xhtml", 0.9);
    expect(a.locatorExists(other, AnnotationType.Bookmark)).toBeNull();
  });
});

// ─── Annotations ─────────────────────────────────────────────────────────────

describe("LocalAnnotator – annotations", () => {
  it("returns empty array when no annotations", () => {
    const a = makeAnnotator();
    expect(a.getAnnotations()).toEqual([]);
  });

  it("saves and retrieves an annotation", () => {
    const a = makeAnnotator();
    const ann = makeAnnotation("ch1.xhtml", 0.3);
    a.saveAnnotation(ann);
    const result = a.getAnnotations();
    expect(result).toHaveLength(1);
    expect(result[0].href).toBe("ch1.xhtml");
  });

  it("returns annotations sorted by progression ascending", () => {
    const a = makeAnnotator();
    a.saveAnnotation(makeAnnotation("ch1.xhtml", 0.8));
    a.saveAnnotation(makeAnnotation("ch1.xhtml", 0.2));
    a.saveAnnotation(makeAnnotation("ch1.xhtml", 0.5));

    const sorted = a.getAnnotations();
    const progressions = sorted.map(
      (n: Annotation) => n.locations.progression!
    );
    expect(progressions).toEqual([0.2, 0.5, 0.8]);
  });

  it("deletes an annotation by id", () => {
    const a = makeAnnotator();
    const ann = makeAnnotation("ch1.xhtml", 0.3, "h_todelete");
    a.saveAnnotation(ann);
    a.deleteAnnotation(ann.id as string);
    expect(a.getAnnotations()).toHaveLength(0);
  });

  it("getAnnotationsByChapter filters correctly", () => {
    const a = makeAnnotator();
    a.saveAnnotation(makeAnnotation("ch1.xhtml", 0.1));
    a.saveAnnotation(makeAnnotation("ch2.xhtml", 0.5));
    a.saveAnnotation(makeAnnotation("ch1.xhtml", 0.8));

    const ch1 = a.getAnnotationsByChapter("ch1.xhtml");
    expect(ch1).toHaveLength(2);
    ch1.forEach((ann: Annotation) => expect(ann.href).toBe("ch1.xhtml"));
  });

  it("getAnnotation retrieves by highlight id", () => {
    const a = makeAnnotator();
    const ann = makeAnnotation("ch1.xhtml", 0.4, "h_specific");
    a.saveAnnotation(ann);
    const found = a.getAnnotation(ann.highlight!);
    expect(found).not.toBeNull();
    expect(found!.highlight?.id).toBe("h_specific");
  });

  it("getAnnotationByID retrieves by id string", () => {
    const a = makeAnnotator();
    const ann = makeAnnotation("ch1.xhtml", 0.4, "h_byid");
    a.saveAnnotation(ann);
    const found = a.getAnnotationByID("h_byid");
    expect(found).not.toBeNull();
    expect(found!.href).toBe("ch1.xhtml");
  });

  it("getAnnotationByID returns null for unknown id", () => {
    const a = makeAnnotator();
    expect(a.getAnnotationByID("nope")).toBeNull();
  });
});

// ─── MemoryStore isolation ────────────────────────────────────────────────────

describe("LocalAnnotator – store isolation", () => {
  it("two annotators on different stores do not share data", () => {
    const a1 = makeAnnotator();
    const a2 = makeAnnotator();
    a1.saveBookmark(makeBookmark("ch1.xhtml", 0.5));
    expect(a2.getBookmarks()).toHaveLength(0);
  });
});
