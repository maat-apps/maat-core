import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// DEPLOY_BASE_PATH lets a PR-preview override the base path without
// touching this file — see routines' vite.config.ts for the fuller pattern
// (a 404.html fallback for client-side routing on GitHub Pages) once this
// app needs it too. The default assumes a GitHub Pages deploy under this
// repo's own path (https://<org>.github.io/{{APP_NAME}}/); change it if
// this app deploys somewhere else.
const base = process.env.DEPLOY_BASE_PATH ?? "/{{APP_NAME}}/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
});
