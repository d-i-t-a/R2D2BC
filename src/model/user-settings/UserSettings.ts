import Store from "../../store/Store";

export class UserSettings {

    static readonly FONT_SIZE_REF = "fontSize"
    static readonly FONT_FAMILY_REF = "fontFamily"
    static readonly FONT_OVERRIDE_REF = "fontOverride"
    static readonly APPEARANCE_REF = "appearance"
    static readonly SCROLL_REF = "scroll"
    static readonly PUBLISHER_DEFAULT_REF = "advancedSettings"
    static readonly TEXT_ALIGNMENT_REF = "textAlign"
    static readonly COLUMN_COUNT_REF = "colCount"
    static readonly WORD_SPACING_REF = "wordSpacing"
    static readonly LETTER_SPACING_REF = "letterSpacing"
    static readonly PAGE_MARGINS_REF = "pageMargins"
    static readonly LINE_HEIGHT_REF = "lineHeight"

    static readonly FONT_SIZE_KEY = "--USER__" + UserSettings.FONT_SIZE_REF
    static readonly FONT_FAMILY_KEY = "--USER__" + UserSettings.FONT_FAMILY_REF
    static readonly FONT_OVERRIDE_KEY = "--USER__" + UserSettings.FONT_OVERRIDE_REF
    static readonly APPEARANCE_KEY = "--USER__" + UserSettings.APPEARANCE_REF
    static readonly SCROLL_KEY = "--USER__" + UserSettings.SCROLL_REF
    static readonly PUBLISHER_DEFAULT_KEY = "--USER__" + UserSettings.PUBLISHER_DEFAULT_REF
    static readonly TEXT_ALIGNMENT_KEY = "--USER__" + UserSettings.TEXT_ALIGNMENT_REF
    static readonly COLUMN_COUNT_KEY = "--USER__" + UserSettings.COLUMN_COUNT_REF
    static readonly WORD_SPACING_KEY = "--USER__" + UserSettings.WORD_SPACING_REF
    static readonly LETTER_SPACING_KEY = "--USER__" + UserSettings.LETTER_SPACING_REF
    static readonly PAGE_MARGINS_KEY = "--USER__" + UserSettings.PAGE_MARGINS_REF
    static readonly LINE_HEIGHT_KEY = "--USER__" + UserSettings.LINE_HEIGHT_REF

    static readonly appearanceValues = ["readium-default-on", "readium-sepia-on", "readium-night-on"]
    static readonly fontFamilyValues = ["Original", "serif", "sans-serif", "opendyslexic"]
    static readonly textAlignmentValues = ["justify", "start"]
    static readonly columnCountValues = ["auto", "1", "2"]

    fontSize = 100.0
    fontOverride = false
    fontFamily = 0
    appearance = 0
    verticalScroll = false

    //Advanced settings
    publisherDefaults = false
    textAlignment = 0
    columnCount = 0
    wordSpacing = 0.0
    letterSpacing = 0.0
    // pageMargins = 2.0
    // lineHeight = 1.0

    private readonly store: Store;
    private readonly USERSETTINGS = "userSetting";

    constructor(store: Store) {
        this.store = store;
    }

    public async initProperties(list: string): Promise<any> {
        let savedObj = JSON.parse(list);
        await this.store.set(this.USERSETTINGS, JSON.stringify(savedObj));
        return new Promise(resolve => resolve(list));
    }
    public async saveProperty(property: any): Promise<any> {
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
    public async deleteProperty(property: any): Promise<any> {
        let array = await this.store.get(this.USERSETTINGS);
        if (array) {
            let savedObj = JSON.parse(array) as Array<any>;
            savedObj = savedObj.filter((el: any) => el.name !== property.name);
            await this.store.set(this.USERSETTINGS, JSON.stringify(savedObj));
        }
        return new Promise(resolve => resolve(property));
    }
    public async getProperties(): Promise<any> {
        let array = await this.store.get(this.USERSETTINGS);
        if (array) {
            const properties = JSON.parse(array);
            return new Promise(resolve => resolve(properties));
        }
        return new Promise(resolve => resolve());
    }
    public async getProperty(name: string): Promise<UserProperty> {
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
}


export interface UserSettingsConfig {
    fontSize?: boolean;
    fontFamily?: boolean;
    // fontOverride:boolean;
    appearance?: boolean;
    scroll?: boolean;
    // advancedSettings:boolean;
    textAlign?: boolean;
    colCount?: boolean;
    wordSpacing?: boolean;
    letterSpacing?: boolean;
    // pageMargins:boolean;
    // lineHeight:boolean;
}

export class UserProperty {
    ref: string;
    name: string;
    value: any;
    json() {
        return JSON.stringify(this)
    }
}
export class Enumerable extends UserProperty {

    values: Array<any>;

    constructor(value: any, values: Array<any>, ref: string, name: string) {
        super();
        this.value = value
        this.values = values
        this.ref = ref
        this.name = name
    }

    toString(): string {
        return this.values[this.value]
    }

}
export class Incremental extends UserProperty {

    min: number;
    max: number;
    step: number;
    suffix: string;

    constructor(value: any, min: number, max: number, step: number, suffix: string, ref: string, name: string) {
        super();
        this.value = value
        this.min = min
        this.max = max
        this.step = step
        this.suffix = suffix
        this.ref = ref
        this.name = name
    }

    toString(): string {
        return this.value.toString() + this.suffix
    }

    increment() {
        if (this.value <= this.max) {
            this.value += this.step
        }
    }

    decrement() {
        if (this.value >= this.min) {
            this.value -= this.step
        }
    }

}
export class Switchable extends UserProperty {

    onValue: string;
    offValue: string;

    constructor(onValue: string, offValue: string, value: boolean, ref: string, name: string) {
        super();
        this.value = value
        this.onValue = onValue
        this.offValue = offValue
        this.ref = ref
        this.name = name
    }

    toString() {
       return (this.value ? this.onValue : this.offValue)
    }

    switch() {
        this.value = !this.value
    }

}
