/*
 * Copyright 2018-2021 DITA (AM Consulting LLC)
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
 * Developed on behalf of: NYPL, Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: NYPL, Bokbasen AS and CAST under one or more contributor license agreements.
 */
import D2Reader from "./reader";

/** R2D2BC Reader */
export default D2Reader;

/** for interop with \<script\> based usage */
export const load = D2Reader.load;

// ─── Models ─────────────────────────────────────────────────────────────────

export { Link } from "./model/Link";
export {
  Locator,
  Locations,
  LocatorText,
  ReadingPosition,
  Bookmark,
  Annotation,
  AnnotationMarker,
} from "./model/Locator";

// ─── Events ─────────────────────────────────────────────────────────────────

export { ReaderEvent } from "./utils/Events";
export type { ReaderEventName, ReaderEventMap } from "./utils/Events";

// ─── Navigator ──────────────────────────────────────────────────────────────

export { NavigatorFeature } from "./navigator/VisualNavigator";
export type { NavigatorFeatureName } from "./navigator/VisualNavigator";
export { EpubNavigator, IFrameNavigator } from "./navigator/EpubNavigator";

// ─── Module System ──────────────────────────────────────────────────────────

export type {
  ReaderModule,
  HostTypeName,
  RightsKeyName,
} from "./modules/ReaderModule";
export { HostType, RightsKey } from "./modules/ReaderModule";
export type {
  ModuleHost,
  EpubModuleHost,
  PDFModuleHost,
} from "./modules/ModuleHost";
export type {
  NavigatorFeatureMap,
  NavigatorFeatureKey,
} from "./modules/NavigatorFeatureMap";
export { ModuleRegistry } from "./modules/ModuleRegistry";
export { ModuleAccessors } from "./modules/ModuleAccessors";
export type {
  IBookmarkModule,
  ISearchModule,
  IAnnotationModule,
  IHistoryModule,
  SearchOptions,
} from "./modules/interfaces";
export { getPageFromLocations } from "./model/v3";

// ─── Fetcher ────────────────────────────────────────────────────────────────

export type { Fetcher, Resource } from "./fetcher/Fetcher";
export type { Container } from "./fetcher/Container";
export { ZipContainer } from "./fetcher/ZipContainer";
export { ReadError } from "./fetcher/ReadError";
export type { ReadErrorType } from "./fetcher/ReadError";
export { HttpFetcher } from "./fetcher/HttpFetcher";
export { ContentFetcher } from "./fetcher/ContentFetcher";
export { CacheFetcher } from "./fetcher/CacheFetcher";
export { ZipFetcher } from "./fetcher/ZipFetcher";
export { EpubParser } from "./fetcher/EpubParser";
export { BlobUrlManager } from "./fetcher/BlobUrlManager";
export { guessMediaType } from "./fetcher/mediaType";
export { TransformingFetcher } from "./fetcher/TransformingFetcher";
export type { ResourceTransform } from "./fetcher/TransformingFetcher";
export {
  parseEncryptionXml,
  deobfuscateIdpf,
  deobfuscateAdobe,
  createDeobfuscationTransform,
} from "./fetcher/FontDeobfuscator";
export type { EncryptionInfo } from "./fetcher/FontDeobfuscator";

// ─── Navigator / Config ─────────────────────────────────────────────────────

export type {
  ReaderConfig,
  ReaderRights,
  NavigatorAPI,
  IFrameAttributes,
  Injectable,
  RequestConfig,
  SampleRead,
  PublicationServices,
  InitialAnnotations,
  EpubNavigatorConfig,
  IFrameNavigatorConfig,
} from "./navigator/EpubNavigator";

// ─── User Settings ───────────────────────────────────────────────────────────

export type {
  IUserSettings,
  InitialUserSettings,
} from "./model/user-settings/UserSettings";
export type { UserSettingsIncrementable } from "./model/user-settings/UserProperties";

// ─── Storage ─────────────────────────────────────────────────────────────────

export type { LocalStorageStoreConfig } from "./store/LocalStorageStore";
