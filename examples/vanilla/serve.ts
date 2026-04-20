const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Serve the built library (reader.js, reader.css, etc.)
app.use("/dist", express.static(path.join(__dirname, "../../dist")));

// Serve ReadiumCSS v2 from the main viewer bundle
app.use(
  "/readium-css-v2",
  express.static(path.join(__dirname, "../../viewer/readium-css-v2"))
);

// Serve the vanilla example
app.use("/", express.static(__dirname));

app.listen(PORT, () => {
  console.log(`\n🌐 Vanilla example: http://localhost:${PORT}/\n`);
});
