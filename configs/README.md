# Shared configs

ESLint, Prettier, and base TypeScript compiler options, extracted from
[`routines`](https://github.com/maat-apps/routines) (the reference
implementation) so a new repo doesn't start its own copy from scratch.

**Copy, don't install.** There's no published `@maat-apps/*` package yet
(tracked separately — see
[maat-apps/maat-core#18](https://github.com/maat-apps/maat-core/issues/18)),
so for now a consuming repo copies the file it needs and wires it in
locally:

- `eslint/base.mjs` — import `baseConfig` from your repo's own
  `eslint.config.mjs` and spread it into that repo's `defineConfig([...])`
  before any repo-specific rules/overrides.
- `prettier/base.json` — copy as your repo's `.prettierrc.json`, or
  `"extends"` it from your own if your tool version supports that. Drop
  `prettier-plugin-tailwindcss` if the repo doesn't use Tailwind.
- `typescript/tsconfig.base.json` — `"extends"` this from each of your
  repo's own `tsconfig.*.json` files, then set `target`/`lib`/`jsx`/
  `paths`/`include` locally (those vary by tsconfig even within one repo,
  e.g. app vs. node vs. e2e).

When a repo's needs genuinely diverge from one of these, keep the
divergence local rather than forcing it back upstream — see
[maat-apps/maat-core#1](https://github.com/maat-apps/maat-core/issues/1).
