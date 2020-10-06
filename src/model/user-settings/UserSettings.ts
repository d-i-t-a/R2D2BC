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
import ColumnsPaginatedBookView from "../../views/ColumnsPaginatedBookView";
import ScrollingBookView from "../../views/ScrollingBookView";
import BookView from "../../views/BookView";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { IS_DEV } from "../..";
import { addEventListenerOptional } from "../../utils/EventHandler";
import { ReaderUI}  from "../../navigator/IFrameNavigator"
import {oc} from "ts-optchain"

export interface UserSettingsConfig {
    /** Store to save the user's selections in. */
    store: Store,
    initialUserSettings: UserSettings;
    headerMenu: HTMLElement;
    ui: ReaderUI;
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
    verticalScroll: boolean

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

    private readonly store: Store;
    private readonly USERSETTINGS = "userSetting";

    private static appearanceValues = ["readium-default-on", "readium-sepia-on", "readium-night-on"]
    private static fontFamilyValues = ["Original", "serif", "sans-serif"]
    private static readonly textAlignmentValues = ["auto", "justify", "start"]
    private static readonly columnCountValues = ["auto", "1", "2"]

    fontSize = 100.0
    fontOverride = false
    fontFamily = 0
    appearance: any = 0
    verticalScroll = false

    //Advanced settings
    publisherDefaults = true
    textAlignment = 0
    columnCount = 0
    wordSpacing = 0.0
    letterSpacing = 0.0
    pageMargins = 2.0
    lineHeight = 1.0

    userProperties: UserProperties

    // TODO needs more refactor
    paginator = new ColumnsPaginatedBookView();
    scroller = new ScrollingBookView();

    private fontButtons: { [key: string]: HTMLButtonElement };
    private fontSizeButtons: { [key: string]: HTMLButtonElement };
    private themeButtons: { [key: string]: HTMLButtonElement };
    private viewButtons: { [key: string]: HTMLButtonElement };

    private readonly bookViews: BookView[];

    private settingsChangeCallback: () => void = () => { };
    private viewChangeCallback: () => void = () => { };

    private selectedView: BookView;

    private settingsView: HTMLDivElement;
    private headerMenu: HTMLElement;
    private ui: ReaderUI | null = null;
    api: any;

    private iframe: HTMLIFrameElement;

    public static async create(config: UserSettingsConfig): Promise<any> {
        const settings = new this(
            config.store,
            config.headerMenu,
            config.ui,
            config.api
        );

        if (config.initialUserSettings) {
            var initialUserSettings:UserSettings= config.initialUserSettings
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
            if(oc(initialUserSettings.verticalScroll)) {
                settings.verticalScroll = initialUserSettings.verticalScroll;
                if (IS_DEV) console.log(settings.verticalScroll)
                let selectedView = settings.bookViews[0];
                var selectedViewName = 'scrolling-book-view'
                if (settings.verticalScroll) {
                    selectedViewName = 'scrolling-book-view'
                } else {
                    selectedViewName = 'columns-paginated-view'
                }
        
                if (selectedViewName) {
                    for (const bookView of settings.bookViews) {
                        if (bookView.name === selectedViewName) {
                            selectedView = bookView;
                            break;
                        }
                    }
                }
                settings.selectedView = selectedView;
                settings.store.set(ReadiumCSS.SCROLL_KEY, selectedView.name);
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

    protected constructor(store: Store, headerMenu: HTMLElement, ui: ReaderUI, api: any) {
        this.store = store;

        this.bookViews = [this.scroller, this.paginator];

        this.headerMenu = headerMenu;
        this.ui = ui;
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
        this.verticalScroll = false
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
    }

    private async initializeSelections(): Promise<void> {

        if (this.headerMenu) this.settingsView = HTMLUtilities.findElement(this.headerMenu, "#container-view-settings") as HTMLDivElement;

        if (oc(this.ui).settings.scroll) {
            if (this.bookViews.length >= 1) {
                let selectedView = this.bookViews[0];
                const selectedViewName = await this.store.get(ReadiumCSS.SCROLL_KEY);
                if (selectedViewName) {
                    for (const bookView of this.bookViews) {
                        if (bookView.name === selectedViewName) {
                            selectedView = bookView;
                            break;
                        }
                    }
                }
                this.selectedView = selectedView;
            }
        } else {
            let selectedView = this.bookViews[0];
            this.selectedView = selectedView;
        }

    }

    applyProperties(): any {

        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as any;
        const rootElement = document.documentElement;
        const body = HTMLUtilities.findRequiredElement(rootElement, "body") as HTMLBodyElement;

        // Apply publishers default 
        html.style.setProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY, this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).toString());
        // Apply font size 
        html.style.setProperty(ReadiumCSS.FONT_SIZE_KEY, this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).toString());
        // Apply word spacing 
        html.style.setProperty(ReadiumCSS.WORD_SPACING_KEY, this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).toString());
        // Apply letter spacing 
        html.style.setProperty(ReadiumCSS.LETTER_SPACING_KEY, this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).toString());
        // Apply column count 
        html.style.setProperty(ReadiumCSS.COLUMN_COUNT_KEY, this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).toString());
        // Apply text alignment 
        html.style.setProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY, this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).toString());
        // Apply line height 
        html.style.setProperty(ReadiumCSS.LINE_HEIGHT_KEY, this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).toString());
        // Apply page margins 
        html.style.setProperty(ReadiumCSS.PAGE_MARGINS_KEY, this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).toString());

        // Apply appearance 
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

        // Apply font family 
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
        } else { //if (this.userSettings.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value == 3) {
            HTMLUtilities.setAttr(html, "data-viewer-font", this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString());
            html.style.setProperty(ReadiumCSS.FONT_OVERRIDE_KEY, "readium-font-on");
        }

        // Apply scroll (on/off)
        this.getSelectedView().start();

    }

    setIframe(iframe: HTMLIFrameElement) {
        this.iframe = iframe
        this.paginator.iframe = iframe;
        this.scroller.iframe = iframe;
        if (this.settingsView) this.renderControls(this.settingsView);
    }


    private renderControls(element: HTMLElement): void {
        if (oc(this.ui).settings.fontSize) {
            this.fontSizeButtons = {};
            for (const fontSizeName of ["decrease", "increase"]) {
                this.fontSizeButtons[fontSizeName] = HTMLUtilities.findElement(element, "#" + fontSizeName + "-font") as HTMLButtonElement;
            }
        }
        if (oc(this.ui).settings.fontFamily) {
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
        }
        if (oc(this.ui).settings.appearance) {
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
            // remove buttons
            HTMLUtilities.findRequiredElement(element, "#container-view-appearance").remove()
        }

        if (oc(this.ui).settings.scroll) {
            this.viewButtons = {};
            this.viewButtons[0] = HTMLUtilities.findElement(element, "#view-scroll") as HTMLButtonElement;
            this.viewButtons[1] = HTMLUtilities.findElement(element, "#view-paginated") as HTMLButtonElement;
            this.updateViewButtons();
        } else {
            // remove buttons
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

        if (oc(this.ui).settings.fontSize) {
            addEventListenerOptional(this.fontSizeButtons["decrease"], 'click', (event: MouseEvent) => {
                (this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental).decrement()
                this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
                this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
                this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
                this.applyProperties()
                this.settingsChangeCallback();
                event.preventDefault();
            });
            addEventListenerOptional(this.fontSizeButtons["increase"], 'click', (event: MouseEvent) => {
                (this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental).increment()
                this.storeProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
                this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
                this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
                this.applyProperties()
                this.settingsChangeCallback();
                event.preventDefault();
            });
        }

        if (oc(this.ui).settings.fontFamily) {
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

        if (oc(this.ui).settings.appearance) {
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

        if (oc(this.ui).settings.scroll) {
            for (let index = 0; index < this.bookViews.length; index++) {
                const view = this.bookViews[index];
                const button = this.viewButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        const position = this.selectedView.getCurrentPosition();
                        this.selectedView.stop();
                        view.start();
                        view.goToPosition(position)
                        this.selectedView = view;
                        this.updateViewButtons();
                        this.storeSelectedView(view);
                        this.viewChangeCallback();
                        event.preventDefault();
                    });
                }
            }
        }
    }

    private async updateFontButtons(): Promise<void> {
        for (let index = 0; index < UserSettings.fontFamilyValues.length; index++) {
            this.fontButtons[index].className = this.fontButtons[0].className.replace(" active", "")
        }
        if (this.userProperties) {
            if (this.fontButtons[await this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value]) this.fontButtons[await this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value].className += " active"
        }
    }

    private updateViewButtons(): void {
        if (this.viewButtons) {
            this.viewButtons[0].className = this.viewButtons[0].className.replace(" active", "")
            this.viewButtons[1].className = this.viewButtons[1].className.replace(" active", "")
            for (let index = 0; index < this.bookViews.length; index++) {
                const view = this.bookViews[index];
                if (view === this.selectedView) {
                    this.viewButtons[index].className += " active"
                }
            }
        }
    }

    public getSelectedView(): BookView {
        return this.selectedView;
    }

    private async storeProperty(property: UserProperty): Promise<void> {
        this.updateUserSettings()
        this.saveProperty(property)
    }

    private async storeSelectedView(view: BookView): Promise<void> {
        this.updateUserSettings()
        return this.store.set(ReadiumCSS.SCROLL_KEY, view.name);
    }

    addAppearance(appearance: string): any {
        UserSettings.appearanceValues.push(appearance)
        this.applyProperties()
    }
    addFont(fontFamily: string): any {
        UserSettings.fontFamilyValues.push(fontFamily)
        this.applyProperties()

        if (this.settingsView) {
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
            publisherDefault: this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value
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

    // private async initProperties(list: string): Promise<any> {
    //     let savedObj = JSON.parse(list);
    //     await this.store.set(this.USERSETTINGS, JSON.stringify(savedObj));
    //     return new Promise(resolve => resolve(list));
    // }

    private async saveProperty(property: any): Promise<any> {
        let savedProperties = await this.store.get(this.USERSETTINGS);
        if (savedProperties) {
            let array = JSON.parse(savedProperties);
            array = array.filter((el: any) => el.name !== property.name);
            array.push(property);
            await this.store.set(this.USERSETTINGS, JSON.stringify(array));
        } else {
            let array = new Array();
            array.push(property);
            await this.store.set(this.USERSETTINGS, JSON.stringify(array));
        }
        return new Promise(resolve => resolve(property));
    }

    // private async deleteProperty(property: any): Promise<any> {
    //     let array = await this.store.get(this.USERSETTINGS);
    //     if (array) {
    //         let savedObj = JSON.parse(array) as Array<any>;
    //         savedObj = savedObj.filter((el: any) => el.name !== property.name);
    //         await this.store.set(this.USERSETTINGS, JSON.stringify(savedObj));
    //     }
    //     return new Promise(resolve => resolve(property));
    // }

    // private async getProperties(): Promise<any> {
    //     let array = await this.store.get(this.USERSETTINGS);
    //     if (array) {
    //         const properties = JSON.parse(array);
    //         return new Promise(resolve => resolve(properties));
    //     }
    //     return new Promise(resolve => resolve());
    // }

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
        this.applyProperties()
        this.settingsChangeCallback();
    }

    async applyUserSettings(userSettings: UserSettings): Promise<void> {

        if (userSettings.appearance) {
            var appearance
            if (userSettings.appearance == 'day') {
                appearance = UserSettings.appearanceValues[0]
            } else if (userSettings.appearance == 'sepia') {
                appearance = UserSettings.appearanceValues[1]
            } else if (userSettings.appearance == 'night') {
                appearance = UserSettings.appearanceValues[2]
            } else {
                appearance = userSettings.appearance
            }
            this.appearance = UserSettings.appearanceValues.findIndex((el: any) => el === appearance);
            this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value = this.appearance;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.fontSize) {
            this.fontSize = userSettings.fontSize
            this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).value = this.fontSize;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF))
            this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.fontFamily) {
            this.fontFamily = UserSettings.fontFamilyValues.findIndex((el: any) => el === userSettings.fontFamily);
            this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value = this.fontFamily;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.letterSpacing) {
            this.letterSpacing = userSettings.letterSpacing
            this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).value = this.letterSpacing;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF))
            this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.wordSpacing) {
            this.wordSpacing = userSettings.wordSpacing
            this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).value = this.wordSpacing;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF))
            this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.columnCount) {
            this.columnCount = UserSettings.columnCountValues.findIndex((el: any) => el === userSettings.columnCount);
            this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value = this.columnCount;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.textAlignment) {
            this.textAlignment = UserSettings.textAlignmentValues.findIndex((el: any) => el === userSettings.textAlignment);
            this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value = this.textAlignment;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF))
            this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.lineHeight) {
            this.lineHeight = userSettings.lineHeight
            this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).value = this.lineHeight;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF))
            this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
            this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

        if (userSettings.pageMargins) {
            this.pageMargins = userSettings.pageMargins
            this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).value = this.pageMargins;
            await this.saveProperty(this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF))
            this.applyProperties()
            this.settingsChangeCallback();
        }

    }

    async scroll(scroll: boolean): Promise<void> {
        const position = this.selectedView.getCurrentPosition();
        this.selectedView.stop();
        let selectedView = this.bookViews[0];
        var selectedViewName = 'scrolling-book-view'
        if (scroll) {
            selectedViewName = 'scrolling-book-view'
        } else {
            selectedViewName = 'columns-paginated-view'
        }

        if (selectedViewName) {
            for (const bookView of this.bookViews) {
                if (bookView.name === selectedViewName) {
                    selectedView = bookView;
                    break;
                }
            }
        }

        selectedView.start();
        selectedView.goToPosition(position)
        this.selectedView = selectedView;
        this.updateViewButtons();
        this.storeSelectedView(selectedView);
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
        this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
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
        this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = false
        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
        this.applyProperties()
        this.settingsChangeCallback();
    }

    async publisher(on): Promise<void> {
        this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = on
        this.storeProperty(this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF))
        this.applyProperties()
    }
}
