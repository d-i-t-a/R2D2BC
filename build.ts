import { build as esbuild, BuildOptions } from "esbuild";
import util from "util";
import chalk from "chalk";
import { Options as SassOptions } from "node-sass";
import fs from "fs/promises";
import { watch } from "chokidar";
import { debounce } from "debounce";
const copy = util.promisify(require("copy"));
const rimraf = util.promisify(require("rimraf"));
const exec = util.promisify(require("child_process").exec);
const sass = util.promisify(require("node-sass").render);

const isWatchEnabled = process.argv[2] === "-w";

/**
 * TO DO:
 *  - Different production and dev bundles when building
 */

/**
 * Generates TS Declarations using tsc. Is pretty slow : /.
 */
async function generateDts() {
  try {
    return await exec(
      `tsc --declaration --emitDeclarationOnly --outFile dist/index.d.ts`
    );
  } catch (e) {
    return Promise.reject(e.stdout);
  }
}

/**
 * Builds Typescript using ESBuild. Super fast and easy.
 */
async function build(
  options: BuildOptions,
  successMsg: string,
  filename: string
) {
  const config: BuildOptions = {
    bundle: true,
    target: "es6",
    sourcemap: true,
    inject: ["./polyfills.js"],
    define: {
      "process.env.NODE_ENV": isWatchEnabled ? "'development'" : "'production'",
      global: "window",
    },
    tsconfig: "tsconfig.json",
    // minify whenever we aren't in watch mode
    minify: !isWatchEnabled,
    outdir: "dist",
    ...options,
  };

  if (config.format === "esm") {
    config.outExtension = { ".js": ".mjs" };
  }

  try {
    const r = await esbuild(config);
    bundled(successMsg, filename);
    return r;
  } catch (e) {
    return Promise.reject(e.stdout);
  }
}

/**
 * Compiles SASS to CSS and writes it to the filesystem
 */
async function compileCss(input: string, filename: string) {
  const options: SassOptions = {
    file: input,
    sourceMap: true,
    outFile: `dist/${filename}.css`,
  };
  try {
    const result = await sass(options);
    const fullPath = `dist/${filename}`;
    const p1 = fs.writeFile(`${fullPath}.css`, result.css);
    const p2 = fs.writeFile(`${fullPath}.map.css`, result.map);
    await Promise.all([p1, p2]);
    bundled("Compiled SASS", `${fullPath}.css`);
  } catch (e) {
    err(`CSS Error (${input})`, e);
  }
}

async function copyCssInjectables() {
  try {
    await copy("injectables/**/*.css", "dist/injectables");
    bundled("Copied CSS injectables", "dist/injectables/**/*.css");
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
 */
async function buildAll() {
  await rimraf("dist/");
  await fs.mkdir("dist");
  console.log("🧹 Cleaned output folder -", chalk.blue("dist/"));

  // build the main entrypoint as an IIFE file
  const p1 = build(
    { format: "iife", entryPoints: ["src/index.ts"], globalName: "D2Reader" },
    "Compiled IIFE (for <script> tags)",
    "dist/index.js"
  );

  // build the main entrypoint as an ES Module
  const p2 = build(
    { format: "esm", entryPoints: ["src/index.ts"] },
    "Compiled ESM (for 'import D2Reader' uses)",
    "dist/index.mjs"
  );

  // generate type declarations
  const p3 = generateDts()
    .then(() => bundled("Generated TS Declarations", "dist/index.d.ts"))
    .catch((e) => err("TS Error", e));

  // compile the injectables separately with their own tsconfig
  const p4 = build(
    {
      format: "iife",
      entryPoints: [
        "injectables/click/click.ts",
        "injectables/footnotes/footnotes.ts",
        "injectables/glossary/glossary.ts",
      ],
      outbase: ".",
      tsconfig: "injectables/tsconfig.json",
    },
    "Compiled injectables",
    "dist/injectables/"
  );
  // copy over the css injectables
  const p5 = copyCssInjectables();

  // compile sass files into reader.css and material.css
  const p6 = compileCss("src/styles/sass/reader.scss", "reader");
  const p7 = compileCss("src/styles/sass/material.scss", "material");

  // wait for everything to finish running in parallel
  await Promise.all([p1, p2, p3, p4, p5, p6, p7]);
  console.log("🔥 Build finished.");
}

// we debounce it so it only runs once ever 100ms
const debouncedBuildAll = debounce(buildAll, 1000);

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
  console.log(
    "👀 Watching for changes in",
    watchPaths.map((v) => '"' + v + '"').join(" | ")
  );
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
const bundled = (msg: string, file: string) => log(`📦 ${msg} -`, file);

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
