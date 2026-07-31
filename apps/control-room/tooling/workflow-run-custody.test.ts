import { describe, expect, test } from "vitest";
import {
  observeClosedPreviewEffect,
  observeWorkflowRunEffect,
  selectImmutableArtifact,
  validateClosedPreview,
  validateLiveClosedPreview,
  validateLiveWorkflowTarget,
  validateWorkflowRunProvenance,
} from "./workflow-run-custody.ts";

const repository = "phibkro/semantic-systems";
const commit = "0123456789abcdef0123456789abcdef01234567";
const repositoryObject = { full_name: repository };
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
        number: 17,
        base: { ref: "main", sha: "f".repeat(40), repo: repositoryObject },
        head: { ref: "feature/control-room", sha: commit, repo: repositoryObject },
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

describe("trusted workflow-run custody", () => {
  test("binds one same-repository PR head to one immutable artifact identity", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(provenance).toEqual({
      artifactName: "control-room-static-123-2",
      commit,
      kind: "preview",
      prNumber: "17",
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
    fork.workflow_run.head_repository = { full_name: "attacker/fork" };
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
      stage: "p17",
    });
    const fork = structuredClone(event);
    fork.pull_request.head.repo = { full_name: "attacker/fork" };
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
      observeWorkflowRunEffect(liveMain("f".repeat(40)), provenance, repository, "success"),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
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
      observeClosedPreviewEffect(livePullRequest("open"), provenance, repository, "success"),
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
      ),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
    });
    expect(
      observeWorkflowRunEffect(livePullRequest("open"), provenance, repository, "failure"),
    ).toEqual({
      effectObservation: "DeploymentUnknown",
      reconciliationRequired: "true",
    });
  });

  test("observes success only while the authoritative target remains exact", () => {
    const provenance = validateWorkflowRunProvenance(previewEvent, repository);
    expect(
      observeWorkflowRunEffect(livePullRequest("open"), provenance, repository, "success"),
    ).toEqual({
      effectObservation: "DeploymentObserved",
      reconciliationRequired: "false",
    });
  });
});
