import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/app-bar.tsx",
    "src/button.tsx",
    "src/confirm-drawer.tsx",
    "src/drag-handle.tsx",
    "src/drawer.tsx",
    "src/empty-state.tsx",
    "src/fab-button.tsx",
    "src/input.tsx",
    "src/mobile-gate.tsx",
    "src/page-header.tsx",
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
});
