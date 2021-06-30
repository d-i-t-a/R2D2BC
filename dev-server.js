const express = require("express");
const app = express();
const port = 8080;

/**
 * Serve both the "viewer" and the "dist" directories statically
 */
app.use(express.static("viewer"));
app.use(express.static("dist"));

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
