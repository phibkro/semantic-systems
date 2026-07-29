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
  nonTrivialPaths,
  validateFeatureArtifacts,
  validatePullRequestEvent,
} from "./check-feature-contract.ts";

type Mode = "pr" | "range" | "release";

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
  const result = spawnSync("sh", [scriptPath], {
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
    for (const featureId of featureIds) {
      const artifacts = validateFeatureArtifacts(root, featureId);
      runAcceptance(root, featureId, artifacts.acceptanceScript, checkedOutHead);
    }
    return;
  }

  const head = assertCheckedOutHead(root);
  const acceptDirectory = resolve(root, "scripts", "accept");
  const scripts = readdirSync(acceptDirectory)
    .filter((name) => /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.sh$/.test(name))
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
  if (mode !== "pr" && mode !== "range" && mode !== "release") {
    throw new Error("--mode must be pr, range, or release");
  }
  const root = resolve(args.get("--root") ?? resolve(import.meta.dirname, ".."));
  run(mode, root, args);
} catch (error) {
  console.error(`feature-acceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
