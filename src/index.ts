/*
 * Copyright 2018-2020 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import LocalStorageStore from "./store/LocalStorageStore";
import IFrameNavigator, {
  ReaderConfig,
  UpLinkConfig,
} from "./navigator/IFrameNavigator";
import LocalAnnotator from "./store/LocalAnnotator";
import BookmarkModule from "./modules/BookmarkModule";
import { UserSettings } from "./model/user-settings/UserSettings";
import AnnotationModule from "./modules/AnnotationModule";
import TTSModule from "./modules/TTS/TTSModule";
import { TTSSettings } from "./modules/TTS/TTSSettings";
import SearchModule from "./modules/search/SearchModule";
import ContentProtectionModule from "./modules/protection/ContentProtectionModule";
import TextHighlighter from "./modules/highlight/TextHighlighter";
import TimelineModule from "./modules/positions/TimelineModule";
import MediaOverlayModule from "./modules/mediaoverlays/MediaOverlayModule";
import { Locator } from "./model/Locator";
import { Publication } from "./model/Publication";
import { convertAndCamel, Link } from "./model/Link";
import { TaJsonDeserialize } from "./utils/JsonUtil";
import { MediaOverlaySettings } from "./modules/mediaoverlays/MediaOverlaySettings";

let D2Settings: UserSettings;
let D2TTSSettings: TTSSettings;
let D2MediaOverlaySettings: MediaOverlaySettings;
let D2Navigator: IFrameNavigator;
let D2Highlighter: TextHighlighter;
let BookmarkModuleInstance: BookmarkModule;
let AnnotationModuleInstance: AnnotationModule;
let TTSModuleInstance: TTSModule;
let SearchModuleInstance: SearchModule;
let ContentProtectionModuleInstance: ContentProtectionModule;
let TimelineModuleInstance: TimelineModule;
let MediaOverlayModuleInstance: MediaOverlayModule;

export const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

export async function unload() {
  if (IS_DEV) {
    console.log("unload reader");
  }
  document.body.onscroll = () => { };
  await D2Navigator.stop();
  await D2Settings.stop();
  if (D2Navigator.rights?.enableTTS) {
    await D2TTSSettings.stop();
    await TTSModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableBookmarks) {
    await BookmarkModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableAnnotations) {
    await AnnotationModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableSearch) {
    await SearchModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableContentProtection) {
    await ContentProtectionModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableTimeline) {
    await TimelineModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableMediaOverlays) {
    await D2MediaOverlaySettings.stop();
    await MediaOverlayModuleInstance.stop();
  }
}
exports.unload = async function () {
  await unload();
};
export function hasMediaOverlays() {
  if (IS_DEV) {
    console.log("hasMediaOverlays");
  }
  return D2Navigator.hasMediaOverlays;
}
exports.hasMediaOverlays = function () {
  return hasMediaOverlays();
};
export function startReadAloud() {
  if (IS_DEV) {
    console.log("startReadAloud");
  }
  return D2Navigator.startReadAloud();
}
exports.startReadAloud = function () {
  return startReadAloud();
};
export function stopReadAloud() {
  if (IS_DEV) {
    console.log("stopReadAloud");
  }
  return D2Navigator.stopReadAloud();
}
exports.stopReadAloud = function () {
  return stopReadAloud();
};
export function pauseReadAloud() {
  if (IS_DEV) {
    console.log("pauseReadAloud");
  }
  return D2Navigator.pauseReadAloud();
}
exports.pauseReadAloud = function () {
  return pauseReadAloud();
};
export function resumeReadAloud() {
  if (IS_DEV) {
    console.log("resumeReadAloud");
  }
  return D2Navigator.resumeReadAloud();
}
exports.resumeReadAloud = function () {
  return resumeReadAloud();
};
export async function saveBookmark() {
  if (D2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("saveBookmark");
    }
    return await BookmarkModuleInstance.saveBookmark();
  }
}
exports.saveBookmark = function () {
  return saveBookmark();
};
export async function deleteBookmark(bookmark) {
  if (D2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("deleteBookmark");
    }
    return await BookmarkModuleInstance.deleteBookmark(bookmark);
  }
}
exports.deleteBookmark = async function (bookmark) {
  return deleteBookmark(bookmark);
};
export async function deleteAnnotation(highlight) {
  if (D2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("deleteAnnotation");
    }
    return await AnnotationModuleInstance.deleteAnnotation(highlight);
  }
}
exports.deleteAnnotation = async function (highlight) {
  return deleteAnnotation(highlight);
};
export async function addAnnotation(highlight) {
  if (D2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("addAnnotation");
    }
    return await AnnotationModuleInstance.addAnnotation(highlight);
  }
}
exports.addAnnotation = async function (highlight) {
  return addAnnotation(highlight);
};
export async function tableOfContents() {
  if (IS_DEV) {
    console.log("tableOfContents");
  }
  return await convertAndCamel(D2Navigator.tableOfContents());
}
exports.tableOfContents = function () {
  return tableOfContents();
};
export async function readingOrder() {
  if (IS_DEV) {
    console.log("readingOrder");
  }
  return await convertAndCamel(D2Navigator.readingOrder());
}
exports.readingOrder = async function () {
  return readingOrder();
};
export async function bookmarks() {
  if (D2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("bookmarks");
    }
    return await BookmarkModuleInstance.getBookmarks();
  } else {
    return [];
  }
}
exports.bookmarks = async function () {
  return bookmarks();
};
export async function annotations() {
  if (D2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("annotations");
    }
    return await AnnotationModuleInstance.getAnnotations();
  } else {
    return [];
  }
}
exports.annotations = async function () {
  return annotations();
};
export async function search(term, current) {
  if (D2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("search");
    }
    return await SearchModuleInstance.search(term, current);
  } else {
    return [];
  }
}
exports.search = async function (term, current) {
  return search(term, current);
};
export async function goToSearchIndex(href, index, current) {
  if (D2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("goToSearchIndex");
    }
    await SearchModuleInstance.goToSearchIndex(href, index, current);
  }
}
exports.goToSearchIndex = async function (href, index, current) {
  await goToSearchIndex(href, index, current);
};
export async function goToSearchID(href, index, current) {
  if (D2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("goToSearchID");
    }
    await SearchModuleInstance.goToSearchID(href, index, current);
  }
}
exports.goToSearchID = async function (href, index, current) {
  await goToSearchID(href, index, current);
};
export async function clearSearch() {
  if (D2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("clearSearch");
    }
    await SearchModuleInstance.clearSearch();
  }
}
exports.clearSearch = async function () {
  await clearSearch();
};
export function currentResource() {
  if (IS_DEV) {
    console.log("currentResource");
  }
  return D2Navigator.currentResource();
}
exports.currentResource = function () {
  return currentResource();
};
export function mostRecentNavigatedTocItem() {
  if (IS_DEV) {
    console.log("mostRecentNavigatedTocItem");
  }
  return D2Navigator.mostRecentNavigatedTocItem();
}
exports.mostRecentNavigatedTocItem = function () {
  return mostRecentNavigatedTocItem();
};
export function totalResources() {
  if (IS_DEV) {
    console.log("totalResources");
  }
  return D2Navigator.totalResources();
}
exports.totalResources = function () {
  return totalResources();
};
export function publicationLanguage() {
  if (IS_DEV) {
    console.log("publicationLanguage");
  }
  return D2Navigator.publication.Metadata.Language;
}
exports.publicationLanguage = function () {
  return publicationLanguage();
};
export async function resetUserSettings() {
  if (IS_DEV) {
    console.log("resetSettings");
  }
  await D2Settings.resetUserSettings();
}
exports.resetUserSettings = async function () {
  await resetUserSettings();
};
export async function applyUserSettings(userSettings) {
  if (IS_DEV) {
    console.log("applyUserSettings");
  }
  await D2Settings.applyUserSettings(userSettings);
}
exports.applyUserSettings = async function (userSettings) {
  await applyUserSettings(userSettings);
};
export async function currentSettings() {
  if (IS_DEV) {
    console.log("currentSettings");
  }
  return D2Settings.currentSettings();
}
exports.currentSettings = async function () {
  return currentSettings();
};
export async function increase(incremental) {
  if (
    (incremental === "pitch" ||
      incremental === "rate" ||
      incremental === "volume") &&
    D2Navigator.rights?.enableTTS
  ) {
    if (IS_DEV) {
      console.log("increase " + incremental);
    }
    await D2TTSSettings.increase(incremental);
  } else {
    if (IS_DEV) {
      console.log("increase " + incremental);
    }
    await D2Settings.increase(incremental);
  }
}
exports.increase = async function (incremental) {
  await increase(incremental);
};
export async function decrease(incremental) {
  if (
    (incremental === "pitch" ||
      incremental === "rate" ||
      incremental === "volume") &&
    D2Navigator.rights?.enableTTS
  ) {
    if (IS_DEV) {
      console.log("decrease " + incremental);
    }
    await D2TTSSettings.decrease(incremental);
  } else {
    if (IS_DEV) {
      console.log("decrease " + incremental);
    }
    await D2Settings.decrease(incremental);
  }
}
exports.decrease = async function (incremental) {
  await decrease(incremental);
};
// export async function publisher(on) {
//   if (IS_DEV) {
//     console.log("publisher " + on);
//   }
//   R2Settings.publisher(on);
// }
export async function resetTTSSettings() {
  if (D2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("resetSettings");
    }
    await D2TTSSettings.resetTTSSettings();
  }
}
exports.resetTTSSettings = async function () {
  await resetTTSSettings();
};
export async function applyTTSSettings(ttsSettings) {
  if (D2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("applyTTSSettings");
    }
    await D2TTSSettings.applyTTSSettings(ttsSettings);
  }
}
exports.applyTTSSettings = async function (ttsSettings) {
  await applyTTSSettings(ttsSettings);
};
export async function applyTTSSetting(key, value) {
  if (D2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("set " + key + " value " + value);
    }
    await D2TTSSettings.applyTTSSetting(key, value);
  }
}
exports.applyTTSSetting = async function (key, value) {
  await applyTTSSetting(key, value);
};
export async function applyPreferredVoice(value) {
  if (D2Navigator.rights?.enableTTS) {
    await D2TTSSettings.applyPreferredVoice(value);
  }
}
exports.applyPreferredVoice = async function (value) {
  await applyPreferredVoice(value);
};
export async function resetMediaOverlaySettings() {
  if (D2Navigator.rights?.enableMediaOverlays) {
    if (IS_DEV) {
      console.log("resetMediaOverlaySettings");
    }
    await D2MediaOverlaySettings.resetMediaOverlaySettings();
  }
}
exports.resetMediaOverlaySettings = async function () {
  await resetMediaOverlaySettings();
};
export async function applyMediaOverlaySettings(setting) {
  if (D2Navigator.rights?.enableMediaOverlays) {
    if (IS_DEV) {
      console.log("applyMediaOverlaySettings");
    }
    await D2MediaOverlaySettings.applyMediaOverlaySettings(setting);
  }
}
exports.applyMediaOverlaySettings = async function (setting) {
  await applyMediaOverlaySettings(setting);
};
export function goTo(locator) {
  if (IS_DEV) {
    console.log("goTo " + locator);
  }
  D2Navigator.goTo(locator);
}
exports.goTo = function (locator) {
  goTo(locator);
};
export function nextResource() {
  if (IS_DEV) {
    console.log("nextResource");
  }
  D2Navigator.nextResource();
}
exports.nextResource = function () {
  nextResource();
};
export function previousResource() {
  if (IS_DEV) {
    console.log("previousResource");
  }
  D2Navigator.previousResource();
}
exports.previousResource = function () {
  previousResource();
};
export function nextPage() {
  if (IS_DEV) {
    console.log("nextPage");
  }
  D2Navigator.nextPage();
}
exports.nextPage = function () {
  nextPage();
};
export function previousPage() {
  if (IS_DEV) {
    console.log("previousPage");
  }
  D2Navigator.previousPage();
}
exports.previousPage = function () {
  previousPage();
};
export function atStart() {
  if (IS_DEV) {
    console.log("atStart");
  }
  return D2Navigator.atStart();
}
exports.atStart = function () {
  return atStart();
};
export function atEnd() {
  if (IS_DEV) {
    console.log("atEnd");
  }
  return D2Navigator.atEnd();
}
exports.atEnd = function () {
  return atEnd();
};
export async function scroll(value) {
  if (IS_DEV) {
    console.log("scroll " + value);
  }
  await D2Settings.scroll(value);
}
exports.scroll = async function (value) {
  await scroll(value);
};
export function currentLocator() {
  if (IS_DEV) {
    console.log("currentLocator");
  }
  return D2Navigator.currentLocator();
}
exports.currentLocator = function () {
  return currentLocator();
};
export function positions() {
  if (IS_DEV) {
    console.log("positions");
  }
  return D2Navigator.positions();
}
exports.positions = function () {
  return positions();
};
export function goToPosition(value) {
  if (IS_DEV) {
    console.log("goToPosition");
  }
  D2Navigator.goToPosition(value);
}
exports.goToPosition = function (value) {
  goToPosition(value);
};
export function applyAttributes(value) {
  if (IS_DEV) {
    console.log("applyAttributes");
  }
  D2Navigator.applyAttributes(value);
}
exports.applyAttributes = function (value) {
  applyAttributes(value);
};
// currently not used or functional
export function snapToElement(value) {
  if (IS_DEV) {
    console.log("snapToElement");
  }
  D2Navigator.snapToElement(value);
}
exports.snapToElement = function (value) {
  snapToElement(value);
};
export async function load(config: ReaderConfig): Promise<any> {
  if (config.rights?.enableContentProtection) {
    await ContentProtectionModule.setupPreloadProtection(config.protection);
  }

  let mainElement = document.getElementById("D2Reader-Container");
  let headerMenu = document.getElementById("headerMenu");

  let footerMenu = document.getElementById("footerMenu");
  let webpubManifestUrl = config.url;

  let store = new LocalStorageStore({
    prefix: webpubManifestUrl.href,
    useLocalStorage: config.useLocalStorage,
  });

  let settingsStore = new LocalStorageStore({
    prefix: "r2d2bc-reader",
    useLocalStorage: config.useLocalStorage,
  });

  let annotator = new LocalAnnotator({ store: store });

  let upLink: UpLinkConfig;
  if (config.upLinkUrl) {
    upLink = config.upLinkUrl;
  }

  const response = await window.fetch(webpubManifestUrl.href, {
    credentials: "same-origin",
  });
  const manifestJSON = await response.json();
  let publication = TaJsonDeserialize<Publication>(manifestJSON, Publication);
  publication.manifestUrl = webpubManifestUrl;

  if ((publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed") {
    config.rights.enableAnnotations = false;
    config.rights.enableSearch = false;
    config.rights.enableTTS = false;
    // config.protection.enableObfuscation = false;
  }

  const getContentBytesLength = async (href: string): Promise<number> => {
    if (config.api?.getContentBytesLength) {
      return config.api.getContentBytesLength(href);
    }
    const r = await fetch(href);
    const b = await r.blob();
    return b.size;
  };

  if (config.rights?.autoGeneratePositions ?? true) {
    let startPosition = 0;
    let totalContentLength = 0;
    let positions = [];
    let weight = {};
    for (const link of publication.readingOrder) {
      if ((publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed") {
        const locator: Locator = {
          href: link.Href,
          locations: {
            progression: 0,
            position: startPosition + 1,
          },
          type: link.TypeLink,
        };
        if (IS_DEV) console.log(locator);
        positions.push(locator);
        startPosition = startPosition + 1;
      } else {
        let href = publication.getAbsoluteHref(link.Href);
        let length = await getContentBytesLength(href);
        (link as Link).contentLength = length;
        totalContentLength += length;
        let positionLength = 1024;
        let positionCount = Math.max(1, Math.ceil(length / positionLength));
        if (IS_DEV) console.log(length + " Bytes");
        if (IS_DEV) console.log(positionCount + " Positions");
        Array.from(Array(positionCount).keys()).map((_, position) => {
          const locator: Locator = {
            href: link.Href,
            locations: {
              progression: position / positionCount,
              position: startPosition + (position + 1),
            },
            type: link.TypeLink,
          };
          if (IS_DEV) console.log(locator);
          positions.push(locator);
        });
        startPosition = startPosition + positionCount;
      }
    }

    if ((publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed") {
      publication.readingOrder.map(async (link) => {
        if (IS_DEV) console.log(totalContentLength);
        if (IS_DEV) console.log((link as Link).contentLength);
        (link as Link).contentWeight =
          (100 / totalContentLength) * (link as Link).contentLength;
        weight[link.Href] = (link as Link).contentWeight;
        if (IS_DEV) console.log((link as Link).contentWeight);
      });
    }
    positions.map((locator, _index) => {
      let resource = positions.filter(
        (el: Locator) => el.href === decodeURI(locator.href)
      );
      let positionIndex = Math.ceil(
        locator.locations.progression * (resource.length - 1)
      );
      locator.locations.totalProgression =
        (locator.locations.position - 1) / positions.length;
      locator.locations.remainingPositions = Math.abs(
        positionIndex - (resource.length - 1)
      );
      locator.locations.totalRemainingPositions = Math.abs(
        locator.locations.position - 1 - (positions.length - 1)
      );
    });
    publication.positions = positions;
    if (IS_DEV) console.log(positions);
  } else {
    if (config.services?.getPositions) {
      const positions = await config.services.getPositions();
      publication.positions = positions;
    } else if (config.services?.positions) {
      await fetch(config.services?.positions.href)
        .then((r) => r.text())
        .then(async (content) => {
          publication.positions = JSON.parse(content).positions;
        });
    }
    
    if (config.services?.getWeights) {
      if (
        (publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed"
      ) {
        const weightsByHref = await config.services.getWeights();
        publication.readingOrder.forEach(link => {
          (link as Link).contentWeight = weightsByHref[link.Href];
        });
      }
    } else if (config.services?.weight) {
      await fetch(config.services?.weight.href)
        .then((r) => r.text())
        .then(async (content) => {
          if (
            (publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed"
          ) {
            let weight = JSON.parse(content);
            publication.readingOrder.map(async (link) => {
              (link as Link).contentWeight = weight[link.Href];
              if (IS_DEV) console.log((link as Link).contentWeight);
            });
          }
        });
    }
  }

  // Settings
  D2Settings = await UserSettings.create({
    store: settingsStore,
    initialUserSettings: config.userSettings,
    headerMenu: headerMenu,
    material: config.material,
    api: config.api,
    injectables:
      (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
        ? config.injectablesFixed
        : config.injectables,
    layout:
      (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
        ? "fixed"
        : "reflowable",
  });

  // Navigator
  D2Navigator = await IFrameNavigator.create({
    mainElement: mainElement,
    headerMenu: headerMenu,
    footerMenu: footerMenu,
    publication: publication,
    settings: D2Settings,
    annotator: annotator,
    upLink: upLink,
    initialLastReadingPosition: config.lastReadingPosition,
    material: config.material,
    api: config.api,
    rights: config.rights,
    tts: config.tts,
    injectables:
      (publication.Metadata.Rendition?.Layout ?? "unknown") === "fixed"
        ? config.injectablesFixed
        : config.injectables,
    attributes: config.attributes,
    services: config.services,
  });

  // Highlighter
  if ((publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed") {
    D2Highlighter = await TextHighlighter.create({
      delegate: D2Navigator,
      ...config.highlighter,
    });
  }

  // Bookmark Module
  if (config.rights?.enableBookmarks) {
    BookmarkModuleInstance = await BookmarkModule.create({
      annotator: annotator,
      headerMenu: headerMenu,
      rights: config.rights,
      publication: publication,
      delegate: D2Navigator,
      initialAnnotations: config.initialAnnotations,
      ...config.bookmarks,
    });
  }

  // Annotation Module
  if (config.rights?.enableAnnotations) {
    AnnotationModuleInstance = await AnnotationModule.create({
      annotator: annotator,
      headerMenu: headerMenu,
      rights: config.rights,
      publication: publication,
      delegate: D2Navigator,
      initialAnnotations: config.initialAnnotations,
      highlighter: D2Highlighter,
      ...config.annotations,
    });
  }

  // TTS Module
  if (config.rights?.enableTTS) {
    D2TTSSettings = await TTSSettings.create({
      store: settingsStore,
      initialTTSSettings: config.tts,
      headerMenu: headerMenu,
      ...config.tts,
    });
    TTSModuleInstance = await TTSModule.create({
      delegate: D2Navigator,
      tts: D2TTSSettings,
      headerMenu: headerMenu,
      rights: config.rights,
      highlighter: D2Highlighter,
      ...config.tts,
    });
  }

  // Search Module
  if (config.rights?.enableSearch) {
    SearchModule.create({
      headerMenu: headerMenu,
      delegate: D2Navigator,
      publication: publication,
      highlighter: D2Highlighter,
      ...config.search,
    }).then(function (searchModule) {
      SearchModuleInstance = searchModule;
    });
  }
  // Timeline Module
  if (config.rights?.enableTimeline) {
    TimelineModule.create({
      publication: publication,
      delegate: D2Navigator,
    }).then(function (timelineModule) {
      TimelineModuleInstance = timelineModule;
    });
  }

  // Content Protection Module
  if (config.rights?.enableContentProtection) {
    ContentProtectionModule.create({
      delegate: D2Navigator,
      ...config.protection,
    }).then(function (contentProtectionModule) {
      ContentProtectionModuleInstance = contentProtectionModule;
    });
  }

  // MediaOverlay Module
  if (config.rights?.enableMediaOverlays) {
    D2MediaOverlaySettings = await MediaOverlaySettings.create({
      store: settingsStore,
      initialMediaOverlaySettings: config.mediaOverlays,
      headerMenu: headerMenu,
      ...config.mediaOverlays,
    });
    MediaOverlayModuleInstance = await MediaOverlayModule.create({
      publication: publication,
      settings: D2MediaOverlaySettings,
      delegate: D2Navigator,
      ...config.mediaOverlays,
    });
  }

  return new Promise((resolve) => resolve(D2Navigator));
}
exports.load = async function (config: ReaderConfig) {
  return load(config);
};
