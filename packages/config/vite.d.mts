import type { PluginOption, UserConfig } from "vite";

export type AppViteConfigOptions = {
  /** The repo's name: the GitHub Pages path (`/<name>/`) by default. */
  name: string;
  /** The app's root, `import.meta.dirname` — for `@/` and `dist/`. */
  root: string;
  /** Extra plugins, after React, the PWA and the 404 fallback. */
  plugins?: PluginOption[];
  /** Tailwind through PostCSS here; `false` for a postcss.config.mjs. */
  tailwind?: boolean;
};

/**
 * React, the injectManifest PWA (`src/sw.ts`), the GitHub Pages 404
 * fallback, `DEPLOY_BASE_PATH` (else `/<name>/`), the `@` alias and
 * Tailwind.
 */
export function appViteConfig(options: AppViteConfigOptions): UserConfig;
