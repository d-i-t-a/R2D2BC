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
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: CAST under one or more contributor license agreements.
 */

import Store from "../../store/Store";
import {
  UserProperty,
  UserProperties,
  Stringable,
  Switchable,
  Incremental,
  JSONable,
} from "../../model/user-settings/UserProperties";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { ReaderRights } from "../../navigator/IFrameNavigator";
import { TextHighlighter } from "../highlight/TextHighlighter";
import { addEventListenerOptional } from "../../utils/EventHandler";
import log from "loglevel";

export interface TTSModuleAPI {
  started: any;
  stopped: any;
  paused: any;
  resumed: any;
  finished: any;
  updateSettings: any;
}
export interface TTSModuleProperties {
  color?: string;
  autoScroll?: boolean;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: TTSVoice;
  hideLayer?: boolean;
}

export interface TTSModuleConfig extends TTSModuleProperties {
  rights: Partial<ReaderRights>;
  tts: TTSSettings;
  highlighter: TextHighlighter;
  headerMenu?: HTMLElement | null;
  api?: TTSModuleAPI;
}

export class TTSREFS {
  static readonly COLOR_REF = "color";
  static readonly AUTO_SCROLL_REF = "autoscroll";
  static readonly RATE_REF = "rate";
  static readonly PITCH_REF = "pitch";
  static readonly VOLUME_REF = "volume";
  static readonly VOICE_REF = "voice";

  static readonly COLOR_KEY = "tts-" + TTSREFS.COLOR_REF;
  static readonly AUTO_SCROLL_KEY = "tts-" + TTSREFS.AUTO_SCROLL_REF;
  static readonly RATE_KEY = "tts-" + TTSREFS.RATE_REF;
  static readonly PITCH_KEY = "tts-" + TTSREFS.PITCH_REF;
  static readonly VOLUME_KEY = "tts-" + TTSREFS.VOLUME_REF;
  static readonly VOICE_KEY = "tts-" + TTSREFS.VOICE_REF;
}

export interface TTSSettingsConfig {
  store: Store;
  initialTTSSettings?: TTSModuleProperties;
  headerMenu?: HTMLElement | null;
  api?: TTSModuleAPI;
}

export interface TTSVoice {
  usePublication: boolean;
  name?: string;
  lang?: string;
}

export interface ITTSUserSettings {
  enableSplitter?: boolean;
  color?: string;
  autoScroll?: boolean;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: TTSVoice;
}

export type TTSIncrementable = "pitch" | "rate" | "volume";

export class TTSSettings implements ITTSUserSettings {
  private readonly store: Store;
  private readonly TTSSETTINGS = "ttsSetting";

  color = "orange";
  autoScroll = true;
  rate = 1.0;
  pitch = 1.0;
  volume = 1.0;

  voice: TTSVoice = {
    usePublication: true,
  };

  userProperties: UserProperties;

  private settingsChangeCallback: (key?: string) => void = () => {};
  private restartCallback: (key?: string) => void = () => {};

  private settingsView: HTMLDivElement;
  private readonly headerMenu?: HTMLElement | null;
  private speechRate: HTMLInputElement;
  private speechPitch: HTMLInputElement;
  private speechVolume: HTMLInputElement;
  private speechAutoScroll: HTMLInputElement;

  private readonly api?: TTSModuleAPI;

  public static create(config: TTSSettingsConfig) {
    const settings = new this(config.store, config.api, config.headerMenu);

    if (config.initialTTSSettings) {
      let initialTTSSettings = config.initialTTSSettings;

      if (initialTTSSettings?.rate) {
        settings.rate = initialTTSSettings.rate;
        log.log(settings.rate);
      }
      if (initialTTSSettings?.pitch) {
        settings.pitch = initialTTSSettings.pitch;
        log.log(settings.pitch);
      }
      if (initialTTSSettings?.volume) {
        settings.volume = initialTTSSettings.volume;
        log.log(settings.volume);
      }
      if (initialTTSSettings?.color) {
        settings.color = initialTTSSettings.color;
        log.log(settings.color);
      }
      if (initialTTSSettings?.autoScroll) {
        settings.autoScroll = initialTTSSettings.autoScroll;
        log.log(settings.autoScroll);
      }
      if (initialTTSSettings?.voice) {
        settings.voice = initialTTSSettings.voice;
        log.log(settings.voice);
      }
    }

    settings.initializeSelections();
    return settings;
  }

  protected constructor(
    store: Store,
    api?: TTSModuleAPI,
    headerMenu?: HTMLElement | null
  ) {
    this.store = store;
    this.api = api;
    this.headerMenu = headerMenu;
    this.initialise();
  }

  enableSplitter?: boolean;

  stop() {
    log.log("tts settings stop");
  }

  private initialise() {
    this.autoScroll =
      this.getProperty(TTSREFS.AUTO_SCROLL_KEY) != null
        ? (this.getProperty(TTSREFS.AUTO_SCROLL_KEY) as Switchable).value
        : this.autoScroll;

    this.rate =
      this.getProperty(TTSREFS.RATE_KEY) != null
        ? (this.getProperty(TTSREFS.RATE_KEY) as Incremental).value
        : this.rate;
    this.pitch =
      this.getProperty(TTSREFS.PITCH_KEY) != null
        ? (this.getProperty(TTSREFS.PITCH_KEY) as Incremental).value
        : this.pitch;
    this.volume =
      this.getProperty(TTSREFS.VOLUME_KEY) != null
        ? (this.getProperty(TTSREFS.VOLUME_KEY) as Incremental).value
        : this.volume;

    this.color =
      this.getProperty(TTSREFS.COLOR_KEY) != null
        ? (this.getProperty(TTSREFS.COLOR_KEY) as Stringable).value
        : this.color;
    this.voice =
      this.getProperty(TTSREFS.VOICE_REF) != null
        ? (this.getProperty(TTSREFS.VOICE_REF) as JSONable).value
        : this.voice;

    this.userProperties = this.getTTSSettings();
  }

  private reset() {
    this.color = "orange";
    this.autoScroll = true;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;

    this.voice = {
      usePublication: true,
    };

    this.userProperties = this.getTTSSettings();
  }

  private initializeSelections() {
    if (this.headerMenu)
      this.settingsView = HTMLUtilities.findElement(
        this.headerMenu,
        "#container-view-tts-settings"
      );
  }

  setControls() {
    if (this.settingsView) this.renderControls(this.settingsView);
  }

  private renderControls(element: HTMLElement): void {
    if (this.headerMenu)
      this.speechRate = HTMLUtilities.findElement(
        this.headerMenu,
        "#speechRate"
      );
    if (this.headerMenu)
      this.speechPitch = HTMLUtilities.findElement(
        this.headerMenu,
        "#speechPitch"
      );
    if (this.headerMenu)
      this.speechVolume = HTMLUtilities.findElement(
        this.headerMenu,
        "#speechVolume"
      );

    if (this.headerMenu)
      this.speechAutoScroll = HTMLUtilities.findElement(
        this.headerMenu,
        "#autoScroll"
      );

    if (this.speechRate) this.speechRate.value = this.rate.toString();
    if (this.speechPitch) this.speechPitch.value = this.pitch.toString();
    if (this.speechVolume) this.speechVolume.value = this.volume.toString();
    if (this.speechAutoScroll) this.speechAutoScroll.checked = this.autoScroll;

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

  public onRestart(callback: () => void) {
    this.restartCallback = callback;
  }

  private storeProperty(property: UserProperty) {
    this.updateUserSettings();
    this.saveProperty(property);
  }

  private updateUserSettings() {
    var ttsSettings: ITTSUserSettings = {
      rate: this.userProperties.getByRef(TTSREFS.RATE_REF)?.value,
      pitch: this.userProperties.getByRef(TTSREFS.PITCH_REF)?.value,
      volume: this.userProperties.getByRef(TTSREFS.VOLUME_REF)?.value,
      voice: this.userProperties.getByRef(TTSREFS.VOLUME_REF)?.value,
      color: this.userProperties.getByRef(TTSREFS.COLOR_REF)?.value,
      autoScroll: this.userProperties.getByRef(TTSREFS.AUTO_SCROLL_REF)?.value,
    };
    this.applyTTSSettings(ttsSettings);
    if (this.api?.updateSettings) {
      this.api?.updateSettings(ttsSettings).then(async (settings) => {
        log.log("api updated tts settings", settings);
      });
    }
  }

  private getTTSSettings(): UserProperties {
    var userProperties = new UserProperties();

    userProperties.addSwitchable(
      "tts-auto-scroll-off",
      "tts-auto-scroll-on",
      this.autoScroll,
      TTSREFS.AUTO_SCROLL_REF,
      TTSREFS.AUTO_SCROLL_KEY
    );
    userProperties.addIncremental(
      this.rate,
      0.1,
      10,
      0.1,
      "",
      TTSREFS.RATE_REF,
      TTSREFS.RATE_KEY
    );
    userProperties.addIncremental(
      this.pitch,
      0.1,
      2,
      0.1,
      "",
      TTSREFS.PITCH_REF,
      TTSREFS.PITCH_KEY
    );
    userProperties.addIncremental(
      this.volume,
      0.1,
      1,
      0.1,
      "",
      TTSREFS.VOLUME_REF,
      TTSREFS.VOLUME_KEY
    );
    userProperties.addStringable(
      this.color,
      TTSREFS.COLOR_REF,
      TTSREFS.COLOR_KEY
    );
    userProperties.addJSONable(
      JSON.stringify(this.voice),
      TTSREFS.VOICE_REF,
      TTSREFS.VOICE_KEY
    );

    return userProperties;
  }

  private saveProperty(property: UserProperty): any {
    let savedProperties = this.store.get(this.TTSSETTINGS);
    if (savedProperties) {
      let array = JSON.parse(savedProperties);
      array = array.filter((el: any) => el.name !== property.name);
      array.push(property);
      this.store.set(this.TTSSETTINGS, JSON.stringify(array));
    } else {
      let array: UserProperty[] = [];
      array.push(property);
      this.store.set(this.TTSSETTINGS, JSON.stringify(array));
    }
    return property;
  }

  getProperty(name: string): UserProperty | undefined {
    let array = this.store.get(this.TTSSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      properties = properties.filter((el: UserProperty) => el.name === name);
      if (properties.length === 0) {
        return undefined;
      }
      return properties[0];
    }
    return undefined;
  }

  resetTTSSettings() {
    this.store.remove(this.TTSSETTINGS);
    this.reset();
    this.settingsChangeCallback();
    this.restartCallback();
  }

  applyTTSSettings(ttsSettings: Partial<ITTSUserSettings>) {
    if (ttsSettings.rate) {
      log.log("rate " + this.rate);
      this.rate = ttsSettings.rate;
      let prop = this.userProperties.getByRef(TTSREFS.RATE_REF);
      if (prop) {
        prop.value = this.rate;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    }
    if (ttsSettings.pitch) {
      log.log("pitch " + this.pitch);
      this.pitch = ttsSettings.pitch;
      let prop = this.userProperties.getByRef(TTSREFS.PITCH_REF);
      if (prop) {
        prop.value = this.pitch;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    }
    if (ttsSettings.volume) {
      log.log("volume " + this.volume);
      this.volume = ttsSettings.volume;
      let prop = this.userProperties.getByRef(TTSREFS.VOLUME_REF);
      if (prop) {
        prop.value = this.volume;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    }

    if (ttsSettings.color) {
      this.color = ttsSettings.color;
      let prop = this.userProperties.getByRef(TTSREFS.COLOR_REF);
      if (prop) {
        prop.value = this.color;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
    if (ttsSettings.autoScroll !== undefined) {
      log.log("autoScroll " + this.autoScroll);
      this.autoScroll = ttsSettings.autoScroll;
      let prop = this.userProperties.getByRef(TTSREFS.AUTO_SCROLL_REF);
      if (prop) {
        prop.value = this.autoScroll;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
    }
    if (ttsSettings.voice) {
      log.log("voice " + this.voice);
      this.voice = ttsSettings.voice;
      let prop = this.userProperties.getByRef(TTSREFS.VOICE_REF);
      if (prop) {
        prop.value = this.voice;
        this.saveProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    }
  }

  applyPreferredVoice(value: string) {
    var name =
      value.indexOf(":") !== -1
        ? value.slice(0, value.indexOf(":"))
        : undefined;
    var lang =
      value.indexOf(":") !== -1 ? value.slice(value.indexOf(":") + 1) : value;
    if (name !== undefined && lang !== undefined) {
      this.applyTTSSettings({
        voice: {
          usePublication: true,
          name: name,
          lang: lang,
        },
      });
    } else if (lang !== undefined && name === undefined) {
      this.applyTTSSettings({
        voice: { usePublication: true, lang: lang },
      });
    }
  }

  increase(incremental: TTSIncrementable) {
    if (incremental === "rate") {
      (
        this.userProperties.getByRef(TTSREFS.RATE_REF) as Incremental
      ).increment();
      let prop = this.userProperties.getByRef(TTSREFS.RATE_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    } else if (incremental === "pitch") {
      (
        this.userProperties.getByRef(TTSREFS.PITCH_REF) as Incremental
      ).increment();
      let prop = this.userProperties.getByRef(TTSREFS.PITCH_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    } else if (incremental === "volume") {
      (
        this.userProperties.getByRef(TTSREFS.VOLUME_REF) as Incremental
      ).increment();
      let prop = this.userProperties.getByRef(TTSREFS.VOLUME_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    }
  }

  decrease(incremental: string) {
    if (incremental === "rate") {
      (
        this.userProperties.getByRef(TTSREFS.RATE_REF) as Incremental
      ).decrement();
      let prop = this.userProperties.getByRef(TTSREFS.RATE_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    } else if (incremental === "pitch") {
      (
        this.userProperties.getByRef(TTSREFS.PITCH_REF) as Incremental
      ).decrement();
      let prop = this.userProperties.getByRef(TTSREFS.PITCH_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    } else if (incremental === "volume") {
      (
        this.userProperties.getByRef(TTSREFS.VOLUME_REF) as Incremental
      ).decrement();
      let prop = this.userProperties.getByRef(TTSREFS.VOLUME_REF);
      if (prop) {
        this.storeProperty(prop);
      }
      this.settingsChangeCallback();
      this.restartCallback();
    }
  }
}
