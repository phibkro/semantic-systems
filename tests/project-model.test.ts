import { afterEach, describe, expect, test } from "bun:test";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Exit, type FileSystem, type Path } from "effect";
import { runSemproj } from "../src/project-model/cli.ts";
import { adjacency, longestPath, topologicalOrder } from "../src/project-model/graph.ts";
import { loadProject } from "../src/project-model/loader.ts";
import { assessWork, criticalPath } from "../src/project-model/schedule.ts";
import { validateProject } from "../src/project-model/validate.ts";
import { generateViews } from "../src/project-model/views.ts";

const ROOT = resolve(import.meta.dir, "..");
const temporaryRoots: Array<string> = [];

const runBun = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));

const runBunExit = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));

const runNode = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide([NodeFileSystem.layer, NodePath.layer])));

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const temporaryProject = async (document?: unknown): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "semantic-project-model-"));
  temporaryRoots.push(root);
  if (document !== undefined) {
    await mkdir(join(root, "model"));
    await Bun.write(join(root, "model", "project.json"), JSON.stringify(document));
  }
  return root;
};

describe("project model Effect v4 slice", () => {
  test("loads and validates the canonical model", async () => {
    const project = await runBun(loadProject(ROOT));
    expect(project.entities.size).toBeGreaterThanOrEqual(40);
    expect(project.relations.length).toBeGreaterThanOrEqual(50);
    expect(project.entities.get("domain.inventory.machine")?.kind).toBe("domain_machine");
    expect(validateProject(project).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("renders all eight accepted views byte-for-byte", async () => {
    const views = generateViews(await runBun(loadProject(ROOT)));
    expect(views.size).toBe(8);
    for (const [name, content] of views) {
      expect(content).toBe(await Bun.file(join(ROOT, "generated", name)).text());
    }
    expect(views.get("02-theory-realization.md")).toContain("Inventory STM realization");
    expect(views.get("07-runtime-view.md")).toContain("```mermaid");
  });

  test("preserves the ready frontier and weighted critical path", async () => {
    const project = await runBun(loadProject(ROOT));
    const ready = new Set(
      assessWork(project)
        .filter((item) => item.ready)
        .map((item) => item.entity.id),
    );
    expect(ready.has("work.kernel-spec")).toBeFalse();
    expect(ready.has("work.normalized-core-format")).toBeFalse();
    expect(ready.has("work.lossless-frontend-spec")).toBeTrue();
    expect(ready.has("work.agent-facing-kernel-json")).toBeTrue();
    expect(ready.has("work.lean-evidence-adapter")).toBeTrue();
    expect(ready.has("work.stm-runtime")).toBeFalse();
    const path = criticalPath(project);
    expect(path.length).toBeGreaterThan(0);
    expect(["work.stm-model-check", "work.inventory-stm"]).toContain(path[path.length - 1]!);
  });

  test("cyclic graph helpers stay total and expose no fabricated path", () => {
    const cyclic = adjacency(
      ["a", "b"],
      [
        ["a", "b"],
        ["b", "a"],
      ],
    );
    expect(topologicalOrder(cyclic)).toBeUndefined();
    expect(longestPath(cyclic, new Map())).toEqual([]);
  });

  test("returns a typed failure for a missing model directory", async () => {
    const root = await temporaryProject();
    const exit = await runBunExit(loadProject(root));
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("missing model directory");
  });

  test("returns a typed failure for malformed JSON", async () => {
    const root = await temporaryProject({});
    await Bun.write(join(root, "model", "project.json"), "{");
    const exit = await runBunExit(loadProject(root));
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("invalid JSON");
  });

  test("rejects invalid document shapes", async () => {
    const root = await temporaryProject({ entities: {}, relations: [] });
    const exit = await runBunExit(loadProject(root));
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("invalid model document");
  });

  test("rejects duplicate entity IDs across documents", async () => {
    const root = await temporaryProject({
      entities: [{ id: "duplicate", kind: "claim", name: "one" }],
      relations: [],
    });
    await Bun.write(
      join(root, "model", "second.json"),
      JSON.stringify({
        entities: [{ id: "duplicate", kind: "claim", name: "two" }],
        relations: [],
      }),
    );
    const exit = await runBunExit(loadProject(root));
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("duplicate entity ID");
  });

  test("rejects generate-only flags on validate and report with usage status", async () => {
    expect(await runBun(runSemproj(["validate", "--check"]))).toBe(2);
    expect(await runBun(runSemproj(["report", "--output", "elsewhere"]))).toBe(2);
    expect(await runBun(runSemproj(["validate", "--root", ROOT]))).toBe(2);
  });

  test("Bun and Node live layers observe the same portable project program", async () => {
    const observe = async (
      run: typeof runBun,
    ): Promise<{
      readonly entities: number;
      readonly relations: number;
      readonly errors: ReadonlyArray<string>;
      readonly views: ReadonlyArray<readonly [string, string]>;
    }> => {
      const project = await run(loadProject(ROOT));
      return {
        entities: project.entities.size,
        relations: project.relations.length,
        errors: validateProject(project)
          .filter((issue) => issue.severity === "error")
          .map((issue) => `${issue.code}:${issue.message}`),
        views: [...generateViews(project)],
      };
    };

    expect(await observe(runNode)).toEqual(await observe(runBun));
  });

  test("blocks generation on an invalid relation without an Effect defect", async () => {
    const root = await temporaryProject({
      entities: [{ id: "source", kind: "component", name: "source" }],
      relations: [{ source: "source", target: "missing", kind: "contains" }],
    });
    const result = Bun.spawnSync({
      cmd: ["bun", "src/project-model/main-bun.ts", "--root", root, "generate"],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    expect(result.exitCode).toBe(1);
    expect(output).toContain("relation.target");
    expect(output).toContain("generation aborted");
    expect(output).not.toContain("FiberFailure");
    expect(await Bun.file(join(root, "generated")).exists()).toBeFalse();
  });
});
