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
import {oc} from "ts-optchain"
import { TTSSettings } from "./modules/TTS/TTSSettings";

var R2Settings: UserSettings;
var R2TTSSettings: TTSSettings;
var R2Navigator: IFrameNavigator;
var BookmarkModuleInstance: BookmarkModule;
var AnnotationModuleInstance: AnnotationModule;
var TTSModuleInstance: TTSModule;

export const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

export async function unload() {

    if (IS_DEV) { console.log("unload reader") }
    document.body.onscroll = () => { }
    R2Navigator.stop()
    R2Settings.stop()
    R2TTSSettings.stop()
    BookmarkModuleInstance.stop()
    AnnotationModuleInstance.stop()
    TTSModuleInstance.stop()
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
    if (IS_DEV) { console.log("saveBookmark") }
    BookmarkModuleInstance.saveBookmark()
}
export async function deleteBookmark(bookmark) {
    if (IS_DEV) { console.log("deleteBookmark") }
    BookmarkModuleInstance.deleteBookmark(bookmark)
}
export async function deleteAnnotation(highlight) {
    if (IS_DEV) { console.log("deleteAnnotation") }
    AnnotationModuleInstance.deleteAnnotation(highlight)
}
export async function addAnnotation(highlight) {
    if (IS_DEV) { console.log("addAnnotation") }
    AnnotationModuleInstance.addAnnotation(highlight)
}
export async function tableOfContents() {
    if (IS_DEV) { console.log("bookmarks") }
    return await R2Navigator.tableOfContents()    
}
export async function bookmarks() {
    if (IS_DEV) { console.log("bookmarks") }
    return await BookmarkModuleInstance.getBookmarks()    
}
export async function annotations() {
    if (IS_DEV) { console.log("annotations") }
    return await AnnotationModuleInstance.getAnnotations()    
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
export async function increase(incremental) {
    if (IS_DEV) { console.log("increase " + incremental) }
    if (incremental == "pitch" || incremental == "rate" || incremental == "volume") {
        R2TTSSettings.increase(incremental)
    } else {
        R2Settings.increase(incremental)
    }
}
export async function decrease(incremental) {
    if (IS_DEV) { console.log("decrease " + incremental) }
    if (incremental == "pitch" || incremental == "rate" || incremental == "volume") {
        R2TTSSettings.decrease(incremental)
    } else {
        R2Settings.decrease(incremental)
    }
}
export async function publisher(on) {
    if (IS_DEV) { console.log("publisher " + on) }
    R2Settings.publisher(on)
}
export async function resetTTSSettings() {
    if (IS_DEV) { console.log("resetSettings") }
    R2TTSSettings.resetTTSSettings()
}
export async function applyTTSSettings(ttsSettings) {
    if (IS_DEV) { console.log("applyTTSSettings") }
    R2TTSSettings.applyTTSSettings(ttsSettings)
}

export async function ttsSet(key, value) {
    if (IS_DEV) { console.log("set " + key + " value " + value) }
    R2TTSSettings.ttsSet(key, value)
}
export async function preferredVoice(value) {
    R2TTSSettings.preferredVoice(value)
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
export async function scroll(scroll) {
    if (IS_DEV) { console.log("scroll " + scroll) }
    R2Settings.scroll(scroll)
}


export async function load(config: ReaderConfig): Promise<any> {
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

    R2Settings = await UserSettings.create({
        store: settingsStore,
        initialUserSettings: config.userSettings,
        headerMenu: headerMenu,
        ui: config.ui,
        api: config.api
    })

    R2TTSSettings = await TTSSettings.create({
        store: settingsStore,
        initialTTSSettings: config.tts,
        headerMenu: headerMenu,
        api:config.api
    })

    R2Navigator = await IFrameNavigator.create({
        mainElement: mainElement,
        headerMenu: headerMenu,
        footerMenu: footerMenu,
        publication: publication,
        settings: R2Settings,
        annotator: annotator,
        upLink: upLink,
        ui: config.ui,
        initialLastReadingPosition: config.lastReadingPosition,
        material: config.material,
        api: config.api,
        rights: config.rights,
        tts: config.tts,
        injectables: config.injectables,
        selectionMenuItems: config.selectionMenuItems,
        initialAnnotationColor: config.initialAnnotationColor
    })
    // add custom modules
    // Bookmark Module
        if (oc(config.rights).enableBookmarks) {
        BookmarkModuleInstance = await BookmarkModule.create({
            annotator: annotator,
            headerMenu: headerMenu,
            rights: config.rights,
            publication: publication,
            settings: R2Settings,
            delegate: R2Navigator,
            initialAnnotations: config.initialAnnotations,
        })
    }

    // Annotation Module
    if (oc(config.rights).enableAnnotations) {
        AnnotationModuleInstance = await AnnotationModule.create({
            annotator: annotator,
            headerMenu: headerMenu,
            rights: config.rights,
            publication: publication,
            settings: R2Settings,
            delegate: R2Navigator,
            initialAnnotations: config.initialAnnotations
        })
        if (oc(config.rights).enableTTS) {
            TTSModuleInstance = await TTSModule.create({
                annotationModule: AnnotationModuleInstance,
                tts: R2TTSSettings
            })
        }
    }    

    return new Promise(resolve => resolve(R2Navigator));
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

exports.scroll = function (scroll) {
    scroll(scroll)
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

exports.currentResource = function() {
    return currentResource()
}
exports.mostRecentNavigatedTocItem = function() {
    return mostRecentNavigatedTocItem()
}
exports.totalResources = function() {
    return totalResources()
}
exports.publicationLanguage = function() {
    return publicationLanguage()
}