import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const templatesDir = fileURLToPath(new URL("../templates", import.meta.url));

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "create-maat-app-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runCli(...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: workDir,
    encoding: "utf-8",
  });
}

function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function read(appDir, ...segments) {
  return readFileSync(path.join(appDir, ...segments), "utf-8");
}

describe("create-maat-app", () => {
  it("prints usage and fails without an app name", () => {
    const result = runCli();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: create-maat-app");
  });

  it("refuses to overwrite an existing path", () => {
    mkdirSync(path.join(workDir, "diet"));

    const result = runCli("diet");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to overwrite");
  });

  describe("default (mobile-only) scaffold", () => {
    let appDir;

    beforeEach(() => {
      const result = runCli("diet");
      expect(result.status, result.stderr).toBe(0);
      appDir = path.join(workDir, "diet");
    });

    it("leaves no unreplaced {{TOKEN}} in any file", () => {
      const withTokens = listFiles(appDir).filter((file) =>
        /\{\{[A-Z_]+\}\}/.test(readFileSync(file, "utf-8")),
      );

      expect(withTokens).toEqual([]);
    });

    it("restores dotfile names", () => {
      expect(existsSync(path.join(appDir, ".gitignore"))).toBe(true);
      expect(existsSync(path.join(appDir, ".claude"))).toBe(true);
      expect(existsSync(path.join(appDir, "gitignore"))).toBe(false);
      expect(existsSync(path.join(appDir, "claude"))).toBe(false);
    });

    it("uses the mobile-gate entry point", () => {
      expect(read(appDir, "src", "main.tsx")).toBe(
        readFileSync(
          path.join(templatesDir, "src", "main.mobile-gate.tsx"),
          "utf-8",
        ),
      );
      expect(existsSync(path.join(appDir, "src", "main.mobile-gate.tsx"))).toBe(
        false,
      );
      expect(
        existsSync(path.join(appDir, "src", "components", "mobile-gate.tsx")),
      ).toBe(true);
    });

    it("copies the shared configs", () => {
      for (const file of [
        ".prettierrc.json",
        "components.json",
        path.join("configs", "eslint", "base.mjs"),
      ]) {
        expect(existsSync(path.join(appDir, file)), file).toBe(true);
      }
      expect(
        existsSync(path.join(appDir, "playwright.config.desktop.ts")),
      ).toBe(false);
    });

    it("links maat-core's shared docs instead of copying them", () => {
      expect(existsSync(path.join(appDir, "STRUCTURE.md"))).toBe(false);
      expect(existsSync(path.join(appDir, "VERIFICATION.md"))).toBe(false);
      expect(read(appDir, "README.md")).toContain(
        "https://github.com/maat-apps/maat-core/blob/main/STRUCTURE.md",
      );
    });

    it("writes the app's package.json and CLAUDE.md", () => {
      expect(JSON.parse(read(appDir, "package.json")).name).toBe("diet");
      expect(read(appDir, "CLAUDE.md")).toContain("Mobile-only");
    });
  });

  describe("--desktop scaffold", () => {
    let appDir;

    beforeEach(() => {
      const result = runCli("diet", "--desktop");
      expect(result.status, result.stderr).toBe(0);
      appDir = path.join(workDir, "diet");
    });

    it("drops the mobile gate", () => {
      expect(read(appDir, "src", "main.tsx")).toBe(
        readFileSync(path.join(templatesDir, "src", "main.tsx"), "utf-8"),
      );
      expect(
        existsSync(path.join(appDir, "src", "components", "mobile-gate.tsx")),
      ).toBe(false);
      expect(existsSync(path.join(appDir, "src", "app", "root.tsx"))).toBe(
        false,
      );
    });

    it("uses the desktop Playwright config", () => {
      expect(read(appDir, "playwright.config.ts")).toContain(
        "desktop-chromium",
      );
      expect(read(appDir, "CLAUDE.md")).toContain(
        "Supports desktop and mobile viewports.",
      );
    });

    it("leaves no unreplaced {{TOKEN}} in any file", () => {
      const withTokens = listFiles(appDir).filter((file) =>
        /\{\{[A-Z_]+\}\}/.test(readFileSync(file, "utf-8")),
      );

      expect(withTokens).toEqual([]);
    });
  });
});
