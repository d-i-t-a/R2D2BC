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
import { ISearchModule, SearchOptions } from "../interfaces";
import { PDFModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import { ReaderEvent } from "../../utils/Events";

/**
 * PDF search module.
 *
 * Wraps pdfjs PDFFindController via the host's eventBus. Replaces the
 * inline `find` / `findNext` / `findPrevious` methods previously on
 * PDFNavigator. Tracks its own query state internally so next/previous
 * don't need to probe pdfjs internals.
 *
 * Subscribes to `updatefindmatchescount` and `updatefindcontrolstate`
 * on the pdfjs event bus to expose accurate match counts via
 * `matchCount()` and `currentMatch()`.
 */
export class PdfSearchModule implements ISearchModule<PDFModuleHost> {
  readonly name = NavigatorFeature.Search;
  readonly hostType = HostType.PDF;
  readonly rightsKey = RightsKey.Search;

  private host!: PDFModuleHost;
  private _query = "";
  private _caseSensitive = false;
  private _highlightAll = true;
  private _entireWord = false;
  private _matchCount = 0;
  private _currentMatch = 0;

  attach(host: PDFModuleHost): void {
    this.host = host;
  }

  setup(): void {
    this.host.eventBus.on("updatefindmatchescount", this.onMatchesUpdate);
    this.host.eventBus.on("updatefindcontrolstate", this.onMatchesUpdate);
  }

  private onMatchesUpdate = (evt: {
    matchesCount?: { current?: number; total?: number };
  }): void => {
    if (evt?.matchesCount) {
      this._currentMatch = evt.matchesCount.current ?? 0;
      this._matchCount = evt.matchesCount.total ?? 0;
      this.host.emit(ReaderEvent.PdfMatchesUpdated, {
        current: this._currentMatch,
        total: this._matchCount,
      });
    }
  };

  // ── Public API ──────────────────────────────────────────────

  search(query: string, options?: SearchOptions): void {
    this._query = query;
    this._caseSensitive = options?.caseSensitive ?? false;
    this._highlightAll = options?.highlightAll ?? true;
    this._entireWord = options?.entireWord ?? false;
    this.host.eventBus.dispatch("find", {
      query,
      caseSensitive: this._caseSensitive,
      highlightAll: this._highlightAll,
      entireWord: this._entireWord,
      findPrevious: false,
      type: "",
    });
  }

  next(): void {
    if (!this._query) return;
    this.host.eventBus.dispatch("find", {
      query: this._query,
      caseSensitive: this._caseSensitive,
      highlightAll: this._highlightAll,
      entireWord: this._entireWord,
      findPrevious: false,
      type: "again",
    });
  }

  previous(): void {
    if (!this._query) return;
    this.host.eventBus.dispatch("find", {
      query: this._query,
      caseSensitive: this._caseSensitive,
      highlightAll: this._highlightAll,
      entireWord: this._entireWord,
      findPrevious: true,
      type: "again",
    });
  }

  clear(): void {
    this._query = "";
    this._matchCount = 0;
    this._currentMatch = 0;
    // Dispatching an empty find clears highlights in pdfjs.
    this.host.eventBus.dispatch("find", {
      query: "",
      caseSensitive: false,
      highlightAll: true,
      entireWord: false,
      findPrevious: false,
      type: "",
    });
  }

  matchCount(): number {
    return this._matchCount;
  }

  currentMatch(): number {
    return this._currentMatch;
  }

  stop(): void {
    this.host?.eventBus.off("updatefindmatchescount", this.onMatchesUpdate);
    this.host?.eventBus.off("updatefindcontrolstate", this.onMatchesUpdate);
  }
}
