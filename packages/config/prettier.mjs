// Shared Prettier config. Plugins are resolved from this package, so a repo
// doesn't have to install them itself.
//
//   // prettier.config.mjs
//   export { default } from "@maat-apps/config/prettier";
const organizeImports = import.meta.resolve("prettier-plugin-organize-imports");
const tailwind = import.meta.resolve("prettier-plugin-tailwindcss");

const base = {
  singleQuote: false,
  trailingComma: "all",
};

/** For an app: sorts imports and Tailwind classes. */
export default { ...base, plugins: [organizeImports, tailwind] };

/**
 * Without class sorting, for a repo with no Tailwind stylesheet of its own
 * (the plugin sorts against the app's stylesheet, so it would treat every
 * design token as unknown and reorder classes differently from the apps).
 */
export const withoutTailwind = { ...base, plugins: [organizeImports] };
