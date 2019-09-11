import BookView from "../../views/BookView";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import Store from "../../store/Store";
import ColumnsPaginatedBookView from "../../views/ColumnsPaginatedBookView";
import ScrollingBookView from "../../views/ScrollingBookView";
import { Enumerable, Incremental, UserSettings, UserSettingsConfig, UserProperty } from "./UserSettings";
import { IS_DEV } from "../..";
import { addEventListenerOptional } from "../../utils/EventHandler";

export interface BookSettingsConfig {
    /** Store to save the user's selections in. */
    store: Store,
    headerMenu: HTMLElement;
    ui: UserSettingsConfig;
    api: any;
}

export default class BookSettings {

    // TODO needs more refactor
    paginator = new ColumnsPaginatedBookView();
    scroller = new ScrollingBookView();

    private readonly store: Store;

    private fontButtons: { [key: string]: HTMLButtonElement };
    private fontSizeButtons: { [key: string]: HTMLButtonElement };
    private themeButtons: { [key: string]: HTMLButtonElement };
    private viewButtons: { [key: string]: HTMLButtonElement };

    private readonly bookViews: BookView[];

    private fontChangeCallback: () => void = () => { };
    private fontSizeChangeCallback: () => void = () => { };
    private themeChangeCallback: () => void = () => { };
    private viewChangeCallback: () => void = () => { };

    private appearanceProperty: Enumerable
    private fontFamilyProperty: Enumerable
    private fontSizeProperty: Incremental
    private textAlignProperty: Enumerable
    private colCountProperty: Enumerable
    private wordSpacingProperty: Incremental
    private letterSpacingProperty: Incremental

    private selectedView: BookView;

    private settingsView: HTMLDivElement;
    private headerMenu: HTMLElement;
    private ui: UserSettingsConfig;
    private api: any;

    private userSettings: UserSettings
    private iframe: HTMLIFrameElement;

    public static async create(config: BookSettingsConfig): Promise<any> {
        const settings = new this(
            config.store,
            config.headerMenu,
            config.ui,
            config.api
        );

        let appearance: Enumerable = await settings.userSettings.getProperty(UserSettings.APPEARANCE_KEY) as Enumerable
        if (appearance) {
            settings.userSettings.appearance = appearance.value
        }
        let fontSize: Incremental = await settings.userSettings.getProperty(UserSettings.FONT_SIZE_KEY) as Incremental
        if (fontSize) {
            settings.userSettings.fontSize = fontSize.value
        }
        let fontFamily: Enumerable = await settings.userSettings.getProperty(UserSettings.FONT_FAMILY_KEY) as Enumerable
        if (fontFamily) {
            settings.userSettings.fontFamily = fontFamily.value
        }

        await settings.initializeSelections();
        return new Promise(resolve => resolve(settings));
    }

    async stop() {
        if (IS_DEV) { console.log("book settings stop") }
    }

    protected constructor(store: Store, headerMenu: HTMLElement, ui: UserSettingsConfig, api: any) {
        this.store = store;

        this.bookViews = [this.scroller, this.paginator];

        this.headerMenu = headerMenu;
        this.ui = ui;
        this.api = api;
        this.userSettings = new UserSettings(store)

        this.appearanceProperty = new Enumerable(this.userSettings.appearance, UserSettings.appearanceValues, UserSettings.APPEARANCE_REF, UserSettings.APPEARANCE_KEY)
        this.fontFamilyProperty = new Enumerable(this.userSettings.fontFamily, UserSettings.fontFamilyValues, UserSettings.FONT_FAMILY_REF, UserSettings.FONT_FAMILY_KEY)
        this.fontSizeProperty = new Incremental(this.userSettings.fontSize, 100, 300, 25, "%", UserSettings.FONT_SIZE_REF, UserSettings.FONT_SIZE_KEY)
       
        this.textAlignProperty = new Enumerable(this.userSettings.textAlignment, UserSettings.textAlignmentValues, UserSettings.TEXT_ALIGNMENT_REF, UserSettings.TEXT_ALIGNMENT_KEY)
        this.colCountProperty = new Enumerable(this.userSettings.columnCount, UserSettings.columnCountValues, UserSettings.COLUMN_COUNT_REF, UserSettings.COLUMN_COUNT_KEY)
        this.wordSpacingProperty = new Incremental(this.userSettings.wordSpacing, 0, 0.5, 0.25, "rem", UserSettings.WORD_SPACING_REF, UserSettings.WORD_SPACING_KEY)
        this.letterSpacingProperty = new Incremental(this.userSettings.letterSpacing,  0, 0.5, 0.0625, "em", UserSettings.LETTER_SPACING_REF, UserSettings.LETTER_SPACING_KEY)

    }

    applyProperties(): any {

        const html = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "html") as any;
        const rootElement = document.documentElement;
        const body = HTMLUtilities.findRequiredElement(rootElement, "body") as HTMLBodyElement;

        // Apply fontsize 
        html.style.setProperty(UserSettings.FONT_SIZE_KEY, this.fontSizeProperty.toString());

        // Apply appearance 
        html.style.setProperty(UserSettings.APPEARANCE_KEY, this.appearanceProperty.toString());
        if (this.appearanceProperty.value == 0) {
            HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
            HTMLUtilities.setAttr(body, "data-viewer-theme", "day");
        } else if (this.appearanceProperty.value == 1) {
            HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "sepia");
            HTMLUtilities.setAttr(body, "data-viewer-theme", "sepia");
        } else if (this.appearanceProperty.value == 2) {
            HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "night");
            HTMLUtilities.setAttr(body, "data-viewer-theme", "night");
        }

        // Apply fontfamily 
        html.style.setProperty(UserSettings.FONT_FAMILY_KEY, this.fontFamilyProperty.toString());
        if (this.fontFamilyProperty.value == 0) {
            HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
            html.style.setProperty(UserSettings.FONT_OVERRIDE_KEY, "readium-font-off");
        } else if (this.fontFamilyProperty.value == 1) {
            HTMLUtilities.setAttr(html, "data-viewer-font", "serif");
            html.style.setProperty(UserSettings.FONT_OVERRIDE_KEY, "readium-font-on");
        } else if (this.fontFamilyProperty.value == 2) {
            HTMLUtilities.setAttr(html, "data-viewer-font", "sans");
            html.style.setProperty(UserSettings.FONT_OVERRIDE_KEY, "readium-font-on");
        } else if (this.fontFamilyProperty.value == 3) {
            HTMLUtilities.setAttr(html, "data-viewer-font", "opendyslexic");
            html.style.setProperty(UserSettings.FONT_OVERRIDE_KEY, "readium-font-on");
        }

        // Apply scroll (on/off)
        this.getSelectedView().start();

    }

    setIframe(iframe: HTMLIFrameElement) {
        this.iframe = iframe
        this.paginator.iframe = iframe;
        this.scroller.iframe = iframe;
        this.renderControls(this.settingsView);
    }

    private async initializeSelections(): Promise<void> {

        this.settingsView = HTMLUtilities.findElement(this.headerMenu, "#container-view-settings") as HTMLDivElement;

        if (this.ui.fontFamily) {
            let property = await this.userSettings.getProperty(UserSettings.FONT_FAMILY_KEY) as Enumerable
            if (!property) {
                property = this.fontFamilyProperty
            }
            this.fontFamilyProperty.value = property.value;
        } else {
            this.fontFamilyProperty.value = 0;
        }

        if (this.ui.fontSize) {
            let property = await this.userSettings.getProperty(UserSettings.FONT_SIZE_KEY) as Incremental
            if (!property) {
                property = this.fontSizeProperty
            }
            this.fontSizeProperty.value = property.value;
        } else {
            this.fontSizeProperty.value = 100;
        }

        if (this.ui.appearance) {
            let property = await this.userSettings.getProperty(UserSettings.APPEARANCE_KEY) as Enumerable
            if (!property) {
                property = this.appearanceProperty
            }
            this.appearanceProperty.value = property.value;
        } else {
            this.appearanceProperty.value = 0;
        }

        if (this.ui.scroll) {
            if (this.bookViews.length >= 1) {
                let selectedView = this.bookViews[0];
                const selectedViewName = await this.store.get(UserSettings.SCROLL_KEY);
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

    public renderControls(element: HTMLElement): void {
        if (this.ui.fontSize) {
            this.fontSizeButtons = {};
            for (const fontSizeName of ["decrease", "increase"]) {
                this.fontSizeButtons[fontSizeName] = HTMLUtilities.findRequiredElement(element, "#" + fontSizeName + "-font") as HTMLButtonElement;
            }
            this.updateFontSizeButtons();
        }
        if (this.ui.fontFamily) {
            this.fontButtons = {};
            this.fontButtons[0] = HTMLUtilities.findRequiredElement(element, "#publisher-font") as HTMLButtonElement;
            this.fontButtons[1] = HTMLUtilities.findRequiredElement(element, "#serif-font") as HTMLButtonElement;
            this.fontButtons[2] = HTMLUtilities.findRequiredElement(element, "#sans-font") as HTMLButtonElement;
            this.fontButtons[3] = HTMLUtilities.findRequiredElement(element, "#opendyslexic-font") as HTMLButtonElement;
            this.updateFontButtons();
        }
        if (this.ui.appearance) {
            this.themeButtons = {};
            this.themeButtons[0] = HTMLUtilities.findRequiredElement(element, "#day-theme") as HTMLButtonElement;
            this.themeButtons[1] = HTMLUtilities.findRequiredElement(element, "#sepia-theme") as HTMLButtonElement;
            this.themeButtons[2] = HTMLUtilities.findRequiredElement(element, "#night-theme") as HTMLButtonElement;
            this.updateThemeButtons();
        } else {
            // remove buttons
            HTMLUtilities.findRequiredElement(element, "#container-view-appearance").remove()
        }

        if (this.ui.scroll) {
            this.viewButtons = {};
            this.viewButtons[0] = HTMLUtilities.findRequiredElement(element, "#view-scroll") as HTMLButtonElement;
            this.viewButtons[1] = HTMLUtilities.findRequiredElement(element, "#view-paginated") as HTMLButtonElement;
            this.updateViewButtons();
        } else {
            // remove buttons
            HTMLUtilities.findElement(element, "#container-view-scroll") ? HTMLUtilities.findElement(element, "#container-view-scroll").remove() : null
        }


        this.setupEvents();

        // Clicking the settings view outside the ul hides it, but clicking inside the ul keeps it up.
        addEventListenerOptional(HTMLUtilities.findRequiredElement(element, "ul"), 'click', (event: Event) => {
            event.stopPropagation();
        });
    }

    public onFontChange(callback: () => void) {
        this.fontChangeCallback = callback;
    }

    public onFontSizeChange(callback: () => void) {
        this.fontSizeChangeCallback = callback;
    }

    public onThemeChange(callback: () => void) {
        this.themeChangeCallback = callback;
    }

    public onViewChange(callback: () => void) {
        this.viewChangeCallback = callback;
    }

    private async setupEvents(): Promise<void> {

        if (this.ui.fontSize) {
            addEventListenerOptional(this.fontSizeButtons["decrease"], 'click', (event: MouseEvent) => {
                this.fontSizeProperty.decrement()
                this.storeProperty(this.fontSizeProperty)
                this.applyProperties()
                this.fontSizeChangeCallback();
                this.updateFontSizeButtons();
                event.preventDefault();
            });
            addEventListenerOptional(this.fontSizeButtons["increase"], 'click', (event: MouseEvent) => {
                this.fontSizeProperty.increment()
                this.storeProperty(this.fontSizeProperty)
                this.applyProperties()
                this.fontSizeChangeCallback();
                this.updateFontSizeButtons();
                event.preventDefault();
            });
        }

        if (this.ui.fontFamily) {
            for (let index = 0; index < UserSettings.fontFamilyValues.length; index++) {
                const button = this.fontButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        this.fontFamilyProperty.value = index;
                        this.storeProperty(this.fontFamilyProperty)
                        this.applyProperties()
                        this.updateFontButtons();
                        this.fontChangeCallback();
                        event.preventDefault();
                    });
                }
            }
        }

        if (this.ui.appearance) {
            for (let index = 0; index < UserSettings.appearanceValues.length; index++) {
                const button = this.themeButtons[index];
                if (button) {
                    addEventListenerOptional(button, 'click', (event: MouseEvent) => {
                        this.appearanceProperty.value = index;
                        this.storeProperty(this.appearanceProperty)
                        this.applyProperties()
                        this.updateThemeButtons();
                        this.themeChangeCallback();
                        event.preventDefault();
                    });
                }
            }
        }

        if (this.ui.scroll) {
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

    private updateFontSizeButtons(): void {
        // do nothing
    }

    private updateFontButtons(): void {
        this.fontButtons[0].className = this.fontButtons[0].className.replace(" active", "")
        this.fontButtons[1].className = this.fontButtons[1].className.replace(" active", "")
        this.fontButtons[2].className = this.fontButtons[2].className.replace(" active", "")
        this.fontButtons[3].className = this.fontButtons[3].className.replace(" active", "")
        this.fontButtons[this.fontFamilyProperty.value].className += " active"
    }

    private async updateThemeButtons(): Promise<void> {
        // do nothing
    }

    private updateViewButtons(): void {
        this.viewButtons[0].className = this.viewButtons[0].className.replace(" active", "")
        this.viewButtons[1].className = this.viewButtons[1].className.replace(" active", "")
        for (let index = 0; index < this.bookViews.length; index++) {
            const view = this.bookViews[index];
            if (view === this.selectedView) {
                this.viewButtons[index].className += " active"
            }
        }
    }

    public getSelectedView(): BookView {
        return this.selectedView;
    }

    private async storeProperty(property: UserProperty): Promise<void> {
        this.updateUserSettings()
        this.userSettings.saveProperty(property)
    }

    private async storeSelectedView(view: BookView): Promise<void> {
        this.updateUserSettings()
        return this.store.set(UserSettings.SCROLL_KEY, view.name);
    }

    private updateUserSettings() {
        var userSettings = {
            fontFamily:UserSettings.fontFamilyValues[this.fontFamilyProperty.value],
            fontSize:this.fontSizeProperty.value,
            appearance:UserSettings.appearanceValues[this.appearanceProperty.value],
            textAlignment:UserSettings.textAlignmentValues[this.textAlignProperty.value],
            columnCount:UserSettings.columnCountValues[this.colCountProperty.value],
            wordSpacing:this.wordSpacingProperty.value,
            letterSpacing:this.letterSpacingProperty.value,
        }
        this.api.updateUserSettings(userSettings).then(_ => {
            if (IS_DEV) {console.log("api updated user settings", userSettings )}
        })

    }

};
