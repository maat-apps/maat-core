import { resolve } from "node:path";

/** The Vitest config every app tests with — see vitest.d.mts. */
export function appVitestConfig({
  root,
  coverageInclude = ["src/lib/**", "src/hooks/**", "src/i18n/**"],
  threshold = 95,
}) {
  return {
    resolve: {
      alias: { "@": resolve(root, "src") },
    },
    test: {
      environment: "jsdom",
      include: ["tests/unit/**/*.test.ts"],
      setupFiles: ["@maat-apps/config/vitest-setup"],
      // One jsdom for every file: each file restores what it stubs.
      isolate: false,
      coverage: {
        provider: "v8",
        include: coverageInclude,
        thresholds: {
          lines: threshold,
          statements: threshold,
          functions: threshold,
          branches: threshold,
        },
      },
    },
  };
}
