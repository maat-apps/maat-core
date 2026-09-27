# `@maat-apps/ui`

Shared, hand-built UI components for `maat-apps` repos — extracted from
[`routines`](https://github.com/maat-apps/routines), per
[maat-apps/maat-core#3](https://github.com/maat-apps/maat-core/issues/3).
A real, installable npm package (see
[#18](https://github.com/maat-apps/maat-core/issues/18)) rather than the
earlier "copy the file into your own repo" posture — install it and get
updates via `npm update` instead of re-applying hand-patches by hand.

```
npm install @maat-apps/ui
```

Each component is its own subpath export (`@maat-apps/ui/button`,
`@maat-apps/ui/drawer`, ...) so a consuming app's bundler only pulls in
what it actually imports; `@maat-apps/ui` (the bare package) re-exports
everything from one barrel for convenience.

## What's here

- `button.tsx` — the shadcn `Button` (all variants/sizes), including the
  one deliberate hand-patch on top of the generated shadcn output: the
  `outline` variant's `disabled:bg-background/40 disabled:backdrop-blur-md`
  treatment.
- `input.tsx` — the shadcn `Input` (text input).
- `select.tsx` — the shadcn `Select` family (`Select`, `SelectTrigger`,
  `SelectContent`, `SelectItem`, `SelectValue`).
- `settings-primitives.tsx` — `SettingsSection`/`SettingsRow`: a titled
  section + labeled-row pattern for any settings-style list, not just app
  settings.
- `drawer.tsx` — the Base UI `Drawer` wrapper with swipe-to-dismiss and
  `useHistoryBackDismiss` (closes on the phone's native back gesture on iOS
  and any browser without `CloseWatcher`).
- `confirm-drawer.tsx` — a destructive-action confirmation bottom sheet
  built on `drawer.tsx`.
- `app-bar.tsx` — back-button + title + optional action header, built on
  `page-header.tsx`.
- `page-header.tsx` — the fixed, edge-to-edge sticky header shell any
  screen's own header (`AppBar` or otherwise) sits in.
- `drag-handle.tsx` — the grab handle for a `@dnd-kit`-sortable row.
- `progress-ring.tsx` — a compact circular completed/total indicator.
- `fab-button.tsx` / `reset-button.tsx` — floating action button and a
  secondary action button, sharing one sizing/shape convention.
- `mobile-gate.tsx` — renders `children` for phone-sized viewports, a
  message otherwise.
- `empty-state.tsx` — a centered "nothing here" message with an optional
  call-to-action button.

`confirm-drawer.tsx`, `app-bar.tsx`, and `mobile-gate.tsx` differ from
routines' originals in one way: routines' versions call its own
`useTranslation()` hook directly for their copy, which a shared component
can't do (no app's i18n module is shared). Here they take the translated
string(s) as props instead — `cancelLabel`/`backLabel`/`message`.
`mobile-gate.tsx` also drops routines' service-worker registration and
`navigator.storage.persist()` calls, which are per-app setup, not part of
the gate shape.

## Setup a consuming app needs

- **Peer dependencies**: `react`, `react-dom` (^19), `@base-ui/react`
  (^1.8.0) — required, must be a single shared instance across the app, so
  they're peers rather than bundled. `@dnd-kit/sortable` is an optional
  peer, only needed if you use `drag-handle.tsx`.
  `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react`
  are regular dependencies of this package — you don't need to install
  them yourself.
- **Same `base-nova`/Tailwind v4 token setup as routines** (design tokens
  themselves aren't included — see below); see
  [`../../configs/shadcn`](../../configs/shadcn) for the shadcn config
  side of that.
- **Tailwind v4 must scan this package's compiled output**, or classes used
  only inside these components get purged from your build. Add a `@source`
  directive to your own Tailwind entry point (next to your other `@import`/
  `@source` lines):
  ```css
  @source "../node_modules/@maat-apps/ui/dist";
  ```
  (path relative to wherever your Tailwind entry CSS file lives).
- `progress-ring.tsx` assumes an `animate-progress-check-pop` Tailwind
  animation exists in your own `globals.css` (routines defines it there) —
  copy that keyframe if you use this component, or drop the class if you
  don't need the pop-in animation.
- `mobile-gate.tsx` assumes a `phone-sized:` custom Tailwind variant exists
  in your `globals.css` (routines defines it as a viewport-width
  `@custom-variant`) — copy that variant definition along with the
  component.
- Design tokens (colors, true-black OLED background, etc.) are **not**
  included — those are per-app product decisions, not shared defaults.

## Not extracted (on purpose) — the coupling audit's result

- **`app-lock-gate.tsx`** — not a UI component wearing app-specific logic,
  but an entire feature (WebAuthn PRF enrollment/unlock state, encryption
  key derivation, multiple screens, an escape-hatch data-erasure flow)
  that happens to render something. If a second app ever wants the
  identical WebAuthn app-lock feature, that's a future
  `@maat-apps/app-lock` **feature** package (state + logic + UI together),
  not a `ui` component.

## Publishing (maintainers)

See the repo root's [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml)
for the normal staged-publish flow (bump this package's `version`, then run
that workflow against `main`). **The very first version of this package is
an exception**: npm's Trusted Publisher connection can only be configured
for a package that already exists on the registry, so version `0.1.0` has
to be published manually once, by a maintainer with an npm account that has
publish rights to the `@maat-apps` org scope:

```
cd packages/ui
npm run build
npm publish --access public
```

After that, register this package's Trusted Publisher entry on npmjs.com
(pointing at `publish.yml`) so every later version can go through the
normal CI-staged flow instead.
