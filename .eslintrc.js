module.exports = {
  extends: [
    // extends from the create-react-app prettier config, which
    // is not react-specific, but just a good set of defaults
    "react-app",
    // this disables the errors that prettier fixes automatically
    // and runs prettier as part of eslint --fix
    "plugin:prettier/recommended",
  ],
  settings: {
    react: {
      // Fix for a warning coming from the react-app config when there is
      // no react installed.
      version: "999.999.999",
    },
  },
  rules: {
    // allow unused vars and params that start with an underscore: _unused
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    // turn off the disallowing of "use-strict"
    strict: 0,
    // turn this off for now, but we should throw errors in the future
    "no-throw-literal": 0,
  },
};
