import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { Console, Data, Effect } from "effect";
import {
  FEATURE_ID_PATTERN,
  compileFeatureDossier,
  type FeatureDossierArtifact,
} from "../src/project-model/feature-dossier.ts";
import { loadFeatureDossier } from "../src/project-model/loader.ts";
import {
  runRepositoryWorkflow,
  selectRepairOutputPaths,
  type CheckInput,
  type CheckoutIdentity,
  type CommandObservation,
  type CommandPlan,
  type ImpactCheck,
  type RepairEffect,
  type RepairPolicy,
  type StartInput,
  type VerifyInput,
  type WorkflowReceipt,
} from "../src/project-model/repository-workflow.ts";

const root = resolveRoot();
const generatedPaths = [
  "generated/01-system-map.md",
  "generated/02-theory-realization.md",
  "generated/03-concern-matrix.md",
  "generated/04-evidence-map.md",
  "generated/05-work-dependencies.md",
  "generated/06-delegation-frontier.md",
  "generated/07-runtime-view.md",
  "generated/08-feature-lifecycle.md",
  "generated/README.md",
  "generated/project-model/work-features.json",
  "generated/schema/project-document.schema.json",
  ".omp/lsp.json",
] as const;
const generatedPathSet: ReadonlySet<string> = new Set(generatedPaths);
const sourceRoots = [
  "src",
  "tests",
  "scripts",
  "commitlint.config.ts",
  "package.json",
  "tsconfig.json",
] as const;
const generatedInputRoots = [
  "model",
  "features",
  "src/project-model",
  "package.json",
  "tsconfig.json",
  ".omp/lsp.json",
] as const;

class WorkflowAdapterError extends Data.TaggedError("WorkflowAdapterError")<{
  readonly message: string;
}> {}
const evaluateWorkflow = (input: unknown): Effect.Effect<WorkflowReceipt, WorkflowAdapterError> =>
  runRepositoryWorkflow(input).pipe(
    Effect.mapError(
      (cause) =>
        new WorkflowAdapterError({
          message: `${cause.code}: ${cause.message}`,
        }),
    ),
  );

function resolveRoot(): string {
  return new URL("..", import.meta.url).pathname.replace(/\/$/, "");
}

const spawn = (
  command: ReadonlyArray<string>,
  cwd = root,
): Effect.Effect<
  { readonly exitCode: number; readonly stdout: string; readonly stderr: string },
  WorkflowAdapterError
> =>
  Effect.try({
    try: () => {
      const result = Bun.spawnSync({
        cmd: [...command],
        cwd,
        stdin: "inherit",
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    },
    catch: (cause) =>
      new WorkflowAdapterError({
        message: `cannot execute ${command.join(" ")}: ${String(cause)}`,
      }),
  });

const gitOutput = (
  arguments_: ReadonlyArray<string>,
): Effect.Effect<string, WorkflowAdapterError> =>
  Effect.flatMap(spawn(["git", ...arguments_]), (result) =>
    result.exitCode === 0
      ? Effect.succeed(arguments_.includes("-z") ? result.stdout : result.stdout.trim())
      : Effect.fail(
          new WorkflowAdapterError({
            message: `git ${arguments_.join(" ")} failed: ${result.stderr}`,
          }),
        ),
  );
const commandSucceeded = (
  command: ReadonlyArray<string>,
): Effect.Effect<void, WorkflowAdapterError> =>
  Effect.flatMap(spawn(command), (result) =>
    result.exitCode === 0
      ? Effect.void
      : Effect.fail(
          new WorkflowAdapterError({
            message: `${command.join(" ")} failed with exit code ${result.exitCode}: ${result.stderr}`,
          }),
        ),
  );

const gitCommonDirectory = (): Effect.Effect<string, WorkflowAdapterError> =>
  Effect.map(gitOutput(["rev-parse", "--git-common-dir"]), (directory) => resolve(root, directory));

const ensureParentDirectory = (filePath: string): Effect.Effect<void, WorkflowAdapterError> =>
  Effect.tryPromise({
    try: () => mkdir(dirname(filePath), { recursive: true }).then(() => undefined),
    catch: (cause) =>
      new WorkflowAdapterError({
        message: `cannot create parent directory for ${filePath}: ${String(cause)}`,
      }),
  });

interface TreeState {
  readonly identity: string;
  readonly head: string;
  readonly changedPaths: ReadonlyArray<string>;
  readonly tracked: boolean;
}

const parseStatusPaths = (status: string): ReadonlyArray<string> => {
  const paths = new Set<string>();
  const records = status.includes("\u0000") ? status.split("\u0000") : status.split(/\r?\n/);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length < 4) continue;
    const value = status.includes("\u0000") ? record.slice(3) : record.slice(3).trim();
    if (value.length === 0) continue;
    const rename = value.lastIndexOf(" -> ");
    paths.add((rename >= 0 ? value.slice(rename + 4) : value).replaceAll("\\", "/"));
    if (status.includes("\u0000") && (record[0] === "R" || record[1] === "R")) {
      const original = records[index + 1];
      if (original !== undefined && original.length > 0) paths.add(original.replaceAll("\\", "/"));
      index += 1;
    }
  }
  return [...paths].sort();
};

const parseNulPaths = (value: string): ReadonlyArray<string> =>
  value
    .split("\u0000")
    .filter((path) => path.length > 0)
    .map((path) => path.replaceAll("\\", "/"));

const digestFile = (relativePath: string): Effect.Effect<string, WorkflowAdapterError> =>
  Effect.tryPromise({
    try: async () => {
      const file = Bun.file(`${root}/${relativePath}`);
      if (!(await file.exists())) return "missing";
      const bytes = await file.arrayBuffer();
      return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    },
    catch: (cause) =>
      new WorkflowAdapterError({ message: `cannot digest ${relativePath}: ${String(cause)}` }),
  });

const treeState = (): Effect.Effect<TreeState, WorkflowAdapterError> =>
  Effect.gen(function* () {
    const head = yield* gitOutput(["rev-parse", "HEAD"]);
    const indexTree = yield* gitOutput(["write-tree"]);
    const status = yield* gitOutput(["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
    const trackedChanges = yield* gitOutput(["diff", "--name-only", "-z", "HEAD"]);
    const untracked = yield* gitOutput(["ls-files", "--others", "--exclude-standard", "-z"]);
    const worktreePaths = [
      ...new Set([
        ...parseNulPaths(trackedChanges),
        ...parseNulPaths(untracked),
        ...generatedPaths,
      ]),
    ].sort();
    const worktreeDigests: Array<string> = [];
    for (const path of worktreePaths) {
      worktreeDigests.push(`${path}\u0000${yield* digestFile(path)}`);
    }
    const identityPayload = [head, indexTree, ...worktreeDigests].join("\u0000");
    const identity = new Bun.CryptoHasher("sha256").update(identityPayload).digest("hex");
    return {
      identity: `sha256:${identity}`,
      head,
      changedPaths: parseStatusPaths(status),
      tracked: true,
    } satisfies TreeState;
  });

const digestFiles = (
  paths: ReadonlyArray<string>,
): Effect.Effect<ReadonlyMap<string, string>, WorkflowAdapterError> =>
  Effect.gen(function* () {
    const values = new Map<string, string>();
    for (const path of paths) values.set(path, yield* digestFile(path));
    return values;
  });

const changedFiles = (
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): ReadonlyArray<string> =>
  [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();

const pathWithin = (path: string, rootPath: string): boolean =>
  path === rootPath || path.startsWith(`${rootPath}/`);

const sourceFiles = (paths: ReadonlyArray<string>): ReadonlyArray<string> =>
  paths.filter(
    (path) =>
      sourceRoots.some((rootPath) => pathWithin(path, rootPath)) &&
      /(?:^|\/)(?:[^/]+\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts|json|jsonc))$/.test(path),
  );

const allKnownPaths = (): ReadonlyArray<string> =>
  [...new Set([...sourceRoots, ...generatedInputRoots, ...generatedPaths])].sort();

const repairPolicy = (paths: ReadonlyArray<string>): RepairPolicy => {
  const generatedInputChanged = generatedInputRoots.some((rootPath) =>
    paths.some((path) => pathWithin(path, rootPath)),
  );
  const generatedOutputChanged = paths.some((path) => generatedPathSet.has(path));
  return {
    allowed_effects: ["oxfmt_write", "oxlint_safe_fix", "generated_view_regeneration"],
    oxfmt_output_paths: sourceFiles(paths),
    oxlint_output_paths: sourceFiles(paths),
    generated_view_input_paths: [...generatedInputRoots],
    generated_view_output_paths:
      generatedInputChanged || generatedOutputChanged ? generatedPaths : [],
    max_attempts: 2,
  };
};

const checkDefinitions = (): ReadonlyArray<ImpactCheck> => [
  { id: "format", command: "oxfmt --check", paths: sourceRoots },
  { id: "lint", command: "oxlint --deny-warnings", paths: sourceRoots },
  {
    id: "generated",
    command: "bun run semproj -- generate --check",
    paths: generatedPaths,
  },
  { id: "types", command: "bun run typecheck", paths: sourceRoots },
];

const checkCommand = (id: string): ReadonlyArray<string> => {
  switch (id) {
    case "format":
      return ["node_modules/.bin/oxfmt", "--check", ...sourceRoots];
    case "lint":
      return ["node_modules/.bin/oxlint", "--deny-warnings", ...sourceRoots];
    case "generated":
      return ["bun", "run", "semproj", "--", "generate", "--check"];
    case "types":
      return ["bun", "run", "typecheck"];
    default:
      throw new WorkflowAdapterError({ message: `unknown check ${id}` });
  }
};

const repairCommand = (effect: string, paths: ReadonlyArray<string>): ReadonlyArray<string> => {
  switch (effect) {
    case "oxfmt_write":
      return ["node_modules/.bin/oxfmt", "--write", ...paths];
    case "oxlint_safe_fix":
      return ["node_modules/.bin/oxlint", "--fix", ...paths];
    case "generated_view_regeneration":
      return ["bun", "run", "semproj", "--", "generate"];
    default:
      throw new WorkflowAdapterError({ message: `unknown repair effect ${effect}` });
  }
};

const repairPlan = (
  effect: "oxfmt_write" | "oxlint_safe_fix" | "generated_view_regeneration",
  paths: ReadonlyArray<string>,
): CommandPlan => {
  const byEffect = {
    oxfmt_write: ["repair:oxfmt-write", "oxfmt --write"],
    oxlint_safe_fix: ["repair:oxlint-safe-fix", "oxlint --fix"],
    generated_view_regeneration: [
      "repair:generated-view-regeneration",
      "semproj generate --deterministic",
    ],
  } as const;
  const [id, command] = byEffect[effect];
  return {
    id,
    command,
    mode: "repair",
    effect,
    affected_paths: paths,
    declared_output_paths: paths,
  };
};

const runRepairPass = (input: CheckInput): Effect.Effect<WorkflowReceipt, WorkflowAdapterError> =>
  Effect.gen(function* () {
    const affectedPaths = [
      ...new Set([...input.affected_paths, ...input.tree.changed_paths]),
    ].sort();
    const policy = input.repair_policy;
    const candidates: ReadonlyArray<readonly [RepairEffect, ReadonlyArray<string>]> = [
      ["oxfmt_write", selectRepairOutputPaths("oxfmt_write", affectedPaths, policy)],
      ["oxlint_safe_fix", selectRepairOutputPaths("oxlint_safe_fix", affectedPaths, policy)],
      [
        "generated_view_regeneration",
        selectRepairOutputPaths("generated_view_regeneration", affectedPaths, policy),
      ],
    ];
    const plans = candidates
      .filter(([, selected]) => selected.length > 0)
      .map(([effect, selected]) => repairPlan(effect, selected))
      .sort((left, right) => left.id.localeCompare(right.id));
    const observations: Array<CommandObservation> = [];
    let current = input.tree.tree_identity;
    for (const plan of plans) {
      const before = yield* digestFiles(plan.declared_output_paths);
      yield* commandSucceeded(repairCommand(plan.effect, plan.declared_output_paths));
      const after = yield* digestFiles(plan.declared_output_paths);
      const changed = changedFiles(before, after);
      const next = yield* treeState();
      observations.push({
        plan_id: plan.id,
        mode: "repair",
        run: 1,
        status: "succeeded",
        input_tree_identity: current,
        output_tree_identity: next.identity,
        changed_paths: changed,
      });
      current = next.identity;
      if (changed.length > 0) {
        const secondBefore = yield* digestFiles(plan.declared_output_paths);
        yield* commandSucceeded(repairCommand(plan.effect, plan.declared_output_paths));
        const secondAfter = yield* digestFiles(plan.declared_output_paths);
        const secondChanged = changedFiles(secondBefore, secondAfter);
        const secondTree = yield* treeState();
        observations.push({
          plan_id: plan.id,
          mode: "repair",
          run: 2,
          status: "succeeded",
          input_tree_identity: current,
          output_tree_identity: secondTree.identity,
          changed_paths: secondChanged,
        });
        current = secondTree.identity;
      }
    }
    return yield* evaluateWorkflow({
      ...input,
      command_observations: observations,
    });
  });

const runChecks = (input: CheckInput): Effect.Effect<WorkflowReceipt, WorkflowAdapterError> =>
  Effect.gen(function* () {
    const affectedPaths = [
      ...new Set([...input.affected_paths, ...input.tree.changed_paths]),
    ].sort();
    const unknownAffectedPath =
      !input.tree.tracked ||
      affectedPaths.some(
        (path) => !input.impact_graph.known_paths.some((knownPath) => pathWithin(path, knownPath)),
      );
    const selectedDefinitions = unknownAffectedPath
      ? [...input.impact_graph.always_checks, ...input.impact_graph.full_checks]
      : [
          ...input.impact_graph.always_checks,
          ...input.impact_graph.affected_checks.filter((check) =>
            check.paths.some((checkPath) =>
              affectedPaths.some(
                (affectedPath) =>
                  pathWithin(checkPath, affectedPath) || pathWithin(affectedPath, checkPath),
              ),
            ),
          ),
        ];
    const definitionsById = new Map<string, ImpactCheck>();
    for (const check of selectedDefinitions) definitionsById.set(check.id, check);
    const plans = [...definitionsById.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((check) => ({
        id: `check:${check.id}`,
        command: check.command,
        mode: "repair" as const,
        effect: "observe" as const,
        affected_paths: check.paths,
        declared_output_paths: [],
      }));
    const observations: Array<CommandObservation> = [];
    let current = input.tree.tree_identity;
    for (const plan of plans) {
      const before = yield* treeState();
      const result = yield* spawn(checkCommand(plan.id.slice("check:".length)));
      const next = yield* treeState();
      const changed =
        before.identity === next.identity
          ? []
          : [...new Set([...before.changedPaths, ...next.changedPaths])].sort();
      observations.push({
        plan_id: plan.id,
        mode: "repair",
        run: 1,
        status: result.exitCode === 0 ? "succeeded" : "failed",
        input_tree_identity: current,
        output_tree_identity: next.identity,
        changed_paths: changed,
      });
      current = next.identity;
    }
    return yield* evaluateWorkflow({ ...input, command_observations: observations });
  });
const checkInput = (
  tree: TreeState,
  policy: RepairPolicy,
  definitions: ReadonlyArray<ImpactCheck>,
  allowedEffects: ReadonlyArray<
    "oxfmt_write" | "oxlint_safe_fix" | "generated_view_regeneration"
  > = policy.allowed_effects,
): CheckInput => ({
  command: "check",
  mode: "repair",
  tree: {
    repository: root,
    base: tree.head,
    head: tree.head,
    tree_identity: tree.identity,
    clean: tree.changedPaths.length === 0,
    tracked: tree.tracked,
    changed_paths: tree.changedPaths,
  },
  affected_paths: tree.changedPaths,
  impact_graph: {
    known_paths: allKnownPaths(),
    always_checks: definitions.filter((check) => check.id === "generated"),
    affected_checks: definitions.filter((check) => check.id !== "generated"),
    full_checks: definitions,
  },
  repair_policy: { ...policy, allowed_effects: [...allowedEffects] },
  command_observations: [],
});

const runCheckWorkflow: Effect.Effect<void, WorkflowAdapterError> = Effect.gen(function* () {
  const initial = yield* treeState();
  const policy = repairPolicy(initial.changedPaths);
  const repairInput = checkInput(initial, policy, []);
  const repaired = yield* runRepairPass(repairInput);
  const afterRepair = yield* treeState();
  const definitions = checkDefinitions();
  const checkInputValue = checkInput(
    afterRepair,
    repairPolicy(afterRepair.changedPaths),
    definitions,
    [],
  );
  const checked = yield* runChecks(checkInputValue);
  yield* Console.log(JSON.stringify({ repair: repaired, check: checked }, null, 2));
});

const observePlan = (id: string, command: string): CommandPlan => ({
  id,
  command,
  mode: "observe",
  effect: "observe",
  affected_paths: allKnownPaths(),
  declared_output_paths: [],
});

const canonicalAcceptancePath = (featureId: string): string => `features/${featureId}/accept.ts`;

const acceptancePlan = (featureId: string): Effect.Effect<CommandPlan, WorkflowAdapterError> =>
  Effect.gen(function* () {
    if (!FEATURE_ID_PATTERN.test(featureId)) {
      return yield* new WorkflowAdapterError({
        message: `verify acceptance requires a valid feature ID: ${featureId}`,
      });
    }
    const path = canonicalAcceptancePath(featureId);
    const exists = yield* Effect.tryPromise({
      try: () => Bun.file(`${root}/${path}`).exists(),
      catch: (cause) =>
        new WorkflowAdapterError({
          message: `cannot inspect canonical acceptance program ${path}: ${String(cause)}`,
        }),
    });
    if (!exists) {
      return yield* new WorkflowAdapterError({
        message: `canonical acceptance program is missing: ${path}`,
      });
    }
    return observePlan("verify:acceptance", `bun ${path}`);
  });

const verifyPlans = (
  acceptance: CommandPlan | undefined,
): readonly [CommandPlan, ...CommandPlan[]] => {
  const plans: [CommandPlan, ...CommandPlan[]] = [
    observePlan("verify:format", "oxfmt --check"),
    observePlan("verify:generated", "semproj generate --deterministic"),
    observePlan("verify:lint", "oxlint --deny-warnings"),
    observePlan("verify:types", "bun run typecheck"),
  ];
  if (acceptance !== undefined) plans.push(acceptance);
  return plans;
};
const verifyCommand = (id: string, featureId?: string): ReadonlyArray<string> => {
  switch (id) {
    case "verify:acceptance":
      if (featureId === undefined) {
        throw new WorkflowAdapterError({
          message: "verify acceptance plan requires a feature ID",
        });
      }
      return ["bun", canonicalAcceptancePath(featureId)];
    case "verify:format":
      return ["node_modules/.bin/oxfmt", "--check", ...sourceRoots];
    case "verify:lint":
      return ["node_modules/.bin/oxlint", "--deny-warnings", ...sourceRoots];
    case "verify:generated":
      return ["bun", "run", "semproj", "--", "generate", "--check"];
    case "verify:types":
      return ["bun", "run", "typecheck"];
    default:
      throw new WorkflowAdapterError({ message: `unknown verify plan ${id}` });
  }
};

const runVerifyWorkflow = (featureId?: string): Effect.Effect<void, WorkflowAdapterError> =>
  Effect.gen(function* () {
    const acceptance = featureId === undefined ? undefined : yield* acceptancePlan(featureId);
    const plans = verifyPlans(acceptance);
    const tree = yield* treeState();
    const observedHead = tree.head;
    const expectedHeadRef = process.env.VERIFY_HEAD ?? process.env.GITHUB_SHA ?? observedHead;
    const expectedHead = yield* gitOutput(["rev-parse", "--verify", `${expectedHeadRef}^{commit}`]);
    const expectedBaseRef = process.env.VERIFY_BASE ?? process.env.GITHUB_BASE_SHA ?? observedHead;
    const resolvedBase = yield* gitOutput(["rev-parse", "--verify", `${expectedBaseRef}^{commit}`]);
    const observedBase = yield* gitOutput(["merge-base", resolvedBase, observedHead]);
    const expectedBase = resolvedBase;
    if (tree.changedPaths.length > 0 || !tree.tracked) {
      yield* evaluateWorkflow({
        command: "verify",
        mode: "observe",
        tree: {
          repository: root,
          base: observedBase,
          head: observedHead,
          tree_identity: tree.identity,
          clean: false,
          tracked: tree.tracked,
          changed_paths: tree.changedPaths,
        },
        expected_base: expectedBase,
        expected_head: expectedHead,
        command_plans: plans,
        command_observations: [],
      });
      return;
    }
    const observations: Array<CommandObservation> = [];
    let current = tree.identity;
    for (const plan of plans) {
      const result = yield* spawn(verifyCommand(plan.id, featureId));
      const next = yield* treeState();
      observations.push({
        plan_id: plan.id,
        mode: "observe",
        run: 1,
        status: result.exitCode === 0 ? "succeeded" : "failed",
        input_tree_identity: current,
        output_tree_identity: next.identity,
        changed_paths: next.changedPaths,
      });
      current = next.identity;
    }
    const input: VerifyInput = {
      command: "verify",
      mode: "observe",
      tree: {
        repository: root,
        base: observedBase,
        head: observedHead,
        tree_identity: tree.identity,
        clean: true,
        tracked: tree.tracked,
        changed_paths: [],
      },
      expected_base: expectedBase,
      expected_head: expectedHead,
      command_plans: plans,
      command_observations: observations,
    };
    const receipt = yield* evaluateWorkflow(input);
    yield* Console.log(JSON.stringify(receipt, null, 2));
  });

const runSetupWorkflow: Effect.Effect<void, WorkflowAdapterError> = Effect.gen(function* () {
  const tree = yield* treeState();
  const commonGitDirectory = yield* gitCommonDirectory();
  const receiptPath = ".git/semproj/setup-receipt.json";
  const receiptFile = resolve(commonGitDirectory, "semproj/setup-receipt.json");
  yield* ensureParentDirectory(receiptFile);
  const effects = [
    [
      "setup:dependencies",
      "bun install --frozen-lockfile --ignore-scripts",
      "pinned_dependency_install",
      ["node_modules"],
    ],
    ["setup:effect", "bun run effect:setup", "pinned_dependency_install", ["node_modules/.cache"]],
    ["setup:hooks", "bun run hooks:install", "checked_hook_configuration", [".git/config"]],
    ["setup:receipt", "write ignored setup receipt", "ignored_setup_receipt", [receiptPath]],
  ] as const;
  const observations: Array<CommandObservation> = [];
  let current = tree.identity;
  for (const [id, command, effect] of effects) {
    if (effect === "ignored_setup_receipt") {
      yield* Effect.tryPromise({
        try: () =>
          Bun.write(
            receiptFile,
            `${JSON.stringify({ format: "semantic.setup-receipt/v1", head: tree.head })}\n`,
          ),
        catch: (cause) =>
          new WorkflowAdapterError({ message: `cannot write setup receipt: ${String(cause)}` }),
      });
    } else {
      yield* commandSucceeded(command.split(" "));
    }
    const next = yield* treeState();
    observations.push({
      plan_id: id,
      mode: "mutate",
      run: 1,
      status: "succeeded",
      input_tree_identity: current,
      output_tree_identity: next.identity,
      changed_paths: effect === "ignored_setup_receipt" ? [receiptPath] : [],
    });
    current = next.identity;
  }
  const receipt = yield* evaluateWorkflow({
    command: "setup",
    mode: "mutate",
    tree: {
      repository: root,
      base: tree.head,
      head: tree.head,
      tree_identity: tree.identity,
      clean: tree.changedPaths.length === 0,
      tracked: tree.tracked,
      changed_paths: tree.changedPaths,
    },
    effects: effects.map(([id, command, effect, outputs]) => ({
      id,
      command,
      effect,
      declared_output_paths: outputs,
    })),
    command_observations: observations,
  });
  yield* Console.log(JSON.stringify(receipt, null, 2));
});

const checkoutFromWorktree = (text: string, featureId: string): CheckoutIdentity | undefined => {
  const lines = text.split(/\r?\n/);
  const worktree = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
  const branch = lines
    .find((line) => line.startsWith("branch "))
    ?.slice("branch ".length)
    .replace("refs/heads/", "");
  if (worktree === undefined || branch !== `feature/${featureId}`) return undefined;
  return {
    feature_id: featureId,
    base: process.env.VERIFY_BASE ?? "unknown-base",
    branch,
    worktree,
    lease: `.git/semantic-leases/${featureId}.json`,
  };
};

export const runStartWorkflow = (featureId: string): Effect.Effect<void, WorkflowAdapterError> =>
  Effect.gen(function* () {
    if (!FEATURE_ID_PATTERN.test(featureId)) {
      return yield* new WorkflowAdapterError({
        message: `start requires a valid feature ID: ${featureId}`,
      });
    }
    const dossier = yield* compileLiveDossierForStart(featureId);
    const tree = yield* treeState();
    const specificationPath = `features/${featureId}/spec.md`;
    const planPath = `features/${featureId}/plan.md`;
    const specificationFact = dossier.facts.find(
      (fact) => fact.kind === "specification" && fact.path === specificationPath,
    );
    const planFact = dossier.facts.find((fact) => fact.kind === "plan" && fact.path === planPath);
    const specification = yield* Effect.tryPromise({
      try: async () => Bun.file(`${root}/${specificationPath}`).text(),
      catch: (cause) =>
        new WorkflowAdapterError({
          message: `cannot read compiled feature specification: ${String(cause)}`,
        }),
    });
    const plan = yield* Effect.tryPromise({
      try: async () => Bun.file(`${root}/${planPath}`).text(),
      catch: (cause) =>
        new WorkflowAdapterError({
          message: `cannot read compiled feature plan: ${String(cause)}`,
        }),
    });
    const frozen = specificationFact !== undefined && /^Status:\s*frozen\s*$/m.test(specification);
    const active =
      planFact !== undefined &&
      dossier.lifecycle.condition.value === "active" &&
      dossier.lifecycle.delivery.value === "unmerged" &&
      plan.trim().length > 0 &&
      /^# Plan\b/m.test(plan);
    if (!frozen) {
      return yield* new WorkflowAdapterError({
        message: `start requires a strictly compiled frozen specification: ${specificationPath}`,
      });
    }
    if (!active) {
      return yield* new WorkflowAdapterError({
        message: `start requires a strictly compiled active plan: ${planPath}`,
      });
    }
    const requestedBase = process.env.VERIFY_BASE ?? tree.head;
    const branch = `feature/${featureId}`;
    const worktree = `.worktrees/${featureId}`;
    const lease = `.git/semantic-leases/${featureId}.json`;
    const commonGitDirectory = yield* gitCommonDirectory();
    const leaseFile = resolve(commonGitDirectory, "semantic-leases", `${featureId}.json`);
    yield* ensureParentDirectory(leaseFile);
    const worktrees = yield* gitOutput(["worktree", "list", "--porcelain"]);
    const foundCheckout = checkoutFromWorktree(worktrees, featureId);
    const existing =
      foundCheckout === undefined ? undefined : { ...foundCheckout, base: requestedBase };
    const input: StartInput = {
      command: "start",
      mode: "mutate",
      tree: {
        repository: root,
        base: tree.head,
        head: tree.head,
        tree_identity: tree.identity,
        clean: tree.changedPaths.length === 0,
        tracked: tree.tracked,
        changed_paths: tree.changedPaths,
      },
      feature_id: featureId,
      specification: { frozen, identity: specificationPath },
      plan: { active, identity: planPath },
      requested_base: requestedBase,
      requested_branch: branch,
      requested_worktree: worktree,
      requested_lease: lease,
      existing_checkouts: existing === undefined ? [] : [existing],
      command_observations: [],
    };
    if (
      existing !== undefined &&
      existing.base === requestedBase &&
      existing.branch === branch &&
      existing.worktree === worktree
    ) {
      const receipt = yield* evaluateWorkflow(input);
      yield* Console.log(JSON.stringify(receipt, null, 2));
      return;
    }
    const branchOutput = `.git/refs/heads/${branch}`;
    const plans: ReadonlyArray<
      [string, string, ReadonlyArray<string>, () => Effect.Effect<void, WorkflowAdapterError>]
    > = [
      [
        "start:branch",
        `git branch ${branch} ${requestedBase}`,
        [branchOutput],
        () => commandSucceeded(["git", "branch", branch, requestedBase]),
      ],
      [
        "start:lease",
        `acquire local lease ${lease}`,
        [lease],
        () =>
          Effect.tryPromise({
            try: () =>
              Bun.write(
                leaseFile,
                `${JSON.stringify({ feature_id: featureId, base: requestedBase })}\n`,
              ),
            catch: (cause) => new WorkflowAdapterError({ message: String(cause) }),
          }),
      ],
      [
        "start:worktree",
        `git worktree add ${worktree} ${branch}`,
        [worktree],
        () => commandSucceeded(["git", "worktree", "add", worktree, branch]),
      ],
    ];
    const observations: Array<CommandObservation> = [];
    let current = tree.identity;
    for (const [id, _command, changedPaths, execute] of plans) {
      yield* execute();
      const next = yield* treeState();
      observations.push({
        plan_id: id,
        mode: "mutate",
        run: 1,
        status: "succeeded",
        input_tree_identity: current,
        output_tree_identity: next.identity,
        changed_paths: changedPaths,
      });
      current = next.identity;
    }
    const receipt = yield* evaluateWorkflow({ ...input, command_observations: observations });
    yield* Console.log(JSON.stringify(receipt, null, 2));
  });

export const runWorkflow = (
  command: "setup" | "check" | "verify" | "start",
  featureId?: string,
): Effect.Effect<void, WorkflowAdapterError> => {
  switch (command) {
    case "setup":
      return runSetupWorkflow;
    case "check":
      return runCheckWorkflow;
    case "verify":
      return runVerifyWorkflow(featureId);
    case "start":
      return featureId === undefined
        ? Effect.fail(new WorkflowAdapterError({ message: "just start requires a feature ID" }))
        : runStartWorkflow(featureId);
  }
};

export const compileLiveDossierForStart = (
  featureId: string,
): Effect.Effect<FeatureDossierArtifact, WorkflowAdapterError> =>
  Effect.gen(function* () {
    const tree = yield* treeState();
    const input = yield* loadFeatureDossier(root, featureId, {
      git: {
        format: "semantic.feature-git-observation/v1",
        feature_id: featureId,
        head: tree.head,
        clean: tree.changedPaths.length === 0,
      },
      validate_design_lens: true,
    });
    return yield* compileFeatureDossier(input);
  }).pipe(
    Effect.provide(BunCrypto.layer),
    Effect.provide([BunFileSystem.layer, BunPath.layer]),
    Effect.mapError(
      (cause) =>
        new WorkflowAdapterError({
          message: `cannot compile feature dossier ${featureId}: ${String(cause)}`,
        }),
    ),
  );

export const runHookObservation: Effect.Effect<void, WorkflowAdapterError> = Effect.gen(
  function* () {
    for (const command of [
      ["node_modules/.bin/oxfmt", "--check", ...sourceRoots],
      ["node_modules/.bin/oxlint", "--deny-warnings", ...sourceRoots],
      ["bun", "run", "semproj", "--", "generate", "--check"],
    ] as const) {
      yield* commandSucceeded(command);
    }
  },
);
