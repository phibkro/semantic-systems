import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ACCEPTANCE = join(ROOT, "features", "0007-reuse-first-engineering", "accept.ts");
const temporaryRoots: Array<string> = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const runAcceptance = (agentMap: string) =>
  Bun.spawnSync({
    cmd: ["bun", ACCEPTANCE],
    cwd: ROOT,
    env: { ...process.env, REUSE_FIRST_AGENT_MAP: agentMap },
    stdout: "pipe",
    stderr: "pipe",
  });

describe("reuse-first delegation contract", () => {
  test("accepts the canonical agent map", () => {
    const result = runAcceptance(join(ROOT, "AGENTS.md"));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("all reuse-first delegation clauses are present");
  });

  test("rejects a removed implementation-posture clause", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-reuse-first-"));
    temporaryRoots.push(root);
    const fixture = join(root, "AGENTS.md");
    const canonical = await Bun.file(join(ROOT, "AGENTS.md")).text();
    await Bun.write(
      fixture,
      canonical.replace(
        "Work like a lazy senior engineer",
        "Work with unspecified implementation posture",
      ),
    );
    const result = runAcceptance(fixture);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("required delegation clause is missing");
  });
});
