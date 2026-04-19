import { Server } from "r2-streamer-js";
import * as express from "express";
import * as path from "path";

import recursive from "recursive-readdir";

interface PublicationEntry {
  title: string;
  filename: string;
  type: "epub" | "pdf";
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
          title: "DITA Reader",
          url: `/viewer/index_dita.html?url=https://alice.dita.digital/manifest.json`,
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
            title: "DITA Reader",
            url: `/viewer/index_dita.html?url=${manifestUrl}`,
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
