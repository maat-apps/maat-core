// Lints this repo with the same shared base it ships to apps
// (packages/config), so a rule change there is exercised here first.
import { defineConfig, globalIgnores } from "eslint/config";
import { baseConfig } from "./packages/config/eslint.mjs";

export default defineConfig([
  baseConfig,
  {
    // A component library, not an app: files co-export variant helpers
    // (e.g. buttonVariants) next to components, and fast refresh never
    // applies to published package code.
    files: ["packages/ui/src/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Templates contain {{TOKENS}} replaced at scaffold time, so they aren't
  // valid source until create-maat-app has copied them into an app.
  globalIgnores([
    "**/dist/**",
    "packages/create-maat-app/templates/**",
    ".claude/worktrees/**",
  ]),
]);
