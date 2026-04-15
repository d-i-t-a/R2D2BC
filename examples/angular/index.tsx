/**
 * Angular Pattern Preview — rendered in React for standalone Parcel execution.
 *
 * This file mirrors the UI and D2Reader API calls from reader.component.ts so
 * that integrators can run it locally with `npx parcel examples/angular/index.html`
 * and see the same toolbar, TOC sidebar, settings panel, and navigation in action.
 *
 * See reader.component.ts for the real Angular implementation.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import D2Reader from "../../src";
import readiumBefore from "url:../react/readium-css/ReadiumCSS-before.css";
import readiumAfter from "url:../react/readium-css/ReadiumCSS-after.css";
import readiumDefault from "url:../react/readium-css/ReadiumCSS-default.css";

// ── ReadiumCSS injectables (same as reader.component.ts) ─────────────

const injectables = [
  { type: "style", url: readiumBefore, r2before: true },
  { type: "style", url: readiumDefault, r2default: true },
  { type: "style", url: readiumAfter, r2after: true },
];

// ── Shared constants & inline styles ─────────────────────────────────

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const TOOLBAR_H = 48;
const SIDEBAR_W = 320;
const SETTINGS_W = 360;
const ACCENT = "#6366f1";

const styles = {
  /* ── Toolbar ────────────────────────────────────────────────────── */
  toolbar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    height: TOOLBAR_H,
    background: "#ffffff",
    borderBottom: "1px solid #e0e0e0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    fontFamily: FONT,
  } as React.CSSProperties,
  toolbarGroup: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  } as React.CSSProperties,
  toolbarInfo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: 0,
  } as React.CSSProperties,
  chapterTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "inherit",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 300,
  } as React.CSSProperties,
  pageInfo: {
    fontSize: 11,
    color: "inherit",
  } as React.CSSProperties,

  /* ── Buttons ────────────────────────────────────────────────────── */
  btn: {
    background: "none",
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "6px 8px",
    cursor: "pointer",
    color: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT,
  } as React.CSSProperties,
  btnSetting: {
    fontSize: 14,
    fontWeight: 600,
    padding: "6px 14px",
    border: "1px solid rgba(128,128,128,0.3)",
    borderRadius: 6,
    minWidth: 44,
    background: "none",
    color: "inherit",
    cursor: "pointer",
    fontFamily: FONT,
  } as React.CSSProperties,
  btnReset: {
    width: "100%",
    padding: 10,
    border: "1px solid rgba(128,128,128,0.3)",
    borderRadius: 6,
    fontSize: 13,
    color: "inherit",
    background: "none",
    cursor: "pointer",
    fontFamily: FONT,
  } as React.CSSProperties,

  /* ── Progress bar ───────────────────────────────────────────────── */
  progressBar: {
    position: "fixed",
    top: TOOLBAR_H,
    left: 0,
    right: 0,
    height: 2,
    background: "rgba(128,128,128,0.15)",
    zIndex: 100,
  } as React.CSSProperties,

  /* ── Overlays ───────────────────────────────────────────────────── */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.3)",
    zIndex: 200,
  } as React.CSSProperties,

  /* ── TOC sidebar ────────────────────────────────────────────────── */
  tocSidebar: {
    position: "fixed",
    top: 0,
    width: SIDEBAR_W,
    height: "100vh",
    zIndex: 300,
    boxShadow: "2px 0 12px rgba(0,0,0,0.15)",
    transition: "left 0.25s ease",
    display: "flex",
    flexDirection: "column",
    fontFamily: FONT,
  } as React.CSSProperties,
  tocHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottom: "1px solid rgba(128,128,128,0.2)",
  } as React.CSSProperties,
  tocList: {
    listStyle: "none",
    margin: 0,
    padding: "8px 0",
    overflowY: "auto",
    flex: 1,
  } as React.CSSProperties,
  tocItemLink: {
    display: "block",
    padding: "10px 16px",
    fontSize: 14,
    color: "inherit",
    textDecoration: "none",
    cursor: "pointer",
    borderRadius: 4,
    margin: "0 8px",
  } as React.CSSProperties,

  /* ── Settings panel ─────────────────────────────────────────────── */
  settingsPanel: {
    position: "fixed",
    top: 0,
    width: SETTINGS_W,
    height: "100vh",
    zIndex: 300,
    boxShadow: "-2px 0 12px rgba(0,0,0,0.15)",
    transition: "right 0.25s ease",
    display: "flex",
    flexDirection: "column",
    fontFamily: FONT,
  } as React.CSSProperties,
  settingsSection: {
    padding: "20px 16px",
    borderBottom: "1px solid rgba(128,128,128,0.15)",
  } as React.CSSProperties,
  settingsLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    opacity: 0.5,
    color: "inherit",
    marginBottom: 12,
  } as React.CSSProperties,
  settingsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  } as React.CSSProperties,
  settingValue: {
    fontSize: 14,
    fontWeight: 500,
    minWidth: 36,
    textAlign: "center" as const,
    color: "inherit",
  } as React.CSSProperties,
  btnAppearance: {
    flex: 1,
    display: "inline-flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    padding: "12px 8px",
    border: "2px solid rgba(128,128,128,0.2)",
    borderRadius: 8,
    fontSize: 12,
    opacity: 0.7,
    color: "inherit",
    background: "none",
    cursor: "pointer",
    fontFamily: FONT,
  } as React.CSSProperties,
  appearancePreview: {
    fontSize: 20,
    fontWeight: 700,
    display: "block",
    width: 48,
    height: 36,
    lineHeight: "36px",
    borderRadius: 4,
    textAlign: "center" as const,
  } as React.CSSProperties,

  /* ── Loading ────────────────────────────────────────────────────── */
  loading: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    opacity: 0.5,
    color: "inherit",
    fontFamily: FONT,
  } as React.CSSProperties,
};

// ── SVG icon helpers ─────────────────────────────────────────────────

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    {children}
  </svg>
);

const MenuIcon = () => (
  <Icon>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </Icon>
);
const PrevIcon = () => (
  <Icon>
    <polyline points="15 18 9 12 15 6" />
  </Icon>
);
const NextIcon = () => (
  <Icon>
    <polyline points="9 18 15 12 9 6" />
  </Icon>
);
const BookmarkIcon = () => (
  <Icon>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Icon>
);
const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);
const CloseIcon = () => (
  <Icon>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);
const ScrollIcon = () => (
  <Icon>
    <line x1="12" y1="3" x2="12" y2="21" />
    <polyline points="8 7 12 3 16 7" />
    <polyline points="8 17 12 21 16 17" />
  </Icon>
);
const PaginateIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </Icon>
);

// ── TOC item types ───────────────────────────────────────────────────

interface TocItem {
  title: string;
  href: string;
  children?: TocItem[];
}

// ── Recursive TOC rendering (matches Angular ng-template recursion) ──

function TocEntry({
  item,
  depth,
  onGo,
}: {
  item: TocItem;
  depth: number;
  onGo: (item: TocItem) => void;
}) {
  return (
    <>
      <li>
        <button
          type="button"
          style={{
            ...styles.tocItemLink,
            paddingLeft: 16 + depth * 16,
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            textAlign: "left" as const,
            width: "100%",
          }}
          onClick={() => onGo(item)}
        >
          {item.title}
        </button>
      </li>
      {item.children?.map((child, i) => (
        <TocEntry key={i} item={child} depth={depth + 1} onGo={onGo} />
      ))}
    </>
  );
}

// ── Main App ─────────────────────────────────────────────────────────

function App() {
  const [reader, setReader] = useState<D2Reader | null>(null);

  // Page info — mirrors Angular component properties
  const [chapterTitle, setChapterTitle] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  // UI state
  const [isScrolling, setIsScrolling] = useState(false);
  const [isAtStart, setIsAtStart] = useState(true);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Settings
  const [fontSizeLabel, setFontSizeLabel] = useState("100%");
  const [appearance, setAppearanceState] = useState("day");

  // TOC
  const [toc, setToc] = useState<TocItem[]>([]);

  const readerRef = useRef<D2Reader | null>(null);

  // ── Helpers (mirror Angular private methods) ─────────────────────

  const updateFontSizeLabel = useCallback((r: D2Reader) => {
    const fontSize = r.currentSettings?.fontSize;
    setFontSizeLabel(fontSize != null ? `${fontSize}%` : "100%");
  }, []);

  const updatePageInfo = useCallback(
    (r: D2Reader) => {
      const locator = r.currentLocator;
      if (locator) {
        setChapterTitle(locator.title ?? "");
        setCurrentPage(locator.displayInfo?.resourceScreenIndex ?? 0);
        setTotalPages(locator.displayInfo?.resourceScreenCount ?? 0);
        const progression = locator.locations?.totalProgression ?? 0;
        setProgressPercent(Math.round(progression * 100));
      }

      setIsScrolling(r.currentSettings?.verticalScroll ?? false);
      setIsAtStart(r.atStart);
      setIsAtEnd(r.atEnd);

      updateFontSizeLabel(r);
    },
    [updateFontSizeLabel]
  );

  // ── Initialise D2Reader (mirrors ngOnInit) ───────────────────────

  useEffect(() => {
    const url = new URL("https://alice.dita.digital/manifest.json");

    D2Reader.load({
      url,
      injectables,
      injectablesFixed: [],
      rights: {
        enableBookmarks: true,
        enableAnnotations: true,
        enableSearch: true,
        autoGeneratePositions: true,
      },
      api: {
        updateCurrentLocation: async () => {},
        updateSettings: async (settings) => {
          const appearance = settings?.appearance;
          if (typeof appearance === "string") setAppearanceState(appearance);
        },
      },
    }).then((r) => {
      readerRef.current = r;
      setReader(r);
      setToc(r.tableOfContents);
      updatePageInfo(r);

      // Sync appearance from persisted settings
      const savedAppearance = r.currentSettings?.appearance;
      if (savedAppearance) setAppearanceState(savedAppearance);

      r.addEventListener("resource.ready", () => {
        updatePageInfo(r);
      });
    });

    return () => {
      if (readerRef.current) {
        readerRef.current.stop();
        readerRef.current = null;
      }
    };
  }, [updatePageInfo]);

  // ── Navigation (mirrors Angular methods) ─────────────────────────

  const previousPage = async () => {
    await reader?.previousPage();
    if (reader) updatePageInfo(reader);
  };

  const nextPage = async () => {
    await reader?.nextPage();
    if (reader) updatePageInfo(reader);
  };

  const toggleScrollMode = async () => {
    if (!reader) return;
    const next = !isScrolling;
    await reader.scroll(next);
    setIsScrolling(next);
  };

  const saveBookmark = async () => {
    if (!reader) return;
    const saved = await reader.saveBookmark();
    if (saved) console.log("Bookmark saved");
  };

  const goToTocItem = async (item: TocItem) => {
    if (!reader) return;
    await reader.goTo({ href: item.href } as any);
    setTocOpen(false);
    updatePageInfo(reader);
  };

  const increaseFontSize = async () => {
    await reader?.increase("fontSize");
    if (reader) updateFontSizeLabel(reader);
  };

  const decreaseFontSize = async () => {
    await reader?.decrease("fontSize");
    if (reader) updateFontSizeLabel(reader);
  };

  const setAppearance = async (value: string) => {
    if (!reader) return;
    await reader.applyUserSettings({ appearance: value } as any);
    setAppearanceState(value);
  };

  const resetSettings = async () => {
    await reader?.resetUserSettings();
    setAppearanceState("day");
    if (reader) updateFontSizeLabel(reader);
  };

  const toggleToc = () => {
    setTocOpen((prev) => {
      if (!prev) setSettingsOpen(false);
      return !prev;
    });
  };

  const toggleSettings = () => {
    setSettingsOpen((prev) => {
      if (!prev) setTocOpen(false);
      return !prev;
    });
  };

  // ── Theme colors ─────────────────────────────────────────────────
  const themes = {
    day: { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
    sepia: { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
    night: { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
    "readium-default-on": { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
    "readium-sepia-on": { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
    "readium-night-on": { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
  };
  const theme = themes[appearance] || themes.day;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div style={{ background: theme.bg, color: theme.fg, minHeight: "100vh" }}>
      {/* Toolbar */}
      {reader && (
        <div
          style={{
            ...styles.toolbar,
            background: theme.bg,
            color: theme.fg,
            borderBottomColor: theme.border,
          }}
        >
          <div style={styles.toolbarGroup}>
            <button
              style={styles.btn}
              onClick={toggleToc}
              title="Table of Contents"
            >
              <MenuIcon />
            </button>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: "2px 8px",
                borderRadius: 10,
                color: "#fff",
                background: "#dd0031",
                flexShrink: 0,
              }}
            >
              Angular
            </span>
            <button
              style={{ ...styles.btn, opacity: isAtStart ? 0.35 : 1 }}
              onClick={previousPage}
              disabled={isAtStart}
              title="Previous Page"
            >
              <PrevIcon />
            </button>
            <button
              style={{ ...styles.btn, opacity: isAtEnd ? 0.35 : 1 }}
              onClick={nextPage}
              disabled={isAtEnd}
              title="Next Page"
            >
              <NextIcon />
            </button>
          </div>

          <div style={styles.toolbarInfo}>
            <span style={styles.chapterTitle}>{chapterTitle}</span>
            {totalPages > 0 && (
              <span style={styles.pageInfo}>
                Page {currentPage} of {totalPages} ({progressPercent}%)
              </span>
            )}
          </div>

          <div style={styles.toolbarGroup}>
            <button
              style={styles.btn}
              onClick={toggleScrollMode}
              title={isScrolling ? "Switch to paginated" : "Switch to scroll"}
            >
              {isScrolling ? <ScrollIcon /> : <PaginateIcon />}
            </button>
            <button
              style={styles.btn}
              onClick={saveBookmark}
              title="Bookmark this page"
            >
              <BookmarkIcon />
            </button>
            <button
              style={styles.btn}
              onClick={toggleSettings}
              title="Settings"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {reader && (
        <div style={styles.progressBar}>
          <div
            style={{
              height: "100%",
              background: ACCENT,
              transition: "width 0.3s ease",
              width: `${progressPercent}%`,
            }}
          />
        </div>
      )}

      {/* TOC overlay */}
      {tocOpen && <div style={styles.overlay} onClick={toggleToc} />}

      {/* TOC sidebar */}
      <div
        style={{
          ...styles.tocSidebar,
          background: theme.bg,
          color: theme.fg,
          left: tocOpen ? 0 : -SIDEBAR_W,
        }}
      >
        <div style={styles.tocHeader}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "inherit",
            }}
          >
            Table of Contents
          </h3>
          <button style={{ ...styles.btn, padding: 4 }} onClick={toggleToc}>
            <CloseIcon />
          </button>
        </div>
        <ul style={styles.tocList}>
          {toc.map((item, i) => (
            <TocEntry key={i} item={item} depth={0} onGo={goToTocItem} />
          ))}
        </ul>
      </div>

      {/* Settings overlay */}
      {settingsOpen && <div style={styles.overlay} onClick={toggleSettings} />}

      {/* Settings panel */}
      <div
        style={{
          ...styles.settingsPanel,
          background: theme.bg,
          color: theme.fg,
          right: settingsOpen ? 0 : -SETTINGS_W,
        }}
      >
        <div style={styles.tocHeader}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "inherit",
            }}
          >
            Settings
          </h3>
          <button
            style={{ ...styles.btn, padding: 4 }}
            onClick={toggleSettings}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Font Size */}
        <div style={styles.settingsSection}>
          <label style={styles.settingsLabel}>Font Size</label>
          <div style={styles.settingsRow}>
            <button style={styles.btnSetting} onClick={decreaseFontSize}>
              A-
            </button>
            <span style={styles.settingValue}>{fontSizeLabel}</span>
            <button style={styles.btnSetting} onClick={increaseFontSize}>
              A+
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div style={styles.settingsSection}>
          <label style={styles.settingsLabel}>Appearance</label>
          <div style={{ ...styles.settingsRow, gap: 12 }}>
            {[
              {
                value: "day",
                label: "Light",
                bg: "#fff",
                fg: "#333",
                border: "1px solid rgba(128,128,128,0.3)",
              },
              {
                value: "sepia",
                label: "Sepia",
                bg: "#f5e6c8",
                fg: "#5b4636",
                border: "none",
              },
              {
                value: "night",
                label: "Dark",
                bg: "#1e1e1e",
                fg: "#e0e0e0",
                border: "none",
              },
            ].map((a) => (
              <button
                key={a.value}
                style={{
                  ...styles.btnAppearance,
                  borderColor:
                    appearance === a.value ? ACCENT : "rgba(128,128,128,0.2)",
                  color: appearance === a.value ? ACCENT : "inherit",
                }}
                onClick={() => setAppearance(a.value)}
              >
                <span
                  style={{
                    ...styles.appearancePreview,
                    background: a.bg,
                    color: a.fg,
                    border: a.border,
                  }}
                >
                  Aa
                </span>
                <span style={{ opacity: 0.7 }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        <div style={styles.settingsSection}>
          <button style={styles.btnReset} onClick={resetSettings}>
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Reader container (required DOM structure) */}
      <div
        id="D2Reader-Container"
        style={{
          position: "absolute",
          top: TOOLBAR_H + 2,
          left: 0,
          right: 0,
          bottom: 0,
          background: theme.bg,
        }}
      >
        <main
          id="iframe-wrapper"
          tabIndex={-1}
          style={{ height: "100%", outline: "none" }}
        >
          {!reader && (
            <div style={styles.loading}>
              <p style={{ fontSize: 14, margin: 0 }}>Loading reader...</p>
            </div>
          )}
          <div id="reader-loading" className="loading" />
          <div id="reader-error" className="error" />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
