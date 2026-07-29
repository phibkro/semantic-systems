"""Structured explanation nodes.

Each node names a stable rule code, an outcome, the subject it judged, machine
-readable details, and child nodes, so resolution answers what happened, why,
which evidence was used, which assumptions remain, which alternatives were
rejected, and what could change the outcome (design spec 0001).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from semantic_tracer.types import JsonObject


@dataclass(frozen=True, slots=True)
class ExplanationNode:
    rule: str
    outcome: str
    subject: str
    details: JsonObject
    children: tuple[ExplanationNode, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule": self.rule,
            "outcome": self.outcome,
            "subject": self.subject,
            "details": self.details,
            "children": [child.to_dict() for child in self.children],
        }
