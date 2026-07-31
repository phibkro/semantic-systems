import { Effect, type Scope } from "effect";
import type {
  ActorDefinition,
  ActorRef,
  ActorSendError,
  InvalidActorDefinition,
} from "../actor/runtime.ts";
import { spawn } from "../actor/runtime.ts";
import type { SemanticValueRejected } from "./custody.ts";
import type { InvalidSemanticComponent } from "./definition.ts";
import { answer, react, validateState, type SemanticKernelFailure } from "./kernel.ts";
import type {
  Answer,
  ArtifactEnvelope,
  CommandEnvelope,
  Diagnostic,
  ObservationEnvelope,
  QueryEnvelope,
  Reaction,
  SemanticComponent,
  Tagged,
} from "./model.ts";

export type SemanticActorInput<
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
> = CommandEnvelope<Command> | ObservationEnvelope<Observation> | QueryEnvelope<Query>;

export type SemanticActorOutput<
  State,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> =
  | {
      readonly category: "reaction";
      readonly value: Reaction<State, Event, Artifact, Request>;
    }
  | {
      readonly category: "answer";
      readonly value: Answer<Artifact>;
    };

export interface SemanticActorBounds {
  readonly mailboxCapacity: number;
  readonly traceCapacity: number;
}

type SemanticActorKernelError =
  | InvalidSemanticComponent
  | SemanticKernelFailure
  | SemanticValueRejected;

export const semanticActorDefinition = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  initialState: unknown,
  bounds: SemanticActorBounds,
): Effect.Effect<
  ActorDefinition<
    SemanticActorInput<Command, Observation, Query>,
    State,
    SemanticActorOutput<State, Event, Artifact, Request>,
    SemanticActorKernelError,
    never
  >,
  SemanticActorKernelError
> =>
  validateState(component, initialState).pipe(
    Effect.map((ownedInitialState) => ({
      id: `semantic-system:${component.id}`,
      initialState: ownedInitialState,
      mailboxCapacity: bounds.mailboxCapacity,
      traceCapacity: bounds.traceCapacity,
      transition: (input, state) =>
        input.category === "query"
          ? answer(component, state, input).pipe(
              Effect.map(
                (value) =>
                  [
                    state,
                    {
                      category: "answer" as const,
                      value,
                    },
                  ] as const,
              ),
            )
          : react(component, state, input).pipe(
              Effect.map(
                (value) =>
                  [
                    value.state,
                    {
                      category: "reaction" as const,
                      value,
                    },
                  ] as const,
              ),
            ),
    })),
  );

export const spawnSemanticActor = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  initialState: unknown,
  bounds: SemanticActorBounds,
): Effect.Effect<
  ActorRef<
    SemanticActorInput<Command, Observation, Query>,
    SemanticActorOutput<State, Event, Artifact, Request>
  >,
  SemanticActorKernelError | InvalidActorDefinition,
  Scope.Scope
> => semanticActorDefinition(component, initialState, bounds).pipe(Effect.flatMap(spawn));

export interface NormalizedActorJourney<
  State,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly state: State;
  readonly events: ReadonlyArray<Event>;
  readonly artifacts: ReadonlyArray<Artifact>;
  readonly effects: ReadonlyArray<Request>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export const normalizeActorReactions = <
  State,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
>(
  reactions: readonly [
    Reaction<State, Event, Artifact, Request>,
    ...ReadonlyArray<Reaction<State, Event, Artifact, Request>>,
  ],
): NormalizedActorJourney<State, Event, Artifact, Request> => {
  const last = reactions[reactions.length - 1]!;
  return {
    state: last.state,
    events: reactions.flatMap((reaction) => reaction.events.map((event) => event.payload)),
    artifacts: reactions.flatMap((reaction) =>
      reaction.artifacts.map((artifact: ArtifactEnvelope<Artifact>) => artifact.payload),
    ),
    effects: reactions.flatMap((reaction) => reaction.effects.map((effect) => effect.payload)),
    diagnostics: reactions.flatMap((reaction) => reaction.diagnostics),
  };
};

export type SemanticActorSendError = ActorSendError;
