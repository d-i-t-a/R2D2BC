import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import D2Reader, { Injectable } from "../../src";
import readiumBefore from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-before.css";
import readiumAfter from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-after.css";
import readiumDefault from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-default.css";
import readiumDitaPatch from "url:../../viewer/readium-css-v2/ReadiumCSS-dita-patch.css";
import cjkBefore from "url:../../node_modules/@readium/css/css/dist/cjk-horizontal/ReadiumCSS-before.css";
import cjkAfter from "url:../../node_modules/@readium/css/css/dist/cjk-horizontal/ReadiumCSS-after.css";
import cjkDefault from "url:../../node_modules/@readium/css/css/dist/cjk-horizontal/ReadiumCSS-default.css";

// Detect CJK (Chinese, Japanese, Korean) publications from metadata.languages
// so we can load the CJK-horizontal stylesheet variant instead of the base.
const CJK_LANG_RE = /^(ja|zh|ko)(\b|-)/i;
const isCJK = (pub: any) => {
  const langs = pub?.metadata?.languages;
  return (
    Array.isArray(langs) && langs.some((l: string) => CJK_LANG_RE.test(l ?? ""))
  );
};

const injectables: Injectable[] = [
  // Base — non-CJK only
  {
    type: "style",
    url: readiumBefore,
    r2before: true,
    when: (ctx: any) => !isCJK(ctx.publication),
  },
  {
    type: "style",
    url: readiumDefault,
    r2default: true,
    when: (ctx: any) => !isCJK(ctx.publication),
  },
  {
    type: "style",
    url: readiumAfter,
    r2after: true,
    when: (ctx: any) => !isCJK(ctx.publication),
  },
  // CJK-horizontal — CJK only
  {
    type: "style",
    url: cjkBefore,
    r2before: true,
    when: (ctx: any) => isCJK(ctx.publication),
  },
  {
    type: "style",
    url: cjkDefault,
    r2default: true,
    when: (ctx: any) => isCJK(ctx.publication),
  },
  {
    type: "style",
    url: cjkAfter,
    r2after: true,
    when: (ctx: any) => isCJK(ctx.publication),
  },
  // dita-patch always
  { type: "style", url: readiumDitaPatch },
];

// ── Themes ───────────────────────────────────────────────────────────

const themes: Record<string, { bg: string; fg: string; border: string }> = {
  day: { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
  sepia: { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
  night: { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
  "readium-default-on": { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
  "readium-sepia-on": { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
  "readium-night-on": { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
};

// ── Styles ───────────────────────────────────────────────────────────

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const TOOLBAR_H = 42;
const SIDEBAR_W = 280;

const css = {
  toolbar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 10px",
    height: TOOLBAR_H,
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid",
    fontFamily: FONT,
    fontSize: 12,
    transition: "background .2s, color .2s",
  } as React.CSSProperties,
  badge: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    padding: "2px 8px",
    borderRadius: 10,
    color: "#fff",
    background: "#61dafb",
    flexShrink: 0,
  } as React.CSSProperties,
  btn: {
    padding: "4px 10px",
    fontSize: 11,
    border: "1px solid transparent",
    borderRadius: 14,
    background: "none",
    cursor: "pointer",
    color: "inherit",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  btnActive: {
    background: "rgba(128,128,128,0.2)",
    fontWeight: 600,
  } as React.CSSProperties,
  sep: {
    width: 1,
    height: 18,
    background: "currentColor",
    opacity: 0.2,
    flexShrink: 0,
  } as React.CSSProperties,
  select: {
    padding: "4px 6px",
    fontSize: 11,
    border: "1px solid #d0d0d0",
    borderRadius: 6,
    background: "inherit",
    color: "inherit",
  } as React.CSSProperties,
  slider: { width: 70, accentColor: "#4a90d9" } as React.CSSProperties,
  sidebar: {
    position: "fixed",
    top: TOOLBAR_H,
    bottom: 0,
    width: SIDEBAR_W,
    borderRight: "1px solid",
    overflowY: "auto",
    padding: "10px 0",
    fontFamily: FONT,
    fontSize: 12,
    zIndex: 9,
    transition: "transform .2s ease",
  } as React.CSSProperties,
  sidebarHidden: {
    transform: `translateX(-${SIDEBAR_W}px)`,
  } as React.CSSProperties,
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.15)",
    zIndex: 8,
  } as React.CSSProperties,
  tocItem: {
    padding: "6px 14px",
    cursor: "pointer",
    color: "inherit",
    borderBottom: "1px solid #f0f0f0",
    lineHeight: 1.4,
  } as React.CSSProperties,
  tocItemHover: { background: "#e8e8e8" } as React.CSSProperties,
  settingsPanel: {
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } as React.CSSProperties,
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  } as React.CSSProperties,
  label: {
    fontSize: 11,
    color: "inherit",
    opacity: 0.7,
    flexShrink: 0,
  } as React.CSSProperties,
  value: {
    fontSize: 10,
    opacity: 0.5,
    minWidth: 28,
    textAlign: "right",
  } as React.CSSProperties,
  bookmarkItem: {
    padding: "8px 14px",
    cursor: "pointer",
    color: "inherit",
    borderBottom: "1px solid #f0f0f0",
    fontSize: 11,
    lineHeight: 1.4,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as React.CSSProperties,
  deleteBtn: {
    fontSize: 10,
    color: "#c00",
    cursor: "pointer",
    border: "none",
    background: "none",
    padding: "2px 6px",
  } as React.CSSProperties,
};

// ── Sidebar panels ───────────────────────────────────────────────────

type SidebarTab = "toc" | "settings" | "bookmarks" | "search";

function TabBar({
  active,
  onChange,
}: {
  active: SidebarTab;
  onChange: (t: SidebarTab) => void;
}) {
  const tabs: { key: SidebarTab; label: string }[] = [
    { key: "toc", label: "TOC" },
    { key: "settings", label: "Settings" },
    { key: "bookmarks", label: "Bookmarks" },
    { key: "search", label: "Search" },
  ];
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            border: "none",
            cursor: "pointer",
            background: active === t.key ? "#e8e8e8" : "transparent",
            fontWeight: active === t.key ? 600 : 400,
            color: "inherit",
          }}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TOCPanel({
  reader,
  onNavigate,
}: {
  reader: D2Reader;
  onNavigate: () => void;
}) {
  const toc = reader.tableOfContents || [];
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div>
      {toc.length === 0 && (
        <div style={{ padding: 14, opacity: 0.5 }}>No table of contents</div>
      )}
      {toc.map((item: any, i: number) => (
        <div
          key={i}
          style={{ ...css.tocItem, ...(hover === i ? css.tocItemHover : {}) }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            reader.goTo({ href: item.href, locations: {}, title: item.title });
            onNavigate();
          }}
        >
          {item.title || item.href}
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({
  reader,
  refresh,
}: {
  reader: D2Reader;
  refresh: () => void;
}) {
  const s = reader.currentSettings;
  const apply = (settings: any) => {
    reader.applyUserSettings(settings);
    refresh();
  };

  return (
    <div style={css.settingsPanel as React.CSSProperties}>
      {/* Font size */}
      <div style={css.settingRow}>
        <span style={css.label}>Font Size</span>
        <input
          type="range"
          min={100}
          max={300}
          step={25}
          defaultValue={s.fontSize}
          style={css.slider}
          onChange={(e) => apply({ fontSize: Number(e.target.value) })}
        />
        <span style={css.value as React.CSSProperties}>{s.fontSize}%</span>
      </div>

      {/* Font family */}
      <div style={css.settingRow}>
        <span style={css.label}>Font</span>
        <select
          style={css.select}
          defaultValue={s.fontFamily}
          onChange={(e) => apply({ fontFamily: e.target.value })}
        >
          <option value="Original">Publisher</option>
          <option value="serif">Serif</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="opendyslexic">Open Dyslexic</option>
        </select>
      </div>

      {/* Appearance */}
      <div style={css.settingRow}>
        <span style={css.label}>Theme</span>
        <div style={{ display: "flex", gap: 0 }}>
          {(["day", "sepia", "night"] as const).map((mode, i) => (
            <button
              key={mode}
              style={{
                ...css.btn,
                borderRadius:
                  i === 0 ? "14px 0 0 14px" : i === 2 ? "0 14px 14px 0" : 0,
                background:
                  mode === "night"
                    ? "#121212"
                    : mode === "sepia"
                      ? "#f5e6c8"
                      : "#fff",
                color: mode === "night" ? "#fff" : "#555",
                minWidth: 50,
              }}
              onClick={() => apply({ appearance: mode })}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div style={css.settingRow}>
        <span style={css.label}>Layout</span>
        <div style={{ display: "flex", gap: 0 }}>
          <button
            style={{
              ...css.btn,
              borderRadius: "14px 0 0 14px",
              minWidth: 60,
              ...(s.verticalScroll ? css.btnActive : {}),
            }}
            onClick={() => {
              reader.scroll(true);
              refresh();
            }}
          >
            Scroll
          </button>
          <button
            style={{
              ...css.btn,
              borderRadius: "0 14px 14px 0",
              minWidth: 60,
              ...(!s.verticalScroll ? css.btnActive : {}),
            }}
            onClick={() => {
              reader.scroll(false);
              refresh();
            }}
          >
            Pages
          </button>
        </div>
      </div>

      {/* Line height */}
      <div style={css.settingRow}>
        <span style={css.label}>Line Height</span>
        <input
          type="range"
          min={1}
          max={2}
          step={0.25}
          defaultValue={s.lineHeight}
          style={css.slider}
          onChange={(e) => apply({ lineHeight: Number(e.target.value) })}
        />
      </div>

      {/* Page margins */}
      <div style={css.settingRow}>
        <span style={css.label}>Margins</span>
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.25}
          defaultValue={s.pageMargins}
          style={css.slider}
          onChange={(e) => apply({ pageMargins: Number(e.target.value) })}
        />
      </div>

      {/* Word spacing */}
      <div style={css.settingRow}>
        <span style={css.label}>Word Spacing</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.25}
          defaultValue={s.wordSpacing}
          style={css.slider}
          onChange={(e) => apply({ wordSpacing: Number(e.target.value) })}
        />
      </div>

      {/* Letter spacing */}
      <div style={css.settingRow}>
        <span style={css.label}>Letter Spacing</span>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.0625}
          defaultValue={s.letterSpacing}
          style={css.slider}
          onChange={(e) => apply({ letterSpacing: Number(e.target.value) })}
        />
      </div>

      {/* Paragraph spacing */}
      <div style={css.settingRow}>
        <span style={css.label}>Paragraph Spacing</span>
        <input
          type="range"
          min={0}
          max={3}
          step={0.5}
          defaultValue={s.paraSpacing ?? 0}
          style={css.slider}
          onChange={(e) => apply({ paraSpacing: Number(e.target.value) })}
        />
      </div>

      {/* Paragraph indent */}
      <div style={css.settingRow}>
        <span style={css.label}>Paragraph Indent</span>
        <input
          type="range"
          min={0}
          max={3}
          step={0.5}
          defaultValue={s.paraIndent ?? 1}
          style={css.slider}
          onChange={(e) => apply({ paraIndent: Number(e.target.value) })}
        />
      </div>

      {/* Alignment */}
      <div style={css.settingRow}>
        <span style={css.label}>Align</span>
        <select
          style={css.select}
          defaultValue={s.textAlignment}
          onChange={(e) => apply({ textAlignment: e.target.value })}
        >
          <option value="auto">Auto</option>
          <option value="justify">Justify</option>
          <option value="start">Start</option>
        </select>
      </div>

      {/* Columns */}
      <div style={css.settingRow}>
        <span style={css.label}>Columns</span>
        <select
          style={css.select}
          defaultValue={s.columnCount}
          onChange={(e) => apply({ columnCount: e.target.value })}
        >
          <option value="auto">Auto</option>
          <option value="1">Single</option>
          <option value="2">Double</option>
        </select>
      </div>

      {/* Reset */}
      <button
        style={{ ...css.btn, marginTop: 8, alignSelf: "center" }}
        onClick={() => {
          reader.resetUserSettings();
          refresh();
        }}
      >
        Reset
      </button>
    </div>
  );
}

function SearchPanel({
  reader,
  onNavigate,
}: {
  reader: D2Reader;
  onNavigate: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!term.trim()) return;
    const res = await reader.search(term.trim(), false);
    setResults(res || []);
    setSearched(true);
  };

  const clear = async () => {
    await reader.clearSearch();
    setResults([]);
    setSearched(false);
    setTerm("");
  };

  return (
    <div>
      <div style={{ padding: "8px 12px", display: "flex", gap: 6 }}>
        <input
          type="text"
          value={term}
          placeholder="Search…"
          style={{
            flex: 1,
            padding: "6px 8px",
            fontSize: 11,
            border: "1px solid #d0d0d0",
            borderRadius: 6,
            outline: "none",
          }}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <button style={css.btn} onClick={doSearch}>
          Go
        </button>
        {searched && (
          <button style={css.btn} onClick={clear}>
            ✕
          </button>
        )}
      </div>
      {searched && results.length === 0 && (
        <div style={{ padding: 14, opacity: 0.5 }}>No results found</div>
      )}
      {results.map((r: any, i: number) => (
        <div
          key={r.uuid ?? i}
          style={{ ...css.tocItem, fontSize: 11 }}
          onClick={() => {
            reader.goToSearchID(r.href, r.uuid, false);
            onNavigate();
          }}
        >
          <span style={{ opacity: 0.5 }}>…{r.textBefore}</span>
          <mark>{r.textMatch}</mark>
          <span style={{ opacity: 0.5 }}>{r.textAfter}…</span>
        </div>
      ))}
    </div>
  );
}

function BookmarksPanel({
  reader,
  refresh,
}: {
  reader: D2Reader;
  refresh: () => void;
}) {
  const bookmarks = reader.bookmarks || [];

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #e0e0e0" }}>
        <button
          style={{ ...css.btn, width: "100%" }}
          onClick={() => {
            reader.saveBookmark();
            refresh();
          }}
        >
          + Add Bookmark
        </button>
      </div>
      {bookmarks.length === 0 && (
        <div style={{ padding: 14, opacity: 0.5 }}>No bookmarks yet</div>
      )}
      {bookmarks.map((bm: any, i: number) => (
        <div key={bm.id || i} style={css.bookmarkItem}>
          <span
            style={{ cursor: "pointer", flex: 1 }}
            onClick={() => reader.goTo(bm)}
          >
            {bm.href?.split("/").pop() || bm.href}
            {bm.locations?.progression != null && (
              <span style={{ opacity: 0.5, marginLeft: 6 }}>
                ({Math.round(bm.locations.progression * 100)}%)
              </span>
            )}
          </span>
          <button
            style={css.deleteBtn}
            onClick={() => {
              reader.deleteBookmark(bm);
              refresh();
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────

interface PageInfo {
  chapterTitle?: string;
  pageIndex?: number;
  pageCount?: number;
  progression?: number;
  totalProgression?: number;
  position?: number;
  remainingPositions?: number;
  totalRemainingPositions?: number;
}

function Toolbar({
  reader,
  refresh,
  sidebarOpen,
  onToggleSidebar,
  pageInfo,
  onPageTurn,
  theme,
}: {
  reader: D2Reader;
  refresh: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  pageInfo: PageInfo;
  onPageTurn: () => void;
  theme: { bg: string; fg: string; border: string };
}) {
  const settings = reader.currentSettings;
  const isScrolling = settings.verticalScroll ?? false;

  return (
    <div
      style={{
        ...css.toolbar,
        background: theme.bg,
        color: theme.fg,
        borderColor: theme.border,
      }}
    >
      {/* Menu toggle */}
      <button style={css.btn} onClick={onToggleSidebar}>
        {sidebarOpen ? "✕" : "☰"}
      </button>
      <span style={css.badge}>React</span>

      <div style={css.sep} />

      {/* Navigation */}
      <button
        style={css.btn}
        onClick={() => {
          reader.previousPage();
          setTimeout(onPageTurn, 150);
        }}
      >
        ←
      </button>
      <button
        style={css.btn}
        onClick={() => {
          reader.nextPage();
          setTimeout(onPageTurn, 150);
        }}
      >
        →
      </button>

      <div style={css.sep} />

      {/* Layout toggle */}
      <button
        style={{ ...css.btn, ...(isScrolling ? css.btnActive : {}) }}
        onClick={() => {
          reader.scroll(true);
          refresh();
        }}
      >
        Scroll
      </button>
      <button
        style={{ ...css.btn, ...(!isScrolling ? css.btnActive : {}) }}
        onClick={() => {
          reader.scroll(false);
          refresh();
        }}
      >
        Pages
      </button>

      <div style={css.sep} />

      {/* Page info */}
      <span
        style={{
          fontSize: 11,
          color: "inherit",
          opacity: 0.7,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {pageInfo.chapterTitle && (
          <span style={{ opacity: 0.5, marginRight: 6 }}>
            {pageInfo.chapterTitle}
          </span>
        )}
        {pageInfo.pageIndex != null &&
          pageInfo.pageCount != null &&
          !isScrolling && (
            <span>
              Page {pageInfo.pageIndex} of {pageInfo.pageCount}
            </span>
          )}
        {pageInfo.totalProgression != null && (
          <span style={{ opacity: 0.5, marginLeft: 6 }}>
            {Math.round(pageInfo.totalProgression * 100)}%
          </span>
        )}
      </span>

      <div style={{ flex: 1 }} />

      {/* Bookmark shortcut */}
      <button
        style={css.btn}
        onClick={() => {
          reader.saveBookmark();
          refresh();
        }}
      >
        Bookmark
      </button>
    </div>
  );
}

// ── Loading ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: FONT,
        opacity: 0.5,
        fontSize: 16,
      }}
    >
      Loading reader…
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────

function App() {
  const [reader, setReader] = useState<D2Reader | null>(null);
  const [, setTick] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("toc");
  const [pageInfo, setPageInfo] = useState<PageInfo>({});
  const [appearance, setAppearance] = useState("day");
  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);
  const theme = themes[appearance] || themes.day;

  const updatePageInfo = useCallback((r: D2Reader) => {
    try {
      const locator = r.currentLocator;
      if (locator) {
        setPageInfo({
          chapterTitle: locator.title,
          pageIndex: locator.displayInfo?.resourceScreenIndex,
          pageCount: locator.displayInfo?.resourceScreenCount,
          progression: locator.locations?.progression,
          totalProgression: locator.locations?.totalProgression,
          position: locator.locations?.position,
          remainingPositions: locator.locations?.remainingPositions,
          totalRemainingPositions: locator.locations?.totalRemainingPositions,
        });
      }
      const a = r.currentSettings?.appearance;
      if (a) setAppearance(a);
    } catch (_) {
      /* locator may not be ready yet */
    }
  }, []);

  useEffect(() => {
    D2Reader.load({
      url: new URL("https://alice.dita.digital/manifest.json"),
      injectables,
      injectablesFixed: [],
      rights: {
        enableBookmarks: true,
        enableAnnotations: true,
        enableSearch: true,
        enableContentProtection: false,
        enableTTS: false,
        enableTimeline: false,
        enableDefinitions: false,
        enableMediaOverlays: false,
        enablePageBreaks: false,
        enableLineFocus: false,
        autoGeneratePositions: true,
      },
      api: {
        updateCurrentLocation: async () => {},
        updateSettings: async (settings: any) => {
          const appearance = settings?.appearance;
          if (typeof appearance === "string") setAppearance(appearance);
        },
      },
    }).then((r) => {
      setReader(r);
      // Listen for navigation events to update page info
      r.addEventListener("resource.ready", () => updatePageInfo(r));
      // Also update on click (handles page turns within same resource)
      r.addEventListener("click", () =>
        setTimeout(() => updatePageInfo(r), 100)
      );
      // Sync persisted appearance
      const a = r.currentSettings?.appearance;
      if (a) setAppearance(a);
      // Initial update
      setTimeout(() => updatePageInfo(r), 500);
    });
  }, [updatePageInfo]);

  // Keyboard navigation
  useEffect(() => {
    if (!reader) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        reader.nextPage();
        setTimeout(() => updatePageInfo(reader), 100);
      }
      if (e.key === "ArrowLeft") {
        reader.previousPage();
        setTimeout(() => updatePageInfo(reader), 100);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reader, updatePageInfo]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div style={{ background: theme.bg, color: theme.fg, minHeight: "100vh" }}>
      {reader && (
        <>
          <Toolbar
            reader={reader}
            refresh={refresh}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            pageInfo={pageInfo}
            onPageTurn={() => updatePageInfo(reader)}
            theme={theme}
          />

          {/* Sidebar */}
          <div
            style={{
              ...css.sidebar,
              background: theme.bg,
              color: theme.fg,
              borderColor: theme.border,
              ...(sidebarOpen ? {} : css.sidebarHidden),
            }}
          >
            <TabBar active={activeTab} onChange={setActiveTab} />
            {activeTab === "toc" && (
              <TOCPanel reader={reader} onNavigate={closeSidebar} />
            )}
            {activeTab === "settings" && (
              <SettingsPanel reader={reader} refresh={refresh} />
            )}
            {activeTab === "bookmarks" && (
              <BookmarksPanel reader={reader} refresh={refresh} />
            )}
            {activeTab === "search" && (
              <SearchPanel reader={reader} onNavigate={closeSidebar} />
            )}
          </div>

          {/* Overlay to close sidebar */}
          {sidebarOpen && (
            <div
              style={css.overlay as React.CSSProperties}
              onClick={closeSidebar}
            />
          )}
        </>
      )}

      <div
        id="D2Reader-Container"
        style={{ paddingTop: reader ? TOOLBAR_H : 0 }}
      >
        <main
          tabIndex={-1}
          id="iframe-wrapper"
          style={{ height: reader ? `calc(100vh - ${TOOLBAR_H}px)` : "100vh" }}
        >
          {!reader && <LoadingScreen />}
          <div id="reader-loading" className="dita-loading" />
          <div id="reader-error" className="dita-error" />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
