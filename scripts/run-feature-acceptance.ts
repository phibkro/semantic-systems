#!/usr/bin/env bun
/**
 * Dispatch exact feature acceptance scripts without constructing shell input.
 *
 * PR mode validates the selected Feature-ID and its report. Range mode derives
 * feature IDs only from changed plan paths. Release mode runs every checked-in
 * acceptance script, including a red one, so release cannot silently skip an
 * unsupported feature.
 */
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  changedPathsForRange,
  contractMigrationsFor,
  featureIdsFromContractPaths,
  nonTrivialPaths,
  validateFeatureArtifacts,
  validatePullRequestEvent,
} from "./check-feature-contract.ts";

type Mode = "direct" | "pr" | "range" | "release";

const parseArguments = (argv: string[]): Map<string, string> => {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error(`expected --name value arguments, received ${argv.join(" ")}`);
    }
    parsed.set(key, value);
  }
  return parsed;
};

const runGit = (root: string, args: string[]): string => {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`,
    );
  }
  return result.stdout.trim();
};

const assertCheckedOutHead = (root: string, expected?: string): string => {
  const actual = runGit(root, ["rev-parse", "HEAD"]);
  if (expected !== undefined && actual !== expected) {
    throw new Error(`checked-out HEAD ${actual} does not match acceptance head ${expected}`);
  }
  return actual;
};

const runAcceptance = (root: string, featureId: string, script: string, head: string): void => {
  console.log(`feature-acceptance: commit ${head}; ${featureId}; ${script}`);
  const scriptPath = resolve(root, script);
  if ((statSync(scriptPath).mode & 0o111) === 0) {
    throw new Error(`acceptance script is not executable: ${script}`);
  }
  const result = spawnSync("bun", [scriptPath], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const featureIdsFromPlans = (paths: string[]): string[] => {
  const ids = new Set<string>();
  for (const path of paths) {
    const match = /^plans\/(?:active|completed)\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(
      path,
    );
    if (match?.[1] !== undefined) {
      ids.add(match[1]);
    }
  }
  return [...ids].sort();
};

const run = (mode: Mode, root: string, args: Map<string, string>): void => {
  if (mode === "direct") {
    const featureId = args.get("--feature");
    if (featureId === undefined || !/^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(featureId)) {
      throw new Error("direct mode requires one well-formed --feature <NNNN-slug>");
    }
    const head = assertCheckedOutHead(root);
    const artifacts = validateFeatureArtifacts(root, featureId);
    runAcceptance(root, featureId, artifacts.acceptanceScript, head);
    return;
  }

  if (mode === "pr") {
    const eventPath = args.get("--event") ?? process.env.GITHUB_EVENT_PATH;
    if (eventPath === undefined) {
      throw new Error("PR mode requires --event <path> or GITHUB_EVENT_PATH");
    }
    const selected = validatePullRequestEvent(root, resolve(eventPath));
    const head = assertCheckedOutHead(root, selected.head);
    if (selected.featureId === "trivial") {
      console.log(
        `feature-acceptance: commit ${head}; explicit trivial maintenance range; no feature acceptance represented.`,
      );
      return;
    }
    runAcceptance(root, selected.featureId, selected.acceptanceScript!, head);
    return;
  }

  if (mode === "range") {
    const base = args.get("--base");
    const head = args.get("--head");
    if (base === undefined || head === undefined) {
      throw new Error("range mode requires --base <sha> --head <sha>");
    }
    const checkedOutHead = assertCheckedOutHead(root, head);
    const changedPaths = changedPathsForRange(root, base, head, "range");
    const featureIds = featureIdsFromPlans(changedPaths);
    if (featureIds.length === 0) {
      const nontrivial = nonTrivialPaths(changedPaths);
      if (nontrivial.length > 0) {
        throw new Error(
          `range has no changed feature plan but contains nontrivial paths: ${nontrivial.join(", ")}`,
        );
      }
      console.log(
        `feature-acceptance: commit ${checkedOutHead}; trivial maintenance range ${base}..${head}; zero changed feature plans.`,
      );
      return;
    }
    const contractIds = featureIdsFromContractPaths(changedPaths);
    const migrationEdges = new Map<string, string[]>();
    for (const featureId of featureIds) {
      const declaredMigrations = contractMigrationsFor(root, featureId);
      const designPath = `design-specs/${featureId}.md`;
      if (declaredMigrations.length > 0 && !changedPaths.includes(designPath)) {
        const reusedMigrations = declaredMigrations.filter((migration) =>
          contractIds.includes(migration),
        );
        if (reusedMigrations.length > 0) {
          throw new Error(
            `feature ${featureId} reuses stale contract migrations without changing ${designPath}: ${reusedMigrations.join(", ")}`,
          );
        }
        continue;
      }
      const admitted: string[] = [];
      for (const migrated of declaredMigrations) {
        if (!contractIds.includes(migrated)) {
          throw new Error(
            `feature ${featureId} declares unchanged contract migration ${migrated} in range`,
          );
        }
        admitted.push(migrated);
      }
      migrationEdges.set(featureId, admitted);
    }
    const migrations = new Set([...migrationEdges.values()].flat());
    const owners = featureIds.filter((featureId) => !migrations.has(featureId));
    if (owners.length === 0) {
      throw new Error("range contract migrations have no owning feature");
    }
    const parents = new Map<string, Set<string>>();
    for (const [owner, migratedIds] of migrationEdges) {
      for (const migrated of migratedIds) {
        const current = parents.get(migrated) ?? new Set<string>();
        current.add(owner);
        parents.set(migrated, current);
      }
    }
    const roots = new Map<string, Set<string>>();
    const rootsFor = (featureId: string, visiting: ReadonlySet<string>): Set<string> => {
      const cached = roots.get(featureId);
      if (cached !== undefined) return cached;
      if (visiting.has(featureId)) {
        throw new Error(`contract migration graph contains a cycle at ${featureId}`);
      }
      const directParents = parents.get(featureId);
      if (directParents === undefined || directParents.size === 0) {
        const result = new Set([featureId]);
        roots.set(featureId, result);
        return result;
      }
      const nextVisiting = new Set(visiting).add(featureId);
      const result = new Set<string>();
      for (const parent of directParents) {
        for (const rootOwner of rootsFor(parent, nextVisiting)) result.add(rootOwner);
      }
      roots.set(featureId, result);
      return result;
    };
    for (const migrated of migrations) {
      const rootOwners = rootsFor(migrated, new Set());
      if (rootOwners.size !== 1) {
        throw new Error(
          `contract migration ${migrated} has ambiguous range ownership: ${[...rootOwners].sort().join(", ")}`,
        );
      }
    }
    if (migrations.size > 0) {
      console.log(
        `feature-acceptance: commit ${checkedOutHead}; contract migrations owned by ${owners.join(", ")}: ${[...migrations].sort().join(", ")}`,
      );
    }
    for (const featureId of owners) {
      const artifacts = validateFeatureArtifacts(root, featureId);
      runAcceptance(root, featureId, artifacts.acceptanceScript, checkedOutHead);
    }
    return;
  }

  const head = assertCheckedOutHead(root);
  const acceptDirectory = resolve(root, "scripts", "accept");
  const scripts = readdirSync(acceptDirectory)
    .filter((name) => /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(name))
    .sort();
  if (scripts.length === 0) {
    throw new Error("release mode found no checked-in feature acceptance scripts");
  }
  for (const name of scripts) {
    const featureId = name.slice(0, -3);
    runAcceptance(root, featureId, `scripts/accept/${name}`, head);
  }
};

try {
  const args = parseArguments(process.argv.slice(2));
  const mode = args.get("--mode") as Mode | undefined;
  if (mode !== "direct" && mode !== "pr" && mode !== "range" && mode !== "release") {
    throw new Error("--mode must be direct, pr, range, or release");
  }
  const root = resolve(args.get("--root") ?? resolve(import.meta.dirname, ".."));
  run(mode, root, args);
} catch (error) {
  console.error(`feature-acceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
