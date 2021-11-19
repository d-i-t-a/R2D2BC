/* eslint-disable prettier/prettier */
var path = require("path");
var fse = require("fs-extra");

copyBuildFiles();

function copyBuildFiles() {
  const files = ["README.md"];
  return Promise.all(files.map((file) => copyFile(file))).then(
    createPackageFile
  );
}

function copyFile(file) {
  const libPath = resolveBuildPath(file);
  return new Promise((resolve) => {
    fse.copy(file, libPath, (err) => {
      if (err) throw err;
      resolve();
    });
  }).then(() => console.log(`Copied ${file} to ${libPath}`));
}

function resolveBuildPath(file) {
  return path.resolve(__dirname, "../lib/", path.basename(file));
}

function createPackageFile() {
  return new Promise((resolve) => {
    fse.readFile(
      path.resolve(__dirname, "../package.json"),
      "utf8",
      (err, data) => {
        if (err) {
          throw err;
        }

        resolve(data);
      }
    );
  })
    .then((data) => JSON.parse(data))
    .then((packageData) => {
      const { version, description, dependencies } = packageData;

      const minimalPackage = {
        name: "treeline-r2d2bc",
        author: "dev@abovethetreeline.com",
        version,
        description,
        main: "./index.js",
        peerDependencies: cleanDependencies(dependencies),
      };

      return new Promise((resolve) => {
        const libPath = path.resolve(__dirname, "../lib/package.json");
        const data = JSON.stringify(minimalPackage, null, 2);
        fse.writeFile(libPath, data, (err) => {
          if (err) throw err;
          console.log(`Created package.json in ${libPath}`);
          resolve();
        });
      });
    });
}

function cleanDependencies(depsByName) {
  const depsToRemove = [
    "mark.js",
    "detect-browser",
    "promise-polyfill",
    "whatwg-fetch",
    "browser-detect-devtools",
    "browserslist-useragent",
  ];
  return Object.keys(depsByName)
    .filter((d) => !depsToRemove.includes(d))
    .reduce((cleanedDepsByName, dep) => {
      cleanedDepsByName[dep] = depsByName[dep];
      return cleanedDepsByName;
    }, {});
}
