import js from "@eslint/js";
import globals from "globals";

export default [
  {
    // Generated word lists and build/output artifacts.
    ignores: [
      "src/data/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "local/**",
      // The dictionary submodule is a separate repo with its own tooling.
      "wordlists/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["sw.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.serviceworker } },
  },
  {
    files: ["scripts/**/*.js", "test/**/*.js", "*.config.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } },
  },
  {
    // E2E specs run under Node but contain callbacks evaluated in the browser
    // (page.evaluate / addInitScript), so allow both global sets.
    files: ["e2e/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  },
];
