import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

if (!existsSync(resolve(root, ".git"))) {
  process.exit(0);
}

const configured = spawnSync("git", ["config", "--local", "--get-all", "core.hooksPath"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
if (configured.error !== undefined || (configured.status !== 0 && configured.status !== 1)) {
  console.error(
    `Git hooks were not installed: unable to inspect local core.hooksPath${
      configured.error === undefined ? "" : `: ${configured.error.message}`
    }.`,
  );
  process.exit(1);
}

const configuredPaths =
  configured.status === 0
    ? (configured.stdout?.toString() ?? "")
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter((path) => path.length > 0)
    : [];
const conflictingPath = configuredPaths.find((path) => path !== ".githooks");
if (conflictingPath !== undefined) {
  console.error(
    `Refusing to overwrite local core.hooksPath "${conflictingPath}"; configure .githooks explicitly before installing project hooks.`,
  );
  process.exit(1);
}

const result = spawnSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: root,
  stdio: "inherit",
});

if (result.error !== undefined || result.status !== 0) {
  console.error(
    `Git hooks were not installed: unable to set local core.hooksPath to .githooks${
      result.error === undefined ? "" : `: ${result.error.message}`
    }.`,
  );
  process.exit(1);
}
