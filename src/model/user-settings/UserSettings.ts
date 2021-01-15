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

import Store from "../../store/Store";
import { UserProperty, UserProperties, Enumerable, Switchable, Incremental } from "./UserProperties";
import { ReadiumCSS } from "./ReadiumCSS";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { IS_DEV } from "../..";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { ReaderUI}  from "../../navigator/IFrameNavigator"
import {oc} from "ts-optchain"
import ReflowableBookView from "../../views/ReflowableBookView";

export interface UserSettingsConfig {
    /** Store to save the user's selections in. */
    store: Store,
    initialUserSettings: UserSettings;
    headerMenu: HTMLElement;
    material: ReaderUI;
    api: any;
}
export interface UserSettingsUIConfig {
    fontSize?: boolean;
    fontFamily?: boolean;
    fontOverride: boolean;
    appearance?: boolean;
    scroll?: boolean;
    advancedSettings: boolean;
    textAlign?: boolean;
    colCount?: boolean;
    wordSpacing?: boolean;
    letterSpacing?: boolean;
    pageMargins: boolean;
    lineHeight: boolean;
}

export interface UserSettings {
    fontSize: number
    fontOverride: boolean
    fontFamily: number
    appearance: any
    verticalScroll: any

    //Advanced settings
    publisherDefaults: boolean
    textAlignment: number
    columnCount: number
    wordSpacing: number
    letterSpacing: number
    pageMargins: number
    lineHeight: number
}


export class UserSettings implements UserSettings {
    async isPaginated() {
        let scroll = ( await this.getProperty(ReadiumCSS.SCROLL_KEY) != null) ? ( await this.getProperty(ReadiumCSS.SCROLL_KEY) as Switchable).value : 0
        return scroll === 1
    }
    async isScrollmode() {
        let scroll = ( await this.getProperty(ReadiumCSS.SCROLL_KEY) != null) ? ( await this.getProperty(ReadiumCSS.SCROLL_KEY) as Switchable).value : 0
        return scroll === 0
    }

    private readonly store: Store;
    private readonly USERSETTINGS = "userSetting";

    static scrollValues = ["readium-scroll-on", "readium-scroll-off"]
    private static appearanceValues = ["readium-default-on", "readium-sepia-on", "readium-night-on"]
    private static fontFamilyValues = ["Original", "serif", "sans-serif"]
    private static readonly textAlignmentValues = ["auto", "justify", "start"]
    private static readonly columnCountValues = ["auto", "1", "2"]

    fontSize = 100.0
    fontOverride = false
    fontFamily = 0
    appearance: any = 0
    verticalScroll: any = 0

    //Advanced settings
    publisherDefaults = true
    textAlignment = 0
    columnCount = 0
    wordSpacing = 0.0
    letterSpacing = 0.0
    pageMargins = 2.0
    lineHeight = 1.0

    userProperties: UserProperties

    private fontButtons: { [key: string]: HTMLButtonElement };
    private fontSizeButtons: { [key: string]: HTMLButtonElement };
    private themeButtons: { [key: string]: HTMLButtonElement };
    private viewButtons: { [key: string]: HTMLButtonElement };

    reflowable: ReflowableBookView;

    private settingsChangeCallback: () => void = () => { };
    private viewChangeCallback: () => void = () => { };

    private settingsView: HTMLDivElement;
    private headerMenu: HTMLElement;
    private material: ReaderUI | null = null;
    api: any;

    private iframe: HTMLIFrameElement;

    public static async create(config: UserSettingsConfig): Promise<any> {
        const settings = new this(
            config.store,
            config.headerMenu,
            config.material,
            config.api
        );

        if (config.initialUserSettings) {
            var initialUserSettings:UserSettings= config.initialUserSettings
            if(initialUserSettings.verticalScroll) {
                settings.verticalScroll = UserSettings.scrollValues.findIndex((el: any) => el === initialUserSettings.verticalScroll);
                if (IS_DEV) console.log(settings.verticalScroll);
            }
            if(initialUserSettings.appearance) {
                settings.appearance = UserSettings.appearanceValues.findIndex((el: any) => el === initialUserSettings.appearance);
                if (IS_DEV) console.log(settings.appearance)
            }
            if(initialUserSettings.fontSize) {
                settings.fontSize = initialUserSettings.fontSize
                if (IS_DEV) console.log(settings.fontSize)
            }
            if(initialUserSettings.fontFamily) {
                settings.fontFamily = UserSettings.fontFamilyValues.findIndex((el: any) => el === initialUserSettings.fontFamily);
                if (IS_DEV) console.log(settings.fontFamily)
                if (settings.fontFamily != 0) {
                    settings.fontOverride = true
                }
            }
            if(initialUserSettings.textAlignment) {
                settings.textAlignment = UserSettings.textAlignmentValues.findIndex((el: any) => el === initialUserSettings.textAlignment);
                settings.publisherDefaults = false
                if (IS_DEV) console.log(settings.textAlignment)
            }
            if(initialUserSettings.columnCount) {
                settings.columnCount = UserSettings.columnCountValues.findIndex((el: any) => el === initialUserSettings.columnCount);
                if (IS_DEV) console.log(settings.columnCount)
            }
            if(initialUserSettings.wordSpacing) {
                settings.wordSpacing = initialUserSettings.wordSpacing;
                settings.publisherDefaults = false
                if (IS_DEV) console.log(settings.wordSpacing)
            }
            if(initialUserSettings.letterSpacing) {
                settings.letterSpacing = initialUserSettings.letterSpacing;
                settings.publisherDefaults = false
                if (IS_DEV) console.log(settings.letterSpacing)
            }
            if(initialUserSettings.pageMargins) {
                settings.pageMargins = initialUserSettings.pageMargins;
                settings.publisherDefaults = false
                if (IS_DEV) console.log(settings.pageMargins)
            }
            if(initialUserSettings.lineHeight) {
                settings.lineHeight = initialUserSettings.lineHeight;
                settings.publisherDefaults = false
                if (IS_DEV) console.log(settings.lineHeight)
            }
        }
        await settings.initializeSelections();
        return new Promise(resolve => resolve(settings));
    }

    protected constructor(store: Store, headerMenu: HTMLElement, material: ReaderUI, api: any) {
        this.store = store;

        this.reflowable = new ReflowableBookView(this.store);

        this.headerMenu = headerMenu;
        this.material = material;
        this.api = api;
        this.initialise();
    }

    async stop() {
        if (IS_DEV) { console.log("book settings stop") }
    }

    private async initialise() {
        this.appearance = (await this.getProperty(ReadiumCSS.APPEARANCE_KEY) != null) ? (await this.getProperty(ReadiumCSS.APPEARANCE_KEY) as Enumerable).value : this.appearance
        this.verticalScroll = (await this.getProperty(ReadiumCSS.SCROLL_KEY) != null) ? (await this.getProperty(ReadiumCSS.SCROLL_KEY) as Switchable).value : this.verticalScroll
        this.fontFamily = (await this.getProperty(ReadiumCSS.FONT_FAMILY_KEY) != null) ? (await this.getProperty(ReadiumCSS.FONT_FAMILY_KEY) as Enumerable).value : this.fontFamily
        if (this.fontFamily != 0) {
            this.fontOverride = true
        }
        this.publisherDefaults = (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY) != null) ? (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY) as Switchable).value : this.publisherDefaults
        this.textAlignment = (await this.getProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY) != null) ? (await this.getProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY) as Enumerable).value : this.textAlignment
        this.columnCount = (await this.getProperty(ReadiumCSS.COLUMN_COUNT_KEY) != null) ? (await this.getProperty(ReadiumCSS.COLUMN_COUNT_KEY) as Enumerable).value : this.columnCount

        this.fontSize = (await this.getProperty(ReadiumCSS.FONT_SIZE_KEY) != null) ? (await this.getProperty(ReadiumCSS.FONT_SIZE_KEY) as Incremental).value : this.fontSize
        this.wordSpacing = (await this.getProperty(ReadiumCSS.WORD_SPACING_KEY) != null) ? (await this.getProperty(ReadiumCSS.WORD_SPACING_KEY) as Incremental).value : this.wordSpacing
        this.letterSpacing = (await this.getProperty(ReadiumCSS.LETTER_SPACING_KEY) != null) ? (await this.getProperty(ReadiumCSS.LETTER_SPACING_KEY) as Incremental).value : this.letterSpacing
        this.pageMargins = (await this.getProperty(ReadiumCSS.PAGE_MARGINS_KEY) != null) ? (await this.getProperty(ReadiumCSS.PAGE_MARGINS_KEY) as Incremental).value : this.pageMargins
        this.lineHeight = (await this.getProperty(ReadiumCSS.LINE_HEIGHT_KEY) != null) ? (await this.getProperty(ReadiumCSS.LINE_HEIGHT_KEY) as Incremental).value : this.lineHeight
        this.userProperties = this.getUserSettings()
    }
    
    private async reset() {

        this.appearance = 0
        this.verticalScroll = 0
        this.fontSize = 100.0
        this.fontOverride = false
        this.fontFamily = 0
    
        //Advanced settings
        this.publisherDefaults = true
        this.textAlignment = 0
        this.columnCount = 0
        this.wordSpacing = 0.0
        this.letterSpacing = 0.0
        this.pageMargins = 2.0
        this.lineHeight = 1.0
    
        this.userProperties = this.getUserSettings()

        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as any;
        const rootElement = document.documentElement;
        const body = HTMLUtilities.findRequiredElement(rootElement, "body") as HTMLBodyElement;

        // Apply publishers default 
        html.style.removeProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY);
        // Apply font size 
        html.style.removeProperty(ReadiumCSS.FONT_SIZE_KEY);
        // Apply word spacing 
        html.style.removeProperty(ReadiumCSS.WORD_SPACING_KEY);
        // Apply letter spacing 
        html.style.removeProperty(ReadiumCSS.LETTER_SPACING_KEY);
        // Apply column count 
        html.style.removeProperty(ReadiumCSS.COLUMN_COUNT_KEY);
        // Apply text alignment 
        html.style.removeProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY);
        // Apply line height 
        html.style.removeProperty(ReadiumCSS.LINE_HEIGHT_KEY);
        // Apply page margins 
        html.style.removeProperty(ReadiumCSS.PAGE_MARGINS_KEY);

        // Apply appearance 
        html.style.removeProperty(ReadiumCSS.APPEARANCE_KEY);
        HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
        HTMLUtilities.setAttr(body, "data-viewer-theme", "day");

        // Apply font family 
        html.style.removeProperty(ReadiumCSS.FONT_FAMILY_KEY);
        HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
        html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-off");

    }

    private async initializeSelections(): Promise<void> {

        if (this.headerMenu) this.settingsView = HTMLUtilities.findElement(this.headerMenu, "#container-view-settings") as HTMLDivElement;
        if (await this.getProperty(ReadiumCSS.SCROLL_KEY) != null) {
            (await this.getProperty(ReadiumCSS.SCROLL_KEY)).value = this.verticalScroll;
        } else {
            await this.saveProperty(new Switchable("readium-scroll-on", "readium-scroll-off", this.verticalScroll, ReadiumCSS.SCROLL_REF, ReadiumCSS.SCROLL_KEY))
        }

    }

    async applyProperties(): Promise<any> {

        if (oc(this.reflowable.delegate.publication.metadata.rendition).layout("unknown") != 'fixed') {

            const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as any;
            const rootElement = document.documentElement;
            const body = HTMLUtilities.findRequiredElement(rootElement, "body") as HTMLBodyElement;

            // Apply publishers default 
            if (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY)){
                html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).toString());
            }
            // Apply font size 
            if (await this.getProperty(ReadiumCSS.FONT_SIZE_KEY)){
                html.style.setProperty(ReadiumCSS.FONT_SIZE_KEY, this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).toString());
            }
            // Apply word spacing 
            if (await this.getProperty(ReadiumCSS.WORD_SPACING_KEY)){
                html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, "readium-advanced-on");
                html.style.setProperty(ReadiumCSS.WORD_SPACING_KEY, this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).toString());
            }
            // Apply letter spacing 
            if (await this.getProperty(ReadiumCSS.LETTER_SPACING_KEY)){
                html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, "readium-advanced-on");
                html.style.setProperty(ReadiumCSS.LETTER_SPACING_KEY, this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).toString());
            }
            // Apply column count 
            if (await this.getProperty(ReadiumCSS.COLUMN_COUNT_KEY)){
                html.style.setProperty(ReadiumCSS.COLUMN_COUNT_KEY, this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).toString());
            }
            // Apply text alignment 
            if (await this.getProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY)){
                if (this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).toString() === "auto") {
                    html.style.removeProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY)
                } else {
                    html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, "readium-advanced-on");
                    html.style.setProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY, this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).toString());
                }
            }
            // Apply line height 
            if (await this.getProperty(ReadiumCSS.LINE_HEIGHT_KEY)){
                html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, "readium-advanced-on");
                html.style.setProperty(ReadiumCSS.LINE_HEIGHT_KEY, this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).toString());
            }
            // Apply page margins 
            if (await this.getProperty(ReadiumCSS.PAGE_MARGINS_KEY)){
                html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, "readium-advanced-on");
                html.style.setProperty(ReadiumCSS.PAGE_MARGINS_KEY, this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).toString());
            }

            // Apply appearance 
            if (await this.getProperty(ReadiumCSS.APPEARANCE_KEY)){
                html.style.setProperty(ReadiumCSS.APPEARANCE_KEY, this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).toString());
                if (this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value == 0) {
                    HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
                    HTMLUtilities.setAttr(body, "data-viewer-theme", "day");
                } else if (this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value == 1) {
                    HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "sepia");
                    HTMLUtilities.setAttr(body, "data-viewer-theme", "sepia");
                } else if (this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value == 2) {
                    HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "night");
                    HTMLUtilities.setAttr(body, "data-viewer-theme", "night");
                }
            } else {
                html.style.setProperty(ReadiumCSS.APPEARANCE_KEY, this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).toString());
                HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
                HTMLUtilities.setAttr(body, "data-viewer-theme", "day");
            }
            // Apply font family 
            if (await this.getProperty(ReadiumCSS.FONT_FAMILY_KEY)){
                html.style.setProperty(ReadiumCSS.FONT_FAMILY_KEY, this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString());
                if (this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value == 0) {
                    HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
                    html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-off");
                } else if (this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value == 1) {
                    HTMLUtilities.setAttr(html, "data-viewer-font", "serif");
                    html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-on");
                } else if (this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value == 2) {
                    HTMLUtilities.setAttr(html, "data-viewer-font", "sans");
                    html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-on");
                } else { 
                    HTMLUtilities.setAttr(html, "data-viewer-font", this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString());
                    html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-on");
                }
            } else {
                html.style.setProperty(ReadiumCSS.FONT_FAMILY_KEY, this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString());
                HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
                html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-off");
            }

            if (await this.getProperty(ReadiumCSS.SCROLL_KEY)){
                if (this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value == 0) {
                    html.style.setProperty("--USER__scroll", "readium-scroll-on");
                } else {
                    html.style.setProperty("--USER__scroll", "readium-scroll-off");
                }
            } else {
                html.style.setProperty("--USER__scroll", "readium-scroll-on");
            }
            this.isScrollmode().then(scroll => {
                this.reflowable.setMode(scroll)
            })
        
        }
    }

    setIframe(iframe: HTMLIFrameElement) {
        this.iframe = iframe
        this.reflowable.iframe = iframe
        if (this.settingsView) this.renderControls(this.settingsView);
    }


    private renderControls(element: HTMLElement): void {
        if (oc(this.material).settings.fontSize(false)) {
            this.fontSizeButtons = {};
            for (const fontSizeName of ["decrease", "increase"]) {
                this.fontSizeButtons[fontSizeName] = HTMLUtilities.findElement(element, "#" + fontSizeName + "-font") as HTMLButtonElement;
            }
        } else {
            HTMLUtilities.findElement(element, "#container-view-fontsize") ? HTMLUtilities.findElement(element, "#container-view-fontsize").remove() : null
        }
        if (oc(this.material).settings.fontFamily(false)) {
            this.fontButtons = {};
            this.fontButtons[0] = HTMLUtilities.findElement(element, "#publisher-font") as HTMLButtonElement;
            this.fontButtons[1] = HTMLUtilities.findElement(element, "#serif-font") as HTMLButtonElement;
            this.fontButtons[2] = HTMLUtilities.findElement(element, "#sans-font") as HTMLButtonElement;
            if (UserSettings.fontFamilyValues.length > 3) {
                for (let index = 3; index < UserSettings.fontFamilyValues.length; index++) {
                    this.fontButtons[index] = HTMLUtilities.findElement(element, "#" + UserSettings.fontFamilyValues[index] + "-font") as HTMLButtonElement;
                }
            }
            this.updateFontButtons();
        } else {
            HTMLUtilities.findElement(element, "#container-view-fontfamily") ? HTMLUtilities.findElement(element, "#container-view-fontfamily").remove() : null
        }

        if (oc(this.material).settings.appearance(false)) {
            this.themeButtons = {};
            this.themeButtons[0] = HTMLUtilities.findElement(element, "#day-theme") as HTMLButtonElement;
            this.themeButtons[1] = HTMLUtilities.findElement(element, "#sepia-theme") as HTMLButtonElement;
            this.themeButtons[2] = HTMLUtilities.findElement(element, "#night-theme") as HTMLButtonElement;
            if (UserSettings.appearanceValues.length > 3) {
                for (let index = 3; index < UserSettings.appearanceValues.length; index++) {
                    this.themeButtons[index] = HTMLUtilities.findElement(element, "#" + UserSettings.appearanceValues[index] + "-theme") as HTMLButtonElement;
                }
            }
        } else {
            HTMLUtilities.findElement(element, "#container-view-appearance") ? HTMLUtilities.findElement(element, "#container-view-appearance").remove() : null
        }

        if (oc(this.material).settings.scroll(false)) {
            this.viewButtons = {};
            this.viewButtons[0] = HTMLUtilities.findElement(element, "#view-scroll") as HTMLButtonElement;
            this.viewButtons[1] = HTMLUtilities.findElement(element, "#view-paginated") as HTMLButtonElement;
            this.updateViewButtons();
        } else {
            HTMLUtilities.findElement(element, "#container-view-scroll") ? HTMLUtilities.findElement(element, "#container-view-scroll").remove() : null
        }

        this.setupEvents();

        // Clicking the settings view outside the ul hides it, but clicking inside the ul keeps it up.
        addEventListenerOptional(HTMLUtilities.findElement(element, "ul"), 'click', (event: Event) => {
            event.stopPropagation();
        });
    }

    public onSettingsChange(callback: () => void) {
        this.settingsChangeCallback = callback;
    }

    public onViewChange(callback: () => void) {
        this.viewChangeCallback = callback;
    }

    private async setupEvents(): Promise<void> {

        if (oc(this.material).settings.fontSize(false)) {
            addEventListenerOptional(this.fontSizeButtons["decrease"], 'click', async (event: MouseEvent) => {
                (this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental).decrement()
                await this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
                this.applyProperties()
                this.settingsChangeCallback();
                event.preventDefault();
            });
            addEventListenerOptional(this.fontSizeButtons["increase"], 'click', async (event: MouseEvent) => {
                (this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental).increment()
                await this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
                this.applyProperties()
                this.settingsChangeCallback();
                event.preventDefault();
            });
        }

        if (oc(this.material).settings.fontFamily(false)) {
            for (let index = 0; index < UserSettings.fontFamilyValues.length; index++) {
                const button = this.fontButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value = index;
                        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF))
                        this.applyProperties()
                        this.updateFontButtons();
                        this.settingsChangeCallback();
                        event.preventDefault();
                    });
                }
            }
        }

        if (oc(this.material).settings.appearance(false)) {
            for (let index = 0; index < UserSettings.appearanceValues.length; index++) {
                const button = this.themeButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value = index;
                        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF))
                        this.applyProperties()
                        this.settingsChangeCallback();
                        event.preventDefault();
                    });
                }
            }
        }

        if (oc(this.material).settings.scroll(false)) {
            for (let index = 0; index < UserSettings.scrollValues.length; index++) {
                const button = this.viewButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        const position = this.reflowable.getCurrentPosition();
                        this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value = index;
                        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.SCROLL_REF))
                        this.applyProperties()
                        this.updateViewButtons();
                        this.reflowable.setMode(index === 0);
                        this.reflowable.goToPosition(position)
                        event.preventDefault();
                        this.viewChangeCallback();
                    });
                }
            }
        }
    }

    private async updateFontButtons(): Promise<void> {
        if (oc(this.material).settings.fontFamily(false)) {
        for (let index = 0; index < UserSettings.fontFamilyValues.length; index++) {
            this.fontButtons[index].className = this.fontButtons[index].className.replace(" active", "")
        }
        if (this.userProperties) {
            if (this.fontButtons[await this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value]) this.fontButtons[await this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value].className += " active"
        }
    }
    }

    private async updateViewButtons(): Promise<void> {
        if (oc(this.material).settings.scroll(false)) {
        for (let index = 0; index < UserSettings.scrollValues.length; index++) {
            this.viewButtons[index].className = this.viewButtons[index].className.replace(" active", "")
        }
        if (this.userProperties) {
            if (this.viewButtons[await this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value]) this.viewButtons[await this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value].className += " active"
        }
    }
    }

    private async storeProperty(property: UserProperty): Promise<void> {
        this.updateUserSettings()
        this.saveProperty(property)
    }

    addAppearance(appearance: string): any {
        UserSettings.appearanceValues.push(appearance)
        this.applyProperties()
    }
    addFont(fontFamily: string): any {
        if (UserSettings.fontFamilyValues.includes(fontFamily)) {
            // ignore
        } else {
            UserSettings.fontFamilyValues.push(fontFamily)
            this.applyProperties()

            if (this.settingsView && oc(this.material).settings.fontFamily(false)) {
                const index = UserSettings.fontFamilyValues.length - 1
                this.fontButtons[index] = HTMLUtilities.findElement(this.settingsView, "#"+fontFamily+"-font") as HTMLButtonElement;
                const button = this.fontButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value = index;
                        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF))
                        this.applyProperties()
                        this.updateFontButtons();
                        this.settingsChangeCallback();
                        event.preventDefault();
                    });
                }
                this.updateFontButtons()
                this.updateViewButtons()
            }
        }
    }

    private async updateUserSettings() {
        var userSettings = {
            fontFamily: UserSettings.fontFamilyValues[await this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value],
            fontSize: this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).value,
            appearance: UserSettings.appearanceValues[await this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value],
            textAlignment: UserSettings.textAlignmentValues[await this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value],
            columnCount: UserSettings.columnCountValues[await this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value],
            wordSpacing: this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).value,
            letterSpacing: this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).value,
            publisherDefault: this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value,
            verticalScroll: UserSettings.scrollValues[await this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value]
        }
        if (this.api && this.api.updateUserSettings) {
            this.api.updateUserSettings(userSettings).then(_ => {
                if (IS_DEV) { console.log("api updated user settings", userSettings) }
            })
        }
    }

    private getUserSettings(): UserProperties {

        var userProperties = new UserProperties()
        // Publisher default system
        userProperties.addSwitchable("readium-advanced-off", "readium-advanced-on", this.publisherDefaults, ReadiumCSS.PUBLISHER_DEFAULT_REF, ReadiumCSS.PUBLISHER_DEFAULT_KEY)
        // Font override
        userProperties.addSwitchable("readium-font-on", "readium-font-off", this.fontOverride, ReadiumCSS.FONT_OVERRIDE_REF, ReadiumCSS.FONT_OVERRIDE_KEY)
        // Column count
        userProperties.addEnumerable(this.columnCount, UserSettings.columnCountValues, ReadiumCSS.COLUMN_COUNT_REF, ReadiumCSS.COLUMN_COUNT_KEY)
        // Appearance
        userProperties.addEnumerable(this.appearance, UserSettings.appearanceValues, ReadiumCSS.APPEARANCE_REF, ReadiumCSS.APPEARANCE_KEY)
        // Page margins
        userProperties.addIncremental(this.pageMargins, 0.5, 4, 0.25, "", ReadiumCSS.PAGE_MARGINS_REF, ReadiumCSS.PAGE_MARGINS_KEY)
        // Text alignment
        userProperties.addEnumerable(this.textAlignment, UserSettings.textAlignmentValues, ReadiumCSS.TEXT_ALIGNMENT_REF, ReadiumCSS.TEXT_ALIGNMENT_KEY)
        // Font family
        userProperties.addEnumerable(this.fontFamily, UserSettings.fontFamilyValues, ReadiumCSS.FONT_FAMILY_REF, ReadiumCSS.FONT_FAMILY_KEY)
        // Font size
        userProperties.addIncremental(this.fontSize, 100, 300, 25, "%", ReadiumCSS.FONT_SIZE_REF, ReadiumCSS.FONT_SIZE_KEY)
        // Line height
        userProperties.addIncremental(this.lineHeight, 1, 2, 0.25, "em", ReadiumCSS.LINE_HEIGHT_REF, ReadiumCSS.LINE_HEIGHT_KEY)
        // Word spacing
        userProperties.addIncremental(this.wordSpacing, 0, 0., 0.25, "rem", ReadiumCSS.WORD_SPACING_REF, ReadiumCSS.WORD_SPACING_KEY)
        // Letter spacing
        userProperties.addIncremental(this.letterSpacing, 0, 0.5, 0.0625, "em", ReadiumCSS.LETTER_SPACING_REF, ReadiumCSS.LETTER_SPACING_KEY)
        // Scroll
        userProperties.addSwitchable("readium-scroll-on", "readium-scroll-off", this.verticalScroll, ReadiumCSS.SCROLL_REF, ReadiumCSS.SCROLL_KEY)

        return userProperties

    }

    private async saveProperty(property: UserProperty): Promise<any> {
        let savedProperties = await this.store.get(this.USERSETTINGS);
        if (savedProperties) {
            let array = JSON.parse(savedProperties);
            array = array.filter((el: any) => el.name !== property.name);
            if (property.value != undefined){
                array.push(property);
            }
            await this.store.set(this.USERSETTINGS, JSON.stringify(array));
        } else {
            let array = new Array();
            array.push(property);
            await this.store.set(this.USERSETTINGS, JSON.stringify(array));
        }
        return new Promise(resolve => resolve(property));
    }

    async getProperty(name: string): Promise<UserProperty> {
        let array = await this.store.get(this.USERSETTINGS);
        if (array) {
            let properties = JSON.parse(array) as Array<UserProperty>;
            properties = properties.filter((el: UserProperty) => el.name === name);
            if (properties.length == 0) {
                return null;
            }
            return properties[0];
        }
        return null;
    }

    async resetUserSettings(): Promise<void> {
        await this.store.remove(this.USERSETTINGS)
        await this.reset()
        this.settingsChangeCallback();
    }

    async currentSettings() {
        var userSettings = {
            appearance: UserSettings.appearanceValues[this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value], //readium-default-on, readium-night-on, readium-sepia-on
            fontFamily: UserSettings.fontFamilyValues[this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value], //Original, serif, sans-serif
            textAlignment: UserSettings.textAlignmentValues[this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value], //"auto", "justify", "start"
            columnCount: UserSettings.columnCountValues[this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value], // "auto", "1", "2"
            verticalScroll: UserSettings.scrollValues[this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value], //readium-scroll-on, readium-scroll-off,
            fontSize: this.fontSize,
            wordSpacing: this.wordSpacing,
            letterSpacing: this.letterSpacing,
            pageMargins: this.pageMargins,
            lineHeight: this.lineHeight
        }
        return userSettings
    }

    async applyUserSettings(userSettings: UserSettings): Promise<void> {

        if (userSettings.appearance) {
            var a: string
            if (userSettings.appearance == 'day' || userSettings.appearance == 'readium-default-on') {
                a = UserSettings.appearanceValues[0]
            } else if (userSettings.appearance == 'sepia' || userSettings.appearance == 'readium-sepia-on') {
                a = UserSettings.appearanceValues[1]
            } else if (userSettings.appearance == 'night' || userSettings.appearance == 'readium-night-on') {
                a = UserSettings.appearanceValues[2]
            } else {
                a = userSettings.appearance
            }
            this.appearance = UserSettings.appearanceValues.findIndex((el: any) => el === a);
            this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value = this.appearance;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF))
        }

        if (userSettings.fontSize) {
            this.fontSize = userSettings.fontSize
            this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).value = this.fontSize;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
        }

        if (userSettings.fontFamily) {
            this.fontFamily = UserSettings.fontFamilyValues.findIndex((el: any) => el === userSettings.fontFamily);
            this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value = this.fontFamily;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF))
        }

        if (userSettings.letterSpacing) {
            this.letterSpacing = userSettings.letterSpacing
            this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).value = this.letterSpacing;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF))
        }

        if (userSettings.wordSpacing) {
            this.wordSpacing = userSettings.wordSpacing
            this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).value = this.wordSpacing;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF))
        }

        if (userSettings.columnCount) {
            this.columnCount = UserSettings.columnCountValues.findIndex((el: any) => el === userSettings.columnCount);
            this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value = this.columnCount;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF))
        }

        if (userSettings.textAlignment) {
            this.textAlignment = UserSettings.textAlignmentValues.findIndex((el: any) => el === userSettings.textAlignment);
            this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value = this.textAlignment;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF))
        }

        if (userSettings.lineHeight) {
            this.lineHeight = userSettings.lineHeight
            this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).value = this.lineHeight;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF))
        }

        if (userSettings.pageMargins) {
            this.pageMargins = userSettings.pageMargins
            this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).value = this.pageMargins;
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF))
        }
        this.applyProperties()
        this.settingsChangeCallback();

        setTimeout(async () => {
            if (userSettings.verticalScroll != undefined) {
                const position = this.reflowable.getCurrentPosition();
                var v: string
                if (userSettings.verticalScroll == 'scroll' || userSettings.verticalScroll == 'readium-scroll-on' || userSettings.verticalScroll == true) {
                    v = UserSettings.scrollValues[0]
                } else if (userSettings.verticalScroll == 'paginated' || userSettings.verticalScroll == 'readium-scroll-off' || userSettings.verticalScroll == false) {
                    v = UserSettings.scrollValues[1]
                } else {
                    v = userSettings.verticalScroll
                }
    
                this.verticalScroll = UserSettings.scrollValues.findIndex((el: any) => el === v);
                this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value = this.verticalScroll;
                this.saveProperty(this.userProperties.getByRef(ReadiumCSS.SCROLL_REF))
                this.applyProperties()
                this.reflowable.setMode(this.verticalScroll === 0);
                this.reflowable.goToPosition(position)
                this.viewChangeCallback();
            }
        }, 10);

    }

    async scroll(scroll: boolean): Promise<void> {
        const position = this.reflowable.getCurrentPosition();
        var v: string
        if (scroll) {
            v = UserSettings.scrollValues[0]
        } else {
            v = UserSettings.scrollValues[1]
        }
        this.verticalScroll = UserSettings.scrollValues.findIndex((el: any) => el === v);
        this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value = this.verticalScroll;
        this.saveProperty(this.userProperties.getByRef(ReadiumCSS.SCROLL_REF))
        this.applyProperties()
        if (oc(this.material).settings.scroll(false)) {
            this.updateViewButtons();
        }
        this.reflowable.setMode(scroll)
        this.reflowable.goToPosition(position)
        this.viewChangeCallback();
    }

    async increase(incremental): Promise<void> {
        if (incremental == 'fontSize') {
            (this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental).increment()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
        } else if (incremental == 'letterSpacing') {
            (this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF) as Incremental).increment()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF))
        } else if (incremental == 'wordSpacing') {
            (this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF) as Incremental).increment()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF))
        } else if (incremental == 'lineHeight') {
            (this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF) as Incremental).increment()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF))
        }
        this.applyProperties()
        this.settingsChangeCallback();
    }

    async decrease(incremental): Promise<void> {
        if (incremental == 'fontSize') {
            (this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental).decrement()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
        } else if (incremental == 'letterSpacing') {
            (this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF) as Incremental).decrement()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF))
        } else if (incremental == 'wordSpacing') {
            (this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF) as Incremental).decrement()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF))
        } else if (incremental == 'lineHeight') {
            (this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF) as Incremental).decrement()
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF))
        }
        this.applyProperties()
        this.settingsChangeCallback();
    }

    async publisher(on): Promise<void> {
        this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = on
        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
        this.applyProperties()
    }
}
