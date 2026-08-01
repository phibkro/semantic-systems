/**
 * Pure internal adapter from stable semantic identities to Effect Graph's
 * disposable numeric execution indices. Numeric indices must not escape this
 * module into portfolio schemas, persistence, URLs, digests, or projections.
 */
import { Data, Effect } from "effect";
import * as Graph from "effect/Graph";

export interface StableGraphNode {
  readonly id: string;
}

export interface StableGraphEdge {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string;
}

export interface StableDirectedGraphIndex<N extends StableGraphNode, E extends StableGraphEdge> {
  readonly graph: Graph.DirectedGraph<N, E>;
  readonly nodeIndexById: ReadonlyMap<string, Graph.NodeIndex>;
  readonly nodeIdByIndex: ReadonlyMap<Graph.NodeIndex, string>;
  readonly edgeIndexById: ReadonlyMap<string, Graph.EdgeIndex>;
  readonly edgeIdByIndex: ReadonlyMap<Graph.EdgeIndex, string>;
}

export class StableGraphIndexFailure extends Data.TaggedError("StableGraphIndexFailure")<{
  readonly reason:
    | "duplicate-node"
    | "duplicate-edge"
    | "missing-source"
    | "missing-target"
    | "graph-construction"
    | "topological-order";
  readonly message: string;
  readonly cause?: unknown;
}> {}

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const buildStableDirectedGraphIndex = <N extends StableGraphNode, E extends StableGraphEdge>(
  nodes: ReadonlyArray<N>,
  edges: ReadonlyArray<E>,
): Effect.Effect<StableDirectedGraphIndex<N, E>, StableGraphIndexFailure> => {
  const orderedNodes = [...nodes].sort((left, right) => compareCodeUnits(left.id, right.id));
  const orderedEdges = [...edges].sort((left, right) => compareCodeUnits(left.id, right.id));
  const nodeIds = new Set<string>();
  for (const node of orderedNodes) {
    if (nodeIds.has(node.id)) {
      return Effect.fail(
        new StableGraphIndexFailure({
          reason: "duplicate-node",
          message: `duplicate graph node identity ${node.id}`,
        }),
      );
    }
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of orderedEdges) {
    if (edgeIds.has(edge.id)) {
      return Effect.fail(
        new StableGraphIndexFailure({
          reason: "duplicate-edge",
          message: `duplicate graph edge identity ${edge.id}`,
        }),
      );
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source_id)) {
      return Effect.fail(
        new StableGraphIndexFailure({
          reason: "missing-source",
          message: `graph edge ${edge.id} has missing source ${edge.source_id}`,
        }),
      );
    }
    if (!nodeIds.has(edge.target_id)) {
      return Effect.fail(
        new StableGraphIndexFailure({
          reason: "missing-target",
          message: `graph edge ${edge.id} has missing target ${edge.target_id}`,
        }),
      );
    }
  }

  return Effect.try({
    try: () => {
      const nodeIndexById = new Map<string, Graph.NodeIndex>();
      const nodeIdByIndex = new Map<Graph.NodeIndex, string>();
      const edgeIndexById = new Map<string, Graph.EdgeIndex>();
      const edgeIdByIndex = new Map<Graph.EdgeIndex, string>();
      const graph = Graph.directed<N, E>((mutable) => {
        for (const node of orderedNodes) {
          const index = Graph.addNode(mutable, node);
          nodeIndexById.set(node.id, index);
          nodeIdByIndex.set(index, node.id);
        }
        for (const edge of orderedEdges) {
          const index = Graph.addEdge(
            mutable,
            nodeIndexById.get(edge.source_id)!,
            nodeIndexById.get(edge.target_id)!,
            edge,
          );
          edgeIndexById.set(edge.id, index);
          edgeIdByIndex.set(index, edge.id);
        }
      });
      return Object.freeze({
        graph,
        nodeIndexById,
        nodeIdByIndex,
        edgeIndexById,
        edgeIdByIndex,
      });
    },
    catch: (cause) =>
      new StableGraphIndexFailure({
        reason: "graph-construction",
        message: "Effect Graph rejected a validated stable-ID graph",
        cause,
      }),
  });
};

export const isStableGraphAcyclic = <N extends StableGraphNode, E extends StableGraphEdge>(
  index: StableDirectedGraphIndex<N, E>,
): boolean => Graph.isAcyclic(index.graph);

export const topologicalStableIds = <N extends StableGraphNode, E extends StableGraphEdge>(
  index: StableDirectedGraphIndex<N, E>,
): Effect.Effect<ReadonlyArray<string>, StableGraphIndexFailure> =>
  Effect.try({
    try: () =>
      Array.from(Graph.indices(Graph.topo(index.graph)), (nodeIndex) => {
        const id = index.nodeIdByIndex.get(nodeIndex);
        if (id === undefined)
          throw new Error(`topological node ${nodeIndex} has no stable identity`);
        return id;
      }),
    catch: (cause) =>
      new StableGraphIndexFailure({
        reason: "topological-order",
        message: "Effect Graph could not derive a stable topological order",
        cause,
      }),
  });
