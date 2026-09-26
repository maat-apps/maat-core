import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// DEPLOY_BASE_PATH lets a PR-preview or non-root GitHub Pages deploy
// override the base path without touching this file — see routines'
// vite.config.ts for the fuller pattern (PR previews, a 404.html fallback
// for client-side routing on GitHub Pages) once this app needs it too.
const base = process.env.DEPLOY_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
});
