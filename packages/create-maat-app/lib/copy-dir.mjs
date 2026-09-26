import { cpSync, mkdirSync } from "node:fs";

/** Recursively copies a directory, creating the destination if needed. */
export function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}
