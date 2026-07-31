import { describe, expect, test } from "vitest";
import { VERSION_SCHEMA, type PublicSnapshot, type PublicVersion } from "../src/model.ts";
import { fixtureSnapshot } from "../src/test/fixture.ts";
import {
  observeClosedPreviewEffect,
  observeWorkflowRunEffect,
  selectImmutableArtifact,
  validateClosedPreview,
  validateLiveClosedPreview,
  validateLiveWorkflowTarget,
  validateServedArtifact,
  validateWorkflowRunProvenance,
} from "./workflow-run-custody.ts";

const repository = "phibkro/semantic-systems";
const repositoryId = 4242;
const commit = "0123456789abcdef0123456789abcdef01234567";
const repositoryObject = { full_name: repository, id: repositoryId };
const workflowRepoRef = {
  id: repositoryId,
  name: "semantic-systems",
  url: `https://api.github.test/repositories/${repositoryId}`,
};
const previewEvent = {
  action: "completed",
  repository: repositoryObject,
  workflow_run: {
    id: 123,
    run_attempt: 2,
    name: "Control Room Static Artifact",
    path: ".github/workflows/control-room-alchemy.yml",
    conclusion: "success",
    event: "pull_request",
    head_branch: "feature/control-room",
    head_sha: commit,
    repository: repositoryObject,
    head_repository: repositoryObject,
    pull_requests: [
      {
        id: 1717,
        number: 17,
        url: "https://api.github.test/repos/phibkro/semantic-systems/pulls/17",
        base: { ref: "main", sha: "f".repeat(40), repo: { ...workflowRepoRef } },
        head: { ref: "feature/control-room", sha: commit, repo: { ...workflowRepoRef } },
      },
    ],
  },
};
const livePullRequest = (state: "closed" | "open", headSha = commit) => ({
  number: 17,
  state,
  base: { ref: "main", repo: repositoryObject },
  head: { ref: "feature/control-room", sha: headSha, repo: repositoryObject },
});
const liveMain = (sha = commit) => ({
  ref: "refs/heads/main",
  object: { type: "commit", sha },
});
const artifactDigest = `sha256:${"b".repeat(64)}`;
const servedArtifact = { artifactDigest, commit, snapshotDigest: "a".repeat(64) };

const compareCodeUnits = (left: string, right: string): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

const validServedPair = async (): Promise<{
  readonly snapshot: PublicSnapshot;
  readonly version: PublicVersion;
}> => {
  const digestInput = {
    ...fixtureSnapshot,
    metadata: { ...fixtureSnapshot.metadata, digest: "" },
  };
  const bytes = new TextEncoder().encode(`${JSON.stringify(canonicalize(digestInput))}\n`);
  const digestBytes = await crypto.subtle.digest("SHA-256", bytes);
  const digest = Array.from(new Uint8Array(digestBytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const snapshot: PublicSnapshot = {
    ...fixtureSnapshot,
    metadata: { ...fixtureSnapshot.metadata, digest },
  };
  return {
    snapshot,
    version: {
      schema_version: VERSION_SCHEMA,
      commit,
      digest,
      observed_at: snapshot.metadata.observed_at,
      snapshot: `snapshot.${digest}.json`,
    },
  };
};

describe("trusted workflow-run custody", () => {
  test("binds one same-repository PR head to one immutable artifact identity", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(provenance).toEqual({
      artifactName: "control-room-static-123-2",
      commit,
      kind: "preview",
      prNumber: "17",
      repositoryId: String(repositoryId),
      runAttempt: "2",
      runId: "123",
      stage: "p17",
    });
    expect(
      selectImmutableArtifact(
        {
          total_count: 1,
          artifacts: [
            {
              id: 456,
              name: provenance.artifactName,
              expired: false,
              digest: `sha256:${"a".repeat(64)}`,
              workflow_run: { id: 123, head_sha: commit },
            },
          ],
        },
        provenance,
      ),
    ).toEqual({
      digest: `sha256:${"a".repeat(64)}`,
      id: "456",
      name: provenance.artifactName,
    });
  });

  test("rejects forks, ambiguous PR provenance, stale heads, and extra artifacts", () => {
    const fork = structuredClone(previewEvent);
    fork.workflow_run.head_repository = { full_name: "attacker/fork", id: 9999 };
    expect(() => validateWorkflowRunProvenance(fork, repository)).toThrow(
      "workflow_run.head_repository",
    );

    const ambiguous = structuredClone(previewEvent);
    ambiguous.workflow_run.pull_requests.push(ambiguous.workflow_run.pull_requests[0]!);
    expect(() => validateWorkflowRunProvenance(ambiguous, repository)).toThrow(
      "exactly one pull request",
    );

    const stale = structuredClone(previewEvent);
    stale.workflow_run.pull_requests[0]!.head.sha = "f".repeat(40);
    expect(() => validateWorkflowRunProvenance(stale, repository)).toThrow(
      "not bound to the workflow head",
    );

    const forkReference = structuredClone(previewEvent);
    forkReference.workflow_run.pull_requests[0]!.head.repo.id = 9999;
    expect(() => validateWorkflowRunProvenance(forkReference, repository)).toThrow(
      "head repository",
    );

    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(() =>
      selectImmutableArtifact({ total_count: 2, artifacts: [{}, {}] }, provenance),
    ).toThrow("exactly one immutable artifact");

    const wrongWorkflow = structuredClone(previewEvent);
    wrongWorkflow.workflow_run.path = ".github/workflows/untrusted.yml";
    expect(() => validateWorkflowRunProvenance(wrongWorkflow, repository)).toThrow("workflow path");
  });

  test("accepts only a trusted main push for production", () => {
    const push = structuredClone(previewEvent);
    push.workflow_run.event = "push";
    push.workflow_run.head_branch = "main";
    push.workflow_run.pull_requests = [];
    expect(validateWorkflowRunProvenance(push, repository)).toMatchObject({
      kind: "production",
      stage: "prod",
      commit,
    });
    push.workflow_run.head_branch = "release";
    expect(() => validateWorkflowRunProvenance(push, repository)).toThrow("did not run on main");
  });

  test("derives cleanup only from one closed same-repository main PR", () => {
    const event = {
      action: "closed",
      repository: repositoryObject,
      pull_request: {
        number: 17,
        base: { ref: "main", repo: repositoryObject },
        head: { ref: "feature/control-room", repo: repositoryObject },
      },
    };
    expect(validateClosedPreview(event, repository)).toEqual({
      prNumber: "17",
      repositoryId: String(repositoryId),
      stage: "p17",
    });
    const fork = structuredClone(event);
    fork.pull_request.head.repo = { full_name: "attacker/fork", id: 9999 };
    expect(() => validateClosedPreview(fork, repository)).toThrow("head repository");
  });

  test("rejects a stale main artifact before production secret release", () => {
    const push = structuredClone(previewEvent);
    push.workflow_run.event = "push";
    push.workflow_run.head_branch = "main";
    push.workflow_run.pull_requests = [];
    const provenance = validateWorkflowRunProvenance(push, repository);
    expect(() =>
      validateLiveWorkflowTarget(liveMain("f".repeat(40)), provenance, repository),
    ).toThrow("live main advanced");
  });

  test("rejects a replayed production event after main advances", () => {
    const push = structuredClone(previewEvent);
    push.workflow_run.event = "push";
    push.workflow_run.head_branch = "main";
    push.workflow_run.pull_requests = [];
    const provenance = validateWorkflowRunProvenance(push, repository);
    expect(
      observeWorkflowRunEffect(
        liveMain("f".repeat(40)),
        provenance,
        repository,
        "success",
        servedArtifact,
      ),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
      servedSnapshotDigest: "",
    });
  });

  test("rejects a preview after its PR advances or closes", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(() =>
      validateLiveWorkflowTarget(livePullRequest("open", "f".repeat(40)), provenance, repository),
    ).toThrow("head advanced");
    expect(() =>
      validateLiveWorkflowTarget(livePullRequest("closed"), provenance, repository),
    ).toThrow("not open");
  });

  test("rejects cleanup replay after a PR is reopened", () => {
    const event = {
      action: "closed",
      repository: repositoryObject,
      pull_request: {
        number: 17,
        base: { ref: "main", repo: repositoryObject },
        head: { ref: "feature/control-room", repo: repositoryObject },
      },
    };
    const provenance = validateClosedPreview(event, repository);
    expect(() =>
      validateLiveClosedPreview(livePullRequest("open"), provenance, repository),
    ).toThrow("not closed");
    expect(
      observeClosedPreviewEffect(livePullRequest("open"), provenance, repository, "success", 404),
    ).toMatchObject({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
    });
  });

  test("marks a mid-effect ref race and provider failure as reconciliation-required", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(
      observeWorkflowRunEffect(
        livePullRequest("open", "f".repeat(40)),
        provenance,
        repository,
        "success",
        servedArtifact,
      ),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
      servedSnapshotDigest: "",
    });
    expect(
      observeWorkflowRunEffect(
        livePullRequest("open"),
        provenance,
        repository,
        "failure",
        servedArtifact,
      ),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
      servedSnapshotDigest: "",
    });
  });

  test("does not infer deployment from provider exit and unchanged GitHub state", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(
      observeWorkflowRunEffect(
        livePullRequest("open"),
        provenance,
        repository,
        "success",
        undefined,
      ),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
      servedSnapshotDigest: "",
    });
  });

  test("observes deployment only from an exact served artifact and current target", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(
      observeWorkflowRunEffect(
        livePullRequest("open"),
        provenance,
        repository,
        "success",
        servedArtifact,
      ),
    ).toEqual({
      effectObservation: "DeploymentObserved",
      reconciliationRequired: "false",
      servedSnapshotDigest: servedArtifact.snapshotDigest,
    });
  });

  test("binds served version and snapshot bytes to the digest-custodied artifact", async () => {
    const pair = await validServedPair();
    const versionText = `${JSON.stringify(pair.version)}\n`;
    const snapshotText = `${JSON.stringify(pair.snapshot)}\n`;
    await expect(
      validateServedArtifact(
        versionText,
        snapshotText,
        versionText,
        snapshotText,
        commit,
        artifactDigest,
      ),
    ).resolves.toEqual({
      artifactDigest,
      commit,
      snapshotDigest: pair.version.digest,
    });
    await expect(
      validateServedArtifact(
        versionText,
        snapshotText,
        versionText,
        `${snapshotText} `,
        commit,
        artifactDigest,
      ),
    ).rejects.toThrow("served snapshot bytes");
  });

  test("observes cleanup only from an explicit absent response at a still-closed PR", () => {
    const event = {
      action: "closed",
      repository: repositoryObject,
      pull_request: {
        number: 17,
        base: { ref: "main", repo: repositoryObject },
        head: { ref: "feature/control-room", repo: repositoryObject },
      },
    };
    const provenance = validateClosedPreview(event, repository);
    expect(
      observeClosedPreviewEffect(livePullRequest("closed"), provenance, repository, "success", 404),
    ).toEqual({
      effectObservation: "RemovalObserved",
      reconciliationRequired: "false",
      servedSnapshotDigest: "",
    });
    expect(
      observeClosedPreviewEffect(livePullRequest("closed"), provenance, repository, "success", 200),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
      servedSnapshotDigest: "",
    });
  });
});
