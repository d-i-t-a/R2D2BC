/**
 * @deprecated ta-json-x is removed in v3. These functions now use
 * @readium/shared's built-in deserialize/serialize methods or plain JSON.
 *
 * Kept for backwards compatibility with code that calls TaJsonDeserialize/TaJsonSerialize.
 */

export interface IStringMap {
  [key: string]: string;
}

export type AnyJson = JsonPrimitives | JsonArray | JsonMap;
export type JsonPrimitives = string | number | boolean | null;
export interface JsonMap {
  [key: string]: AnyJson;
}
export interface JsonArray extends Array<AnyJson> {}

/**
 * @deprecated Use Manifest.deserialize(), Link.deserialize(), etc. from @readium/shared directly.
 *
 * This wrapper now calls the type's static deserialize() if available,
 * otherwise falls back to Object.assign for simple types.
 */
export function TaJsonDeserialize<T>(
  json: any,
  type: { new (...args: any[]): T; deserialize?: (json: any) => T | undefined }
): T {
  if (type && typeof (type as any).deserialize === "function") {
    const result = (type as any).deserialize(json);
    if (result) return result;
  }
  // Fallback: plain object assign (for simple types without deserialize)
  return Object.assign(new type() as object, json) as T;
}

/**
 * @deprecated Use the object's serialize() method directly.
 */
export function TaJsonSerialize<T>(obj: T): JsonMap {
  if (obj && typeof (obj as any).serialize === "function") {
    return (obj as any).serialize() as JsonMap;
  }
  return obj as unknown as JsonMap;
}
