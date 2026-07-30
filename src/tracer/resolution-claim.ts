import { Crypto, Effect } from "effect";
import { contentIdentity } from "./canonical.ts";
import {
  evidenceToJson,
  parseEvidenceResult,
  parseProducerDiagnostic,
  producerDiagnosticToJson,
  requireBoolean,
  requireNonEmptyString,
  type CaseResult,
  type EvidenceResult,
  type ProducerDiagnostic,
} from "./evidence-result.ts";
import {
  DocumentError,
  requireInteger,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  requireStringList,
  type JsonObject,
  type JsonValue,
} from "./json.ts";

/**
 * Neutral `resolution_claim_v1` data contract (design spec 0003 slice 4): a
 * serialized production-resolver claim, its deterministic JSON emitter, and
 * a strict Effect parser. This module holds only plain data shapes and pure
 * serialization/validation helpers over them plus the shared canonical
 * content-identity primitive (`canonical.ts`) and the neutral evidence
 * contract (`evidence-result.ts`) it embeds. It imports neither the
 * production resolver, demo orchestration, evidence producer, operation
 * registry, domain semantics, loader, filesystem, network, nor any runtime
 * entrypoint — `resolver.ts` imports this module and maps its own
 * `Candidate`/`Resolution` shapes into the plain `ResolutionClaimCandidate`
 * input this module defines, never the reverse. See `resolver.ts` for the
 * production mapping and `demo.ts` for where the claim is built and
 * surfaced.
 *
 * `ResolutionClaim` is a validated type, not a plain record: the only two
 * ways to obtain one are `buildResolutionClaim` (from production resolver
 * data) and `parseResolutionClaim` (from untrusted JSON), which both funnel
 * through `finalizeResolutionClaim`. Three separate mechanisms carry that
 * one guarantee, because each closes a route the others cannot:
 *
 *   compile time  module-private brand (RESOLUTION_CLAIM_VALIDATED)
 *                 → a forged literal is not a ResolutionClaim
 *   provenance    module-private WeakSet (VALIDATED_CLAIMS)
 *                 → only minted object identities emit; copies cannot
 *   durability    deep-frozen copies (mintResolutionClaim)
 *                 → a minted claim's contents can never change afterwards
 *
 * Together they make `resolutionClaimToJson`'s output equal to what
 * `finalizeResolutionClaim` validated, for typed and untyped callers alike.
 *
 * This module recomputes only what is available from the claim's own
 * asserted fields (evidence/diagnostic exclusivity, evidence
 * theory/realization/obligation binding, eligible/reason-set agreement,
 * selected-subject and selected-assumption consistency). It does
 * not — and, receiving no authored theory/realization/policy documents,
 * cannot — recompute policy/candidate eligibility, evidence subject truth
 * against authored inputs, or canonical-model agreement; those remain the
 * independent checker's and canonical-model adapter's responsibility in
 * later slices (design spec 0003).
 */

export const ARTIFACT_KIND_RESOLUTION_CLAIM = "resolution_claim";
export const RESOLUTION_CLAIM_SCHEMA_VERSION = 1;

export interface IdentityPair {
  readonly id: string;
  readonly identity: string;
}

export interface ResolutionClaimPolicy {
  readonly id: string;
  readonly contentIdentity: string;
}

/**
 * Both the plain input a caller (`resolver.ts`) supplies for one candidate
 * and the normalized shape this module stores internally: the two never
 * diverge in field shape, only in whether `reasonCodes` has been sorted yet
 * — `finalizeResolutionClaim` is the single place that performs that
 * normalization, so every `ResolutionClaim` this module ever returns
 * (built or parsed) already carries sorted `reasonCodes` and a
 * candidate array sorted by `realizationId`.
 */
export interface ResolutionClaimCandidate {
  readonly realizationId: string;
  readonly realizationIdentity: string;
  readonly targetsTheory: boolean;
  readonly realizationAssumptions: ReadonlyArray<string>;
  readonly evidence: EvidenceResult | null;
  readonly producerDiagnostic: ProducerDiagnostic | null;
  readonly eligible: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
}

/**
 * The compile-time half of the validated-claim boundary: a brand key no code
 * outside this module can name, so a structurally complete object literal is
 * not assignable to `ResolutionClaim` and cannot reach
 * `resolutionClaimToJson`. The supported-API bypass is unrepresentable in the
 * type rather than merely discouraged.
 *
 * Its run-time presence is inert — nothing ever reads it. It must not be the
 * run-time witness, because a property is *copyable*: `{ ...claim, status:
 * "rejected" }` carries every own property of a genuine claim, symbol-keyed
 * ones included, so a property witness would certify a record that never
 * passed `finalizeResolutionClaim`. A symbol key does keep the brand out of
 * `Object.keys`/`JSON.stringify`, so it cannot leak into the artifact.
 */
const RESOLUTION_CLAIM_VALIDATED: unique symbol = Symbol("resolution_claim.validated");

/**
 * The run-time half, and the sole authority the emitter consults: the exact
 * object identities `mintResolutionClaim` produced. Membership is not a
 * property, so unlike a brand field it survives neither spreading,
 * `Object.assign`, `structuredClone`, nor symbol reflection — the only way
 * into this set is to have been minted here.
 *
 * Identity alone would still only witness *past* validity, so every minted
 * claim is also deeply frozen over freshly copied structures (see
 * `mintResolutionClaim`). Identity says "this object was validated"; the
 * freeze says "and its contents are still what was validated". Together the
 * emitter can trust its argument without re-deriving anything.
 */
const VALIDATED_CLAIMS = new WeakSet<object>();

/**
 * Module-private: the claim's field shape without its brand, which exists
 * only so `mintResolutionClaim` can state the fields it is given and TypeScript
 * can add the brand by intersection. It is deliberately not exported —
 * publishing an unbranded structural twin of `ResolutionClaim` would hand
 * callers back exactly the forgeable shape the brand removes.
 */
interface ResolutionClaimFields {
  readonly artifactKind: typeof ARTIFACT_KIND_RESOLUTION_CLAIM;
  readonly schemaVersion: typeof RESOLUTION_CLAIM_SCHEMA_VERSION;
  readonly theory: IdentityPair;
  readonly requiredObligation: string | null;
  readonly policy: ResolutionClaimPolicy;
  readonly candidates: ReadonlyArray<ResolutionClaimCandidate>;
  readonly status: "selected" | "rejected";
  readonly selected: IdentityPair | null;
  readonly selectedAssumptions: ReadonlyArray<string>;
}

/**
 * A resolution claim whose internal coherence has already been checked. Only
 * `mintResolutionClaim` (called solely by `finalizeResolutionClaim`) produces
 * one, so every value of this type has passed every invariant that function
 * enforces, and downstream consumers (`resolver.ts`, `demo.ts`, the emitter)
 * need not re-derive them.
 */
export type ResolutionClaim = ResolutionClaimFields & {
  readonly [RESOLUTION_CLAIM_VALIDATED]: true;
};

/**
 * `Object.freeze` that preserves the argument's exact type. Every shape below
 * is already `readonly` in the type system; this is what makes that promise
 * true at run time as well, for callers the type system does not reach.
 */
const frozen = <T extends object>(value: T): T => {
  Object.freeze(value);
  return value;
};

/**
 * Deep frozen copies of the two arbitrary-depth JSON payloads a claim owns
 * (an evidence result's `producer` and a failing case's `detail`). Both are
 * JSON documents by contract — they have already round-tripped through
 * canonical JSON to produce the evidence identity — so they are acyclic and
 * need no cycle guard.
 */
const frozenJsonObject = (value: JsonObject): JsonObject => {
  const copy: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) copy[key] = frozenJsonValue(item);
  return frozen(copy);
};

const frozenJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return frozen(value.map(frozenJsonValue));
  if (value === null || typeof value !== "object") return value;
  // `Array.isArray` cannot narrow `ReadonlyArray` out of the union, so reuse
  // `json.ts`'s object narrowing rather than restating its cast here. The
  // throw is unreachable: the array and scalar cases are already handled.
  return frozenJsonObject(requireObject(value, "resolution_claim json payload"));
};

const frozenStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => frozen([...values]);

const frozenCaseResult = (result: CaseResult): CaseResult => {
  const copy: CaseResult = result.passed
    ? { caseId: result.caseId, passed: true, detail: null }
    : { caseId: result.caseId, passed: false, detail: frozenJsonObject(result.detail) };
  return frozen(copy);
};

const frozenEvidence = (evidence: EvidenceResult): EvidenceResult =>
  frozen({
    identity: evidence.identity,
    artifactKind: evidence.artifactKind,
    schemaVersion: evidence.schemaVersion,
    category: evidence.category,
    producer: frozenJsonObject(evidence.producer),
    recipeIdentity: evidence.recipeIdentity,
    theoryIdentity: evidence.theoryIdentity,
    realizationIdentity: evidence.realizationIdentity,
    obligation: evidence.obligation,
    assumptions: frozenStrings(evidence.assumptions),
    caseResults: frozen(evidence.caseResults.map(frozenCaseResult)),
  });

const frozenCandidate = (candidate: ResolutionClaimCandidate): ResolutionClaimCandidate =>
  frozen({
    realizationId: candidate.realizationId,
    realizationIdentity: candidate.realizationIdentity,
    targetsTheory: candidate.targetsTheory,
    realizationAssumptions: frozenStrings(candidate.realizationAssumptions),
    evidence: candidate.evidence === null ? null : frozenEvidence(candidate.evidence),
    producerDiagnostic:
      candidate.producerDiagnostic === null
        ? null
        : frozen({
            kind: candidate.producerDiagnostic.kind,
            message: candidate.producerDiagnostic.message,
          }),
    eligible: candidate.eligible,
    reasonCodes: frozenStrings(candidate.reasonCodes),
  });

/**
 * The single mint: turns already-validated fields into the one
 * `ResolutionClaim` value the module hands out. Every nested structure is
 * *copied* before being frozen, so the claim aliases nothing a caller still
 * holds — mutating the resolver's own `Candidate.evidence` or a
 * realization's assumption array afterwards cannot reach into a claim, and
 * freezing a claim cannot reach back out and immobilize caller data.
 *
 * This is also the only writer of `VALIDATED_CLAIMS`, which is what makes
 * that set's membership mean "validated by `finalizeResolutionClaim`".
 */
const mintResolutionClaim = (
  fields: Omit<ResolutionClaimFields, "artifactKind" | "schemaVersion">,
): ResolutionClaim => {
  const claim: ResolutionClaim = {
    [RESOLUTION_CLAIM_VALIDATED]: true,
    artifactKind: ARTIFACT_KIND_RESOLUTION_CLAIM,
    schemaVersion: RESOLUTION_CLAIM_SCHEMA_VERSION,
    theory: frozen({ id: fields.theory.id, identity: fields.theory.identity }),
    requiredObligation: fields.requiredObligation,
    policy: frozen({ id: fields.policy.id, contentIdentity: fields.policy.contentIdentity }),
    candidates: frozen(fields.candidates.map(frozenCandidate)),
    status: fields.status,
    selected:
      fields.selected === null
        ? null
        : frozen({ id: fields.selected.id, identity: fields.selected.identity }),
    selectedAssumptions: frozenStrings(fields.selectedAssumptions),
  };
  VALIDATED_CLAIMS.add(frozen(claim));
  return claim;
};

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedUniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].sort(compareStrings);

const arraysEqual = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const requireNoDuplicates = <T>(
  items: ReadonlyArray<T>,
  key: (item: T) => string,
  context: string,
): void => {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) {
      throw new DocumentError({ message: `${context} contains duplicate '${value}'` });
    }
    seen.add(value);
  }
};

/**
 * Per-candidate invariants that hold regardless of whether the candidate
 * came from `buildResolutionClaim` (trusted resolver data) or
 * `parseResolutionClaim` (untrusted JSON): evidence/diagnostic exclusivity,
 * no duplicate reason codes, and eligible-iff-empty-reason-set agreement.
 * "Neither payload" and "both payloads" are both rejected — the frozen
 * contract requires exactly one of `EvidenceResult` or `ProducerDiagnostic`.
 */
const validateCandidateShape = (candidate: ResolutionClaimCandidate, context: string): void => {
  if (candidate.realizationId.length === 0) {
    throw new DocumentError({ message: `${context}.realization.id must be a nonempty string` });
  }
  if (candidate.realizationIdentity.length === 0) {
    throw new DocumentError({
      message: `${context}.realization.identity must be a nonempty string`,
    });
  }
  const hasEvidence = candidate.evidence !== null;
  const hasDiagnostic = candidate.producerDiagnostic !== null;
  if (hasEvidence && hasDiagnostic) {
    throw new DocumentError({
      message: `${context} carries both an evidence result and a producer diagnostic; exactly one is required`,
    });
  }
  if (!hasEvidence && !hasDiagnostic) {
    throw new DocumentError({
      message: `${context} carries neither an evidence result nor a producer diagnostic; exactly one is required`,
    });
  }
  requireNoDuplicates(candidate.reasonCodes, (code) => code, `${context}.reason_codes`);
  const reasonSetEmpty = candidate.reasonCodes.length === 0;
  if (candidate.eligible !== reasonSetEmpty) {
    throw new DocumentError({
      message: candidate.eligible
        ? `${context} is eligible but carries a nonempty reason set`
        : `${context} is not eligible but carries an empty reason set`,
    });
  }
  if (candidate.eligible && candidate.evidence === null) {
    throw new DocumentError({
      message: `${context} is eligible but carries no evidence result`,
    });
  }
};

/**
 * Assembles and validates the complete claim from already-parsed/-supplied
 * fields, shared by `buildResolutionClaim` (from a production `Resolution`)
 * and `parseResolutionClaim` (from serialized JSON) so the two can never
 * silently drift apart on what makes a claim internally coherent. Performs
 * the presentation-only normalization required by the frozen contract
 * (lexical candidate-ID and reason-code order) and rejects an inconsistent
 * selected binding, a duplicate candidate/reason set, a missing
 * evidence/diagnostic payload, evidence bound to a foreign
 * theory/realization/obligation, or a stale selected-assumption projection.
 *
 * It is also the sole minter of the `RESOLUTION_CLAIM_VALIDATED` witness, so
 * "a `ResolutionClaim` exists" and "these invariants were checked" are the
 * same fact rather than two facts that could drift.
 */
const finalizeResolutionClaim = (
  theory: IdentityPair,
  requiredObligation: string | null,
  policy: ResolutionClaimPolicy,
  rawCandidates: ReadonlyArray<ResolutionClaimCandidate>,
  status: "selected" | "rejected",
  selected: IdentityPair | null,
  selectedAssumptions: ReadonlyArray<string>,
): ResolutionClaim => {
  if (theory.id.length === 0) {
    throw new DocumentError({ message: "resolution_claim.theory.id must be a nonempty string" });
  }
  if (theory.identity.length === 0) {
    throw new DocumentError({
      message: "resolution_claim.theory.identity must be a nonempty string",
    });
  }
  if (requiredObligation !== null && requiredObligation.length === 0) {
    throw new DocumentError({
      message: "resolution_claim.required_obligation must be null or a nonempty string",
    });
  }
  if (policy.id.length === 0) {
    throw new DocumentError({ message: "resolution_claim.policy.id must be a nonempty string" });
  }
  if (policy.contentIdentity.length === 0) {
    throw new DocumentError({
      message: "resolution_claim.policy.content_identity must be a nonempty string",
    });
  }
  if (rawCandidates.length === 0) {
    throw new DocumentError({ message: "resolution_claim.candidates must not be empty" });
  }

  rawCandidates.forEach((candidate, index) =>
    validateCandidateShape(candidate, `resolution_claim.candidates[${index}]`),
  );
  requireNoDuplicates(
    rawCandidates,
    (item) => item.realizationId,
    "resolution_claim.candidates realization ID",
  );
  // Deliberately not a cross-candidate `realizationIdentity` uniqueness
  // check (frozen slice-4 contract, amended and lead-authorized under main
  // plan commit 0559fbc): "Distinct authored candidate IDs may share one
  // content identity and must remain distinct in the claim." Two distinct
  // authored realizations under distinct declared IDs can legitimately
  // share one content identity (`realization.ts`'s `IDENTITY_FIELDS`
  // excludes `id`/`name`), and the existing "multiple eligible
  // realizations reject as ambiguous" tracer test exercises exactly that —
  // two byte-for-byte content twins that must still resolve (and remain
  // representable as a rejected `ambiguous_candidates` claim; see the
  // "repeated-identity ambiguity round-trips" test). Only within the
  // single "selected" winner is identity uniqueness load-bearing, and that
  // is already guaranteed below by the
  // exactly-one-eligible-evidence-bearing-candidate check.
  for (const item of rawCandidates) {
    if (item.evidence !== null && item.evidence.theoryIdentity !== theory.identity) {
      throw new DocumentError({
        message: `resolution_claim candidate '${item.realizationId}' carries evidence bound to a different theory identity than the claim`,
      });
    }
    if (item.evidence !== null && item.evidence.realizationIdentity !== item.realizationIdentity) {
      throw new DocumentError({
        message: `resolution_claim candidate '${item.realizationId}' carries evidence bound to a different realization identity than its own candidate`,
      });
    }
    // The claim's own `required_obligation` is the single obligation the
    // whole claim adjudicates, so evidence for any other obligation is not
    // evidence about this claim at all. `resolver.ts` already refuses to
    // mark such a candidate evidence-bearing (`evaluateCandidate`'s
    // `evidence.obligation !== obligation` gate yields
    // `evidence_obligation_mismatch` with no evidence attached), and
    // `evidence.ts` never emits an `ok: true` outcome for a mismatched
    // suite; this recomputes the same binding from the claim's own asserted
    // fields so a hand-built claim (builder) or a serialized one (parser)
    // cannot smuggle in foreign-obligation evidence that those upstream
    // gates would have rejected. `requiredObligation === null` — a theory
    // that declares no single obligation — therefore admits no
    // evidence-bearing candidate at all, since an `EvidenceResult` always
    // carries a nonempty obligation.
    if (item.evidence !== null && item.evidence.obligation !== requiredObligation) {
      throw new DocumentError({
        message: `resolution_claim candidate '${item.realizationId}' carries evidence for obligation '${item.evidence.obligation}' but the claim requires ${
          requiredObligation === null ? "no single obligation" : `'${requiredObligation}'`
        }`,
      });
    }
  }

  const candidates = rawCandidates
    .map((item) => ({ ...item, reasonCodes: [...item.reasonCodes].sort(compareStrings) }))
    .sort((left, right) => compareStrings(left.realizationId, right.realizationId));

  const eligibleEvidenceBearing = candidates.filter(
    (item) => item.eligible && item.evidence !== null,
  );

  if (status === "selected") {
    if (eligibleEvidenceBearing.length !== 1) {
      throw new DocumentError({
        message: `resolution_claim.status is 'selected' but ${eligibleEvidenceBearing.length} eligible evidence-bearing candidates are present`,
      });
    }
    const winner = eligibleEvidenceBearing[0]!;
    if (selected === null) {
      throw new DocumentError({
        message: "resolution_claim.selected must not be null when status is 'selected'",
      });
    }
    if (selected.id !== winner.realizationId || selected.identity !== winner.realizationIdentity) {
      throw new DocumentError({
        message:
          "resolution_claim.selected does not match the unique eligible evidence-bearing candidate",
      });
    }
    const recomputed = sortedUniqueStrings([
      ...winner.realizationAssumptions,
      ...winner.evidence!.assumptions,
    ]);
    if (!arraysEqual(recomputed, selectedAssumptions)) {
      throw new DocumentError({
        message:
          "resolution_claim.selected_assumptions is stale: it does not match the recomputed projection",
      });
    }
    return mintResolutionClaim({
      theory,
      requiredObligation,
      policy,
      candidates,
      status,
      selected,
      selectedAssumptions: recomputed,
    });
  }

  if (eligibleEvidenceBearing.length === 1) {
    throw new DocumentError({
      message:
        "resolution_claim.status is 'rejected' but exactly one eligible evidence-bearing candidate is present",
    });
  }
  if (selected !== null) {
    throw new DocumentError({
      message: "resolution_claim.selected must be null when status is 'rejected'",
    });
  }
  if (selectedAssumptions.length !== 0) {
    throw new DocumentError({
      message: "resolution_claim.selected_assumptions must be empty when status is 'rejected'",
    });
  }
  return mintResolutionClaim({
    theory,
    requiredObligation,
    policy,
    candidates,
    status,
    selected: null,
    selectedAssumptions: [],
  });
};

/**
 * Module-private: the only supported emitter entry point is
 * `resolutionClaimToJson`, which takes a whole validated claim. Exporting a
 * per-candidate emitter would reopen exactly the bypass the
 * `RESOLUTION_CLAIM_VALIDATED` witness closes, since
 * `ResolutionClaimCandidate` is (and must stay) a plain structural builder
 * input.
 */
const resolutionClaimCandidateToJson = (candidate: ResolutionClaimCandidate): JsonObject => ({
  realization: { id: candidate.realizationId, identity: candidate.realizationIdentity },
  targets_theory: candidate.targetsTheory,
  realization_assumptions: candidate.realizationAssumptions,
  evidence: candidate.evidence === null ? null : evidenceToJson(candidate.evidence),
  producer_diagnostic:
    candidate.producerDiagnostic === null
      ? null
      : producerDiagnosticToJson(candidate.producerDiagnostic),
  eligible: candidate.eligible,
  reason_codes: candidate.reasonCodes,
});

/**
 * `parseResolutionClaim`'s complete emitted key set (top-level and every
 * owned nested envelope). A closed boundary: any key outside these sets is
 * rejected rather than silently discarded.
 */
const RESOLUTION_CLAIM_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "artifact_kind",
  "schema_version",
  "theory",
  "required_obligation",
  "policy",
  "candidates",
  "status",
  "selected",
  "selected_assumptions",
]);
const IDENTITY_PAIR_ALLOWED_KEYS: ReadonlySet<string> = new Set(["id", "identity"]);
const POLICY_SUBJECT_ALLOWED_KEYS: ReadonlySet<string> = new Set(["id", "content_identity"]);
const CANDIDATE_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "realization",
  "targets_theory",
  "realization_assumptions",
  "evidence",
  "producer_diagnostic",
  "eligible",
  "reason_codes",
]);

/**
 * Emits the serialized `resolution_claim_v1` artifact. It re-derives nothing
 * and does not need to: what it is handed was validated by
 * `finalizeResolutionClaim` (provenance, checked below) and has been
 * immutable ever since (the deep freeze in `mintResolutionClaim`), so
 * "emitted" and "validated and canonically ordered" are the same content.
 *
 * The guard covers the residue no TypeScript type can express — an untyped
 * caller, an `as` cast, or a spread/`Object.assign` copy of a genuine claim.
 * None of those object identities were minted here, so each becomes a loud
 * `DocumentError` instead of a silently emitted unvalidated artifact.
 */
export const resolutionClaimToJson = (claim: ResolutionClaim): JsonObject => {
  if (!VALIDATED_CLAIMS.has(claim)) {
    throw new DocumentError({
      message:
        "resolution_claim was not produced by buildResolutionClaim or parseResolutionClaim; refusing to emit an unvalidated claim",
    });
  }
  return {
    artifact_kind: claim.artifactKind,
    schema_version: claim.schemaVersion,
    theory: { id: claim.theory.id, identity: claim.theory.identity },
    required_obligation: claim.requiredObligation,
    policy: { id: claim.policy.id, content_identity: claim.policy.contentIdentity },
    candidates: claim.candidates.map(resolutionClaimCandidateToJson),
    status: claim.status,
    selected:
      claim.selected === null ? null : { id: claim.selected.id, identity: claim.selected.identity },
    selected_assumptions: claim.selectedAssumptions,
  };
};

const toBuildError = (cause: unknown): DocumentError =>
  cause instanceof DocumentError
    ? cause
    : new DocumentError({ message: "cannot build resolution claim", cause });

const toParseError = (cause: unknown): DocumentError =>
  cause instanceof DocumentError
    ? cause
    : new DocumentError({ message: "cannot parse resolution claim", cause });

/**
 * The plain, structurally-typed input `resolver.ts` supplies for one
 * candidate — deliberately the same shape as the stored
 * `ResolutionClaimCandidate` (only sortedness of `reasonCodes` may differ),
 * so the caller never needs a second parallel type.
 */
export interface ResolutionClaimBuildInput {
  readonly theoryId: string;
  readonly theoryIdentity: string;
  readonly requiredObligation: string | null;
  readonly policy: JsonObject;
  readonly candidates: ReadonlyArray<ResolutionClaimCandidate>;
  readonly status: "selected" | "rejected";
  readonly selectedRealizationId: string | null;
}

/**
 * Builds a `ResolutionClaim` from a production resolver's own already-typed
 * candidate data plus the raw policy document it resolved against. Computes
 * the policy's exact content identity (a SHA-256 canonical-JSON hash over
 * the complete policy document, adapting the field mapping evaluated at
 * `a373ae9:src/tracer/resolver.ts`'s rejected `buildResolutionClaim` — see
 * `resolver.ts` for the full provenance note) and the selected candidate's
 * assumption projection, then funnels everything through
 * `finalizeResolutionClaim` so a caller can never construct an internally
 * inconsistent claim (an unbound `selectedRealizationId`, a duplicate
 * candidate/reason set, or a missing evidence/diagnostic payload all fail
 * this Effect instead of producing a claim).
 */
export const buildResolutionClaim = (
  input: ResolutionClaimBuildInput,
): Effect.Effect<ResolutionClaim, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const policyId = yield* Effect.try({
      try: () => requireNonEmptyString(requireKey(input.policy, "id", "policy"), "policy.id"),
      catch: toBuildError,
    });
    const policyContentIdentity = yield* contentIdentity(input.policy);
    return yield* Effect.try({
      try: () => {
        const selectedCandidate =
          input.selectedRealizationId === null
            ? null
            : (input.candidates.find(
                (item) => item.realizationId === input.selectedRealizationId,
              ) ?? null);
        if (input.selectedRealizationId !== null && selectedCandidate === null) {
          throw new DocumentError({
            message: `resolution_claim selected realization '${input.selectedRealizationId}' is absent from candidates`,
          });
        }
        const selected: IdentityPair | null =
          selectedCandidate === null
            ? null
            : {
                id: selectedCandidate.realizationId,
                identity: selectedCandidate.realizationIdentity,
              };
        const selectedAssumptions =
          selectedCandidate === null
            ? []
            : sortedUniqueStrings([
                ...selectedCandidate.realizationAssumptions,
                ...(selectedCandidate.evidence?.assumptions ?? []),
              ]);
        return finalizeResolutionClaim(
          { id: input.theoryId, identity: input.theoryIdentity },
          input.requiredObligation,
          { id: policyId, contentIdentity: policyContentIdentity },
          input.candidates,
          input.status,
          selected,
          selectedAssumptions,
        );
      },
      catch: toBuildError,
    });
  });

const parseIdentityPair = (value: JsonValue, context: string): IdentityPair => {
  const object = requireObject(value, context);
  for (const key of Object.keys(object)) {
    if (!IDENTITY_PAIR_ALLOWED_KEYS.has(key)) {
      throw new DocumentError({ message: `${context} contains an unknown key '${key}'` });
    }
  }
  return {
    id: requireNonEmptyString(requireKey(object, "id", context), `${context}.id`),
    identity: requireNonEmptyString(requireKey(object, "identity", context), `${context}.identity`),
  };
};

const parsePolicySubject = (value: JsonValue, context: string): ResolutionClaimPolicy => {
  const object = requireObject(value, context);
  for (const key of Object.keys(object)) {
    if (!POLICY_SUBJECT_ALLOWED_KEYS.has(key)) {
      throw new DocumentError({ message: `${context} contains an unknown key '${key}'` });
    }
  }
  return {
    id: requireNonEmptyString(requireKey(object, "id", context), `${context}.id`),
    contentIdentity: requireNonEmptyString(
      requireKey(object, "content_identity", context),
      `${context}.content_identity`,
    ),
  };
};

interface ParsedCandidateShell {
  readonly withoutEvidence: Omit<ResolutionClaimCandidate, "evidence">;
  readonly rawEvidence: JsonObject | null;
}

const parseCandidateShell = (raw: JsonObject, context: string): ParsedCandidateShell => {
  for (const key of Object.keys(raw)) {
    if (!CANDIDATE_ALLOWED_KEYS.has(key)) {
      throw new DocumentError({ message: `${context} contains an unknown key '${key}'` });
    }
  }
  const realization = parseIdentityPair(
    requireKey(raw, "realization", context),
    `${context}.realization`,
  );
  const targetsTheory = requireBoolean(
    requireKey(raw, "targets_theory", context),
    `${context}.targets_theory`,
  );
  const realizationAssumptions = requireStringList(
    requireKey(raw, "realization_assumptions", context),
    `${context}.realization_assumptions`,
  );
  const rawEvidenceValue = requireKey(raw, "evidence", context);
  const rawEvidence =
    rawEvidenceValue === null ? null : requireObject(rawEvidenceValue, `${context}.evidence`);
  const rawDiagnosticValue = requireKey(raw, "producer_diagnostic", context);
  const producerDiagnostic =
    rawDiagnosticValue === null
      ? null
      : parseProducerDiagnostic(rawDiagnosticValue, `${context}.producer_diagnostic`);
  const eligible = requireBoolean(requireKey(raw, "eligible", context), `${context}.eligible`);
  const reasonCodes = requireStringList(
    requireKey(raw, "reason_codes", context),
    `${context}.reason_codes`,
  );
  return {
    withoutEvidence: {
      realizationId: realization.id,
      realizationIdentity: realization.identity,
      targetsTheory,
      realizationAssumptions,
      producerDiagnostic,
      eligible,
      reasonCodes,
    },
    rawEvidence,
  };
};

interface ParsedClaimShell {
  readonly theory: IdentityPair;
  readonly requiredObligation: string | null;
  readonly policy: ResolutionClaimPolicy;
  readonly rawCandidates: ReadonlyArray<JsonObject>;
  readonly status: "selected" | "rejected";
  readonly selected: IdentityPair | null;
  readonly selectedAssumptions: ReadonlyArray<string>;
}

const parseResolutionClaimShell = (document: JsonObject): ParsedClaimShell => {
  const artifactKind = requireString(
    requireKey(document, "artifact_kind", "resolution_claim"),
    "resolution_claim.artifact_kind",
  );
  if (artifactKind !== ARTIFACT_KIND_RESOLUTION_CLAIM) {
    throw new DocumentError({
      message: `resolution-claim parser requires artifact_kind '${ARTIFACT_KIND_RESOLUTION_CLAIM}', got '${artifactKind}'`,
    });
  }
  for (const key of Object.keys(document)) {
    if (!RESOLUTION_CLAIM_ALLOWED_KEYS.has(key)) {
      throw new DocumentError({
        message: `resolution_claim contains an unknown top-level key '${key}'`,
      });
    }
  }
  const schemaVersion = requireInteger(
    requireKey(document, "schema_version", "resolution_claim"),
    "resolution_claim.schema_version",
  );
  if (schemaVersion !== RESOLUTION_CLAIM_SCHEMA_VERSION) {
    throw new DocumentError({
      message: `resolution-claim parser requires schema_version ${RESOLUTION_CLAIM_SCHEMA_VERSION}, got ${JSON.stringify(schemaVersion)}`,
    });
  }
  const theory = parseIdentityPair(
    requireKey(document, "theory", "resolution_claim"),
    "resolution_claim.theory",
  );
  const rawObligation = requireKey(document, "required_obligation", "resolution_claim");
  const requiredObligation =
    rawObligation === null
      ? null
      : requireNonEmptyString(rawObligation, "resolution_claim.required_obligation");
  const policy = parsePolicySubject(
    requireKey(document, "policy", "resolution_claim"),
    "resolution_claim.policy",
  );
  const rawCandidates = requireObjectList(
    requireKey(document, "candidates", "resolution_claim"),
    "resolution_claim.candidates",
  );
  const status = requireString(
    requireKey(document, "status", "resolution_claim"),
    "resolution_claim.status",
  );
  if (status !== "selected" && status !== "rejected") {
    throw new DocumentError({
      message: `resolution_claim.status must be 'selected' or 'rejected', got '${status}'`,
    });
  }
  const rawSelected = requireKey(document, "selected", "resolution_claim");
  const selected =
    rawSelected === null ? null : parseIdentityPair(rawSelected, "resolution_claim.selected");
  const selectedAssumptions = requireStringList(
    requireKey(document, "selected_assumptions", "resolution_claim"),
    "resolution_claim.selected_assumptions",
  );
  return {
    theory,
    requiredObligation,
    policy,
    rawCandidates,
    status,
    selected,
    selectedAssumptions,
  };
};

/**
 * Parses and validates a serialized `resolution_claim_v1` artifact (the
 * output shape of `resolutionClaimToJson`). Every embedded evidence result
 * is independently revalidated through `parseEvidenceResult` — never
 * trusted as structurally-typed input — and every claim-level invariant
 * (evidence/diagnostic exclusivity, candidate uniqueness by ID, evidence
 * theory/realization/obligation binding, eligible/reason-set agreement,
 * status/selected consistency, and the selected-assumption projection) is
 * recomputed and compared against what is stored via the same
 * `finalizeResolutionClaim` the builder uses. Cross-candidate
 * `realization.identity` uniqueness is deliberately *not* required; see the
 * note in `finalizeResolutionClaim`.
 * It does not verify the claim against authored theory/realization/policy
 * documents; that external coverage is the later independent checker's
 * responsibility (design spec 0003).
 */
export const parseResolutionClaim = (
  document: JsonObject,
): Effect.Effect<ResolutionClaim, DocumentError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const shell = yield* Effect.try({
      try: () => parseResolutionClaimShell(document),
      catch: toParseError,
    });
    const candidates: Array<ResolutionClaimCandidate> = [];
    for (let index = 0; index < shell.rawCandidates.length; index++) {
      const context = `resolution_claim.candidates[${index}]`;
      const parsedShell = yield* Effect.try({
        try: () => parseCandidateShell(shell.rawCandidates[index]!, context),
        catch: toParseError,
      });
      let evidence: EvidenceResult | null = null;
      if (parsedShell.rawEvidence !== null) {
        evidence = yield* parseEvidenceResult(parsedShell.rawEvidence);
      }
      candidates.push({ ...parsedShell.withoutEvidence, evidence });
    }
    return yield* Effect.try({
      try: () =>
        finalizeResolutionClaim(
          shell.theory,
          shell.requiredObligation,
          shell.policy,
          candidates,
          shell.status,
          shell.selected,
          shell.selectedAssumptions,
        ),
      catch: toParseError,
    });
  });
