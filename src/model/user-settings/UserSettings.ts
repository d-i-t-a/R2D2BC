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
import {
  Enumerable,
  Incremental,
  Switchable,
  UserProperties,
  UserProperty,
} from "./UserProperties";
import { ReadiumCSS } from "./ReadiumCSS";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { IS_DEV } from "../..";
import { addEventListenerOptional } from "../../utils/EventHandler";
import {
  Injectable,
  NavigatorAPI,
  ReaderUI,
} from "../../navigator/IFrameNavigator";
import ReflowableBookView from "../../views/ReflowableBookView";
import FixedBookView from "../../views/FixedBookView";
import BookView from "../../views/BookView";

export interface UserSettingsConfig {
  /** Store to save the user's selections in. */
  store: Store;
  initialUserSettings: InitialUserSettings;
  headerMenu: HTMLElement;
  material: ReaderUI;
  api: NavigatorAPI;
  injectables: Array<Injectable>;
  layout: string;
}
export interface UserSettingsUIConfig {
  fontSize?: boolean;
  fontFamily?: boolean;
  fontOverride: boolean;
  appearance?: boolean;
  scroll?: boolean;
  // advancedSettings: boolean;
  textAlign?: boolean;
  colCount?: boolean;
  wordSpacing?: boolean;
  letterSpacing?: boolean;
  pageMargins: boolean;
  lineHeight: boolean;
}

/**
 * The shape of the UserSettings class.
 */
export interface IUserSettings {
  fontSize: number;
  fontOverride: boolean;
  fontFamily: number;
  appearance: any;
  verticalScroll: boolean;

  //Advanced settings
  // publisherDefaults: boolean;
  textAlignment: number;
  columnCount: number;
  wordSpacing: number;
  letterSpacing: number;
  pageMargins: number;
  lineHeight: number;
}

/**
 * The settings that someone might pass in when instantiating
 * the reader. Differs from the internal settings values for
 * backwards compatibility.
 */
export interface InitialUserSettings {
  fontSize: number;
  fontOverride?: boolean | "readium-font-on" | "readium-font-off";
  fontFamily: number;
  appearance: any;
  verticalScroll?:
    | boolean
    | "readium-scroll-on"
    | "readium-scroll-off"
    | "scroll"
    | "paginated";

  //Advanced settings
  // publisherDefaults?: boolean | "readium-advanced-on" | "readium-advanced-off";
  textAlignment: number;
  columnCount: number;
  wordSpacing: number;
  letterSpacing: number;
  pageMargins: number;
  lineHeight: number;
}

export class UserSettings implements IUserSettings {
  async isPaginated() {
    let scroll = await this.getPropertyAndFallback<Switchable>(
      "verticalScroll",
      ReadiumCSS.SCROLL_KEY
    );

    return scroll === false;
  }
  async isScrollMode() {
    return !(await this.isPaginated());
  }

  private readonly store: Store;
  private readonly USERSETTINGS = "userSetting";

  private static appearanceValues = [
    "readium-default-on",
    "readium-sepia-on",
    "readium-night-on",
  ];
  private static fontFamilyValues = ["Original", "serif", "sans-serif"];
  private static readonly textAlignmentValues = ["auto", "justify", "start"];
  private static readonly columnCountValues = ["auto", "1", "2"];

  fontSize = 100.0;
  fontOverride = false;
  fontFamily = 0;
  appearance: any = 0;
  verticalScroll = true;

  //Advanced settings
  // publisherDefaults = true;
  textAlignment = 0;
  columnCount = 0;
  wordSpacing = 0.0;
  letterSpacing = 0.0;
  pageMargins = 2.0;
  lineHeight = 1.0;

  userProperties: UserProperties;

  view: BookView;

  private settingsChangeCallback: () => void = () => {};
  private settingsColumnsChangeCallback: () => void = () => {};
  private viewChangeCallback: () => void = () => {};

  private settingsView: HTMLDivElement;
  private readonly headerMenu: HTMLElement;
  api: NavigatorAPI;
  injectables: Array<Injectable>;

  private iframe: HTMLIFrameElement;

  public static async create(config: UserSettingsConfig): Promise<any> {
    const settings = new this(
      config.store,
      config.headerMenu,
      config.api,
      config.injectables,
      config.layout
    );
    await settings.initialise();

    if (config.initialUserSettings) {
      let initialUserSettings = config.initialUserSettings;
      if (initialUserSettings.verticalScroll !== undefined) {
        settings.verticalScroll = this.parseScrollSetting(
          initialUserSettings.verticalScroll
        );
        settings.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value =
          settings.verticalScroll;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.SCROLL_REF)
        );
        if (IS_DEV) console.log(settings.verticalScroll);
      }
      if (initialUserSettings.appearance) {
        settings.appearance = UserSettings.appearanceValues.findIndex(
          (el: any) => el === initialUserSettings.appearance
        );
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF)
        );
        if (IS_DEV) console.log(settings.appearance);
      }
      if (initialUserSettings.fontSize) {
        settings.fontSize = initialUserSettings.fontSize;
        settings.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).value =
          settings.fontSize;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF)
        );
        if (IS_DEV) console.log(settings.fontSize);
      }
      if (initialUserSettings.fontFamily) {
        settings.fontFamily = UserSettings.fontFamilyValues.findIndex(
          (el: any) => el === initialUserSettings.fontFamily
        );
        settings.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value =
          settings.fontFamily;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF)
        );
        if (IS_DEV) console.log(settings.fontFamily);
        if (settings.fontFamily !== 0) {
          settings.fontOverride = true;
        }
      }
      if (initialUserSettings.textAlignment) {
        settings.textAlignment = UserSettings.textAlignmentValues.findIndex(
          (el: any) => el === initialUserSettings.textAlignment
        );
        settings.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value =
          settings.textAlignment;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
        );
        // settings.publisherDefaults = false;
        if (IS_DEV) console.log(settings.textAlignment);
      }
      if (initialUserSettings.columnCount) {
        settings.columnCount = UserSettings.columnCountValues.findIndex(
          (el: any) => el === initialUserSettings.columnCount
        );
        settings.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value =
          settings.columnCount;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF)
        );
        if (IS_DEV) console.log(settings.columnCount);
      }
      if (initialUserSettings.wordSpacing) {
        settings.wordSpacing = initialUserSettings.wordSpacing;
        settings.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).value =
          settings.wordSpacing;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF)
        );
        // settings.publisherDefaults = false;
        if (IS_DEV) console.log(settings.wordSpacing);
      }
      if (initialUserSettings.letterSpacing) {
        settings.letterSpacing = initialUserSettings.letterSpacing;
        settings.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).value =
          settings.letterSpacing;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF)
        );
        // settings.publisherDefaults = false;
        if (IS_DEV) console.log(settings.letterSpacing);
      }
      if (initialUserSettings.pageMargins) {
        settings.pageMargins = initialUserSettings.pageMargins;
        settings.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).value =
          settings.pageMargins;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF)
        );
        // settings.publisherDefaults = false;
        if (IS_DEV) console.log(settings.pageMargins);
      }
      if (initialUserSettings.lineHeight) {
        settings.lineHeight = initialUserSettings.lineHeight;
        settings.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).value =
          settings.lineHeight;
        await settings.saveProperty(
          settings.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF)
        );
        // settings.publisherDefaults = false;
        if (IS_DEV) console.log(settings.lineHeight);
      }
      settings.userProperties = settings.getUserSettings();
      await settings.initialise();
    }
    await settings.initializeSelections();
    return new Promise((resolve) => resolve(settings));
  }

  protected constructor(
    store: Store,
    headerMenu: HTMLElement,
    api: NavigatorAPI,
    injectables: Array<Injectable>,
    layout: string
  ) {
    this.store = store;

    this.view =
      layout === "fixed"
        ? new FixedBookView(this.store)
        : new ReflowableBookView(this.store);

    this.headerMenu = headerMenu;
    this.api = api;
    this.injectables = injectables;

    this.injectables.forEach((injectable) => {
      if (injectable.type === "style") {
        if (injectable.fontFamily) {
          this.addFont(injectable.fontFamily);
        }
        if (injectable.appearance) {
          this.addAppearance(injectable.appearance);
        }
      }
    });
  }

  async stop() {
    if (IS_DEV) {
      console.log("book settings stop");
    }
  }

  private async initialise() {
    this.appearance = await this.getPropertyAndFallback<Enumerable>(
      "appearance",
      ReadiumCSS.APPEARANCE_KEY
    );

    this.verticalScroll = await this.getPropertyAndFallback<Switchable>(
      "verticalScroll",
      ReadiumCSS.SCROLL_KEY
    );
    this.fontFamily = await this.getPropertyAndFallback<Enumerable>(
      "fontFamily",
      ReadiumCSS.FONT_FAMILY_KEY
    );

    if (this.fontFamily !== 0) {
      this.fontOverride = true;
    }
    // this.publisherDefaults =
    //   (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY)) != null
    //     ? ((await this.getProperty(
    //         ReadiumCSS.PUBLISHER_DEFAULT_KEY
    //       )) as Switchable).value
    //     : this.publisherDefaults;
    this.textAlignment = await this.getPropertyAndFallback<Enumerable>(
      "textAlignment",
      ReadiumCSS.TEXT_ALIGNMENT_KEY
    );
    this.columnCount = await this.getPropertyAndFallback<Enumerable>(
      "columnCount",
      ReadiumCSS.COLUMN_COUNT_KEY
    );

    this.fontSize = await this.getPropertyAndFallback<Incremental>(
      "fontSize",
      ReadiumCSS.FONT_SIZE_KEY
    );

    this.wordSpacing = await this.getPropertyAndFallback<Incremental>(
      "wordSpacing",
      ReadiumCSS.WORD_SPACING_KEY
    );
    this.letterSpacing = await this.getPropertyAndFallback<Incremental>(
      "letterSpacing",
      ReadiumCSS.LETTER_SPACING_KEY
    );
    this.pageMargins = await this.getPropertyAndFallback<Incremental>(
      "pageMargins",
      ReadiumCSS.PAGE_MARGINS_KEY
    );
    this.lineHeight = await this.getPropertyAndFallback<Incremental>(
      "lineHeight",
      ReadiumCSS.LINE_HEIGHT_KEY
    );
  }

  private async reset() {
    this.appearance = 0;
    this.verticalScroll = true;
    this.fontSize = 100.0;
    this.fontOverride = false;
    this.fontFamily = 0;

    //Advanced settings
    // this.publisherDefaults = true;
    this.textAlignment = 0;
    this.columnCount = 0;
    this.wordSpacing = 0.0;
    this.letterSpacing = 0.0;
    this.pageMargins = 2.0;
    this.lineHeight = 1.0;

    this.userProperties = this.getUserSettings();

    const html = HTMLUtilities.findRequiredIframeElement(
      this.iframe.contentDocument,
      "html"
    ) as any;
    const rootElement = document.documentElement;
    const body = HTMLUtilities.findRequiredElement(
      rootElement,
      "body"
    ) as HTMLBodyElement;

    // // Apply publishers default
    // html.style.removeProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY);
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

  // TODO not really needed
  private async initializeSelections(): Promise<void> {
    if (this.headerMenu)
      this.settingsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-settings"
      ) as HTMLDivElement;
  }

  async applyProperties(): Promise<any> {
    this.userProperties = this.getUserSettings();
    const html = HTMLUtilities.findRequiredIframeElement(
      this.iframe.contentDocument,
      "html"
    ) as any;
    const rootElement = document.documentElement;
    const body = HTMLUtilities.findRequiredElement(
      rootElement,
      "body"
    ) as HTMLBodyElement;
    if (
      (this.view.delegate.publication.Metadata.Rendition?.Layout ??
        "unknown") !== "fixed"
    ) {
      // Apply font size
      if (await this.getProperty(ReadiumCSS.FONT_SIZE_KEY)) {
        html.style.setProperty(
          ReadiumCSS.FONT_SIZE_KEY,
          this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).toString()
        );
      }
      // Apply word spacing
      if (await this.getProperty(ReadiumCSS.WORD_SPACING_KEY)) {
        // html.style.setProperty(
        //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
        //   "readium-advanced-on"
        // );
        html.style.setProperty(
          ReadiumCSS.WORD_SPACING_KEY,
          this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).toString()
        );
      }
      // Apply letter spacing
      if (await this.getProperty(ReadiumCSS.LETTER_SPACING_KEY)) {
        // html.style.setProperty(
        //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
        //   "readium-advanced-on"
        // );
        html.style.setProperty(
          ReadiumCSS.LETTER_SPACING_KEY,
          this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).toString()
        );
      }
    }
    // Apply column count
    if (await this.getProperty(ReadiumCSS.COLUMN_COUNT_KEY)) {
      html.style.setProperty(
        ReadiumCSS.COLUMN_COUNT_KEY,
        this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).toString()
      );
    }
    if (
      (this.view.delegate.publication.Metadata.Rendition?.Layout ??
        "unknown") !== "fixed"
    ) {
      // Apply text alignment
      if (await this.getProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY)) {
        if (
          this.userProperties
            .getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
            .toString() === "auto"
        ) {
          html.style.removeProperty(ReadiumCSS.TEXT_ALIGNMENT_KEY);
        } else {
          // html.style.setProperty(
          //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
          //   "readium-advanced-on"
          // );
          html.style.setProperty(
            ReadiumCSS.TEXT_ALIGNMENT_KEY,
            this.userProperties
              .getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
              .toString()
          );
        }
      }

      // Apply line height
      if (await this.getProperty(ReadiumCSS.LINE_HEIGHT_KEY)) {
        // html.style.setProperty(
        //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
        //   "readium-advanced-on"
        // );
        html.style.setProperty(
          ReadiumCSS.LINE_HEIGHT_KEY,
          this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).toString()
        );
      }
      // Apply page margins
      if (await this.getProperty(ReadiumCSS.PAGE_MARGINS_KEY)) {
        // html.style.setProperty(
        //   ReadiumCSS.PUBLISHER_DEFAULT_KEY,
        //   "readium-advanced-on"
        // );
        html.style.setProperty(
          ReadiumCSS.PAGE_MARGINS_KEY,
          this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).toString()
        );
      }
    }

    // Apply appearance
    if (await this.getProperty(ReadiumCSS.APPEARANCE_KEY)) {
      html.style.setProperty(
        ReadiumCSS.APPEARANCE_KEY,
        this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).toString()
      );
      if (this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value === 0) {
        HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
        HTMLUtilities.setAttr(body, "data-viewer-theme", "day");
      } else if (
        this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value === 1
      ) {
        HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "sepia");
        HTMLUtilities.setAttr(body, "data-viewer-theme", "sepia");
      } else if (
        this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value === 2
      ) {
        HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "night");
        HTMLUtilities.setAttr(body, "data-viewer-theme", "night");
      }
    } else {
      html.style.setProperty(
        ReadiumCSS.APPEARANCE_KEY,
        this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).toString()
      );
      HTMLUtilities.setAttr(rootElement, "data-viewer-theme", "day");
      HTMLUtilities.setAttr(body, "data-viewer-theme", "day");
    }
    if (
      (this.view.delegate.publication.Metadata.Rendition?.Layout ??
        "unknown") !== "fixed"
    ) {
      // Apply font family
      if (await this.getProperty(ReadiumCSS.FONT_FAMILY_KEY)) {
        html.style.setProperty(
          ReadiumCSS.FONT_FAMILY_KEY,
          this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString()
        );
        if (
          this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value === 0
        ) {
          HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
          html.style.setProperty(
            ReadiumCSS.FONT_OVERRIDE_KEY,
            "readium-font-off"
          );
        } else if (
          this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value === 1
        ) {
          HTMLUtilities.setAttr(html, "data-viewer-font", "serif");
          html.style.setProperty(
            ReadiumCSS.FONT_OVERRIDE_KEY,
            "readium-font-on"
          );
        } else if (
          this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value === 2
        ) {
          HTMLUtilities.setAttr(html, "data-viewer-font", "sans");
          html.style.setProperty(
            ReadiumCSS.FONT_OVERRIDE_KEY,
            "readium-font-on"
          );
        } else {
          HTMLUtilities.setAttr(
            html,
            "data-viewer-font",
            this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString()
          );
          html.style.setProperty(
            ReadiumCSS.FONT_OVERRIDE_KEY,
            "readium-font-on"
          );
        }
      } else {
        html.style.setProperty(
          ReadiumCSS.FONT_FAMILY_KEY,
          this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).toString()
        );
        HTMLUtilities.setAttr(html, "data-viewer-font", "publisher");
        html.style.setProperty(
          ReadiumCSS.FONT_OVERRIDE_KEY,
          "readium-font-off"
        );
      }

      if (await this.getProperty(ReadiumCSS.SCROLL_KEY)) {
        if (
          this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value === true
        ) {
          html.style.setProperty("--USER__scroll", "readium-scroll-on");
        } else {
          html.style.setProperty("--USER__scroll", "readium-scroll-off");
        }
      } else {
        html.style.setProperty("--USER__scroll", "readium-scroll-on");
      }

      // Apply publishers default
      // if (await this.getProperty(ReadiumCSS.PUBLISHER_DEFAULT_KEY)) {
      //   if (
      //     this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF)
      //       .value === true
      //   ) {
      //     html.style.setProperty(
      //       "--USER__advancedSettings",
      //       "readium-advanced-off"
      //     );
      //   } else {
      html.style.setProperty("--USER__advancedSettings", "readium-advanced-on");
      // }
      // } else {
      //   html.style.setProperty(
      //     "--USER__advancedSettings",
      //     "readium-advanced-off"
      //   );
      // }

      this.isScrollMode().then((scroll) => {
        this.view.setMode(scroll);
      });
    }
  }

  setIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    this.view.iframe = iframe;
    if (this.settingsView) this.renderControls(this.settingsView);
  }

  private renderControls(element: HTMLElement): void {
    // Clicking the settings view outside the ul hides it, but clicking inside the ul keeps it up.
    addEventListenerOptional(
      HTMLUtilities.findElement(element, "ul"),
      "click",
      (event: Event) => {
        event.stopPropagation();
      }
    );
  }

  public onSettingsChange(callback: () => void) {
    this.settingsChangeCallback = callback;
  }
  public onColumnSettingsChange(callback: () => void) {
    this.settingsColumnsChangeCallback = callback;
  }

  public onViewChange(callback: () => void) {
    this.viewChangeCallback = callback;
  }

  private async storeProperty(property: UserProperty): Promise<void> {
    await this.updateUserSettings();
    await this.saveProperty(property);
  }

  addAppearance(appearance: string): any {
    if (!UserSettings.appearanceValues.includes(appearance)) {
      UserSettings.appearanceValues.push(appearance);
    }
  }

  initAddedAppearance(): any {
    this.applyProperties();
  }

  addFont(fontFamily: string): any {
    if (!UserSettings.fontFamilyValues.includes(fontFamily)) {
      UserSettings.fontFamilyValues.push(fontFamily);
    }
  }

  initAddedFont(): any {
    this.applyProperties();
  }

  private async updateUserSettings() {
    let userSettings = {
      fontFamily:
        UserSettings.fontFamilyValues[
          await this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value
        ],
      fontSize: this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).value,
      appearance:
        UserSettings.appearanceValues[
          await this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value
        ],
      textAlignment:
        UserSettings.textAlignmentValues[
          await this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
            .value
        ],
      columnCount:
        UserSettings.columnCountValues[
          await this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value
        ],
      wordSpacing: this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF)
        .value,
      letterSpacing: this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF)
        .value,
      // publisherDefault: this.userProperties.getByRef(
      //   ReadiumCSS.PUBLISHER_DEFAULT_REF
      // ).value,
      verticalScroll: this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value,
    };
    if (this.api?.updateSettings) {
      this.api?.updateSettings(userSettings).then((_) => {
        if (IS_DEV) {
          console.log("api updated user settings", userSettings);
        }
      });
    }
  }

  private getUserSettings(): UserProperties {
    let userProperties = new UserProperties();
    // Publisher default system
    // userProperties.addSwitchable(
    //   "readium-advanced-off",
    //   "readium-advanced-on",
    //   this.publisherDefaults,
    //   ReadiumCSS.PUBLISHER_DEFAULT_REF,
    //   ReadiumCSS.PUBLISHER_DEFAULT_KEY
    // );
    // Font override
    userProperties.addSwitchable(
      "readium-font-on",
      "readium-font-off",
      this.fontOverride,
      ReadiumCSS.FONT_OVERRIDE_REF,
      ReadiumCSS.FONT_OVERRIDE_KEY
    );
    // Column count
    userProperties.addEnumerable(
      this.columnCount,
      UserSettings.columnCountValues,
      ReadiumCSS.COLUMN_COUNT_REF,
      ReadiumCSS.COLUMN_COUNT_KEY
    );
    // Appearance
    userProperties.addEnumerable(
      this.appearance,
      UserSettings.appearanceValues,
      ReadiumCSS.APPEARANCE_REF,
      ReadiumCSS.APPEARANCE_KEY
    );
    // Page margins
    userProperties.addIncremental(
      this.pageMargins,
      0.5,
      4,
      0.25,
      "",
      ReadiumCSS.PAGE_MARGINS_REF,
      ReadiumCSS.PAGE_MARGINS_KEY
    );
    // Text alignment
    userProperties.addEnumerable(
      this.textAlignment,
      UserSettings.textAlignmentValues,
      ReadiumCSS.TEXT_ALIGNMENT_REF,
      ReadiumCSS.TEXT_ALIGNMENT_KEY
    );
    // Font family
    userProperties.addEnumerable(
      this.fontFamily,
      UserSettings.fontFamilyValues,
      ReadiumCSS.FONT_FAMILY_REF,
      ReadiumCSS.FONT_FAMILY_KEY
    );
    // Font size
    userProperties.addIncremental(
      this.fontSize,
      100,
      300,
      25,
      "%",
      ReadiumCSS.FONT_SIZE_REF,
      ReadiumCSS.FONT_SIZE_KEY
    );
    // Line height
    userProperties.addIncremental(
      this.lineHeight,
      1,
      2,
      0.25,
      "em",
      ReadiumCSS.LINE_HEIGHT_REF,
      ReadiumCSS.LINE_HEIGHT_KEY
    );
    // Word spacing
    userProperties.addIncremental(
      this.wordSpacing,
      0,
      1,
      0.25,
      "rem",
      ReadiumCSS.WORD_SPACING_REF,
      ReadiumCSS.WORD_SPACING_KEY
    );
    // Letter spacing
    userProperties.addIncremental(
      this.letterSpacing,
      0,
      0.5,
      0.0625,
      "em",
      ReadiumCSS.LETTER_SPACING_REF,
      ReadiumCSS.LETTER_SPACING_KEY
    );
    // Scroll
    userProperties.addSwitchable(
      "readium-scroll-on",
      "readium-scroll-off",
      this.verticalScroll,
      ReadiumCSS.SCROLL_REF,
      ReadiumCSS.SCROLL_KEY
    );

    return userProperties;
  }

  private async saveProperty(property: UserProperty): Promise<any> {
    let savedProperties = await this.store.get(this.USERSETTINGS);
    if (savedProperties) {
      let array = JSON.parse(savedProperties);
      array = array.filter((el: any) => el.name !== property.name);
      if (property.value !== undefined) {
        array.push(property);
      }
      await this.store.set(this.USERSETTINGS, JSON.stringify(array));
    } else {
      let array = [];
      array.push(property);
      await this.store.set(this.USERSETTINGS, JSON.stringify(array));
    }
    return new Promise((resolve) => resolve(property));
  }

  async getProperty<T extends UserProperty = UserProperty>(
    name: string
  ): Promise<T | null> {
    let array = await this.store.get(this.USERSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return null;
      }
      return properties[0] as T | null;
    }
    return null;
  }

  /**
   * If the property doesn't exist in the store, will fall back to the value on this
   */
  async getPropertyAndFallback<T extends UserProperty = UserProperty>(
    name: keyof this,
    key: string
  ): Promise<T["value"]> {
    return (await this.getProperty(key))?.value ?? this[name];
  }

  async resetUserSettings(): Promise<void> {
    await this.store.remove(this.USERSETTINGS);
    await this.reset();
    this.settingsChangeCallback();
  }

  async currentSettings() {
    return {
      appearance:
        UserSettings.appearanceValues[
          this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value
        ], //readium-default-on, readium-night-on, readium-sepia-on
      fontFamily:
        UserSettings.fontFamilyValues[
          this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value
        ], //Original, serif, sans-serif
      textAlignment:
        UserSettings.textAlignmentValues[
          this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value
        ], //"auto", "justify", "start"
      columnCount:
        UserSettings.columnCountValues[
          this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value
        ], // "auto", "1", "2"
      verticalScroll: this.verticalScroll,
      fontSize: this.fontSize,
      wordSpacing: this.wordSpacing,
      letterSpacing: this.letterSpacing,
      pageMargins: this.pageMargins,
      lineHeight: this.lineHeight,
    };
  }

  async applyUserSettings(userSettings: UserSettings): Promise<void> {
    if (userSettings.appearance) {
      let a: string;
      if (
        userSettings.appearance === "day" ||
        userSettings.appearance === "readium-default-on"
      ) {
        a = UserSettings.appearanceValues[0];
      } else if (
        userSettings.appearance === "sepia" ||
        userSettings.appearance === "readium-sepia-on"
      ) {
        a = UserSettings.appearanceValues[1];
      } else if (
        userSettings.appearance === "night" ||
        userSettings.appearance === "readium-night-on"
      ) {
        a = UserSettings.appearanceValues[2];
      } else {
        a = userSettings.appearance;
      }
      this.appearance = UserSettings.appearanceValues.findIndex(
        (el: any) => el === a
      );
      this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF).value =
        this.appearance;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.APPEARANCE_REF)
      );
    }

    if (userSettings.fontSize) {
      this.fontSize = userSettings.fontSize;
      this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF).value =
        this.fontSize;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF)
      );
    }

    if (userSettings.fontFamily) {
      this.fontFamily = UserSettings.fontFamilyValues.findIndex(
        (el: any) => el === userSettings.fontFamily
      );
      this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF).value =
        this.fontFamily;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.FONT_FAMILY_REF)
      );
    }

    if (userSettings.letterSpacing) {
      this.letterSpacing = userSettings.letterSpacing;
      this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF).value =
        this.letterSpacing;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF)
      );
    }

    if (userSettings.wordSpacing) {
      this.wordSpacing = userSettings.wordSpacing;
      this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF).value =
        this.wordSpacing;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF)
      );
    }

    if (userSettings.columnCount) {
      this.columnCount = UserSettings.columnCountValues.findIndex(
        (el: any) => el === userSettings.columnCount
      );
      this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF).value =
        this.columnCount;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.COLUMN_COUNT_REF)
      );
      this.settingsColumnsChangeCallback();
    }

    if (userSettings.textAlignment) {
      this.textAlignment = UserSettings.textAlignmentValues.findIndex(
        (el: any) => el === userSettings.textAlignment
      );
      this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF).value =
        this.textAlignment;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.TEXT_ALIGNMENT_REF)
      );
    }

    if (userSettings.lineHeight) {
      this.lineHeight = userSettings.lineHeight;
      this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF).value =
        this.lineHeight;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF)
      );
    }

    if (userSettings.pageMargins) {
      // await this.enableAdvancedSettings();
      this.pageMargins = userSettings.pageMargins;
      this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF).value =
        this.pageMargins;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.PAGE_MARGINS_REF)
      );
    }
    await this.applyProperties();
    this.settingsChangeCallback();

    setTimeout(async () => {
      if (userSettings.verticalScroll !== undefined) {
        const position = this.view.getCurrentPosition();
        this.verticalScroll = UserSettings.parseScrollSetting(
          userSettings.verticalScroll
        );
        this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value =
          this.verticalScroll;
        await this.saveProperty(
          this.userProperties.getByRef(ReadiumCSS.SCROLL_REF)
        );
        await this.applyProperties();
        this.view.setMode(this.verticalScroll);
        this.view.goToPosition(position);
        this.viewChangeCallback();
      }
    }, 10);
  }

  /**
   * Parses a scroll setting from a variety of inputs to a simple boolean
   */
  private static parseScrollSetting(
    inputSetting: InitialUserSettings["verticalScroll"]
  ): boolean {
    switch (inputSetting) {
      case true:
      case "scroll":
      case "readium-scroll-on":
        return true;
      case false:
      case "paginated":
      case "readium-scroll-off":
        return false;
    }
  }

  async scroll(scroll: boolean): Promise<void> {
    const position = this.view.getCurrentPosition();
    this.verticalScroll = scroll;
    this.userProperties.getByRef(ReadiumCSS.SCROLL_REF).value =
      this.verticalScroll;
    await this.storeProperty(
      this.userProperties.getByRef(ReadiumCSS.SCROLL_REF)
    );
    await this.applyProperties();
    // if (this.material?.settings.scroll) {
    //   this.updateViewButtons();
    // }
    this.view.setMode(this.verticalScroll);
    this.view.goToPosition(position);
    this.viewChangeCallback();
  }

  async increase(incremental): Promise<void> {
    if (incremental === "fontSize") {
      (
        this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental
      ).increment();
      this.fontSize = this.userProperties.getByRef(
        ReadiumCSS.FONT_SIZE_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF)
      );
    } else if (incremental === "letterSpacing") {
      (
        this.userProperties.getByRef(
          ReadiumCSS.LETTER_SPACING_REF
        ) as Incremental
      ).increment();
      this.letterSpacing = this.userProperties.getByRef(
        ReadiumCSS.LETTER_SPACING_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF)
      );
    } else if (incremental === "wordSpacing") {
      (
        this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF) as Incremental
      ).increment();
      this.wordSpacing = this.userProperties.getByRef(
        ReadiumCSS.WORD_SPACING_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF)
      );
    } else if (incremental === "lineHeight") {
      (
        this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF) as Incremental
      ).increment();
      this.lineHeight = this.userProperties.getByRef(
        ReadiumCSS.LINE_HEIGHT_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF)
      );
    }
    await this.applyProperties();
    this.settingsChangeCallback();
  }

  async decrease(incremental): Promise<void> {
    if (incremental === "fontSize") {
      (
        this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF) as Incremental
      ).decrement();
      this.fontSize = this.userProperties.getByRef(
        ReadiumCSS.FONT_SIZE_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.FONT_SIZE_REF)
      );
    } else if (incremental === "letterSpacing") {
      (
        this.userProperties.getByRef(
          ReadiumCSS.LETTER_SPACING_REF
        ) as Incremental
      ).decrement();
      this.letterSpacing = this.userProperties.getByRef(
        ReadiumCSS.LETTER_SPACING_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.LETTER_SPACING_REF)
      );
    } else if (incremental === "wordSpacing") {
      (
        this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF) as Incremental
      ).decrement();
      this.wordSpacing = this.userProperties.getByRef(
        ReadiumCSS.WORD_SPACING_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.WORD_SPACING_REF)
      );
    } else if (incremental === "lineHeight") {
      (
        this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF) as Incremental
      ).decrement();
      this.wordSpacing = this.userProperties.getByRef(
        ReadiumCSS.LINE_HEIGHT_REF
      ).value;
      await this.storeProperty(
        this.userProperties.getByRef(ReadiumCSS.LINE_HEIGHT_REF)
      );
    }
    await this.applyProperties();
    this.settingsChangeCallback();
  }

  // async publisher(on): Promise<void> {
  //   this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF).value = on;
  //   this.storeProperty(
  //     this.userProperties.getByRef(ReadiumCSS.PUBLISHER_DEFAULT_REF)
  //   );
  //   this.applyProperties();
  // }
}
