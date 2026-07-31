import type { Schema } from "effect";

export interface Tagged {
  readonly _tag: string;
}

export interface MessageIdentity {
  readonly messageId: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

export interface ObservationProvenance {
  readonly sourceId: string;
  readonly basis: string;
}

interface Envelope<Category extends string, Payload extends Tagged> extends MessageIdentity {
  readonly category: Category;
  readonly componentId: string;
  readonly schemaId: string;
  readonly payload: Payload;
}

export interface CommandEnvelope<Command extends Tagged> extends Envelope<"command", Command> {}

export interface ObservationEnvelope<Observation extends Tagged> extends Envelope<
  "observation",
  Observation
> {
  readonly provenance: ObservationProvenance;
  readonly actionId?: string;
}

export interface QueryEnvelope<Query extends Tagged> extends Envelope<"query", Query> {}

export interface DomainEventEnvelope<Event extends Tagged> extends Envelope<
  "domain_event",
  Event
> {}

export interface ArtifactEnvelope<Artifact extends Tagged> extends Envelope<"artifact", Artifact> {}

export interface EffectRequestEnvelope<Request extends Tagged> extends Envelope<
  "effect_request",
  Request
> {
  readonly actionId: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly relatedMessageId?: string;
}

export interface Emission<Payload extends Tagged> extends MessageIdentity {
  readonly payload: Payload;
}

export interface EffectEmission<Request extends Tagged> extends Emission<Request> {
  readonly actionId: string;
}

export interface ReactionDraft<
  State,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly state: State;
  readonly events: ReadonlyArray<Emission<Event>>;
  readonly artifacts: ReadonlyArray<Emission<Artifact>>;
  readonly effects: ReadonlyArray<EffectEmission<Request>>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export interface AnswerDraft<Artifact extends Tagged> {
  readonly artifacts: ReadonlyArray<Emission<Artifact>>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export interface Reaction<
  State,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly state: State;
  readonly events: ReadonlyArray<DomainEventEnvelope<Event>>;
  readonly artifacts: ReadonlyArray<ArtifactEnvelope<Artifact>>;
  readonly effects: ReadonlyArray<EffectRequestEnvelope<Request>>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export interface Answer<Artifact extends Tagged> {
  readonly artifacts: ReadonlyArray<ArtifactEnvelope<Artifact>>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export interface SemanticFamily<Payload extends Tagged> {
  readonly schemaId: string;
  readonly tags: ReadonlyArray<Payload["_tag"]>;
  readonly schema: Schema.Decoder<Payload, never>;
}

export interface StateFamily<State> {
  readonly schemaId: string;
  readonly schema: Schema.Decoder<State, never>;
}

export interface ProtocolDeclaration {
  readonly requestTag: string;
  readonly observationTags: ReadonlyArray<string>;
  readonly progress:
    | {
        readonly kind: "bounded";
        readonly maximumTurns: number;
      }
    | {
        readonly kind: "persistent";
        readonly waitState: string;
      };
}

export interface SemanticComponentSpec<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly id: string;
  readonly version: string;
  readonly state: StateFamily<State>;
  readonly commands: SemanticFamily<Command>;
  readonly observations: SemanticFamily<Observation>;
  readonly queries: SemanticFamily<Query>;
  readonly events: SemanticFamily<Event>;
  readonly artifacts: SemanticFamily<Artifact>;
  readonly effects: SemanticFamily<Request>;
  readonly protocols: ReadonlyArray<ProtocolDeclaration>;
  readonly react: (
    state: State,
    input: CommandEnvelope<Command> | ObservationEnvelope<Observation>,
  ) => ReactionDraft<State, Event, Artifact, Request>;
  readonly answer: (state: State, query: QueryEnvelope<Query>) => AnswerDraft<Artifact>;
}

export interface SemanticComponentMetadata {
  readonly id: string;
  readonly version: string;
  readonly stateSchemaId: string;
  readonly families: {
    readonly commands: { readonly schemaId: string; readonly tags: ReadonlyArray<string> };
    readonly observations: { readonly schemaId: string; readonly tags: ReadonlyArray<string> };
    readonly queries: { readonly schemaId: string; readonly tags: ReadonlyArray<string> };
    readonly events: { readonly schemaId: string; readonly tags: ReadonlyArray<string> };
    readonly artifacts: { readonly schemaId: string; readonly tags: ReadonlyArray<string> };
    readonly effects: { readonly schemaId: string; readonly tags: ReadonlyArray<string> };
  };
  readonly protocols: ReadonlyArray<ProtocolDeclaration>;
}

export interface SemanticComponent<
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
> {
  readonly id: string;
  readonly version: string;
  readonly metadata: SemanticComponentMetadata;
  readonly _Types?: {
    readonly state: State;
    readonly command: Command;
    readonly observation: Observation;
    readonly query: Query;
    readonly event: Event;
    readonly artifact: Artifact;
    readonly request: Request;
  };
}

export type AnySemanticComponent = SemanticComponent<
  unknown,
  Tagged,
  Tagged,
  Tagged,
  Tagged,
  Tagged,
  Tagged
>;
