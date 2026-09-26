# @maat-apps/placeholder

Not a real package. Its only job is proving the npm workspaces
publish/consume loop works end-to-end (claim the `@maat-apps` scope →
`npm publish` from CI → `npm install @maat-apps/placeholder` in a real
app → bump the version → confirm the app picks it up) before any real
content (`@maat-apps/ui`, `@maat-apps/config`, ...) depends on that loop
actually working. See
[maat-apps/maat-core#18](https://github.com/maat-apps/maat-core/issues/18).

Delete this package once a real one has published successfully at least
once.
