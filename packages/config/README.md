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

When a repo's needs genuinely diverge, keep the divergence local rather
than forcing it back here — see
[maat-apps/maat-core#1](https://github.com/maat-apps/maat-core/issues/1).
