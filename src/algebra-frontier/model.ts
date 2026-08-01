import { Match, Schema } from "effect";

const freezeDeep = <Value>(value: Value, seen = new WeakSet<object>()): Value => {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  return Object.isFrozen(value) ? value : Object.freeze(value);
};

export const algebraFrontierBounds = freezeDeep({
  maximumStringCodeUnits: 2_048,
  maximumStatements: 32,
  maximumRuntimeAlternatives: 8,
  maximumWorkbenchCapabilities: 8,
  maximumCandidates: 3,
  maximumPrecedents: 2,
  maximumUnsupportedClaims: 16,
} as const);

const StatementSchema = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(algebraFrontierBounds.maximumStringCodeUnits),
  ),
);
const boundedArray = <S extends Schema.Constraint>(schema: S, maximum: number) =>
  Schema.Array(schema).pipe(Schema.check(Schema.isMaxLength(maximum)));
const exactArray = <S extends Schema.Constraint>(schema: S, length: number) =>
  Schema.Array(schema).pipe(Schema.check(Schema.isMinLength(length), Schema.isMaxLength(length)));

export const WorkbenchCapabilitySchema = Schema.Struct({
  id: Schema.Literals([
    "signature",
    "equations",
    "composition",
    "interpretation",
    "scope-and-identity",
    "evidence",
    "reflection",
    "discovery",
  ]),
  owner: Schema.Literals(["surface", "core", "build-system", "control-room"]),
  purpose: StatementSchema,
});
export type WorkbenchCapability = typeof WorkbenchCapabilitySchema.Type;

export const PromotionObservationsSchema = Schema.Struct({
  lawful_userland_model: Schema.Boolean,
  repeated_ergonomic_demand: Schema.Boolean,
  faithful_surface_elaboration: Schema.Boolean,
  kernel_obstruction_established: Schema.Boolean,
  smaller_trusted_boundary_after_promotion: Schema.Boolean,
});
export type PromotionObservations = typeof PromotionObservationsSchema.Type;

export const PromotionDecisionSchema = Schema.Struct({
  consistency: Schema.Literals(["consistent", "contradictory-elaboration"]),
  userland: Schema.Literals(["research", "available"]),
  surface: Schema.Literals(["blocked", "defer", "candidate"]),
  kernel: Schema.Literals(["blocked", "defer", "candidate"]),
});
export type PromotionDecision = typeof PromotionDecisionSchema.Type;

export const classifyPromotion = (observations: PromotionObservations): PromotionDecision => {
  const contradictoryElaboration =
    observations.faithful_surface_elaboration && observations.kernel_obstruction_established;
  const blocked = !observations.lawful_userland_model || contradictoryElaboration;
  return freezeDeep({
    consistency: contradictoryElaboration ? "contradictory-elaboration" : "consistent",
    userland: observations.lawful_userland_model ? "available" : "research",
    surface: Match.value(observations).pipe(
      Match.when(
        {
          lawful_userland_model: true,
          repeated_ergonomic_demand: true,
          faithful_surface_elaboration: true,
          kernel_obstruction_established: false,
        },
        () => "candidate" as const,
      ),
      Match.when(
        () => blocked,
        () => "blocked" as const,
      ),
      Match.orElse(() => "defer" as const),
    ),
    kernel: Match.value(observations).pipe(
      Match.when(
        {
          lawful_userland_model: true,
          repeated_ergonomic_demand: true,
          faithful_surface_elaboration: false,
          kernel_obstruction_established: true,
          smaller_trusted_boundary_after_promotion: true,
        },
        () => "candidate" as const,
      ),
      Match.when(
        () => blocked,
        () => "blocked" as const,
      ),
      Match.orElse(() => "defer" as const),
    ),
  });
};

const RuntimeAlternativeSchema = Schema.Struct({
  id: StatementSchema,
  capabilities: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
  properties: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
});

const AlgebraCandidateFieldsSchema = Schema.Struct({
  id: Schema.Literals(["resource-lifecycle", "structured-concurrency", "stm"]),
  observations: PromotionObservationsSchema,
  observation_basis: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
  decision: PromotionDecisionSchema,
  operations: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
  laws: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
  non_laws: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
  runtime_alternatives: boundedArray(
    RuntimeAlternativeSchema,
    algebraFrontierBounds.maximumRuntimeAlternatives,
  ),
  open_obligations: boundedArray(StatementSchema, algebraFrontierBounds.maximumStatements),
});
type AlgebraCandidate = typeof AlgebraCandidateFieldsSchema.Type;

const sameDecision = (left: PromotionDecision, right: PromotionDecision): boolean =>
  left.consistency === right.consistency &&
  left.userland === right.userland &&
  left.surface === right.surface &&
  left.kernel === right.kernel;

const AlgebraCandidateSchema = AlgebraCandidateFieldsSchema.pipe(
  Schema.check(
    Schema.makeFilter<AlgebraCandidate>(
      (candidate) => sameDecision(candidate.decision, classifyPromotion(candidate.observations)),
      { expected: "a promotion decision derived from the candidate observations" },
    ),
  ),
);

const hasExactIds = <Value extends { readonly id: string }>(
  values: ReadonlyArray<Value>,
  expected: ReadonlyArray<string>,
): boolean => {
  const actual = values.map(({ id }) => id);
  return (
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((id) => actual.includes(id))
  );
};

const WorkbenchSchema = exactArray(
  WorkbenchCapabilitySchema,
  algebraFrontierBounds.maximumWorkbenchCapabilities,
).pipe(
  Schema.check(
    Schema.makeFilter(
      (values: ReadonlyArray<WorkbenchCapability>) =>
        hasExactIds(values, [
          "signature",
          "equations",
          "composition",
          "interpretation",
          "scope-and-identity",
          "evidence",
          "reflection",
          "discovery",
        ]),
      { expected: "each declared workbench capability exactly once" },
    ),
  ),
);

const CandidatesSchema = exactArray(
  AlgebraCandidateSchema,
  algebraFrontierBounds.maximumCandidates,
).pipe(
  Schema.check(
    Schema.makeFilter(
      (values: ReadonlyArray<AlgebraCandidate>) =>
        hasExactIds(values, ["resource-lifecycle", "structured-concurrency", "stm"]),
      { expected: "each declared algebra candidate exactly once" },
    ),
  ),
);

const PrecedentSchema = Schema.Struct({
  id: Schema.Literals(["algebraic-data-types", "monadic-context"]),
  lesson: StatementSchema,
});
type Precedent = typeof PrecedentSchema.Type;
const PrecedentsSchema = exactArray(PrecedentSchema, algebraFrontierBounds.maximumPrecedents).pipe(
  Schema.check(
    Schema.makeFilter(
      (values: ReadonlyArray<Precedent>) =>
        hasExactIds(values, ["algebraic-data-types", "monadic-context"]),
      { expected: "each declared precedent exactly once" },
    ),
  ),
);

export const AlgebraFrontierReportSchema = Schema.Struct({
  format: Schema.Literal("semantic.algebra-frontier"),
  version: Schema.Literal(1),
  bounds: Schema.Struct({
    maximum_string_code_units: Schema.Literal(algebraFrontierBounds.maximumStringCodeUnits),
    maximum_statements: Schema.Literal(algebraFrontierBounds.maximumStatements),
    maximum_runtime_alternatives: Schema.Literal(algebraFrontierBounds.maximumRuntimeAlternatives),
    exact_workbench_capabilities: Schema.Literal(
      algebraFrontierBounds.maximumWorkbenchCapabilities,
    ),
    exact_candidates: Schema.Literal(algebraFrontierBounds.maximumCandidates),
    exact_precedents: Schema.Literal(algebraFrontierBounds.maximumPrecedents),
    maximum_unsupported_claims: Schema.Literal(algebraFrontierBounds.maximumUnsupportedClaims),
  }),
  promotion_rule: Schema.Struct({
    userland: StatementSchema,
    surface: StatementSchema,
    kernel: StatementSchema,
    runtime: StatementSchema,
    blocked: StatementSchema,
    defer: StatementSchema,
    candidate: StatementSchema,
  }),
  capability_identity: StatementSchema,
  workbench: WorkbenchSchema,
  candidates: CandidatesSchema,
  precedents: PrecedentsSchema,
  unsupported_claims: boundedArray(StatementSchema, algebraFrontierBounds.maximumUnsupportedClaims),
});
export type AlgebraFrontierReport = typeof AlgebraFrontierReportSchema.Type;
const decodeAlgebraFrontierReportStrict = Schema.decodeUnknownSync(AlgebraFrontierReportSchema, {
  onExcessProperty: "error",
});
export const decodeAlgebraFrontierReport = (input: unknown): AlgebraFrontierReport =>
  freezeDeep(decodeAlgebraFrontierReportStrict(input));

const observations = {
  resources: freezeDeep({
    lawful_userland_model: false,
    repeated_ergonomic_demand: true,
    faithful_surface_elaboration: false,
    kernel_obstruction_established: false,
    smaller_trusted_boundary_after_promotion: false,
  }),
  concurrency: freezeDeep({
    lawful_userland_model: false,
    repeated_ergonomic_demand: true,
    faithful_surface_elaboration: true,
    kernel_obstruction_established: false,
    smaller_trusted_boundary_after_promotion: false,
  }),
  stm: freezeDeep({
    lawful_userland_model: true,
    repeated_ergonomic_demand: true,
    faithful_surface_elaboration: true,
    kernel_obstruction_established: false,
    smaller_trusted_boundary_after_promotion: false,
  }),
} as const satisfies Readonly<Record<string, PromotionObservations>>;

const report = decodeAlgebraFrontierReport({
  format: "semantic.algebra-frontier",
  version: 1,
  bounds: {
    maximum_string_code_units: algebraFrontierBounds.maximumStringCodeUnits,
    maximum_statements: algebraFrontierBounds.maximumStatements,
    maximum_runtime_alternatives: algebraFrontierBounds.maximumRuntimeAlternatives,
    exact_workbench_capabilities: algebraFrontierBounds.maximumWorkbenchCapabilities,
    exact_candidates: algebraFrontierBounds.maximumCandidates,
    exact_precedents: algebraFrontierBounds.maximumPrecedents,
    maximum_unsupported_claims: algebraFrontierBounds.maximumUnsupportedClaims,
  },
  promotion_rule: {
    userland:
      "Requires a typed signature, declared equations, an interpretation, and honest executable evidence.",
    surface:
      "Requires a lawful userland model, repeated ergonomic demand, and faithful elaboration.",
    kernel:
      "Requires a lawful model, repeated ergonomic demand, an established obstruction to faithful elaboration, and a smaller trusted boundary.",
    runtime:
      "Capabilities belong to realizations and remain orthogonal to source and kernel syntax.",
    blocked:
      "A prerequisite is absent or the supplied elaboration observations contradict each other.",
    defer: "The observations are consistent but do not satisfy this layer's promotion threshold.",
    candidate: "Every declared gate for this layer is satisfied; review remains required.",
  },
  capability_identity:
    "Runtime capability names are bounded references into a separate extensible capability vocabulary; this report does not define their authority.",
  workbench: [
    {
      id: "signature",
      owner: "surface",
      purpose: "Declare named parameters, sorts, typed operations, usage grades, and effect rows.",
    },
    {
      id: "equations",
      owner: "core",
      purpose: "Represent quantified equality without silently orienting a law as a rewrite rule.",
    },
    {
      id: "composition",
      owner: "surface",
      purpose:
        "Parameterize, extend, sum, hide, and rename theories with explicit collision diagnostics.",
    },
    {
      id: "interpretation",
      owner: "core",
      purpose:
        "Map operations into values and residual effects while retaining required capabilities.",
    },
    {
      id: "scope-and-identity",
      owner: "core",
      purpose:
        "Generate nominal region identities, track affine ownership, and make transfer explicit.",
    },
    {
      id: "evidence",
      owner: "build-system",
      purpose:
        "Bind examples, generators, shrinkers, proofs, model checks, and counterexamples to exact theory identities.",
    },
    {
      id: "reflection",
      owner: "build-system",
      purpose:
        "Emit one canonical bounded manifest with laws, handlers, assumptions, evidence, and source correspondence.",
    },
    {
      id: "discovery",
      owner: "control-room",
      purpose:
        "Query manifests by types, operations, laws, capabilities, evidence, and realization availability.",
    },
  ],
  candidates: [
    {
      id: "resource-lifecycle",
      observations: observations.resources,
      observation_basis: [
        "industry bracket and scope APIs establish recurring ergonomic demand",
        "Semantic Systems has no accepted local lifecycle law tracer or region elaboration yet",
      ],
      decision: classifyPromotion(observations.resources),
      operations: ["with_acquire", "release", "move_to_scope"],
      laws: [
        "acquisition returns failure or one fresh live identity",
        "one live affine token has one cleanup owner",
        "explicit release consumes cleanup ownership",
        "remaining finalizers run at most once in reverse registration order on every exit",
        "finalizer failure is accumulated without skipping later finalizers",
        "ownership transfer conserves exactly one cleanup owner",
        "parent cleanup waits until owned children can no longer use the resource",
      ],
      non_laws: [
        "release is not a mathematical inverse of acquire",
        "cleanup does not generally undo external effects",
        "cancellation does not prove immediate termination",
      ],
      runtime_alternatives: [
        {
          id: "scope-handler",
          capabilities: [
            "fresh-resource-identity",
            "finalizer-registration",
            "bounded-interruption-masking",
            "ownership-transfer",
          ],
          properties: ["lexical default", "explicit longer-lived ownership"],
        },
        {
          id: "single-owner-resource-actor",
          capabilities: ["send", "receive", "owner-monitoring", "cleanup-delivery"],
          properties: [
            "resource authority remains behind one owner",
            "lexical clients hold transferable handles",
          ],
        },
      ],
      open_obligations: [
        "model lifecycle laws with executable counterexamples",
        "establish or refute non-escaping affine regions over the current core",
        "define cleanup ordering with structured task cancellation",
      ],
    },
    {
      id: "structured-concurrency",
      observations: observations.concurrency,
      observation_basis: [
        "one-shot spawn, join, yield, and cancellation operations have design prior art",
        "Semantic Systems has no accepted local structured-concurrency law tracer",
      ],
      decision: classifyPromotion(observations.concurrency),
      operations: ["spawn", "join", "yield", "request_cancel"],
      laws: [
        "each child has one owning scope unless ownership moves explicitly",
        "scope exit settles or requests cancellation of every owned child",
        "join observes one terminal outcome",
        "cancellation requests are idempotent and monotone",
        "scheduler choices and happens-before observations remain explicit",
        "ordinary scheduling consumes one-shot continuations",
      ],
      non_laws: [
        "fairness is not implied by scheduling",
        "cancellation is not immediate termination",
        "schedule replay is not external-observation replay",
      ],
      runtime_alternatives: [
        {
          id: "task-executor",
          capabilities: [
            "fresh-task-identity",
            "enqueue",
            "suspend",
            "wake",
            "cancellation-delivery",
          ],
          properties: [
            "deterministic scheduler handler available",
            "production scheduler swappable",
          ],
        },
      ],
      open_obligations: [
        "build a bounded structured-concurrency law tracer",
        "specify the shared scope tree for tasks and resources",
        "separate optional actor messaging from the minimal task algebra",
        "establish a scheduler representation because 0018 internal resumptions cannot enter data structures",
      ],
    },
    {
      id: "stm",
      observations: observations.stm,
      observation_basis: [
        "the executable 0014 bounded law tracer supplies a lawful userland model",
        "0014 does not settle the final STM library decision or arbitrary serializability",
      ],
      decision: classifyPromotion(observations.stm),
      operations: ["read", "write", "retry", "or_else", "abort", "after_commit"],
      laws: [
        "attempt writes are isolated until one atomic publication",
        "conflict and dependency wake rerun the pure transaction description",
        "retry waits only on observed dependencies",
        "failed attempts emit no commit actions",
        "retryable bodies exclude resource lifecycle and irreversible operations",
      ],
      non_laws: [
        "serializability does not imply fairness or lock freedom",
        "STM does not require one shared-memory representation",
        "post-commit actions are not exactly-once external delivery",
      ],
      runtime_alternatives: [
        {
          id: "single-owner-transaction-actor",
          capabilities: ["send", "receive", "suspend", "wake"],
          properties: ["serialized domain authority", "small substrate", "bounded parallelism"],
        },
        {
          id: "shared-memory-handler",
          capabilities: ["linearizable-validate-publish", "dependency-park", "dependency-wake"],
          properties: ["parallel attempts", "stronger runtime substrate"],
        },
      ],
      open_obligations: [
        "complete the concurrency and resource substrate gate",
        "compare both realization families against the same STM law suite",
        "retain progress and performance as realization metadata",
      ],
    },
  ],
  precedents: [
    {
      id: "algebraic-data-types",
      lesson:
        "Repeated lawful sums and products justify surface declarations, pattern matching, and derivation without making every datatype a kernel primitive.",
    },
    {
      id: "monadic-context",
      lesson:
        "A reusable library algebra can gain do-style syntax while its interpretation and effects remain explicit.",
    },
  ],
  unsupported_claims: [
    "the current kernel is sufficient for non-escaping resource regions",
    "the current runtime has correct cancellation and finalization ordering",
    "the structured-concurrency candidate already has a local executable law model",
    "the current kernel can store an internal resumption in a scheduler data structure",
    "the STM model proves serializability or progress for arbitrary programs",
    "any candidate requires true multishot continuations",
  ],
});

export const algebraFrontierReport = (): AlgebraFrontierReport => report;
