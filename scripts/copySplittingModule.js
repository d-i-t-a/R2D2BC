/* eslint-disable prettier/prettier */
var path = require("path");
var fse = require("fs-extra");

copySplittingModule();

function copySplittingModule() {
  const name = path.basename("splitting.js");
  const fullPath = path.resolve(__dirname, "../src/modules/TTS", name);
  const copyToLocation = path.resolve(__dirname, "../lib/modules/TTS", name);
  return copyFile(fullPath, copyToLocation);
}

function copyFile(from, to) {
  return new Promise((resolve) => {
    fse.copy(from, to, (err) => {
      if (err) {
        console.warn(err.message);
      }
      resolve();
    });
  }).then(() => console.log(`Copied ${from} to ${to}`));
}
