import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
    // Each CLI run copies the whole template tree; give slow disks slack.
    testTimeout: 30_000,
  },
});
