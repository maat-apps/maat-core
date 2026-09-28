import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/crypto.ts", "src/storage.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
