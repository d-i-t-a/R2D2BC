import { Server } from "r2-streamer-js";
import * as express from "express";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

import recursive from "recursive-readdir";
import { manifestFromArchive } from "./audiobookFromArchive";

interface PublicationEntry {
  title: string;
  filename: string;
  type: "epub" | "pdf" | "audiobook";
  hosted?: boolean;
  viewers: { title: string; url: string }[];
}

async function start() {
  const publications: PublicationEntry[] = [
    // Built-in demo publications (hosted remotely)
    {
      title: "Alice's Adventures in Wonderland",
      filename: "alice (hosted)",
      type: "pdf",
      hosted: true,
      viewers: [
        {
          title: "PDF Viewer",
          url: `/viewer/index_pdf.html?url=https://alicepdf.dita.digital/alice.json`,
        },
      ],
    },
    {
      title: "Alice's Adventures in Wonderland",
      filename: "alice (hosted)",
      type: "epub",
      hosted: true,
      viewers: [
        {
          title: "DITA Reader (ReadiumCSS v1)",
          url: `/viewer/index_dita.html?url=https://alice.dita.digital/manifest.json`,
        },
        {
          title: "DITA Reader (ReadiumCSS v2)",
          url: `/viewer/index_dita_v2.html?url=https://alice.dita.digital/manifest.json`,
        },
        {
          title: "Small Window (600×500)",
          url: `/viewer/index_small_window.html?url=https://alice.dita.digital/manifest.json`,
        },
      ],
    },
    // The Readium spec hosts a Flatland manifest at
    // `https://readium.org/webpub-manifest/examples/Flatland/`, but its
    // readingOrder uses legacy `http://www.archive.org/...` URLs that
    // omit CORS headers on the redirect chain — incompatible with our
    // Web Audio pipeline (`MediaElementAudioSourceNode` requires
    // `crossOrigin="anonymous"` on a fully CORS-clean source).
    //
    // We use the same LibriVox source via our `/archive/` converter,
    // which goes through `https://archive.org/download/...` (CORS-clean
    // through every redirect).
    {
      title: "Flatland",
      filename: "flatland (LibriVox)",
      type: "audiobook",
      hosted: true,
      viewers: [
        {
          title: "Audiobook Reader",
          url: `/viewer/index_audiobook.html?url=/archive/flatland_rg_librivox/manifest.json`,
        },
        {
          title: "Minimal Player",
          url: `/viewer/index_audiobook_minimal.html?url=/archive/flatland_rg_librivox/manifest.json`,
        },
      ],
    },
    // LibriVox audiobooks via the Internet Archive metadata API.
    // The `/archive/:id/manifest.json` route below converts each IA
    // item into a Readium Audiobook Profile manifest on demand.
    // Identifiers were verified to have VBR / 128Kbps MP3 derivatives
    // with valid per-track durations.
    {
      title: "Pride and Prejudice",
      filename: "pride_prejudice (LibriVox)",
      type: "audiobook",
      hosted: true,
      viewers: [
        {
          title: "Audiobook Reader",
          url: `/viewer/index_audiobook.html?url=/archive/pride_prejudice_krs_librivox/manifest.json`,
        },
        {
          title: "Minimal Player",
          url: `/viewer/index_audiobook_minimal.html?url=/archive/pride_prejudice_krs_librivox/manifest.json`,
        },
      ],
    },
    {
      title: "Treasure Island",
      filename: "treasureisland (LibriVox)",
      type: "audiobook",
      hosted: true,
      viewers: [
        {
          title: "Audiobook Reader",
          url: `/viewer/index_audiobook.html?url=/archive/treasureisland_librivox/manifest.json`,
        },
        {
          title: "Minimal Player",
          url: `/viewer/index_audiobook_minimal.html?url=/archive/treasureisland_librivox/manifest.json`,
        },
      ],
    },
    {
      title: "The Call of the Wild",
      filename: "callofthewild (LibriVox)",
      type: "audiobook",
      hosted: true,
      viewers: [
        {
          title: "Audiobook Reader",
          url: `/viewer/index_audiobook.html?url=/archive/callofthewild_tc_1010_librivox/manifest.json`,
        },
        {
          title: "Minimal Player",
          url: `/viewer/index_audiobook_minimal.html?url=/archive/callofthewild_tc_1010_librivox/manifest.json`,
        },
      ],
    },
    {
      title: "The Time Machine",
      filename: "timemachine (LibriVox)",
      type: "audiobook",
      hosted: true,
      viewers: [
        {
          title: "Audiobook Reader",
          url: `/viewer/index_audiobook.html?url=/archive/time_machine_v6_2008_librivox/manifest.json`,
        },
        {
          title: "Minimal Player",
          url: `/viewer/index_audiobook_minimal.html?url=/archive/time_machine_v6_2008_librivox/manifest.json`,
        },
      ],
    },
    {
      title: "The Art of War",
      filename: "artofwar (LibriVox)",
      type: "audiobook",
      hosted: true,
      viewers: [
        {
          title: "Audiobook Reader",
          url: `/viewer/index_audiobook.html?url=/archive/artofwar_2008_librivox/manifest.json`,
        },
        {
          title: "Minimal Player",
          url: `/viewer/index_audiobook_minimal.html?url=/archive/artofwar_2008_librivox/manifest.json`,
        },
      ],
    },
  ];

  const server = new Server({
    disableDecryption: true,
    disableOPDS: true,
    disableReaders: true,
    disableRemotePubUrl: true,
    maxPrefetchLinks: 5,
  });

  // ── Serve viewer files ──────────────────────────────────────────────

  server.expressUse(
    "/viewer",
    //@ts-ignore
    express.static(path.join(__dirname, "../viewer"), { fallthrough: true })
  );
  //@ts-ignore
  server.expressUse("/viewer", express.static(path.join(__dirname, "../dist")));

  // Serve node_modules so viewer HTML files can reference @readium/css
  // directly without a build step.
  //@ts-ignore
  server.expressUse(
    "/node_modules",
    //@ts-ignore
    express.static(path.join(__dirname, "../node_modules"))
  );

  // ── Landing page ────────────────────────────────────────────────────

  // ── PDF serving ─────────────────────────────────────────────────────

  // Serve PDFs as static files
  const pdfsPath = path.join(__dirname, "./epubs"); // PDFs live alongside EPUBs
  //@ts-ignore
  server.expressUse("/pdfs", express.static(pdfsPath));

  // Generate a simple RWPM manifest for a PDF file
  // Use path-based URL (/pdf-manifest/filename.pdf) to avoid query string conflicts
  server.expressUse("/pdf-manifest", (req: any, res: any, next: any) => {
    // Extract filename from path: /pdf-manifest/daisy.pdf → daisy.pdf
    const file = decodeURIComponent(req.path.replace(/^\//, ""));
    if (!file) {
      next();
      return;
    }

    const filename = path.basename(file);
    const title = filename.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");

    const pdfHref = `/pdfs/${file}`;
    const manifestHref = `/pdf-manifest/${encodeURIComponent(file)}`;

    const manifest = {
      "@context": "https://readium.org/webpub-manifest/context.jsonld",
      metadata: {
        "@type": "https://schema.org/Book",
        conformsTo: "https://readium.org/webpub-manifest/profiles/pdf",
        title: title,
        identifier: `urn:pdf:${filename}`,
      },
      links: [
        { rel: "self", href: manifestHref, type: "application/webpub+json" },
        { rel: "alternate", href: pdfHref, type: "application/pdf" },
      ],
      readingOrder: [
        {
          href: pdfHref,
          type: "application/pdf",
          title: title,
        },
      ],
      resources: [{ href: pdfHref, type: "application/pdf" }],
    };

    res.json(manifest);
  });

  // ── Internet Archive → Readium Audiobook manifest ──────────────────
  //
  // GET /archive/{ID}/manifest.json
  // Fetches IA item metadata, picks the highest-quality MP3 derivatives
  // per track, and returns a Readium Audiobook Profile manifest. IA
  // serves audio with permissive CORS so the manifest plays directly
  // without proxying.
  server.expressUse("/archive", async (req: any, res: any, next: any) => {
    // /archive/<id>/manifest.json — pull the id segment.
    const m = req.path.match(/^\/([^/]+)\/manifest\.json\/?$/);
    if (!m) {
      next();
      return;
    }
    const id = decodeURIComponent(m[1]);
    const selfUrl = `${req.protocol}://${req.get("host")}/archive/${encodeURIComponent(id)}/manifest.json`;
    try {
      const manifest = await manifestFromArchive(id, selfUrl);
      res.setHeader("Content-Type", "application/audiobook+json");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(manifest);
    } catch (err: any) {
      console.error(`[archive] ${id}:`, err?.message ?? err);
      res.status(502).json({
        error: "Failed to build manifest",
        id,
        message: String(err?.message ?? err),
      });
    }
  });

  // ── EPUB fetch (pass-through for CORS-restricted URLs) ─────────────

  server.expressUse("/api/fetch-epub", async (req: any, res: any) => {
    const url = req.query.url;
    if (!url) {
      res.status(400).send("Missing ?url= parameter");
      return;
    }
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        res.status(response.status).send(response.statusText);
        return;
      }
      res.set("Content-Type", "application/epub+zip");
      res.set("Access-Control-Allow-Origin", "*");
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error: any) {
      res.status(500).send(error.message || "Fetch failed");
    }
  });

  // ── Publications API ────────────────────────────────────────────────

  server.expressUse("/api/publications", (req: any, res: any) => {
    res.json(publications);
  });

  // ── Scan local files ────────────────────────────────────────────────

  const epubsPath = path.join(__dirname, "./epubs");

  // Scan EPUBs
  recursive(epubsPath, ["!*.epub"], function (err, files) {
    if (err) {
      console.error("Error scanning EPUBs:", err);
      return;
    }

    const filePaths = files.map((fileName) => path.join(fileName));
    const publicationURLs = server.addPublications(filePaths);
    console.log(`📚 Found ${publicationURLs.length} EPUB(s)`);

    // Add EPUBs to our publications list
    filePaths.forEach((filePath, i) => {
      const filename = path.basename(filePath);
      const title = filename.replace(/\.epub$/i, "").replace(/[_-]/g, " ");
      const manifestUrl = publicationURLs[i];

      publications.push({
        title,
        filename,
        type: "epub",
        viewers: [
          {
            title: "DITA Reader (ReadiumCSS v1)",
            url: `/viewer/index_dita.html?url=${manifestUrl}`,
          },
          {
            title: "DITA Reader (ReadiumCSS v2)",
            url: `/viewer/index_dita_v2.html?url=${manifestUrl}`,
          },
          {
            title: "Minimal",
            url: `/viewer/index_minimal.html?url=${manifestUrl}`,
          },
          {
            title: "API Test",
            url: `/viewer/index_api.html?url=${manifestUrl}`,
          },
          {
            title: "Sample Read",
            url: `/viewer/index_sampleread.html?url=${manifestUrl}`,
          },
          {
            title: "Injectables",
            url: `/viewer/index_injectables.html?url=${manifestUrl}`,
          },
          {
            title: "Small Window (600×500)",
            url: `/viewer/index_small_window.html?url=${manifestUrl}`,
          },
        ],
      });
    });
  });

  // ── Local audiobooks ────────────────────────────────────────────────
  //
  // The Readium Audiobook Profile distribution format is the W3C
  // Lightweight Packaging Format (LPF) — a ZIP file containing a
  // manifest.json and the audio resources, conventionally with the
  // `.audiobook` extension. Drop one in examples/epubs/ alongside
  // .epub and .pdf files; the server unpacks it on startup so the
  // viewer can fetch the manifest and audio over plain HTTP.

  const audiobookCachePath = path.join(__dirname, "./.audiobook-cache");
  if (!fs.existsSync(audiobookCachePath)) {
    fs.mkdirSync(audiobookCachePath, { recursive: true });
  }
  //@ts-ignore
  server.expressUse("/audiobook-cache", express.static(audiobookCachePath));

  recursive(epubsPath, ["!*.audiobook"], function (err, files) {
    if (err) {
      console.error("Error scanning audiobooks:", err);
      return;
    }
    console.log(`🎧 Found ${files.length} audiobook(s)`);
    files.forEach((filePath) => {
      const filename = path.basename(filePath);
      const basename = filename.replace(/\.audiobook$/i, "");
      const title = basename.replace(/[_-]/g, " ");
      const cacheDir = path.join(audiobookCachePath, basename);

      // Re-extract if the cache is missing or older than the source.
      const cacheStale =
        !fs.existsSync(cacheDir) ||
        !fs.existsSync(path.join(cacheDir, "manifest.json")) ||
        fs.statSync(filePath).mtimeMs > fs.statSync(cacheDir).mtimeMs;

      if (cacheStale) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        fs.mkdirSync(cacheDir, { recursive: true });
        try {
          execSync(`unzip -q -o "${filePath}" -d "${cacheDir}"`);
        } catch (extractError) {
          console.error(`Failed to extract ${filename}:`, extractError);
          return;
        }
      }

      publications.push({
        title,
        filename,
        type: "audiobook",
        viewers: [
          {
            title: "Audiobook Reader",
            url: `/viewer/index_audiobook.html?url=/audiobook-cache/${basename}/manifest.json`,
          },
          {
            title: "Minimal Player",
            url: `/viewer/index_audiobook_minimal.html?url=/audiobook-cache/${basename}/manifest.json`,
          },
        ],
      });
    });
  });

  // Scan PDFs
  recursive(epubsPath, ["!*.pdf"], function (err, files) {
    if (err) {
      console.error("Error scanning PDFs:", err);
      return;
    }

    console.log(`📄 Found ${files.length} PDF(s)`);

    files.forEach((filePath) => {
      const relativePath = path
        .relative(epubsPath, filePath)
        .replace(/\\/g, "/");
      const filename = path.basename(filePath);
      const title = filename.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");
      publications.push({
        title,
        filename,
        type: "pdf",
        viewers: [
          {
            title: "PDF Viewer",
            url: `/viewer/index_pdf.html?url=/pdf-manifest/${encodeURIComponent(relativePath)}`,
          },
        ],
      });
    });
  });

  // ── Start server ────────────────────────────────────────────────────

  const data = await server.start(4444, false);

  console.log(
    `\n🚀 R2D2BC Library: http://localhost:${data.urlPort}/viewer/index.html\n`
  );
}

(async () => {
  await start();
})();
