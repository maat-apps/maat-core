import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/app-bar.tsx",
    "src/button.tsx",
    "src/chart.tsx",
    "src/confirm-drawer.tsx",
    "src/date-picker.tsx",
    "src/drag-handle.tsx",
    "src/drawer.tsx",
    "src/empty-state.tsx",
    "src/fab-button.tsx",
    "src/field.tsx",
    "src/input.tsx",
    "src/mobile-gate.tsx",
    "src/page-header.tsx",
    "src/popover.tsx",
    "src/progress-ring.tsx",
    "src/reset-button.tsx",
    "src/select.tsx",
    "src/settings-primitives.tsx",
  ],
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "@base-ui/react", "@dnd-kit/sortable"],
  // date-picker.tsx ships alongside a plain CSS file (not imported from the
  // component itself — a consuming app opts in the same way it opts into
  // progress-ring's keyframe or mobile-gate's Tailwind variant, per this
  // package's README). tsup has no bundler step for standalone CSS assets,
  // so `publicDir` copies it into `dist/` verbatim instead.
  publicDir: "src/styles",
});
