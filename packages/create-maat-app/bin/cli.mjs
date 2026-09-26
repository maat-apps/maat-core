#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir } from "../lib/copy-dir.mjs";
import { buildPackageJson } from "../lib/package-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const templatesDir = path.join(packageRoot, "templates");
const repoRoot = path.join(packageRoot, "..", "..");

const args = process.argv.slice(2);
const appName = args.find((arg) => !arg.startsWith("--"));
const desktop = args.includes("--desktop");

if (!appName) {
  console.error("Usage: create-maat-app <app-name> [--desktop]");
  console.error(
    "  --desktop   scaffold without the mobile-only gate (default: mobile-only, like routines)",
  );
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), appName);
if (existsSync(targetDir)) {
  console.error(`Refusing to overwrite existing path: ${targetDir}`);
  process.exit(1);
}

function replaceTokens(filePath, tokens) {
  let content = readFileSync(filePath, "utf-8");
  for (const [token, value] of Object.entries(tokens)) {
    content = content.replaceAll(token, value);
  }
  writeFileSync(filePath, content);
}

mkdirSync(targetDir, { recursive: true });

// 1. Static template tree (app skeleton, e2e, tests/unit, .claude baseline).
copyDir(templatesDir, targetDir);

// Files that don't get their final name/location as plain copies (dotfiles
// stay out of the templates tree itself so they aren't hidden from view).
renameSync(
  path.join(targetDir, "gitignore"),
  path.join(targetDir, ".gitignore"),
);
renameSync(path.join(targetDir, "claude"), path.join(targetDir, ".claude"));

// 2. Mobile-only (default, matching routines) vs. desktop-capable.
const mainSrc = desktop ? "main.tsx" : "main.mobile-gate.tsx";
copyFileSync(
  path.join(templatesDir, "src", mainSrc),
  path.join(targetDir, "src", "main.tsx"),
);
rmSync(path.join(targetDir, "src", "main.mobile-gate.tsx"), { force: true });
if (desktop) {
  rmSync(path.join(targetDir, "src", "components", "mobile-gate.tsx"), {
    force: true,
  });
  rmSync(path.join(targetDir, "src", "app", "root.tsx"), { force: true });
}

// 3. Shared configs, copied (not installed — no published package yet).
copyDir(
  path.join(repoRoot, "configs", "eslint"),
  path.join(targetDir, "configs", "eslint"),
);
copyDir(
  path.join(repoRoot, "configs", "typescript"),
  path.join(targetDir, "configs", "typescript"),
);
copyFileSync(
  path.join(repoRoot, "configs", "prettier", "base.json"),
  path.join(targetDir, ".prettierrc.json"),
);
copyDir(
  path.join(repoRoot, "configs", "shadcn"),
  path.join(targetDir, "configs", "shadcn"),
);
copyFileSync(
  path.join(targetDir, "configs", "shadcn", "components.json"),
  path.join(targetDir, "components.json"),
);

// 4. Reference docs, snapshotted at generation time.
copyFileSync(
  path.join(repoRoot, "STRUCTURE.md"),
  path.join(targetDir, "STRUCTURE.md"),
);
copyFileSync(
  path.join(repoRoot, "VERIFICATION.md"),
  path.join(targetDir, "VERIFICATION.md"),
);

// 5. Parameterized files.
writeFileSync(
  path.join(targetDir, "package.json"),
  JSON.stringify(buildPackageJson(appName), null, 2) + "\n",
);
replaceTokens(path.join(targetDir, "index.html"), { "{{APP_NAME}}": appName });
replaceTokens(path.join(targetDir, "CLAUDE.md"), {
  "{{APP_NAME}}": appName,
  "{{MOBILE_LINE}}": desktop
    ? "Supports desktop and mobile viewports."
    : "Mobile-only (`src/components/mobile-gate.tsx`), like routines.",
});
writeFileSync(
  path.join(targetDir, "README.md"),
  `# ${appName}\n\nScaffolded with \`@maat-apps/create-maat-app\`. See [CLAUDE.md](./CLAUDE.md) and [STRUCTURE.md](./STRUCTURE.md).\n`,
);

console.log(`Created ${appName} at ${targetDir}`);
console.log("Next steps:");
console.log(`  cd ${appName}`);
console.log("  npm install");
console.log("  git init && git add -A && git commit -m 'Initial scaffold'");
console.log("  npm run dev");
