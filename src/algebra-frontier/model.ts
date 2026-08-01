import { Match, Schema } from "effect";

const freezeDeep = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

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
  purpose: Schema.String,
});
export type WorkbenchCapability = typeof WorkbenchCapabilitySchema.Type;

export const PromotionObservationsSchema = Schema.Struct({
  lawful_userland_model: Schema.Boolean,
  repeated_ergonomic_demand: Schema.Boolean,
  faithful_surface_elaboration: Schema.Boolean,
  kernel_obstruction_established: Schema.Boolean,
});
export type PromotionObservations = typeof PromotionObservationsSchema.Type;

export const PromotionDecisionSchema = Schema.Struct({
  userland: Schema.Literals(["research", "available"]),
  surface: Schema.Literals(["blocked", "defer", "candidate"]),
  kernel: Schema.Literals(["blocked", "defer", "candidate"]),
});
export type PromotionDecision = typeof PromotionDecisionSchema.Type;

export const classifyPromotion = (observations: PromotionObservations): PromotionDecision =>
  freezeDeep({
    userland: observations.lawful_userland_model ? "available" : "research",
    surface: Match.value(observations).pipe(
      Match.when(
        {
          lawful_userland_model: true,
          repeated_ergonomic_demand: true,
          faithful_surface_elaboration: true,
        },
        () => "candidate" as const,
      ),
      Match.when({ lawful_userland_model: false }, () => "blocked" as const),
      Match.orElse(() => "defer" as const),
    ),
    kernel: Match.value(observations).pipe(
      Match.when(
        { lawful_userland_model: true, kernel_obstruction_established: true },
        () => "candidate" as const,
      ),
      Match.when(
        { lawful_userland_model: false, kernel_obstruction_established: true },
        () => "blocked" as const,
      ),
      Match.orElse(() => "defer" as const),
    ),
  });

const RuntimeAlternativeSchema = Schema.Struct({
  id: Schema.String,
  capabilities: Schema.Array(Schema.String),
  properties: Schema.Array(Schema.String),
});

const AlgebraCandidateSchema = Schema.Struct({
  id: Schema.Literals(["resource-lifecycle", "structured-concurrency", "stm"]),
  observations: PromotionObservationsSchema,
  decision: PromotionDecisionSchema,
  operations: Schema.Array(Schema.String),
  laws: Schema.Array(Schema.String),
  non_laws: Schema.Array(Schema.String),
  runtime_alternatives: Schema.Array(RuntimeAlternativeSchema),
  open_obligations: Schema.Array(Schema.String),
});

export const AlgebraFrontierReportSchema = Schema.Struct({
  format: Schema.Literal("semantic.algebra-frontier"),
  version: Schema.Literal(1),
  promotion_rule: Schema.Struct({
    userland: Schema.String,
    surface: Schema.String,
    kernel: Schema.String,
    runtime: Schema.String,
  }),
  workbench: Schema.Array(WorkbenchCapabilitySchema),
  candidates: Schema.Array(AlgebraCandidateSchema),
  precedents: Schema.Array(
    Schema.Struct({
      id: Schema.Literals(["algebraic-data-types", "monadic-context"]),
      lesson: Schema.String,
    }),
  ),
  unsupported_claims: Schema.Array(Schema.String),
});
export type AlgebraFrontierReport = typeof AlgebraFrontierReportSchema.Type;

const observations = {
  resources: freezeDeep({
    lawful_userland_model: false,
    repeated_ergonomic_demand: true,
    faithful_surface_elaboration: false,
    kernel_obstruction_established: false,
  }),
  concurrency: freezeDeep({
    lawful_userland_model: false,
    repeated_ergonomic_demand: true,
    faithful_surface_elaboration: true,
    kernel_obstruction_established: false,
  }),
  stm: freezeDeep({
    lawful_userland_model: true,
    repeated_ergonomic_demand: true,
    faithful_surface_elaboration: true,
    kernel_obstruction_established: false,
  }),
} as const satisfies Readonly<Record<string, PromotionObservations>>;

const report: AlgebraFrontierReport = freezeDeep({
  format: "semantic.algebra-frontier",
  version: 1,
  promotion_rule: {
    userland:
      "Requires a typed signature, declared equations, an interpretation, and honest executable evidence.",
    surface:
      "Requires a lawful userland model, repeated ergonomic demand, and faithful elaboration.",
    kernel:
      "Requires a lawful model plus an established obstruction to faithful elaboration and a smaller trusted boundary.",
    runtime:
      "Capabilities belong to realizations and remain orthogonal to source and kernel syntax.",
  },
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
      ],
    },
    {
      id: "stm",
      observations: observations.stm,
      decision: classifyPromotion(observations.stm),
      operations: ["read", "write", "retry", "or_else", "after_commit"],
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
    "the STM model proves serializability or progress for arbitrary programs",
    "any candidate requires true multishot continuations",
  ],
});

export const algebraFrontierReport = (): AlgebraFrontierReport => report;
