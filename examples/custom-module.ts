/**
 * Examples: Creating custom reader modules.
 *
 * Custom modules register alongside built-in modules and receive
 * the same lifecycle callbacks. Pass them in the D2Reader.load() config.
 *
 * Every module must declare a `hostType`:
 *   - "epub" — requires EpubModuleHost (iframes, highlighter, view, etc.)
 *   - "pdf"  — requires PDFModuleHost (PDF container, page events, etc.)
 *
 * The reader validates hostType during registration and skips modules
 * that don't match the current navigator with a console warning.
 */

import {
  ReaderModule,
  HostType,
  EpubModuleHost,
  PDFModuleHost,
  // @ts-ignore
} from "@d-i-t-a/reader";

// ─── Example 1: EPUB vocabulary builder ─────────────────────────────────────

/**
 * Captures word selections in EPUB content and saves them to a vocabulary list.
 * Requires iframe DOM access — EPUB only.
 *
 * Usage:
 * ```ts
 * const vocab = new VocabularyBuilder();
 * const reader = await D2Reader.load({
 *   url: new URL("https://example.com/manifest.json"),
 *   injectables: [],
 *   modules: [vocab],
 * });
 *
 * // Get saved words:
 * const mod = reader.navigator.getModule<VocabularyBuilder>("vocabulary-builder");
 * console.log(mod?.getWords());
 * ```
 */
class VocabularyBuilder implements ReaderModule<EpubModuleHost> {
  readonly name = "vocabulary-builder";
  readonly hostType = HostType.Epub;
  private host!: EpubModuleHost;

  private words: Array<{ word: string; context: string; href: string }> = [];
  private handler: ((e: MouseEvent) => void) | null = null;

  attach(host: EpubModuleHost): void {
    this.host = host;
  }
  setup() {
    // Listen for double-click (word selection) in the iframe
    this.handler = () => {
      const doc = this.host.iframes[0]?.contentDocument;
      if (!doc) return;
      const selection = doc.getSelection();
      const word = selection?.toString().trim();
      if (!word || word.includes(" ")) return;

      // Get surrounding sentence as context
      const range = selection?.getRangeAt(0);
      const container = range?.startContainer.parentElement;
      const context = container?.textContent?.trim().substring(0, 200) ?? "";

      this.words.push({
        word,
        context,
        href: this.host.currentChapterLink.href,
      });

      this.host.emit("vocabulary.word-added", { word, context });
    };
  }

  onResourceReady() {
    // Attach listener to the new iframe content
    const doc = this.host.iframes[0]?.contentDocument;
    doc?.addEventListener("dblclick", this.handler!);
  }

  getWords() {
    return [...this.words];
  }

  stop() {
    const doc = this.host.iframes[0]?.contentDocument;
    if (this.handler) doc?.removeEventListener("dblclick", this.handler);
    this.words = [];
  }
}

// ─── Example 2: PDF page time tracker ───────────────────────────────────────

/**
 * Tracks how long the user spends on each PDF page.
 * Requires PDF navigator — uses page change events via the host.
 *
 * Usage:
 * ```ts
 * const tracker = new PageTimeTracker();
 * const reader = await D2Reader.load({
 *   url: new URL("https://example.com/document.pdf"),
 *   workerSrc: "/viewer/pdf.worker.min.mjs",
 *   injectables: [],
 *   modules: [tracker],
 * });
 *
 * // Get time spent per page:
 * const mod = reader.navigator.getModule<PageTimeTracker>("page-time-tracker");
 * console.log(mod?.getPageTimes());
 * ```
 */
class PageTimeTracker implements ReaderModule<PDFModuleHost> {
  readonly name = "page-time-tracker";
  readonly hostType = HostType.PDF;
  private host!: PDFModuleHost;

  private pageTimes: Map<number, number> = new Map();
  private currentPage: number = 1;
  private pageStartTime: number = Date.now();

  attach(host: PDFModuleHost): void {
    this.host = host;
  }
  setup() {
    this.currentPage = this.host.currentLocator()?.locations?.page ?? 1;
    this.pageStartTime = Date.now();
  }

  onResourceReady() {
    // Record time for previous page
    const elapsed = Date.now() - this.pageStartTime;
    const prev = this.pageTimes.get(this.currentPage) ?? 0;
    this.pageTimes.set(this.currentPage, prev + elapsed);

    // Start tracking new page
    this.currentPage = this.host.currentLocator()?.locations?.page ?? 1;
    this.pageStartTime = Date.now();

    this.host.emit("page-time.updated", {
      page: this.currentPage,
      totalTime: this.pageTimes.get(this.currentPage) ?? 0,
    });
  }

  getPageTimes(): Record<number, number> {
    return Object.fromEntries(this.pageTimes);
  }

  getTotalTime(): number {
    let total = 0;
    for (const time of this.pageTimes.values()) total += time;
    return total;
  }

  stop() {
    // Record final page time
    const elapsed = Date.now() - this.pageStartTime;
    const prev = this.pageTimes.get(this.currentPage) ?? 0;
    this.pageTimes.set(this.currentPage, prev + elapsed);
  }
}

export { VocabularyBuilder, PageTimeTracker };
