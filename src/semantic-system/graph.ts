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
    | "interpreter";
}

export interface SemanticGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly kind: "owns" | "consumes" | "emits" | "derives" | "requests" | "interprets" | "observes";
  readonly progress?: "bounded" | "persistent";
}

export interface SemanticComponentGraph {
  readonly componentId: string;
  readonly nodes: ReadonlyArray<SemanticGraphNode>;
  readonly edges: ReadonlyArray<SemanticGraphEdge>;
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
    const nodes: Array<SemanticGraphNode> = [
      { id: componentNode, kind: "component" },
      { id: stateNode, kind: "state" },
    ];
    const edges: Array<SemanticGraphEdge> = [
      { source: componentNode, target: stateNode, kind: "owns" },
    ];

    const addFamily = (
      kind: "command" | "observation" | "query" | "domain_event" | "artifact" | "effect_request",
      tags: ReadonlyArray<string>,
      edge: "consumes" | "emits" | "derives" | "requests",
    ) => {
      for (const tag of tags) {
        const id = nodeId(component.id, kind, tag);
        nodes.push({ id, kind });
        edges.push(
          edge === "consumes"
            ? { source: id, target: componentNode, kind: edge }
            : { source: componentNode, target: id, kind: edge },
        );
      }
    };

    addFamily("command", spec.commands.tags, "consumes");
    addFamily("observation", spec.observations.tags, "consumes");
    addFamily("query", spec.queries.tags, "consumes");
    addFamily("domain_event", spec.events.tags, "emits");
    addFamily("artifact", spec.artifacts.tags, "derives");
    addFamily("effect_request", spec.effects.tags, "requests");

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
      },
      "semantic component graph",
    );
  });
