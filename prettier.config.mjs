// The shared config apps use (packages/config), minus the Tailwind
// class-sorting plugin: this repo has no stylesheet of its own to sort against.
export { withoutTailwind as default } from "./packages/config/prettier.mjs";
