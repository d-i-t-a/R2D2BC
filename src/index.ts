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
import Publication from "./model/Publication";
import BookmarkModule from "./modules/BookmarkModule";
import { UserSettings } from "./model/user-settings/UserSettings";
import AnnotationModule from "./modules/AnnotationModule";
import TTSModule from "./modules/TTS/TTSModule";
import { TTSSettings } from "./modules/TTS/TTSSettings";
import SearchModule from "./modules/search/SearchModule";
import ContentProtectionModule from "./modules/protection/ContentProtectionModule";
import TextHighlighter from "./modules/highlight/TextHighlighter";
import { Locator } from "./model/Locator";
import TimelineModule from "./modules/positions/TimelineModule";
import { getUserAgentRegExp } from "browserslist-useragent-regexp";

var R2Settings: UserSettings;
var R2TTSSettings: TTSSettings;
var R2Navigator: IFrameNavigator;
var D2Highlighter: TextHighlighter;
var BookmarkModuleInstance: BookmarkModule;
var AnnotationModuleInstance: AnnotationModule;
var TTSModuleInstance: TTSModule;
var SearchModuleInstance: SearchModule;
var ContentProtectionModuleInstance: ContentProtectionModule;
var TimelineModuleInstance: TimelineModule;

export const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

export async function unload() {
  if (IS_DEV) {
    console.log("unload reader");
  }
  document.body.onscroll = () => {};
  R2Navigator.stop();
  R2Settings.stop();
  if (R2Navigator.rights?.enableTTS) {
    R2TTSSettings.stop();
    TTSModuleInstance.stop();
  }
  if (R2Navigator.rights?.enableBookmarks) {
    BookmarkModuleInstance.stop();
  }
  if (R2Navigator.rights?.enableAnnotations) {
    AnnotationModuleInstance.stop();
  }
  if (R2Navigator.rights?.enableSearch) {
    SearchModuleInstance.stop();
  }
  if (R2Navigator.rights?.enableContentProtection) {
    ContentProtectionModuleInstance.stop();
  }
  if (R2Navigator.rights?.enableTimeline) {
    TimelineModuleInstance.stop();
  }
}
export function startReadAloud() {
  if (IS_DEV) {
    console.log("startReadAloud");
  }
  return R2Navigator.startReadAloud();
}
export function stopReadAloud() {
  if (IS_DEV) {
    console.log("stopReadAloud");
  }
  return R2Navigator.stopReadAloud();
}
export function pauseReadAloud() {
  if (IS_DEV) {
    console.log("pauseReadAloud");
  }
  return R2Navigator.pauseReadAloud();
}
export function resumeReadAloud() {
  if (IS_DEV) {
    console.log("resumeReadAloud");
  }
  return R2Navigator.resumeReadAloud();
}

export async function saveBookmark() {
  if (R2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("saveBookmark");
    }
    return await BookmarkModuleInstance.saveBookmark();
  }
}
export async function deleteBookmark(bookmark) {
  if (R2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("deleteBookmark");
    }
    return await BookmarkModuleInstance.deleteBookmark(bookmark);
  }
}
export async function deleteAnnotation(highlight) {
  if (R2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("deleteAnnotation");
    }
    return await AnnotationModuleInstance.deleteAnnotation(highlight);
  }
}
export async function addAnnotation(highlight) {
  if (R2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("addAnnotation");
    }
    return await AnnotationModuleInstance.addAnnotation(highlight);
  }
}
export async function tableOfContents() {
  if (IS_DEV) {
    console.log("tableOfContents");
  }
  return await R2Navigator.tableOfContents();
}
export async function readingOrder() {
  if (IS_DEV) {
    console.log("readingOrder");
  }
  return await R2Navigator.readingOrder();
}
export async function bookmarks() {
  if (R2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("bookmarks");
    }
    return await BookmarkModuleInstance.getBookmarks();
  } else {
    return [];
  }
}
export async function annotations() {
  if (R2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("annotations");
    }
    return await AnnotationModuleInstance.getAnnotations();
  } else {
    return [];
  }
}

export async function search(term, current) {
  if (R2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("search");
    }
    return await SearchModuleInstance.search(term, current);
  } else {
    return [];
  }
}
export async function goToSearchIndex(href, index, current) {
  if (R2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("goToSearchIndex");
    }
    await SearchModuleInstance.goToSearchIndex(href, index, current);
  }
}
export async function goToSearchID(href, index, current) {
  if (R2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("goToSearchID");
    }
    await SearchModuleInstance.goToSearchID(href, index, current);
  }
}
export async function clearSearch() {
  if (R2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("clearSearch");
    }
    await SearchModuleInstance.clearSearch();
  }
}

export function currentResource() {
  if (IS_DEV) {
    console.log("currentResource");
  }
  return R2Navigator.currentResource();
}
export function mostRecentNavigatedTocItem() {
  if (IS_DEV) {
    console.log("mostRecentNavigatedTocItem");
  }
  return R2Navigator.mostRecentNavigatedTocItem();
}
export function totalResources() {
  if (IS_DEV) {
    console.log("totalResources");
  }
  return R2Navigator.totalResources();
}
export function publicationLanguage() {
  if (IS_DEV) {
    console.log("publicationLanguage");
  }
  return R2Navigator.publication.metadata.language;
}
export async function resetUserSettings() {
  if (IS_DEV) {
    console.log("resetSettings");
  }
  R2Settings.resetUserSettings();
}
export async function applyUserSettings(userSettings) {
  if (IS_DEV) {
    console.log("applyUserSettings");
  }
  R2Settings.applyUserSettings(userSettings);
}
export async function currentSettings() {
  if (IS_DEV) {
    console.log("currentSettings");
  }
  return R2Settings.currentSettings();
}
export async function increase(incremental) {
  if (
    (incremental === "pitch" ||
      incremental === "rate" ||
      incremental === "volume") &&
    R2Navigator.rights?.enableTTS
  ) {
    if (IS_DEV) {
      console.log("increase " + incremental);
    }
    R2TTSSettings.increase(incremental);
  } else {
    if (IS_DEV) {
      console.log("increase " + incremental);
    }
    R2Settings.increase(incremental);
  }
}
export async function decrease(incremental) {
  if (
    (incremental === "pitch" ||
      incremental === "rate" ||
      incremental === "volume") &&
    R2Navigator.rights?.enableTTS
  ) {
    if (IS_DEV) {
      console.log("decrease " + incremental);
    }
    R2TTSSettings.decrease(incremental);
  } else {
    if (IS_DEV) {
      console.log("decrease " + incremental);
    }
    R2Settings.decrease(incremental);
  }
}
// export async function publisher(on) {
//   if (IS_DEV) {
//     console.log("publisher " + on);
//   }
//   R2Settings.publisher(on);
// }
export async function resetTTSSettings() {
  if (R2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("resetSettings");
    }
    R2TTSSettings.resetTTSSettings();
  }
}
export async function applyTTSSettings(ttsSettings) {
  if (R2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("applyTTSSettings");
    }
    R2TTSSettings.applyTTSSettings(ttsSettings);
  }
}

export async function applyTTSSetting(key, value) {
  if (R2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("set " + key + " value " + value);
    }
    R2TTSSettings.applyTTSSetting(key, value);
  }
}
export async function applyPreferredVoice(value) {
  if (R2Navigator.rights?.enableTTS) {
    R2TTSSettings.applyPreferredVoice(value);
  }
}

export async function goTo(locator) {
  if (IS_DEV) {
    console.log("goTo " + locator);
  }
  R2Navigator.goTo(locator);
}
export async function nextResource() {
  if (IS_DEV) {
    console.log("nextResource");
  }
  R2Navigator.nextResource();
}
export async function previousResource() {
  if (IS_DEV) {
    console.log("previousResource");
  }
  R2Navigator.previousResource();
}
export async function nextPage() {
  if (IS_DEV) {
    console.log("nextPage");
  }
  R2Navigator.nextPage();
}
export async function previousPage() {
  if (IS_DEV) {
    console.log("previousPage");
  }
  R2Navigator.previousPage();
}
export async function atStart() {
  if (IS_DEV) {
    console.log("atStart");
  }
  return R2Navigator.atStart();
}
export async function atEnd() {
  if (IS_DEV) {
    console.log("atEnd");
  }
  return R2Navigator.atEnd();
}
export async function scroll(value) {
  if (IS_DEV) {
    console.log("scroll " + value);
  }
  R2Settings.scroll(value);
}

export async function currentLocator() {
  if (IS_DEV) {
    console.log("currentLocator");
  }
  return R2Navigator.currentLocator();
}
export async function positions() {
  if (IS_DEV) {
    console.log("positions");
  }
  return R2Navigator.positions();
}
export async function goToPosition(value) {
  if (IS_DEV) {
    console.log("goToPosition");
  }
  return R2Navigator.goToPosition(value);
}
export async function applyAttributes(value) {
  if (IS_DEV) {
    console.log("applyAttributes");
  }
  R2Navigator.applyAttributes(value);
}
export async function snapToElement(value) {
  if (IS_DEV) {
    console.log("snapToElement");
  }
  R2Navigator.snapToElement(value);
}

export async function load(config: ReaderConfig): Promise<any> {
  var browsers: string[] = [];

  if (config.protection?.enforceSupportedBrowsers) {
    (config.protection?.supportedBrowsers ?? []).forEach((browser: string) => {
      browsers.push("last 1 " + browser + " version");
    });
  }
  const supportedBrowsers = getUserAgentRegExp({
    browsers: browsers,
    allowHigherVersions: true,
  });

  if (
    (config.protection?.enforceSupportedBrowsers &&
      supportedBrowsers.test(navigator.userAgent)) ||
    !config.protection?.enforceSupportedBrowsers
  ) {
    var mainElement = document.getElementById("D2Reader-Container");
    var headerMenu = document.getElementById("headerMenu");
    var footerMenu = document.getElementById("footerMenu");
    var webpubManifestUrl = config.url;
    var store = new LocalStorageStore({
      prefix: webpubManifestUrl.href,
      useLocalStorage: config.useLocalStorage,
    });
    var settingsStore = new LocalStorageStore({
      prefix: "r2d2bc-reader",
      useLocalStorage: config.useLocalStorage,
    });

    var annotator = new LocalAnnotator({ store: store });

    var upLink: UpLinkConfig;
    if (config.upLinkUrl) {
      upLink = config.upLinkUrl;
    }
    const publication: Publication = await Publication.getManifest(
      webpubManifestUrl,
      store
    );

    if ((publication.metadata.rendition?.layout ?? "unknown") === "fixed") {
      config.rights.enableAnnotations = false;
      config.rights.enableSearch = false;
      config.rights.enableTTS = false;
      // config.protection.enableObfuscation = false;
    }

    if (config.rights?.autoGeneratePositions ?? true) {
      var startPosition = 0;
      var totalContentLength = 0;
      var positions = [];
      var weight = {};
      await Promise.all(
        publication.readingOrder.map(async (link) => {
          if (
            (publication.metadata.rendition?.layout ?? "unknown") === "fixed"
          ) {
            const locator: Locator = {
              href: link.href,
              locations: {
                progression: 0,
                position: startPosition + 1,
              },
              type: link.type,
            };
            if (IS_DEV) console.log(locator);
            positions.push(locator);
            startPosition = startPosition + 1;
          } else {
            var href = publication.getAbsoluteHref(link.href);
            const r = await fetch(href);
            const b = await r.blob();
            let length = b.size;
            link.contentLength = length;
            totalContentLength += length;
            let positionLength = 1024;
            let positionCount = Math.max(1, Math.ceil(length / positionLength));
            if (IS_DEV) console.log(length + " Bytes");
            if (IS_DEV) console.log(positionCount + " Positions");
            Array.from(Array(positionCount).keys()).map((_, position) => {
              const locator: Locator = {
                href: link.href,
                locations: {
                  progression: position / positionCount,
                  position: startPosition + (position + 1),
                },
                type: link.type,
              };
              if (IS_DEV) console.log(locator);
              positions.push(locator);
            });
            startPosition = startPosition + positionCount;
          }
        })
      );
      if ((publication.metadata.rendition?.layout ?? "unknown") !== "fixed") {
        publication.readingOrder.map(async (link) => {
          if (IS_DEV) console.log(totalContentLength);
          if (IS_DEV) console.log(link.contentLength);
          link.contentWeight = (100 / totalContentLength) * link.contentLength;
          weight[link.href] = link.contentWeight;
          if (IS_DEV) console.log(link.contentWeight);
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
      if (config.services?.positions) {
        await fetch(config.services?.positions.href)
          .then((r) => r.text())
          .then(async (content) => {
            publication.positions = JSON.parse(content).positions;
          });
      }
      if (config.services?.weight) {
        await fetch(config.services?.weight.href)
          .then((r) => r.text())
          .then(async (content) => {
            if (
              (publication.metadata.rendition?.layout ?? "unknown") !== "fixed"
            ) {
              let weight = JSON.parse(content);
              publication.readingOrder.map(async (link) => {
                link.contentWeight = weight[link.href];
                if (IS_DEV) console.log(link.contentWeight);
              });
            }
          });
      }
    }

    // Settings
    R2Settings = await UserSettings.create({
      store: settingsStore,
      initialUserSettings: config.userSettings,
      headerMenu: headerMenu,
      material: config.material,
      api: config.api,
      layout:
        (publication.metadata.rendition?.layout ?? "unknown") === "fixed"
          ? "fixed"
          : "reflowable",
    });

    // Navigator
    R2Navigator = await IFrameNavigator.create({
      mainElement: mainElement,
      headerMenu: headerMenu,
      footerMenu: footerMenu,
      publication: publication,
      settings: R2Settings,
      annotator: annotator,
      upLink: upLink,
      initialLastReadingPosition: config.lastReadingPosition,
      material: config.material,
      api: config.api,
      rights: config.rights,
      tts: config.tts,
      injectables:
        (publication.metadata.rendition?.layout ?? "unknown") === "fixed"
          ? []
          : config.injectables,
      attributes: config.attributes,
      services: config.services,
    });

    // Highlighter
    if ((publication.metadata.rendition?.layout ?? "unknown") !== "fixed") {
      D2Highlighter = await TextHighlighter.create({
        delegate: R2Navigator,
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
        delegate: R2Navigator,
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
        delegate: R2Navigator,
        initialAnnotations: config.initialAnnotations,
        highlighter: D2Highlighter,
        ...config.annotations,
      });
    }

    // TTS Module
    if (config.rights?.enableTTS) {
      R2TTSSettings = await TTSSettings.create({
        store: settingsStore,
        initialTTSSettings: config.tts,
        headerMenu: headerMenu,
        ...config.tts,
      });
      TTSModuleInstance = await TTSModule.create({
        delegate: R2Navigator,
        tts: R2TTSSettings,
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
        delegate: R2Navigator,
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
        delegate: R2Navigator,
      }).then(function (timelineModule) {
        TimelineModuleInstance = timelineModule;
      });
    }

    // Content Protection Module
    if (config.rights?.enableContentProtection) {
      ContentProtectionModule.create({
        delegate: R2Navigator,
        ...config.protection,
      }).then(function (contentProtectionModule) {
        ContentProtectionModuleInstance = contentProtectionModule;
      });
    }

    return new Promise((resolve) => resolve(R2Navigator));
  } else {
    throw new Error("Browser not suppoorted");
  }
}
