"""Small independent checker for ``resolution_claim_v1``.

The checker reconstructs the complete claim from authored documents and
lossless producer packets.  It shares canonical identity and packet parsers,
which is an explicit correlated-TCB assumption, but imports no resolver,
producer, operation registry, domain semantics, or execution code.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from semantic_tracer.canonical import content_identity
from semantic_tracer.jsonutil import DocumentError, require_key, require_str
from semantic_tracer.packets import (
    DIAGNOSTIC_ARTIFACT_KIND,
    EVIDENCE_RESULT_ARTIFACT_KIND,
    EvidenceResultPacket,
    ProducerDiagnostic,
    evidence_result_from_dict,
    producer_diagnostic_from_dict,
)
from semantic_tracer.realization import Realization, normalize_realization
from semantic_tracer.reasons import (
    REASON_ASSUMPTIONS_NOT_ALLOWED,
    REASON_CATEGORY_NOT_ACCEPTED,
    REASON_CONFORMANCE_FAILED,
    REASON_MISSING_EVIDENCE,
    REASON_OBLIGATION_NOT_GOVERNED,
    REASON_OBLIGATION_SET_UNSUPPORTED,
    REASON_THEORY_MISMATCH,
)
from semantic_tracer.theory import normalize_theory, required_obligation_id
from semantic_tracer.types import JsonObject, JsonValue

V_MALFORMED_CLAIM = "malformed_claim"
V_FIELD_MISMATCH = "claim_field_mismatch"
V_CANDIDATE_MISSING = "candidate_missing"
V_CANDIDATE_DUPLICATE = "candidate_duplicate"
V_CANDIDATE_UNKNOWN = "candidate_unknown"
V_PRODUCER_OUTCOME_MALFORMED = "producer_outcome_malformed"
V_PRODUCER_OUTCOME_MULTIPLE = "multiple_producer_outcomes_for_subject"


@dataclass(frozen=True, slots=True)
class Violation:
    code: str
    subject: str
    detail: JsonObject

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "subject": self.subject, "detail": self.detail}


@dataclass(frozen=True, slots=True)
class CheckerReport:
    valid: bool
    violations: tuple[Violation, ...]
    recomputed_status: str | None
    recomputed_selected: JsonObject | None
    recomputed_selected_assumptions: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "violations": [item.to_dict() for item in self.violations],
            "recomputed_status": self.recomputed_status,
            "recomputed_selected": self.recomputed_selected,
            "recomputed_selected_assumptions": list(self.recomputed_selected_assumptions),
        }


def _malformed(detail: str) -> CheckerReport:
    violation = Violation(V_MALFORMED_CLAIM, "claim", {"error": detail})
    return CheckerReport(False, (violation,), None, None, ())


def _diff(subject: str, actual: JsonValue, expected: JsonValue, out: list[Violation]) -> None:
    if isinstance(actual, dict) and isinstance(expected, dict):
        for key in sorted(set(actual) | set(expected)):
            if key != "candidates":
                _diff(f"{subject}.{key}", actual.get(key), expected.get(key), out)
        return
    if isinstance(actual, list) and isinstance(expected, list):
        if len(actual) != len(expected):
            out.append(
                Violation(
                    V_FIELD_MISMATCH,
                    subject,
                    {"claimed_len": len(actual), "recomputed_len": len(expected)},
                )
            )
        for index, pair in enumerate(zip(actual, expected, strict=False)):
            _diff(f"{subject}[{index}]", pair[0], pair[1], out)
        return
    if actual != expected:
        out.append(
            Violation(V_FIELD_MISMATCH, subject, {"claimed": actual, "recomputed": expected})
        )


def _policy_reasons(
    packet: EvidenceResultPacket, assumptions: tuple[str, ...], policy: JsonObject
) -> list[str]:
    requirements = policy.get("requirements")
    rule = requirements.get(packet.obligation) if isinstance(requirements, dict) else None
    governed = isinstance(rule, dict)
    accepted = governed and packet.category in rule.get("accepted_categories", [])
    permits_assumptions = governed and rule.get("allow_assumptions") is True
    return [
        code
        for failed, code in (
            (not governed, REASON_OBLIGATION_NOT_GOVERNED),
            (governed and not accepted, REASON_CATEGORY_NOT_ACCEPTED),
            (
                governed
                and (bool(packet.assumptions) or bool(assumptions))
                and not permits_assumptions,
                REASON_ASSUMPTIONS_NOT_ALLOWED,
            ),
            (not packet.passed, REASON_CONFORMANCE_FAILED),
        )
        if failed
    ]


def _expected_candidate(
    realization: Realization,
    theory_identity: str,
    obligation: str | None,
    evidence: dict[tuple[str, str, str], list[EvidenceResultPacket]],
    diagnostics: dict[tuple[str, str], list[ProducerDiagnostic]],
    policy: JsonObject,
) -> tuple[JsonObject, bool]:
    packet: EvidenceResultPacket | None = None
    diagnostic: ProducerDiagnostic | None = None
    if not realization.targets_theory:
        reasons = [REASON_THEORY_MISMATCH]
    elif obligation is None:
        reasons = [REASON_OBLIGATION_SET_UNSUPPORTED]
    else:
        matches = evidence.get((theory_identity, realization.identity, obligation), [])
        if len(matches) == 1:
            packet = matches[0]
            reasons = _policy_reasons(packet, realization.assumptions, policy)
        else:
            found = diagnostics.get((theory_identity, realization.identity), [])
            diagnostic = found[0] if len(found) == 1 else None
            reasons = [diagnostic.reason_code if diagnostic else REASON_MISSING_EVIDENCE]
    result = cast(
        JsonObject,
        {
            "realization_id": realization.realization_id,
            "realization_identity": realization.identity,
            "targets_theory": realization.targets_theory,
            "realization_assumptions": list(realization.assumptions),
            "evidence": packet.to_dict() if packet else None,
            "producer_diagnostic": diagnostic.to_dict() if diagnostic else None,
            "eligible": not reasons,
            "reason_codes": reasons,
        },
    )
    return result, not reasons


def check_resolution(
    theory_document: JsonObject,
    realization_documents: list[JsonObject],
    policy_document: JsonObject,
    producer_outcomes: list[JsonValue],
    claim: JsonValue,
) -> CheckerReport:
    try:
        theory_id = require_str(require_key(theory_document, "id", "theory"), "theory.id")
        policy_id = require_str(require_key(policy_document, "id", "policy"), "policy.id")
        theory = normalize_theory(theory_document)
        realizations = [
            normalize_realization(item, theory, theory_id) for item in realization_documents
        ]
    except DocumentError as error:
        return _malformed(str(error))
    if not isinstance(claim, dict) or not isinstance(claim.get("candidates"), list):
        return _malformed("claim and claim.candidates must be objects and a list")

    violations: list[Violation] = []
    by_id: dict[str, Realization] = {}
    for realization in realizations:
        if realization.realization_id in by_id:
            violations.append(
                Violation(V_CANDIDATE_DUPLICATE, realization.realization_id, {"source": "authored"})
            )
        by_id[realization.realization_id] = realization

    evidence: dict[tuple[str, str, str], list[EvidenceResultPacket]] = {}
    diagnostics: dict[tuple[str, str], list[ProducerDiagnostic]] = {}
    for index, raw in enumerate(producer_outcomes):
        subject = f"producer_outcomes[{index}]"
        try:
            if not isinstance(raw, dict):
                raise DocumentError("not an object")
            if raw.get("artifact_kind") == EVIDENCE_RESULT_ARTIFACT_KIND:
                packet = evidence_result_from_dict(raw, subject)
                evidence.setdefault(
                    (packet.theory_identity, packet.realization_identity, packet.obligation), []
                ).append(packet)
            elif raw.get("artifact_kind") == DIAGNOSTIC_ARTIFACT_KIND:
                theory_identity, realization_identity, diagnostic = producer_diagnostic_from_dict(
                    raw, subject
                )
                diagnostics.setdefault((theory_identity, realization_identity), []).append(
                    diagnostic
                )
            else:
                raise DocumentError(f"unknown artifact_kind {raw.get('artifact_kind')!r}")
        except DocumentError as error:
            violations.append(
                Violation(V_PRODUCER_OUTCOME_MALFORMED, subject, {"error": str(error)})
            )
    for packet_index in (evidence, diagnostics):
        violations.extend(
            Violation(V_PRODUCER_OUTCOME_MULTIPLE, key[1], {"count": len(items)})
            for key, items in packet_index.items()
            if len(items) > 1
        )

    claimed: dict[str, JsonObject] = {}
    for index, raw in enumerate(cast(list[JsonValue], claim["candidates"])):
        realization_id = raw.get("realization_id") if isinstance(raw, dict) else None
        if isinstance(realization_id, str) and realization_id not in claimed:
            claimed[realization_id] = cast(JsonObject, raw)
        else:
            violations.append(
                Violation(V_CANDIDATE_DUPLICATE, str(realization_id), {"index": index})
            )

    obligation = required_obligation_id(theory)
    eligible: list[str] = []
    for realization_id, actual in claimed.items():
        realization = by_id.get(realization_id)
        if realization is None:
            violations.append(Violation(V_CANDIDATE_UNKNOWN, realization_id, {}))
            continue
        expected, is_eligible = _expected_candidate(
            realization, theory.identity, obligation, evidence, diagnostics, policy_document
        )
        _diff(f"candidates[{realization_id}]", actual, expected, violations)
        if is_eligible:
            eligible.append(realization_id)
    violations.extend(
        Violation(V_CANDIDATE_MISSING, realization_id, {})
        for realization_id in by_id
        if realization_id not in claimed
    )

    selected: JsonObject | None = None
    assumptions: tuple[str, ...] = ()
    if len(eligible) == 1:
        picked = by_id[eligible[0]]
        selected = {"id": picked.realization_id, "identity": picked.identity}
        values = list(picked.assumptions)
        packets = evidence.get((theory.identity, picked.identity, obligation or ""), [])
        if len(packets) == 1:
            values.extend(packets[0].assumptions)
        assumptions = tuple(dict.fromkeys(values))
    status = "selected" if selected else "rejected"
    expected_claim: JsonObject = {
        "artifact_kind": "resolution_claim",
        "schema_version": 1,
        "theory": {"id": theory_id, "identity": theory.identity},
        "required_obligation": obligation,
        "policy": {"id": policy_id, "content_identity": content_identity(policy_document)},
        "status": status,
        "selected": selected,
        "selected_assumptions": list(assumptions),
    }
    _diff("claim", {key: claim.get(key) for key in expected_claim}, expected_claim, violations)
    return CheckerReport(not violations, tuple(violations), status, selected, assumptions)
