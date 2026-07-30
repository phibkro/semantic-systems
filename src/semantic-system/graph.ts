import { Effect } from "effect";
import { snapshotSemanticValue, type SemanticValueRejected } from "./custody.ts";
import { requireComponent, type InvalidSemanticComponent } from "./definition.ts";
import {
  InvalidInterpreterRegistry,
  requireInterpreterRegistry,
  type InterpreterRegistry,
} from "./driver.ts";
import type { SemanticComponent, Tagged } from "./model.ts";

export interface SemanticGraphNode {
  readonly id: string;
  readonly kind:
    | "component"
    | "state"
    | "command"
    | "observation"
    | "query"
    | "domain_event"
    | "artifact"
    | "effect_request"
    | "handler"
    | "interpreter";
}

export interface SemanticGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly kind:
    | "owns"
    | "consumes"
    | "emits"
    | "derives"
    | "requests"
    | "interprets"
    | "observes"
    | "realizes";
  readonly progress?: "bounded" | "persistent";
}

export interface SemanticComponentGraph {
  readonly componentId: string;
  readonly nodes: ReadonlyArray<SemanticGraphNode>;
  readonly edges: ReadonlyArray<SemanticGraphEdge>;
  readonly unsupportedClaims: ReadonlyArray<string>;
}

const nodeId = (componentId: string, kind: string, tag: string): string =>
  `${componentId}:${kind}:${tag}`;

export const deriveComponentGraph = <
  State,
  Command extends Tagged,
  Observation extends Tagged,
  Query extends Tagged,
  Event extends Tagged,
  Artifact extends Tagged,
  Request extends Tagged,
  Requirements,
>(
  component: SemanticComponent<State, Command, Observation, Query, Event, Artifact, Request>,
  registry: InterpreterRegistry<Request, Observation, Requirements>,
): Effect.Effect<
  SemanticComponentGraph,
  InvalidSemanticComponent | InvalidInterpreterRegistry | SemanticValueRejected
> =>
  Effect.gen(function* () {
    const { spec } = yield* requireComponent(component);
    if (registry.componentId !== component.id) {
      return yield* new InvalidInterpreterRegistry({
        reason: "interpreter registry belongs to a different component",
      });
    }
    yield* requireInterpreterRegistry(registry);
    const componentNode = `component:${component.id}`;
    const stateNode = `state:${component.id}:${spec.state.schemaId}`;
    const reactionHandler = nodeId(component.id, "handler", "react");
    const queryHandler = nodeId(component.id, "handler", "answer");
    const nodes: Array<SemanticGraphNode> = [
      { id: componentNode, kind: "component" },
      { id: stateNode, kind: "state" },
      { id: reactionHandler, kind: "handler" },
      { id: queryHandler, kind: "handler" },
    ];
    const edges: Array<SemanticGraphEdge> = [
      { source: componentNode, target: stateNode, kind: "owns" },
      { source: componentNode, target: reactionHandler, kind: "realizes" },
      { source: componentNode, target: queryHandler, kind: "realizes" },
    ];

    const addFamily = (
      kind: "command" | "observation" | "query" | "domain_event" | "artifact" | "effect_request",
      tags: ReadonlyArray<string>,
      edge: "consumes" | "emits" | "derives" | "requests",
      handler: string,
    ) => {
      for (const tag of tags) {
        const id = nodeId(component.id, kind, tag);
        if (!nodes.some((node) => node.id === id)) nodes.push({ id, kind });
        edges.push(
          edge === "consumes"
            ? { source: id, target: handler, kind: edge }
            : { source: handler, target: id, kind: edge },
        );
      }
    };

    addFamily("command", spec.commands.tags, "consumes", reactionHandler);
    addFamily("observation", spec.observations.tags, "consumes", reactionHandler);
    addFamily("query", spec.queries.tags, "consumes", queryHandler);
    addFamily("domain_event", spec.events.tags, "emits", reactionHandler);
    addFamily("artifact", spec.artifacts.tags, "derives", reactionHandler);
    addFamily("artifact", spec.artifacts.tags, "derives", queryHandler);
    addFamily("effect_request", spec.effects.tags, "requests", reactionHandler);

    for (const requestTag of registry.requestTags) {
      const interpreter = nodeId(component.id, "interpreter", requestTag);
      const request = nodeId(component.id, "effect_request", requestTag);
      nodes.push({ id: interpreter, kind: "interpreter" });
      edges.push({ source: request, target: interpreter, kind: "interprets" });
      const protocol = spec.protocols.find((candidate) => candidate.requestTag === requestTag)!;
      for (const observationTag of protocol.observationTags) {
        edges.push({
          source: interpreter,
          target: nodeId(component.id, "observation", observationTag),
          kind: "observes",
          progress: protocol.progress.kind,
        });
      }
    }

    return yield* snapshotSemanticValue(
      {
        componentId: component.id,
        nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
        edges: edges.sort((left, right) =>
          `${left.source}:${left.kind}:${left.target}`.localeCompare(
            `${right.source}:${right.kind}:${right.target}`,
          ),
        ),
        unsupportedClaims: [
          "external exactly-once effects",
          "formal semantic correctness",
          "observation truth",
          "OTP supervision",
          "termination of arbitrary authored handlers",
        ],
      },
      "semantic component graph",
    );
  });
