
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

export class UserProperties {

    properties: Array<UserProperty> = []

    addIncremental(nValue: number, min: number, max: number, step: number, suffix: string, ref: string, key: string) {
        this.properties.push(new Incremental(nValue, min, max, step, suffix, ref, key))
    }

    addSwitchable(onValue: string, offValue: string, on: boolean, ref: string, key: string) {
        this.properties.push(new Switchable(onValue, offValue, on, ref, key))
    }

    addEnumerable(index: number, values: Array<string>, ref: string, key: string) {
        this.properties.push(new Enumerable(index, values, ref, key))
    }

    getByRef(ref: string) {
        var result = this.properties.filter((el: any) => el.ref === ref)
        if (result.length > 0) {
            return result[0]
        }
        return null
    }

    getByKey(key: string) {
        var result = this.properties.filter((el: any) => el.key === key)
        if (result.length > 0) {
            return result[0]
        }
        return null
    }

}
