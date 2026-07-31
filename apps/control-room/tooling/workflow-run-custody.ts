import { appendFile, readFile } from "node:fs/promises";

const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const EXACT_ARTIFACT_DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PRODUCER_WORKFLOW = "Control Room Static Artifact";

interface RecordValue {
  readonly [key: string]: unknown;
}

export interface WorkflowRunProvenance {
  readonly artifactName: string;
  readonly commit: string;
  readonly kind: "preview" | "production";
  readonly prNumber: string;
  readonly runAttempt: string;
  readonly runId: string;
  readonly stage: string;
}

export interface ArtifactIdentity {
  readonly digest: string;
  readonly id: string;
  readonly name: string;
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown, label: string): RecordValue => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
};

const positiveInteger = (value: unknown, label: string): string => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return String(value);
};

const sameRepository = (value: unknown, repository: string, label: string): void => {
  const fullName = string(record(value, label).full_name, `${label}.full_name`);
  if (fullName !== repository) throw new Error(`${label} is not the triggering repository`);
};

export const validateWorkflowRunProvenance = (
  value: unknown,
  repository: string,
): WorkflowRunProvenance => {
  if (!REPOSITORY.test(repository)) throw new Error("repository identity is malformed");
  const event = record(value, "event");
  sameRepository(event.repository, repository, "event.repository");
  if (event.action !== "completed") throw new Error("workflow_run action must be completed");
  const run = record(event.workflow_run, "event.workflow_run");
  if (run.name !== PRODUCER_WORKFLOW) throw new Error("unexpected producer workflow");
  if (run.conclusion !== "success") throw new Error("producer workflow did not succeed");
  sameRepository(run.repository, repository, "workflow_run.repository");
  sameRepository(run.head_repository, repository, "workflow_run.head_repository");
  const commit = string(run.head_sha, "workflow_run.head_sha");
  if (!EXACT_COMMIT.test(commit)) throw new Error("workflow head is not an exact commit");
  const runId = positiveInteger(run.id, "workflow_run.id");
  const runAttempt = positiveInteger(run.run_attempt, "workflow_run.run_attempt");
  const artifactName = `control-room-static-${runId}-${runAttempt}`;

  if (run.event === "push") {
    if (run.head_branch !== "main") throw new Error("production artifact did not run on main");
    return {
      artifactName,
      commit,
      kind: "production",
      prNumber: "",
      runAttempt,
      runId,
      stage: "prod",
    };
  }
  if (run.event !== "pull_request") throw new Error("unsupported producer event");
  if (!Array.isArray(run.pull_requests) || run.pull_requests.length !== 1) {
    throw new Error("preview artifact must bind exactly one pull request");
  }
  const pullRequest = record(run.pull_requests[0], "workflow_run.pull_requests[0]");
  const number = positiveInteger(pullRequest.number, "pull request number");
  const base = record(pullRequest.base, "pull request base");
  const head = record(pullRequest.head, "pull request head");
  if (base.ref !== "main") throw new Error("preview target branch must be main");
  sameRepository(base.repo, repository, "pull request base repository");
  sameRepository(head.repo, repository, "pull request head repository");
  if (head.sha !== commit) throw new Error("pull request head is not bound to the workflow head");
  return {
    artifactName,
    commit,
    kind: "preview",
    prNumber: number,
    runAttempt,
    runId,
    stage: `p${number}`,
  };
};

export const selectImmutableArtifact = (
  value: unknown,
  provenance: WorkflowRunProvenance,
): ArtifactIdentity => {
  const response = record(value, "artifact response");
  if (!Array.isArray(response.artifacts) || response.artifacts.length !== 1) {
    throw new Error("producer run must expose exactly one immutable artifact");
  }
  if (response.total_count !== 1) {
    throw new Error("artifact response count is not exact");
  }
  const artifact = record(response.artifacts[0], "artifact");
  if (artifact.name !== provenance.artifactName) throw new Error("artifact name is not run-bound");
  if (artifact.expired !== false) throw new Error("artifact is expired");
  const id = positiveInteger(artifact.id, "artifact.id");
  const digest = string(artifact.digest, "artifact.digest");
  if (!EXACT_ARTIFACT_DIGEST.test(digest)) {
    throw new Error("artifact digest is missing or malformed");
  }
  const workflowRun = record(artifact.workflow_run, "artifact.workflow_run");
  if (String(workflowRun.id) !== provenance.runId) {
    throw new Error("artifact run id is not bound to the producer");
  }
  if (workflowRun.head_sha !== provenance.commit) {
    throw new Error("artifact head is not bound to the producer commit");
  }
  return { digest, id, name: provenance.artifactName };
};

export const validateClosedPreview = (value: unknown, repository: string): string => {
  if (!REPOSITORY.test(repository)) throw new Error("repository identity is malformed");
  const event = record(value, "event");
  if (event.action !== "closed") throw new Error("cleanup event must be closed");
  sameRepository(event.repository, repository, "event.repository");
  const pullRequest = record(event.pull_request, "event.pull_request");
  const number = positiveInteger(pullRequest.number, "pull request number");
  const base = record(pullRequest.base, "pull request base");
  const head = record(pullRequest.head, "pull request head");
  if (base.ref !== "main") throw new Error("cleanup target branch must be main");
  sameRepository(base.repo, repository, "pull request base repository");
  sameRepository(head.repo, repository, "pull request head repository");
  return `p${number}`;
};

const fetchArtifactIdentity = async (
  provenance: WorkflowRunProvenance,
  repository: string,
  apiUrl: string,
  token: string,
): Promise<ArtifactIdentity> => {
  if (token === "") throw new Error("GitHub token is required for artifact custody");
  const response = await fetch(
    `${apiUrl}/repos/${repository}/actions/runs/${provenance.runId}/artifacts?per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  if (!response.ok) throw new Error(`artifact metadata request failed (${response.status})`);
  return selectImmutableArtifact(await response.json(), provenance);
};

const writeOutputs = async (path: string, outputs: Readonly<Record<string, string>>) => {
  for (const [key, value] of Object.entries(outputs)) {
    if (!/^[a-z_]+$/.test(key) || /[\r\n]/.test(value)) {
      throw new Error("refusing unsafe GitHub output");
    }
    await appendFile(path, `${key}=${value}\n`, "utf8");
  }
};

const main = async (): Promise<void> => {
  const [mode, eventPath, repository, outputPath] = process.argv.slice(2);
  if (
    (mode !== "workflow-run" && mode !== "closed-preview") ||
    eventPath === undefined ||
    repository === undefined ||
    outputPath === undefined
  ) {
    throw new Error(
      "usage: workflow-run-custody.ts <workflow-run|closed-preview> EVENT REPOSITORY OUTPUT",
    );
  }
  const event: unknown = JSON.parse(await readFile(eventPath, "utf8"));
  if (mode === "closed-preview") {
    await writeOutputs(outputPath, { stage: validateClosedPreview(event, repository) });
    return;
  }
  const provenance = validateWorkflowRunProvenance(event, repository);
  const artifact = await fetchArtifactIdentity(
    provenance,
    repository,
    process.env.GITHUB_API_URL ?? "https://api.github.com",
    process.env.GH_TOKEN ?? "",
  );
  await writeOutputs(outputPath, {
    artifact_digest: artifact.digest,
    artifact_id: artifact.id,
    artifact_name: artifact.name,
    commit: provenance.commit,
    kind: provenance.kind,
    pr_number: provenance.prNumber,
    run_id: provenance.runId,
    stage: provenance.stage,
  });
};

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
