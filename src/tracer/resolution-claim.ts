import { Crypto, Effect } from "effect";
import { contentIdentity } from "./canonical.ts";
import {
  evidenceToJson,
  parseEvidenceResult,
  parseProducerDiagnostic,
  producerDiagnosticToJson,
  requireBoolean,
  requireNonEmptyString,
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
 * This module recomputes only what is available from the claim's own
 * asserted fields (evidence/diagnostic exclusivity, eligible/reason-set
 * agreement, selected-subject and selected-assumption consistency). It does
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

export interface ResolutionClaim {
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
 * evidence/diagnostic payload, or a stale selected-assumption projection.
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
  }

  const candidates = rawCandidates
    .map((item) => ({ ...item, reasonCodes: [...item.reasonCodes].sort(compareStrings) }))
    .sort((left, right) => compareStrings(left.realizationId, right.realizationId));

  const eligibleEvidenceBearing = candidates.filter((item) => item.eligible && item.evidence !== null);

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
        message: "resolution_claim.selected does not match the unique eligible evidence-bearing candidate",
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
    return {
      artifactKind: ARTIFACT_KIND_RESOLUTION_CLAIM,
      schemaVersion: RESOLUTION_CLAIM_SCHEMA_VERSION,
      theory,
      requiredObligation,
      policy,
      candidates,
      status,
      selected,
      selectedAssumptions: recomputed,
    };
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
  return {
    artifactKind: ARTIFACT_KIND_RESOLUTION_CLAIM,
    schemaVersion: RESOLUTION_CLAIM_SCHEMA_VERSION,
    theory,
    requiredObligation,
    policy,
    candidates,
    status,
    selected: null,
    selectedAssumptions: [],
  };
};

export const resolutionClaimCandidateToJson = (candidate: ResolutionClaimCandidate): JsonObject => ({
  realization: { id: candidate.realizationId, identity: candidate.realizationIdentity },
  targets_theory: candidate.targetsTheory,
  realization_assumptions: candidate.realizationAssumptions,
  evidence: candidate.evidence === null ? null : evidenceToJson(candidate.evidence),
  producer_diagnostic:
    candidate.producerDiagnostic === null ? null : producerDiagnosticToJson(candidate.producerDiagnostic),
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

export const resolutionClaimToJson = (claim: ResolutionClaim): JsonObject => ({
  artifact_kind: claim.artifactKind,
  schema_version: claim.schemaVersion,
  theory: { id: claim.theory.id, identity: claim.theory.identity },
  required_obligation: claim.requiredObligation,
  policy: { id: claim.policy.id, content_identity: claim.policy.contentIdentity },
  candidates: claim.candidates.map(resolutionClaimCandidateToJson),
  status: claim.status,
  selected: claim.selected === null ? null : { id: claim.selected.id, identity: claim.selected.identity },
  selected_assumptions: claim.selectedAssumptions,
});

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
            : (input.candidates.find((item) => item.realizationId === input.selectedRealizationId) ??
              null);
        if (input.selectedRealizationId !== null && selectedCandidate === null) {
          throw new DocumentError({
            message: `resolution_claim selected realization '${input.selectedRealizationId}' is absent from candidates`,
          });
        }
        const selected: IdentityPair | null =
          selectedCandidate === null
            ? null
            : { id: selectedCandidate.realizationId, identity: selectedCandidate.realizationIdentity };
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
  const rawEvidence = rawEvidenceValue === null ? null : requireObject(rawEvidenceValue, `${context}.evidence`);
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
  return { theory, requiredObligation, policy, rawCandidates, status, selected, selectedAssumptions };
};

/**
 * Parses and validates a serialized `resolution_claim_v1` artifact (the
 * output shape of `resolutionClaimToJson`). Every embedded evidence result
 * is independently revalidated through `parseEvidenceResult` — never
 * trusted as structurally-typed input — and every claim-level invariant
 * (evidence/diagnostic exclusivity, candidate uniqueness by ID and
 * identity, eligible/reason-set agreement, status/selected consistency, and
 * the selected-assumption projection) is recomputed and compared against
 * what is stored via the same `finalizeResolutionClaim` the builder uses.
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
