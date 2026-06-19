import { describe, it, expect } from "vitest";
import { Link } from "../../../src/model/v3/Link";

describe("Link (v3)", () => {
  it("creates from constructor with href", () => {
    const link = new Link({ href: "chapter1.xhtml" });
    expect(link.href).toBe("chapter1.xhtml");
  });

  it("supports DITA Toolkit extensions", () => {
    const link = new Link({ href: "chapter1.xhtml" });
    expect(link.contentLength).toBeUndefined();
    expect(link.contentWeight).toBeUndefined();
    link.contentLength = 5000;
    link.contentWeight = 25.5;
    expect(link.contentLength).toBe(5000);
    expect(link.contentWeight).toBe(25.5);
  });

  it("hrefDecoded decodes URI-encoded hrefs", () => {
    const link = new Link({ href: "chapter%201.xhtml" });
    expect(link.hrefDecoded).toBe("chapter 1.xhtml");
  });

  it("hrefDecoded returns href for non-encoded hrefs", () => {
    const link = new Link({ href: "chapter1.xhtml" });
    expect(link.hrefDecoded).toBe("chapter1.xhtml");
  });

  it("mediaOverlay reads from deserialized link properties", () => {
    // Simulate how links come from the manifest — via Link.deserialize
    const link = Link.deserialize({
      href: "chapter1.xhtml",
      type: "application/xhtml+xml",
      properties: { "media-overlay": "chapter1.smil" },
    });
    expect(link).toBeDefined();
    expect(link!.properties?.otherProperties?.["media-overlay"]).toBe(
      "chapter1.smil"
    );
  });

  it("mediaOverlayNode can be set and read", () => {
    const link = new Link({ href: "chapter1.xhtml" });
    expect(link.mediaOverlayNode).toBeUndefined();
    link.mediaOverlayNode = { Text: "chapter1.xhtml#p1", Audio: "audio.mp3" };
    expect(link.mediaOverlayNode.Text).toBe("chapter1.xhtml#p1");
  });

  it("relArray converts Set to Array", () => {
    const link = new Link({
      href: "chapter1.xhtml",
      rels: new Set(["self", "external"]),
    });
    expect(link.relArray).toEqual(["self", "external"]);
    expect(link.relArray.includes("external")).toBe(true);
  });

  it("relArray returns empty array when no rels", () => {
    const link = new Link({ href: "chapter1.xhtml" });
    expect(link.relArray).toEqual([]);
  });
});
