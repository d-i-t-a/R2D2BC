import { TaJson } from "ta-json-x";

export interface IStringMap {
  [key: string]: string;
}

export type AnyJson = JsonPrimitives | JsonArray | JsonMap;
export type JsonPrimitives = string | number | boolean | null;
export interface JsonMap {
  [key: string]: AnyJson;
}
export interface JsonArray extends Array<AnyJson> {}

type TConstructor<T> = new (value?: any) => T;

export function TaJsonDeserialize<T>(json: any, type: TConstructor<T>): T {
  return TaJson.deserialize<T>(json, type);
}

export function TaJsonSerialize<T>(obj: T): JsonMap {
  return TaJson.serialize(obj) as JsonMap;
}
