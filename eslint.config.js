const js = require("@eslint/js");
const prettier = require("eslint-plugin-prettier/recommended");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
        Bun: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "warn",
    },
  },
  {
    // Ignore patterns replace .eslintignore
    ignores: ["coverage/", "node_modules/"],
  },
];
