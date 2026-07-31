export type Adjacency = ReadonlyMap<string, ReadonlySet<string>>;

export const adjacency = (
  nodes: Iterable<string>,
  edges: Iterable<readonly [string, string]>,
): Adjacency => {
  const graph = new Map<string, Set<string>>();
  for (const node of nodes) graph.set(node, new Set());
  for (const [source, target] of edges) {
    const targets = graph.get(source) ?? new Set<string>();
    targets.add(target);
    graph.set(source, targets);
    if (!graph.has(target)) graph.set(target, new Set());
  }
  return graph;
};

export const findCycle = (graph: Adjacency): ReadonlyArray<string> | undefined => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: Array<string> = [];

  const visit = (node: string): ReadonlyArray<string> | undefined => {
    if (visited.has(node)) return undefined;
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    visiting.add(node);
    stack.push(node);
    const targets = [...(graph.get(node) ?? [])].sort();
    for (const target of targets) {
      const cycle = visit(target);
      if (cycle !== undefined) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return undefined;
  };

  for (const node of [...graph.keys()].sort()) {
    const cycle = visit(node);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
};

export const topologicalOrder = (graph: Adjacency): ReadonlyArray<string> | undefined => {
  const indegree = new Map([...graph.keys()].map((node) => [node, 0]));
  for (const targets of graph.values()) {
    for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const ready = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([node]) => node)
    .sort();
  const order: Array<string> = [];
  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    for (const target of [...(graph.get(node) ?? [])].sort()) {
      const degree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  return order.length === graph.size ? order : undefined;
};

export const longestPath = (
  graph: Adjacency,
  weights: ReadonlyMap<string, number>,
): ReadonlyArray<string> => {
  const order = topologicalOrder(graph);
  if (order === undefined) return [];
  const score = new Map([...graph.keys()].map((node) => [node, weights.get(node) ?? 1]));
  const previous = new Map<string, string | undefined>(
    [...graph.keys()].map((node) => [node, undefined]),
  );

  for (const source of order) {
    for (const target of graph.get(source) ?? []) {
      const candidate = (score.get(source) ?? 0) + (weights.get(target) ?? 1);
      if (candidate > (score.get(target) ?? 0)) {
        score.set(target, candidate);
        previous.set(target, source);
      }
    }
  }
  if (score.size === 0) return [];
  const end = [...score].sort(([leftId, left], [rightId, right]) =>
    left === right ? rightId.localeCompare(leftId) : right - left,
  )[0]![0];
  const path: Array<string> = [];
  let cursor: string | undefined = end;
  while (cursor !== undefined) {
    path.push(cursor);
    cursor = previous.get(cursor);
  }
  return path.reverse();
};
