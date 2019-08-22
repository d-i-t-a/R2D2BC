interface Store {
    get(key: string): Promise<any | null>;
    set(key: string, value: any): Promise<void>;
}

export default Store;