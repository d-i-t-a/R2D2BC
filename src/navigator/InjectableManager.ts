/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import type { Publication } from "../model/v3";
import type { UserSettings } from "../model/user-settings/UserSettings";
import type {
  Injectable,
  InjectableContext,
  ScriptInjectable,
  StyleInjectable,
} from "./types";

/**
 * Owns `Injectable` insertion into chapter iframes.
 *
 * All variants are injected into the parsed chapter HTML's `<head>` *before*
 * `document.write()` — they end up in the iframe as if they were part of the
 * original document, so the browser loads them in parallel with the body. No
 * flash of unstyled content, no post-load round trip; the iframe's own `load`
 * event covers readiness.
 *
 * Blob content is converted to a runtime object URL and revoked when the
 * iframe navigates to the next chapter or the reader stops.
 */
export class InjectableManager {
  /** Per-iframe object URLs created from `Blob` content. Revoked on cleanup. */
  private objectUrlRegistry = new Map<HTMLIFrameElement, string[]>();

  constructor(
    private readonly publication: Publication,
    private readonly settings: UserSettings
  ) {}

  /**
   * Inject into the parsed chapter HTML's head. Mutates `doc` in place.
   */
  injectStaticIntoDoc(
    doc: Document,
    iframe: HTMLIFrameElement,
    injectables: Injectable[] | undefined,
    resourceHref: string
  ): void {
    const head = doc.head;
    if (!head) return;

    const ctx: InjectableContext = {
      publication: this.publication,
      resourceHref,
      doc,
    };

    const trackObjectUrl = (url: string) => {
      let urls = this.objectUrlRegistry.get(iframe);
      if (!urls) {
        urls = [];
        this.objectUrlRegistry.set(iframe, urls);
      }
      urls.push(url);
    };

    const resolveContentUrl = (
      injectable: StyleInjectable | ScriptInjectable
    ): string | null => {
      if (injectable.url) return injectable.url;
      if (injectable.blob) {
        const objectUrl = URL.createObjectURL(injectable.blob);
        trackObjectUrl(objectUrl);
        return objectUrl;
      }
      return null;
    };

    const insertStyleIntoHead = (
      el: HTMLElement,
      opts: { r2before?: boolean; r2default?: boolean; r2after?: boolean }
    ) => {
      if (opts.r2before) head.insertBefore(el, head.firstChild);
      else if (opts.r2default) head.insertBefore(el, head.childNodes[1]);
      else head.appendChild(el); // r2after or default — append
    };

    for (const injectable of injectables ?? []) {
      if (injectable.when && !injectable.when(ctx)) continue;

      if (injectable.type === "style") {
        // Side-effect hooks that fire regardless of url/blob presence.
        if (injectable.fontFamily) {
          // UserSettings.fontFamilyValues.push(injectable.fontFamily)
          // this.settings.setupEvents()
          // this.settings.addFont(injectable.fontFamily);
          this.settings.initAddedFont();
        }
        if (injectable.r2after && injectable.appearance) {
          // this.settings.addAppearance(injectable.appearance);
          this.settings.initAddedAppearance();
        }
        // systemFont declarations have no URL/blob to inject.
        if (injectable.systemFont && !injectable.url && !injectable.blob)
          continue;

        const href = resolveContentUrl(injectable);
        if (!href) continue;

        const link = createCssLink(href);
        applyAttributes(link, injectable.attributes);
        insertStyleIntoHead(link, {
          r2before: injectable.r2before,
          r2default: injectable.r2default,
          r2after: injectable.r2after,
        });
      } else if (injectable.type === "script") {
        const src = resolveContentUrl(injectable);
        if (!src) continue;

        const script = createJavascriptLink(
          src,
          injectable.async ?? false,
          injectable.module ?? false
        );
        applyAttributes(script, injectable.attributes);
        head.appendChild(script);
      } else if (injectable.type === "style-inline") {
        const style = createInlineStyleNode(injectable.source);
        applyAttributes(style, injectable.attributes);
        insertStyleIntoHead(style, {
          r2before: injectable.r2before,
          r2default: injectable.r2default,
          r2after: injectable.r2after,
        });
      } else if (injectable.type === "script-inline") {
        const script = createInlineScriptNode(
          injectable.source,
          injectable.async ?? false,
          injectable.module ?? false
        );
        applyAttributes(script, injectable.attributes);
        head.appendChild(script);
      }
    }
  }

  /**
   * Revoke any object URLs allocated for `iframe` during injection. Called
   * on chapter navigation (before the iframe loads new content) and on
   * reader stop. Safe to call when the iframe has no registrations.
   */
  cleanupForIframe(iframe: HTMLIFrameElement): void {
    const urls = this.objectUrlRegistry.get(iframe);
    if (urls) {
      for (const url of urls) URL.revokeObjectURL(url);
      this.objectUrlRegistry.delete(iframe);
    }
  }
}

// --- element-building helpers ------------------------------------------------

function createCssLink(href: string): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = href;
  return link;
}

function createJavascriptLink(
  href: string,
  isAsync: boolean,
  isModule: boolean
): HTMLScriptElement {
  const script = document.createElement("script");
  script.type = isModule ? "module" : "text/javascript";
  script.src = href;
  // Enforce synchronous behaviour of injected scripts unless specifically
  // marked async, matching how <script> tags in the original HTML would load.
  script.async = isAsync;
  // The parsed chapter doc is XHTML; `doc.documentElement.outerHTML` uses
  // XML serialization which self-closes empty elements. A self-closed
  // `<script src="..."/>` is valid XML but the HTML parser in the iframe
  // reads it as an unclosed `<script>` tag, eating the rest of the document
  // as script content and corrupting parsing. Appending an empty text node
  // forces serialization to `<script src="..."></script>`.
  script.appendChild(document.createTextNode(""));
  return script;
}

function createInlineStyleNode(source: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.type = "text/css";
  style.textContent = source;
  return style;
}

function createInlineScriptNode(
  source: string,
  isAsync: boolean,
  isModule: boolean
): HTMLScriptElement {
  const script = document.createElement("script");
  script.type = isModule ? "module" : "text/javascript";
  script.async = isAsync;
  script.textContent = source;
  return script;
}

function applyAttributes(
  el: HTMLElement,
  attributes?: Record<string, string>
): void {
  if (!attributes) return;
  for (const [key, value] of Object.entries(attributes)) {
    el.setAttribute(key, value);
  }
}
