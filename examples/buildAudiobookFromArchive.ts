/*
 * Build a `.audiobook` ZIP from an Internet Archive identifier.
 *
 * Pipeline:
 *   1. Build a manifest via `buildArchiveManifest` (shared with the
 *      live IA route in `audiobookFromArchive.ts`). Uses
 *      `quality: "smallest"` to pick 64Kbps MP3 derivatives — keeps
 *      the bundle compact — and `hrefMode: "relative"` so
 *      `readingOrder` and `toc` reference bare filenames that match
 *      the audio files about to land alongside the manifest.
 *   2. Download each track + the cover into a temp directory.
 *   3. ZIP the temp directory into the requested `<output>.audiobook`.
 *
 * Usage:
 *   npm run build:audiobook -- <ia-id> <output-path>
 *   npx ts-node examples/buildAudiobookFromArchive.ts flatland_rg_librivox examples/epubs/flatland.audiobook
 *
 * Re-running on an existing output path overwrites it. Audio files
 * are downloaded fresh every time — there is no incremental fetch.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { execSync } from "child_process";
import { buildArchiveManifest } from "./audiobookFromArchive";

/**
 * Stream a remote URL to a local file. Follows up to 3 redirects
 * (archive.org responds with 302 → CDN host for `download/` URLs).
 * Rejects on HTTP 4xx/5xx.
 */
function downloadTo(
  url: string,
  destPath: string,
  redirectsLeft = 3
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const file = fs.createWriteStream(destPath);
    const cleanupAndReject = (err: Error): void => {
      file.close();
      fs.unlink(destPath, () => reject(err));
    };
    const req = client.get(url, (res) => {
      // Follow redirects.
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        if (redirectsLeft <= 0) {
          cleanupAndReject(new Error(`Too many redirects fetching ${url}`));
          return;
        }
        res.resume();
        file.close();
        fs.unlink(destPath, () => {
          downloadTo(res.headers.location!, destPath, redirectsLeft - 1).then(
            resolve,
            reject
          );
        });
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        cleanupAndReject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        res.resume();
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", cleanupAndReject);
    });
    req.on("error", cleanupAndReject);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function build(identifier: string, outputPath: string): Promise<void> {
  console.log(`📚 Fetching IA metadata for "${identifier}"...`);
  const result = await buildArchiveManifest(identifier, {
    manifestUrl: "manifest.json",
    quality: "smallest",
    hrefMode: "relative",
  });

  const trackCount = result.trackSources.length;
  console.log(`✅ Manifest built: ${trackCount} track(s)`);

  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `audiobook-${identifier}-`)
  );
  console.log(`📂 Staging in ${tmpDir}`);

  try {
    // Download tracks.
    for (let i = 0; i < trackCount; i++) {
      const { file, absoluteUrl } = result.trackSources[i];
      const destPath = path.join(tmpDir, file.name);
      console.log(`[${String(i + 1).padStart(2)}/${trackCount}] ${file.name}`);
      await downloadTo(absoluteUrl, destPath);
    }

    // Download cover, if any.
    if (result.coverSource) {
      const { file, absoluteUrl } = result.coverSource;
      console.log(`🖼  ${file.name}`);
      await downloadTo(absoluteUrl, path.join(tmpDir, file.name));
    }

    // Write manifest.
    fs.writeFileSync(
      path.join(tmpDir, "manifest.json"),
      JSON.stringify(result.manifest, null, 2)
    );

    // ZIP into target. Remove any existing bundle first so `zip` writes
    // a fresh archive instead of updating in place.
    const absOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absOutput), { recursive: true });
    if (fs.existsSync(absOutput)) fs.unlinkSync(absOutput);
    console.log(`📦 Packaging → ${absOutput}`);
    execSync(`cd "${tmpDir}" && zip -r -q "${absOutput}" .`, {
      stdio: "inherit",
    });

    const size = fs.statSync(absOutput).size;
    console.log(`✅ Built ${absOutput} (${formatBytes(size)})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const [, , identifier, outputPath] = process.argv;
if (!identifier || !outputPath) {
  console.error(
    "Usage: ts-node examples/buildAudiobookFromArchive.ts <ia-id> <output-path>"
  );
  process.exit(1);
}

build(identifier, outputPath).catch((err) => {
  console.error("❌ Build failed:", err?.message ?? err);
  process.exit(1);
});
