"""Shared candidate-eligibility reason codes (design spec 0001/0003).

Plain string constants only, no logic and no imports: the evidence
producer, the production resolver, the serialized resolution claim, and the
independent checker all name the same reason vocabulary without any of them
importing another's decision logic.
"""

from __future__ import annotations

REASON_MISSING_EVIDENCE = "missing_evidence"
REASON_CATEGORY_NOT_ACCEPTED = "evidence_category_not_accepted"
REASON_ASSUMPTIONS_NOT_ALLOWED = "assumptions_not_allowed"
REASON_CONFORMANCE_FAILED = "conformance_failed"
REASON_OBLIGATION_NOT_GOVERNED = "obligation_not_governed"
REASON_AMBIGUOUS = "ambiguous_candidates"
REASON_NO_ELIGIBLE = "no_eligible_candidates"
REASON_THEORY_MISMATCH = "theory_mismatch"
REASON_EVIDENCE_AMBIGUOUS = "ambiguous_evidence"
REASON_EVIDENCE_OBLIGATION_MISMATCH = "evidence_obligation_mismatch"
REASON_OBLIGATION_SET_UNSUPPORTED = "required_obligation_set_unsupported"
REASON_EVIDENCE_STALE = "stale_evidence_recipe"
REASON_OPERATION_UNBOUND = "unbound_operation"
