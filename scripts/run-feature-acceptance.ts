#!/usr/bin/env bun
/**
 * Dispatch canonical feature acceptance without constructing shell input.
 *
 * Direct, PR, range, and release modes resolve artifacts from the canonical
 * project graph. Pre-loop and superseded features are reported as non-runnable.
 * Release validates the complete model before it runs every runnable program.
 */
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Console, Data, Effect } from "effect";

import { loadProject } from "../src/project-model/loader.ts";
import {
  FEATURE_ID_PATTERN,
  featuresForChangedPaths,
  isFeatureDiagnostic,
  resolveFeature,
  resolveFeatures,
  validateFeatureRepository,
  type FeatureArtifacts,
} from "../src/project-model/work-lifecycle.ts";
import {
  changedPathsForRange,
  migrationOwnershipForRange,
  nonTrivialPaths,
  validatePullRequestEvent,
} from "./check-feature-contract.ts";
import { runMain } from "./lib/command.ts";

type Mode = "direct" | "pr" | "range" | "release";

class AcceptanceDispatchError extends Data.TaggedError("AcceptanceDispatchError")<{
  readonly message: string;
}> {}

const attempt = <A>(thunk: () => A): Effect.Effect<A, AcceptanceDispatchError> =>
  Effect.try({
    try: thunk,
    catch: (cause) =>
      new AcceptanceDispatchError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

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

const assertCheckedOutHead = (
  root: string,
  expected?: string,
): Effect.Effect<string, AcceptanceDispatchError> =>
  attempt(() => {
    const actual = runGit(root, ["rev-parse", "HEAD"]);
    if (expected !== undefined && actual !== expected) {
      throw new Error(`checked-out HEAD ${actual} does not match acceptance head ${expected}`);
    }
    const trackedStatus = runGit(root, ["status", "--porcelain", "--untracked-files=no"]);
    if (trackedStatus.length > 0) {
      throw new Error(`tracked working tree is dirty: ${trackedStatus.replace(/\s*\n\s*/g, ", ")}`);
    }
    return actual;
  });

const diagnosticMessage = (diagnostic: {
  readonly code: string;
  readonly message: string;
}): string => `${diagnostic.code}: ${diagnostic.message}`;

const requireValidRepository = (project: Parameters<typeof resolveFeature>[0], root: string) =>
  validateFeatureRepository(project, root).pipe(
    Effect.flatMap((diagnostics) =>
      diagnostics.length === 0
        ? Effect.void
        : Effect.fail(
            new AcceptanceDispatchError({
              message: diagnostics.map(diagnosticMessage).join("; "),
            }),
          ),
    ),
  );

const requireFeature = (
  project: Parameters<typeof resolveFeature>[0],
  featureId: string,
): Effect.Effect<FeatureArtifacts, AcceptanceDispatchError> => {
  const resolved = resolveFeature(project, featureId);
  return isFeatureDiagnostic(resolved)
    ? Effect.fail(new AcceptanceDispatchError({ message: diagnosticMessage(resolved) }))
    : Effect.succeed(resolved);
};

type ProgramFailure = {
  readonly featureId: string;
  readonly script: string;
  readonly detail: string;
};

const ACCEPTANCE_TIMEOUT_MS = 30 * 60 * 1000;

const runAcceptance = (
  root: string,
  featureId: string,
  script: string,
): ProgramFailure | undefined => {
  try {
    const result = spawnSync("bun", [resolve(root, script)], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
      timeout: ACCEPTANCE_TIMEOUT_MS,
    });
    if (result.error !== undefined) {
      return { featureId, script, detail: result.error.message };
    }
    if (result.signal !== null) {
      return { featureId, script, detail: `terminated by ${result.signal}` };
    }
    if (result.status !== 0) {
      return {
        featureId,
        script,
        detail: `exited with status ${result.status === null ? "unknown" : result.status}`,
      };
    }
    return undefined;
  } catch (cause) {
    return {
      featureId,
      script,
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
};

const dispatchFeatures = (root: string, head: string, features: ReadonlyArray<FeatureArtifacts>) =>
  Effect.gen(function* () {
    const failures: ProgramFailure[] = [];
    let runnable = 0;
    let nonRunnable = 0;
    for (const feature of features) {
      if (feature.acceptance.kind === "runnable") {
        runnable += 1;
        yield* Console.log(
          `feature-acceptance: commit ${head}; ${feature.featureId}; ${feature.acceptance.path}`,
        );
        const failure = runAcceptance(root, feature.featureId, feature.acceptance.path);
        if (failure !== undefined) failures.push(failure);
        yield* assertCheckedOutHead(root, head);
        continue;
      }
      nonRunnable += 1;
      const reason =
        feature.acceptance.kind === "pre_loop"
          ? "pre-loop feature has no feature-loop acceptance program"
          : `superseded by ${feature.acceptance.replacement.target}`;
      yield* Console.log(
        `feature-acceptance: commit ${head}; ${feature.featureId}; non-runnable: ${reason}`,
      );
    }
    yield* assertCheckedOutHead(root, head);
    yield* Console.log(
      `feature-acceptance: commit ${head}; runnable=${runnable}; non-runnable=${nonRunnable}; failed=${failures.length}.`,
    );
    if (failures.length > 0) {
      return yield* new AcceptanceDispatchError({
        message: `feature acceptance failed: ${failures
          .map((failure) => `${failure.featureId} (${failure.detail})`)
          .join(", ")}`,
      });
    }
  });

const loadValidProject = (root: string) =>
  Effect.gen(function* () {
    const project = yield* loadProject(root);
    yield* requireValidRepository(project, root);
    return project;
  });

const run = (mode: Mode, root: string, args: Map<string, string>) =>
  Effect.gen(function* () {
    if (mode === "direct") {
      const featureId = args.get("--feature");
      if (featureId === undefined || !FEATURE_ID_PATTERN.test(featureId)) {
        return yield* new AcceptanceDispatchError({
          message: "direct mode requires one well-formed --feature <NNNN-slug>",
        });
      }
      const head = yield* assertCheckedOutHead(root);
      const project = yield* loadValidProject(root);
      const feature = yield* requireFeature(project, featureId);
      return yield* dispatchFeatures(root, head, [feature]);
    }

    if (mode === "pr") {
      const eventPath = args.get("--event") ?? process.env.GITHUB_EVENT_PATH;
      if (eventPath === undefined) {
        return yield* new AcceptanceDispatchError({
          message: "PR mode requires --event <path> or GITHUB_EVENT_PATH",
        });
      }
      const selected = yield* validatePullRequestEvent(root, resolve(eventPath));
      const head = yield* assertCheckedOutHead(root, selected.head);
      if (selected.featureId === "trivial") {
        yield* Console.log(
          `feature-acceptance: commit ${head}; explicit trivial maintenance range; no feature acceptance represented.`,
        );
        return;
      }
      if (selected.feature === undefined) {
        return yield* new AcceptanceDispatchError({
          message: `feature ${selected.featureId} did not resolve canonical artifacts`,
        });
      }
      return yield* dispatchFeatures(root, head, [selected.feature]);
    }

    if (mode === "range") {
      const base = args.get("--base");
      const head = args.get("--head");
      if (base === undefined || head === undefined) {
        return yield* new AcceptanceDispatchError({
          message: "range mode requires --base <sha> --head <sha>",
        });
      }
      const checkedOutHead = yield* assertCheckedOutHead(root, head);
      const changedPaths = yield* changedPathsForRange(root, base, head, "range");
      const project = yield* loadValidProject(root);
      const featureIds = featuresForChangedPaths(project, changedPaths);
      if (featureIds.length === 0) {
        const nontrivial = nonTrivialPaths(changedPaths);
        if (nontrivial.length > 0) {
          return yield* new AcceptanceDispatchError({
            message: `range has no changed feature but contains nontrivial paths: ${nontrivial.join(", ")}`,
          });
        }
        yield* Console.log(
          `feature-acceptance: commit ${checkedOutHead}; trivial maintenance range ${base}..${head}; zero changed features.`,
        );
        return;
      }
      const features = yield* Effect.forEach(featureIds, (featureId) =>
        requireFeature(project, featureId),
      );
      const ownership = yield* attempt(() =>
        migrationOwnershipForRange(root, features, changedPaths),
      );
      const owners = features.filter(
        (feature) => !ownership.migratedFeatureIds.has(feature.featureId),
      );
      if (owners.length === 0) {
        return yield* new AcceptanceDispatchError({
          message: "range contract migrations have no owning feature",
        });
      }
      if (ownership.migratedFeatureIds.size > 0) {
        yield* Console.log(
          `feature-acceptance: commit ${checkedOutHead}; contract migrations owned by ${owners
            .map((owner) => owner.featureId)
            .join(", ")}: ${[...ownership.migratedFeatureIds].sort().join(", ")}`,
        );
      }
      return yield* dispatchFeatures(root, checkedOutHead, owners);
    }

    const head = yield* assertCheckedOutHead(root);
    const project = yield* loadValidProject(root);
    const resolved = resolveFeatures(project);
    const diagnostics = resolved.filter(isFeatureDiagnostic);
    if (diagnostics.length > 0) {
      return yield* new AcceptanceDispatchError({
        message: diagnostics.map(diagnosticMessage).join("; "),
      });
    }
    return yield* dispatchFeatures(
      root,
      head,
      resolved.filter((feature): feature is FeatureArtifacts => !isFeatureDiagnostic(feature)),
    );
  });

if (import.meta.main) {
  const program = Effect.gen(function* () {
    const args = yield* attempt(() => parseArguments(process.argv.slice(2)));
    const mode = args.get("--mode") as Mode | undefined;
    if (mode !== "direct" && mode !== "pr" && mode !== "range" && mode !== "release") {
      return yield* new AcceptanceDispatchError({
        message: "--mode must be direct, pr, range, or release",
      });
    }
    const root = resolve(args.get("--root") ?? resolve(import.meta.dirname, ".."));
    yield* run(mode, root, args);
  }).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer]));
  runMain("feature-acceptance", program);
}
