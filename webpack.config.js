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
};
  }
];
