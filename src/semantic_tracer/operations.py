"""Stage A execution adapter: manifest operation keys to Python functions.

Per design spec 0001, these bindings are a replaceable bootstrap adapter, not
the semantic identity of the theory or realization.
"""

from __future__ import annotations

from semantic_tracer.domain import (
    ReplayFn,
    TransitionFn,
    broken_transition,
    reference_transition,
    replay,
)
from semantic_tracer.jsonutil import DocumentError

TRANSITION_OPERATIONS: dict[str, TransitionFn] = {
    "inventory.reference.v0": reference_transition,
    "inventory.broken-ignore-stock.v0": broken_transition,
}

REPLAY_OPERATIONS: dict[str, ReplayFn] = {
    "inventory.replay.v0": replay,
}


def resolve_transition(operation_key: str) -> TransitionFn:
    try:
        return TRANSITION_OPERATIONS[operation_key]
    except KeyError as error:
        raise DocumentError(f"unbound transition operation {operation_key!r}") from error


def resolve_replay(operation_key: str) -> ReplayFn:
    try:
        return REPLAY_OPERATIONS[operation_key]
    except KeyError as error:
        raise DocumentError(f"unbound replay operation {operation_key!r}") from error
