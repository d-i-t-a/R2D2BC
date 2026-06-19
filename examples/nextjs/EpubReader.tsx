import React, { useState, useEffect, useCallback } from "react";
import D2Reader from "../../src";
import readiumBefore from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-before.css";
import readiumAfter from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-after.css";
import readiumDefault from "url:../../node_modules/@readium/css/css/dist/ReadiumCSS-default.css";
import readiumDitaPatch from "url:../../viewer/readium-css-v2/ReadiumCSS-dita-patch.css";
import cjkBefore from "url:../../node_modules/@readium/css/css/dist/cjk-horizontal/ReadiumCSS-before.css";
import cjkAfter from "url:../../node_modules/@readium/css/css/dist/cjk-horizontal/ReadiumCSS-after.css";
import cjkDefault from "url:../../node_modules/@readium/css/css/dist/cjk-horizontal/ReadiumCSS-default.css";

const CJK_LANG_RE = /^(ja|zh|ko)(\b|-)/i;
const isCJK = (pub: any) => {
  const langs = pub?.metadata?.languages;
  return (
    Array.isArray(langs) && langs.some((l: string) => CJK_LANG_RE.test(l ?? ""))
  );
};

const injectables = [
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
  { type: "style", url: readiumDitaPatch },
];

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const TOOLBAR_H = 42;
const SIDEBAR_W = 280;

// ── Styles ───────────────────────────────────────────────────────────

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
  },
  badge: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    padding: "2px 8px",
    borderRadius: 10,
    color: "#fff",
    background: "#000",
    flexShrink: 0,
  },
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
  },
  btnActive: { background: "rgba(128,128,128,0.2)", fontWeight: 600 },
  sep: {
    width: 1,
    height: 18,
    background: "currentColor",
    opacity: 0.2,
    flexShrink: 0,
  },
  sidebar: {
    position: "fixed",
    top: TOOLBAR_H,
    bottom: 0,
    width: SIDEBAR_W,
    overflowY: "auto",
    padding: "10px 0",
    fontFamily: FONT,
    fontSize: 12,
    zIndex: 9,
    transition: "transform .2s ease, background .2s, color .2s",
    borderRight: "1px solid",
  },
  sidebarHidden: { transform: "translateX(-" + SIDEBAR_W + "px)" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.15)",
    zIndex: 8,
  },
  tocItem: {
    padding: "6px 14px",
    cursor: "pointer",
    borderBottom: "1px solid rgba(128,128,128,0.1)",
    lineHeight: 1.4,
  },
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    padding: "5px 12px",
  },
  label: { fontSize: 11, opacity: 0.7, flexShrink: 0 },
  select: {
    padding: "4px 6px",
    fontSize: 11,
    border: "1px solid rgba(128,128,128,0.3)",
    borderRadius: 6,
    background: "inherit",
    color: "inherit",
  },
  slider: { width: 70, accentColor: "#4a90d9" },
} as const;

const themes = {
  day: { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
  sepia: { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
  night: { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
  "readium-default-on": { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
  "readium-sepia-on": { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
  "readium-night-on": { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
};

// ── App ──────────────────────────────────────────────────────────────

export default function EpubReader() {
  const [reader, setReader] = useState<D2Reader | null>(null);
  const [, setTick] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("toc");
  const [pageInfo, setPageInfo] = useState<{
    chapterTitle?: string;
    pageIndex?: number;
    pageCount?: number;
    totalProgression?: number;
  }>({});
  const [appearance, setAppearanceState] = useState("day");
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const updatePageInfo = useCallback((r) => {
    try {
      const locator = r.currentLocator;
      if (locator) {
        setPageInfo({
          chapterTitle: locator.title,
          pageIndex: locator.displayInfo?.resourceScreenIndex,
          pageCount: locator.displayInfo?.resourceScreenCount,
          totalProgression: locator.locations?.totalProgression,
        });
      }
      const a = r.currentSettings?.appearance;
      if (a) setAppearanceState(a);
    } catch (_) {}
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
        autoGeneratePositions: true,
      },
    }).then((r) => {
      setReader(r);
      r.addEventListener("resource.ready", () => updatePageInfo(r));
      r.addEventListener("click", () =>
        setTimeout(() => updatePageInfo(r), 100)
      );
      // Sync persisted appearance
      const a = r.currentSettings?.appearance;
      if (a) setAppearanceState(a);
      setTimeout(() => updatePageInfo(r), 500);
    });
  }, [updatePageInfo]);

  useEffect(() => {
    if (!reader) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") {
        reader.nextPage();
        setTimeout(() => updatePageInfo(reader), 150);
      }
      if (e.key === "ArrowLeft") {
        reader.previousPage();
        setTimeout(() => updatePageInfo(reader), 150);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reader, updatePageInfo]);

  const theme = themes[appearance] || themes.day;
  const isScrolling = reader?.currentSettings?.verticalScroll ?? false;
  const toc = reader?.tableOfContents || [];
  const bookmarks = reader?.bookmarks || [];

  const apply = (settings) => {
    reader?.applyUserSettings(settings);
    refresh();
  };

  return (
    <div style={{ background: theme.bg, color: theme.fg, minHeight: "100vh" }}>
      {reader && (
        <>
          {/* Toolbar */}
          <div
            style={{
              ...css.toolbar,
              background: theme.bg,
              color: theme.fg,
              borderColor: theme.border,
            }}
          >
            <button
              style={css.btn}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "\u2715" : "\u2630"}
            </button>
            <span style={css.badge}>Next.js</span>
            <div style={css.sep} />
            <button
              style={css.btn}
              onClick={() => {
                reader.previousPage();
                setTimeout(() => updatePageInfo(reader), 150);
              }}
            >
              &larr;
            </button>
            <button
              style={css.btn}
              onClick={() => {
                reader.nextPage();
                setTimeout(() => updatePageInfo(reader), 150);
              }}
            >
              &rarr;
            </button>
            <div style={css.sep} />
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
            <span
              style={{
                fontSize: 11,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {pageInfo.chapterTitle && (
                <span style={{ opacity: 0.7, marginRight: 6 }}>
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
                <span style={{ opacity: 0.7, marginLeft: 6 }}>
                  {Math.round(pageInfo.totalProgression * 100)}%
                </span>
              )}
            </span>
            <div style={{ flex: 1 }} />
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
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid " + theme.border,
              }}
            >
              {["toc", "settings", "bookmarks"].map((t) => (
                <button
                  key={t}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    border: "none",
                    cursor: "pointer",
                    color: "inherit",
                    background:
                      activeTab === t
                        ? "rgba(128,128,128,0.15)"
                        : "transparent",
                    fontWeight: activeTab === t ? 600 : 400,
                  }}
                  onClick={() => setActiveTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* TOC */}
            {activeTab === "toc" && (
              <div>
                {toc.length === 0 && (
                  <div style={{ padding: 14, opacity: 0.5 }}>
                    No table of contents
                  </div>
                )}
                {toc.map((item, i) => (
                  <div
                    key={i}
                    style={css.tocItem}
                    onClick={() => {
                      reader.goTo({
                        href: item.href,
                        locations: {},
                        title: item.title,
                      });
                      setSidebarOpen(false);
                    }}
                  >
                    {item.title || item.href}
                  </div>
                ))}
              </div>
            )}

            {/* Settings */}
            {activeTab === "settings" && (
              <div style={{ padding: "8px 0" }}>
                <div style={css.settingRow}>
                  <span style={css.label}>Font Size</span>
                  <input
                    type="range"
                    min={100}
                    max={300}
                    step={25}
                    defaultValue={reader.currentSettings?.fontSize || 100}
                    style={css.slider}
                    onChange={(e) =>
                      apply({ fontSize: Number(e.target.value) })
                    }
                  />
                </div>
                <div style={css.settingRow}>
                  <span style={css.label}>Font</span>
                  <select
                    style={css.select}
                    defaultValue={reader.currentSettings?.fontFamily}
                    onChange={(e) => apply({ fontFamily: e.target.value })}
                  >
                    <option value="Original">Publisher</option>
                    <option value="serif">Serif</option>
                    <option value="sans-serif">Sans-serif</option>
                  </select>
                </div>
                <div style={css.settingRow}>
                  <span style={css.label}>Theme</span>
                  <div style={{ display: "flex", gap: 0 }}>
                    {[
                      { key: "day", label: "Day", bg: "#fff", fg: "#000" },
                      {
                        key: "sepia",
                        label: "Sepia",
                        bg: "#f5e6c8",
                        fg: "#000",
                      },
                      {
                        key: "night",
                        label: "Night",
                        bg: "#121212",
                        fg: "#fff",
                      },
                    ].map((m, i) => (
                      <button
                        key={m.key}
                        style={{
                          ...css.btn,
                          minWidth: 50,
                          background: m.bg,
                          color: m.fg,
                          border: "1px solid " + theme.border,
                          borderRadius:
                            i === 0
                              ? "14px 0 0 14px"
                              : i === 2
                                ? "0 14px 14px 0"
                                : 0,
                        }}
                        onClick={() => {
                          apply({ appearance: m.key });
                          setAppearanceState(m.key);
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    ...css.settingRow,
                    justifyContent: "center",
                    paddingTop: 12,
                  }}
                >
                  <button
                    style={css.btn}
                    onClick={() => {
                      reader.resetUserSettings();
                      setAppearanceState("day");
                      refresh();
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}

            {/* Bookmarks */}
            {activeTab === "bookmarks" && (
              <div>
                <div
                  style={{
                    padding: "8px 14px",
                    borderBottom: "1px solid " + theme.border,
                  }}
                >
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
                  <div style={{ padding: 14, opacity: 0.5 }}>
                    No bookmarks yet
                  </div>
                )}
                {bookmarks.map((bm, i) => (
                  <div
                    key={bm.id || i}
                    style={{
                      ...css.tocItem,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
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
                      style={{
                        fontSize: 10,
                        color: "#c00",
                        cursor: "pointer",
                        border: "none",
                        background: "none",
                      }}
                      onClick={() => {
                        reader.deleteBookmark(bm);
                        refresh();
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {sidebarOpen && (
            <div style={css.overlay} onClick={() => setSidebarOpen(false)} />
          )}
        </>
      )}

      {/* Reader container — ALWAYS rendered, never conditional */}
      <div
        id="D2Reader-Container"
        style={{ paddingTop: reader ? TOOLBAR_H : 0 }}
      >
        <main
          tabIndex={-1}
          id="iframe-wrapper"
          style={{
            height: reader ? "calc(100vh - " + TOOLBAR_H + "px)" : "100vh",
          }}
        >
          {!reader && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                fontFamily: FONT,
                opacity: 0.5,
              }}
            >
              Loading reader…
            </div>
          )}
          <div id="reader-loading" className="dita-loading" />
          <div id="reader-error" className="dita-error" />
        </main>
      </div>
    </div>
  );
}
