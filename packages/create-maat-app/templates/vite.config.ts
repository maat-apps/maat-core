import { appViteConfig } from "@maat-apps/config/vite";
import { defineConfig } from "vite";

// React, the PWA (src/sw.ts), the GitHub Pages 404 fallback, the base path
// (DEPLOY_BASE_PATH for a PR preview, else /{{APP_NAME}}/), the @ alias and
// Tailwind — all @maat-apps/config's. Pass `plugins` for the app's own.
export default defineConfig(
  appViteConfig({ name: "{{APP_NAME}}", root: import.meta.dirname }),
);
