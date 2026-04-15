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
 * Font deobfuscation for EPUB archives.
 *
 * EPUB publishers can obfuscate embedded fonts to prevent casual reuse
 * outside the publication. Two algorithms exist:
 *
 * - **IDPF** (`http://www.idpf.org/2008/embedding`):
 *   SHA-1 hash of the publication identifier, XOR first 1040 bytes.
 *
 * - **Adobe** (`http://ns.adobe.com/pdf/enc#RC`):
 *   UUID from the identifier (16 bytes), XOR first 1024 bytes.
 *
 * The encryption.xml file in META-INF lists which resources are
 * obfuscated and with which algorithm. The publication's dc:identifier
 * is used to derive the deobfuscation key.
 *
 * Reference implementations:
 * - edrlab/r2-shared-js src/transform/transformer-obf-idpf.ts
 * - edrlab/r2-shared-js src/transform/transformer-obf-adobe.ts
 * - readium/swift-toolkit Sources/Streamer/Parser/EPUB/EPUBDeobfuscator.swift
 */

/** Algorithm URIs as defined in the EPUB spec and Adobe's scheme. */
export const ALGORITHM_IDPF = "http://www.idpf.org/2008/embedding";
export const ALGORITHM_ADOBE = "http://ns.adobe.com/pdf/enc#RC";

/** Encryption info for a single resource, parsed from encryption.xml. */
export interface EncryptionInfo {
  algorithm: string;
  /** Original uncompressed length (from EncryptionProperties, if present). */
  originalLength?: number;
}

/**
 * Parse META-INF/encryption.xml and return a map of href → EncryptionInfo.
 *
 * Only extracts entries with IDPF or Adobe obfuscation algorithms.
 * Other encryption types (e.g., LCP AES-256) are ignored here —
 * those are handled by the integrator's getContent callback.
 */
export function parseEncryptionXml(
  xmlText: string
): Map<string, EncryptionInfo> {
  const map = new Map<string, EncryptionInfo>();
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const encryptedDataEls = doc.querySelectorAll("EncryptedData");

  encryptedDataEls.forEach((ed) => {
    const algorithm =
      ed.querySelector("EncryptionMethod")?.getAttribute("Algorithm") ?? "";

    // Only handle font obfuscation algorithms
    if (algorithm !== ALGORITHM_IDPF && algorithm !== ALGORITHM_ADOBE) return;

    const uri =
      ed.querySelector("CipherData CipherReference")?.getAttribute("URI") ?? "";
    if (!uri) return;

    // Decode URI (encryption.xml may have percent-encoded paths)
    let href: string;
    try {
      href = decodeURIComponent(uri);
    } catch {
      href = uri;
    }

    const info: EncryptionInfo = { algorithm };

    // OriginalLength may be in EncryptionProperties
    const originalLengthEl = ed.querySelector(
      "EncryptionProperties EncryptionProperty Compression"
    );
    if (originalLengthEl) {
      const len = parseInt(
        originalLengthEl.getAttribute("OriginalLength") ?? "",
        10
      );
      if (!isNaN(len)) info.originalLength = len;
    }

    map.set(href, info);
  });

  return map;
}

/**
 * Deobfuscate font data using the IDPF algorithm.
 *
 * SHA-1 hash of the identifier → XOR first 1040 bytes.
 * Uses Web Crypto API (available in all modern browsers).
 */
export async function deobfuscateIdpf(
  data: Uint8Array,
  identifier: string
): Promise<Uint8Array> {
  const cleanId = identifier.replace(/\s+/g, "");
  const idBytes = new TextEncoder().encode(cleanId);
  const hashBuffer = await crypto.subtle.digest("SHA-1", idBytes);
  const key = new Uint8Array(hashBuffer);

  const result = new Uint8Array(data);
  const prefixLength = Math.min(1040, result.length);
  for (let i = 0; i < prefixLength; i++) {
    result[i] = result[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Deobfuscate font data using the Adobe algorithm.
 *
 * Extract UUID from identifier (strip urn:uuid:, hyphens, whitespace),
 * convert 16 hex pairs to 16 bytes → XOR first 1024 bytes.
 */
export function deobfuscateAdobe(
  data: Uint8Array,
  identifier: string
): Uint8Array {
  // Strip urn:uuid: prefix, hyphens, and whitespace
  let hex = identifier.replace(/^urn:uuid:/i, "").replace(/[- \t\r\n]/g, "");

  // Must be exactly 32 hex characters (16 bytes)
  if (hex.length < 32) {
    return data; // Can't deobfuscate, return as-is
  }
  hex = hex.substring(0, 32);

  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    key[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }

  const result = new Uint8Array(data);
  const prefixLength = Math.min(1024, result.length);
  for (let i = 0; i < prefixLength; i++) {
    result[i] = result[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Create a ResourceTransform that deobfuscates fonts based on
 * encryption info stored in the Resource's `properties.encrypted`.
 *
 * Use with TransformingFetcher:
 * ```ts
 * new TransformingFetcher(inner, createDeobfuscationTransform(identifier))
 * ```
 *
 * Resources without encryption properties pass through unchanged.
 * Only IDPF and Adobe algorithms are handled.
 */
export function createDeobfuscationTransform(
  identifier: string
): (
  resource: import("./Fetcher").Resource
) => Promise<import("./Fetcher").Resource> {
  return async (resource) => {
    const encrypted = resource.properties?.encrypted as
      | EncryptionInfo
      | undefined;
    if (!encrypted || !resource.bytes) return resource;

    let deobfuscated: Uint8Array;
    if (encrypted.algorithm === ALGORITHM_IDPF) {
      deobfuscated = await deobfuscateIdpf(
        new Uint8Array(resource.bytes),
        identifier
      );
    } else if (encrypted.algorithm === ALGORITHM_ADOBE) {
      deobfuscated = deobfuscateAdobe(
        new Uint8Array(resource.bytes),
        identifier
      );
    } else {
      return resource;
    }

    return {
      ...resource,
      bytes: deobfuscated.buffer as ArrayBuffer,
      text: resource.text
        ? new TextDecoder().decode(deobfuscated)
        : resource.text,
    };
  };
}
