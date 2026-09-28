import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/crypto.ts",
    "src/i18n.ts",
    "src/locale.ts",
    "src/storage.ts",
    "src/sw.ts",
  ],
  external: ["react"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
