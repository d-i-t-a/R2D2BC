const path = require("path");
const webpack = require("webpack");

module.exports = [
  {
    mode: "production",
    devtool: "source-map",
    entry: {
      // index: './src/index.ts',
      reader: "./src/index.ts",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          loader: "ts-loader",
          options: {
            instance: "reader",
            configFile: path.join(__dirname, "src/tsconfig.json"),
          },
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      // Module not found: Error: Can't resolve 'url' in '/node_modules/postcss/lib'
      // BREAKING CHANGE: webpack < 5 used to include polyfills for node.js core modules by default.
      // This is no longer the case. Verify if you need this module and configure a polyfill for it.

      // If you want to include a polyfill, you need to:
      //         - add a fallback 'resolve.fallback: { "url": require.resolve("url/") }'
      //         - install 'url'
      // If you don't want to include a polyfill, you can use an empty module like this:
      //         resolve.fallback: { "url": false }
      fallback: { url: false, util: false },
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: "process",
      }),
    ],
    output: {
      filename: "[name].js",
      library: {
        name: "D2Reader",
        export: "default",
        type: "umd",
      },
      path: path.resolve(__dirname, "dist"),
      iife: true,
    },
  },
  {
    mode: "production",
    devtool: "source-map",
    entry: "./injectables/glossary/glossary.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: {
            instance: "glossary",
            configFile: path.join(__dirname, "injectables/tsconfig.json"),
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "glossary.js",
      library: "Glossary",
      path: path.resolve(__dirname, "dist/injectables/glossary"),
    },
  },
  {
    mode: "production",
    devtool: "source-map",
    entry: "./injectables/click/click.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: {
            instance: "click",
            configFile: path.join(__dirname, "injectables/tsconfig.json"),
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "click.js",
      library: "Click",
      path: path.resolve(__dirname, "dist/injectables/click"),
    },
  },
  {
    mode: "production",
    devtool: "source-map",
    entry: "./injectables/footnotes/footnotes.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: {
            instance: "footnotes",
            configFile: path.join(__dirname, "injectables/tsconfig.json"),
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "footnotes.js",
      library: "Footnotes",
      path: path.resolve(__dirname, "dist/injectables/footnotes"),
    },
  },
];
