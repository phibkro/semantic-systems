"""`evidence_result_v1` and producer-diagnostic wire types (design spec 0003).

Pure data: no domain, operations, execution, or conformance-runner import.
Both the evidence producer and the independent checker parse and derive from
these types, so they never need to trust a separately stored aggregate
value -- `passed`, `passed_cases`, and `total_cases` are always recomputed
from `case_results`, never read back off the wire.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from semantic_tracer.jsonutil import (
    DocumentError,
    require_bool,
    require_key,
    require_object,
    require_object_list,
    require_str,
    require_str_list,
)
from semantic_tracer.types import JsonObject

EVIDENCE_RESULT_ARTIFACT_KIND = "evidence_result"
EVIDENCE_RESULT_SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True)
class CaseResult:
    case_id: str
    passed: bool
    detail: JsonObject | None

    def to_dict(self) -> dict[str, Any]:
        return {"case_id": self.case_id, "passed": self.passed, "detail": self.detail}


def _case_result_from_dict(document: JsonObject, context: str) -> CaseResult:
    case_id = require_str(require_key(document, "case_id", context), f"{context}.case_id")
    passed = require_bool(require_key(document, "passed", context), f"{context}.passed")
    detail = document.get("detail")
    if detail is not None:
        detail = require_object(detail, f"{context}.detail")
    return CaseResult(case_id=case_id, passed=passed, detail=detail)


@dataclass(frozen=True, slots=True)
class EvidenceResultPacket:
    """A lossless `evidence_result_v1` packet bound to one exact subject."""

    category: str
    obligation: str
    producer: JsonObject
    theory_identity: str
    realization_identity: str
    assumptions: tuple[str, ...]
    case_results: tuple[CaseResult, ...]

    @property
    def total_cases(self) -> int:
        return len(self.case_results)

    @property
    def passed_cases(self) -> int:
        return sum(1 for case in self.case_results if case.passed)

    @property
    def passed(self) -> bool:
        return self.total_cases > 0 and self.passed_cases == self.total_cases

    @property
    def counterexamples(self) -> tuple[dict[str, Any], ...]:
        return tuple(case.to_dict() for case in self.case_results if not case.passed)

    def to_dict(self) -> dict[str, Any]:
        return {
            "artifact_kind": EVIDENCE_RESULT_ARTIFACT_KIND,
            "schema_version": EVIDENCE_RESULT_SCHEMA_VERSION,
            "category": self.category,
            "obligation": self.obligation,
            "producer": dict(self.producer),
            "theory_identity": self.theory_identity,
            "realization_identity": self.realization_identity,
            "assumptions": list(self.assumptions),
            "case_results": [case.to_dict() for case in self.case_results],
            "passed": self.passed,
            "total_cases": self.total_cases,
            "passed_cases": self.passed_cases,
        }


def evidence_result_from_dict(
    document: JsonObject, context: str = "evidence_result"
) -> EvidenceResultPacket:
    """Parse a lossless `evidence_result_v1` document.

    Rejects a `conformance_suite` recipe outright: a recipe is not evidence
    (design spec 0001/0003). Stored `passed`/`passed_cases`/`total_cases`
    fields, if present, are ignored; every aggregate is recomputed from
    `case_results`.
    """
    artifact_kind = document.get("artifact_kind")
    if artifact_kind != EVIDENCE_RESULT_ARTIFACT_KIND:
        raise DocumentError(
            f"{context}.artifact_kind must be {EVIDENCE_RESULT_ARTIFACT_KIND!r}, "
            f"got {artifact_kind!r} (a conformance recipe is not evidence)"
        )
    schema_version = document.get("schema_version")
    if schema_version != EVIDENCE_RESULT_SCHEMA_VERSION:
        raise DocumentError(
            f"{context}.schema_version must be {EVIDENCE_RESULT_SCHEMA_VERSION!r}, "
            f"got {schema_version!r}"
        )
    category = require_str(require_key(document, "category", context), f"{context}.category")
    obligation = require_str(require_key(document, "obligation", context), f"{context}.obligation")
    producer = require_object(require_key(document, "producer", context), f"{context}.producer")
    theory_identity = require_str(
        require_key(document, "theory_identity", context), f"{context}.theory_identity"
    )
    realization_identity = require_str(
        require_key(document, "realization_identity", context), f"{context}.realization_identity"
    )
    assumptions = tuple(require_str_list(document.get("assumptions", []), f"{context}.assumptions"))
    raw_cases = require_object_list(
        require_key(document, "case_results", context), f"{context}.case_results"
    )
    case_results = tuple(
        _case_result_from_dict(case, f"{context}.case_results[{index}]")
        for index, case in enumerate(raw_cases)
    )
    return EvidenceResultPacket(
        category=category,
        obligation=obligation,
        producer=producer,
        theory_identity=theory_identity,
        realization_identity=realization_identity,
        assumptions=assumptions,
        case_results=case_results,
    )


@dataclass(frozen=True, slots=True)
class ProducerDiagnostic:
    """A typed producer diagnostic: no evidence result was produced."""

    reason_code: str
    detail: JsonObject | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"reason_code": self.reason_code, "detail": self.detail}


type ProducerOutcome = EvidenceResultPacket | ProducerDiagnostic

DIAGNOSTIC_ARTIFACT_KIND = "producer_diagnostic"
DIAGNOSTIC_SCHEMA_VERSION = 1


def diagnostic_to_dict(
    diagnostic: ProducerDiagnostic, theory_identity: str, realization_identity: str
) -> dict[str, Any]:
    """Serialize a standalone, subject-bound producer-diagnostic packet.

    Unlike `ProducerDiagnostic.to_dict()` (used to embed a diagnostic inside
    a candidate that already carries its own realization ID), this carries
    its own exact subject, so it can be handed to the checker as an input
    independent of the claim that also embeds a copy of it.
    """
    return {
        "artifact_kind": DIAGNOSTIC_ARTIFACT_KIND,
        "schema_version": DIAGNOSTIC_SCHEMA_VERSION,
        "theory_identity": theory_identity,
        "realization_identity": realization_identity,
        "reason_code": diagnostic.reason_code,
        "detail": diagnostic.detail,
    }


def producer_diagnostic_from_dict(
    document: JsonObject, context: str = "producer_diagnostic"
) -> tuple[str, str, ProducerDiagnostic]:
    """Parse a standalone producer-diagnostic packet: `(theory_id, realization_id, diagnostic)`."""
    if document.get("artifact_kind") != DIAGNOSTIC_ARTIFACT_KIND:
        raise DocumentError(f"{context}.artifact_kind must be {DIAGNOSTIC_ARTIFACT_KIND!r}")
    if document.get("schema_version") != DIAGNOSTIC_SCHEMA_VERSION:
        raise DocumentError(f"{context}.schema_version must be {DIAGNOSTIC_SCHEMA_VERSION!r}")
    theory_identity = require_str(
        require_key(document, "theory_identity", context), f"{context}.theory_identity"
    )
    realization_identity = require_str(
        require_key(document, "realization_identity", context), f"{context}.realization_identity"
    )
    reason_code = require_str(
        require_key(document, "reason_code", context), f"{context}.reason_code"
    )
    detail = document.get("detail")
    if detail is not None:
        detail = require_object(detail, f"{context}.detail")
    return theory_identity, realization_identity, ProducerDiagnostic(reason_code, detail)
