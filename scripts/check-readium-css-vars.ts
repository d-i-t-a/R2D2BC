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
 * Validate that every CSS custom property R2D2BC writes to the iframe
 * `<html>` element is consumed by at least one bundled ReadiumCSS file
 * (v1 or v2), or is a known dual-applicator write (v1-compatibility
 * substring match on the value in the style attribute — see
 * ~/.claude/.../memory/readiumcss-dual-applicator-writes.md).
 *
 * Exits 0 when all writes are accounted for, non-zero otherwise.
 *
 * Run: `npx ts-node scripts/check-readium-css-vars.ts`
 */

import * as fs from "fs";
import * as path from "path";

const TS_FILE = path.resolve("src/model/user-settings/ReadiumCSS.ts");
const CSS_DIRS = [
  path.resolve("viewer/readium-css"),
  path.resolve("viewer/readium-css-v2"),
];

/**
 * Known dual-applicator writes — TS writes these `--USER__` properties
 * so v1 CSS can match on the VALUE via `[style*="readium-<name>-on"]`
 * substring selectors. v2 does not consume these variables directly;
 * v2 gets the same semantics via other writes (e.g. color preset vars
 * for appearance). Do not remove these TS writes — they are
 * load-bearing for v1 compatibility.
 */
const DUAL_APPLICATOR_ALLOWED: ReadonlySet<string> = new Set([
  "--USER__advancedSettings",
  "--USER__appearance",
  "--USER__blendImages",
  "--USER__direction",
  "--USER__fontOverride",
  "--USER__pageMargins",
  "--USER__scroll",
  // FONT_SIZE_NORMALIZE is written by R2D2BC internally as a zoom
  // fallback; no integrator-facing REF. Also retained.
  "--USER__fontSizeNormalize",
]);

function extractTsVars(tsSource: string): string[] {
  const names = new Set<string>();
  // REF constants → "--USER__" + value
  const refRe = /static\s+readonly\s+\w+_REF\s*=\s*"([^"]+)"/g;
  for (const match of tsSource.matchAll(refRe)) {
    names.add("--USER__" + match[1]);
  }
  // KEY constants that use "--RS__" directly (e.g. scroll padding)
  const rsKeyRe = /static\s+readonly\s+\w+_KEY\s*=\s*"(--RS__[^"]+)"/g;
  for (const match of tsSource.matchAll(rsKeyRe)) {
    names.add(match[1]);
  }
  // KEY constants that use "--USER__" directly (e.g. FONT_SIZE_NORMALIZE)
  const userKeyRe = /static\s+readonly\s+\w+_KEY\s*=\s*"(--USER__[^"]+)"/g;
  for (const match of tsSource.matchAll(userKeyRe)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function extractCssVars(cssDirs: string[]): Set<string> {
  const found = new Set<string>();
  for (const dir of cssDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Recurse into subdirectories (cjk-horizontal/, cjk-vertical/, etc.)
        for (const found2 of extractCssVars([path.join(dir, entry.name)])) {
          found.add(found2);
        }
        continue;
      }
      if (!entry.name.endsWith(".css")) continue;
      const text = fs.readFileSync(path.join(dir, entry.name), "utf8");
      const re = /--(?:USER|RS)__\w+/g;
      for (const match of text.matchAll(re)) found.add(match[0]);
    }
  }
  return found;
}

const tsSource = fs.readFileSync(TS_FILE, "utf8");
const tsVars = extractTsVars(tsSource);
const cssVars = extractCssVars(CSS_DIRS);

const orphans: string[] = [];
const dualApplicator: string[] = [];
for (const name of tsVars) {
  if (cssVars.has(name)) continue;
  if (DUAL_APPLICATOR_ALLOWED.has(name)) {
    dualApplicator.push(name);
  } else {
    orphans.push(name);
  }
}

console.log(
  `\nChecked ${tsVars.length} CSS vars written by TS against ${cssVars.size} vars used in bundled CSS.`
);
if (dualApplicator.length) {
  console.log(
    `\n${dualApplicator.length} dual-applicator writes (v1 compatibility, expected):`
  );
  for (const n of dualApplicator) console.log(`  ${n}`);
}
if (orphans.length) {
  console.error(
    `\n❌ ${orphans.length} orphaned TS writes — not consumed by any CSS and not in the dual-applicator allow-list:`
  );
  for (const n of orphans) console.error(`  ${n}`);
  console.error(
    "\nEither: remove the TS write, add the consuming CSS, or extend " +
      "DUAL_APPLICATOR_ALLOWED in scripts/check-readium-css-vars.ts with a reason."
  );
  process.exit(1);
}

console.log("\n✅ All TS-side ReadiumCSS writes accounted for.");
