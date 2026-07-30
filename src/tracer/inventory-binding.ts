import { Effect, FileSystem, Path, Schema } from "effect";
import {
  DocumentError,
  requireKey,
  requireObject,
  requireObjectList,
  requireString,
  requireStringList,
  type JsonObject,
} from "./json.ts";

export interface ModelBindingViolation {
  readonly code: string;
  readonly subject: string;
  readonly details: JsonObject;
}

export interface ModelBindingReport {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<ModelBindingViolation>;
}

export const modelBindingReportToJson = (report: ModelBindingReport): JsonObject => ({
  valid: report.valid,
  violations: report.violations.map((violation) => ({
    code: violation.code,
    subject: violation.subject,
    details: violation.details,
  })),
});

const readDocument = (
  path: string,
): Effect.Effect<JsonObject, DocumentError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(path)
      .pipe(
        Effect.mapError(
          (cause) => new DocumentError({ message: `cannot read model document ${path}`, cause }),
        ),
      );
    const value = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
      Effect.mapError(
        (cause) => new DocumentError({ message: `invalid JSON in model document ${path}`, cause }),
      ),
    );
    return yield* Effect.try({
      try: () => requireObject(value as never, path),
      catch: (cause) =>
        cause instanceof DocumentError
          ? cause
          : new DocumentError({ message: `invalid model document ${path}`, cause }),
    });
  });

const entity = (document: JsonObject, id: string): JsonObject | null =>
  requireObjectList(requireKey(document, "entities", "model"), "model.entities").find(
    (item) => item.id === id,
  ) ?? null;

const attributes = (document: JsonObject, id: string): JsonObject | null => {
  const found = entity(document, id);
  return found === null
    ? null
    : requireObject(requireKey(found, "attributes", `entity ${id}`), `entity ${id}.attributes`);
};

const checkField = (
  violations: Array<ModelBindingViolation>,
  code: string,
  subject: string,
  observed: unknown,
  expected: unknown,
): void => {
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    violations.push({
      code,
      subject,
      details: {
        observed: observed === undefined ? "<missing>" : (observed as never),
        expected: expected === undefined ? "<missing>" : (expected as never),
      },
    });
  }
};

export const checkInventoryModelBinding = (
  modelRoot: string,
  claim: JsonObject,
): Effect.Effect<ModelBindingReport, DocumentError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const [semantic, components, architecture, evidenceModel, execution] = yield* Effect.all([
      readDocument(path.join(modelRoot, "semantic", "inventory-tracer.json")),
      readDocument(path.join(modelRoot, "architecture", "components.json")),
      readDocument(path.join(modelRoot, "architecture", "inventory-tracer.json")),
      readDocument(path.join(modelRoot, "evidence", "inventory-tracer.json")),
      readDocument(path.join(modelRoot, "execution", "inventory-tracer.json")),
    ]);
    const violations: Array<ModelBindingViolation> = [];
    const theory = requireObject(requireKey(claim, "theory", "claim"), "claim.theory");
    const theoryIdentity = requireString(
      requireKey(theory, "identity", "claim.theory"),
      "claim.theory.identity",
    );
    checkField(
      violations,
      "theory_identity_drift",
      "theory.inventory",
      attributes(semantic, "theory.inventory")?.identity,
      theoryIdentity,
    );
    checkField(
      violations,
      "recipe_theory_identity_drift",
      "artifact.inventory.conformance-recipe-v0",
      attributes(evidenceModel, "artifact.inventory.conformance-recipe-v0")?.theory_identity,
      theoryIdentity,
    );

    const candidates = requireObjectList(
      requireKey(claim, "candidates", "claim"),
      "claim.candidates",
    );
    for (const candidate of candidates) {
      const id = requireString(
        requireKey(candidate, "realization_id", "claim candidate"),
        "claim candidate.realization_id",
      );
      const identity = requireString(
        requireKey(candidate, "realization_identity", "claim candidate"),
        "claim candidate.realization_identity",
      );
      const suffix = id === "realization.inventory.pure" ? "pure" : "broken";
      const realizationModel = suffix === "pure" ? components : architecture;
      checkField(
        violations,
        "realization_identity_drift",
        id,
        attributes(realizationModel, id)?.identity,
        identity,
      );
      const evidence = candidate.evidence;
      if (evidence !== null && evidence !== undefined) {
        const packet = requireObject(evidence, `${id}.evidence`);
        const evidenceId = `evidence.inventory.${suffix}-conformance-v0`;
        const model = attributes(evidenceModel, evidenceId);
        checkField(
          violations,
          "evidence_identity_drift",
          evidenceId,
          model?.identity,
          packet.identity,
        );
        checkField(
          violations,
          "evidence_recipe_identity_drift",
          evidenceId,
          model?.recipe_identity,
          packet.recipe_identity,
        );
        checkField(
          violations,
          "recipe_identity_drift",
          "artifact.inventory.conformance-recipe-v0",
          attributes(evidenceModel, "artifact.inventory.conformance-recipe-v0")?.identity,
          packet.recipe_identity,
        );
        checkField(
          violations,
          "evidence_theory_identity_drift",
          evidenceId,
          model?.theory_identity,
          theoryIdentity,
        );
        checkField(
          violations,
          "evidence_subject_drift",
          evidenceId,
          model?.realization_identity,
          identity,
        );
        checkField(
          violations,
          "evidence_case_count_drift",
          evidenceId,
          model?.cases,
          `${String(packet.passed_cases)}/${String(packet.total_cases)}`,
        );
      }
    }

    const policy = requireObject(requireKey(claim, "policy", "claim"), "claim.policy");
    const policyId = requireString(requireKey(policy, "id", "claim.policy"), "claim.policy.id");
    const policyIdentity = requireString(
      requireKey(policy, "content_identity", "claim.policy"),
      "claim.policy.content_identity",
    );
    const policyArtifact = `artifact.${policyId}`;
    checkField(
      violations,
      "policy_binding_drift",
      policyArtifact,
      attributes(execution, policyArtifact)?.path,
      `examples/inventory/policies/${policyId.split(".").at(-1)}.json`,
    );
    checkField(
      violations,
      "policy_identity_drift",
      policyArtifact,
      attributes(execution, policyArtifact)?.content_identity,
      policyIdentity,
    );
    const selectedRaw = claim.selected;
    const selected =
      selectedRaw === null || selectedRaw === undefined
        ? null
        : requireObject(selectedRaw, "claim.selected");
    const selectedId =
      selected === null
        ? null
        : requireString(requireKey(selected, "id", "claim.selected"), "claim.selected.id");
    const selectedCandidate =
      selectedId === null
        ? null
        : (candidates.find((candidate) => candidate.realization_id === selectedId) ?? null);
    const selectedEvidenceRaw = selectedCandidate?.evidence;
    const selectedEvidence =
      selectedEvidenceRaw === null || selectedEvidenceRaw === undefined
        ? null
        : requireObject(selectedEvidenceRaw, "selected candidate evidence");
    const lock = attributes(execution, "artifact.lock.inventory.reference");
    checkField(
      violations,
      "deployment_selection_drift",
      "artifact.lock.inventory.reference",
      lock?.realization_identity,
      selected?.identity ?? null,
    );
    checkField(
      violations,
      "deployment_theory_drift",
      "artifact.lock.inventory.reference",
      lock?.theory_identity,
      theoryIdentity,
    );
    checkField(
      violations,
      "deployment_policy_drift",
      "artifact.lock.inventory.reference",
      lock?.policy_id,
      policyId,
    );
    checkField(
      violations,
      "deployment_policy_identity_drift",
      "artifact.lock.inventory.reference",
      lock?.policy_identity,
      policyIdentity,
    );
    checkField(
      violations,
      "deployment_evidence_identity_drift",
      "artifact.lock.inventory.reference",
      lock?.evidence_result_identity,
      selectedEvidence?.identity ?? null,
    );
    checkField(
      violations,
      "deployment_recipe_identity_drift",
      "artifact.lock.inventory.reference",
      lock?.recipe_identity,
      selectedEvidence?.recipe_identity ?? null,
    );
    checkField(
      violations,
      "deployment_evidence_type_drift",
      "artifact.lock.inventory.reference",
      lock?.evidence_type,
      selectedEvidence?.category ?? null,
    );
    const claimedAssumptions = [
      ...requireStringList(claim.selected_assumptions ?? [], "claim.selected_assumptions"),
    ].sort();
    const modelAssumptions =
      lock === null
        ? []
        : [...requireStringList(lock.assumptions ?? [], "selection lock assumptions")].sort();
    checkField(
      violations,
      "assumption_projection_drift",
      "artifact.lock.inventory.reference",
      modelAssumptions,
      claimedAssumptions,
    );
    return { valid: violations.length === 0, violations };
  });
