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
- `field.tsx` — the shadcn/baseui-cn `Field` family (`Field`, `FieldLabel`,
  `FieldItem`, `FieldDescription`, `FieldError`) — a labeled-control
  wrapper, pulled in as a dependency of `date-picker.tsx`.
- `popover.tsx` — the shadcn `Popover` family (`Popover`, `PopoverTrigger`,
  `PopoverContent`, plus `PopoverHeader`/`PopoverTitle`/`PopoverDescription`),
  also a dependency of `date-picker.tsx`.
- `chart.tsx` — the shadcn `Chart` family (`ChartContainer`, `ChartConfig`,
  `ChartTooltip`/`ChartTooltipContent`, `ChartLegend`/`ChartLegendContent`,
  `ChartStyle`) wrapping [Recharts](https://recharts.org), per
  [maat-apps/maat-core#35](https://github.com/maat-apps/maat-core/issues/35).
  Series colors are set via `ChartConfig`'s `color`/`theme` and consumed as
  CSS custom properties (`--color-<key>`) scoped to each chart's
  `data-chart` id — see shadcn's own
  [chart docs](https://ui.shadcn.com/docs/components/chart) for the usage
  pattern, unchanged here. Extracted verbatim from
  `npx shadcn@latest add chart` against this repo's
  `configs/shadcn/components.json` — no hand-patches.
- `date-picker.tsx` — the baseui-cn `Date Picker` family (`DatePicker`,
  `DatePickerInput`, `DateRangePicker`, `DateRangePickerInput`, plus the
  `DatePickerPresets` helper), built on
  [`@daypicker/react`](https://www.npmjs.com/package/@daypicker/react) (the
  current package name for what's still commonly called "react-day-picker"
  — same maintainers, same API) and `date-fns`, per
  [maat-apps/maat-core#36](https://github.com/maat-apps/maat-core/issues/36).
  Extracted from `npx baseui-cn@latest add date-picker` (run against this
  repo's `configs/shadcn/components.json`-equivalent setup), with three
  changes on top of the generated output:
  - Icons were swapped from `lucide-react` (baseui-cn's default) to
    `@phosphor-icons/react`, matching every other icon in this package
    (`CalendarBlank`/`CaretDown`/`CaretLeft`/`CaretRight`/`X`).
  - It imports this package's own `button.tsx`/`input.tsx`/`field.tsx`/
    `popover.tsx` instead of re-generating local copies — `variant`/`size`
    values used here (`ghost`, `outline`, `sm`, `icon-sm`) already exist on
    this package's `Button`.
  - `input.tsx` here has no `size` variant (unlike the generated
    registry component's own local `Input`), so `DatePickerTrigger` no
    longer forwards a `size` prop to `Input` — sizing comes entirely from
    the `.rdp-input_control[data-size]` wrapper the stylesheet below
    already keys off of.
  - Ships with `date-picker.css` (import as `@maat-apps/ui/date-picker.css`)
    — a separate stylesheet, **not** imported by `date-picker.tsx` itself
    (same posture as `progress-ring.tsx`'s keyframe below: this package
    ships the styles, a consuming app opts in explicitly). It maps
    `DayPicker`'s CSS custom properties onto this ecosystem's own design
    tokens (`--background`, `--popover`, `--primary`, `--accent`,
    `--border`, `--ring`, `--muted`, `--secondary`) unchanged — trainer's
    and routines' `globals.css` already define all of them, being the same
    Tailwind v4 / shadcn `base-nova` setup.
- `settings-primitives.tsx` — `SettingsSection`/`SettingsRow`: a titled
  section + labeled-row pattern for any settings-style list, not just app
  settings.
- `drawer.tsx` — the Base UI `Drawer` wrapper. With `showSwipeHandle` it
  shows a grab pill and can be swiped down to dismiss; nested drawers stack
  (the parent shrinks and scales behind the child, which is intended).
  Every drawer also closes on the phone's native back button/gesture: on
  Android/Chromium via Base UI's own `CloseWatcher` (topmost drawer only),
  elsewhere (iOS, any browser without `CloseWatcher`) via
  `useHistoryBackDismiss` — one marker-tagged `pushState` per open drawer,
  closed on `popstate`, so nested drawers close topmost-first. Routed
  screens need no equivalent, since `navigate(...)` already creates a real
  history entry. The swipe reacts to touch only: e2e tests need CDP
  `Input.dispatchTouchEvent`, synthetic mouse drags don't dismiss it.
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
  `class-variance-authority`, `clsx`, `tailwind-merge`, `date-fns`,
  `@daypicker/react`, `recharts`, and `@phosphor-icons/react` are regular
  dependencies of this package — you don't need to install them yourself.
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
- `date-picker.tsx` needs its stylesheet imported explicitly — it isn't
  pulled in automatically:
  ```css
  @import "@maat-apps/ui/date-picker.css";
  ```
  The stylesheet reads its colors from this ecosystem's existing design
  tokens (`--background`, `--popover`, `--primary`, `--accent`, `--border`,
  `--ring`, `--muted`, `--secondary`) — nothing new to define if your
  `globals.css` already has the standard `base-nova` token set.
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
