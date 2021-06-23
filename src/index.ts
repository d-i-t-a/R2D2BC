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
import { getUserAgentRegExp } from "browserslist-useragent-regexp";
import { Locator } from "./model/Locator";
import { Publication } from "./model/Publication";
import { Link } from "./model/Link";
import { TaJsonDeserialize } from "./utils/JsonUtil";

var D2Settings: UserSettings;
var D2TTSSettings: TTSSettings;
var D2Navigator: IFrameNavigator;
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
  D2Navigator.stop();
  D2Settings.stop();
  if (D2Navigator.rights?.enableTTS) {
    D2TTSSettings.stop();
    TTSModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableBookmarks) {
    BookmarkModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableAnnotations) {
    AnnotationModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableSearch) {
    SearchModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableContentProtection) {
    ContentProtectionModuleInstance.stop();
  }
  if (D2Navigator.rights?.enableTimeline) {
    TimelineModuleInstance.stop();
  }
}
export function startReadAloud() {
  if (IS_DEV) {
    console.log("startReadAloud");
  }
  return D2Navigator.startReadAloud();
}
export function stopReadAloud() {
  if (IS_DEV) {
    console.log("stopReadAloud");
  }
  return D2Navigator.stopReadAloud();
}
export function pauseReadAloud() {
  if (IS_DEV) {
    console.log("pauseReadAloud");
  }
  return D2Navigator.pauseReadAloud();
}
export function resumeReadAloud() {
  if (IS_DEV) {
    console.log("resumeReadAloud");
  }
  return D2Navigator.resumeReadAloud();
}

export async function saveBookmark() {
  if (D2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("saveBookmark");
    }
    return await BookmarkModuleInstance.saveBookmark();
  }
}
export async function deleteBookmark(bookmark) {
  if (D2Navigator.rights?.enableBookmarks) {
    if (IS_DEV) {
      console.log("deleteBookmark");
    }
    return await BookmarkModuleInstance.deleteBookmark(bookmark);
  }
}
export async function deleteAnnotation(highlight) {
  if (D2Navigator.rights?.enableAnnotations) {
    if (IS_DEV) {
      console.log("deleteAnnotation");
    }
    return await AnnotationModuleInstance.deleteAnnotation(highlight);
  }
}
export async function addAnnotation(highlight) {
  if (D2Navigator.rights?.enableAnnotations) {
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
  return await D2Navigator.tableOfContents();
}
export async function readingOrder() {
  if (IS_DEV) {
    console.log("readingOrder");
  }
  return await D2Navigator.readingOrder();
}
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
export async function goToSearchIndex(href, index, current) {
  if (D2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("goToSearchIndex");
    }
    await SearchModuleInstance.goToSearchIndex(href, index, current);
  }
}
export async function goToSearchID(href, index, current) {
  if (D2Navigator.rights?.enableSearch) {
    if (IS_DEV) {
      console.log("goToSearchID");
    }
    await SearchModuleInstance.goToSearchID(href, index, current);
  }
}
export async function clearSearch() {
  if (D2Navigator.rights?.enableSearch) {
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
  return D2Navigator.currentResource();
}
export function mostRecentNavigatedTocItem() {
  if (IS_DEV) {
    console.log("mostRecentNavigatedTocItem");
  }
  return D2Navigator.mostRecentNavigatedTocItem();
}
export function totalResources() {
  if (IS_DEV) {
    console.log("totalResources");
  }
  return D2Navigator.totalResources();
}
export function publicationLanguage() {
  if (IS_DEV) {
    console.log("publicationLanguage");
  }
  return D2Navigator.publication.Metadata.Language;
}
export async function resetUserSettings() {
  if (IS_DEV) {
    console.log("resetSettings");
  }
  D2Settings.resetUserSettings();
}
export async function applyUserSettings(userSettings) {
  if (IS_DEV) {
    console.log("applyUserSettings");
  }
  D2Settings.applyUserSettings(userSettings);
}
export async function currentSettings() {
  if (IS_DEV) {
    console.log("currentSettings");
  }
  return D2Settings.currentSettings();
}
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
    D2TTSSettings.increase(incremental);
  } else {
    if (IS_DEV) {
      console.log("increase " + incremental);
    }
    D2Settings.increase(incremental);
  }
}
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
    D2TTSSettings.decrease(incremental);
  } else {
    if (IS_DEV) {
      console.log("decrease " + incremental);
    }
    D2Settings.decrease(incremental);
  }
}
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
    D2TTSSettings.resetTTSSettings();
  }
}
export async function applyTTSSettings(ttsSettings) {
  if (D2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("applyTTSSettings");
    }
    D2TTSSettings.applyTTSSettings(ttsSettings);
  }
}

export async function applyTTSSetting(key, value) {
  if (D2Navigator.rights?.enableTTS) {
    if (IS_DEV) {
      console.log("set " + key + " value " + value);
    }
    D2TTSSettings.applyTTSSetting(key, value);
  }
}
export async function applyPreferredVoice(value) {
  if (D2Navigator.rights?.enableTTS) {
    D2TTSSettings.applyPreferredVoice(value);
  }
}

export async function goTo(locator) {
  if (IS_DEV) {
    console.log("goTo " + locator);
  }
  D2Navigator.goTo(locator);
}
export async function nextResource() {
  if (IS_DEV) {
    console.log("nextResource");
  }
  D2Navigator.nextResource();
}
export async function previousResource() {
  if (IS_DEV) {
    console.log("previousResource");
  }
  D2Navigator.previousResource();
}
export async function nextPage() {
  if (IS_DEV) {
    console.log("nextPage");
  }
  D2Navigator.nextPage();
}
export async function previousPage() {
  if (IS_DEV) {
    console.log("previousPage");
  }
  D2Navigator.previousPage();
}
export async function atStart() {
  if (IS_DEV) {
    console.log("atStart");
  }
  return D2Navigator.atStart();
}
export async function atEnd() {
  if (IS_DEV) {
    console.log("atEnd");
  }
  return D2Navigator.atEnd();
}
export async function scroll(value) {
  if (IS_DEV) {
    console.log("scroll " + value);
  }
  D2Settings.scroll(value);
}

export async function currentLocator() {
  if (IS_DEV) {
    console.log("currentLocator");
  }
  return D2Navigator.currentLocator();
}
export async function positions() {
  if (IS_DEV) {
    console.log("positions");
  }
  return D2Navigator.positions();
}
export async function goToPosition(value) {
  if (IS_DEV) {
    console.log("goToPosition");
  }
  return D2Navigator.goToPosition(value);
}
export async function applyAttributes(value) {
  if (IS_DEV) {
    console.log("applyAttributes");
  }
  D2Navigator.applyAttributes(value);
}
export async function snapToElement(value) {
  if (IS_DEV) {
    console.log("snapToElement");
  }
  D2Navigator.snapToElement(value);
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

    if (config.rights?.autoGeneratePositions ?? true) {
      var startPosition = 0;
      var totalContentLength = 0;
      var positions = [];
      var weight = {};
      publication.readingOrder.map(async (link, index) => {
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
          // TODO: USE ZIP ARCHIVE ENTRY LENGTH !!!!! ??
          var href = publication.getAbsoluteHref(link.Href);
          await fetch(href).then(async (r) => {
            let length = (await r.blob()).size;
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
          });
        }
        if (index + 1 === publication.readingOrder.length) {
          if (
            (publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed"
          ) {
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
        }
      });
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
    return new Promise((resolve) => resolve(D2Navigator));
  } else {
    throw new Error("Browser not supported");
  }
}
