# Shared UI components

Hand-built components extracted from [`routines`](https://github.com/maat-apps/routines),
for a new maat-apps repo to copy instead of rebuilding from scratch. See
[maat-apps/maat-core#3](https://github.com/maat-apps/maat-core/issues/3).

**Copy, don't install** — same posture as [`../configs`](../configs): no
published `@maat-apps/*` package yet
([#18](https://github.com/maat-apps/maat-core/issues/18)), so copy the file(s)
you need into your repo's own `src/components/`.

## What's here

- `button.tsx` — the shadcn `Button` (all variants/sizes), including the
  one deliberate hand-patch on top of the generated shadcn output: the
  `outline` variant's `disabled:bg-background/40 disabled:backdrop-blur-md`
  treatment. Every other component here that renders a button imports this
  file (`./button`), not a consuming repo's own copy.
- `input.tsx` — the shadcn `Input` (text input).
- `select.tsx` — the shadcn `Select` family (`Select`, `SelectTrigger`,
  `SelectContent`, `SelectItem`, `SelectValue`).
- `settings-primitives.tsx` — `SettingsSection`/`SettingsRow`: a titled
  section + labeled-row pattern for any settings-style list, not just app
  settings.
- `drawer.tsx` — the Base UI `Drawer` wrapper with swipe-to-dismiss and
  `useHistoryBackDismiss` (closes on the phone's native back gesture on iOS
  and any browser without `CloseWatcher`). Carries forward a real bug fix:
  the cleanup used to call `history.back()` unconditionally, assuming its
  own pushed history entry was always still on top — but an action inside
  the drawer that itself navigates away (e.g. a destructive confirm button
  redirecting home) pushes a new entry first, so the unconditional
  `back()` popped _that_ navigation instead, silently undoing it. Fixed by
  checking the entry's `drawerMarker` is still current before popping.
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

`confirm-drawer.tsx` and `app-bar.tsx` differ from routines' originals in
one way: routines' versions call its own `useTranslation()` hook directly
for "Cancel"/"Back" labels, which a shared component can't do (no app's
i18n module is shared yet). Here they take `cancelLabel`/`backLabel` as
props instead — the caller passes its own translated string.

## Dependencies a consuming repo needs

- `@base-ui/react` (`drawer.tsx`, `button.tsx`, `input.tsx`, `select.tsx`),
  `@dnd-kit/sortable` (`drag-handle.tsx`, type-only), `class-variance-authority`
  (`button.tsx`'s variants), `lucide-react` (icons), and `cn` re-exported
  from your own `@/lib/utils` per the
  [aliases convention](../configs/README.md).
- Same `base-nova`/Tailwind v4 token setup as routines (design tokens
  themselves aren't included — see below) — see
  [#7](https://github.com/maat-apps/maat-core/issues/7) for the scaffolding
  side of that.
- `progress-ring.tsx` assumes an `animate-progress-check-pop` Tailwind
  animation exists in your `globals.css` (routines defines it there) — copy
  that keyframe along with the component, or drop the class if you don't
  need the pop-in animation.
- Design tokens (colors, true-black OLED background, etc.) are **not**
  included — those are per-app product decisions, not shared defaults; see
  the issue's own note on this.

## Not extracted yet (on purpose)

Per the issue's own "worth a design pass on which ones are actually
generic before extracting" note, these were left out of this first pass
rather than force-extracted:

- **`EmptyState` family** — routines' version is tightly coupled to its
  own i18n keys (`emptyTitle`, `noRoutinesTodayTitle`, etc.) for every
  piece of copy, not just a label or two like `AppBar`/`ConfirmDrawer`
  above. Making it generic means redesigning its props (title/description/
  action) from scratch, not just swapping one `useTranslation()` call for
  a prop — worth doing once there's a second real consumer to design the
  prop shape against, not speculatively now.
- **`mobile-gate.tsx`, `app-lock-gate.tsx`** — carry real app-specific
  logic (service worker registration, WebAuthn/encryption calls), not just
  presentation. The issue itself flags these as needing a coupling audit
  before extraction; that audit hasn't happened yet.
