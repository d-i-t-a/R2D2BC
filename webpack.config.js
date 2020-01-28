const path = require("path");

module.exports = [{
  mode: 'production',
  devtool: 'source-map',
  entry: "./src/index.ts",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: "ts-loader"
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  output: {
    filename: "reader.js",
    library: "D2Reader",
    path: path.resolve(__dirname, "dist")
  }
},{
    mode: 'production',
    devtool: 'source-map',
    entry: "./injectables/glossary/glossary.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader"
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"]
    },
    output: {
      filename: "glossary.js",
      library: "Glossary",
      path: path.resolve(__dirname, "dist/injectables/glossary")
    }
  },{
    mode: 'production',
    devtool: 'source-map',
    entry: "./injectables/click/click.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader"
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"]
    },
    output: {
      filename: "click.js",
      library: "Click",
      path: path.resolve(__dirname, "dist/injectables/click")
    }
  },{
    mode: 'production',
    devtool: 'source-map',
    entry: "./injectables/footnotes/footnotes.ts",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader"
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"]
    },
    output: {
      filename: "footnotes.js",
      library: "Footnotes",
      path: path.resolve(__dirname, "dist/injectables/footnotes")
    }
  }
];
