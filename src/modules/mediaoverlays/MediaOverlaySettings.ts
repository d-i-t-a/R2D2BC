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
 * Developed on behalf of: Bibliotheca LLC
 * Licensed to: Bibliotheca LLC under one or more contributor license agreements.
 */

import Store from "../../store/Store";
import {
  UserProperty,
  UserProperties,
  Stringable,
  Switchable,
  Incremental,
} from "../../model/user-settings/UserProperties";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { IS_DEV } from "../../utils";
import { addEventListenerOptional } from "../../utils/EventHandler";
import {
  MediaOverlayModuleAPI,
  MediaOverlayModuleProperties,
} from "./MediaOverlayModule";

export const R2_MO_CLASS_ACTIVE = "r2-mo-active";

export class MEDIAOVERLAYREFS {
  static readonly COLOR_REF = "color";
  static readonly AUTO_SCROLL_REF = "autoscroll";
  static readonly AUTO_TURN_REF = "autoturn";
  static readonly VOLUME_REF = "volume";

  static readonly COLOR_KEY = "mediaoverlay-" + MEDIAOVERLAYREFS.COLOR_REF;
  static readonly AUTO_SCROLL_KEY =
    "mediaoverlay-" + MEDIAOVERLAYREFS.AUTO_SCROLL_REF;
  static readonly AUTO_TURN_KEY =
    "mediaoverlay-" + MEDIAOVERLAYREFS.AUTO_TURN_REF;
  static readonly VOLUME_KEY = "mediaoverlay-" + MEDIAOVERLAYREFS.VOLUME_REF;
}

export interface MediaOverlayConfig {
  store: Store;
  initialMediaOverlaySettings: MediaOverlayModuleProperties;
  headerMenu: HTMLElement;
  api: MediaOverlayModuleAPI;
}

export interface IMediaOverlayUserSettings {
  color?: string;
  autoScroll?: boolean;
  autoTurn?: boolean;
  volume?: number;
  playing?: boolean;
  wait?: number;
}

export type MediaOverlayIncrementable = "mo_volume";

export class MediaOverlaySettings implements IMediaOverlayUserSettings {
  private readonly store: Store;
  private readonly MEDIAOVERLAYSETTINGS = "mediaOverlaySetting";

  color = "r2-mo-active";
  autoScroll = true;
  autoTurn = true;
  volume = 1.0;
  playing = false;
  wait = 1;

  userProperties: UserProperties;

  private settingsChangeCallback: (key?: string) => void = () => {};

  private settingsView: HTMLDivElement;
  private readonly headerMenu: HTMLElement;

  private speechAutoScroll: HTMLInputElement;
  private speechAutoTurn: HTMLInputElement;
  private speechVolume: HTMLInputElement;

  private readonly api: MediaOverlayModuleAPI;

  public static create(config: MediaOverlayConfig): any {
    const settings = new this(config.store, config.headerMenu, config.api);

    if (config.initialMediaOverlaySettings) {
      let initialSettings = config.initialMediaOverlaySettings;
      if (initialSettings?.color) {
        settings.color = initialSettings.color;
        if (IS_DEV) console.log(settings.color);
      }
      if (initialSettings?.autoScroll) {
        settings.autoScroll = initialSettings.autoScroll;
        if (IS_DEV) console.log(settings.autoScroll);
      }
      if (initialSettings?.autoTurn) {
        settings.autoTurn = initialSettings.autoTurn;
        if (IS_DEV) console.log(settings.autoTurn);
      }
      if (initialSettings?.volume) {
        settings.volume = initialSettings.volume;
        if (IS_DEV) console.log(settings.volume);
      }
      if (initialSettings?.wait) {
        settings.wait = initialSettings.wait;
        if (IS_DEV) console.log(settings.wait);
      }
    }

    settings.initializeSelections();
    return settings;
  }

  protected constructor(
    store: Store,
    headerMenu: HTMLElement,
    api: MediaOverlayModuleAPI
  ) {
    this.store = store;
    this.api = api;
    this.headerMenu = headerMenu;
    this.initialise();
    console.log(this.api);
  }

  stop() {
    if (IS_DEV) {
      console.log("MediaOverlay settings stop");
    }
  }

  private initialise() {
    this.autoScroll =
      this.getProperty(MEDIAOVERLAYREFS.AUTO_SCROLL_KEY) != null
        ? (this.getProperty(MEDIAOVERLAYREFS.AUTO_SCROLL_KEY) as Switchable)
            .value
        : this.autoScroll;

    this.autoTurn =
      this.getProperty(MEDIAOVERLAYREFS.AUTO_TURN_KEY) != null
        ? (this.getProperty(MEDIAOVERLAYREFS.AUTO_TURN_KEY) as Switchable).value
        : this.autoTurn;

    this.color =
      this.getProperty(MEDIAOVERLAYREFS.COLOR_KEY) != null
        ? (this.getProperty(MEDIAOVERLAYREFS.COLOR_KEY) as Stringable).value
        : this.color;

    this.volume =
      this.getProperty(MEDIAOVERLAYREFS.VOLUME_KEY) != null
        ? (this.getProperty(MEDIAOVERLAYREFS.VOLUME_KEY) as Incremental).value
        : this.volume;

    this.userProperties = this.getMediaOverlaySettings();
  }

  private reset() {
    this.color = "redtext";
    this.autoScroll = true;
    this.autoTurn = true;
    this.volume = 1.0;
    this.wait = 1;

    this.userProperties = this.getMediaOverlaySettings();
  }

  private initializeSelections() {
    if (this.headerMenu)
      this.settingsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-mediaoverlay-settings"
      ) as HTMLDivElement;
  }

  setControls() {
    if (this.settingsView) this.renderControls(this.settingsView);
  }

  private renderControls(element: HTMLElement) {
    if (this.headerMenu)
      this.speechAutoTurn = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayAutoTurn"
      ) as HTMLInputElement;

    if (this.headerMenu)
      this.speechAutoScroll = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayAutoScroll"
      ) as HTMLInputElement;

    if (this.headerMenu)
      this.speechVolume = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayVolume"
      ) as HTMLInputElement;


    if (this.speechAutoScroll) this.speechAutoScroll.checked = this.autoScroll;
    if (this.speechAutoTurn) this.speechAutoTurn.checked = this.autoTurn;
    if (this.speechVolume) this.speechVolume.value = this.volume.toString();

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

  private storeProperty(property: UserProperty) {
    this.updateUserSettings();
    this.saveProperty(property);
  }

  private updateUserSettings() {
    let syncSettings: IMediaOverlayUserSettings = {
      color: this.userProperties.getByRef(MEDIAOVERLAYREFS.COLOR_REF).value,
      autoScroll: this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_SCROLL_REF)
        .value,
      autoTurn: this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_TURN_REF)
        .value,
      volume: this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF).value,
    };
    this.applyMediaOverlaySettings(syncSettings);
    if (this.api?.updateSettings) {
      this.api?.updateSettings(syncSettings).then(async (settings) => {
        if (IS_DEV) {
          console.log("api updated sync settings", settings);
        }
      });
    }
  }

  private getMediaOverlaySettings(): UserProperties {
    let userProperties = new UserProperties();

    userProperties.addSwitchable(
      "mediaoverlay-auto-scroll-off",
      "mediaoverlay-auto-scroll-on",
      this.autoScroll,
      MEDIAOVERLAYREFS.AUTO_SCROLL_REF,
      MEDIAOVERLAYREFS.AUTO_SCROLL_KEY
    );
    userProperties.addSwitchable(
      "mediaoverlay-auto-turn-off",
      "mediaoverlay-auto-turn-on",
      this.autoTurn,
      MEDIAOVERLAYREFS.AUTO_TURN_REF,
      MEDIAOVERLAYREFS.AUTO_TURN_KEY
    );
    userProperties.addStringable(
      this.color,
      MEDIAOVERLAYREFS.COLOR_REF,
      MEDIAOVERLAYREFS.COLOR_KEY
    );
    userProperties.addIncremental(
      this.volume,
      0.1,
      1,
      0.1,
      "",
      MEDIAOVERLAYREFS.VOLUME_REF,
      MEDIAOVERLAYREFS.VOLUME_KEY
    );

    return userProperties;
  }

  private saveProperty(property: any): any {
    let savedProperties = this.store.get(this.MEDIAOVERLAYSETTINGS);
    if (savedProperties) {
      let array = JSON.parse(savedProperties);
      array = array.filter((el: any) => el.name !== property.name);
      array.push(property);
      this.store.set(this.MEDIAOVERLAYSETTINGS, JSON.stringify(array));
    } else {
      let array = [];
      array.push(property);
      this.store.set(this.MEDIAOVERLAYSETTINGS, JSON.stringify(array));
    }
    return property;
  }

  getProperty(name: string): UserProperty {
    let array = this.store.get(this.MEDIAOVERLAYSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return null;
      }
      return properties[0];
    }
    return null;
  }

  resetMediaOverlaySettings() {
    this.store.remove(this.MEDIAOVERLAYSETTINGS);
    this.reset();
    this.settingsChangeCallback();
  }

  applyMediaOverlaySettings(mediaOverlaySettings: IMediaOverlayUserSettings) {
    if (mediaOverlaySettings.color) {
      this.color = mediaOverlaySettings.color;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.COLOR_REF
      ).value = this.color;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.COLOR_REF)
      );
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.autoScroll !== undefined) {
      if (IS_DEV) console.log("autoScroll " + this.autoScroll);
      this.autoScroll = mediaOverlaySettings.autoScroll;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.AUTO_SCROLL_REF
      ).value = this.autoScroll;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_SCROLL_REF)
      );
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.autoTurn !== undefined) {
      if (IS_DEV) console.log("autoTurn " + this.autoTurn);
      this.autoTurn = mediaOverlaySettings.autoTurn;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.AUTO_TURN_REF
      ).value = this.autoTurn;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_TURN_REF)
      );
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.volume) {
      if (IS_DEV) console.log("volume " + this.volume);
      this.volume = mediaOverlaySettings.volume;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.VOLUME_REF
      ).value = this.volume;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF)
      );
      this.settingsChangeCallback();
    }
  }

  applyMediaOverlaySetting(key: any, value: any) {
    if (key === MEDIAOVERLAYREFS.COLOR_REF) {
      this.color = value;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.COLOR_REF
      ).value = this.color;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.COLOR_REF)
      );
      this.settingsChangeCallback();
    } else if (key === MEDIAOVERLAYREFS.AUTO_SCROLL_REF) {
      this.autoScroll = value;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.AUTO_SCROLL_REF
      ).value = this.autoScroll;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_SCROLL_REF)
      );
      this.settingsChangeCallback();
    } else if (key === MEDIAOVERLAYREFS.AUTO_TURN_REF) {
      this.autoTurn = value;
      this.userProperties.getByRef(
        MEDIAOVERLAYREFS.AUTO_TURN_REF
      ).value = this.autoTurn;
      this.saveProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_TURN_REF)
      );
      this.settingsChangeCallback();
    }
  }
  increase(incremental: MediaOverlayIncrementable) {
    if (incremental === "mo_volume") {
      (this.userProperties.getByRef(
        MEDIAOVERLAYREFS.VOLUME_REF
      ) as Incremental).increment();
      this.storeProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF)
      );
      this.settingsChangeCallback();
    }
  }

  decrease(incremental: MediaOverlayIncrementable) {
    if (incremental === "mo_volume") {
      (this.userProperties.getByRef(
        MEDIAOVERLAYREFS.VOLUME_REF
      ) as Incremental).decrement();
      this.storeProperty(
        this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF)
      );
      this.settingsChangeCallback();
    }
  }
}
