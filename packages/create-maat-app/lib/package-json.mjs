/** The generated repo's package.json — a trimmed baseline vs. routines' own
 * (no @dnd-kit, no reactive AppData store — see maat-core/STRUCTURE.md for
 * what's actually generic vs. routines-specific). Add those back per-app
 * once needed. PWA/service-worker support and the manual update mechanism
 * (vite-plugin-pwa, src/sw.ts, src/lib/app-update.ts, src/hooks/
 * use-install-prompt.ts) *are* part of the generic baseline (a deliberate
 * reversal of an earlier decision to exclude them) — every app gets an
 * installable, offline-capable shell and a way to force-update it out of
 * the box. */
export function buildPackageJson(appName, desktop = false) {
  const e2eProjects = desktop
    ? ["desktop-chromium", "desktop-webkit"]
    : ["mobile-chromium", "mobile-iphone"];
  return {
    name: appName,
    version: "1.0.0",
    private: true,
    type: "module",
    engines: {
      node: ">=24",
      npm: ">=11",
    },
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview",
      lint: "eslint",
      "lint:fix": 'eslint "**/*.{ts,tsx,js,jsx}" --fix',
      "format:check": "prettier --check .",
      format: "prettier --write .",
      typecheck: "tsc -b",
      "test:unit": "vitest run",
      "test:unit:watch": "vitest",
      "test:coverage": "vitest run --coverage",
      "test:e2e": `playwright test ${e2eProjects.map((project) => `--project=${project}`).join(" ")}`,
      validate:
        "npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npm run test:e2e && npm run build && npm audit",
      "validate:fix": "npm run lint:fix && npm run format && npm audit fix",
    },
    dependencies: {
      "@fontsource-variable/outfit": "^5.3.0",
      react: "^19",
      "react-dom": "^19",
      "react-router": "^7",
      valibot: "^1.5.0",
    },
    devDependencies: {
      "@eslint/js": "^9",
      "@playwright/test": "^1.63.0",
      "@tailwindcss/postcss": "^4",
      "@testing-library/react": "^16.3.3",
      "@types/node": "^24",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "@vitejs/plugin-react": "^5",
      "@vitest/coverage-v8": "^5",
      eslint: "^10",
      "eslint-config-prettier": "^10",
      "eslint-plugin-prettier": "^5",
      "eslint-plugin-react-hooks": "^7",
      "eslint-plugin-react-refresh": "^0.4",
      "fake-indexeddb": "^6.2.5",
      globals: "^16",
      jsdom: "^30",
      prettier: "^3",
      "prettier-plugin-organize-imports": "^4",
      "prettier-plugin-tailwindcss": "^0.8",
      tailwindcss: "^4",
      typescript: "^5",
      "typescript-eslint": "^8",
      vite: "^7",
      "vite-plugin-pwa": "^1.1.0",
      vitest: "^5",
    },
  };
}
