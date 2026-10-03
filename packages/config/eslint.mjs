// Shared ESLint base for a Vite + React + TypeScript maat-apps repo. Import
// `baseConfig` from the repo's own eslint.config.mjs and add repo-specific
// overrides after it. Extracted from routines' eslint.config.mjs — see
// maat-apps/maat-core#1.
import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export const baseConfig = defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  reactRefresh.configs.vite,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
  {
    // Node-run scripts: root config files and any Claude Code hook scripts.
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
