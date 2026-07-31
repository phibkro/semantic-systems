import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  addGrades,
  check,
  effectRow,
  effectRowsEqual,
  evaluate,
  force,
  grades,
  int,
  multiplyGrades,
  returnTerm,
  thunk,
  unionEffectRows,
} from "../src/kernel-calculus/index.ts";
import {
  emptyOracleSignature,
  finiteOracleTypes,
  langBangOracleProvenance,
} from "../examples/kernel-calculus/oracle.ts";

const requireSuccessfulProcess = (
  label: string,
  result: ReturnType<typeof Bun.spawnSync>,
): void => {
  if (result.exitCode === 0) return;
  const output = `${result.stdout?.toString() ?? ""}\n${result.stderr?.toString() ?? ""}`.trim();
  throw new Error(`${label} failed with exit ${result.exitCode}: ${output.slice(-4_000)}`);
};

const configuredOracleRoot = process.env.LANG_BANG_ORACLE_ROOT;
const configuredLakeExecutable = process.env.LANG_BANG_LAKE_BIN;
const externalOracleConfigured =
  configuredOracleRoot !== undefined && configuredLakeExecutable !== undefined;
const externalOraclePartiallyConfigured =
  (configuredOracleRoot === undefined) !== (configuredLakeExecutable === undefined);

describe("finite calculus law and differential oracles", () => {
  test("grade tables are exhaustive, closed, associative, and distributive", () => {
    const expectedAddition = [
      ["0", "0", "0"],
      ["0", "1", "1"],
      ["0", "omega", "omega"],
      ["1", "0", "1"],
      ["1", "1", "omega"],
      ["1", "omega", "omega"],
      ["omega", "0", "omega"],
      ["omega", "1", "omega"],
      ["omega", "omega", "omega"],
    ] as const;
    const expectedMultiplication = [
      ["0", "0", "0"],
      ["0", "1", "0"],
      ["0", "omega", "0"],
      ["1", "0", "0"],
      ["1", "1", "1"],
      ["1", "omega", "omega"],
      ["omega", "0", "0"],
      ["omega", "1", "omega"],
      ["omega", "omega", "omega"],
    ] as const;
    const actualAddition: unknown = grades.flatMap((left) =>
      grades.map((right) => [left, right, addGrades(left, right)]),
    );
    const actualMultiplication: unknown = grades.flatMap((left) =>
      grades.map((right) => [left, right, multiplyGrades(left, right)]),
    );
    expect(actualAddition).toEqual(expectedAddition);
    expect(actualMultiplication).toEqual(expectedMultiplication);
    for (const left of grades) {
      for (const middle of grades) {
        for (const right of grades) {
          expect(addGrades(addGrades(left, middle), right)).toBe(
            addGrades(left, addGrades(middle, right)),
          );
          expect(multiplyGrades(multiplyGrades(left, middle), right)).toBe(
            multiplyGrades(left, multiplyGrades(middle, right)),
          );
          expect(multiplyGrades(left, addGrades(middle, right))).toBe(
            addGrades(multiplyGrades(left, middle), multiplyGrades(left, right)),
          );
        }
      }
    }
  });

  test("counterexample 9: finite-set row laws ignore duplicates and normalize order", () => {
    const rows = [effectRow(), effectRow("a"), effectRow("b"), effectRow("b", "a", "a")];
    expect(effectRow("b", "a", "a")).toEqual(["a", "b"]);
    for (const left of rows) {
      expect(effectRowsEqual(unionEffectRows(left, left), left)).toBeTrue();
      for (const right of rows) {
        expect(
          effectRowsEqual(unionEffectRows(left, right), unionEffectRows(right, left)),
        ).toBeTrue();
        for (const third of rows) {
          expect(
            effectRowsEqual(
              unionEffectRows(unionEffectRows(left, right), third),
              unionEffectRows(left, unionEffectRows(right, third)),
            ),
          ).toBeTrue();
        }
      }
    }
    expect(effectRow("😀", "\uE000", "ä", "z")).toEqual(["z", "ä", "\uE000", "😀"]);
  });

  test("counterexample 10: force(thunk(return(V))) agrees with return(V)", () => {
    const direct = check(emptyOracleSignature, returnTerm("1", int(12)));
    const forced = check(emptyOracleSignature, force(thunk(returnTerm("1", int(12)))));
    expect(direct.status).toBe("accepted");
    expect(forced.status).toBe("accepted");
    if (direct.status !== "accepted" || forced.status !== "accepted") {
      throw new Error("expected accepted");
    }
    expect(evaluate(direct.program)).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 12 },
    });
    expect(evaluate(forced.program)).toMatchObject({
      status: "returned",
      value: { kind: "int", value: 12 },
    });
  });

  test("records portable provenance and finite overlap types without an external checkout", () => {
    expect(langBangOracleProvenance).toMatchObject({
      source: "lang-bang",
      commit: "5b8e032bcffefb23a3a153d3f5cea99050e589c1",
      license: "Apache-2.0",
      method: "independent execution of the pinned Source.eval oracle; no source copied",
    });
    expect(finiteOracleTypes).toEqual({
      unit: { kind: "unit" },
      bool: { kind: "bool" },
      integer: { kind: "int" },
      pair: {
        kind: "pair",
        first: { kind: "int" },
        second: { kind: "bool" },
      },
      thunk: {
        kind: "thunk",
        effects: ["fresh"],
        computation: { kind: "return", grade: "1", value: { kind: "int" } },
      },
    });
  });

  test("external oracle configuration is complete or absent", () => {
    expect(externalOraclePartiallyConfigured).toBeFalse();
  });

  test.if(externalOracleConfigured)(
    "the explicitly configured pinned checkout executes the independent oracle",
    async () => {
      if (configuredOracleRoot === undefined || configuredLakeExecutable === undefined) {
        throw new Error("external oracle test ran without complete configuration");
      }
      const sourceRoot = configuredOracleRoot;
      const head = Bun.spawnSync(["git", "-C", sourceRoot, "rev-parse", "HEAD"]);
      requireSuccessfulProcess("pinned oracle head inspection", head);
      expect(head.stdout.toString().trim()).toBe(langBangOracleProvenance.commit);

      const lakeExecutable = configuredLakeExecutable;
      const offlineBuildEnvironment = {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "protocol.allow",
        GIT_CONFIG_VALUE_0: "never",
        http_proxy: "http://127.0.0.1:1",
        https_proxy: "http://127.0.0.1:1",
        ALL_PROXY: "http://127.0.0.1:1",
        NO_PROXY: "",
      };
      const cleanRoot = mkdtempSync(join(tmpdir(), "semantic-0018-lang-bang-"));
      let worktreeAdded = false;
      try {
        const addWorktree = Bun.spawnSync([
          "git",
          "-C",
          sourceRoot,
          "worktree",
          "add",
          "--detach",
          cleanRoot,
          langBangOracleProvenance.commit,
        ]);
        requireSuccessfulProcess("clean pinned oracle worktree creation", addWorktree);
        worktreeAdded = true;

        const cleanHead = Bun.spawnSync(["git", "-C", cleanRoot, "rev-parse", "HEAD"]);
        requireSuccessfulProcess("clean oracle head inspection", cleanHead);
        expect(cleanHead.stdout.toString().trim()).toBe(langBangOracleProvenance.commit);
        const cleanStatus = Bun.spawnSync([
          "git",
          "-C",
          cleanRoot,
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ]);
        requireSuccessfulProcess("clean oracle checkout inspection", cleanStatus);
        expect(cleanStatus.stdout.toString()).toBe("");
        expect(await Bun.file(resolve(cleanRoot, "LICENSE")).text()).toContain(
          "Apache License\n                           Version 2.0",
        );
        expect((await Bun.file(resolve(cleanRoot, "lean-toolchain")).text()).trim()).toBe(
          langBangOracleProvenance.toolchain,
        );
        symlinkSync(resolve(sourceRoot, ".lake"), resolve(cleanRoot, ".lake"), "dir");

        const build = Bun.spawnSync(
          [lakeExecutable, `--dir=${cleanRoot}`, "--rehash", "--no-cache", "build", "bang"],
          { env: offlineBuildEnvironment },
        );
        requireSuccessfulProcess("offline pinned oracle build", build);
        const freshness = Bun.spawnSync(
          [
            lakeExecutable,
            `--dir=${cleanRoot}`,
            "--rehash",
            "--no-cache",
            "--no-build",
            "build",
            "bang",
          ],
          { env: offlineBuildEnvironment },
        );
        requireSuccessfulProcess("pinned oracle freshness check", freshness);

        const postBuildStatus = Bun.spawnSync([
          "git",
          "-C",
          cleanRoot,
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
          "--",
          ".",
          ":(exclude).lake",
        ]);
        requireSuccessfulProcess("post-build oracle checkout inspection", postBuildStatus);
        expect(postBuildStatus.stdout.toString()).toBe("");
        expect(langBangOracleProvenance.buildArtifactPolicy).toContain(
          "may refresh only shared ignored .lake/build outputs",
        );

        const fixture = resolve(
          import.meta.dirname,
          "../examples/kernel-calculus/lang-bang-overlap.bang",
        );
        const expected = (
          await Bun.file(
            resolve(
              import.meta.dirname,
              "../examples/kernel-calculus/lang-bang-overlap.expected.txt",
            ),
          ).text()
        ).trim();
        const observation = Bun.spawnSync([
          resolve(cleanRoot, langBangOracleProvenance.executable),
          "run",
          "--engine=oracle",
          "--no-typecheck",
          fixture,
        ]);
        requireSuccessfulProcess("pinned Source.eval observation", observation);
        expect(observation.stderr.toString()).toBe("");
        expect(observation.stdout.toString().trim()).toBe(expected);
      } finally {
        if (worktreeAdded) {
          const removeWorktree = Bun.spawnSync([
            "git",
            "-C",
            sourceRoot,
            "worktree",
            "remove",
            "--force",
            cleanRoot,
          ]);
          requireSuccessfulProcess("pinned oracle worktree cleanup", removeWorktree);
        } else {
          rmSync(cleanRoot, { recursive: true, force: true });
        }
      }
    },
  );
});
