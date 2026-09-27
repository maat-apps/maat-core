import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts so no build/PWA-style plugin
// ever runs during tests — see maat-core/STRUCTURE.md's Testing section.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/unit/setup.ts"],
    isolate: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/hooks/**", "src/i18n/**"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
