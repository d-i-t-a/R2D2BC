/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { HostType, RightsKey } from "../ReaderModule";
import { IHistoryModule } from "../interfaces";
import { PDFModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import { Locator, getPageFromLocations } from "../../model/v3";

/**
 * PDF navigation history module.
 *
 * In-reader back/forward navigation across pages. Distinct from pdfjs's
 * PDFHistory (which handles browser history integration and stays on
 * the navigator as a wiring concern).
 *
 * Stack-based: each `push(locator)` appends a page number. `back()` and
 * `forward()` move the cursor within the stack and jump the viewer via
 * `host.goToPage()`. Auto page turns from `pagechanging` do NOT push —
 * only explicit navigation (`goTo`, bookmark jump, TOC click) should
 * record history entries.
 */
export class PdfHistoryModule implements IHistoryModule<PDFModuleHost> {
  readonly name = NavigatorFeature.History;
  readonly hostType = HostType.PDF;
  readonly rightsKey = RightsKey.History;

  private host!: PDFModuleHost;
  private stack: number[] = [];
  private cursor = -1;

  attach(host: PDFModuleHost): void {
    this.host = host;
  }

  setup(): void {
    // Seed the stack with the initial page once the document loads.
    // Auto page turns are not tracked — only explicit push() calls.
  }

  push(locator: Locator): void {
    const page = getPageFromLocations(locator.locations);
    if (page === undefined) return;
    // If we pushed from the middle of the stack (after a back()), discard
    // the forward tail before appending the new entry.
    if (this.cursor < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.cursor + 1);
    }
    // Skip consecutive duplicates.
    if (this.stack[this.stack.length - 1] === page) return;
    this.stack.push(page);
    this.cursor = this.stack.length - 1;
  }

  back(): void {
    if (!this.canGoBack()) return;
    this.cursor -= 1;
    this.host.goToPage(this.stack[this.cursor]);
  }

  forward(): void {
    if (!this.canGoForward()) return;
    this.cursor += 1;
    this.host.goToPage(this.stack[this.cursor]);
  }

  canGoBack(): boolean {
    return this.cursor > 0;
  }

  canGoForward(): boolean {
    return this.cursor < this.stack.length - 1;
  }

  stop(): void {}
}
