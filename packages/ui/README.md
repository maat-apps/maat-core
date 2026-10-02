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
- `textarea.tsx` — the shadcn `Textarea`.
- `checkbox.tsx` — the shadcn `Checkbox` (round, Phosphor check icon).
- `switch.tsx` — the shadcn `Switch` (`size`: `default` or `sm`).
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
    (this package ships the styles, a consuming app opts in explicitly).
    It maps `DayPicker`'s CSS custom properties onto the tokens from
    `theme.css` (`--background`, `--popover`, `--primary`, `--accent`,
    `--border`, `--ring`, `--muted`, `--secondary`).
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
- `sortable-list.tsx` — `SortableList` (a vertical drag-to-reorder list
  that reports the new order as ids via `onReorder` and renders rows with
  `renderItem`), `useSortableItem` (the wiring for a custom sortable row)
  and `useDragSensors` (pointer/touch/keyboard, with a touch delay so a
  swipe still scrolls), `SortableListRow` (a `ListRow`-style card with a
  `DragHandle`) and `reorderIds` (the pure reorder step).
- `list-row.tsx` — `ListRow`, a tappable card row for plain lists; needs
  no `@dnd-kit`. In both row components the content is `children`, so
  each app keeps its own.
- `progress-ring.tsx` — a compact circular completed/total indicator.
- `fab-button.tsx` / `reset-button.tsx` — floating action button and a
  secondary action button, sharing one sizing/shape convention.
- `mobile-gate.tsx` — renders `children` for phone-sized viewports, a
  message otherwise.
- `app-lock-gate.tsx` — the app lock screen: renders `children` once the
  session passed the lock, otherwise the unlock prompt and, when the
  device lets the user down, the "turn off the lock" escape hatch (with an
  erase warning when the lock encrypts). Takes `@maat-apps/core/lock`'s
  `AppLock`, the stored enrolment, a `ready` flag (settings loaded) and the
  app's translated `labels`.
- `smart-back.ts` — `useSmartBack(fallback)`, the "Back" action for an
  app bar: pops history after an in-app navigation, replaces to
  `fallback` on a deep link (refresh, PWA relaunch, bookmark), where
  popping would leave the app. Not in the barrel (`@maat-apps/ui`): import
  `@maat-apps/ui/smart-back`, so apps without `react-router` never load it.
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
  peer, only needed if you use `drag-handle.tsx`; `sortable-list.tsx` also
  needs `@dnd-kit/core`, `@dnd-kit/modifiers` and `@dnd-kit/utilities`
  (all optional peers). `react-router` (^7) is an optional peer, only
  needed for `smart-back.ts`.
  `class-variance-authority`, `clsx`, `tailwind-merge`, `date-fns`,
  `@daypicker/react`, `recharts`, and `@phosphor-icons/react` are regular
  dependencies of this package — you don't need to install them yourself.
- **The theme**: every Ma'at app looks the same — true black + white on
  Outfit — so the tokens ship here. Your Tailwind entry CSS imports the
  theme, scans this package's compiled output (or classes used only
  inside these components get purged), and pulls in the date picker's
  stylesheet if you use it:
  ```css
  @import "tailwindcss";
  @import "@maat-apps/ui/theme.css";
  @import "@maat-apps/ui/date-picker.css"; /* only with date-picker.tsx */
  @source "../node_modules/@maat-apps/ui/dist"; /* relative to this file */
  ```
  and your JS entry (`main.tsx`) loads the font:
  ```ts
  import "@maat-apps/ui/font";
  ```
  `@maat-apps/ui/font` brings Outfit (`@fontsource-variable/outfit`, a
  dependency of this package, self-hosted). It must be a JS import:
  Tailwind inlines a CSS `@import` without rebasing its relative `url()`s,
  so importing the font from `theme.css` never got the font files into the
  build (#78). `theme.css` brings the shadcn `base-nova` color/
  radius/font tokens with a true-black background and white accent, base
  styles, the `phone-sized:` variant `mobile-gate.tsx` needs and the
  `animate-progress-check-pop` animation `progress-ring.tsx` uses. Don't
  redefine these tokens per app; add only what's genuinely app-specific
  (e.g. larger inputs) after the import. See
  [`../../configs/shadcn`](../../configs/shadcn) for the shadcn config.
- `date-picker.css` reads its colors from the same tokens, so nothing else
  needs defining.

## Not extracted (on purpose) — the coupling audit's result

- Nothing at the moment. The app lock, once listed here as a future
  feature package, is now split: logic in `@maat-apps/core/lock`, the lock
  screen as `app-lock-gate.tsx` here (maat-core#61).

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
