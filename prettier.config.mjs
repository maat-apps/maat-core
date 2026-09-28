// The shared config apps copy (configs/prettier/base.json), minus the
// Tailwind class-sorting plugin: it sorts against the app's own stylesheet,
// and this repo has none, so it would treat every design token
// (text-foreground, bg-background, ...) as unknown and reorder classes
// differently from the apps these components come from.
import { readFileSync } from "node:fs";

const base = JSON.parse(
  readFileSync(new URL("./configs/prettier/base.json", import.meta.url)),
);

export default {
  ...base,
  plugins: base.plugins.filter((p) => p !== "prettier-plugin-tailwindcss"),
};
