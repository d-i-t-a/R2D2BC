import { describe, it, expect } from "vitest";
import { MediaOverlayNode } from "../../../src/model/v3/MediaOverlayNode";

describe("MediaOverlayNode (v3)", () => {
  describe("deserialize", () => {
    it("returns undefined for null/undefined input", () => {
      expect(MediaOverlayNode.deserialize(null)).toBeUndefined();
      expect(MediaOverlayNode.deserialize(undefined)).toBeUndefined();
    });

    it("deserializes a leaf node with text and audio", () => {
      const node = MediaOverlayNode.deserialize({
        text: "chapter1.xhtml#p1",
        audio: "audio/ch1.mp3#t=0,5.5",
      });
      expect(node).toBeDefined();
      expect(node!.Text).toBe("chapter1.xhtml#p1");
      expect(node!.Audio).toBe("audio/ch1.mp3#t=0,5.5");
    });

    it("deserializes role array", () => {
      const node = MediaOverlayNode.deserialize({
        text: "chapter1.xhtml",
        role: ["section", "bodymatter", "chapter"],
      });
      expect(node!.Role).toEqual(["section", "bodymatter", "chapter"]);
    });

    it("deserializes children using 'children' key", () => {
      const node = MediaOverlayNode.deserialize({
        text: "chapter1.xhtml",
        children: [
          { text: "chapter1.xhtml#p1", audio: "ch1.mp3#t=0,5" },
          { text: "chapter1.xhtml#p2", audio: "ch1.mp3#t=5,10" },
        ],
      });
      expect(node!.Children).toHaveLength(2);
      expect(node!.Children![0].Text).toBe("chapter1.xhtml#p1");
      expect(node!.Children![1].Audio).toBe("ch1.mp3#t=5,10");
    });

    it("deserializes children using 'narration' key (streamer format)", () => {
      const node = MediaOverlayNode.deserialize({
        text: "chapter1.xhtml",
        role: ["section", "bodymatter"],
        narration: [
          { text: "chapter1.xhtml#Pcap", audio: "Audio/01.mp3#t=0,1.712" },
          { text: "chapter1.xhtml#Ptit", audio: "Audio/01.mp3#t=1.712,5.254" },
        ],
      });
      expect(node!.Children).toHaveLength(2);
      expect(node!.Children![0].Text).toBe("chapter1.xhtml#Pcap");
      expect(node!.Children![0].Audio).toBe("Audio/01.mp3#t=0,1.712");
    });

    it("handles nested narration (multi-level SMIL)", () => {
      const node = MediaOverlayNode.deserialize({
        role: "section",
        narration: [
          {
            text: "chapter1.xhtml",
            role: ["section", "chapter"],
            narration: [
              { text: "chapter1.xhtml#p1", audio: "audio.mp3#t=0,5" },
              { text: "chapter1.xhtml#p2", audio: "audio.mp3#t=5,10" },
            ],
          },
        ],
      });
      expect(node!.Children).toHaveLength(1);
      expect(node!.Children![0].Children).toHaveLength(2);
      expect(node!.Children![0].Children![1].Text).toBe("chapter1.xhtml#p2");
    });

    it("handles PascalCase keys (legacy format)", () => {
      const node = MediaOverlayNode.deserialize({
        Text: "chapter1.xhtml#p1",
        Audio: "audio.mp3#t=0,5",
        Role: ["chapter"],
        Children: [{ Text: "chapter1.xhtml#p2", Audio: "audio.mp3#t=5,10" }],
      });
      expect(node!.Text).toBe("chapter1.xhtml#p1");
      expect(node!.Audio).toBe("audio.mp3#t=0,5");
      expect(node!.Children).toHaveLength(1);
    });
  });

  describe("serialize", () => {
    it("round-trips through serialize/deserialize", () => {
      const original = MediaOverlayNode.deserialize({
        text: "chapter1.xhtml#p1",
        audio: "audio.mp3#t=0,5",
        role: ["chapter"],
      });
      const json = original!.serialize();
      const restored = MediaOverlayNode.deserialize(json);
      expect(restored!.Text).toBe(original!.Text);
      expect(restored!.Audio).toBe(original!.Audio);
      expect(restored!.Role).toEqual(original!.Role);
    });
  });

  describe("initialized flag", () => {
    it("defaults to undefined", () => {
      const node = MediaOverlayNode.deserialize({ text: "test.xhtml" });
      expect(node!.initialized).toBeUndefined();
    });

    it("can be set after deserialization", () => {
      const node = MediaOverlayNode.deserialize({ text: "test.xhtml" });
      node!.initialized = true;
      expect(node!.initialized).toBe(true);
    });
  });
});
