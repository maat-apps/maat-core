import type { ViteUserConfig } from "vitest/config";

export type AppVitestConfigOptions = {
  /** The app's root, `import.meta.dirname` — for `@/`. */
  root: string;
  /** What coverage counts; views are e2e's. */
  coverageInclude?: string[];
  /** Every coverage threshold, in percent. */
  threshold?: number;
};

/**
 * jsdom, `tests/unit/**\/*.test.ts`, the shared setup
 * (`@maat-apps/config/vitest-setup`), one environment for every file and
 * the coverage thresholds. Kept apart from the Vite config so no build
 * plugin runs during tests.
 */
export function appVitestConfig(
  options: AppVitestConfigOptions,
): ViteUserConfig;
