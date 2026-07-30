import { Effect, Path, type Crypto, type FileSystem } from "effect";
import { canonicalJson, contentIdentity, jsonEqual } from "../tracer/canonical.ts";
import {
  parseMessage,
  parseState,
  prepareReferenceTransition,
  referenceTransition,
  replay,
  runSteps,
  stateToJson,
  type Event,
} from "../tracer/domain.ts";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  type JsonObject,
} from "../tracer/json.ts";
import { loadInventory } from "../tracer/loader.ts";
import { normalizeRealization } from "../tracer/realization.ts";
import { normalizeTheory } from "../tracer/theory.ts";
import { deterministicFreshIdentifierLayer, inventoryActorDefinition } from "./inventory.ts";
import {
  ActorRuntime,
  type ActorSendError,
  type ActorTraceSnapshot,
  type DeliveryReceipt,
  type InvalidActorDefinition,
} from "./runtime.ts";

export type ActorRuntimeLayer = "bun" | "node";
export type ActorJourneyError = DocumentError | InvalidActorDefinition | ActorSendError;

export interface ActorJourneyObservation {
  readonly schema_version: 2;
  readonly kind: "actor_runtime_observation";
  readonly runtime_layer: ActorRuntimeLayer;
  readonly actor_runtime_identity: string;
  readonly inventory_theory_identity: string;
  readonly pure_realization_identity: string;
  readonly mailbox: {
    readonly capacity: number;
    readonly ordering: "receiver_fifo_by_acceptance_sequence";
    readonly delivery: "at_most_once_in_process";
    readonly backpressure: "suspend_interruptibly_before_acceptance";
  };
  readonly accepted_order: ReadonlyArray<number>;
  readonly completed_order: ReadonlyArray<number>;
  readonly receipts: ReadonlyArray<DeliveryReceipt<Event>>;
  readonly trace: ActorTraceSnapshot;
  readonly actor_events: ReadonlyArray<Event>;
  readonly pure_events: ReadonlyArray<Event>;
  readonly replayed_final_state: JsonObject;
  readonly pure_final_state: JsonObject;
  readonly events_equal: boolean;
  readonly final_state_equal: boolean;
  readonly evidence: {
    readonly actor_journey: "runtime_validation";
    readonly portable_boundary: "static_analysis";
    readonly ownership_review: "assertion";
  };
  readonly unsupported_guarantees: ReadonlyArray<string>;
}

export const actorRuntimeRealizationContract = {
  realization: "semantic.actor.single-owner.v0",
  transition: "inventory.reference.v0",
  ordering: "receiver_fifo_by_acceptance_sequence",
  delivery: "at_most_once_in_process",
  backpressure: "bounded_suspend",
  lifecycle: "scoped_graceful_drain",
  value_transfer: "structured_clone_without_shared_memory.v1",
  definition_custody: "snapshot_fields_at_spawn.v1",
  transfer_failures: "typed_with_total_cause_rendering.v1",
  failure_stop: "linearized_before_current_receipt.v1",
  trace_retention: "declared_bounded_window_with_exact_eviction_counters.v1",
} as const;

export interface ActorScenarioInputs {
  readonly initialState: ReturnType<typeof parseState>;
  readonly steps: ReadonlyArray<JsonObject>;
  readonly messages: ReadonlyArray<ReturnType<typeof parseMessage>>;
  readonly freshIdentifiers: ReadonlyArray<string>;
}

export const prepareActorScenarioInputs = (
  scenario: JsonObject,
): Effect.Effect<ActorScenarioInputs, DocumentError> =>
  Effect.try({
    try: () => {
      const initialState = parseState(
        requireObject(requireKey(scenario, "initial_state", "scenario"), "scenario.initial_state"),
      );
      const steps = requireObjectList(requireKey(scenario, "steps", "scenario"), "scenario.steps");
      let scenarioState = initialState;
      const messages: Array<ReturnType<typeof parseMessage>> = [];
      const freshIdentifiers: Array<string> = [];
      for (const [index, step] of steps.entries()) {
        const message = parseMessage(
          requireObject(requireKey(step, "message", `step[${index}]`), `step[${index}].message`),
        );
        messages.push(message);
        const prepared = prepareReferenceTransition(message, scenarioState);
        if (prepared.kind === "complete") {
          scenarioState = prepared.result[0];
          continue;
        }
        const freshIdentifier = requireString(
          requireKey(step, "fresh_id", `step[${index}]`),
          `step[${index}].fresh_id`,
        );
        freshIdentifiers.push(freshIdentifier);
        scenarioState = prepared.complete(freshIdentifier)[0];
      }
      return {
        initialState,
        steps,
        messages,
        freshIdentifiers,
      };
    },
    catch: (cause) =>
      cause instanceof DocumentError
        ? cause
        : new DocumentError({ message: "cannot prepare actor scenario", cause }),
  });

const pureRealizationDocument = (
  realizations: ReadonlyArray<JsonObject>,
): Effect.Effect<JsonObject, DocumentError> =>
  Effect.try({
    try: () => {
      const document = realizations.find(
        (candidate) => candidate.id === "realization.inventory.pure",
      );
      if (document === undefined) {
        throw new DocumentError({
          message: "missing realization.inventory.pure for actor comparison",
        });
      }
      return document;
    },
    catch: (cause) =>
      cause instanceof DocumentError
        ? cause
        : new DocumentError({ message: "cannot select pure inventory realization", cause }),
  });

export const runInventoryActorJourney = (
  scenarioPath: string,
  runtimeLayer: ActorRuntimeLayer,
): Effect.Effect<
  ActorJourneyObservation,
  ActorJourneyError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const absoluteScenario = path.resolve(scenarioPath);
    const inventoryRoot = path.dirname(path.dirname(absoluteScenario));
    const fixture = yield* loadInventory(inventoryRoot, "development");
    const inputs = yield* prepareActorScenarioInputs(fixture.scenario);
    const theory = yield* normalizeTheory(fixture.theory);
    const theoryId = yield* Effect.try({
      try: () => requireString(requireKey(fixture.theory, "id", "theory"), "theory.id"),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot read inventory theory id", cause }),
    });
    const pure = yield* normalizeRealization(
      yield* pureRealizationDocument(fixture.realizations),
      theory,
      theoryId,
    );
    const mailboxCapacity = 2;
    const traceCapacity = 16;
    const actorRuntimeIdentity = yield* contentIdentity(actorRuntimeRealizationContract);

    const actorResult = yield* Effect.scoped(
      Effect.gen(function* () {
        const actor = yield* ActorRuntime.spawn(
          inventoryActorDefinition(
            "actor.inventory.single",
            inputs.initialState,
            mailboxCapacity,
            traceCapacity,
          ),
        );
        const receipts: Array<DeliveryReceipt<Event>> = [];
        for (const message of inputs.messages) receipts.push(yield* actor.send(message));
        return { receipts, trace: yield* actor.close };
      }).pipe(Effect.provide(deterministicFreshIdentifierLayer(inputs.freshIdentifiers))),
    );

    const actorEvents = actorResult.receipts.map((receipt) => receipt.event);
    const [pureEvents, pureState] = yield* Effect.try({
      try: () => runSteps(inputs.initialState, inputs.steps, referenceTransition),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot execute pure comparison scenario", cause }),
    });
    const replayedFinalState = yield* Effect.try({
      try: () => stateToJson(replay(inputs.initialState, actorEvents)),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: "cannot replay actor events", cause }),
    });
    const pureFinalState = stateToJson(pureState);

    return {
      schema_version: 2,
      kind: "actor_runtime_observation",
      runtime_layer: runtimeLayer,
      actor_runtime_identity: actorRuntimeIdentity,
      inventory_theory_identity: theory.identity,
      pure_realization_identity: pure.identity,
      mailbox: {
        capacity: mailboxCapacity,
        ordering: "receiver_fifo_by_acceptance_sequence",
        delivery: "at_most_once_in_process",
        backpressure: "suspend_interruptibly_before_acceptance",
      },
      accepted_order: actorResult.receipts.map((receipt) => receipt.sequence),
      completed_order: actorResult.receipts.map((receipt) => receipt.sequence),
      receipts: actorResult.receipts,
      trace: actorResult.trace,
      actor_events: actorEvents,
      pure_events: pureEvents,
      replayed_final_state: replayedFinalState,
      pure_final_state: pureFinalState,
      events_equal: jsonEqual(actorEvents, pureEvents),
      final_state_equal: jsonEqual(replayedFinalState, pureFinalState),
      evidence: {
        actor_journey: "runtime_validation",
        portable_boundary: "static_analysis",
        ownership_review: "assertion",
      },
      unsupported_guarantees: [
        "crash recovery",
        "distributed ordering",
        "durable delivery",
        "exactly-once external effects",
        "fairness",
        "formal ownership proof",
      ],
    };
  });

export const actorObservationJson = (observation: ActorJourneyObservation): string =>
  canonicalJson(observation as unknown as JsonObject);

export const normalizeRuntimeLayer = (
  observation: ActorJourneyObservation,
): ActorJourneyObservation => ({ ...observation, runtime_layer: "bun" });

export const actorObservationSucceeded = (observation: ActorJourneyObservation): boolean =>
  observation.events_equal && observation.final_state_equal;
