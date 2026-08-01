/** Pure bounded resource-lifecycle law model and strict representation boundary. */
import { Data, Effect, Exit, Schema } from "effect";
import {
  canonicalBytes,
  compareCodePoints,
  hasUnicodeScalarsOnly,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";

export const resourceLifecycleBounds = Object.freeze({
  maximumEvents: 256,
  maximumScopes: 64,
  maximumResources: 256,
  maximumIdentityLength: 128,
  maximumDiagnosticLength: 1_024,
});

export type ExitCause = "normal" | "typed-failure" | "cancellation";

export type FinalizerOutcome =
  | { readonly tag: "succeeded" }
  | { readonly tag: "failed"; readonly message: string };

export type AcquisitionOutcome =
  | {
      readonly tag: "succeeded";
      readonly resource: string;
      readonly finalizer: FinalizerOutcome;
    }
  | { readonly tag: "failed"; readonly message: string };

export type ResourceLifecycleEvent =
  | { readonly tag: "open_scope"; readonly scope: string; readonly parent: string }
  | {
      readonly tag: "acquire";
      readonly attempt: string;
      readonly scope: string;
      readonly outcome: AcquisitionOutcome;
    }
  | {
      readonly tag: "transfer";
      readonly resource: string;
      readonly from_scope: string;
      readonly to_scope: string;
    }
  | { readonly tag: "release"; readonly resource: string; readonly scope: string }
  | { readonly tag: "exit_scope"; readonly scope: string; readonly cause: ExitCause };

export interface ResourceLifecycleScript {
  readonly format: "semantic.resource-lifecycle-script";
  readonly version: 1;
  readonly root_scope: string;
  readonly events: ReadonlyArray<ResourceLifecycleEvent>;
}

export type ResourceLifecycleObservation =
  | {
      readonly tag: "acquisition";
      readonly event_index: number;
      readonly attempt: string;
      readonly scope: string;
      readonly outcome:
        | { readonly tag: "succeeded"; readonly resource: string }
        | { readonly tag: "failed"; readonly message: string };
    }
  | {
      readonly tag: "transfer";
      readonly event_index: number;
      readonly resource: string;
      readonly from_scope: string;
      readonly to_scope: string;
    }
  | {
      readonly tag: "scope-close-blocked";
      readonly event_index: number;
      readonly scope: string;
      readonly open_descendants: ReadonlyArray<string>;
    }
  | {
      readonly tag: "finalization";
      readonly event_index: number;
      readonly resource: string;
      readonly scope: string;
      readonly trigger: "release" | "scope-exit";
      readonly exit_cause: ExitCause | null;
      readonly outcome: FinalizerOutcome;
    };

export interface ResourceLifecycleScopeReport {
  readonly scope: string;
  readonly parent: string | null;
  readonly state: "open" | "closed";
  readonly exit_cause: ExitCause | null;
}

export type ResourceCleanupReport =
  | { readonly tag: "pending" }
  | {
      readonly tag: "finalized";
      readonly event_index: number;
      readonly scope: string;
      readonly trigger: "release" | "scope-exit";
      readonly exit_cause: ExitCause | null;
      readonly outcome: FinalizerOutcome;
    };

export interface ResourceLifecycleResourceReport {
  readonly resource: string;
  readonly attempt: string;
  readonly acquired_scope: string;
  readonly owner_scope: string | null;
  readonly cleanup: ResourceCleanupReport;
}

export interface ResourceLifecycleFinalizerFailure {
  readonly event_index: number;
  readonly resource: string;
  readonly scope: string;
  readonly message: string;
}

export interface ResourceLifecycleLawSummary {
  readonly at_most_once_finalization: boolean;
  readonly singular_ownership: boolean;
  readonly closed_scope_resources_finalized: boolean;
}

export interface ResourceLifecycleReport {
  readonly format: "semantic.resource-lifecycle-report";
  readonly version: 1;
  readonly script: ResourceLifecycleScript;
  readonly observations: ReadonlyArray<ResourceLifecycleObservation>;
  readonly scopes: ReadonlyArray<ResourceLifecycleScopeReport>;
  readonly resources: ReadonlyArray<ResourceLifecycleResourceReport>;
  readonly finalizer_failures: ReadonlyArray<ResourceLifecycleFinalizerFailure>;
  readonly laws: ResourceLifecycleLawSummary;
}

export class ResourceLifecycleFailure extends Data.TaggedError("ResourceLifecycleFailure")<{
  readonly code: string;
  readonly event_index: number | null;
  readonly path: string;
  readonly message: string;
}> {}

const boundedText = (maximum: number) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(maximum),
      Schema.makeFilter((value: string) =>
        hasUnicodeScalarsOnly(value)
          ? true
          : { path: [], issue: "string must contain Unicode scalar values only" },
      ),
    ),
  );

const IdentitySchema = boundedText(resourceLifecycleBounds.maximumIdentityLength);
const DiagnosticSchema = Schema.String.pipe(
  Schema.check(
    Schema.isMaxLength(resourceLifecycleBounds.maximumDiagnosticLength),
    Schema.makeFilter((value: string) =>
      hasUnicodeScalarsOnly(value)
        ? true
        : { path: [], issue: "string must contain Unicode scalar values only" },
    ),
  ),
);
const ExitCauseSchema = Schema.Literals(["normal", "typed-failure", "cancellation"]);
const FinalizerOutcomeSchema: Schema.Codec<FinalizerOutcome> = Schema.Union([
  Schema.Struct({ tag: Schema.Literal("succeeded") }),
  Schema.Struct({ tag: Schema.Literal("failed"), message: DiagnosticSchema }),
]);
const AcquisitionOutcomeSchema: Schema.Codec<AcquisitionOutcome> = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("succeeded"),
    resource: IdentitySchema,
    finalizer: FinalizerOutcomeSchema,
  }),
  Schema.Struct({ tag: Schema.Literal("failed"), message: DiagnosticSchema }),
]);
const ResourceLifecycleEventSchema: Schema.Codec<ResourceLifecycleEvent> = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("open_scope"),
    scope: IdentitySchema,
    parent: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("acquire"),
    attempt: IdentitySchema,
    scope: IdentitySchema,
    outcome: AcquisitionOutcomeSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("transfer"),
    resource: IdentitySchema,
    from_scope: IdentitySchema,
    to_scope: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("release"),
    resource: IdentitySchema,
    scope: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("exit_scope"),
    scope: IdentitySchema,
    cause: ExitCauseSchema,
  }),
]);

export const ResourceLifecycleScriptSchema: Schema.Codec<ResourceLifecycleScript> = Schema.Struct({
  format: Schema.Literal("semantic.resource-lifecycle-script"),
  version: Schema.Literal(1),
  root_scope: IdentitySchema,
  events: Schema.Array(ResourceLifecycleEventSchema).pipe(
    Schema.check(Schema.isMaxLength(resourceLifecycleBounds.maximumEvents)),
  ),
});

const EventIndexSchema = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));
const NullableIdentitySchema = Schema.NullOr(IdentitySchema);
const NullableExitCauseSchema = Schema.NullOr(ExitCauseSchema);
const AcquisitionObservationOutcomeSchema = Schema.Union([
  Schema.Struct({ tag: Schema.Literal("succeeded"), resource: IdentitySchema }),
  Schema.Struct({ tag: Schema.Literal("failed"), message: DiagnosticSchema }),
]);
const ObservationSchema: Schema.Codec<ResourceLifecycleObservation> = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("acquisition"),
    event_index: EventIndexSchema,
    attempt: IdentitySchema,
    scope: IdentitySchema,
    outcome: AcquisitionObservationOutcomeSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("transfer"),
    event_index: EventIndexSchema,
    resource: IdentitySchema,
    from_scope: IdentitySchema,
    to_scope: IdentitySchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("scope-close-blocked"),
    event_index: EventIndexSchema,
    scope: IdentitySchema,
    open_descendants: Schema.Array(IdentitySchema).pipe(
      Schema.check(Schema.isMaxLength(resourceLifecycleBounds.maximumScopes - 1)),
    ),
  }),
  Schema.Struct({
    tag: Schema.Literal("finalization"),
    event_index: EventIndexSchema,
    resource: IdentitySchema,
    scope: IdentitySchema,
    trigger: Schema.Literals(["release", "scope-exit"]),
    exit_cause: NullableExitCauseSchema,
    outcome: FinalizerOutcomeSchema,
  }),
]);
const ScopeReportSchema: Schema.Codec<ResourceLifecycleScopeReport> = Schema.Struct({
  scope: IdentitySchema,
  parent: NullableIdentitySchema,
  state: Schema.Literals(["open", "closed"]),
  exit_cause: NullableExitCauseSchema,
});
const CleanupReportSchema: Schema.Codec<ResourceCleanupReport> = Schema.Union([
  Schema.Struct({ tag: Schema.Literal("pending") }),
  Schema.Struct({
    tag: Schema.Literal("finalized"),
    event_index: EventIndexSchema,
    scope: IdentitySchema,
    trigger: Schema.Literals(["release", "scope-exit"]),
    exit_cause: NullableExitCauseSchema,
    outcome: FinalizerOutcomeSchema,
  }),
]);
const ResourceReportSchema: Schema.Codec<ResourceLifecycleResourceReport> = Schema.Struct({
  resource: IdentitySchema,
  attempt: IdentitySchema,
  acquired_scope: IdentitySchema,
  owner_scope: NullableIdentitySchema,
  cleanup: CleanupReportSchema,
});
const FinalizerFailureSchema: Schema.Codec<ResourceLifecycleFinalizerFailure> = Schema.Struct({
  event_index: EventIndexSchema,
  resource: IdentitySchema,
  scope: IdentitySchema,
  message: DiagnosticSchema,
});
const LawSummarySchema: Schema.Codec<ResourceLifecycleLawSummary> = Schema.Struct({
  at_most_once_finalization: Schema.Boolean,
  singular_ownership: Schema.Boolean,
  closed_scope_resources_finalized: Schema.Boolean,
});

export const ResourceLifecycleReportSchema: Schema.Codec<ResourceLifecycleReport> = Schema.Struct({
  format: Schema.Literal("semantic.resource-lifecycle-report"),
  version: Schema.Literal(1),
  script: ResourceLifecycleScriptSchema,
  observations: Schema.Array(ObservationSchema).pipe(
    Schema.check(Schema.isMaxLength(resourceLifecycleBounds.maximumEvents * 2)),
  ),
  scopes: Schema.Array(ScopeReportSchema).pipe(
    Schema.check(Schema.isMaxLength(resourceLifecycleBounds.maximumScopes)),
  ),
  resources: Schema.Array(ResourceReportSchema).pipe(
    Schema.check(Schema.isMaxLength(resourceLifecycleBounds.maximumResources)),
  ),
  finalizer_failures: Schema.Array(FinalizerFailureSchema).pipe(
    Schema.check(Schema.isMaxLength(resourceLifecycleBounds.maximumResources)),
  ),
  laws: LawSummarySchema,
});

interface MutableScope {
  readonly scope: string;
  readonly parent: string | null;
  state: "open" | "closed";
  exitCause: ExitCause | null;
  readonly owned: Map<string, number>;
}

interface MutableResource {
  readonly resource: string;
  readonly attempt: string;
  readonly acquiredScope: string;
  readonly finalizer: FinalizerOutcome;
  ownerScope: string | null;
  cleanup: ResourceCleanupReport;
}

const failure = (
  code: string,
  eventIndex: number | null,
  path: string,
  message: string,
): ResourceLifecycleFailure =>
  new ResourceLifecycleFailure({ code, event_index: eventIndex, path, message });

const boundedDiagnostic = (message: string): string => {
  let bounded = message.slice(0, resourceLifecycleBounds.maximumDiagnosticLength);
  const final = bounded.charCodeAt(bounded.length - 1);
  if (final >= 0xd800 && final <= 0xdbff) bounded = bounded.slice(0, -1);
  return bounded;
};

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};

const snapshotFinalizer = (outcome: FinalizerOutcome): FinalizerOutcome =>
  outcome.tag === "succeeded" ? { tag: "succeeded" } : { tag: "failed", message: outcome.message };

const isDescendant = (
  candidate: MutableScope,
  ancestor: string,
  scopes: ReadonlyMap<string, MutableScope>,
): boolean => {
  let parent = candidate.parent;
  while (parent !== null) {
    if (parent === ancestor) return true;
    parent = scopes.get(parent)?.parent ?? null;
  }
  return false;
};

const interpret = (
  script: ResourceLifecycleScript,
): ResourceLifecycleReport | ResourceLifecycleFailure => {
  const scopes = new Map<string, MutableScope>([
    [
      script.root_scope,
      {
        scope: script.root_scope,
        parent: null,
        state: "open",
        exitCause: null,
        owned: new Map(),
      },
    ],
  ]);
  const attempts = new Set<string>();
  const resources = new Map<string, MutableResource>();
  const observations: Array<ResourceLifecycleObservation> = [];
  const finalizerFailures: Array<ResourceLifecycleFinalizerFailure> = [];
  let registration = 0;

  const finalize = (
    resource: MutableResource,
    scope: MutableScope,
    eventIndex: number,
    trigger: "release" | "scope-exit",
    exitCause: ExitCause | null,
  ): void => {
    // Ownership is consumed before observing the scripted outcome. Failure is terminal.
    scope.owned.delete(resource.resource);
    resource.ownerScope = null;
    const outcome = snapshotFinalizer(resource.finalizer);
    resource.cleanup = {
      tag: "finalized",
      event_index: eventIndex,
      scope: scope.scope,
      trigger,
      exit_cause: exitCause,
      outcome,
    };
    observations.push({
      tag: "finalization",
      event_index: eventIndex,
      resource: resource.resource,
      scope: scope.scope,
      trigger,
      exit_cause: exitCause,
      outcome,
    });
    if (outcome.tag === "failed") {
      finalizerFailures.push({
        event_index: eventIndex,
        resource: resource.resource,
        scope: scope.scope,
        message: outcome.message,
      });
    }
  };

  for (let eventIndex = 0; eventIndex < script.events.length; eventIndex += 1) {
    const event = script.events[eventIndex]!;
    switch (event.tag) {
      case "open_scope": {
        if (scopes.has(event.scope)) {
          return failure(
            "scope.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope identity was already used",
          );
        }
        const parent = scopes.get(event.parent);
        if (parent === undefined) {
          return failure(
            "scope.parent-missing",
            eventIndex,
            `/events/${eventIndex}/parent`,
            "parent scope does not exist",
          );
        }
        if (parent.state !== "open") {
          return failure(
            "scope.parent-closed",
            eventIndex,
            `/events/${eventIndex}/parent`,
            "cannot open a child of a closed scope",
          );
        }
        if (scopes.size >= resourceLifecycleBounds.maximumScopes) {
          return failure(
            "scope.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}`,
            "successful scope count exceeds the version-one bound",
          );
        }
        scopes.set(event.scope, {
          scope: event.scope,
          parent: event.parent,
          state: "open",
          exitCause: null,
          owned: new Map(),
        });
        break;
      }
      case "acquire": {
        if (attempts.has(event.attempt)) {
          return failure(
            "attempt.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/attempt`,
            "acquisition attempt identity was already used",
          );
        }
        attempts.add(event.attempt);
        const scope = scopes.get(event.scope);
        if (scope === undefined) {
          return failure(
            "scope.missing",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "acquisition scope does not exist",
          );
        }
        if (scope.state !== "open") {
          return failure(
            "scope.closed",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "cannot acquire in a closed scope",
          );
        }
        if (event.outcome.tag === "failed") {
          observations.push({
            tag: "acquisition",
            event_index: eventIndex,
            attempt: event.attempt,
            scope: event.scope,
            outcome: { tag: "failed", message: event.outcome.message },
          });
          break;
        }
        if (resources.has(event.outcome.resource)) {
          return failure(
            "resource.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/outcome/resource`,
            "resource identity was already introduced",
          );
        }
        if (resources.size >= resourceLifecycleBounds.maximumResources) {
          return failure(
            "resource.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}`,
            "successful resource count exceeds the version-one bound",
          );
        }
        const resource: MutableResource = {
          resource: event.outcome.resource,
          attempt: event.attempt,
          acquiredScope: event.scope,
          finalizer: snapshotFinalizer(event.outcome.finalizer),
          ownerScope: event.scope,
          cleanup: { tag: "pending" },
        };
        resources.set(resource.resource, resource);
        scope.owned.set(resource.resource, registration++);
        observations.push({
          tag: "acquisition",
          event_index: eventIndex,
          attempt: event.attempt,
          scope: event.scope,
          outcome: { tag: "succeeded", resource: resource.resource },
        });
        break;
      }
      case "transfer": {
        const resource = resources.get(event.resource);
        if (resource === undefined) {
          return failure(
            "resource.missing",
            eventIndex,
            `/events/${eventIndex}/resource`,
            "resource does not exist",
          );
        }
        if (resource.cleanup.tag === "finalized") {
          return failure(
            "resource.already-finalized",
            eventIndex,
            `/events/${eventIndex}/resource`,
            "cannot transfer an already finalized resource",
          );
        }
        if (resource.ownerScope !== event.from_scope) {
          return failure(
            "resource.owner-mismatch",
            eventIndex,
            `/events/${eventIndex}/from_scope`,
            "transfer source does not own the resource",
          );
        }
        const source = scopes.get(event.from_scope);
        const target = scopes.get(event.to_scope);
        if (source === undefined || source.state !== "open") {
          return failure(
            "scope.source-not-open",
            eventIndex,
            `/events/${eventIndex}/from_scope`,
            "transfer source scope is not open",
          );
        }
        if (target === undefined || target.state !== "open") {
          return failure(
            "scope.target-not-open",
            eventIndex,
            `/events/${eventIndex}/to_scope`,
            "transfer target scope is not open",
          );
        }
        // Remove before install so no transition state has two cleanup owners.
        source.owned.delete(resource.resource);
        resource.ownerScope = null;
        target.owned.set(resource.resource, registration++);
        resource.ownerScope = target.scope;
        observations.push({
          tag: "transfer",
          event_index: eventIndex,
          resource: resource.resource,
          from_scope: source.scope,
          to_scope: target.scope,
        });
        break;
      }
      case "release": {
        const resource = resources.get(event.resource);
        if (resource === undefined) {
          return failure(
            "resource.missing",
            eventIndex,
            `/events/${eventIndex}/resource`,
            "resource does not exist",
          );
        }
        if (resource.cleanup.tag === "finalized") {
          return failure(
            "resource.already-finalized",
            eventIndex,
            `/events/${eventIndex}/resource`,
            "resource was already finalized",
          );
        }
        if (resource.ownerScope !== event.scope) {
          return failure(
            "resource.owner-mismatch",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "release scope does not own the resource",
          );
        }
        const scope = scopes.get(event.scope);
        if (scope === undefined || scope.state !== "open") {
          return failure(
            "scope.not-open",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "release scope is not open",
          );
        }
        finalize(resource, scope, eventIndex, "release", null);
        break;
      }
      case "exit_scope": {
        const scope = scopes.get(event.scope);
        if (scope === undefined) {
          return failure(
            "scope.missing",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope does not exist",
          );
        }
        if (scope.state !== "open") {
          return failure(
            "scope.already-closed",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope was already closed",
          );
        }
        const openDescendants = [...scopes.values()]
          .filter(
            (candidate) =>
              candidate.state === "open" && isDescendant(candidate, scope.scope, scopes),
          )
          .map((candidate) => candidate.scope)
          .sort(compareCodePoints);
        if (openDescendants.length > 0) {
          observations.push({
            tag: "scope-close-blocked",
            event_index: eventIndex,
            scope: scope.scope,
            open_descendants: openDescendants,
          });
          break;
        }
        const owned = [...scope.owned.entries()].sort((left, right) => right[1] - left[1]);
        for (const [resourceId] of owned) {
          finalize(resources.get(resourceId)!, scope, eventIndex, "scope-exit", event.cause);
        }
        scope.state = "closed";
        scope.exitCause = event.cause;
        break;
      }
    }
  }

  const scopeReports: Array<ResourceLifecycleScopeReport> = [...scopes.values()]
    .sort((left, right) => compareCodePoints(left.scope, right.scope))
    .map((scope) => ({
      scope: scope.scope,
      parent: scope.parent,
      state: scope.state,
      exit_cause: scope.exitCause,
    }));
  const resourceReports: Array<ResourceLifecycleResourceReport> = [...resources.values()]
    .sort((left, right) => compareCodePoints(left.resource, right.resource))
    .map((resource) => ({
      resource: resource.resource,
      attempt: resource.attempt,
      acquired_scope: resource.acquiredScope,
      owner_scope: resource.ownerScope,
      cleanup: resource.cleanup,
    }));
  const finalized = observations.filter(
    (observation): observation is Extract<ResourceLifecycleObservation, { tag: "finalization" }> =>
      observation.tag === "finalization",
  );
  const finalizedIds = new Set(finalized.map((observation) => observation.resource));
  const singularOwnership = resourceReports.every((resource) => {
    const owners = [...scopes.values()].filter((scope) => scope.owned.has(resource.resource));
    return resource.cleanup.tag === "pending"
      ? owners.length === 1 && owners[0]!.scope === resource.owner_scope
      : owners.length === 0 && resource.owner_scope === null;
  });

  return deepFreeze({
    format: "semantic.resource-lifecycle-report",
    version: 1,
    script,
    observations,
    scopes: scopeReports,
    resources: resourceReports,
    finalizer_failures: finalizerFailures,
    laws: {
      at_most_once_finalization: finalizedIds.size === finalized.length,
      singular_ownership: singularOwnership,
      closed_scope_resources_finalized: resourceReports.every((resource) => {
        if (resource.owner_scope === null) return true;
        return scopes.get(resource.owner_scope)?.state === "open";
      }),
    },
  });
};

const decodeScript = (
  input: unknown,
): Effect.Effect<ResourceLifecycleScript, ResourceLifecycleFailure> =>
  Schema.decodeUnknownEffect(ResourceLifecycleScriptSchema, { onExcessProperty: "error" })(
    input,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new ResourceLifecycleFailure({
          code: "script.representation-rejected",
          event_index: null,
          path: "$",
          message: boundedDiagnostic(`resource lifecycle script rejected: ${cause.message}`),
        }),
    ),
    Effect.map(deepFreeze),
  );

export const traceResourceLifecycle = (
  input: unknown,
): Effect.Effect<ResourceLifecycleReport, ResourceLifecycleFailure> =>
  Effect.flatMap(decodeScript(input), (script) => {
    const result = interpret(script);
    return result instanceof ResourceLifecycleFailure
      ? Effect.fail(result)
      : Effect.succeed(result);
  });

const reportBytes = (report: ResourceLifecycleReport): Uint8Array =>
  canonicalBytes(report as unknown as CanonicalJsonValue);

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const validateDecodedReport = (
  report: ResourceLifecycleReport,
): ResourceLifecycleReport | ResourceLifecycleFailure => {
  const expected = interpret(report.script);
  if (expected instanceof ResourceLifecycleFailure) {
    return failure(
      "report.script-invalid",
      expected.event_index,
      expected.path,
      "report embeds a script that does not produce a lifecycle report",
    );
  }
  return equalBytes(reportBytes(report), reportBytes(expected))
    ? expected
    : failure(
        "report.derived-fields-mismatch",
        null,
        "$",
        "report does not equal the lifecycle observation derived from its script",
      );
};

export const decodeResourceLifecycleReport = (
  input: unknown,
): Effect.Effect<ResourceLifecycleReport, ResourceLifecycleFailure> =>
  Schema.decodeUnknownEffect(ResourceLifecycleReportSchema, { onExcessProperty: "error" })(
    input,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new ResourceLifecycleFailure({
          code: "report.representation-rejected",
          event_index: null,
          path: "$",
          message: boundedDiagnostic(`resource lifecycle report rejected: ${cause.message}`),
        }),
    ),
    Effect.flatMap((report) => {
      const result = validateDecodedReport(report);
      return result instanceof ResourceLifecycleFailure
        ? Effect.fail(result)
        : Effect.succeed(result);
    }),
  );

export const encodeResourceLifecycleReport = (report: ResourceLifecycleReport): Uint8Array => {
  const decoded = Schema.decodeUnknownExit(ResourceLifecycleReportSchema, {
    onExcessProperty: "error",
  })(report);
  if (Exit.isFailure(decoded)) {
    throw new TypeError("expected a strict semantic.resource-lifecycle-report/v1 value");
  }
  const validated = validateDecodedReport(decoded.value);
  if (validated instanceof ResourceLifecycleFailure) {
    throw new TypeError(validated.message);
  }
  return reportBytes(validated);
};
