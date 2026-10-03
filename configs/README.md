# Shared configs

Files a repo copies into itself. ESLint, Prettier and the base TypeScript
compiler options are not among them: they are installed from
[`@maat-apps/config`](../packages/config) (`packages/config`).

- `claude/` — the Claude Code standard every app follows, copied into the
  app's `.claude/` (`create-maat-app` does this for new apps):
  - `commands/open-pr.md`, `commands/pr-description.md` — the PR
    workflow: push, open the PR with a generated description, merge once
    CI is green (STRUCTURE.md's PR workflow).
  - `skills/` — Clean Code skills for TypeScript (`boy-scout`, which
    triggers on TypeScript edits and orchestrates the rest, plus
    `typescript-clean-code`, `clean-names`, `clean-functions`,
    `clean-comments`, `clean-general`, `clean-tests`), imported from
    [ertugrul-dmr/clean-code-skills](https://github.com/ertugrul-dmr/clean-code-skills)
    (MIT, license included). The app's own `CLAUDE.md` wins where a rule
    conflicts with it.

  Keep app copies identical to these; change the standard here first,
  then sync it into each app.

- `workflows/` — each app's `.github/workflows/` (`create-maat-app`
  copies them): `ci.yml`, `cd.yml`, `deploy-preview.yml`,
  `pr-preview-cleanup.yml`. They only hold the per-repo parts (triggers
  with path filters, permissions, concurrency) and call maat-core's
  reusable workflows (`.github/workflows/app-*.yml`) for the actual
  pipeline — so a CI fix lands once, for every app. See STRUCTURE.md's CI
  section.

When a repo's needs genuinely diverge from one of these, keep the
divergence local rather than forcing it back upstream — see
[maat-apps/maat-core#1](https://github.com/maat-apps/maat-core/issues/1).
