const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Serve the built library (reader.js, reader.css, etc.)
app.use("/dist", express.static(path.join(__dirname, "../../dist")));

// Serve ReadiumCSS v2 from the npm package
app.use(
  "/node_modules/@readium/css/css/dist",
  express.static(
    path.join(__dirname, "../../node_modules/@readium/css/css/dist")
  )
);

// Serve the DITA patch overlay (local — not in the npm package)
app.use(
  "/viewer/readium-css-v2",
  express.static(path.join(__dirname, "../../viewer/readium-css-v2"))
);

// Serve the vanilla example
app.use("/", express.static(__dirname));

app.listen(PORT, () => {
  console.log(`\n🌐 Vanilla example: http://localhost:${PORT}/\n`);
});
