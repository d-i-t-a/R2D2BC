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
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

export class UserProperty {
  ref: string;
  name: string;
  value: any;

  json() {
    return JSON.stringify(this);
  }
}

export class Stringable extends UserProperty {
  value: string;
  constructor(value: string, ref: string, name: string) {
    super();
    this.value = value;
    this.ref = ref;
    this.name = name;
  }

  toString(): string {
    return this.value;
  }
}

export class JSONable extends UserProperty {
  value: any;
  constructor(value: string, ref: string, name: string) {
    super();
    this.value = value;
    this.ref = ref;
    this.name = name;
  }

  toString(): string {
    return this.value;
  }
  toJson(): any {
    return JSON.parse(this.value);
  }
}

export class Enumerable extends UserProperty {
  values: Array<any>;

  constructor(value: any, values: Array<any>, ref: string, name: string) {
    super();
    this.value = value;
    this.values = values;
    this.ref = ref;
    this.name = name;
  }

  toString(): string {
    return this.values[this.value];
  }
}

export type UserSettingsIncrementable =
  | "fontSize"
  | "letterSpacing"
  | "lineHeight"
  | "wordSpacing";

export class Incremental extends UserProperty {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;

  constructor(
    value: number,
    min: number,
    max: number,
    step: number,
    suffix: string,
    ref: string,
    name: string
  ) {
    super();
    this.value = value;
    this.min = min;
    this.max = max;
    this.step = step;
    this.suffix = suffix;
    this.ref = ref;
    this.name = name;
  }

  toString(): string {
    return this.value.toString() + this.suffix;
  }

  increment() {
    const dec = this.countDecimals(this.max);
    if (parseFloat(this.value.toFixed(dec)) < this.max) {
      this.value = parseFloat(this.value.toFixed(dec)) + this.step;
    }
  }

  decrement() {
    const dec = this.countDecimals(this.min);
    if (parseFloat(this.value.toFixed(dec)) > this.min) {
      this.value = parseFloat(this.value.toFixed(dec)) - this.step;
    }
  }
  countDecimals = function (value) {
    if (value % 1 !== 0) return value.toString().split(".")[1].length;
    return 1;
  };
}
export class Switchable extends UserProperty {
  value: boolean;
  onValue: string;
  offValue: string;

  constructor(
    onValue: string,
    offValue: string,
    value: boolean,
    ref: string,
    name: string
  ) {
    super();
    this.value = value;
    this.onValue = onValue;
    this.offValue = offValue;
    this.ref = ref;
    this.name = name;
  }

  toString() {
    return this.value ? this.onValue : this.offValue;
  }

  switch() {
    this.value = !this.value;
  }
}

export class UserProperties {
  properties: Array<UserProperty> = [];

  addIncremental(
    nValue: number,
    min: number,
    max: number,
    step: number,
    suffix: string,
    ref: string,
    key: string
  ) {
    this.properties.push(
      new Incremental(nValue, min, max, step, suffix, ref, key)
    );
  }

  addStringable(nValue: string, ref: string, key: string) {
    this.properties.push(new Stringable(nValue, ref, key));
  }
  addJSONable(nValue: string, ref: string, key: string) {
    this.properties.push(new JSONable(nValue, ref, key));
  }

  addSwitchable(
    onValue: string,
    offValue: string,
    on: boolean,
    ref: string,
    key: string
  ) {
    this.properties.push(new Switchable(onValue, offValue, on, ref, key));
  }

  addEnumerable(
    index: number,
    values: Array<string>,
    ref: string,
    key: string
  ) {
    this.properties.push(new Enumerable(index, values, ref, key));
  }

  getByRef(ref: string) {
    let result = this.properties.filter((el: any) => el.ref === ref);
    if (result.length > 0) {
      return result[0];
    }
    return null;
  }

  getByKey(key: string) {
    let result = this.properties.filter((el: any) => el.key === key);
    if (result.length > 0) {
      return result[0];
    }
    return null;
  }
}
