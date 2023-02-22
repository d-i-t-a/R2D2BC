// ES5 import (assuming node_modules/r2-streamer-js/):
import { Server } from "dita-streamer-js";
import * as express from "express";
import * as path from "path";
import recursive from "recursive-readdir";

async function start() {
  // Constructor parameter is optional:
  // disableDecryption: true
  // disableOPDS
  // disableReaders: true
  // disableRemotePubUrl: true to deactivate
  const server = new Server({
    disableDecryption: true, // deactivates the decryption of encrypted resources (Readium LCP).
    disableOPDS: true, // deactivates the HTTP routes for the OPDS "micro services" (browser, converter)
    disableReaders: false, // deactivates the built-in "readers" for ReadiumWebPubManifest (HTTP static host / route).
    disableRemotePubUrl: true, // deactivates the HTTP route for loading a remote publication.
    maxPrefetchLinks: 5, // Link HTTP header, with rel = prefetch, see server.ts MAX_PREFETCH_LINKS (default = 10)
    readers: [
      {
        title: "Dita Example",
        getUrl: (url) => `/viewer/index_dita.html?url=${url}`,
      },
      {
        title: "Dita Sample Read",
        getUrl: (url) => `/viewer/index_sampleread.html?url=${url}`,
      },
      {
        title: "Minimal Example",
        getUrl: (url) => `/viewer/index_minimal.html?url=${url}`,
      },
      {
        title: "API Example",
        getUrl: (url) => `/viewer/index_api.html?url=${url}`,
      },
      {
        title: "Static Placeholder PDF Example",
        getUrl: (url) => `/viewer/index_pdf.html?url=${url}`,
      },
    ],
  });

  /**
   * Serve our viewer examples, and allow unresolved requests to fall through
   * to the following static handler from /dist
   */
  server.expressUse(
    "/viewer",
    //@ts-ignore
    express.static(path.join(__dirname, "../viewer"), { fallthrough: true })
  );

  /**
   * Serve our built application bundles from /dist
   */
  // @ts-ignore
  server.expressUse("/viewer", express.static(path.join(__dirname, "../dist")));

  /**
   * Serve our sample EPUBS from /examples/epubs
   */
  const epubsPath = path.join(__dirname, "./epubs");

  recursive(epubsPath, ["!*.epub"], function (err, files) {
    if (err) return console.error(err);
    const filePaths = files.map((fileName) => path.join(fileName));
    const publicationURLs = server.addPublications(filePaths);
    console.log("Local Publications: ", publicationURLs.length);
  });

  const data = await server.start(4444, false);

  // http://127.0.0.1:3000
  // Note that ports 80 and 443 (HTTPS) are always implicit (ommitted).
  console.log(
    `Dev server (R2 Streamer) running at url: http://localhost:${data.urlPort}}`
  );

  // // Calls `uncachePublications()` (see below)
  // server.stop();

  // console.log(server.isStarted()); // false
}

(async () => {
  await start();
})();
