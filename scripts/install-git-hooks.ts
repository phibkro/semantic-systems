import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

if (!existsSync(resolve(root, ".git"))) {
  process.exit(0);
}

const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: root,
  stdio: "inherit",
});

if (result.error !== undefined || result.status !== 0) {
  console.warn(
    "Git hooks were not installed automatically. Run `bun run hooks:install` from a writable checkout.",
  );
}
