import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { touchSwipe } from "./tests/browser/commands";

// This package's tsconfig has no Node types (its sources run in browsers);
// the config only needs one environment variable.
declare const process: { env: Record<string, string | undefined> };

// Two projects: jsdom for behavior that needs no layout, and a real
// Chromium (Vitest browser mode) for what jsdom can't do — media queries,
// touch gestures, font loading. Shared components' behavior is tested here
// once, so apps' e2e suites only check that they wired a component in
// (maat-core STRUCTURE.md's Testing section).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          exclude: ["tests/browser/**"],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        plugins: [tailwindcss()],
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.tsx"],
          setupFiles: ["tests/browser/setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            // A preinstalled Chromium (e.g. a sandbox without
            // `playwright install`) is picked up from this variable.
            provider: playwright({
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
              },
              contextOptions: { hasTouch: true },
            }),
            instances: [{ browser: "chromium" }],
            commands: { touchSwipe },
          },
        },
      },
    ],
  },
});
