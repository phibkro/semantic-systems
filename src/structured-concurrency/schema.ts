/** Strict public representation for the bounded structured-concurrency tracer. */
import { Data, Schema } from "effect";
import { hasUnicodeScalarsOnly } from "../normalized-core/canonical.ts";

export const structuredConcurrencyBounds = Object.freeze({
  maximumEvents: 64,
  maximumScopes: 16,
  maximumTasks: 16,
  maximumYields: 32,
  maximumIdentityLength: 128,
  maximumLabelLength: 256,
  maximumDiagnosticLength: 1_024,
  maximumObservations: 1_088,
  maximumHappensBefore: 1_024,
});

export type TaskTerminalOutcome =
  | { readonly tag: "succeeded" }
  | { readonly tag: "failed"; readonly message: string }
  | { readonly tag: "cancelled" };

export type AuthoredTaskOutcome = Exclude<TaskTerminalOutcome, { readonly tag: "cancelled" }>;

export interface TaskProgram {
  readonly yields: ReadonlyArray<string>;
  readonly terminal: AuthoredTaskOutcome;
}

export type StructuredConcurrencyEvent =
  | { readonly tag: "open_scope"; readonly scope: string; readonly parent: string }
  | {
      readonly tag: "spawn";
      readonly task: string;
      readonly scope: string;
      readonly program: TaskProgram;
    }
  | {
      readonly tag: "transfer";
      readonly task: string;
      readonly from_scope: string;
      readonly to_scope: string;
    }
  | { readonly tag: "dispatch"; readonly task: string }
  | { readonly tag: "request_cancel"; readonly task: string }
  | { readonly tag: "deliver_cancel"; readonly task: string }
  | { readonly tag: "join"; readonly task: string }
  | { readonly tag: "exit_scope"; readonly scope: string };

export interface StructuredConcurrencyScript {
  readonly format: "semantic.structured-concurrency-script";
  readonly version: 1;
  readonly root_scope: string;
  readonly events: ReadonlyArray<StructuredConcurrencyEvent>;
}

export type StructuredConcurrencyObservation =
  | {
      readonly tag: "scope-opened";
      readonly event_index: number;
      readonly scope: string;
      readonly parent: string;
    }
  | {
      readonly tag: "task-spawned";
      readonly event_index: number;
      readonly task: string;
      readonly scope: string;
    }
  | {
      readonly tag: "task-transferred";
      readonly event_index: number;
      readonly task: string;
      readonly from_scope: string;
      readonly to_scope: string;
    }
  | {
      readonly tag: "task-yielded";
      readonly event_index: number;
      readonly task: string;
      readonly yield_index: number;
      readonly label: string;
    }
  | {
      readonly tag: "task-settled";
      readonly event_index: number;
      readonly task: string;
      readonly outcome: TaskTerminalOutcome;
    }
  | {
      readonly tag: "cancel-requested";
      readonly event_index: number;
      readonly task: string;
      readonly source: "explicit" | "scope-exit";
      readonly first_request: boolean;
    }
  | {
      readonly tag: "join-blocked";
      readonly event_index: number;
      readonly task: string;
    }
  | {
      readonly tag: "join-observed";
      readonly event_index: number;
      readonly task: string;
      readonly outcome: TaskTerminalOutcome;
    }
  | {
      readonly tag: "scope-exit";
      readonly event_index: number;
      readonly scope: string;
      readonly result: "blocked" | "closed";
      readonly open_children: ReadonlyArray<string>;
      readonly live_tasks: ReadonlyArray<string>;
    };

export interface StructuredConcurrencyScopeReport {
  readonly scope: string;
  readonly parent: string | null;
  readonly state: "open" | "closed";
}

export interface StructuredConcurrencyTaskReport {
  readonly task: string;
  readonly spawn_scope: string;
  readonly owner_scope: string | null;
  readonly state: "suspended" | "terminal";
  readonly next_step: number;
  readonly cancellation_requested: boolean;
  readonly outcome: TaskTerminalOutcome | null;
}

export interface ScheduleDecision {
  readonly dispatch_index: number;
  readonly event_index: number;
  readonly task: string;
  readonly step_index: number;
  readonly result: "yielded" | "settled";
}

export interface TaskHappensBefore {
  readonly task: string;
  readonly before_event_index: number;
  readonly after_event_index: number;
}

export interface StructuredConcurrencyLaws {
  readonly singular_ownership: boolean;
  readonly scope_exit_waits: boolean;
  readonly stable_terminal_join: boolean;
  readonly idempotent_cancel_request: boolean;
  readonly one_shot_dispatch: boolean;
}

export interface StructuredConcurrencyRun {
  readonly observations: ReadonlyArray<StructuredConcurrencyObservation>;
  readonly scopes: ReadonlyArray<StructuredConcurrencyScopeReport>;
  readonly tasks: ReadonlyArray<StructuredConcurrencyTaskReport>;
  readonly schedule: ReadonlyArray<ScheduleDecision>;
  readonly happens_before: ReadonlyArray<TaskHappensBefore>;
  readonly laws: StructuredConcurrencyLaws;
}

export interface StructuredConcurrencyReport {
  readonly format: "semantic.structured-concurrency-report";
  readonly version: 1;
  readonly script: StructuredConcurrencyScript;
  readonly reference: StructuredConcurrencyRun;
  readonly effect: StructuredConcurrencyRun;
  readonly comparison: {
    readonly canonical_equal: true;
    readonly scope_ledger_equal: true;
    readonly task_ledger_equal: true;
    readonly trace_equal: true;
    readonly laws_equal: true;
  };
  readonly replay: {
    readonly schedule: "script-dispatches";
    readonly external_observations: "unsupported";
  };
  readonly unsupported_claims: ReadonlyArray<string>;
}

export class StructuredConcurrencyFailure extends Data.TaggedError("StructuredConcurrencyFailure")<{
  readonly code: string;
  readonly event_index: number | null;
  readonly path: string;
  readonly message: string;
}> {}

const boundedText = (minimum: number, maximum: number) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(minimum),
      Schema.isMaxLength(maximum),
      Schema.makeFilter((value: string) =>
        hasUnicodeScalarsOnly(value)
          ? true
          : { path: [], issue: "string must contain Unicode scalar values only" },
      ),
    ),
  );

const IdentitySchema = boundedText(1, structuredConcurrencyBounds.maximumIdentityLength);
const LabelSchema = boundedText(0, structuredConcurrencyBounds.maximumLabelLength);
const DiagnosticSchema = boundedText(0, structuredConcurrencyBounds.maximumDiagnosticLength);
const EventIndexSchema = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));
const NullableIdentitySchema = Schema.NullOr(IdentitySchema);

const AuthoredTaskOutcomeSchema: Schema.Codec<AuthoredTaskOutcome> = Schema.Union([
  Schema.Struct({ tag: Schema.Literal("succeeded") }),
  Schema.Struct({ tag: Schema.Literal("failed"), message: DiagnosticSchema }),
]);
export const TaskTerminalOutcomeSchema: Schema.Codec<TaskTerminalOutcome> = Schema.Union([
  AuthoredTaskOutcomeSchema,
  Schema.Struct({ tag: Schema.Literal("cancelled") }),
]);
const TaskProgramSchema: Schema.Codec<TaskProgram> = Schema.Struct({
  yields: Schema.Array(LabelSchema).pipe(
    Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumYields)),
  ),
  terminal: AuthoredTaskOutcomeSchema,
});

const StructuredConcurrencyEventSchema: Schema.Codec<StructuredConcurrencyEvent> = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("open_scope"),
    scope: IdentitySchema,
    parent: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("spawn"),
    task: IdentitySchema,
    scope: IdentitySchema,
    program: TaskProgramSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("transfer"),
    task: IdentitySchema,
    from_scope: IdentitySchema,
    to_scope: IdentitySchema,
  }),
  Schema.Struct({ tag: Schema.Literal("dispatch"), task: IdentitySchema }),
  Schema.Struct({ tag: Schema.Literal("request_cancel"), task: IdentitySchema }),
  Schema.Struct({ tag: Schema.Literal("deliver_cancel"), task: IdentitySchema }),
  Schema.Struct({ tag: Schema.Literal("join"), task: IdentitySchema }),
  Schema.Struct({ tag: Schema.Literal("exit_scope"), scope: IdentitySchema }),
]);

export const StructuredConcurrencyScriptSchema: Schema.Codec<StructuredConcurrencyScript> =
  Schema.Struct({
    format: Schema.Literal("semantic.structured-concurrency-script"),
    version: Schema.Literal(1),
    root_scope: IdentitySchema,
    events: Schema.Array(StructuredConcurrencyEventSchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumEvents)),
    ),
  });

const ObservationSchema: Schema.Codec<StructuredConcurrencyObservation> = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("scope-opened"),
    event_index: EventIndexSchema,
    scope: IdentitySchema,
    parent: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("task-spawned"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
    scope: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("task-transferred"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
    from_scope: IdentitySchema,
    to_scope: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("task-yielded"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
    yield_index: EventIndexSchema,
    label: LabelSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("task-settled"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
    outcome: TaskTerminalOutcomeSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("cancel-requested"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
    source: Schema.Literals(["explicit", "scope-exit"]),
    first_request: Schema.Boolean,
  }),
  Schema.Struct({
    tag: Schema.Literal("join-blocked"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("join-observed"),
    event_index: EventIndexSchema,
    task: IdentitySchema,
    outcome: TaskTerminalOutcomeSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("scope-exit"),
    event_index: EventIndexSchema,
    scope: IdentitySchema,
    result: Schema.Literals(["blocked", "closed"]),
    open_children: Schema.Array(IdentitySchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumScopes)),
    ),
    live_tasks: Schema.Array(IdentitySchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumTasks)),
    ),
  }),
]);

const ScopeReportSchema: Schema.Codec<StructuredConcurrencyScopeReport> = Schema.Struct({
  scope: IdentitySchema,
  parent: NullableIdentitySchema,
  state: Schema.Literals(["open", "closed"]),
});
const TaskReportSchema: Schema.Codec<StructuredConcurrencyTaskReport> = Schema.Struct({
  task: IdentitySchema,
  spawn_scope: IdentitySchema,
  owner_scope: NullableIdentitySchema,
  state: Schema.Literals(["suspended", "terminal"]),
  next_step: EventIndexSchema,
  cancellation_requested: Schema.Boolean,
  outcome: Schema.NullOr(TaskTerminalOutcomeSchema),
});
const ScheduleSchema: Schema.Codec<ScheduleDecision> = Schema.Struct({
  dispatch_index: EventIndexSchema,
  event_index: EventIndexSchema,
  task: IdentitySchema,
  step_index: EventIndexSchema,
  result: Schema.Literals(["yielded", "settled"]),
});
const HappensBeforeSchema: Schema.Codec<TaskHappensBefore> = Schema.Struct({
  task: IdentitySchema,
  before_event_index: EventIndexSchema,
  after_event_index: EventIndexSchema,
});
const LawsSchema: Schema.Codec<StructuredConcurrencyLaws> = Schema.Struct({
  singular_ownership: Schema.Boolean,
  scope_exit_waits: Schema.Boolean,
  stable_terminal_join: Schema.Boolean,
  idempotent_cancel_request: Schema.Boolean,
  one_shot_dispatch: Schema.Boolean,
});

export const StructuredConcurrencyRunSchema: Schema.Codec<StructuredConcurrencyRun> = Schema.Struct(
  {
    observations: Schema.Array(ObservationSchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumObservations)),
    ),
    scopes: Schema.Array(ScopeReportSchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumScopes)),
    ),
    tasks: Schema.Array(TaskReportSchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumTasks)),
    ),
    schedule: Schema.Array(ScheduleSchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumEvents)),
    ),
    happens_before: Schema.Array(HappensBeforeSchema).pipe(
      Schema.check(Schema.isMaxLength(structuredConcurrencyBounds.maximumHappensBefore)),
    ),
    laws: LawsSchema,
  },
);

export const structuredConcurrencyUnsupportedClaims = Object.freeze([
  "fairness or progress is established",
  "a cancellation request terminates immediately",
  "the Effect adapter is equivalent to a production scheduler",
  "schedule replay is external-observation replay",
  "deadlock freedom is established",
  "the current surface language elaborates structured concurrency faithfully",
  "the current kernel can store resumptions in scheduler data structures",
] as const);

export const StructuredConcurrencyReportSchema: Schema.Codec<StructuredConcurrencyReport> =
  Schema.Struct({
    format: Schema.Literal("semantic.structured-concurrency-report"),
    version: Schema.Literal(1),
    script: StructuredConcurrencyScriptSchema,
    reference: StructuredConcurrencyRunSchema,
    effect: StructuredConcurrencyRunSchema,
    comparison: Schema.Struct({
      canonical_equal: Schema.Literal(true),
      scope_ledger_equal: Schema.Literal(true),
      task_ledger_equal: Schema.Literal(true),
      trace_equal: Schema.Literal(true),
      laws_equal: Schema.Literal(true),
    }),
    replay: Schema.Struct({
      schedule: Schema.Literal("script-dispatches"),
      external_observations: Schema.Literal("unsupported"),
    }),
    unsupported_claims: Schema.Tuple(
      structuredConcurrencyUnsupportedClaims.map((claim) => Schema.Literal(claim)),
    ) as Schema.Codec<ReadonlyArray<string>>,
  });

export const boundedDiagnostic = (message: string): string => {
  let bounded = message.slice(0, structuredConcurrencyBounds.maximumDiagnosticLength);
  const final = bounded.charCodeAt(bounded.length - 1);
  if (final >= 0xd800 && final <= 0xdbff) bounded = bounded.slice(0, -1);
  return bounded;
};

export const structuredConcurrencyFailure = (
  code: string,
  eventIndex: number | null,
  path: string,
  message: string,
): StructuredConcurrencyFailure =>
  new StructuredConcurrencyFailure({ code, event_index: eventIndex, path, message });

export const deepFreeze = <Value>(value: Value, seen = new WeakSet<object>()): Value => {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.isFrozen(value) ? value : Object.freeze(value);
};
