import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves no server-side rewrites, so a hard refresh or deep
// link to a client-routed path 404s unless something static exists there.
// Pages falls back to /404.html for any unresolved path, so a copy of the
// SPA shell under that name lets React Router pick up the real route.
function spaFallback(root) {
  return {
    name: "spa-fallback-404",
    apply: "build",
    closeBundle() {
      const outDir = resolve(root, "dist");
      writeFileSync(
        resolve(outDir, "404.html"),
        readFileSync(resolve(outDir, "index.html")),
      );
    },
  };
}

/** The Vite config every app builds with — see vite.d.mts. */
export function appViteConfig({ name, root, plugins = [], tailwind = true }) {
  return {
    // A PR preview builds under "/<name>/pr-<n>/" through DEPLOY_BASE_PATH.
    base: process.env.DEPLOY_BASE_PATH ?? `/${name}/`,
    plugins: [
      react(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        // The app registers the worker itself, in production builds only,
        // and links its hand-written public/manifest.json from index.html.
        injectRegister: false,
        manifest: false,
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        },
        devOptions: { enabled: false },
      }),
      spaFallback(root),
      ...plugins,
    ],
    resolve: {
      alias: { "@": resolve(root, "src") },
    },
    ...(tailwind && {
      css: { postcss: { plugins: [tailwindcss()] } },
    }),
  };
}
