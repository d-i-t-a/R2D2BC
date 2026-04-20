import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import D2Reader from "@d-i-t-a/reader";

interface TocItem {
  title: string;
  href: string;
  children?: TocItem[];
}

@Component({
  selector: "app-reader",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Toolbar -->
    <div class="toolbar" *ngIf="reader">
      <div class="toolbar-group">
        <button class="btn" (click)="toggleToc()" title="Table of Contents">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <button
          class="btn"
          (click)="previousPage()"
          [disabled]="isAtStart"
          title="Previous Page"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          class="btn"
          (click)="nextPage()"
          [disabled]="isAtEnd"
          title="Next Page"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div class="toolbar-info">
        <span class="chapter-title">{{ chapterTitle }}</span>
        <span class="page-info" *ngIf="currentPage > 0">
          Page {{ currentPage }} of {{ totalPages }}
          <span class="progress-text">({{ progressPercent }}%)</span>
        </span>
      </div>

      <div class="toolbar-group">
        <button
          class="btn"
          (click)="toggleScrollMode()"
          [title]="isScrolling ? 'Switch to paginated' : 'Switch to scroll'"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              *ngIf="!isScrolling"
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
            />
            <line *ngIf="isScrolling" x1="12" y1="3" x2="12" y2="21" />
            <polyline *ngIf="isScrolling" points="8 7 12 3 16 7" />
            <polyline *ngIf="isScrolling" points="8 17 12 21 16 17" />
          </svg>
        </button>
        <button class="btn" (click)="saveBookmark()" title="Bookmark this page">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button class="btn" (click)="toggleSettings()" title="Settings">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar" *ngIf="reader">
      <div class="progress-fill" [style.width.%]="progressPercent"></div>
    </div>

    <!-- TOC Sidebar -->
    <div class="toc-overlay" *ngIf="tocOpen" (click)="toggleToc()"></div>
    <div class="toc-sidebar" [class.open]="tocOpen">
      <div class="toc-header">
        <h3>Table of Contents</h3>
        <button class="btn btn-close" (click)="toggleToc()">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <ul class="toc-list">
        <ng-container *ngFor="let item of toc">
          <ng-container
            *ngTemplateOutlet="
              tocItemTpl;
              context: { $implicit: item, depth: 0 }
            "
          ></ng-container>
        </ng-container>
      </ul>

      <ng-template #tocItemTpl let-item let-depth="depth">
        <li class="toc-item" [style.padding-left.px]="16 + depth * 16">
          <a (click)="goToTocItem(item)">{{ item.title }}</a>
        </li>
        <ng-container *ngIf="item.children?.length">
          <ng-container *ngFor="let child of item.children">
            <ng-container
              *ngTemplateOutlet="
                tocItemTpl;
                context: { $implicit: child, depth: depth + 1 }
              "
            ></ng-container>
          </ng-container>
        </ng-container>
      </ng-template>
    </div>

    <!-- Settings Panel -->
    <div
      class="settings-overlay"
      *ngIf="settingsOpen"
      (click)="toggleSettings()"
    ></div>
    <div class="settings-panel" [class.open]="settingsOpen">
      <div class="settings-header">
        <h3>Settings</h3>
        <button class="btn btn-close" (click)="toggleSettings()">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="settings-section">
        <label class="settings-label">Font Size</label>
        <div class="settings-row">
          <button class="btn btn-setting" (click)="decreaseFontSize()">
            A-
          </button>
          <span class="setting-value">{{ fontSizeLabel }}</span>
          <button class="btn btn-setting" (click)="increaseFontSize()">
            A+
          </button>
        </div>
      </div>

      <div class="settings-section">
        <label class="settings-label">Appearance</label>
        <div class="settings-row appearance-row">
          <button
            class="btn btn-appearance"
            [class.active]="appearance === 'readium-default-on'"
            (click)="setAppearance('readium-default-on')"
          >
            <span class="appearance-preview light-preview">Aa</span>
            <span>Light</span>
          </button>
          <button
            class="btn btn-appearance"
            [class.active]="appearance === 'readium-sepia-on'"
            (click)="setAppearance('readium-sepia-on')"
          >
            <span class="appearance-preview sepia-preview">Aa</span>
            <span>Sepia</span>
          </button>
          <button
            class="btn btn-appearance"
            [class.active]="appearance === 'readium-night-on'"
            (click)="setAppearance('readium-night-on')"
          >
            <span class="appearance-preview dark-preview">Aa</span>
            <span>Dark</span>
          </button>
        </div>
      </div>

      <div class="settings-section">
        <button class="btn btn-reset" (click)="resetSettings()">
          Reset to Defaults
        </button>
      </div>
    </div>

    <!-- Reader Container (required DOM structure) -->
    <div id="D2Reader-Container">
      <main id="iframe-wrapper" tabindex="-1">
        <div id="reader-loading" class="dita-loading" *ngIf="!reader">
          <div class="spinner"></div>
          <p>Loading reader...</p>
        </div>
        <div id="reader-error" class="dita-error"></div>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
          Arial, sans-serif;
        height: 100vh;
        overflow: hidden;
        position: relative;
      }

      /* Toolbar */
      .toolbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        height: 48px;
        background: #ffffff;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }

      .toolbar-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .toolbar-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }

      .chapter-title {
        font-size: 13px;
        font-weight: 600;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
      }

      .page-info {
        font-size: 11px;
        color: #888;
      }

      .progress-text {
        color: #aaa;
      }

      /* Buttons */
      .btn {
        background: none;
        border: 1px solid transparent;
        border-radius: 6px;
        padding: 6px 8px;
        cursor: pointer;
        color: #555;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition:
          background 0.15s,
          color 0.15s;
      }

      .btn:hover {
        background: #f0f0f0;
        color: #111;
      }

      .btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .btn:disabled:hover {
        background: none;
      }

      .btn-close {
        padding: 4px;
      }

      .btn-setting {
        font-size: 14px;
        font-weight: 600;
        padding: 6px 14px;
        border: 1px solid #ddd;
        border-radius: 6px;
        min-width: 44px;
      }

      .btn-reset {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 13px;
        color: #555;
      }

      .btn-reset:hover {
        background: #f5f5f5;
      }

      /* Progress Bar */
      .progress-bar {
        position: fixed;
        top: 48px;
        left: 0;
        right: 0;
        height: 2px;
        background: #eee;
        z-index: 100;
      }

      .progress-fill {
        height: 100%;
        background: #6366f1;
        transition: width 0.3s ease;
      }

      /* TOC Sidebar */
      .toc-overlay,
      .settings-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 200;
      }

      .toc-sidebar {
        position: fixed;
        top: 0;
        left: -320px;
        width: 320px;
        height: 100vh;
        background: #fff;
        z-index: 300;
        box-shadow: 2px 0 12px rgba(0, 0, 0, 0.15);
        transition: left 0.25s ease;
        display: flex;
        flex-direction: column;
      }

      .toc-sidebar.open {
        left: 0;
      }

      .toc-header,
      .settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #eee;
      }

      .toc-header h3,
      .settings-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }

      .toc-list {
        list-style: none;
        margin: 0;
        padding: 8px 0;
        overflow-y: auto;
        flex: 1;
      }

      .toc-item a {
        display: block;
        padding: 10px 16px;
        font-size: 14px;
        color: #444;
        text-decoration: none;
        cursor: pointer;
        border-radius: 4px;
        margin: 0 8px;
        transition: background 0.15s;
      }

      .toc-item a:hover {
        background: #f5f5f5;
        color: #111;
      }

      /* Settings Panel */
      .settings-panel {
        position: fixed;
        top: 0;
        right: -360px;
        width: 360px;
        height: 100vh;
        background: #fff;
        z-index: 300;
        box-shadow: -2px 0 12px rgba(0, 0, 0, 0.15);
        transition: right 0.25s ease;
        display: flex;
        flex-direction: column;
      }

      .settings-panel.open {
        right: 0;
      }

      .settings-section {
        padding: 20px 16px;
        border-bottom: 1px solid #f0f0f0;
      }

      .settings-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #888;
        margin-bottom: 12px;
      }

      .settings-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }

      .setting-value {
        font-size: 14px;
        font-weight: 500;
        min-width: 36px;
        text-align: center;
        color: #333;
      }

      .appearance-row {
        gap: 12px;
      }

      .btn-appearance {
        flex: 1;
        flex-direction: column;
        gap: 6px;
        padding: 12px 8px;
        border: 2px solid #eee;
        border-radius: 8px;
        font-size: 12px;
        color: #666;
      }

      .btn-appearance.active {
        border-color: #6366f1;
        color: #6366f1;
      }

      .appearance-preview {
        font-size: 20px;
        font-weight: 700;
        display: block;
        width: 48px;
        height: 36px;
        line-height: 36px;
        border-radius: 4px;
        text-align: center;
      }

      .light-preview {
        background: #fff;
        color: #333;
        border: 1px solid #ddd;
      }

      .sepia-preview {
        background: #f5e6c8;
        color: #5b4636;
      }

      .dark-preview {
        background: #1e1e1e;
        color: #e0e0e0;
      }

      /* Reader Container */
      #D2Reader-Container {
        position: absolute;
        top: 50px;
        left: 0;
        right: 0;
        bottom: 0;
      }

      #iframe-wrapper {
        height: 100%;
        outline: none;
      }

      /* Loading State */
      .dita-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #888;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e0e0e0;
        border-top: 3px solid #6366f1;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 12px;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .dita-loading p {
        font-size: 14px;
        margin: 0;
      }

      .dita-error {
        color: #dc2626;
        text-align: center;
        padding: 20px;
      }
    `,
  ],
})
export class ReaderComponent implements OnInit, OnDestroy {
  reader: D2Reader | null = null;

  // Page info
  chapterTitle = "";
  currentPage = 0;
  totalPages = 0;
  progressPercent = 0;

  // UI state
  isScrolling = false;
  isAtStart = true;
  isAtEnd = false;
  tocOpen = false;
  settingsOpen = false;

  // Settings
  fontSizeLabel = "100%";
  appearance = "readium-default-on";

  // TOC
  toc: TocItem[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    try {
      const url = new URL("https://alice.dita.digital/manifest.json");

      const CJK_LANG_RE = /^(ja|zh|ko)(\b|-)/i;
      const isCJK = (pub: any) => {
        const langs = pub?.metadata?.languages;
        return (
          Array.isArray(langs) &&
          langs.some((l: string) => CJK_LANG_RE.test(l ?? ""))
        );
      };

      this.reader = await D2Reader.load({
        url,
        injectables: [
          {
            type: "style",
            url: "/assets/readium-css-v2/ReadiumCSS-before.css",
            r2before: true,
            when: (ctx: any) => !isCJK(ctx.publication),
          },
          {
            type: "style",
            url: "/assets/readium-css-v2/ReadiumCSS-default.css",
            r2default: true,
            when: (ctx: any) => !isCJK(ctx.publication),
          },
          {
            type: "style",
            url: "/assets/readium-css-v2/ReadiumCSS-after.css",
            r2after: true,
            when: (ctx: any) => !isCJK(ctx.publication),
          },
          {
            type: "style",
            url: "/assets/readium-css-v2/cjk-horizontal/ReadiumCSS-before.css",
            r2before: true,
            when: (ctx: any) => isCJK(ctx.publication),
          },
          {
            type: "style",
            url: "/assets/readium-css-v2/cjk-horizontal/ReadiumCSS-default.css",
            r2default: true,
            when: (ctx: any) => isCJK(ctx.publication),
          },
          {
            type: "style",
            url: "/assets/readium-css-v2/cjk-horizontal/ReadiumCSS-after.css",
            r2after: true,
            when: (ctx: any) => isCJK(ctx.publication),
          },
          {
            type: "style",
            url: "/assets/readium-css-v2/ReadiumCSS-dita-patch.css",
          },
        ],
        injectablesFixed: [],
        rights: {
          enableBookmarks: true,
          enableAnnotations: true,
          enableSearch: true,
          autoGeneratePositions: true,
        },
      });

      this.toc = this.reader.tableOfContents;
      this.updatePageInfo();

      this.reader.addEventListener("resource.ready", () => {
        this.updatePageInfo();
        this.cdr.detectChanges();
      });
    } catch (err) {
      console.error("Failed to load D2Reader:", err);
    }
  }

  ngOnDestroy(): void {
    if (this.reader) {
      this.reader.stop();
      this.reader = null;
    }
  }

  // --- Navigation ---

  async previousPage(): Promise<void> {
    await this.reader?.previousPage();
    this.updatePageInfo();
  }

  async nextPage(): Promise<void> {
    await this.reader?.nextPage();
    this.updatePageInfo();
  }

  // --- Scroll / Paginate ---

  async toggleScrollMode(): Promise<void> {
    if (!this.reader) return;
    const next = !this.isScrolling;
    await this.reader.scroll(next);
    this.isScrolling = next;
    this.cdr.detectChanges();
  }

  // --- Bookmark ---

  async saveBookmark(): Promise<void> {
    if (!this.reader) return;
    const saved = await this.reader.saveBookmark();
    if (saved) {
      console.log("Bookmark saved");
    }
  }

  // --- TOC ---

  toggleToc(): void {
    this.tocOpen = !this.tocOpen;
    if (this.tocOpen) {
      this.settingsOpen = false;
    }
  }

  async goToTocItem(item: TocItem): Promise<void> {
    if (!this.reader) return;
    await this.reader.goTo({ href: item.href } as any);
    this.tocOpen = false;
    this.updatePageInfo();
  }

  // --- Settings ---

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    if (this.settingsOpen) {
      this.tocOpen = false;
    }
  }

  async increaseFontSize(): Promise<void> {
    await this.reader?.increase("fontSize");
    this.updateFontSizeLabel();
  }

  async decreaseFontSize(): Promise<void> {
    await this.reader?.decrease("fontSize");
    this.updateFontSizeLabel();
  }

  async setAppearance(value: string): Promise<void> {
    if (!this.reader) return;
    await this.reader.applyUserSettings({ appearance: value } as any);
    this.appearance = value;
    this.cdr.detectChanges();
  }

  async resetSettings(): Promise<void> {
    await this.reader?.resetUserSettings();
    this.appearance = "readium-default-on";
    this.updateFontSizeLabel();
    this.cdr.detectChanges();
  }

  // --- Helpers ---

  private updatePageInfo(): void {
    if (!this.reader) return;

    const locator = this.reader.currentLocator;
    if (locator) {
      this.chapterTitle = locator.title ?? "";
      const position = locator.locations?.position ?? 0;
      const progression = locator.locations?.totalProgression ?? 0;
      this.currentPage = position;
      this.progressPercent = Math.round(progression * 100);
    }

    const positions = this.reader.positions;
    this.totalPages = positions?.length ?? 0;

    this.isScrolling = this.reader.currentSettings?.verticalScroll ?? false;
    this.isAtStart = this.reader.atStart;
    this.isAtEnd = this.reader.atEnd;

    this.updateFontSizeLabel();
    this.cdr.detectChanges();
  }

  private updateFontSizeLabel(): void {
    const fontSize = this.reader?.currentSettings?.fontSize;
    this.fontSizeLabel = fontSize != null ? `${fontSize}%` : "100%";
  }
}
