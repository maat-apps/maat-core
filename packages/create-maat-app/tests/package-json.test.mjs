import { describe, expect, it } from "vitest";
import { buildPackageJson } from "../lib/package-json.mjs";

describe("buildPackageJson", () => {
  it("names the package after the app", () => {
    expect(buildPackageJson("diet").name).toBe("diet");
  });

  it("runs the mobile e2e projects by default", () => {
    expect(buildPackageJson("diet").scripts["test:e2e"]).toBe(
      "playwright test --project=mobile-chromium --project=mobile-iphone",
    );
  });

  it("runs the desktop e2e projects with --desktop", () => {
    expect(buildPackageJson("diet", true).scripts["test:e2e"]).toBe(
      "playwright test --project=desktop-chromium --project=desktop-webkit",
    );
  });

  it("chains every CI gate into validate", () => {
    const { validate } = buildPackageJson("diet").scripts;

    for (const step of [
      "lint",
      "format:check",
      "typecheck",
      "test:coverage",
      "test:e2e",
      "build",
    ]) {
      expect(validate).toContain(`npm run ${step}`);
    }
  });
});
