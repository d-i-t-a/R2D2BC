import { build as esbuild, BuildOptions } from "esbuild";
import * as util from "util";
import chalk from "chalk";
import { promises as fs } from "fs";
import { watch } from "chokidar";
import debounce from "debounce";
import child_process0 from "child_process";
import sass0 from "sass";
import { rimraf } from "rimraf";
import { glob } from "glob";
import path from "path";

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
    // updated for 2025: Chrome 109+ (2023), Firefox 115+ (2023 ESR), Safari 16+ (2022), Edge 109+ (2023)
    target: ["chrome109", "firefox115", "safari16", "edge109"],
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

async function copyInjectables(pattern: string, label: string) {
  try {
    const files = await glob(pattern);
    for (const file of files) {
      const dest = path.join("dist", file);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(file, dest);
    }
    logBundled(`Copied ${label} injectables`, `dist/${pattern}`);
  } catch (e) {
    err(`${label} Copy Error: `, e as string);
  }
}

/**
 * Copies pdfjs-dist assets to dist/ so consumers can self-host the worker
 * instead of relying on the CDN fallback.
 *
 * Consumers using the ESM build can configure the worker path via:
 *   PDFNavigator.create({ ..., workerSrc: "/path/to/pdf.worker.min.mjs" })
 */
/**
 * Copies the AudioWorklet processor used by `WebAudioEngine` to `dist/`
 * so consumers can serve it directly. The worklet must be loaded by URL
 * (browsers don't accept inline worklets), so it can't be inlined in
 * the bundle. Consumers point `D2Reader.load({ preservePitchWorkletUrl })`
 * (or call `setPreservePitchWorkletUrl()` directly) at this file's URL.
 */
async function copyAudioWorklet() {
  try {
    await fs.copyFile(
      "src/navigator/audio/PreservePitchProcessor.js",
      "dist/PreservePitchProcessor.js"
    );
    logBundled(
      "Copied PreservePitch worklet",
      "dist/PreservePitchProcessor.js"
    );
  } catch (e) {
    err("AudioWorklet copy error", e as string);
  }
}

async function copyPdfjsAssets() {
  try {
    await fs.copyFile(
      "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
      "dist/pdf.worker.min.mjs"
    );
    logBundled("Copied PDF.js worker", "dist/pdf.worker.min.mjs");
    await fs.copyFile(
      "node_modules/pdfjs-dist/web/pdf_viewer.css",
      "dist/pdf_viewer.css"
    );
    logBundled("Copied PDF.js viewer CSS", "dist/pdf_viewer.css");
    // pdf_viewer.css references SVG icons as relative paths (images/*.svg).
    // Copy the entire images/ directory so annotation editor icons (delete,
    // highlight, cursors, etc.) resolve correctly when the CSS is served.
    await fs.mkdir("dist/images", { recursive: true });
    const imgSrc = "node_modules/pdfjs-dist/web/images";
    const imgDst = "dist/images";
    const svgs = await fs.readdir(imgSrc);
    await Promise.all(
      svgs.map((f) => fs.copyFile(`${imgSrc}/${f}`, `${imgDst}/${f}`))
    );
    logBundled("Copied PDF.js viewer images", "dist/images/");
  } catch (e) {
    err("PDF.js assets copy error", e as string);
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
  const p5 = copyInjectables("injectables/**/*.css", "CSS");
  const p6 = copyInjectables("injectables/**/*.js", "JS");

  // compile sass files
  // - reader.css: visual reader (EPUB; PDF UI later if added)
  // - player.css: audiobook player UI (timeline scrubber + future controls)
  const p7 = compileCss("src/styles/sass/reader.scss", "reader");
  const p7b = compileCss("src/styles/sass/player.scss", "player");

  // copy pdfjs-dist worker + viewer CSS for self-hosting
  const p8 = copyPdfjsAssets();

  // copy AudioWorklet processor for self-hosting
  const p9 = copyAudioWorklet();

  // wait for everything to finish running in parallel
  await Promise.all([p1, p2, p3, p4, p5, p6, p7, p7b, p8, p9]);
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
