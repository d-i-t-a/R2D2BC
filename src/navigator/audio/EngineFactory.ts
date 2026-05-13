/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
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
 * Developed on behalf of: DITA (AM Consulting LLC)
 */

import type { AudioEngine } from "./AudioEngine";

/**
 * Factory that produces a single `AudioEngine` for the navigator's
 * lifetime. The navigator calls `create()` once at startup and never
 * again — track transitions go through `engine.changeSrc(source)` on
 * the persistent engine.
 *
 * Integrators supply factories for engines beyond the default
 * `WebAudioEngineFactory` (DRM, HLS, vendor SDKs). The custom engine's
 * `changeSrc` implementation handles its own source kinds — DRM URLs
 * with license info, HLS manifest URLs, vendor resource IDs, etc.
 *
 * When a factory holds shared state (license caches, vendor SDK
 * references) it implements `destroy()` so the navigator can release
 * them at shutdown.
 */
export interface EngineFactory {
  /**
   * Build the engine the navigator will use for its entire lifetime.
   * Called exactly once. Errors that occur later (network, decode,
   * license) surface via the engine's `error` event instead.
   */
  create(): AudioEngine;

  /**
   * Optional cleanup hook for stateful factories. Called by the
   * navigator on stop. Idempotent. May be async to accommodate vendor
   * SDK teardown / license-session release. Default-supplied factories
   * (like `WebAudioEngineFactory`) leave this undefined.
   */
  destroy?(): void | Promise<void>;
}
