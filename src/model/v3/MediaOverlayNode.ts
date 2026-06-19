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
 * Media Overlay Node for SMIL-based synchronized audio+text.
 *
 * @readium/shared only provides MediaOverlay metadata (activeClass, playbackActiveClass).
 * The full SMIL overlay tree (Text, Audio, Children, Role) is an DITA Toolkit model
 * because @readium/shared doesn't carry the playback tree.
 */
export class MediaOverlayNode {
  /** Text fragment reference (e.g., "chapter1.xhtml#para1") */
  Text?: string;

  /** Audio file reference (e.g., "audio/chapter1.mp3#t=0,5.5") */
  Audio?: string;

  /** Child overlay nodes (for nested SMIL structures) */
  Children?: MediaOverlayNode[];

  /** Semantic roles (e.g., ["bodymatter", "chapter"]) */
  Role?: string[];

  /** Whether this node has been initialized/loaded */
  initialized?: boolean;

  /**
   * Deserialize a MediaOverlayNode from plain JSON.
   * Replaces the old TaJsonDeserialize<MediaOverlayNode> approach.
   */
  static deserialize(json: any): MediaOverlayNode | undefined {
    if (!json) return undefined;

    const node = new MediaOverlayNode();
    node.Text = json.text ?? json.Text;
    node.Audio = json.audio ?? json.Audio;
    node.Role = json.role ?? json.Role;

    const children = json.narration ?? json.children ?? json.Children;
    if (Array.isArray(children)) {
      node.Children = children
        .map((child: any) => MediaOverlayNode.deserialize(child))
        .filter(Boolean) as MediaOverlayNode[];
    }

    return node;
  }

  /**
   * Serialize to plain JSON.
   */
  serialize(): any {
    const json: any = {};
    if (this.Text) json.text = this.Text;
    if (this.Audio) json.audio = this.Audio;
    if (this.Role?.length) json.role = this.Role;
    if (this.Children?.length) {
      json.children = this.Children.map((c) => c.serialize());
    }
    return json;
  }
}
