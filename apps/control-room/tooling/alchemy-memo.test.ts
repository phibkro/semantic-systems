import fg from "fast-glob";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ALCHEMY_MEMO_INPUTS } from "../alchemy.run.ts";

const REAL_INPUTS = [
  "index.html",
  "package.json",
  "tsconfig.json",
  "src/App.tsx",
  "public/icon.svg",
  "public/data/version.json",
  "public/data/snapshot.abc123.json",
];
const EPHEMERAL = ["node_modules/package/index.js", "dist/assets/index.js"];
let fixture: string | undefined;

afterEach(async () => {
  if (fixture !== undefined) await rm(fixture, { recursive: true, force: true });
  fixture = undefined;
});

describe("Alchemy memo custody", () => {
  test("explicitly hashes mutable public snapshot inputs despite gitignore", async () => {
    fixture = await mkdtemp(path.join(tmpdir(), "alchemy-memo-"));
    await writeFile(path.join(fixture, ".gitignore"), "public/data\nnode_modules\ndist\n");
    for (const file of [...REAL_INPUTS, ...EPHEMERAL]) {
      await mkdir(path.join(fixture, path.dirname(file)), { recursive: true });
      await writeFile(path.join(fixture, file), "fixture");
    }
    expect(ALCHEMY_MEMO_INPUTS.exclude).toEqual([]);
    expect(ALCHEMY_MEMO_INPUTS.lockfile).toBe(true);
    const matched = await fg.glob(ALCHEMY_MEMO_INPUTS.include, {
      cwd: fixture,
      ignore: ALCHEMY_MEMO_INPUTS.exclude,
      onlyFiles: true,
      dot: true,
    });
    for (const file of REAL_INPUTS) expect(matched, file).toContain(file);
    for (const file of EPHEMERAL) expect(matched, file).not.toContain(file);

    const unsafeDefault = await fg.glob(["**/*"], {
      cwd: fixture,
      ignore: ["public/data/**", "node_modules/**", "dist/**"],
      onlyFiles: true,
      dot: true,
    });
    expect(unsafeDefault).not.toContain("public/data/version.json");
  });
});
