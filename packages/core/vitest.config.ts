import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node already has WebCrypto, atob/btoa; IndexedDB comes from
    // fake-indexeddb, installed per test file that needs it.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
