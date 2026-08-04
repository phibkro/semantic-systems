import { Data, Effect, Schema } from "effect";

/**
 * Pure policy boundary for repository setup, checking, verification, and start.
 * Command execution is deliberately outside this module: callers provide plans
 * and observations, while this module only decodes and evaluates them.
 */

const nonEmptyText = Schema.NonEmptyString;
const relativePathPattern = /^(?![\\/])(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.{1,2}(?:[\\/]|$)).+$/;
const repositoryRelativePath = Schema.String.pipe(
  Schema.check(Schema.isPattern(relativePathPattern)),
);
const featureIdPattern = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const featureId = Schema.String.pipe(Schema.check(Schema.isPattern(featureIdPattern)));
const attemptNumber = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(2)),
);

export const WorkflowCommandSchema = Schema.Literals(["setup", "check", "verify", "start"]);
export type WorkflowCommand = typeof WorkflowCommandSchema.Type;

export const WorkflowModeSchema = Schema.Literals(["mutate", "repair", "observe"]);
export type WorkflowMode = typeof WorkflowModeSchema.Type;

/** A tree identity is compared as an opaque exact value, never inferred. */
export const TreeIdentitySchema = nonEmptyText;
export type TreeIdentity = typeof TreeIdentitySchema.Type;

export const RepositoryIdentitySchema = Schema.Struct({
  repository: nonEmptyText,
  base: TreeIdentitySchema,
  head: TreeIdentitySchema,
});
export type RepositoryIdentity = typeof RepositoryIdentitySchema.Type;

export const AffectedPathsSchema = Schema.Array(repositoryRelativePath);
export type AffectedPaths = typeof AffectedPathsSchema.Type;

export const WorkingTreeObservationSchema = Schema.Struct({
  repository: nonEmptyText,
  base: TreeIdentitySchema,
  head: TreeIdentitySchema,
  tree_identity: TreeIdentitySchema,
  clean: Schema.Boolean,
  tracked: Schema.Boolean,
  changed_paths: AffectedPathsSchema,
});
export type WorkingTreeObservation = typeof WorkingTreeObservationSchema.Type;

export const RepairEffectSchema = Schema.Literals([
  "oxfmt_write",
  "oxlint_safe_fix",
  "generated_view_regeneration",
]);
export type RepairEffect = typeof RepairEffectSchema.Type;

export const SetupEffectSchema = Schema.Literals([
  "pinned_dependency_install",
  "checked_hook_configuration",
  "ignored_setup_receipt",
]);
export type SetupEffect = typeof SetupEffectSchema.Type;

export const CommandEffectSchema = Schema.Literals([
  "observe",
  "oxfmt_write",
  "oxlint_safe_fix",
  "generated_view_regeneration",
  "pinned_dependency_install",
  "checked_hook_configuration",
  "ignored_setup_receipt",
  "create_branch",
  "create_worktree",
  "acquire_lease",
]);
export type CommandEffect = typeof CommandEffectSchema.Type;

export const ImpactCheckSchema = Schema.Struct({
  id: nonEmptyText,
  command: nonEmptyText,
  paths: AffectedPathsSchema,
});
export type ImpactCheck = typeof ImpactCheckSchema.Type;

export const ImpactGraphSchema = Schema.Struct({
  known_paths: AffectedPathsSchema,
  always_checks: Schema.Array(ImpactCheckSchema),
  affected_checks: Schema.Array(ImpactCheckSchema),
  full_checks: Schema.Array(ImpactCheckSchema),
});
export type ImpactGraph = typeof ImpactGraphSchema.Type;

export const RepairPolicySchema = Schema.Struct({
  allowed_effects: Schema.Array(RepairEffectSchema),
  oxfmt_output_paths: AffectedPathsSchema,
  oxlint_output_paths: AffectedPathsSchema,
  generated_view_input_paths: AffectedPathsSchema,
  generated_view_output_paths: AffectedPathsSchema,
  max_attempts: Schema.optionalKey(attemptNumber),
});
export type RepairPolicy = typeof RepairPolicySchema.Type;

export const CommandPlanSchema = Schema.Struct({
  id: nonEmptyText,
  command: nonEmptyText,
  mode: WorkflowModeSchema,
  effect: CommandEffectSchema,
  affected_paths: AffectedPathsSchema,
  declared_output_paths: AffectedPathsSchema,
});
export type CommandPlan = typeof CommandPlanSchema.Type;

export const CommandObservationSchema = Schema.Struct({
  plan_id: nonEmptyText,
  mode: WorkflowModeSchema,
  run: attemptNumber,
  status: Schema.Literals(["succeeded", "failed"]),
  input_tree_identity: TreeIdentitySchema,
  output_tree_identity: TreeIdentitySchema,
  changed_paths: AffectedPathsSchema,
});
export type CommandObservation = typeof CommandObservationSchema.Type;

export const SetupEffectPlanSchema = Schema.Struct({
  id: nonEmptyText,
  command: nonEmptyText,
  effect: SetupEffectSchema,
  declared_output_paths: AffectedPathsSchema,
});
export type SetupEffectPlan = typeof SetupEffectPlanSchema.Type;

export const StartSpecificationSchema = Schema.Struct({
  frozen: Schema.Boolean,
  identity: nonEmptyText,
});
export type StartSpecification = typeof StartSpecificationSchema.Type;

export const StartPlanSchema = Schema.Struct({
  active: Schema.Boolean,
  identity: nonEmptyText,
});
export type StartPlan = typeof StartPlanSchema.Type;

export const CheckoutIdentitySchema = Schema.Struct({
  feature_id: featureId,
  base: TreeIdentitySchema,
  branch: nonEmptyText,
  worktree: nonEmptyText,
  lease: nonEmptyText,
});
export type CheckoutIdentity = typeof CheckoutIdentitySchema.Type;

export const SetupInputSchema = Schema.Struct({
  command: Schema.Literal("setup"),
  mode: Schema.Literal("mutate"),
  tree: WorkingTreeObservationSchema,
  effects: Schema.NonEmptyArray(SetupEffectPlanSchema),
  command_observations: Schema.Array(CommandObservationSchema),
});
export type SetupInput = typeof SetupInputSchema.Type;

export const CheckInputSchema = Schema.Struct({
  command: Schema.Literal("check"),
  mode: Schema.Literal("repair"),
  tree: WorkingTreeObservationSchema,
  affected_paths: AffectedPathsSchema,
  impact_graph: ImpactGraphSchema,
  repair_policy: RepairPolicySchema,
  command_observations: Schema.Array(CommandObservationSchema),
});
export type CheckInput = typeof CheckInputSchema.Type;

export const VerifyInputSchema = Schema.Struct({
  command: Schema.Literal("verify"),
  mode: Schema.Literal("observe"),
  tree: WorkingTreeObservationSchema,
  expected_base: TreeIdentitySchema,
  expected_head: TreeIdentitySchema,
  command_plans: Schema.NonEmptyArray(CommandPlanSchema),
  command_observations: Schema.Array(CommandObservationSchema),
});
export type VerifyInput = typeof VerifyInputSchema.Type;

export const StartInputSchema = Schema.Struct({
  command: Schema.Literal("start"),
  mode: Schema.Literal("mutate"),
  tree: WorkingTreeObservationSchema,
  feature_id: featureId,
  specification: StartSpecificationSchema,
  plan: StartPlanSchema,
  requested_base: TreeIdentitySchema,
  requested_branch: nonEmptyText,
  requested_worktree: nonEmptyText,
  requested_lease: nonEmptyText,
  existing_checkouts: Schema.Array(CheckoutIdentitySchema),
  command_observations: Schema.Array(CommandObservationSchema),
});
export type StartInput = typeof StartInputSchema.Type;

export const WorkflowInputSchema = Schema.Union([
  SetupInputSchema,
  CheckInputSchema,
  VerifyInputSchema,
  StartInputSchema,
]);
export type WorkflowInput = typeof WorkflowInputSchema.Type;

export const WorkflowVerdictSchema = Schema.Literals([
  "prepared",
  "started",
  "clean",
  "repaired",
  "failed",
]);
export type WorkflowVerdict = typeof WorkflowVerdictSchema.Type;

export const WorkflowEvidenceSchema = Schema.Struct({
  category: Schema.Literals([
    "setup",
    "local_check",
    "local_repair",
    "exact_head_verification",
    "start",
  ]),
  authoritative: Schema.Boolean,
});
export type WorkflowEvidence = typeof WorkflowEvidenceSchema.Type;

export const WorkflowReceiptSchema = Schema.Struct({
  command: WorkflowCommandSchema,
  mode: WorkflowModeSchema,
  verdict: WorkflowVerdictSchema,
  input_tree_identity: TreeIdentitySchema,
  output_tree_identity: TreeIdentitySchema,
  touched_paths: AffectedPathsSchema,
  command_plans: Schema.Array(CommandPlanSchema),
  command_observations: Schema.Array(CommandObservationSchema),
  evidence: WorkflowEvidenceSchema,
  unsupported_claims: Schema.Array(Schema.String),
  check_scope: Schema.optionalKey(Schema.Literals(["targeted", "full"])),
  idempotent: Schema.optionalKey(Schema.Boolean),
});
export type WorkflowReceipt = typeof WorkflowReceiptSchema.Type;

export type WorkflowErrorCode =
  | "invalid_input"
  | "duplicate_command_plan"
  | "unexpected_observation"
  | "missing_observation"
  | "observation_sequence"
  | "mode_violation"
  | "command_failed"
  | "bounded_execution"
  | "undeclared_mutation"
  | "non_idempotent_repair"
  | "dirty_tree"
  | "untracked_tree"
  | "base_mismatch"
  | "head_mismatch"
  | "verify_mutation"
  | "output_identity_changed"
  | "setup_effect_bounds"
  | "frozen_spec_required"
  | "active_plan_required"
  | "conflicting_checkout"
  | "multiple_checkouts"
  | "missing_start_observation";

export class WorkflowError extends Data.TaggedError("WorkflowError")<{
  readonly code: WorkflowErrorCode;
  readonly message: string;
  readonly command_id?: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

const strictDecodeOptions = { onExcessProperty: "error" } as const;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const uniqueSorted = (paths: ReadonlyArray<string>): Array<string> =>
  [...new Set(paths)].sort(compareText);

const freezePaths = (paths: ReadonlyArray<string>): ReadonlyArray<string> =>
  Object.freeze(uniqueSorted(paths));

const freezePlan = (plan: CommandPlan): CommandPlan =>
  Object.freeze({
    ...plan,
    affected_paths: freezePaths(plan.affected_paths),
    declared_output_paths: freezePaths(plan.declared_output_paths),
  });

const freezeObservation = (observation: CommandObservation): CommandObservation =>
  Object.freeze({ ...observation, changed_paths: freezePaths(observation.changed_paths) });

const freezeIdentity = (identity: string): TreeIdentity => identity;

const makeError = (
  code: WorkflowErrorCode,
  message: string,
  command_id?: string,
  path?: string,
): WorkflowError => {
  if (command_id !== undefined && path !== undefined) {
    return new WorkflowError({ code, message, command_id, path });
  }
  if (command_id !== undefined) return new WorkflowError({ code, message, command_id });
  if (path !== undefined) return new WorkflowError({ code, message, path });
  return new WorkflowError({ code, message });
};

const fail = (
  code: WorkflowErrorCode,
  message: string,
  command_id?: string,
  path?: string,
): Effect.Effect<never, WorkflowError> => Effect.fail(makeError(code, message, command_id, path));

const isRepairEffect = (effect: CommandEffect): effect is RepairEffect =>
  effect === "oxfmt_write" ||
  effect === "oxlint_safe_fix" ||
  effect === "generated_view_regeneration";

const asCommandPlan = (
  id: string,
  command: string,
  mode: WorkflowMode,
  effect: CommandEffect,
  affectedPaths: ReadonlyArray<string>,
  outputPaths: ReadonlyArray<string>,
): CommandPlan =>
  freezePlan({
    id,
    command,
    mode,
    effect,
    affected_paths: freezePaths(affectedPaths),
    declared_output_paths: freezePaths(outputPaths),
  });

const asReceipt = ({
  command,
  mode,
  verdict,
  inputTreeIdentity,
  outputTreeIdentity,
  touchedPaths,
  plans,
  observations,
  evidence,
  unsupportedClaims = [],
  checkScope,
  idempotent,
}: {
  readonly command: WorkflowCommand;
  readonly mode: WorkflowMode;
  readonly verdict: WorkflowVerdict;
  readonly inputTreeIdentity: TreeIdentity;
  readonly outputTreeIdentity: TreeIdentity;
  readonly touchedPaths: ReadonlyArray<string>;
  readonly plans: ReadonlyArray<CommandPlan>;
  readonly observations: ReadonlyArray<CommandObservation>;
  readonly evidence: WorkflowEvidence;
  readonly unsupportedClaims?: ReadonlyArray<string>;
  readonly checkScope?: "targeted" | "full";
  readonly idempotent?: boolean;
}): WorkflowReceipt => {
  const base = {
    command,
    mode,
    verdict,
    input_tree_identity: freezeIdentity(inputTreeIdentity),
    output_tree_identity: freezeIdentity(outputTreeIdentity),
    touched_paths: freezePaths(touchedPaths),
    command_plans: Object.freeze(plans.map(freezePlan)),
    command_observations: Object.freeze(observations.map(freezeObservation)),
    evidence: Object.freeze({ ...evidence }),
    unsupported_claims: Object.freeze([...unsupportedClaims]),
  };
  if (checkScope !== undefined && idempotent !== undefined) {
    return Object.freeze({ ...base, check_scope: checkScope, idempotent });
  }
  if (checkScope !== undefined) return Object.freeze({ ...base, check_scope: checkScope });
  if (idempotent !== undefined) return Object.freeze({ ...base, idempotent });
  return Object.freeze(base);
};
const pathMatches = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

const pathsIntersect = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.some((candidate) =>
    right.some((affected) => pathMatches(candidate, affected) || pathMatches(affected, candidate)),
  );

const hasUnknownAffectedPath = (
  affectedPaths: ReadonlyArray<string>,
  knownPaths: ReadonlyArray<string>,
): boolean => !affectedPaths.every((path) => knownPaths.some((known) => pathMatches(path, known)));

const mergeChecks = (
  checks: ReadonlyArray<ImpactCheck>,
): Effect.Effect<ReadonlyArray<ImpactCheck>, WorkflowError> => {
  const byId = new Map<string, ImpactCheck>();
  for (const check of checks) {
    const existing = byId.get(check.id);
    if (existing !== undefined) {
      if (
        existing.command !== check.command ||
        uniqueSorted(existing.paths).join("\u0000") !== uniqueSorted(check.paths).join("\u0000")
      ) {
        return fail(
          "duplicate_command_plan",
          `impact graph contains conflicting check definition ${check.id}`,
          `check:${check.id}`,
        );
      }
      continue;
    }
    byId.set(check.id, check);
  }
  return Effect.succeed([...byId.values()].sort((left, right) => compareText(left.id, right.id)));
};

const repairOutputPaths = (effect: RepairEffect, policy: RepairPolicy): ReadonlyArray<string> => {
  switch (effect) {
    case "oxfmt_write":
      return policy.oxfmt_output_paths;
    case "oxlint_safe_fix":
      return policy.oxlint_output_paths;
    case "generated_view_regeneration":
      return policy.generated_view_output_paths;
  }
};

/**
 * Selects the bounded output set for one repair effect.
 *
 * Generated projections are different from ordinary fixers: a canonical input
 * change may affect any declared projection, even when no projection is dirty
 * yet. The policy's explicit input allowlist is the only trigger for that
 * expansion; unrelated paths can select only already-dirty declared outputs.
 */
export const selectRepairOutputPaths = (
  effect: RepairEffect,
  affectedPaths: ReadonlyArray<string>,
  policy: RepairPolicy,
): ReadonlyArray<string> => {
  const declared = repairOutputPaths(effect, policy);
  if (effect === "generated_view_regeneration") {
    const generatedInputChanged = pathsIntersect(policy.generated_view_input_paths, affectedPaths);
    const generatedOutputChanged = pathsIntersect(declared, affectedPaths);
    if (generatedInputChanged || generatedOutputChanged) return freezePaths(declared);
    return [];
  }
  return freezePaths(declared.filter((path) => affectedPaths.includes(path)));
};

const repairCommand = (effect: RepairEffect): { readonly id: string; readonly command: string } => {
  switch (effect) {
    case "oxfmt_write":
      return { id: "repair:oxfmt-write", command: "oxfmt --write" };
    case "oxlint_safe_fix":
      return { id: "repair:oxlint-safe-fix", command: "oxlint --fix" };
    case "generated_view_regeneration":
      return {
        id: "repair:generated-view-regeneration",
        command: "semproj generate --deterministic",
      };
  }
};

const buildRepairPlans = (
  affectedPaths: ReadonlyArray<string>,
  policy: RepairPolicy,
): ReadonlyArray<CommandPlan> => {
  const plans: Array<CommandPlan> = [];
  const allowed = new Set(policy.allowed_effects);
  for (const effect of ["oxfmt_write", "oxlint_safe_fix", "generated_view_regeneration"] as const) {
    if (!allowed.has(effect)) continue;
    const selected = selectRepairOutputPaths(effect, affectedPaths, policy);
    if (selected.length === 0) continue;
    const command = repairCommand(effect);
    plans.push(asCommandPlan(command.id, command.command, "repair", effect, selected, selected));
  }
  return plans.sort((left, right) => compareText(left.id, right.id));
};

const planIndex = (
  plans: ReadonlyArray<CommandPlan>,
): Effect.Effect<ReadonlyMap<string, CommandPlan>, WorkflowError> => {
  const byId = new Map<string, CommandPlan>();
  for (const plan of plans) {
    if (byId.has(plan.id)) {
      return fail("duplicate_command_plan", `duplicate command plan ${plan.id}`, plan.id);
    }
    byId.set(plan.id, plan);
  }
  return Effect.succeed(byId);
};

interface ObservationResult {
  readonly observations: ReadonlyArray<CommandObservation>;
  readonly touchedPaths: ReadonlyArray<string>;
  readonly outputTreeIdentity: TreeIdentity;
  readonly repairTouchedPaths: ReadonlyArray<string>;
}

const validateObservations = ({
  initialTreeIdentity,
  plans,
  observations,
  requireAll,
  maxAttempts,
  observeOnly,
}: {
  readonly initialTreeIdentity: TreeIdentity;
  readonly plans: ReadonlyArray<CommandPlan>;
  readonly observations: ReadonlyArray<CommandObservation>;
  readonly requireAll: boolean;
  readonly maxAttempts: number;
  readonly observeOnly: boolean;
}): Effect.Effect<ObservationResult, WorkflowError> =>
  Effect.gen(function* () {
    const byId = yield* planIndex(plans);
    const grouped = new Map<string, Array<CommandObservation>>();
    for (const observation of observations) {
      const plan = byId.get(observation.plan_id);
      if (plan === undefined) {
        return yield* fail(
          "unexpected_observation",
          `observation references unknown plan ${observation.plan_id}`,
          observation.plan_id,
        );
      }
      if (observation.mode !== plan.mode) {
        return yield* fail(
          "mode_violation",
          `observation mode does not match plan ${observation.plan_id}`,
          observation.plan_id,
        );
      }
      const entries = grouped.get(observation.plan_id);
      if (entries === undefined) grouped.set(observation.plan_id, [observation]);
      else entries.push(observation);
    }

    const ordered: Array<CommandObservation> = [];
    const touched: Array<string> = [];
    const repairTouched: Array<string> = [];
    let currentIdentity = initialTreeIdentity;

    for (const plan of plans) {
      const entries = (grouped.get(plan.id) ?? []).sort((left, right) => left.run - right.run);
      if (requireAll && entries.length === 0) {
        return yield* fail(
          "missing_observation",
          `missing observation for plan ${plan.id}`,
          plan.id,
        );
      }
      if (entries.length > maxAttempts) {
        return yield* fail(
          "bounded_execution",
          `plan ${plan.id} exceeded the ${maxAttempts}-observation bound`,
          plan.id,
        );
      }
      if (plan.mode === "observe" && entries.length > 1) {
        return yield* fail(
          "bounded_execution",
          `observe-only plan ${plan.id} may run only once`,
          plan.id,
        );
      }
      for (let index = 0; index < entries.length; index += 1) {
        const observation = entries[index]!;
        const expectedRun = index + 1;
        if (observation.run !== expectedRun) {
          return yield* fail(
            "observation_sequence",
            `plan ${plan.id} observations must begin at run one and be contiguous`,
            plan.id,
          );
        }
        if (observation.status === "failed") {
          return yield* fail("command_failed", `command ${plan.id} failed`, plan.id);
        }
        if (observation.input_tree_identity !== currentIdentity) {
          return yield* fail(
            "observation_sequence",
            `observation for ${plan.id} does not continue the exact tree identity`,
            plan.id,
          );
        }
        const changedPaths = uniqueSorted(observation.changed_paths);
        const declared = new Set(plan.declared_output_paths);
        const undeclared = changedPaths.find((path) => !declared.has(path));
        if (undeclared !== undefined) {
          return yield* fail(
            observeOnly ? "verify_mutation" : "undeclared_mutation",
            `command ${plan.id} changed undeclared path ${undeclared}`,
            plan.id,
            undeclared,
          );
        }
        if (observation.output_tree_identity !== currentIdentity && changedPaths.length === 0) {
          return yield* fail(
            observeOnly ? "verify_mutation" : "undeclared_mutation",
            `command ${plan.id} changed the tree without reporting a path`,
            plan.id,
          );
        }
        if (observeOnly && observation.output_tree_identity !== currentIdentity) {
          return yield* fail(
            "output_identity_changed",
            `observe-only command ${plan.id} changed output tree identity`,
            plan.id,
          );
        }
        if (observeOnly && changedPaths.length > 0) {
          return yield* fail(
            "verify_mutation",
            `observe-only command ${plan.id} changed the working tree`,
            plan.id,
          );
        }
        if (isRepairEffect(plan.effect) && index === 1 && changedPaths.length > 0) {
          return yield* fail(
            "non_idempotent_repair",
            `repair ${plan.id} changed paths on its bounded second observation`,
            plan.id,
          );
        }
        touched.push(...changedPaths);
        if (isRepairEffect(plan.effect)) repairTouched.push(...changedPaths);
        ordered.push(freezeObservation({ ...observation, changed_paths: changedPaths }));
        currentIdentity = observation.output_tree_identity;
      }
    }

    return {
      observations: Object.freeze(ordered),
      touchedPaths: freezePaths(touched),
      outputTreeIdentity: currentIdentity,
      repairTouchedPaths: freezePaths(repairTouched),
    } satisfies ObservationResult;
  });

const evaluateSetup = (input: SetupInput): Effect.Effect<WorkflowReceipt, WorkflowError> =>
  Effect.gen(function* () {
    const plans = input.effects
      .map((effect) => {
        const paths = freezePaths(effect.declared_output_paths);
        return asCommandPlan(effect.id, effect.command, "mutate", effect.effect, paths, paths);
      })
      .sort((left, right) => compareText(left.id, right.id));

    const result = yield* validateObservations({
      initialTreeIdentity: input.tree.tree_identity,
      plans,
      observations: input.command_observations,
      requireAll: true,
      maxAttempts: 1,
      observeOnly: false,
    });
    return asReceipt({
      command: "setup",
      mode: "mutate",
      verdict: "prepared",
      inputTreeIdentity: input.tree.tree_identity,
      outputTreeIdentity: result.outputTreeIdentity,
      touchedPaths: result.touchedPaths,
      plans,
      observations: result.observations,
      evidence: { category: "setup", authoritative: false },
    });
  });

const evaluateCheck = (input: CheckInput): Effect.Effect<WorkflowReceipt, WorkflowError> =>
  Effect.gen(function* () {
    const affectedPaths = uniqueSorted([...input.affected_paths, ...input.tree.changed_paths]);
    const unknownAffectedPath =
      !input.tree.tracked || hasUnknownAffectedPath(affectedPaths, input.impact_graph.known_paths);
    const selectedChecks = yield* mergeChecks([
      ...input.impact_graph.always_checks,
      ...(unknownAffectedPath
        ? input.impact_graph.full_checks
        : input.impact_graph.affected_checks.filter((check) =>
            pathsIntersect(check.paths, affectedPaths),
          )),
    ]);
    const checkPlans = selectedChecks.map((check) =>
      asCommandPlan(`check:${check.id}`, check.command, "repair", "observe", check.paths, []),
    );
    const repairPlans = buildRepairPlans(affectedPaths, input.repair_policy);
    const plans = [...checkPlans, ...repairPlans].sort((left, right) =>
      compareText(left.id, right.id),
    );
    const maxAttempts = input.repair_policy.max_attempts ?? 2;
    const result = yield* validateObservations({
      initialTreeIdentity: input.tree.tree_identity,
      plans,
      observations: input.command_observations,
      requireAll: true,
      maxAttempts,
      observeOnly: false,
    });
    const repaired = result.repairTouchedPaths.length > 0;
    return asReceipt({
      command: "check",
      mode: input.mode,
      verdict: repaired ? "repaired" : "clean",
      inputTreeIdentity: input.tree.tree_identity,
      outputTreeIdentity: result.outputTreeIdentity,
      touchedPaths: result.touchedPaths,
      plans,
      observations: result.observations,
      evidence: { category: repaired ? "local_repair" : "local_check", authoritative: false },
      checkScope: unknownAffectedPath ? "full" : "targeted",
    });
  });

const evaluateVerify = (input: VerifyInput): Effect.Effect<WorkflowReceipt, WorkflowError> =>
  Effect.gen(function* () {
    if (!input.tree.tracked) return yield* fail("untracked_tree", "verify requires a tracked tree");
    if (!input.tree.clean || input.tree.changed_paths.length > 0) {
      return yield* fail("dirty_tree", "verify requires a clean tracked tree");
    }
    if (input.tree.base !== input.expected_base) {
      return yield* fail("base_mismatch", "verify base does not match the exact expected base");
    }
    if (input.tree.head !== input.expected_head) {
      return yield* fail("head_mismatch", "verify head does not match the exact expected head");
    }

    const plans = [...input.command_plans]
      .map((plan) => freezePlan(plan))
      .sort((left, right) => compareText(left.id, right.id));
    for (const plan of plans) {
      if (plan.mode !== "observe" || plan.effect !== "observe") {
        return yield* fail(
          "mode_violation",
          `verify command ${plan.id} is not observe-only`,
          plan.id,
        );
      }
      if (plan.declared_output_paths.length > 0) {
        return yield* fail(
          "mode_violation",
          `verify command ${plan.id} declares mutable output paths`,
          plan.id,
        );
      }
    }
    const result = yield* validateObservations({
      initialTreeIdentity: input.tree.tree_identity,
      plans,
      observations: input.command_observations,
      requireAll: true,
      maxAttempts: 1,
      observeOnly: true,
    });
    if (result.outputTreeIdentity !== input.tree.tree_identity) {
      return yield* fail("output_identity_changed", "verify output tree identity changed");
    }
    return asReceipt({
      command: "verify",
      mode: "observe",
      verdict: "clean",
      inputTreeIdentity: input.tree.tree_identity,
      outputTreeIdentity: result.outputTreeIdentity,
      touchedPaths: result.touchedPaths,
      plans,
      observations: result.observations,
      evidence: { category: "exact_head_verification", authoritative: true },
    });
  });

const evaluateStart = (input: StartInput): Effect.Effect<WorkflowReceipt, WorkflowError> =>
  Effect.gen(function* () {
    if (!input.specification.frozen) {
      return yield* fail("frozen_spec_required", "start requires a frozen specification");
    }
    if (!input.plan.active)
      return yield* fail("active_plan_required", "start requires an active plan");
    if (input.requested_base !== input.tree.base) {
      return yield* fail("base_mismatch", "start base does not match the exact repository base");
    }
    if (input.existing_checkouts.length > 1) {
      return yield* fail(
        "multiple_checkouts",
        "start permits at most one existing branch, worktree, and lease",
      );
    }

    const existing = input.existing_checkouts[0];
    const matches =
      existing !== undefined &&
      existing.feature_id === input.feature_id &&
      existing.base === input.requested_base &&
      existing.branch === input.requested_branch &&
      existing.worktree === input.requested_worktree &&
      existing.lease === input.requested_lease;
    if (existing !== undefined && !matches) {
      return yield* fail("conflicting_checkout", "start found a conflicting checkout");
    }
    if (matches) {
      return asReceipt({
        command: "start",
        mode: "mutate",
        verdict: "started",
        inputTreeIdentity: input.tree.tree_identity,
        outputTreeIdentity: input.tree.tree_identity,
        touchedPaths: [],
        plans: [],
        observations: [],
        evidence: { category: "start", authoritative: false },
        idempotent: true,
      });
    }

    const plans = [
      asCommandPlan(
        "start:branch",
        `git branch ${input.requested_branch} ${input.requested_base}`,
        "mutate",
        "create_branch",
        [`.git/refs/heads/${input.requested_branch}`],
        [`.git/refs/heads/${input.requested_branch}`],
      ),
      asCommandPlan(
        "start:lease",
        `acquire local lease ${input.requested_lease}`,
        "mutate",
        "acquire_lease",
        [input.requested_lease],
        [input.requested_lease],
      ),
      asCommandPlan(
        "start:worktree",
        `git worktree add ${input.requested_worktree} ${input.requested_branch}`,
        "mutate",
        "create_worktree",
        [input.requested_worktree],
        [input.requested_worktree],
      ),
    ].sort((left, right) => compareText(left.id, right.id));
    if (input.command_observations.length === 0) {
      return yield* fail(
        "missing_start_observation",
        "start requires observations for each created branch, worktree, and lease",
      );
    }
    const result = yield* validateObservations({
      initialTreeIdentity: input.tree.tree_identity,
      plans,
      observations: input.command_observations,
      requireAll: true,
      maxAttempts: 1,
      observeOnly: false,
    });
    return asReceipt({
      command: "start",
      mode: "mutate",
      verdict: "started",
      inputTreeIdentity: input.tree.tree_identity,
      outputTreeIdentity: result.outputTreeIdentity,
      touchedPaths: result.touchedPaths,
      plans,
      observations: result.observations,
      evidence: { category: "start", authoritative: false },
      idempotent: false,
    });
  });

const evaluateWorkflow = (input: WorkflowInput): Effect.Effect<WorkflowReceipt, WorkflowError> => {
  switch (input.command) {
    case "setup":
      return evaluateSetup(input);
    case "check":
      return evaluateCheck(input);
    case "verify":
      return evaluateVerify(input);
    case "start":
      return evaluateStart(input);
  }
};

/** Decode a strict external input, then evaluate its pure workflow contract. */
export const runRepositoryWorkflow = (
  input: unknown,
): Effect.Effect<WorkflowReceipt, WorkflowError> =>
  Schema.decodeUnknownEffect(
    WorkflowInputSchema,
    strictDecodeOptions,
  )(input).pipe(
    Effect.mapError(
      (cause) =>
        new WorkflowError({
          code: "invalid_input",
          message: "repository workflow input failed strict schema decoding",
          cause,
        }),
    ),
    Effect.flatMap(evaluateWorkflow),
  );
