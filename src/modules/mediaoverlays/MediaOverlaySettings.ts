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

import { addEventListenerOptional } from "../../utils/EventHandler";
import {
  MediaOverlayModuleAPI,
  MediaOverlayModuleProperties,
} from "./MediaOverlayModule";
import log from "loglevel";

export const R2_MO_CLASS_ACTIVE = "r2-mo-active";

export class MEDIAOVERLAYREFS {
  static readonly COLOR_REF = "color";
  static readonly AUTO_SCROLL_REF = "autoscroll";
  static readonly AUTO_TURN_REF = "autoturn";
  static readonly VOLUME_REF = "volume";
  static readonly RATE_REF = "rate";

  static readonly COLOR_KEY = "mediaoverlay-" + MEDIAOVERLAYREFS.COLOR_REF;
  static readonly AUTO_SCROLL_KEY =
    "mediaoverlay-" + MEDIAOVERLAYREFS.AUTO_SCROLL_REF;
  static readonly AUTO_TURN_KEY =
    "mediaoverlay-" + MEDIAOVERLAYREFS.AUTO_TURN_REF;
  static readonly VOLUME_KEY = "mediaoverlay-" + MEDIAOVERLAYREFS.VOLUME_REF;
  static readonly RATE_KEY = "mediaoverlay-" + MEDIAOVERLAYREFS.RATE_REF;
}

export interface MediaOverlayConfig {
  store: Store;
  initialMediaOverlaySettings?: MediaOverlayModuleProperties;
  headerMenu?: HTMLElement | null;
  api?: MediaOverlayModuleAPI;
}

export interface IMediaOverlayUserSettings {
  color?: string;
  autoScroll?: boolean;
  autoTurn?: boolean;
  volume?: number;
  rate?: number;
  playing?: boolean;
  wait?: number;
}

export type MediaOverlayIncrementable = "mo_volume" | "mo_rate";

export class MediaOverlaySettings implements IMediaOverlayUserSettings {
  private readonly store: Store;
  private readonly MEDIAOVERLAYSETTINGS = "mediaOverlaySetting";

  color = "r2-mo-active";
  autoScroll = true;
  autoTurn = true;
  volume = 1.0;
  rate = 1.0;
  playing = false;
  resourceReady = false;
  wait = 1;

  userProperties: UserProperties;

  private settingsChangeCallback: (key?: string) => void = () => {};

  private settingsView: HTMLDivElement;
  private readonly headerMenu?: HTMLElement | null;

  private speechAutoScroll: HTMLInputElement;
  private speechAutoTurn: HTMLInputElement;
  private speechVolume: HTMLInputElement;
  private speechRate: HTMLInputElement;

  private readonly api?: MediaOverlayModuleAPI;

  public static create(config: MediaOverlayConfig): any {
    const settings = new this(config.store, config.api, config.headerMenu);

    if (config.initialMediaOverlaySettings) {
      let initialSettings = config.initialMediaOverlaySettings;
      if (initialSettings?.color) {
        settings.color = initialSettings.color;
        log.log(settings.color);
      }
      if (initialSettings?.autoScroll) {
        settings.autoScroll = initialSettings.autoScroll;
        log.log(settings.autoScroll);
      }
      if (initialSettings?.autoTurn) {
        settings.autoTurn = initialSettings.autoTurn;
        log.log(settings.autoScroll);
      }
      if (initialSettings?.volume) {
        settings.volume = initialSettings.volume;
        log.log(settings.volume);
      }
      if (initialSettings?.rate) {
        settings.rate = initialSettings.rate;
        log.log(settings.rate);
      }
      if (initialSettings?.wait) {
        settings.wait = initialSettings.wait;
        log.log(settings.wait);
      }
    }

    settings.initializeSelections();
    return settings;
  }

  protected constructor(
    store: Store,
    api?: MediaOverlayModuleAPI,
    headerMenu?: HTMLElement | null
  ) {
    this.store = store;
    this.api = api;
    this.headerMenu = headerMenu;
    this.initialise();
    log.log(this.api);
  }

  stop() {
    log.log("MediaOverlay settings stop");
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

    this.rate =
      this.getProperty(MEDIAOVERLAYREFS.RATE_KEY) != null
        ? (this.getProperty(MEDIAOVERLAYREFS.RATE_KEY) as Incremental).value
        : this.rate;

    this.userProperties = this.getMediaOverlaySettings();
  }

  private reset() {
    this.color = "redtext";
    this.autoScroll = true;
    this.autoTurn = true;
    this.volume = 1.0;
    this.rate = 1.0;
    this.wait = 1;

    this.userProperties = this.getMediaOverlaySettings();
  }

  private initializeSelections() {
    if (this.headerMenu)
      this.settingsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-mediaoverlay-settings"
      );
  }

  setControls() {
    if (this.settingsView) this.renderControls(this.settingsView);
  }

  private renderControls(element: HTMLElement) {
    if (this.headerMenu)
      this.speechAutoTurn = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayAutoTurn"
      );

    if (this.headerMenu)
      this.speechAutoScroll = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayAutoScroll"
      );

    if (this.headerMenu)
      this.speechVolume = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayVolume"
      );

    if (this.headerMenu)
      this.speechRate = HTMLUtilities.findElement(
        this.headerMenu,
        "#mediaOverlayRate"
      );

    if (this.speechAutoScroll) this.speechAutoScroll.checked = this.autoScroll;
    if (this.speechAutoTurn) this.speechAutoTurn.checked = this.autoTurn;
    if (this.speechVolume) this.speechVolume.value = this.volume.toString();
    if (this.speechRate) this.speechRate.value = this.volume.toString();

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
      color: this.userProperties.getByRef(MEDIAOVERLAYREFS.COLOR_REF)?.value,
      autoScroll: this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_SCROLL_REF)
        ?.value,
      autoTurn: this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_TURN_REF)
        ?.value,
      volume: this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF)?.value,
      rate: this.userProperties.getByRef(MEDIAOVERLAYREFS.RATE_REF)?.value,
    };
    this.applyMediaOverlaySettings(syncSettings);
    if (this.api?.updateSettings) {
      this.api?.updateSettings(syncSettings).then(async (settings) => {
        log.log("api updated sync settings", settings);
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
    userProperties.addIncremental(
      this.rate,
      0.1,
      3,
      0.1,
      "",
      MEDIAOVERLAYREFS.RATE_REF,
      MEDIAOVERLAYREFS.RATE_KEY
    );

    return userProperties;
  }

  private saveProperty(property: UserProperty): UserProperty {
    let savedProperties = this.store.get(this.MEDIAOVERLAYSETTINGS);
    if (savedProperties) {
      let array = JSON.parse(savedProperties);
      array = array.filter((el: any) => el.name !== property.name);
      array.push(property);
      this.store.set(this.MEDIAOVERLAYSETTINGS, JSON.stringify(array));
    } else {
      let array: UserProperty[] = [];
      array.push(property);
      this.store.set(this.MEDIAOVERLAYSETTINGS, JSON.stringify(array));
    }
    return property;
  }

  getProperty(name: string): UserProperty | null {
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
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.COLOR_REF);
      if (prop) {
        prop.value = this.color;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.autoScroll !== undefined) {
      log.log("autoScroll " + this.autoScroll);
      this.autoScroll = mediaOverlaySettings.autoScroll;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_SCROLL_REF);
      if (prop) {
        prop.value = this.autoScroll;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.autoTurn !== undefined) {
      log.log("autoTurn " + this.autoTurn);
      this.autoTurn = mediaOverlaySettings.autoTurn;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_TURN_REF);
      if (prop) {
        prop.value = this.autoTurn;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.volume) {
      log.log("volume " + this.volume);
      this.volume = mediaOverlaySettings.volume;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF);
      if (prop) {
        prop.value = this.volume;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
    if (mediaOverlaySettings.rate) {
      log.log("rate " + this.rate);
      this.rate = mediaOverlaySettings.rate;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.RATE_REF);
      if (prop) {
        prop.value = this.rate;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
  }

  applyMediaOverlaySetting(key: any, value: any) {
    if (key === MEDIAOVERLAYREFS.COLOR_REF) {
      this.color = value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.COLOR_REF);
      if (prop) {
        prop.value = this.color;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    } else if (key === MEDIAOVERLAYREFS.AUTO_SCROLL_REF) {
      this.autoScroll = value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_SCROLL_REF);
      if (prop) {
        prop.value = this.autoScroll;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    } else if (key === MEDIAOVERLAYREFS.AUTO_TURN_REF) {
      this.autoTurn = value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.AUTO_TURN_REF);
      if (prop) {
        prop.value = this.autoTurn;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
  }
  increase(incremental: MediaOverlayIncrementable) {
    if (incremental === "mo_volume") {
      (
        this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF) as Incremental
      ).increment();
      this.volume = this.userProperties.getByRef(
        MEDIAOVERLAYREFS.VOLUME_REF
      )?.value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
    } else if (incremental === "mo_rate") {
      (
        this.userProperties.getByRef(MEDIAOVERLAYREFS.RATE_REF) as Incremental
      ).increment();
      this.rate = this.userProperties.getByRef(
        MEDIAOVERLAYREFS.RATE_REF
      )?.value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.RATE_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
    }
  }

  decrease(incremental: MediaOverlayIncrementable) {
    if (incremental === "mo_volume") {
      (
        this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF) as Incremental
      ).decrement();
      this.volume = this.userProperties.getByRef(
        MEDIAOVERLAYREFS.VOLUME_REF
      )?.value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.VOLUME_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
    } else if (incremental === "mo_rate") {
      (
        this.userProperties.getByRef(MEDIAOVERLAYREFS.RATE_REF) as Incremental
      ).decrement();
      this.rate = this.userProperties.getByRef(
        MEDIAOVERLAYREFS.RATE_REF
      )?.value;
      let prop = this.userProperties.getByRef(MEDIAOVERLAYREFS.RATE_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
    }
  }
}
