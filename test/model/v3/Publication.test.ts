import { describe, it, expect } from "vitest";
import { Manifest } from "@readium/shared";
import { Publication } from "../../../src/model/v3/Publication";
// Link type used implicitly through Publication.readingOrder

// Minimal valid manifest JSON for testing
const minimalManifestJSON = {
  metadata: {
    title: "Test Publication",
    language: "en",
  },
  links: [
    { href: "manifest.json", type: "application/webpub+json", rel: ["self"] },
  ],
  readingOrder: [
    {
      href: "chapter1.xhtml",
      type: "application/xhtml+xml",
      title: "Chapter 1",
    },
    {
      href: "chapter2.xhtml",
      type: "application/xhtml+xml",
      title: "Chapter 2",
    },
    {
      href: "chapter3.xhtml",
      type: "application/xhtml+xml",
      title: "Chapter 3",
    },
  ],
  toc: [
    { href: "chapter1.xhtml", title: "Chapter One" },
    {
      href: "chapter2.xhtml",
      title: "Chapter Two",
      children: [{ href: "chapter2.xhtml#section1", title: "Section 1" }],
    },
    { href: "chapter3.xhtml", title: "Chapter Three" },
  ],
};

function createPublication(): Publication {
  const manifest = Manifest.deserialize(minimalManifestJSON)!;
  const url = new URL("https://example.com/pub/manifest.json");
  manifest.setSelfLink(url.href);
  return new Publication(manifest, url);
}

describe("Publication (v3)", () => {
  describe("construction from Manifest", () => {
    it("creates from a deserialized manifest", () => {
      const pub = createPublication();
      expect(pub).toBeDefined();
      expect(pub.manifest).toBeDefined();
      expect(pub.manifestUrl.href).toBe(
        "https://example.com/pub/manifest.json"
      );
    });

    it("has correct metadata", () => {
      const pub = createPublication();
      expect(pub.metadata).toBeDefined();
    });
  });

  describe("readingOrder", () => {
    it("returns reading order links", () => {
      const pub = createPublication();
      expect(pub.readingOrder).toHaveLength(3);
      expect(pub.readingOrder[0].href).toBe("chapter1.xhtml");
    });

    it("returns Link instances with camelCase properties", () => {
      const pub = createPublication();
      const link = pub.readingOrder[0];
      expect(link.href).toBe("chapter1.xhtml");
      expect(link.type).toBe("application/xhtml+xml");
      expect(link.title).toBe("Chapter 1");
    });

    it("Link has R2D2BC extensions", () => {
      const pub = createPublication();
      const link = pub.readingOrder[0];
      expect(link.contentLength).toBeUndefined();
      expect(link.contentWeight).toBeUndefined();
      expect(link.hrefDecoded).toBe("chapter1.xhtml");
    });
  });

  describe("tableOfContents", () => {
    it("returns TOC links", () => {
      const pub = createPublication();
      expect(pub.tableOfContents).toHaveLength(3);
      expect(pub.tableOfContents[0].title).toBe("Chapter One");
    });
  });

  describe("spine navigation", () => {
    it("getStartLink returns first reading order item", () => {
      const pub = createPublication();
      const start = pub.getStartLink();
      expect(start?.href).toBe("chapter1.xhtml");
    });

    it("getNextSpineItem returns next item", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter1.xhtml");
      const next = pub.getNextSpineItem(absHref);
      expect(next?.href).toBe("chapter2.xhtml");
    });

    it("getPreviousSpineItem returns previous item", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter2.xhtml");
      const prev = pub.getPreviousSpineItem(absHref);
      expect(prev?.href).toBe("chapter1.xhtml");
    });

    it("getPreviousSpineItem returns undefined for first item", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter1.xhtml");
      expect(pub.getPreviousSpineItem(absHref)).toBeUndefined();
    });

    it("getNextSpineItem returns undefined for last item", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter3.xhtml");
      expect(pub.getNextSpineItem(absHref)).toBeUndefined();
    });

    it("getSpineItem finds by absolute href", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter2.xhtml");
      const item = pub.getSpineItem(absHref);
      expect(item?.href).toBe("chapter2.xhtml");
    });

    it("getSpineIndex returns correct index", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter2.xhtml");
      expect(pub.getSpineIndex(absHref)).toBe(1);
    });
  });

  describe("URL resolution", () => {
    it("getAbsoluteHref resolves relative to manifest", () => {
      const pub = createPublication();
      expect(pub.getAbsoluteHref("chapter1.xhtml")).toBe(
        "https://example.com/pub/chapter1.xhtml"
      );
    });

    it("getRelativeHref strips manifest base", () => {
      const pub = createPublication();
      const relative = pub.getRelativeHref(
        "https://example.com/pub/chapter1.xhtml"
      );
      expect(relative).toBe("chapter1.xhtml");
    });

    it("getRelativeHref strips fragment", () => {
      const pub = createPublication();
      const relative = pub.getRelativeHref(
        "https://example.com/pub/chapter2.xhtml#section1"
      );
      expect(relative).toBe("chapter2.xhtml");
    });
  });

  describe("TOC lookup", () => {
    it("getTOCItem finds by absolute href", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter1.xhtml");
      const item = pub.getTOCItem(absHref);
      expect(item?.title).toBe("Chapter One");
    });

    it("getTOCItem finds with fragment fallback", () => {
      const pub = createPublication();
      const absHref = pub.getAbsoluteHref("chapter2.xhtml#nonexistent");
      const item = pub.getTOCItem(absHref);
      expect(item?.title).toBe("Chapter Two");
    });
  });

  describe("layout detection", () => {
    it("defaults to reflowable", () => {
      const pub = createPublication();
      expect(pub.isReflowable).toBe(true);
      expect(pub.isFixedLayout).toBe(false);
      expect(pub.layout).toBe("reflowable");
    });

    it("detects FXL from rendition:layout pre-paginated", () => {
      const manifest = Manifest.deserialize({
        metadata: {
          title: "FXL Book",
          language: "en",
          "rendition:layout": "pre-paginated",
        },
        links: [],
        readingOrder: [{ href: "page1.xhtml", type: "application/xhtml+xml" }],
      })!;
      const pub = new Publication(
        manifest,
        new URL("https://example.com/pub/manifest.json")
      );
      expect(pub.isFixedLayout).toBe(true);
      expect(pub.isReflowable).toBe(false);
      expect(pub.layout).toBe("fixed");
    });

    it("detects FXL from RWPM layout fixed", () => {
      const manifest = Manifest.deserialize({
        metadata: {
          title: "FXL Book",
          language: "en",
          layout: "fixed",
        },
        links: [],
        readingOrder: [{ href: "page1.xhtml", type: "application/xhtml+xml" }],
      })!;
      const pub = new Publication(
        manifest,
        new URL("https://example.com/pub/manifest.json")
      );
      expect(pub.isFixedLayout).toBe(true);
    });
  });

  describe("positions", () => {
    it("starts with empty positions", () => {
      const pub = createPublication();
      expect(pub.positions).toEqual([]);
    });

    it("positionsByHref filters correctly", () => {
      const pub = createPublication();
      pub.positions = [
        { href: "chapter1.xhtml", locations: { progression: 0, position: 1 } },
        {
          href: "chapter1.xhtml",
          locations: { progression: 0.5, position: 2 },
        },
        { href: "chapter2.xhtml", locations: { progression: 0, position: 3 } },
      ];
      const ch1 = pub.positionsByHref("chapter1.xhtml");
      expect(ch1).toHaveLength(2);
      const ch2 = pub.positionsByHref("chapter2.xhtml");
      expect(ch2).toHaveLength(1);
    });
  });
});
