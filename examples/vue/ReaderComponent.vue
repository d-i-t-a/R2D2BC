<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import D2Reader from "../../src";

// ── Configuration ────────────────────────────────────────────────────

const MANIFEST_URL = "https://alice.dita.digital/manifest.json";

const props = defineProps({
  injectables: { type: Array, required: true },
});

const rights = {
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
};

// ── State ────────────────────────────────────────────────────────────

const reader = ref(null);
const sidebarOpen = ref(false);
const activeTab = ref("toc");
const tick = ref(0);

const pageInfo = ref({});

// Settings panel values (reactive mirrors)
const fontSize = ref(100);
const fontFamily = ref("Original");
const lineHeight = ref(1.5);
const pageMargins = ref(2);
const wordSpacing = ref(0);
const letterSpacing = ref(0);
const paraSpacing = ref(0);
const paraIndent = ref(1);
const textAlignment = ref("auto");
const columnCount = ref("auto");

// Search
const searchTerm = ref("");
const searchResults = ref([]);
const searched = ref(false);

// ── Helpers ──────────────────────────────────────────────────────────

function refresh() {
  tick.value++;
  syncSettings();
}

function syncSettings() {
  if (!reader.value) return;
  const s = reader.value.currentSettings;
  fontSize.value = s.fontSize ?? 100;
  fontFamily.value = s.fontFamily ?? "Original";
  lineHeight.value = s.lineHeight ?? 1.5;
  pageMargins.value = s.pageMargins ?? 2;
  wordSpacing.value = s.wordSpacing ?? 0;
  letterSpacing.value = s.letterSpacing ?? 0;
  paraSpacing.value = s.paraSpacing ?? 0;
  paraIndent.value = s.paraIndent ?? 1;
  textAlignment.value = s.textAlignment ?? "auto";
  columnCount.value = s.columnCount ?? "auto";
}

function updatePageInfo() {
  if (!reader.value) return;
  try {
    const loc = reader.value.currentLocator;
    if (loc) {
      pageInfo.value = {
        chapterTitle: loc.title,
        pageIndex: loc.displayInfo?.resourceScreenIndex,
        pageCount: loc.displayInfo?.resourceScreenCount,
        progression: loc.locations?.progression,
        totalProgression: loc.locations?.totalProgression,
      };
    }
    const a = reader.value.currentSettings?.appearance;
    if (a) appearance.value = a;
  } catch (_) {
    /* locator may not be ready */
  }
}

// ── Theme ───────────────────────────────────────────────────────────

const appearance = ref("day");
const themeMap = {
  day: { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
  sepia: { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
  night: { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
  "readium-default-on": { bg: "#FFFFFF", fg: "#121212", border: "#e0e0e0" },
  "readium-sepia-on": { bg: "#faf4e8", fg: "#121212", border: "#e0d0b0" },
  "readium-night-on": { bg: "#000000", fg: "#FEFEFE", border: "#333333" },
};
const theme = computed(() => themeMap[appearance.value] || themeMap.day);

// ── Computed ─────────────────────────────────────────────────────────

const isScrolling = computed(() => { tick.value; return reader.value?.currentSettings?.verticalScroll ?? false; });

const toc = computed(() => { tick.value; return reader.value?.tableOfContents || []; });

const bookmarks = computed(() => {
  // tick dependency for reactivity on bookmark changes
  void tick.value;
  return reader.value?.bookmarks || [];
});

// ── Reader actions ───────────────────────────────────────────────────

function prevPage() {
  reader.value?.previousPage();
  setTimeout(updatePageInfo, 150);
}

function nextPage() {
  reader.value?.nextPage();
  setTimeout(updatePageInfo, 150);
}

function setScroll(scroll) {
  reader.value?.scroll(scroll);
  refresh();
}

function saveBookmark() {
  reader.value?.saveBookmark();
  refresh();
}

function deleteBookmark(bm) {
  reader.value?.deleteBookmark(bm);
  refresh();
}

function goTo(locator) {
  reader.value?.goTo(locator);
  sidebarOpen.value = false;
  setTimeout(updatePageInfo, 150);
}

function goToTocItem(item) {
  reader.value?.goTo({ href: item.href, locations: {}, title: item.title });
  sidebarOpen.value = false;
  setTimeout(updatePageInfo, 150);
}

function applySetting(settings) {
  reader.value?.applyUserSettings(settings);
  refresh();
}

function resetSettings() {
  reader.value?.resetUserSettings();
  refresh();
}

function setAppearance(mode) {
  applySetting({ appearance: mode });
}

// ── Search ───────────────────────────────────────────────────────────

async function doSearch() {
  if (!searchTerm.value.trim() || !reader.value) return;
  const res = await reader.value.search(searchTerm.value.trim(), false);
  searchResults.value = res || [];
  searched.value = true;
}

async function clearSearch() {
  if (reader.value) await reader.value.clearSearch();
  searchResults.value = [];
  searched.value = false;
  searchTerm.value = "";
}

function goToSearchResult(r) {
  reader.value?.goToSearchID(r.href, r.uuid, false);
  sidebarOpen.value = false;
}

// ── Keyboard ─────────────────────────────────────────────────────────

function onKeydown(e) {
  if (!reader.value) return;
  if (e.key === "ArrowRight") {
    reader.value.nextPage();
    setTimeout(updatePageInfo, 100);
  }
  if (e.key === "ArrowLeft") {
    reader.value.previousPage();
    setTimeout(updatePageInfo, 100);
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────

onMounted(async () => {
  const r = await D2Reader.load({
    url: new URL(MANIFEST_URL),
    injectables: props.injectables,
    injectablesFixed: [],
    rights,
    api: {
      updateCurrentLocation: async () => {},
      updateSettings: async (settings) => {
        if (settings?.appearance) appearance.value = settings.appearance;
      },
    },
  });

  reader.value = r;
  syncSettings();

  r.addEventListener("resource.ready", () => updatePageInfo());
  r.addEventListener("click", () => setTimeout(updatePageInfo, 100));
  setTimeout(updatePageInfo, 500);

  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  reader.value?.stop();
});
</script>

<template>
  <!-- Toolbar -->
  <div v-if="reader" class="toolbar" :style="{ background: theme.bg, color: theme.fg, borderColor: theme.border }">
    <button class="btn" @click="sidebarOpen = !sidebarOpen">
      {{ sidebarOpen ? "\u2715" : "\u2630" }}
    </button>

    <span class="badge">Vue</span>
    <div class="sep" />

    <button class="btn" @click="prevPage">&larr;</button>
    <button class="btn" @click="nextPage">&rarr;</button>

    <div class="sep" />

    <button class="btn" :class="{ active: isScrolling }" @click="setScroll(true)">
      Scroll
    </button>
    <button class="btn" :class="{ active: !isScrolling }" @click="setScroll(false)">
      Pages
    </button>

    <div class="sep" />

    <span class="page-info">
      <span v-if="pageInfo.chapterTitle" class="chapter-title">
        {{ pageInfo.chapterTitle }}
      </span>
      <span v-if="pageInfo.pageIndex != null && pageInfo.pageCount != null && !isScrolling">
        Page {{ pageInfo.pageIndex }} of {{ pageInfo.pageCount }}
      </span>
      <span v-if="pageInfo.totalProgression != null" class="progression">
        {{ Math.round(pageInfo.totalProgression * 100) }}%
      </span>
    </span>

    <div class="spacer" />

    <button class="btn" @click="saveBookmark">Bookmark</button>
  </div>

  <!-- Sidebar overlay -->
  <div v-if="sidebarOpen" class="overlay" @click="sidebarOpen = false" />

  <!-- Sidebar -->
  <div v-if="reader" class="sidebar" :class="{ hidden: !sidebarOpen }" :style="{ background: theme.bg, color: theme.fg, borderColor: theme.border }">
    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        v-for="tab in ['toc', 'settings', 'bookmarks', 'search']"
        :key="tab"
        class="tab-btn"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </div>

    <!-- TOC panel -->
    <div v-if="activeTab === 'toc'">
      <div v-if="toc.length === 0" class="empty">No table of contents</div>
      <div
        v-for="(item, i) in toc"
        :key="i"
        class="toc-item"
        @click="goToTocItem(item)"
      >
        {{ item.title || item.href }}
      </div>
    </div>

    <!-- Settings panel -->
    <div v-if="activeTab === 'settings'" class="settings-panel">
      <div class="setting-row">
        <span class="label">Font Size</span>
        <input
          type="range"
          class="slider"
          :min="100"
          :max="300"
          :step="25"
          :value="fontSize"
          @input="applySetting({ fontSize: Number($event.target.value) })"
        />
        <span class="value">{{ fontSize }}%</span>
      </div>

      <div class="setting-row">
        <span class="label">Font</span>
        <select
          class="select"
          :value="fontFamily"
          @change="applySetting({ fontFamily: $event.target.value })"
        >
          <option value="Original">Publisher</option>
          <option value="serif">Serif</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="opendyslexic">Open Dyslexic</option>
        </select>
      </div>

      <div class="setting-row">
        <span class="label">Theme</span>
        <div class="btn-group">
          <button
            v-for="(mode, i) in ['day', 'sepia', 'night']"
            :key="mode"
            class="btn theme-btn"
            :class="[
              mode,
              { first: i === 0, last: i === 2 },
            ]"
            @click="setAppearance(mode)"
          >
            {{ mode }}
          </button>
        </div>
      </div>

      <div class="setting-row">
        <span class="label">Layout</span>
        <div class="btn-group">
          <button
            class="btn first"
            :class="{ active: isScrolling }"
            @click="setScroll(true)"
          >
            Scroll
          </button>
          <button
            class="btn last"
            :class="{ active: !isScrolling }"
            @click="setScroll(false)"
          >
            Pages
          </button>
        </div>
      </div>

      <div class="setting-row">
        <span class="label">Line Height</span>
        <input
          type="range"
          class="slider"
          :min="1"
          :max="2"
          :step="0.25"
          :value="lineHeight"
          @input="applySetting({ lineHeight: Number($event.target.value) })"
        />
      </div>

      <div class="setting-row">
        <span class="label">Margins</span>
        <input
          type="range"
          class="slider"
          :min="0.5"
          :max="4"
          :step="0.25"
          :value="pageMargins"
          @input="applySetting({ pageMargins: Number($event.target.value) })"
        />
      </div>

      <div class="setting-row">
        <span class="label">Word Spacing</span>
        <input
          type="range"
          class="slider"
          :min="0"
          :max="1"
          :step="0.25"
          :value="wordSpacing"
          @input="applySetting({ wordSpacing: Number($event.target.value) })"
        />
      </div>

      <div class="setting-row">
        <span class="label">Letter Spacing</span>
        <input
          type="range"
          class="slider"
          :min="0"
          :max="0.5"
          :step="0.0625"
          :value="letterSpacing"
          @input="applySetting({ letterSpacing: Number($event.target.value) })"
        />
      </div>

      <div class="setting-row">
        <span class="label">Paragraph Spacing</span>
        <input
          type="range"
          class="slider"
          :min="0"
          :max="3"
          :step="0.5"
          :value="paraSpacing"
          @input="applySetting({ paraSpacing: Number($event.target.value) })"
        />
      </div>

      <div class="setting-row">
        <span class="label">Paragraph Indent</span>
        <input
          type="range"
          class="slider"
          :min="0"
          :max="3"
          :step="0.5"
          :value="paraIndent"
          @input="applySetting({ paraIndent: Number($event.target.value) })"
        />
      </div>

      <div class="setting-row">
        <span class="label">Align</span>
        <select
          class="select"
          :value="textAlignment"
          @change="applySetting({ textAlignment: $event.target.value })"
        >
          <option value="auto">Auto</option>
          <option value="justify">Justify</option>
          <option value="start">Start</option>
        </select>
      </div>

      <div class="setting-row">
        <span class="label">Columns</span>
        <select
          class="select"
          :value="columnCount"
          @change="applySetting({ columnCount: $event.target.value })"
        >
          <option value="auto">Auto</option>
          <option value="1">Single</option>
          <option value="2">Double</option>
        </select>
      </div>

      <button class="btn reset-btn" @click="resetSettings">Reset</button>
    </div>

    <!-- Bookmarks panel -->
    <div v-if="activeTab === 'bookmarks'">
      <div class="bookmark-add">
        <button class="btn full-width" @click="saveBookmark">+ Add Bookmark</button>
      </div>
      <div v-if="bookmarks.length === 0" class="empty">No bookmarks yet</div>
      <div
        v-for="(bm, i) in bookmarks"
        :key="bm.id || i"
        class="bookmark-item"
      >
        <span class="bookmark-label" @click="goTo(bm)">
          {{ bm.href?.split('/').pop() || bm.href }}
          <span v-if="bm.locations?.progression != null" class="progression">
            ({{ Math.round(bm.locations.progression * 100) }}%)
          </span>
        </span>
        <button class="delete-btn" @click="deleteBookmark(bm)">&times;</button>
      </div>
    </div>

    <!-- Search panel -->
    <div v-if="activeTab === 'search'">
      <div class="search-bar">
        <input
          v-model="searchTerm"
          type="text"
          class="search-input"
          placeholder="Search..."
          @keydown.enter="doSearch"
        />
        <button class="btn" @click="doSearch">Go</button>
        <button v-if="searched" class="btn" @click="clearSearch">&times;</button>
      </div>
      <div v-if="searched && searchResults.length === 0" class="empty">No results found</div>
      <div
        v-for="(r, i) in searchResults"
        :key="r.uuid ?? i"
        class="toc-item search-result"
        @click="goToSearchResult(r)"
      >
        <span class="muted">&hellip;{{ r.textBefore }}</span>
        <mark>{{ r.textMatch }}</mark>
        <span class="muted">{{ r.textAfter }}&hellip;</span>
      </div>
    </div>
  </div>

  <!-- Loading screen (before reader is ready) -->
  <div v-if="!reader" class="loading-screen">Loading reader&hellip;</div>

  <!-- Reader container (required DOM structure) -->
  <div id="D2Reader-Container" :style="{ paddingTop: reader ? '42px' : '0', background: theme.bg }">
    <main
      id="iframe-wrapper"
      tabindex="-1"
      :style="{ height: reader ? 'calc(100vh - 42px)' : '100vh' }"
    >
      <div id="reader-loading" class="dita-loading" />
      <div id="reader-error" class="dita-error" />
    </main>
  </div>
</template>

<style scoped>
/* ── Badge ──────────────────────────────────────────────────── */
.badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
  padding: 2px 8px; border-radius: 10px; color: #fff; background: #42b883; flex-shrink: 0;
}

/* ── Layout ─────────────────────────────────────────────────── */

.toolbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 42px;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
}

.spacer {
  flex: 1;
}

.sep {
  width: 1px;
  height: 18px;
  background: rgba(128,128,128,0.2);
  flex-shrink: 0;
}

/* ── Buttons ────────────────────────────────────────────────── */

.btn {
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid #d0d0d0;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  color: inherit;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.btn:hover {
  background: rgba(128,128,128,0.1);
}

.btn.active {
  background: rgba(128,128,128,0.2);
  font-weight: 600;
}

.btn-group {
  display: flex;
  gap: 0;
}

.btn-group .btn {
  border-radius: 0;
  min-width: 60px;
}

.btn.first {
  border-radius: 14px 0 0 14px;
}

.btn.last {
  border-radius: 0 14px 14px 0;
}

.theme-btn.day {
  background: transparent;
  color: inherit;
}

.theme-btn.sepia {
  background: #f5e6c8;
  color: inherit;
}

.theme-btn.night {
  background: #121212;
  color: #fff;
}

.full-width {
  width: 100%;
}

.reset-btn {
  margin-top: 8px;
  align-self: center;
}

.delete-btn {
  font-size: 10px;
  color: #c00;
  cursor: pointer;
  border: none;
  background: none;
  padding: 2px 6px;
}

/* ── Page info ──────────────────────────────────────────────── */

.page-info {
  font-size: 11px;
  color: inherit; opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-title {
  color: inherit; opacity: 0.5;
  margin-right: 6px;
}

.progression {
  color: inherit; opacity: 0.5;
  margin-left: 6px;
}

/* ── Sidebar ────────────────────────────────────────────────── */

.sidebar {
  position: fixed;
  top: 42px;
  bottom: 0;
  left: 0;
  width: 280px;
  background: inherit;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  z-index: 9;
  transition: transform 0.2s ease;
}

.sidebar.hidden {
  transform: translateX(-280px);
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 8;
}

/* ── Tab bar ────────────────────────────────────────────────── */

.tab-bar {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
}

.tab-btn {
  flex: 1;
  padding: 8px 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: none;
  cursor: pointer;
  background: transparent;
  font-weight: 400;
  color: inherit;
}

.tab-btn.active {
  background: rgba(128,128,128,0.15);
  font-weight: 600;
}

/* ── TOC ────────────────────────────────────────────────────── */

.toc-item {
  padding: 6px 14px;
  cursor: pointer;
  color: inherit;
  border-bottom: 1px solid #f0f0f0;
  line-height: 1.4;
}

.toc-item:hover {
  background: rgba(128,128,128,0.15);
}

.search-result {
  font-size: 11px;
}

.muted {
  color: inherit; opacity: 0.5;
}

.empty {
  padding: 14px;
  color: inherit; opacity: 0.5;
}

/* ── Settings ───────────────────────────────────────────────── */

.settings-panel {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: inherit; opacity: 0.7;
  flex-shrink: 0;
}

.value {
  font-size: 10px;
  color: inherit; opacity: 0.5;
  min-width: 28px;
  text-align: right;
}

.slider {
  width: 70px;
  accent-color: #4a90d9;
}

.select {
  padding: 4px 6px;
  font-size: 11px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
}

/* ── Bookmarks ──────────────────────────────────────────────── */

.bookmark-add {
  padding: 8px 14px;
  border-bottom: 1px solid #e0e0e0;
}

.bookmark-item {
  padding: 8px 14px;
  cursor: pointer;
  color: inherit;
  border-bottom: 1px solid #f0f0f0;
  font-size: 11px;
  line-height: 1.4;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bookmark-label {
  cursor: pointer;
  flex: 1;
}

/* ── Search ─────────────────────────────────────────────────── */

.search-bar {
  padding: 8px 12px;
  display: flex;
  gap: 6px;
}

.search-input {
  flex: 1;
  padding: 6px 8px;
  font-size: 11px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  outline: none;
}

.search-input:focus {
  border-color: #4a90d9;
}

/* ── Loading ────────────────────────────────────────────────── */

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: inherit; opacity: 0.5;
  font-size: 16px;
}
</style>
