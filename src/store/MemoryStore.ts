import Store from "./Store";

/** Class that stores key/value pairs in memory. */
export default class MemoryStore implements Store {
    private readonly store: {[key: string]: string};

    public constructor() {
        this.store = {};
    }

    public get(key: string): Promise<string | null> {
        const value = this.store[key] || null;
        return new Promise<string | null>(resolve => resolve(value));
    }

    public set(key: string, value: string): Promise<void> {
        this.store[key] = value;
        return new Promise<void>(resolve => resolve());
    }
}