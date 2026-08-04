import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  FEATURE_ARTIFACT_FORMAT,
  FEATURE_CLOSURE_OBSERVATION_FORMAT,
  FEATURE_GIT_OBSERVATION_FORMAT,
  FEATURE_HISTORICAL_IMPORT_FORMAT,
  FEATURE_PROVIDER_OBSERVATION_FORMAT,
  FEATURE_TRANSITION_FORMAT,
  FeatureDossierError,
  type ArtifactKind,
  type TransitionKind,
  compileFeatureDossier,
} from "../src/project-model/feature-dossier.ts";

const featureId = "0058-feature-dossier-workflow";
const directory = `features/${featureId}`;
const digest = (character: string): string => character.repeat(64);
const contentDigest = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

const metadata = (kind: ArtifactKind) => ({
  format: FEATURE_ARTIFACT_FORMAT,
  feature_id: featureId,
  kind,
  title: `${kind} artifact`,
});

const artifact = (kind: ArtifactKind, path: string, _character: string) => {
  const content = `# ${kind}\n`;
  return {
    kind,
    path: `${directory}/${path}`,
    content,
    sha256: contentDigest(content),
    metadata: metadata(kind),
  };
};

const artifacts = [
  artifact("proposal", "proposal.md", "a"),
  artifact("research", "research.md", "b"),
  artifact("design", "design.md", "c"),
  artifact("specification", "spec.md", "d"),
  artifact("implementation_report", "implementation-report.md", "e"),
  artifact("verification", "verification/report.md", "f"),
  artifact("review", "verification/review.md", "0"),
] as const;

const byKind = (kind: ArtifactKind) => artifacts.find((value) => value.kind === kind)!;

const receipt = ({
  receipt_id,
  transition,
  issuer,
  role,
  artifact_kind,
  artifact_path,
  artifact_sha256,
  candidate_revision,
  replacement_feature_id,
  reason,
}: {
  readonly receipt_id: string;
  readonly transition: TransitionKind;
  readonly issuer: string;
  readonly role:
    | "feature_owner"
    | "research_author"
    | "design_authority"
    | "specification_authority"
    | "implementation_agent"
    | "verification_authority"
    | "independent_reviewer"
    | "protected_checks"
    | "integration";
  readonly artifact_kind?: ArtifactKind;
  readonly artifact_path?: string;
  readonly artifact_sha256?: string;
  readonly candidate_revision?: string;
  readonly replacement_feature_id?: string;
  readonly reason?: string;
}) => ({
  format: FEATURE_TRANSITION_FORMAT,
  receipt_id,
  feature_id: featureId,
  transition,
  ...(artifact_kind === undefined ? {} : { artifact_kind }),
  ...(artifact_path === undefined ? {} : { artifact_path }),
  ...(artifact_sha256 === undefined ? {} : { artifact_sha256 }),
  ...(candidate_revision === undefined ? {} : { candidate_revision }),
  issuer: { identity: issuer, role },
  observed_at: "2026-08-04T00:00:00Z",
  evidence_category: "test" as const,
  ...(replacement_feature_id === undefined ? {} : { replacement_feature_id }),
  ...(reason === undefined ? {} : { reason }),
});

const artifactReceipt = (
  receiptId: string,
  transition: TransitionKind,
  kind: ArtifactKind,
  issuer: string,
  role: Parameters<typeof receipt>[0]["role"],
  extra: { readonly candidate_revision?: string } = {},
) => {
  const value = byKind(kind);
  return receipt({
    receipt_id: receiptId,
    transition,
    issuer,
    role,
    artifact_kind: kind,
    artifact_path: value.path,
    artifact_sha256: value.sha256,
    ...extra,
  });
};

const fullReceipts = () => [
  artifactReceipt("r-proposal", "proposal_accepted", "proposal", "owner", "feature_owner"),
  artifactReceipt("r-research", "research_accepted", "research", "researcher", "research_author"),
  artifactReceipt("r-design", "design_accepted", "design", "designer", "design_authority"),
  artifactReceipt(
    "r-spec",
    "specification_accepted",
    "specification",
    "spec-owner",
    "specification_authority",
  ),
  artifactReceipt(
    "r-candidate",
    "candidate_nominated",
    "implementation_report",
    "builder",
    "implementation_agent",
    {
      candidate_revision: "candidate-1",
    },
  ),
  artifactReceipt(
    "r-verification",
    "verification_accepted",
    "verification",
    "verifier",
    "verification_authority",
  ),
  artifactReceipt("r-review", "review_accepted", "review", "reviewer", "independent_reviewer"),
  artifactReceipt("r-checks", "checks_accepted", "verification", "ci", "protected_checks"),
];

const gitObservation = (candidateReachable = true, candidateRevision = "candidate-1") => ({
  format: FEATURE_GIT_OBSERVATION_FORMAT,
  observation_id: "git-1",
  feature_id: featureId,
  head: "main-1",
  clean: true,
  candidate_revision: candidateRevision,
  candidate_reachable: candidateReachable,
});

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  feature_id: featureId,
  directory,
  artifacts: [...artifacts],
  receipts: fullReceipts(),
  observations: { git: gitObservation() },
  ...overrides,
});

const run = async (input: unknown) =>
  Effect.runPromise(compileFeatureDossier(input).pipe(Effect.provide(BunCrypto.layer)));

const failure = async (input: unknown): Promise<FeatureDossierError> => {
  const result = await Effect.runPromise(
    compileFeatureDossier(input).pipe(
      Effect.provide(BunCrypto.layer),
      Effect.as<FeatureDossierError | undefined>(undefined),
      Effect.catch((error) => Effect.succeed(error)),
    ),
  );
  if (!(result instanceof FeatureDossierError)) {
    throw new Error("expected a FeatureDossierError failure");
  }
  return result;
};

describe("feature dossier compiler", () => {
  test("derives the synthetic journey through merge and closed closure", async () => {
    const result = await run({
      ...baseInput(),
      observations: {
        git: gitObservation(),
        closure: [
          {
            format: FEATURE_CLOSURE_OBSERVATION_FORMAT,
            observation_id: "closure-cleanup",
            feature_id: featureId,
            kind: "cleanup",
            status: "accepted",
            source: "cleanup-run",
            observed_at: "2026-08-04T00:00:00Z",
            evidence_category: "runtime_check",
          },
          {
            format: FEATURE_CLOSURE_OBSERVATION_FORMAT,
            observation_id: "closure-feedback",
            feature_id: featureId,
            kind: "feedback",
            status: "accepted",
            source: "operator-feedback",
            observed_at: "2026-08-04T00:00:00Z",
            evidence_category: "assertion",
          },
        ],
      },
    });

    expect(result.lifecycle.phase.value).toBe("verification");
    expect(result.lifecycle.readiness.value).toBe("merge_ready");
    expect(result.lifecycle.condition.value).toBe("active");
    expect(result.lifecycle.delivery.value).toBe("done");
    expect(result.lifecycle.closure.value).toBe("closed");
    expect(result.lifecycle.delivery.sources[0]?.kind).toBe("git_observation");
    expect(result.lifecycle.closure.sources.map((source) => source.kind)).toEqual([
      "closure_observation",
      "closure_observation",
    ]);
    expect(result.queues.closure).toEqual([]);
  });

  test("requires an exact nonempty candidate revision for delivered candidates", async () => {
    const withoutReceiptRevision = fullReceipts().map((value) => {
      if (value.receipt_id !== "r-candidate") return value;
      const copy = structuredClone(value);
      Reflect.deleteProperty(copy, "candidate_revision");
      return copy;
    });
    const missingReceiptRevision = await run({
      ...baseInput(),
      receipts: withoutReceiptRevision,
    });
    expect(missingReceiptRevision.lifecycle.delivery.value).toBe("unmerged");

    const { candidate_revision: _candidateRevision, ...gitWithoutRevision } = gitObservation();
    const missingGitRevision = await run({
      ...baseInput(),
      observations: { git: gitWithoutRevision },
    });
    expect(missingGitRevision.lifecycle.delivery.value).toBe("unmerged");

    const mismatchedRevision = await run({
      ...baseInput(),
      observations: { git: gitObservation(true, "candidate-2") },
    });
    expect(mismatchedRevision.lifecycle.delivery.value).toBe("unmerged");
  });

  test("does not advance from artifact filenames without accepted receipts", async () => {
    const result = await run({
      ...baseInput(),
      receipts: [],
      observations: { git: gitObservation(false) },
    });

    expect(result.lifecycle.phase.value).toBe("proposal");
    expect(result.lifecycle.readiness.value).toBe("drafting");
    expect(result.lifecycle.delivery.value).toBe("unmerged");
    expect(result.lifecycle.phase.sources[0]?.kind).toBe("artifact");
  });

  test("invalidates candidate, review, check, and verification facts after an accepted artifact changes", async () => {
    const changedArtifacts = artifacts.map((value) =>
      value.kind === "specification"
        ? {
            ...value,
            content: "# changed\n",
            sha256: contentDigest("# changed\n"),
            metadata: { ...value.metadata },
          }
        : value,
    );
    const result = await run({ ...baseInput(), artifacts: changedArtifacts });

    expect(result.invalidations).toHaveLength(1);
    expect(result.invalidations[0]?.cause).toBe("changed");
    expect(result.invalidations[0]?.artifact_path).toBe(byKind("specification").path);
    expect(result.invalidations[0]?.current_hash).toBe(contentDigest("# changed\n"));
    expect(
      result.receipts
        .filter((value) => value.status === "accepted")
        .map((value) => value.transition),
    ).toEqual(["design_accepted", "proposal_accepted", "research_accepted"]);
    expect(result.lifecycle.readiness.value).toBe("implementation_review_ready");
    expect(result.diagnostics.some((value) => value.code === "receipt.hash_mismatch")).toBeTrue();
  });

  test("invalidates dependent facts after an accepted artifact is removed", async () => {
    const result = await run({
      ...baseInput(),
      artifacts: artifacts.filter((value) => value.kind !== "specification"),
    });

    expect(result.invalidations).toHaveLength(1);
    expect(result.invalidations[0]?.cause).toBe("removed");
    expect(result.invalidations[0]?.artifact_path).toBe(byKind("specification").path);
    expect(result.invalidations[0]?.current_hash).toBeUndefined();
    expect(
      result.receipts
        .filter((value) =>
          [
            "candidate_nominated",
            "review_accepted",
            "checks_accepted",
            "verification_accepted",
          ].includes(value.transition),
        )
        .every((value) => value.status === "rejected"),
    ).toBeTrue();
    expect(
      result.diagnostics.filter((value) => value.code === "receipt.dependent_fact_invalidated"),
    ).toHaveLength(4);
  });

  test("rejects self-accepted specification and independent review", async () => {
    const receipts = fullReceipts().map((value) =>
      value.receipt_id === "r-spec" || value.receipt_id === "r-review"
        ? Object.assign({}, value, { issuer: { identity: "builder", role: value.issuer.role } })
        : value,
    );
    const result = await run({ ...baseInput(), receipts });

    expect(result.receipts.find((value) => value.receipt_id === "r-spec")?.status).toBe("rejected");
    expect(result.receipts.find((value) => value.receipt_id === "r-review")?.status).toBe(
      "rejected",
    );
    expect(result.lifecycle.readiness.value).toBe("implementation_review_ready");
    expect(
      result.diagnostics.filter((value) => value.code === "receipt.self_attestation"),
    ).toHaveLength(2);
  });

  test("does not let operator authority bypass the transition-specific matrix", async () => {
    const receipts = fullReceipts().map((value) =>
      value.receipt_id === "r-candidate"
        ? Object.assign({}, value, {
            issuer: Object.assign({}, value.issuer, { role: "operator" }),
          })
        : value,
    );
    const result = await run({ ...baseInput(), receipts });

    expect(result.receipts.find((value) => value.receipt_id === "r-candidate")?.status).toBe(
      "rejected",
    );
    expect(
      result.diagnostics.some(
        (value) =>
          value.code === "receipt.unauthorized_role" && value.path === "/receipts/r-candidate",
      ),
    ).toBeTrue();
    expect(result.lifecycle.phase.value).toBe("implementation");
    expect(result.lifecycle.readiness.value).toBe("accepted");
  });

  test("rejects unknown fields and bad versions at the schema boundary", async () => {
    const unknownFieldExit = await failure({ ...baseInput(), unexpected: true });
    expect(unknownFieldExit.code).toBe("invalid_input");

    const badVersionExit = await failure({
      ...baseInput(),
      artifacts: [
        {
          ...artifacts[0],
          metadata: { ...artifacts[0].metadata, format: "semantic.feature-artifact/v9" },
        },
      ],
    });
    expect(badVersionExit.code).toBe("invalid_artifact");
  });

  test("requires the canonical dossier directory and rejects outside artifact paths", async () => {
    const basenameOnly = await failure({
      ...baseInput(),
      directory: `archive/${featureId}`,
    });
    expect(basenameOnly.code).toBe("directory_identity_mismatch");

    const trailingSlash = await failure({
      ...baseInput(),
      directory: `${directory}/`,
    });
    expect(trailingSlash.code).toBe("directory_identity_mismatch");

    for (const path of [
      `design-specs/${featureId}.md`,
      `plans/active/${featureId}.md`,
      `model/work/features/${featureId}.json`,
      `scripts/accept/${featureId}.ts`,
    ]) {
      const outside = await failure({
        ...baseInput(),
        artifacts: artifacts.map((value, index) => (index === 0 ? { ...value, path } : value)),
      });
      expect(outside.code).toBe("invalid_artifact");
    }

    const escaped = await failure({
      ...baseInput(),
      artifacts: artifacts.map((value, index) =>
        index === 0 ? { ...value, path: `${directory}/../outside/proposal.md` } : value,
      ),
    });
    expect(escaped.code).toBe("invalid_artifact");
  });

  test("preserves historical evidence without authorizing a transition", async () => {
    const result = await run({
      ...baseInput(),
      receipts: [],
      historical_imports: [
        {
          format: FEATURE_HISTORICAL_IMPORT_FORMAT,
          import_id: "legacy-1",
          feature_id: featureId,
          artifacts: [
            {
              path: "design-specs/legacy.md",
              sha256: digest("2"),
              status: "complete",
              evidence_categories: ["analysis", "runtime_check"],
              completion_evidence: ["legacy acceptance"],
            },
          ],
          integration_revision: "legacy-main",
          evidence_categories: ["analysis", "runtime_check"],
          unsupported_claims: ["legacy status was not independently reviewed"],
          approved_by: { identity: "migration", role: "migration_operator" },
        },
      ],
    });

    expect(result.lifecycle.phase.value).toBe("proposal");
    expect(result.receipts).toEqual([]);
    expect(result.historical_imports[0]?.evidence_categories).toEqual([
      "analysis",
      "runtime_check",
    ]);
    expect(result.historical_imports[0]?.unsupported_claims).toEqual([
      "legacy status was not independently reviewed",
    ]);
    const operatorExit = await failure({
      ...baseInput(),
      receipts: [],
      historical_imports: [
        {
          format: FEATURE_HISTORICAL_IMPORT_FORMAT,
          import_id: "legacy-operator",
          feature_id: featureId,
          artifacts: [
            {
              path: "design-specs/legacy.md",
              sha256: digest("2"),
              status: "complete",
              evidence_categories: ["analysis", "runtime_check"],
              completion_evidence: ["legacy acceptance"],
            },
          ],
          integration_revision: "legacy-main",
          evidence_categories: ["analysis", "runtime_check"],
          unsupported_claims: ["legacy status was not independently reviewed"],
          approved_by: { identity: "operator", role: "operator" },
        },
      ],
    });
    expect(operatorExit.code).toBe("invalid_historical_import");
  });

  test("requires a replacement for supersession and preserves terminal delivery semantics", async () => {
    const missingReplacement = await run({
      ...baseInput(),
      receipts: [
        receipt({
          receipt_id: "r-supersede",
          transition: "feature_superseded",
          issuer: "integration",
          role: "integration",
        }),
      ],
      observations: { git: gitObservation(false) },
    });
    expect(missingReplacement.lifecycle.condition.value).toBe("active");
    expect(
      missingReplacement.diagnostics.some(
        (value) => value.code === "receipt.supersession_missing_replacement",
      ),
    ).toBeTrue();

    const superseded = await run({
      ...baseInput(),
      receipts: [
        receipt({
          receipt_id: "r-supersede",
          transition: "feature_superseded",
          issuer: "integration",
          role: "integration",
          replacement_feature_id: "0059-next-feature",
        }),
      ],
      observations: { git: gitObservation(false) },
    });
    expect(superseded.lifecycle.condition.value).toBe("superseded");
    const withdrawn = await run({
      ...baseInput(),
      receipts: [
        receipt({
          receipt_id: "r-withdraw",
          transition: "feature_withdrawn",
          issuer: "integration",
          role: "integration",
          reason: "operator withdrew the feature",
        }),
      ],
      observations: { git: gitObservation(false) },
    });
    expect(withdrawn.lifecycle.condition.value).toBe("withdrawn");
    expect(withdrawn.lifecycle.delivery.value).toBe("unmerged");
    expect(superseded.lifecycle.delivery.value).toBe("unmerged");
  });

  test("keeps closure open until feedback and cleanup are both observed", async () => {
    const result = await run({
      ...baseInput(),
      observations: {
        git: gitObservation(),
        closure: [
          {
            format: FEATURE_CLOSURE_OBSERVATION_FORMAT,
            observation_id: "closure-feedback",
            feature_id: featureId,
            kind: "feedback",
            status: "accepted",
            source: "operator-feedback",
            observed_at: "2026-08-04T00:00:00Z",
            evidence_category: "assertion",
          },
        ],
      },
    });
    expect(result.lifecycle.delivery.value).toBe("done");
    expect(result.lifecycle.closure.value).toBe("open");
    expect(result.queues.closure).toEqual([featureId]);
  });

  test("does not treat a provider request as its observation", async () => {
    const result = await run({
      ...baseInput(),
      observations: {
        git: gitObservation(),
        provider: {
          requests: [
            {
              request_id: "merge-request",
              feature_id: featureId,
              action: "merge",
              revision: "candidate-1",
            },
          ],
          observations: [],
        },
      },
    });
    expect(result.lifecycle.delivery.value).toBe("unmerged");
    expect(
      result.diagnostics.some((value) => value.code === "provider.request_without_observation"),
    ).toBeTrue();
  });

  test("requires provider observations to match request identity before delivery", async () => {
    const request = {
      request_id: "check-request",
      feature_id: featureId,
      action: "check" as const,
      revision: "candidate-1",
    };
    const observation = {
      format: FEATURE_PROVIDER_OBSERVATION_FORMAT,
      observation_id: "check-observation",
      request_id: request.request_id,
      feature_id: featureId,
      action: request.action,
      outcome: "success" as const,
      revision: request.revision,
      source: "provider.example/checks/1",
      observed_at: "2026-08-04T00:00:00Z",
      evidence_category: "runtime_check" as const,
    };
    const matching = await run({
      ...baseInput(),
      observations: {
        git: gitObservation(),
        provider: { requests: [request], observations: [observation] },
      },
    });
    expect(matching.lifecycle.delivery.value).toBe("done");

    const mismatches = [
      { ...observation, observation_id: "wrong-request", request_id: "other-request" },
      { ...observation, observation_id: "wrong-action", action: "review" as const },
      { ...observation, observation_id: "wrong-revision", revision: "candidate-2" },
    ];
    for (const mismatchedObservation of mismatches) {
      const result = await run({
        ...baseInput(),
        observations: {
          git: gitObservation(),
          provider: { requests: [request], observations: [mismatchedObservation] },
        },
      });
      expect(result.lifecycle.delivery.value).toBe("unmerged");
      expect(
        result.diagnostics.some(
          (value) =>
            value.code === "provider.invalid_observation" &&
            value.source?.id === mismatchedObservation.observation_id,
        ),
      ).toBeTrue();
      expect(result.observation_overlay.provider.observations).toContainEqual(
        mismatchedObservation,
      );
    }

    const featureMismatch = await failure({
      ...baseInput(),
      observations: {
        git: gitObservation(),
        provider: {
          requests: [request],
          observations: [{ ...observation, feature_id: "0059-other-feature" }],
        },
      },
    });
    expect(featureMismatch.code).toBe("feature_id_mismatch");
  });

  test("emits deterministic tree-only IR independent of ordering and observations", async () => {
    const first = await run(baseInput());
    const second = await run({
      ...baseInput(),
      artifacts: [...artifacts].reverse(),
      receipts: [...fullReceipts()].reverse(),
      observations: { git: { ...gitObservation(), head: "main-2" } },
    });

    expect(Array.from(first.work_ir_bytes)).toEqual(Array.from(second.work_ir_bytes));
    expect(first.observation_overlay.git.head).not.toBe(second.observation_overlay.git.head);
    expect(first.ir_bytes).toEqual(first.work_ir_bytes);
  });

  test("rejects feature identity mismatch and conflicting receipt identities", async () => {
    await failure({ ...baseInput(), feature_id: "0059-other-feature", directory });

    const conflicting = fullReceipts();
    conflicting.push({
      ...conflicting[0]!,
      receipt_id: "r-conflict",
      issuer: { identity: "other", role: "feature_owner" },
    });
    const exit = await failure({ ...baseInput(), receipts: conflicting });
    expect(exit.code).toBe("conflicting_receipt");
  });

  test("accepts provider observations only as an overlay and keeps their provenance", async () => {
    const result = await run({
      ...baseInput(),
      observations: {
        git: gitObservation(false),
        provider: {
          requests: [
            {
              request_id: "check-request",
              feature_id: featureId,
              action: "check",
              revision: "candidate-1",
            },
          ],
          observations: [
            {
              format: FEATURE_PROVIDER_OBSERVATION_FORMAT,
              observation_id: "check-observation",
              request_id: "check-request",
              feature_id: featureId,
              action: "check",
              outcome: "success",
              revision: "candidate-1",
              source: "provider.example/checks/1",
              observed_at: "2026-08-04T00:00:00Z",
              evidence_category: "runtime_check",
            },
          ],
        },
      },
    });
    expect(result.lifecycle.delivery.value).toBe("unmerged");
    expect(result.observation_overlay.provider.observations[0]?.source).toBe(
      "provider.example/checks/1",
    );
    expect(new TextDecoder().decode(result.work_ir_bytes)).not.toContain("provider.example");
  });
});
