/* eslint-env node */
module.exports = {
  root: true,
  ignorePatterns: ["dist/", "node_modules/"],
  env: {
    browser: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  extends: [
    "eslint:recommended"
  ],
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      parserOptions: {
        sourceType: "module"
      }
    },
    {
      files: ["scripts/**/*.{js,ts}"],
      env: {
        node: true
      }
    }
  ]
};
