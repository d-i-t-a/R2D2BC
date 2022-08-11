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
} from "../../model/user-settings/UserProperties";
import log from "loglevel";

export interface LayerConfig {
  store: Store;
}

export interface ILayerSettings {}

export class LayerSettings implements ILayerSettings {
  private readonly store: Store;
  private readonly LAYERSETTINGS = "layerSetting";

  userProperties: UserProperties;

  public static async create(config: LayerConfig): Promise<any> {
    const settings = new this(config.store);
    return new Promise((resolve) => resolve(settings));
  }

  protected constructor(store: Store) {
    this.store = store;
    this.initialize();
  }

  async stop() {
    log.log("MediaOverlay settings stop");
  }

  private async initialize() {
    this.userProperties = await this.getLayerSettings();
  }

  private async getLayerSettings(): Promise<UserProperties> {
    let userProperties = new UserProperties();

    let array = await this.store.get(this.LAYERSETTINGS);
    if (array) {
      let properties = JSON.parse(array) as Array<UserProperty>;
      userProperties.properties = properties;
    }

    return userProperties;
  }

  async saveProperty(property: UserProperty): Promise<any> {
    let savedProperties = await this.store.get(this.LAYERSETTINGS);
    if (savedProperties) {
      let array = JSON.parse(savedProperties);
      array = array.filter((el: any) => el.name !== property.name);
      array.push(property);
      await this.store.set(this.LAYERSETTINGS, JSON.stringify(array));
    } else {
      let array: UserProperty[] = [];
      array.push(property);
      await this.store.set(this.LAYERSETTINGS, JSON.stringify(array));
    }
    return new Promise((resolve) => resolve(property));
  }

  async getProperty(name: string): Promise<UserProperty | null> {
    let array = await this.store.get(this.LAYERSETTINGS);
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
}
