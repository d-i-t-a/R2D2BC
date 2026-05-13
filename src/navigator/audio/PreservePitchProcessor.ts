/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * TypeScript shim for the AudioWorklet processor that preserves pitch
 * during non-1.0 playback rates.
 *
 * The processor itself lives in `PreservePitchProcessor.js` (vendored
 * from Readium ts-toolkit, BSD-3-Clause — see attribution in that file).
 * Worklets are JavaScript loaded by URL into an `AudioContext`, not
 * imported as TypeScript modules — so this shim exports the worklet's
 * registration name and resolves its URL via `import.meta.url`. Both the
 * registration site (in `AudiobookNavigator`, calling
 * `audioContext.audioWorklet.addModule(PRESERVE_PITCH_WORKLET_URL)`) and
 * the consumption site (in `WebAudioEngine`, calling
 * `new AudioWorkletNode(audioContext, PRESERVE_PITCH_PROCESSOR_NAME)`)
 * import from this file so the strings cannot drift apart.
 *
 * Pitch factor protocol (matches the JS file):
 *   The processor accepts messages on its port:
 *     `port.postMessage({ type: "setPitchFactor", factor: number })`
 *   When `playbackRate` is `r` and pitch should be preserved, send
 *   `factor = 1 / r` so the spectral shift compensates for the sped-up /
 *   slowed-down playback. To disable preservation entirely, send
 *   `factor = 1.0` (no spectral shift).
 */

/**
 * String name passed to `registerProcessor()` inside the worklet and to
 * `new AudioWorkletNode(ctx, name)` in the engine. These two sites MUST
 * use the same string; importing from this constant keeps them in sync.
 */
export const PRESERVE_PITCH_PROCESSOR_NAME =
  "preserve-pitch-processor" as const;

/**
 * Absolute URL of the worklet JS file.
 *
 * Lazy because `import.meta.url` is not always defined at module load
 * time depending on the build target (CJS / UMD / strict CSP). Calling
 * this returns the resolved URL when invoked, throwing only if neither
 * `import.meta.url` is available NOR an override has been supplied via
 * `setPreservePitchWorkletUrl()`.
 *
 * Integrators bundling R2D2BC into custom build pipelines should call
 * `setPreservePitchWorkletUrl(myUrl)` once at startup with a URL pointing
 * at the deployed worklet file. The default tries `import.meta.url`,
 * which works under modern ESM bundlers (Vite, esbuild ESM, Rollup) but
 * not under classic CJS / UMD output.
 */
let overrideUrl: string | URL | undefined;

/**
 * Override the worklet URL. Call once at integrator startup if the
 * default `import.meta.url`-based resolution doesn't work for your
 * bundler. The URL must point at the deployed copy of
 * `PreservePitchProcessor.js`.
 */
export function setPreservePitchWorkletUrl(url: string | URL): void {
  overrideUrl = url;
}

/**
 * Resolve the worklet URL. Returns either the integrator-supplied
 * override, or the URL relative to this module (for ESM bundlers that
 * support `import.meta.url`). Throws if neither is available.
 */
export function getPreservePitchWorkletUrl(): string | URL {
  if (overrideUrl !== undefined) return overrideUrl;
  // import.meta.url throws in some build targets; guard with try/catch
  // and return a clear error so integrators know to call setPreservePitchWorkletUrl().
  try {
    const meta = import.meta as { url?: string };
    if (meta?.url) {
      return new URL("./PreservePitchProcessor.js", meta.url);
    }
  } catch {
    // import.meta itself unavailable — fall through to the error below.
  }
  throw new Error(
    "PreservePitchProcessor: no worklet URL available. Your bundler does not " +
      "expose `import.meta.url`; call `setPreservePitchWorkletUrl(url)` once at " +
      "startup with the URL of your deployed PreservePitchProcessor.js file."
  );
}

/** Message shape posted to the worklet's port to change pitch factor. */
export interface SetPitchFactorMessage {
  type: "setPitchFactor";
  factor: number;
}
