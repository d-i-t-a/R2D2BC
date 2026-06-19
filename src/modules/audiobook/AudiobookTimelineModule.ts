/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { HostType, RightsKey, ReaderModule } from "../ReaderModule";
import { AudiobookModuleHost } from "../ModuleHost";
import { NavigatorFeature } from "../../navigator/NavigatorFeature";
import { Publication } from "../../model/v3";
import {
  AudiobookSettings,
  TimelineMode,
} from "../../model/user-settings/AudiobookSettings";
import type { Bookmark, Comment } from "../../model/v3";
import type { IBookmarkModule, ICommentsModule } from "../interfaces";

/**
 * Audiobook timeline module.
 *
 * Owns whole-book progress math (cumulative chapter offsets, total
 * duration, conversions between (chapter, time) and absolute book
 * time) AND, when the integrator supplies containers, renders the
 * timeline scrubber UI inside those containers.
 *
 * Two scrubbers are supported:
 * - `chapterScrubberContainer` — primary bar, follows the user's
 *   `audiobookSettings.timelineMode` setting (chapter or book).
 * - `bookScrubberContainer` — secondary always-whole-book strip,
 *   typically shown only when `timelineMode === "both"`. The
 *   integrator decides when to show/hide its container; the module
 *   only renders into whichever containers are provided.
 *
 * Both DOM rendering and math live in this single module to mirror
 * `epub/TimelineModule` (one class, math + DOM together).
 *
 * Class names rendered inside the containers are namespaced
 * `.dita-audiobook-timeline-*`. Visual styling lives in the compiled
 * stylesheet at `src/styles/sass/player.scss` → `dist/player.css` —
 * integrators include that file.
 *
 * Without containers the module runs in math-only mode, exposing
 * `chapterStarts` / `bookDuration` / conversions for integrator-built UI.
 */

/**
 * Width of the hovered chapter is capped to this percent of the bar
 * width to prevent it from filling the bar on short publications.
 */
const FISHEYE_MAX_PCT = 28;
/** Floor — even very-short chapters get a clickable hover region. */
const FISHEYE_MIN_PCT = 8;
/** How aggressively to expand: hovered = natural × this, clamped above. */
const FISHEYE_SCALE = 5;
/** Step (in seconds) used by keyboard left/right on a focused scrubber. */
const KEYBOARD_STEP_SECONDS = 5;

export interface AudiobookTimelineModuleConfig {
  publication: Publication;
  /**
   * Settings instance — used to read `timelineMode` (so the chapter
   * scrubber can render whole-book when in `"book"` mode) and to react
   * via `onChange` when the user switches modes. Optional; without it
   * the chapter scrubber stays in chapter scope.
   */
  settings?: AudiobookSettings;
  /**
   * Container the chapter scrubber renders into. Optional. When
   * provided, the module writes its inner DOM (bar / fill / thumb /
   * markers / boundaries / chapter bands / hover tooltip) inside.
   * Layout, surrounding chrome, and fonts stay the integrator's.
   */
  chapterScrubberContainer?: HTMLElement | null;
  /**
   * Container the whole-book scrubber renders into. Optional. Always
   * shows whole-book scope regardless of `timelineMode`. Used by
   * integrators that want a permanent "whole book" strip alongside
   * the primary chapter scrubber when in `"both"` mode.
   */
  bookScrubberContainer?: HTMLElement | null;
}

/** Result of converting an absolute book time back to chapter coordinates. */
export interface BookTimeBreakdown {
  /** Index into `publication.readingOrder`. */
  chapterIndex: number;
  /** Time within the chapter, in seconds. Always >= 0. */
  timeInChapter: number;
  /** href of the chapter (relative; navigator resolves to absolute). */
  href: string;
}

interface FisheyeCell {
  startPct: number;
  widthPct: number;
}

interface FisheyeState {
  layout: FisheyeCell[];
  hoveredIdx: number;
}

/** Scope used to render a bar — either the current chapter or the whole book. */
type Scope = "chapter" | "book";

/**
 * Per-bar state. One `Bar` instance exists per scrubber container the
 * integrator supplies (chapter and/or book).
 */
interface Bar {
  container: HTMLElement;
  /**
   * `"auto"` follows `settings.timelineMode` (chapter / book / both).
   * `"book"` is fixed whole-book scope (used by `bookScrubberContainer`).
   */
  modeKind: "auto" | "book";
  root: HTMLElement;
  fill: HTMLElement;
  thumb: HTMLElement;
  markersHost: HTMLElement;
  tooltip: HTMLElement;
  isDragging: boolean;
  dragValue: number;
  fisheye: FisheyeState | null;
  boundPointerMove?: (e: PointerEvent) => void;
  boundPointerUp?: (e: PointerEvent) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = m.toString().padStart(h > 0 ? 2 : 1, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Compute the displaced left% / width% of every chapter when one is
 * hovered. Hovered chapter gets its capped expansion; others share
 * the remaining width in their natural proportions.
 */
function fisheyeLayout(
  durations: number[],
  hoveredIndex: number
): FisheyeCell[] {
  const total = durations.reduce((a, b) => a + b, 0);
  if (total <= 0 || hoveredIndex < 0 || hoveredIndex >= durations.length) {
    let cum = 0;
    return durations.map((d) => {
      const start = total > 0 ? (cum / total) * 100 : 0;
      cum += d;
      return { startPct: start, widthPct: total > 0 ? (d / total) * 100 : 0 };
    });
  }
  const naturalHoveredPct = (durations[hoveredIndex] / total) * 100;
  const hoveredPct = Math.min(
    100,
    Math.max(
      FISHEYE_MIN_PCT,
      Math.min(naturalHoveredPct * FISHEYE_SCALE, FISHEYE_MAX_PCT)
    )
  );
  const remainingPct = Math.max(0, 100 - hoveredPct);
  const otherTotalDuration = total - durations[hoveredIndex];

  const layout: FisheyeCell[] = [];
  let cumPct = 0;
  for (let i = 0; i < durations.length; i++) {
    const widthPct =
      i === hoveredIndex
        ? hoveredPct
        : otherTotalDuration > 0
          ? (durations[i] / otherTotalDuration) * remainingPct
          : 0;
    layout.push({ startPct: cumPct, widthPct });
    cumPct += widthPct;
  }
  return layout;
}

function fisheyeChapterAt(layout: FisheyeCell[], cursorPct: number): number {
  for (let i = 0; i < layout.length; i++) {
    if (
      cursorPct >= layout[i].startPct &&
      cursorPct < layout[i].startPct + layout[i].widthPct
    ) {
      return i;
    }
  }
  return Math.max(0, layout.length - 1);
}

function fisheyePercentToBookTime(
  durations: number[],
  layout: FisheyeCell[],
  cursorPct: number
): number {
  for (let i = 0; i < layout.length; i++) {
    const { startPct, widthPct } = layout[i];
    if (cursorPct >= startPct && cursorPct < startPct + widthPct) {
      const within = (cursorPct - startPct) / widthPct;
      let chapterStart = 0;
      for (let j = 0; j < i; j++) chapterStart += durations[j];
      return chapterStart + within * durations[i];
    }
  }
  return durations.reduce((a, b) => a + b, 0);
}

export class AudiobookTimelineModule implements ReaderModule<AudiobookModuleHost> {
  readonly name = NavigatorFeature.Timeline;
  readonly hostType = HostType.Audiobook;
  readonly rightsKey = RightsKey.Timeline;

  private readonly publication: Publication;
  private readonly settings?: AudiobookSettings;
  private readonly chapterScrubberContainer?: HTMLElement | null;
  private readonly bookScrubberContainer?: HTMLElement | null;
  private host!: AudiobookModuleHost;

  private bars: Bar[] = [];
  private settingsUnsubscribe: (() => void) | null = null;

  /** Cumulative start time (sec) of each readingOrder resource. */
  private _chapterStarts: number[] = [];
  /** Total book duration (sec). Sum of all `link.duration` values. */
  private _bookDuration = 0;

  public static async create(
    config: AudiobookTimelineModuleConfig
  ): Promise<AudiobookTimelineModule> {
    const module = new AudiobookTimelineModule(config);
    module.rebuild();
    return module;
  }

  public constructor(config: AudiobookTimelineModuleConfig) {
    this.publication = config.publication;
    this.settings = config.settings;
    this.chapterScrubberContainer = config.chapterScrubberContainer;
    this.bookScrubberContainer = config.bookScrubberContainer;
  }

  attach(host: AudiobookModuleHost): void {
    this.host = host;
    if (this.chapterScrubberContainer) {
      this.bars.push(this.buildBar(this.chapterScrubberContainer, "auto"));
    }
    if (this.bookScrubberContainer) {
      this.bars.push(this.buildBar(this.bookScrubberContainer, "book"));
    }
    if (this.settings) {
      this.settingsUnsubscribe = this.settings.onChange((key) => {
        if (key === "timelineMode") this.redraw();
      });
    }
    this.redraw();
  }

  stop(): void {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    for (const bar of this.bars) {
      if (bar.boundPointerMove) {
        window.removeEventListener("pointermove", bar.boundPointerMove);
      }
      if (bar.boundPointerUp) {
        window.removeEventListener("pointerup", bar.boundPointerUp);
      }
      bar.container.innerHTML = "";
    }
    this.bars = [];
  }

  /**
   * Recompute chapter offsets + total duration from the manifest's
   * `readingOrder`. Idempotent. Call after the manifest is loaded
   * (i.e., at module construction) and again on each
   * `playback.durationchanged` event in case a chapter's duration
   * resolved late (rare for audiobook profile but cheap to handle).
   */
  rebuild(): void {
    const order = this.publication.readingOrder ?? [];
    this._chapterStarts = [];
    let cum = 0;
    for (const link of order) {
      this._chapterStarts.push(cum);
      cum += link.duration ?? 0;
    }
    this._bookDuration = cum;
  }

  // ── Read-only state ─────────────────────────────────────────────

  /** Cumulative start time (sec) of each chapter. Indexed by readingOrder index. */
  get chapterStarts(): readonly number[] {
    return this._chapterStarts;
  }

  /**
   * Total book duration (sec). May be 0 if the manifest doesn't
   * include any chapter durations. Consumers should fall back to
   * per-chapter behavior in that case.
   */
  get bookDuration(): number {
    return this._bookDuration;
  }

  /** True when the module has enough data to drive a whole-book scrubber. */
  get isUsable(): boolean {
    return this._bookDuration > 0;
  }

  // ── Conversions ─────────────────────────────────────────────────

  /**
   * Convert (chapterIndex, timeInChapter) → absolute book time. Out of
   * range indices clamp to the nearest valid chapter; negative times
   * clamp to 0.
   */
  toBookTime(chapterIndex: number, timeInChapter: number): number {
    if (this._chapterStarts.length === 0) return 0;
    const i = Math.max(
      0,
      Math.min(this._chapterStarts.length - 1, chapterIndex | 0)
    );
    const t = Math.max(0, timeInChapter || 0);
    return this._chapterStarts[i] + t;
  }

  /**
   * Convert an absolute book time → (chapterIndex, timeInChapter, href).
   * Clamps `absT` to `[0, bookDuration]`. Returns `chapterIndex: 0` and
   * `timeInChapter: 0` when readingOrder is empty.
   */
  fromBookTime(absT: number): BookTimeBreakdown {
    const order = this.publication.readingOrder ?? [];
    if (order.length === 0) {
      return { chapterIndex: 0, timeInChapter: 0, href: "" };
    }
    const t = Math.max(0, Math.min(this._bookDuration, absT));
    let target = order.length - 1;
    for (let i = 0; i < order.length; i++) {
      const start = this._chapterStarts[i];
      const end = start + (order[i].duration ?? 0);
      if (t < end) {
        target = i;
        break;
      }
    }
    return {
      chapterIndex: target,
      timeInChapter: t - (this._chapterStarts[target] ?? 0),
      href: order[target].href,
    };
  }

  /**
   * Current playhead expressed as absolute book time. Derived from
   * `host.currentLocator()` — the locator's `locations.time` is the
   * within-chapter offset; this method adds the cumulative chapter
   * start. Returns 0 if no host attached or no locator.
   */
  currentBookTime(): number {
    if (!this.host) return 0;
    const locator = this.host.currentLocator();
    if (!locator?.href) return 0;
    const order = this.publication.readingOrder ?? [];
    const index = order.findIndex((l) => l.href === locator.href);
    if (index < 0) return 0;
    const t = locator.locations?.time ?? 0;
    return this.toBookTime(index, t);
  }

  // ── Navigator-driven dispatch ────────────────────────────────────
  // The audiobook navigator calls these at the same sites it emits the
  // matching ReaderEvents. Mirrors `EpubNavigator` calling
  // `bookmarks.drawBookmarks()` / `timeline.initialize()` on state changes.

  /** Called on every `playback.timeupdate` — updates playhead only (markers don't move). */
  onTimeUpdate(): void {
    for (const bar of this.bars) this.renderPlayhead(bar);
  }

  /** Called on `playback.trackchanged` — markers re-render for the new chapter. */
  onTrackChanged(): void {
    this.redraw();
  }

  /** Called on `playback.durationchanged` — math may need to rebuild. */
  onDurationChanged(): void {
    this.rebuild();
    this.redraw();
  }

  /** Called when bookmarks are added/removed. */
  onBookmarkChanged(): void {
    for (const bar of this.bars) this.renderMarkers(bar);
  }

  /** Called when comments are added/removed. */
  onCommentChanged(): void {
    for (const bar of this.bars) this.renderMarkers(bar);
  }

  // ── Internal: scope resolution ───────────────────────────────────

  private resolveScope(bar: Bar): {
    scope: Scope;
    duration: number;
    position: number;
  } {
    const useBook =
      bar.modeKind === "book" || this.timelineModeSetting() === "book";
    if (useBook && this.isUsable) {
      return {
        scope: "book",
        duration: this._bookDuration,
        position: this.currentBookTime(),
      };
    }
    const idx = this.host?.currentResource() ?? 0;
    const link = this.publication.readingOrder?.[idx];
    const duration = link?.duration ?? 0;
    const position = this.host?.currentLocator()?.locations?.time ?? 0;
    return { scope: "chapter", duration, position };
  }

  private timelineModeSetting(): TimelineMode {
    return this.settings?.timelineMode ?? "chapter";
  }

  private currentChapterIndex(): number {
    return this.host?.currentResource() ?? 0;
  }

  private bookmarks(): ReadonlyArray<Bookmark> {
    const bookmarkModule = this.host?.getModule(NavigatorFeature.Bookmarks) as
      | IBookmarkModule
      | undefined;
    return bookmarkModule?.list() ?? [];
  }

  private comments(): ReadonlyArray<Comment> {
    const commentsModule = this.host?.getModule(NavigatorFeature.Comments) as
      | ICommentsModule
      | undefined;
    return commentsModule?.list() ?? [];
  }

  // ── Internal: full redraw ────────────────────────────────────────

  private redraw(): void {
    for (const bar of this.bars) {
      this.renderMarkers(bar);
      this.renderPlayhead(bar);
    }
  }

  // ── Internal: per-bar DOM construction ───────────────────────────

  private buildBar(container: HTMLElement, modeKind: "auto" | "book"): Bar {
    const root = document.createElement("div");
    root.className = "dita-audiobook-timeline";
    root.setAttribute("role", "slider");
    root.tabIndex = 0;
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", "0");
    root.setAttribute("aria-valuenow", "0");

    const fill = document.createElement("div");
    fill.className = "dita-audiobook-timeline-fill";
    root.appendChild(fill);

    const markersHost = document.createElement("div");
    markersHost.className = "dita-audiobook-timeline-markers";
    root.appendChild(markersHost);

    const thumb = document.createElement("div");
    thumb.className = "dita-audiobook-timeline-thumb";
    root.appendChild(thumb);

    const tooltip = document.createElement("div");
    tooltip.className = "dita-audiobook-timeline-tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    root.appendChild(tooltip);

    container.innerHTML = "";
    container.appendChild(root);

    const bar: Bar = {
      container,
      modeKind,
      root,
      fill,
      thumb,
      markersHost,
      tooltip,
      isDragging: false,
      dragValue: 0,
      fisheye: null,
    };

    root.addEventListener("pointerdown", (e) => this.beginDrag(bar, e));
    root.addEventListener("pointermove", (e) => this.onHover(bar, e));
    root.addEventListener("pointerleave", () => this.onHoverEnd(bar));
    root.addEventListener("keydown", (e) => this.onKeyDown(bar, e));

    return bar;
  }

  // ── Internal: rendering ──────────────────────────────────────────

  private renderPlayhead(bar: Bar): void {
    if (bar.isDragging) return;
    const { duration, position } = this.resolveScope(bar);
    const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
    bar.fill.style.width = pct + "%";
    bar.thumb.style.left = pct + "%";
    bar.root.setAttribute("aria-valuemin", "0");
    bar.root.setAttribute("aria-valuemax", String(Math.round(duration)));
    bar.root.setAttribute("aria-valuenow", String(Math.round(position)));
    bar.root.setAttribute(
      "aria-valuetext",
      `${formatTime(position)} of ${formatTime(duration)}`
    );
  }

  private renderMarkers(bar: Bar): void {
    bar.markersHost.innerHTML = "";
    const { scope, duration } = this.resolveScope(bar);
    if (duration <= 0) return;

    const order = this.publication.readingOrder ?? [];
    const bookmarks = this.bookmarks();
    const comments = this.comments();

    const placeMarker = (
      time: number,
      kind: "bookmark" | "comment",
      tooltipHTML: string,
      onClick: () => void
    ): void => {
      const percent = Math.min(100, Math.max(0, (time / duration) * 100));
      const el = document.createElement("div");
      el.className = `dita-audiobook-timeline-marker ${kind}`;
      el.style.left = percent + "%";
      if (scope === "book") el.dataset.bookTime = String(time);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      el.addEventListener("pointerenter", () => {
        bar.tooltip.innerHTML = tooltipHTML;
        bar.tooltip.style.left = el.style.left;
        bar.tooltip.dataset.visible = "true";
      });
      el.addEventListener("pointerleave", () => {
        delete bar.tooltip.dataset.visible;
      });
      bar.markersHost.appendChild(el);
    };

    if (scope === "book") {
      // Whole-book layout: every chapter gets a band, internal
      // boundaries get lines, every bookmark/comment from any chapter
      // gets a marker at its absolute book time.
      order.forEach((link, chapterIndex) => {
        const start = this._chapterStarts[chapterIndex] ?? 0;
        const dur = link.duration ?? 0;
        const startPct = Math.min(100, Math.max(0, (start / duration) * 100));
        const widthPct = Math.min(100, Math.max(0, (dur / duration) * 100));

        const band = document.createElement("div");
        band.className = "dita-audiobook-timeline-chapter";
        band.style.left = startPct + "%";
        band.style.width = widthPct + "%";
        band.dataset.chapterIndex = String(chapterIndex);
        band.dataset.chapterBand = "true";
        bar.markersHost.appendChild(band);

        if (chapterIndex > 0) {
          const sep = document.createElement("div");
          sep.className = "dita-audiobook-timeline-boundary";
          sep.style.left = startPct + "%";
          sep.dataset.chapterIndex = String(chapterIndex);
          const title = link.title || `Track ${chapterIndex + 1}`;
          sep.title = `${title} — ${formatTime(start)}`;
          sep.setAttribute("aria-label", `Jump to ${title}`);
          sep.addEventListener("click", (e) => {
            e.stopPropagation();
            this.seekToBookTime(start);
          });
          bar.markersHost.appendChild(sep);
        }

        const absHref = this.publication.getAbsoluteHref(link.href);
        for (const b of bookmarks) {
          if (b.href !== absHref) continue;
          const t = b.locations?.time;
          if (typeof t !== "number") continue;
          placeMarker(start + t, "bookmark", this.bookmarkTooltipHTML(t), () =>
            this.seekToBookTime(start + t)
          );
        }
        for (const c of comments) {
          if (c.href !== absHref) continue;
          const t = c.locations?.time;
          if (typeof t !== "number") continue;
          placeMarker(
            start + t,
            "comment",
            this.commentTooltipHTML(c.body ?? "", t),
            () => this.seekToBookTime(start + t)
          );
        }
      });
    } else {
      // Chapter scope: only the current chapter's markers.
      const idx = this.currentChapterIndex();
      const link = order[idx];
      if (!link) return;
      const absHref = this.publication.getAbsoluteHref(link.href);
      for (const b of bookmarks) {
        if (b.href !== absHref) continue;
        const t = b.locations?.time;
        if (typeof t !== "number") continue;
        placeMarker(t, "bookmark", this.bookmarkTooltipHTML(t), () =>
          this.seekToChapterTime(t)
        );
      }
      for (const c of comments) {
        if (c.href !== absHref) continue;
        const t = c.locations?.time;
        if (typeof t !== "number") continue;
        placeMarker(
          t,
          "comment",
          this.commentTooltipHTML(c.body ?? "", t),
          () => this.seekToChapterTime(t)
        );
      }
    }
  }

  private bookmarkTooltipHTML(t: number): string {
    return `Bookmark<span class="dita-audiobook-timeline-tooltip-time">${formatTime(t)}</span>`;
  }

  private commentTooltipHTML(body: string, t: number): string {
    const trimmed = body.length > 60 ? body.slice(0, 57) + "…" : body;
    return `${escapeHtml(trimmed)}<span class="dita-audiobook-timeline-tooltip-time">${formatTime(t)}</span>`;
  }

  // ── Internal: hover / fisheye ────────────────────────────────────

  private onHover(bar: Bar, event: PointerEvent): void {
    const { scope } = this.resolveScope(bar);
    if (scope === "book" && this.isUsable) {
      this.updateFisheye(bar, event);
    }
    this.updateTooltip(bar, event);
  }

  private onHoverEnd(bar: Bar): void {
    if (bar.fisheye) {
      bar.fisheye = null;
      this.applyFisheyeVisuals(bar, -1);
    }
    delete bar.tooltip.dataset.visible;
  }

  private updateFisheye(bar: Bar, event: PointerEvent): void {
    const order = this.publication.readingOrder ?? [];
    const durations = order.map((l) => l.duration ?? 0);
    if (durations.length < 2) return;
    const cursorPct = this.cursorPercent(bar, event);
    const currentLayout = bar.fisheye?.layout ?? fisheyeLayout(durations, -1);
    const hoveredIdx = fisheyeChapterAt(currentLayout, cursorPct);
    const layout = fisheyeLayout(durations, hoveredIdx);
    bar.fisheye = { layout, hoveredIdx };
    this.applyFisheyeVisuals(bar, hoveredIdx);
  }

  private applyFisheyeVisuals(bar: Bar, hoveredIndex: number): void {
    const order = this.publication.readingOrder ?? [];
    const durations = order.map((l) => l.duration ?? 0);
    const layout = fisheyeLayout(durations, hoveredIndex);

    for (const band of bar.markersHost.querySelectorAll<HTMLElement>(
      "[data-chapter-band]"
    )) {
      const i = Number(band.dataset.chapterIndex);
      if (!Number.isFinite(i) || !layout[i]) continue;
      band.style.left = layout[i].startPct + "%";
      band.style.width = layout[i].widthPct + "%";
      if (i === hoveredIndex) band.dataset.hovered = "true";
      else delete band.dataset.hovered;
    }
    for (const sep of bar.markersHost.querySelectorAll<HTMLElement>(
      "[data-chapter-index]:not([data-chapter-band])"
    )) {
      const i = Number(sep.dataset.chapterIndex);
      if (Number.isFinite(i) && layout[i]) {
        sep.style.left = layout[i].startPct + "%";
      }
    }
    for (const m of bar.markersHost.querySelectorAll<HTMLElement>(
      "[data-book-time]"
    )) {
      const t = Number(m.dataset.bookTime);
      if (!Number.isFinite(t)) continue;
      const breakdown = this.fromBookTime(t);
      const ci = breakdown.chapterIndex;
      const within =
        durations[ci] > 0 ? breakdown.timeInChapter / durations[ci] : 0;
      const cell = layout[ci];
      if (!cell) continue;
      m.style.left = cell.startPct + within * cell.widthPct + "%";
    }
  }

  private updateTooltip(bar: Bar, event: PointerEvent): void {
    // pointermove bubbles from markers/boundaries — they own their own
    // tooltip via pointerenter; skip here so we don't overwrite.
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        ".dita-audiobook-timeline-marker, .dita-audiobook-timeline-boundary"
      )
    ) {
      return;
    }
    const cursorPct = this.cursorPercent(bar, event);
    const { scope, duration } = this.resolveScope(bar);
    if (duration <= 0) {
      delete bar.tooltip.dataset.visible;
      return;
    }
    const order = this.publication.readingOrder ?? [];
    let chapterTitle = "";
    let chapterTime = 0;
    if (scope === "book") {
      const cursorBookTime = this.cursorBookTime(bar, event);
      const breakdown = this.fromBookTime(cursorBookTime);
      chapterTitle =
        order[breakdown.chapterIndex]?.title ||
        `Track ${breakdown.chapterIndex + 1}`;
      chapterTime = breakdown.timeInChapter;
    } else {
      const idx = this.currentChapterIndex();
      const link = order[idx];
      chapterTitle = link?.title || `Track ${idx + 1}`;
      chapterTime = (cursorPct / 100) * duration;
    }
    bar.tooltip.innerHTML = `${escapeHtml(chapterTitle)}<span class="dita-audiobook-timeline-tooltip-time">${formatTime(chapterTime)}</span>`;
    bar.tooltip.style.left = cursorPct + "%";
    bar.tooltip.dataset.visible = "true";
  }

  private cursorPercent(bar: Bar, event: PointerEvent): number {
    const rect = bar.root.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)
    );
  }

  private cursorBookTime(bar: Bar, event: PointerEvent): number {
    const order = this.publication.readingOrder ?? [];
    const durations = order.map((l) => l.duration ?? 0);
    const layout = bar.fisheye?.layout ?? fisheyeLayout(durations, -1);
    return fisheyePercentToBookTime(
      durations,
      layout,
      this.cursorPercent(bar, event)
    );
  }

  // ── Internal: drag / click → seek ────────────────────────────────

  private beginDrag(bar: Bar, event: PointerEvent): void {
    const { duration } = this.resolveScope(bar);
    if (duration <= 0) return;
    bar.isDragging = true;
    bar.root.classList.add("dragging");
    this.updateDrag(bar, event);
    bar.boundPointerMove = (e) => this.updateDrag(bar, e);
    bar.boundPointerUp = () => this.endDrag(bar);
    window.addEventListener("pointermove", bar.boundPointerMove);
    window.addEventListener("pointerup", bar.boundPointerUp, { once: true });
  }

  private updateDrag(bar: Bar, event: PointerEvent): void {
    if (!bar.isDragging) return;
    const { scope, duration } = this.resolveScope(bar);
    const cursorPct = this.cursorPercent(bar, event);
    if (scope === "book") {
      this.updateFisheye(bar, event);
      bar.dragValue = this.cursorBookTime(bar, event);
      // Warm the chapter under the cursor while the user is still
      // dragging. By release time the audio is already loading, so
      // the cross-chapter seek lands without paying the cold-fetch
      // delay against IA's CDN. Pool dedupes — repeated calls for the
      // same chapter cost nothing.
      const breakdown = this.fromBookTime(bar.dragValue);
      this.host.prefetchResource(breakdown.chapterIndex);
    } else {
      bar.dragValue = (cursorPct / 100) * duration;
    }
    bar.fill.style.width = cursorPct + "%";
    bar.thumb.style.left = cursorPct + "%";
    bar.root.setAttribute("aria-valuenow", String(Math.round(bar.dragValue)));
  }

  private endDrag(bar: Bar): void {
    if (!bar.isDragging) return;
    bar.isDragging = false;
    bar.root.classList.remove("dragging");
    if (bar.boundPointerMove) {
      window.removeEventListener("pointermove", bar.boundPointerMove);
      bar.boundPointerMove = undefined;
    }
    bar.boundPointerUp = undefined;
    const { scope } = this.resolveScope(bar);
    if (scope === "book") this.seekToBookTime(bar.dragValue);
    else this.seekToChapterTime(bar.dragValue);
  }

  private onKeyDown(bar: Bar, event: KeyboardEvent): void {
    const { scope, duration, position } = this.resolveScope(bar);
    if (duration <= 0) return;
    let target: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        target = Math.max(0, position - KEYBOARD_STEP_SECONDS);
        break;
      case "ArrowRight":
        event.preventDefault();
        target = Math.min(duration, position + KEYBOARD_STEP_SECONDS);
        break;
      case "Home":
        event.preventDefault();
        target = 0;
        break;
      case "End":
        event.preventDefault();
        target = Math.max(0, duration - 1);
        break;
    }
    if (target === null) return;
    if (scope === "book") this.seekToBookTime(target);
    else this.seekToChapterTime(target);
  }

  // ── Internal: seek dispatch ──────────────────────────────────────

  private seekToChapterTime(time: number): void {
    const idx = this.currentChapterIndex();
    const link = this.publication.readingOrder?.[idx];
    if (!link) return;
    void this.host.goTo({
      href: link.href,
      locations: { time },
    });
  }

  private seekToBookTime(absTime: number): void {
    const breakdown = this.fromBookTime(absTime);
    void this.host.goTo({
      href: breakdown.href,
      locations: { time: breakdown.timeInChapter },
    });
  }
}
