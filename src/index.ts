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
import IFrameNavigator, { ReaderConfig, UpLinkConfig } from "./navigator/IFrameNavigator";
import LocalAnnotator from "./store/LocalAnnotator";
import Publication from "./model/Publication";
import BookmarkModule from "./modules/BookmarkModule";
import { UserSettings } from "./model/user-settings/UserSettings";
import AnnotationModule from "./modules/AnnotationModule";
import TTSModule from "./modules/TTS/TTSModule";
import { oc } from "ts-optchain"
import { TTSSettings } from "./modules/TTS/TTSSettings";
import SearchModule from "./modules/search/SearchModule";
import ContentProtectionModule from "./modules/protection/ContentProtectionModule";
import TextHighlighter from "./modules/highlight/TextHighlighter";
import { Locator } from "./model/Locator";
import TimelineModule from "./modules/positions/TimelineModule";

var R2Settings: UserSettings;
var R2TTSSettings: TTSSettings;
var R2Navigator: IFrameNavigator;
var D2Highlighter:TextHighlighter;
var BookmarkModuleInstance: BookmarkModule;
var AnnotationModuleInstance: AnnotationModule;
var TTSModuleInstance: TTSModule;
var SearchModuleInstance:SearchModule;
var ContentProtectionModuleInstance:ContentProtectionModule;
var TimelineModuleInstance: TimelineModule;

export const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

export async function unload() {

    if (IS_DEV) { console.log("unload reader") }
    document.body.onscroll = () => { }
    R2Navigator.stop()
    R2Settings.stop()
    if (oc(R2Navigator.rights).enableTTS(false)) {
        R2TTSSettings.stop()
        TTSModuleInstance.stop()
    }
    if (oc(R2Navigator.rights).enableBookmarks(false)) {
        BookmarkModuleInstance.stop()
    }
    if (oc(R2Navigator.rights).enableAnnotations(false)) {
        AnnotationModuleInstance.stop()
    }
    if (oc(R2Navigator.rights).enableSearch(false)) {
        SearchModuleInstance.stop()
    }
    if (oc(R2Navigator.rights).enableContentProtection(false)) {
        ContentProtectionModuleInstance.stop()
    }
    if (oc(R2Navigator.rights).enableTimeline(false)) {
        TimelineModuleInstance.stop()
    }
}
export function startReadAloud() {
    if (IS_DEV) { console.log("startReadAloud") }
    return R2Navigator.startReadAloud()
}
export function stopReadAloud() {
    if (IS_DEV) { console.log("stopReadAloud") }
    return R2Navigator.stopReadAloud()
}
export function pauseReadAloud() {
    if (IS_DEV) { console.log("pauseReadAloud") }
    return R2Navigator.pauseReadAloud()
}
export function resumeReadAloud() {
    if (IS_DEV) { console.log("resumeReadAloud") }
    return R2Navigator.resumeReadAloud()
}

export async function saveBookmark() {
    if (oc(R2Navigator.rights).enableBookmarks(false)) {
        if (IS_DEV) { console.log("saveBookmark") }
        BookmarkModuleInstance.saveBookmark()
    }
}
export async function deleteBookmark(bookmark) {
    if (oc(R2Navigator.rights).enableBookmarks(false)) {
        if (IS_DEV) { console.log("deleteBookmark") }
        BookmarkModuleInstance.deleteBookmark(bookmark)
    }
}
export async function deleteAnnotation(highlight) {
    if (oc(R2Navigator.rights).enableAnnotations(false)) {
        if (IS_DEV) { console.log("deleteAnnotation") }
        AnnotationModuleInstance.deleteAnnotation(highlight)
    }
}
export async function addAnnotation(highlight) {
    if (oc(R2Navigator.rights).enableAnnotations(false)) {
        if (IS_DEV) { console.log("addAnnotation") }
        AnnotationModuleInstance.addAnnotation(highlight)
    }
}
export async function tableOfContents() {
    if (IS_DEV) { console.log("bookmarks") }
    return await R2Navigator.tableOfContents()
}
export async function bookmarks() {
    if (oc(R2Navigator.rights).enableBookmarks(false)) {
        if (IS_DEV) { console.log("bookmarks") }
        return await BookmarkModuleInstance.getBookmarks()
    } else {
        return []
    }
}
export async function annotations() {
    if (oc(R2Navigator.rights).enableAnnotations(false)) {
        if (IS_DEV) { console.log("annotations") }
        return await AnnotationModuleInstance.getAnnotations()
    } else {
        return []
    }
}

export async function search(term, current) {
    if (oc(R2Navigator.rights).enableSearch(false)) {
        if (IS_DEV) { console.log("search") }
        return await SearchModuleInstance.search(term, current)   
    } else {
        return []
    }
}
export async function goToSearchIndex(href, index, current) {
    if (oc(R2Navigator.rights).enableSearch(false)) {
        if (IS_DEV) { console.log("goToSearchIndex") }
        await SearchModuleInstance.goToSearchIndex(href, index, current)   
    }
}
export async function goToSearchID(href, index, current) {
    if (oc(R2Navigator.rights).enableSearch(false)) {
        if (IS_DEV) { console.log("goToSearchID") }
        await SearchModuleInstance.goToSearchID(href, index, current)   
    }
}

export function currentResource() {
    if (IS_DEV) { console.log("currentResource") }
    return R2Navigator.currentResource()
}
export function mostRecentNavigatedTocItem() {
    if (IS_DEV) { console.log("mostRecentNavigatedTocItem") }
    return R2Navigator.mostRecentNavigatedTocItem()
}
export function totalResources() {
    if (IS_DEV) { console.log("totalResources") }
    return R2Navigator.totalResources()
}
export function publicationLanguage() {
    if (IS_DEV) { console.log("publicationLanguage") }
    return R2Navigator.publication.metadata.language
}
export async function resetUserSettings() {
    if (IS_DEV) { console.log("resetSettings") }
    R2Settings.resetUserSettings()
}
export async function applyUserSettings(userSettings) {
    if (IS_DEV) { console.log("applyUserSettings") }
    R2Settings.applyUserSettings(userSettings)
}
export async function currentSettings() {
    if (IS_DEV) { console.log("currentSettings") }
    return R2Settings.currentSettings()
}
export async function increase(incremental) {
    if ((incremental == "pitch" || incremental == "rate" || incremental == "volume") && oc(R2Navigator.rights).enableTTS(false)) {
        if (IS_DEV) { console.log("increase " + incremental) }
        R2TTSSettings.increase(incremental)
    } else {
        if (IS_DEV) { console.log("increase " + incremental) }
        R2Settings.increase(incremental)
    }
}
export async function decrease(incremental) {
    if ((incremental == "pitch" || incremental == "rate" || incremental == "volume") && oc(R2Navigator.rights).enableTTS(false)) {
        if (IS_DEV) { console.log("decrease " + incremental) }
        R2TTSSettings.decrease(incremental)
    } else {
        if (IS_DEV) { console.log("decrease " + incremental) }
        R2Settings.decrease(incremental)
    }
}
export async function publisher(on) {
    if (IS_DEV) { console.log("publisher " + on) }
    R2Settings.publisher(on)
}
export async function resetTTSSettings() {
    if (oc(R2Navigator.rights).enableTTS(false)) {
        if (IS_DEV) { console.log("resetSettings") }
        R2TTSSettings.resetTTSSettings()
    }
}
export async function applyTTSSettings(ttsSettings) {
    if (oc(R2Navigator.rights).enableTTS(false)) {
        if (IS_DEV) { console.log("applyTTSSettings") }
        R2TTSSettings.applyTTSSettings(ttsSettings)
    }
}

export async function ttsSet(key, value) {
    if (oc(R2Navigator.rights).enableTTS(false)) {
        if (IS_DEV) { console.log("set " + key + " value " + value) }
        R2TTSSettings.ttsSet(key, value)
    }
}
export async function preferredVoice(value) {
    if (oc(R2Navigator.rights).enableTTS(false)) {
        R2TTSSettings.preferredVoice(value)
    }
}


export async function goTo(locator) {
    if (IS_DEV) { console.log("goTo " + locator) }
    R2Navigator.goTo(locator)
}
export async function nextResource() {
    if (IS_DEV) { console.log("nextResource") }
    R2Navigator.nextResource()
}
export async function previousResource() {
    if (IS_DEV) { console.log("previousResource") }
    R2Navigator.previousResource()
}
export async function nextPage() {
    if (IS_DEV) { console.log("nextPage") }
    R2Navigator.nextPage()
}
export async function previousPage() {
    if (IS_DEV) { console.log("previousPage") }
    R2Navigator.previousPage()
}
export async function scroll(value) {
    if (IS_DEV) { console.log("scroll " + value) }
    R2Settings.scroll(value)
}

export async function currentLocator() {
    if (IS_DEV) { console.log("currentLocator") }
    return R2Navigator.currentLocator()
}
export async function positions() {
    if (IS_DEV) { console.log("positions") }
    return R2Navigator.positions()
}
export async function goToPosition(value) {
    if (IS_DEV) { console.log("goToPosition") }
    return R2Navigator.goToPosition(value)
}

export async function load(config: ReaderConfig): Promise<any> {

    const supportedBrowsers = /(Edge\/(86(?:\.0)?|86(?:\.([1-9]|\d{2,}))?|(8[7-9]|9\d|\d{3,})(?:\.\d+)?))|((Chromium|Chrome)\/(86\.0|86\.([1-9]|\d{2,})|(8[7-9]|9\d|\d{3,})\.\d+)(?:\.\d+)?)|(Version\/(14\.0|14\.([1-9]|\d{2,})|(1[5-9]|[2-9]\d|\d{3,})\.\d+)(?:\.\d+)? Safari\/)/

    if ((oc(config.protection).enforceSupportedBrowsers(false) && supportedBrowsers.test(navigator.userAgent)) || oc(config.protection).enforceSupportedBrowsers(false) == false) {

        var mainElement = document.getElementById("D2Reader-Container");
        var headerMenu = document.getElementById("headerMenu");
        var footerMenu = document.getElementById("footerMenu");
        var webpubManifestUrl = config.url;
        var store = new LocalStorageStore({
            prefix: webpubManifestUrl.href,
            useLocalStorage: config.useLocalStorage
        });
        var settingsStore = new LocalStorageStore({
            prefix: "r2d2bc-reader",
            useLocalStorage: config.useLocalStorage
        });

        var annotator = new LocalAnnotator({ store: store });

        var upLink: UpLinkConfig
        if (config.upLinkUrl) {
            upLink = config.upLinkUrl;
        }

        const publication: Publication = await Publication.getManifest(webpubManifestUrl, store);

        var startPosition = 0
        var totalContentLength = 0
        var positions = []
        publication.readingOrder.map(async (link, index) => {
            var href = publication.getAbsoluteHref(link.href);
            await fetch(href)
                .then(async r => {
                    let length = (await r.blob()).size
                    link.contentLength = length
                    totalContentLength += length
                    let positionLength = 1024
                    let positionCount = Math.max(1, Math.ceil(length / positionLength))
                    console.log(length + " Bytes")
                    console.log(positionCount + " Positions")
                    Array.from(Array(positionCount).keys()).map((_, position) => {
                        const locator: Locator = {
                            href: link.href,
                            locations: {
                                progression: (position) / (positionCount),
                                position: startPosition + (position + 1),
                            },
                            type: link.type
                        };
                        console.log(locator)
                        positions.push(locator)
                    });
                    startPosition = startPosition + positionCount
                })
            if (index + 1 == publication.readingOrder.length) {
                publication.readingOrder.map(async (link) => {
                    console.log(totalContentLength)
                    console.log(link.contentLength)
                    link.contentWeight = 100 / totalContentLength * link.contentLength
                    console.log(link.contentWeight)
                })
                positions.map((locator, _index) => {
                    let resource = positions.filter((el: Locator) => el.href === locator.href)
                    let positionIndex = Math.ceil(locator.locations.progression * (resource.length - 1))
                    locator.locations.totalProgression = (locator.locations.position - 1) / (positions.length)
                    locator.locations.remainingPositions = Math.abs((positionIndex) - (resource.length - 1))
                    locator.locations.totalRemainingPositions = Math.abs((locator.locations.position - 1) - (positions.length - 1))
                })
                publication.positions = positions
                console.log(positions)
            }
        });

        // Settings
        R2Settings = await UserSettings.create({
            store: settingsStore,
            initialUserSettings: config.userSettings,
            headerMenu: headerMenu,
            material: config.material,
            api: config.api
        })

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
            injectables: config.injectables,
            attributes: config.attributes
        })
        
        // Highlighter
        D2Highlighter = await TextHighlighter.create({ 
            delegate: R2Navigator,
            config: config.highlighter
        })

        // Bookmark Module
        if (oc(config.rights).enableBookmarks(false)) {
            BookmarkModuleInstance = await BookmarkModule.create({
                annotator: annotator,
                headerMenu: headerMenu,
                rights: config.rights,
                publication: publication,
                delegate: R2Navigator,
                initialAnnotations: config.initialAnnotations,
            })
        }

        // Annotation Module
        if (oc(config.rights).enableAnnotations(false)) {
            AnnotationModuleInstance = await AnnotationModule.create({
                annotator: annotator,
                headerMenu: headerMenu,
                rights: config.rights,
                publication: publication,
                delegate: R2Navigator,
                initialAnnotations: config.initialAnnotations,
            config: config.annotations,
            highlighter: D2Highlighter
            })
        }  

        // TTS Module
        if (oc(config.rights).enableTTS(false)) {
            R2TTSSettings = await TTSSettings.create({
                store: settingsStore,
                initialTTSSettings: config.tts,
                headerMenu: headerMenu,
                api:config.tts.api
            })
            TTSModuleInstance = await TTSModule.create({
                delegate: R2Navigator,
                tts: R2TTSSettings,
                headerMenu: headerMenu,
                rights: config.rights,
            highlighter: D2Highlighter
            })
        }

        // Search Module
        if (oc(config.rights).enableSearch(false)) {
            SearchModule.create({
                headerMenu: headerMenu,
                delegate: R2Navigator,
                publication: publication,
                // api: config.api,
                config: config.search,
                highlighter: D2Highlighter
            }).then(function (searchModule) {
                SearchModuleInstance = searchModule
            });
        }
        // Timeline Module
        if (oc(config.rights).enableTimeline(false)) {
            TimelineModule.create({
                publication: publication,
                delegate: R2Navigator
            }).then(function (timelineModule) {
                TimelineModuleInstance = timelineModule
            })
        }

        // Content Protection Module
        if (oc(config.rights).enableContentProtection(false)) {
            ContentProtectionModule.create({
                delegate: R2Navigator,
                protection: config.protection
            }).then(function (contentProtectionModule) {
                ContentProtectionModuleInstance = contentProtectionModule;
            });
        }
    
        return new Promise(resolve => resolve(R2Navigator));
    } else {
        throw new Error("Browser not suppoorted");    
    }
}

exports.load = async function (config: ReaderConfig) {
    load(config)
}
exports.unload = async function () {
    unload()
}

exports.resetUserSettings = function () {
    resetUserSettings()
}

// - apply user setting(s)
exports.applyUserSettings = function (userSettings) {
    applyUserSettings(userSettings)
}
exports.currentSettings = function () {
    return currentSettings()
}
exports.increase = function (incremental) {
    increase(incremental)
}
exports.decrease = function (incremental) {
    decrease(incremental)
}
exports.publisher = function (on) {
    publisher(on)
}

exports.startReadAloud = function () {
    startReadAloud()
}
exports.stopReadAloud = function () {
    stopReadAloud()
}
exports.pasueReadAloud = function () {
    pauseReadAloud()
}
exports.resumeReadAloud = function () {
    resumeReadAloud()
}

exports.applyTTSSettings = function (ttsSettings) {
    applyTTSSettings(ttsSettings)
}
exports.ttsSet = function (key, value) {
    ttsSet(key, value)
}
exports.preferredVoice = function (value) {
    preferredVoice(value)
}
exports.resetTTSSettings = function () {
    resetTTSSettings()
}

// - add bookmark
// - delete bookmark
exports.saveBookmark = function () {
    saveBookmark()
}
exports.deleteBookmark = function (bookmark) {
    deleteBookmark(bookmark)
}

exports.deleteAnnotation = function (highlight) {
    deleteAnnotation(highlight)
}

exports.addAnnotation = function (highlight) {
    addAnnotation(highlight)
}

// - go to locator (this will be used for anything form toc, bookmark, last reading position etc.)
exports.goTo = function (locator) {
    goTo(locator)
}

// - next resource
// - previous resource
exports.nextResource = function () {
    nextResource()
}
exports.previousResource = function () {
    previousResource()
}

// - next page (only in paginated mode)
// - previous page (only in paginated)
exports.nextPage = function () {
    nextPage()
}
exports.previousPage = function () {
    previousPage()
}

exports.scroll = function (value) {
    scroll(value)
}

exports.tableOfContents = function () {
    return tableOfContents()
}
exports.bookmarks = function () {
    return bookmarks()
}
exports.annotations = function () {
    return annotations()
}

exports.currentResource = function () {
    return currentResource()
}
exports.mostRecentNavigatedTocItem = function () {
    return mostRecentNavigatedTocItem()
}
exports.totalResources = function () {
    return totalResources()
}
exports.publicationLanguage = function () {
    return publicationLanguage()
}
exports.search = function (term, current) {
    return search(term, current)
}
exports.goToSearchIndex = function (href, index, current) {
    goToSearchIndex(href, index, current)
}
exports.goToSearchID = function (href, index, current) {
    goToSearchID(href, index, current)
}
exports.currentLocator = function () {
    return currentLocator()
}
exports.positions = function () {
    return positions()
}
exports.goToPosition = function (value) {
    goToPosition(value)
}