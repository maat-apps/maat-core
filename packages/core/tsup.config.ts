import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/backup.ts",
    "src/crypto.ts",
    "src/i18n.ts",
    "src/install.ts",
    "src/locale.ts",
    "src/persisted.ts",
    "src/storage.ts",
    "src/sw.ts",
    "src/update.ts",
    "src/validation.ts",
  ],
  external: ["react", "valibot"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
