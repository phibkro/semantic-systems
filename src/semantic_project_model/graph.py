"""Small directed graph algorithms."""

from __future__ import annotations

from collections.abc import Iterable


def adjacency(nodes: Iterable[str], edges: Iterable[tuple[str, str]]) -> dict[str, set[str]]:
    graph: dict[str, set[str]] = {node: set() for node in nodes}
    for source, target in edges:
        graph.setdefault(source, set()).add(target)
        graph.setdefault(target, set())
    return graph


def find_cycle(graph: dict[str, set[str]]) -> tuple[str, ...] | None:
    visiting: set[str] = set()
    visited: set[str] = set()
    stack: list[str] = []

    def visit(node: str) -> tuple[str, ...] | None:
        if node in visited:
            return None
        if node in visiting:
            start = stack.index(node)
            return (*stack[start:], node)
        visiting.add(node)
        stack.append(node)
        for target in sorted(graph.get(node, set())):
            cycle = visit(target)
            if cycle is not None:
                return cycle
        stack.pop()
        visiting.remove(node)
        visited.add(node)
        return None

    for node in sorted(graph):
        cycle = visit(node)
        if cycle is not None:
            return cycle
    return None


def topological_order(graph: dict[str, set[str]]) -> tuple[str, ...]:
    indegree = dict.fromkeys(graph, 0)
    for targets in graph.values():
        for target in targets:
            indegree[target] += 1

    ready = sorted(node for node, degree in indegree.items() if degree == 0)
    order: list[str] = []
    while ready:
        node = ready.pop(0)
        order.append(node)
        for target in sorted(graph[node]):
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
                ready.sort()

    if len(order) != len(graph):
        raise ValueError("graph is cyclic")
    return tuple(order)


def longest_path(graph: dict[str, set[str]], weights: dict[str, int]) -> tuple[str, ...]:
    order = topological_order(graph)
    score = {node: weights.get(node, 1) for node in graph}
    previous: dict[str, str | None] = dict.fromkeys(graph)

    for source in order:
        for target in graph[source]:
            candidate = score[source] + weights.get(target, 1)
            if candidate > score[target]:
                score[target] = candidate
                previous[target] = source

    if not score:
        return ()
    end = max(score, key=lambda node: (score[node], node))
    path: list[str] = []
    cursor: str | None = end
    while cursor is not None:
        path.append(cursor)
        cursor = previous[cursor]
    return tuple(reversed(path))
