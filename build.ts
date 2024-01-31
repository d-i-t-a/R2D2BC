import { build as esbuild, BuildOptions } from "esbuild";
import * as util from "util";
import chalk from "chalk";
import { promises as fs } from "fs";
import { watch } from "chokidar";
import debounce from "debounce";
import copy0 from "copy";
import child_process0 from "child_process";
import sass0 from "sass";
import { rimraf } from "rimraf";

const copy = util.promisify(copy0);
const exec = util.promisify(child_process0.exec);
const sass = util.promisify(sass0.render);

const isWatchEnabled = process.argv[2] === "-w";
// for now, we bundle for production whenever we aren't in watch mode
const isProduction = !isWatchEnabled;

/**
 * Generates TS Declarations using tsc. Is pretty slow : /.
 */
async function generateDts() {
  try {
    return await exec(
      `tsc --declaration --emitDeclarationOnly --declarationDir dist/types`
    );
  } catch (e) {
    return Promise.reject(e.stdout);
  }
}

/**
 * Builds Typescript (or JS) using ESBuild. Super fast and easy.
 */
async function buildTs(
  options: BuildOptions,
  successMsg: string,
  filename: string
) {
  const config: BuildOptions = {
    bundle: true,
    // what browsers we want to support, this is basically all >1% usage
    target: ["chrome89", "firefox88", "safari14", "edge90"],
    sourcemap: true,
    // we include some node.js polyfills
    inject: ["./polyfills.js"],
    define: {
      // note these need to be double quoted if we want to define string constants
      "process.env.NODE_ENV": isProduction ? "'production'" : "'development'",
      // the Node.js util polyfill uses "global" instead of "window" annoyingly
      global: "globalThis",
    },
    tsconfig: "tsconfig.json",
    ...options,
  };

  try {
    const r = await esbuild(config);
    logBundled(successMsg, filename);
    return r;
  } catch (e) {
    return Promise.reject(e.stdout);
  }
}

/**
 * Compiles SASS to CSS and writes it to the filesystem
 */
async function compileCss(input: string, filename: string) {
  const options = {
    file: input,
    sourceMap: true,
    outFile: `dist/${filename}.css`,
    bundle: false,
    outputStyle: "compressed",
  };
  try {
    const result = await sass(options);
    const fullPath = `dist/${filename}`;
    const p1 = fs.writeFile(`${fullPath}.css`, result.css);
    const p2 = fs.writeFile(`${fullPath}.css.map`, result.map);
    await Promise.all([p1, p2]);
    logBundled("Compiled SASS", `${fullPath}.css`);
  } catch (e) {
    err(`CSS Error (${input})`, e);
  }
}

async function copyCssInjectables() {
  try {
    await copy("injectables/**/*.css", "dist/injectables");
    logBundled("Copied CSS injectables", "dist/injectables/**/*.css");
  } catch (e) {
    err("CSS Copy Error: ", e);
  }
}
async function copyJsInjectables() {
  try {
    await copy("injectables/**/*.js", "dist/injectables");
    logBundled("Copied JS injectables", "dist/injectables/**/*.js");
  } catch (e) {
    err("CSS Copy Error: ", e);
  }
}

/**
 * Build pipeline:
 *  - clean the build folder
 *  - build iife version (for: <script href="https://../d2reader.js" />)
 *  - build esm version (for: import D2Reader from "@d-i-t-a/reader")
 *  - build SASS
 *  - generate TS declarations
 *  - Build iife version of injectables to dist
 *  - copy injectables css to dist
 *
 *  Do all of this in parallel and wait for it all to finish.
 *  Optionally watch for changes!
 */
async function buildAll() {
  await rimraf("dist/");
  await fs.mkdir("dist");
  console.log("🧹 Cleaned output folder -", chalk.blue("dist/"));

  // build the main entrypoint as an IIFE module for use in a
  // <script> tag. This is built at dist/reader.js for backwards
  // compatibility
  const p1 = buildTs(
    {
      format: "iife",
      entryPoints: ["src/index.ts"],
      globalName: "D2Reader",
      outfile: "dist/reader.js",
      minify: isProduction,
    },
    "Compiled IIFE (for <script> tags)",
    "dist/reader.js"
  );

  // build the main entrypoint as an ES Module.
  // This one doesn't need to be minified because it will
  // be rebundled by the consumer's bundler
  const p2 = buildTs(
    {
      format: "esm",
      entryPoints: ["src/index.ts"],
      outdir: "dist/esm",
      minify: false,
    },
    "Compiled ESM (for 'import D2Reader' uses)",
    "dist/esm/index.js"
  );

  // generate type declarations
  const p3 = generateDts()
    .then(() => logBundled("Generated TS Declarations", "dist/index.d.ts"))
    .catch((e) => err("TS Error", e));

  // compile the injectables separately with their own tsconfig
  const p4 = buildTs(
    {
      format: "iife",
      entryPoints: ["injectables/click/click.ts"],
      outbase: ".",
      tsconfig: "injectables/tsconfig.json",
      outdir: "dist",
    },
    "Compiled injectables",
    "dist/injectables/"
  );

  // copy over the css and js injectables
  const p5 = copyCssInjectables();
  const p6 = copyJsInjectables();

  // compile sass files into reader.css and material.css
  const p7 = compileCss("src/styles/sass/reader.scss", "reader");

  // wait for everything to finish running in parallel
  await Promise.all([p1, p2, p3, p4, p5, p6, p7]);
  console.log("🔥 Build finished.");
}

// debounce the build command so that it only ever runs once every 100ms
// in watch mode
const debouncedBuildAll = debounce(buildAll, 1000);

// starts chokidar to watch the directory for changes
async function startWatcher() {
  const ignored = [
    "parcel-dist",
    ".parcel-cache",
    ".git",
    "node_modules",
    "dist",
    "examples",
    "viewer",
  ];
  const watchPaths = ["."];
  console.log("👀 Watching for changes...");
  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    ignorePermissionErrors: true,
    ignored,
  });

  watcher.on("all", async (type: string, file: string) => {
    console.log(`\n🕝 Change detected: ${type} ${file}`);
    debouncedBuildAll();
  });
}

/**
 * Some logging utils
 */
const log = (msg: string, file?: string) => console.log(msg, chalk.blue(file));
const err = (title: string, e: string) =>
  console.error(chalk.red(`❌ ${title}:`), e);
const logBundled = (msg: string, file: string) => log(`📦 ${msg} -`, file);

/**
 * The main entrypoint for the script
 */
console.log(
  `🌪  Building D2Reader${isWatchEnabled ? " in watch mode..." : "..."}`
);
buildAll().then(() => {
  if (isWatchEnabled) {
    startWatcher();
  }
});
