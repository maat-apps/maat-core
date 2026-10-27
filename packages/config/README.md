# @maat-apps/config

The shared ESLint, Prettier and TypeScript base configs of every maat-apps
repo, plus the plugins they load (as regular dependencies — a repo doesn't
install them itself). Extracted from
[`routines`](https://github.com/maat-apps/routines), the reference
implementation.

A repo still lists the tools themselves in its `devDependencies` — `eslint`,
`prettier` and `typescript` (the peers of this package), because npm only
links a package's binaries from the repo's own dependencies.

## ESLint

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import { baseConfig } from "@maat-apps/config/eslint";

export default defineConfig([
  ...baseConfig,
  // repo-specific rules and ignores go after the base
  globalIgnores([".claude/worktrees/**"]),
]);
```

## Prettier

```js
// prettier.config.mjs
export { default } from "@maat-apps/config/prettier";
```

Sorts imports and Tailwind classes. A repo with no Tailwind stylesheet of
its own can use the `withoutTailwind` export instead.

## TypeScript

```json
{
  "extends": "@maat-apps/config/tsconfig.base.json",
  "compilerOptions": { "target": "ES2022", "jsx": "react-jsx" }
}
```

Only the strict compiler options; `target`, `lib`, `jsx`, `paths` and
`include` vary per tsconfig and stay local.

## Vite

```ts
// vite.config.ts
import { appViteConfig } from "@maat-apps/config/vite";
import { defineConfig } from "vite";

export default defineConfig(
  appViteConfig({ name: "my-app", root: import.meta.dirname }),
);
```

React, the PWA (`injectManifest` from `src/sw.ts`, registered by the app
itself, `public/manifest.json` linked by hand), the GitHub Pages
`404.html` fallback, `base` from `DEPLOY_BASE_PATH` (else `/<name>/`), the
`@` → `src/` alias and Tailwind through PostCSS (`tailwind: false` for a
repo with its own `postcss.config.mjs`). `plugins` adds the repo's own.

## Vitest

```ts
// vitest.config.ts — apart from vite.config.ts, so no build plugin runs in tests
import { appVitestConfig } from "@maat-apps/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig(appVitestConfig({ root: import.meta.dirname }));
```

jsdom, `tests/unit/**/*.test.ts`, one environment for every file
(`isolate: false`), 95% coverage of `src/lib`, `src/hooks` and `src/i18n`
(`coverageInclude`, `threshold` to change), and the shared setup
`@maat-apps/config/vitest-setup`: fake IndexedDB, Testing Library's
cleanup and a short pause for fire-and-forget storage writes after each
test.

Vite, Vitest and their plugins are optional peers: the repo lists them in
its own `devDependencies`, as it does `eslint`.

When a repo's needs genuinely diverge, keep the divergence local rather
than forcing it back here — see
[maat-apps/maat-core#1](https://github.com/maat-apps/maat-core/issues/1).
