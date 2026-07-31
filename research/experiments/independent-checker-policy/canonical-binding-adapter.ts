import type { JsonObject, JsonValue, ModelBindingStatus } from "./shared-types.ts";

/**
 * The thin inventory canonical-binding adapter (design spec 0003 slice 7;
 * frozen experiment architecture step 4). Deliberately outside both
 * `production.ts` and `checker.ts`: it does not import either module and
 * does not participate in the symmetric checker/production size
 * measurement (`classifier.ts` never walks its closure). It reads the
 * already-serialized claim JSON directly with its own minimal extraction —
 * reusing neither `production.ts`'s builder-side JSON shaping nor
 * `checker.ts`'s full claim parser, since a real slice-7 adapter has no
 * access to either side's internals, only to the emitted artifact.
 *
 * It reports agreement or disagreement with a separately custodied
 * canonical record only. It never labels a submitted claim "authentic" or
 * "forged" — that is explicitly out of scope (design spec 0003, "Recipe-
 * source custody" / "Canonical project-model binding": "Agreement is not
 * proof that the underlying observation is true, authentic, independently
 * witnessed, signed, or current.").
 */

export interface CanonicalRealizationRecord {
  readonly passedCases: number;
  readonly totalCases: number;
  readonly counterexamples: ReadonlyArray<string>;
}

export interface CanonicalRecord {
  readonly theoryIdentity: string;
  readonly policyId: string;
  readonly selectedRealizationId: string | null;
  readonly realizations: ReadonlyMap<string, CanonicalRealizationRecord>;
}

export interface BindingMismatch {
  readonly subject: string;
  readonly expected: JsonValue;
  readonly actual: JsonValue;
}

export interface BindingReport {
  readonly binding: ModelBindingStatus;
  readonly mismatches: ReadonlyArray<BindingMismatch>;
}

const readObject = (value: JsonValue): JsonObject => value as JsonObject;

const readCandidateEvidenceSummary = (candidate: JsonObject): CanonicalRealizationRecord | null => {
  const evidence = candidate.evidence;
  if (evidence === null || evidence === undefined) return null;
  const evidenceObject = readObject(evidence);
  return {
    passedCases: evidenceObject.passed_cases as number,
    totalCases: evidenceObject.total_cases as number,
    counterexamples: (evidenceObject.counterexamples as ReadonlyArray<JsonValue>).map(
      (item) => readObject(item).case_id as string,
    ),
  };
};

const sameCounterexamples = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length &&
  [...left].sort().every((item, index) => item === [...right].sort()[index]);

/**
 * Compares a submitted `resolution_claim_v1` JSON document against a
 * separately custodied canonical record. Meaningful only once the generic
 * checker has already reported the claim internally consistent (design
 * spec 0003: "The composite checker-and-adapter gate additionally requires
 * the canonical project-model bindings to agree before execution") — this
 * adapter does not itself re-derive that internal consistency.
 */
export const compareToCanonicalRecord = (
  claimDocument: JsonObject,
  record: CanonicalRecord,
): BindingReport => {
  const mismatches: Array<BindingMismatch> = [];
  const theory = readObject(claimDocument.theory);
  if (theory.identity !== record.theoryIdentity) {
    mismatches.push({
      subject: "theory.identity",
      expected: record.theoryIdentity,
      actual: theory.identity,
    });
  }
  const policy = readObject(claimDocument.policy);
  if (policy.id !== record.policyId) {
    mismatches.push({ subject: "policy.id", expected: record.policyId, actual: policy.id });
  }
  const selectedValue = claimDocument.selected;
  const selectedId = selectedValue === null ? null : readObject(selectedValue).id;
  if (selectedId !== record.selectedRealizationId) {
    mismatches.push({
      subject: "selected.id",
      expected: record.selectedRealizationId,
      actual: selectedId,
    });
  }
  const candidates = claimDocument.candidates as ReadonlyArray<JsonValue>;
  for (const candidateValue of candidates) {
    const candidate = readObject(candidateValue);
    const realizationId = readObject(candidate.realization).id as string;
    const canonicalSummary = record.realizations.get(realizationId);
    if (canonicalSummary === undefined) continue;
    const submittedSummary = readCandidateEvidenceSummary(candidate);
    if (submittedSummary === null) {
      mismatches.push({
        subject: `${realizationId}.evidence`,
        expected: "present",
        actual: "absent",
      });
      continue;
    }
    if (
      submittedSummary.passedCases !== canonicalSummary.passedCases ||
      submittedSummary.totalCases !== canonicalSummary.totalCases ||
      !sameCounterexamples(submittedSummary.counterexamples, canonicalSummary.counterexamples)
    ) {
      mismatches.push({
        subject: `${realizationId}.evidence_summary`,
        expected: `${canonicalSummary.passedCases}/${canonicalSummary.totalCases}:${canonicalSummary.counterexamples.join(",")}`,
        actual: `${submittedSummary.passedCases}/${submittedSummary.totalCases}:${submittedSummary.counterexamples.join(",")}`,
      });
    }
  }
  return { binding: mismatches.length === 0 ? "agree" : "disagree", mismatches };
};
