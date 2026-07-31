import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDeploymentStage } from "../src/deployment.ts";
import { isPublicVersion, verifyCandidate } from "../src/snapshot.ts";
import { resolveStaticArtifactRoot, validateStaticArtifact } from "./scan-public-payload.ts";

const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const EXACT_SNAPSHOT_DIGEST = /^[0-9a-f]{64}$/;
const EXACT_ARTIFACT_DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PRODUCER_WORKFLOW = "Control Room Static Artifact";
const PRODUCER_WORKFLOW_PATH = ".github/workflows/control-room-alchemy.yml";
const MAX_SERVED_DOCUMENT_BYTES = 2 * 1024 * 1024;
const SERVED_OBSERVATION_TIMEOUT_MS = 10_000;

interface RecordValue {
  readonly [key: string]: unknown;
}

export interface WorkflowRunProvenance {
  readonly artifactName: string;
  readonly commit: string;
  readonly kind: "preview" | "production";
  readonly prNumber: string;
  readonly repositoryId: string;
  readonly runAttempt: string;
  readonly runId: string;
  readonly stage: string;
}

export interface ArtifactIdentity {
  readonly digest: string;
  readonly id: string;
  readonly name: string;
}

export interface ClosedPreviewProvenance {
  readonly prNumber: string;
  readonly repositoryId: string;
  readonly stage: string;
}

export interface ServedArtifactObservation {
  readonly artifactDigest: string;
  readonly commit: string;
  readonly snapshotDigest: string;
}

export interface EffectObservation {
  readonly effectObservation: "DeploymentObserved" | "DeploymentUnknown" | "RemovalObserved";
  readonly reconciliationRequired: "false" | "true";
  readonly servedSnapshotDigest: string;
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

const sameRepository = (value: unknown, repository: string, label: string): string => {
  const repositoryValue = record(value, label);
  const fullName = string(repositoryValue.full_name, `${label}.full_name`);
  if (fullName !== repository) throw new Error(`${label} is not the triggering repository`);
  return positiveInteger(repositoryValue.id, `${label}.id`);
};

const sameRepositoryId = (
  value: unknown,
  repository: string,
  repositoryId: string,
  label: string,
): void => {
  const reference = record(value, label);
  if (positiveInteger(reference.id, `${label}.id`) !== repositoryId) {
    throw new Error(`${label} is not the triggering repository`);
  }
  const repositoryName = repository.slice(repository.indexOf("/") + 1);
  if (string(reference.name, `${label}.name`) !== repositoryName) {
    throw new Error(`${label} name is not the triggering repository`);
  }
  string(reference.url, `${label}.url`);
};

export const validateWorkflowRunProvenance = (
  value: unknown,
  repository: string,
): WorkflowRunProvenance => {
  if (!REPOSITORY.test(repository)) throw new Error("repository identity is malformed");
  const event = record(value, "event");
  const repositoryId = sameRepository(event.repository, repository, "event.repository");
  if (event.action !== "completed") throw new Error("workflow_run action must be completed");
  const run = record(event.workflow_run, "event.workflow_run");
  if (run.name !== PRODUCER_WORKFLOW) throw new Error("unexpected producer workflow");
  if (run.path !== PRODUCER_WORKFLOW_PATH) throw new Error("unexpected producer workflow path");
  if (run.conclusion !== "success") throw new Error("producer workflow did not succeed");
  if (sameRepository(run.repository, repository, "workflow_run.repository") !== repositoryId) {
    throw new Error("workflow_run.repository id is not the triggering repository");
  }
  if (
    sameRepository(run.head_repository, repository, "workflow_run.head_repository") !== repositoryId
  ) {
    throw new Error("workflow_run.head_repository id is not the triggering repository");
  }
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
      repositoryId,
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
  sameRepositoryId(base.repo, repository, repositoryId, "pull request base repository");
  sameRepositoryId(head.repo, repository, repositoryId, "pull request head repository");
  if (head.sha !== commit) throw new Error("pull request head is not bound to the workflow head");
  return {
    artifactName,
    commit,
    kind: "preview",
    prNumber: number,
    repositoryId,
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

export const validateClosedPreview = (
  value: unknown,
  repository: string,
): ClosedPreviewProvenance => {
  if (!REPOSITORY.test(repository)) throw new Error("repository identity is malformed");
  const event = record(value, "event");
  if (event.action !== "closed") throw new Error("cleanup event must be closed");
  const repositoryId = sameRepository(event.repository, repository, "event.repository");
  const pullRequest = record(event.pull_request, "event.pull_request");
  const number = positiveInteger(pullRequest.number, "pull request number");
  const base = record(pullRequest.base, "pull request base");
  const head = record(pullRequest.head, "pull request head");
  if (base.ref !== "main") throw new Error("cleanup target branch must be main");
  if (sameRepository(base.repo, repository, "pull request base repository") !== repositoryId) {
    throw new Error("pull request base repository id is not the triggering repository");
  }
  if (sameRepository(head.repo, repository, "pull request head repository") !== repositoryId) {
    throw new Error("pull request head repository id is not the triggering repository");
  }
  return { prNumber: number, repositoryId, stage: `p${number}` };
};

const validateLivePullRequestIdentity = (
  value: unknown,
  repository: string,
  repositoryId: string,
  prNumber: string,
  expectedState: "closed" | "open",
  expectedHead: string | undefined,
): void => {
  const pullRequest = record(value, "live pull request");
  if (positiveInteger(pullRequest.number, "live pull request number") !== prNumber) {
    throw new Error("live pull request number changed");
  }
  if (pullRequest.state !== expectedState) {
    throw new Error(`live pull request is not ${expectedState}`);
  }
  const base = record(pullRequest.base, "live pull request base");
  const head = record(pullRequest.head, "live pull request head");
  if (base.ref !== "main") throw new Error("live pull request target branch is not main");
  if (sameRepository(base.repo, repository, "live pull request base repository") !== repositoryId) {
    throw new Error("live pull request base repository id changed");
  }
  if (sameRepository(head.repo, repository, "live pull request head repository") !== repositoryId) {
    throw new Error("live pull request head repository id changed");
  }
  if (expectedHead !== undefined && head.sha !== expectedHead) {
    throw new Error("live pull request head advanced");
  }
};

export const validateLiveWorkflowTarget = (
  value: unknown,
  provenance: WorkflowRunProvenance,
  repository: string,
): void => {
  if (provenance.kind === "preview") {
    validateLivePullRequestIdentity(
      value,
      repository,
      provenance.repositoryId,
      provenance.prNumber,
      "open",
      provenance.commit,
    );
    return;
  }
  const reference = record(value, "live main ref");
  if (reference.ref !== "refs/heads/main") throw new Error("live production ref is not main");
  const object = record(reference.object, "live main ref object");
  if (object.type !== "commit") throw new Error("live production ref does not name a commit");
  if (object.sha !== provenance.commit)
    throw new Error("live main advanced past the artifact commit");
};

export const validateLiveClosedPreview = (
  value: unknown,
  provenance: ClosedPreviewProvenance,
  repository: string,
): void =>
  validateLivePullRequestIdentity(
    value,
    repository,
    provenance.repositoryId,
    provenance.prNumber,
    "closed",
    undefined,
  );

const unknownObservation = (): EffectObservation => ({
  effectObservation: "DeploymentUnknown",
  reconciliationRequired: "true",
  servedSnapshotDigest: "",
});

export const observeWorkflowRunEffect = (
  value: unknown,
  provenance: WorkflowRunProvenance,
  repository: string,
  providerOutcome: string,
  servedArtifact: ServedArtifactObservation | undefined,
): EffectObservation => {
  if (
    providerOutcome !== "success" ||
    servedArtifact === undefined ||
    !EXACT_ARTIFACT_DIGEST.test(servedArtifact.artifactDigest) ||
    servedArtifact.commit !== provenance.commit ||
    !EXACT_SNAPSHOT_DIGEST.test(servedArtifact.snapshotDigest)
  ) {
    return unknownObservation();
  }
  try {
    validateLiveWorkflowTarget(value, provenance, repository);
    return {
      effectObservation: "DeploymentObserved",
      reconciliationRequired: "false",
      servedSnapshotDigest: servedArtifact.snapshotDigest,
    };
  } catch {
    return unknownObservation();
  }
};

export const observeClosedPreviewEffect = (
  value: unknown,
  provenance: ClosedPreviewProvenance,
  repository: string,
  providerOutcome: string,
  servedStatus: number | undefined,
): EffectObservation => {
  if (providerOutcome !== "success" || (servedStatus !== 404 && servedStatus !== 410)) {
    return unknownObservation();
  }
  try {
    validateLiveClosedPreview(value, provenance, repository);
    return {
      effectObservation: "RemovalObserved",
      reconciliationRequired: "false",
      servedSnapshotDigest: "",
    };
  } catch {
    return unknownObservation();
  }
};

const parseJson = (value: string, label: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
};

export const validateServedArtifact = async (
  expectedVersionText: string,
  expectedSnapshotText: string,
  servedVersionText: string,
  servedSnapshotText: string,
  expectedCommit: string,
  artifactDigest: string,
): Promise<ServedArtifactObservation> => {
  if (!EXACT_ARTIFACT_DIGEST.test(artifactDigest)) {
    throw new Error("served observation artifact digest is malformed");
  }
  const expectedVersionValue = parseJson(expectedVersionText, "artifact version document");
  if (!isPublicVersion(expectedVersionValue)) {
    throw new Error("artifact version document is invalid");
  }
  if (expectedVersionValue.commit !== expectedCommit) {
    throw new Error("artifact version commit is not the deployment commit");
  }
  const expectedSnapshotValue = parseJson(expectedSnapshotText, "artifact snapshot");
  await verifyCandidate(expectedVersionValue, expectedSnapshotValue);
  if (servedVersionText !== expectedVersionText) {
    throw new Error("served version bytes do not match the digest-custodied artifact");
  }
  if (servedSnapshotText !== expectedSnapshotText) {
    throw new Error("served snapshot bytes do not match the digest-custodied artifact");
  }
  const servedVersionValue = parseJson(servedVersionText, "served version document");
  if (!isPublicVersion(servedVersionValue)) {
    throw new Error("served version document is invalid");
  }
  const servedSnapshotValue = parseJson(servedSnapshotText, "served snapshot");
  await verifyCandidate(servedVersionValue, servedSnapshotValue);
  return {
    artifactDigest,
    commit: servedVersionValue.commit,
    snapshotDigest: servedVersionValue.digest,
  };
};

const decodeUtf8 = (value: Uint8Array, label: string): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
};

const readBoundedFile = async (path: string, label: string): Promise<string> => {
  const value = new Uint8Array(await readFile(path));
  if (value.byteLength > MAX_SERVED_DOCUMENT_BYTES) {
    throw new Error(`${label} exceeds the bounded size`);
  }
  return decodeUtf8(value, label);
};

const readBoundedResponse = async (response: Response, label: string): Promise<string> => {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_SERVED_DOCUMENT_BYTES) {
    throw new Error(`${label} exceeds the bounded size`);
  }
  if (response.body === null) throw new Error(`${label} response has no body`);
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SERVED_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new Error(`${label} exceeds the bounded size`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeUtf8(bytes, label);
};

const fetchServedText = async (url: URL, label: string): Promise<string> => {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(SERVED_OBSERVATION_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${label} request failed (${response.status})`);
  return readBoundedResponse(response, label);
};

const fetchServedArtifact = async (
  provenance: WorkflowRunProvenance,
  staticRootInput: string,
  artifactDigest: string,
): Promise<ServedArtifactObservation> => {
  const staticRoot = resolveStaticArtifactRoot(staticRootInput);
  await validateStaticArtifact(staticRoot, provenance.commit);
  const expectedVersionText = await readBoundedFile(
    join(staticRoot, "data", "version.json"),
    "artifact version document",
  );
  const expectedVersionValue = parseJson(expectedVersionText, "artifact version document");
  if (!isPublicVersion(expectedVersionValue)) {
    throw new Error("artifact version document is invalid");
  }
  if (expectedVersionValue.commit !== provenance.commit) {
    throw new Error("artifact version commit is not the deployment commit");
  }
  const expectedSnapshotText = await readBoundedFile(
    join(staticRoot, "data", expectedVersionValue.snapshot),
    "artifact snapshot",
  );
  const deployment = parseDeploymentStage(provenance.stage);
  const versionUrl = new URL("data/version.json", `${deployment.url}/`);
  versionUrl.searchParams.set("control-room-commit", provenance.commit);
  const servedVersionText = await fetchServedText(versionUrl, "served version document");
  const snapshotUrl = new URL(`data/${expectedVersionValue.snapshot}`, `${deployment.url}/`);
  snapshotUrl.searchParams.set("control-room-digest", expectedVersionValue.digest);
  const servedSnapshotText = await fetchServedText(snapshotUrl, "served snapshot");
  return validateServedArtifact(
    expectedVersionText,
    expectedSnapshotText,
    servedVersionText,
    servedSnapshotText,
    provenance.commit,
    artifactDigest,
  );
};

const fetchServedCleanupStatus = async (stage: string): Promise<number> => {
  const deployment = parseDeploymentStage(stage);
  if (deployment.kind !== "preview") throw new Error("cleanup observation requires preview stage");
  const url = new URL(deployment.url);
  url.searchParams.set("control-room-removal-observation", stage);
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(SERVED_OBSERVATION_TIMEOUT_MS),
  });
  await response.body?.cancel();
  return response.status;
};

const githubHeaders = (token: string): Readonly<Record<string, string>> => {
  if (token === "") throw new Error("GitHub token is required for authoritative observation");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10",
  };
};

const fetchGitHubJson = async (
  path: string,
  repository: string,
  apiUrl: string,
  token: string,
  label: string,
): Promise<unknown> => {
  const response = await fetch(`${apiUrl}/repos/${repository}${path}`, {
    headers: githubHeaders(token),
  });
  if (!response.ok) throw new Error(`${label} request failed (${response.status})`);
  return response.json();
};

const fetchArtifactIdentity = async (
  provenance: WorkflowRunProvenance,
  repository: string,
  apiUrl: string,
  token: string,
): Promise<ArtifactIdentity> => {
  const value = await fetchGitHubJson(
    `/actions/runs/${provenance.runId}/artifacts?per_page=100`,
    repository,
    apiUrl,
    token,
    "artifact metadata",
  );
  return selectImmutableArtifact(value, provenance);
};

const fetchLiveWorkflowTarget = (
  provenance: WorkflowRunProvenance,
  repository: string,
  apiUrl: string,
  token: string,
): Promise<unknown> =>
  fetchGitHubJson(
    provenance.kind === "production" ? "/git/ref/heads/main" : `/pulls/${provenance.prNumber}`,
    repository,
    apiUrl,
    token,
    "live deployment target",
  );

const fetchLiveClosedPreview = (
  provenance: ClosedPreviewProvenance,
  repository: string,
  apiUrl: string,
  token: string,
): Promise<unknown> =>
  fetchGitHubJson(
    `/pulls/${provenance.prNumber}`,
    repository,
    apiUrl,
    token,
    "live cleanup target",
  );

const writeOutputs = async (path: string, outputs: Readonly<Record<string, string>>) => {
  for (const [key, value] of Object.entries(outputs)) {
    if (!/^[a-z_]+$/.test(key) || /[\r\n]/.test(value)) {
      throw new Error("refusing unsafe GitHub output");
    }
    await appendFile(path, `${key}=${value}\n`, "utf8");
  }
};

const main = async (): Promise<void> => {
  const [
    mode,
    eventPath,
    repository,
    outputPath,
    providerOutcome,
    staticRoot,
    expectedArtifactDigest,
  ] = process.argv.slice(2);
  if (
    (mode !== "workflow-run" &&
      mode !== "closed-preview" &&
      mode !== "workflow-run-post-effect" &&
      mode !== "closed-preview-post-effect") ||
    eventPath === undefined ||
    repository === undefined ||
    outputPath === undefined ||
    (mode.endsWith("-post-effect") && providerOutcome === undefined) ||
    (mode === "workflow-run-post-effect" &&
      (staticRoot === undefined || expectedArtifactDigest === undefined))
  ) {
    throw new Error(
      "usage: workflow-run-custody.ts <workflow-run|closed-preview|workflow-run-post-effect|closed-preview-post-effect> EVENT REPOSITORY OUTPUT [PROVIDER_OUTCOME] [STATIC_ROOT] [ARTIFACT_DIGEST]",
    );
  }
  const event: unknown = JSON.parse(await readFile(eventPath, "utf8"));
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const token = process.env.GH_TOKEN ?? "";
  if (mode === "closed-preview") {
    const provenance = validateClosedPreview(event, repository);
    const livePullRequest = await fetchLiveClosedPreview(provenance, repository, apiUrl, token);
    validateLiveClosedPreview(livePullRequest, provenance, repository);
    await writeOutputs(outputPath, {
      pr_number: provenance.prNumber,
      stage: provenance.stage,
    });
    return;
  }
  if (mode === "closed-preview-post-effect") {
    const provenance = validateClosedPreview(event, repository);
    let observation = unknownObservation();
    try {
      const [livePullRequest, servedStatus] = await Promise.all([
        fetchLiveClosedPreview(provenance, repository, apiUrl, token),
        providerOutcome === "success"
          ? fetchServedCleanupStatus(provenance.stage)
          : Promise.resolve(undefined),
      ]);
      observation = observeClosedPreviewEffect(
        livePullRequest,
        provenance,
        repository,
        providerOutcome ?? "",
        servedStatus,
      );
    } catch {
      observation = unknownObservation();
    }
    await writeOutputs(outputPath, {
      effect_observation: observation.effectObservation,
      reconciliation_required: observation.reconciliationRequired,
      served_snapshot_digest: observation.servedSnapshotDigest,
    });
    if (observation.reconciliationRequired === "true") {
      throw new Error("DeploymentUnknown: cleanup requires reconciliation");
    }
    return;
  }
  const provenance = validateWorkflowRunProvenance(event, repository);
  if (mode === "workflow-run-post-effect") {
    let observation = unknownObservation();
    try {
      const [liveTarget, artifact, servedArtifact] = await Promise.all([
        fetchLiveWorkflowTarget(provenance, repository, apiUrl, token),
        fetchArtifactIdentity(provenance, repository, apiUrl, token),
        providerOutcome === "success"
          ? fetchServedArtifact(provenance, staticRoot ?? "", expectedArtifactDigest ?? "")
          : Promise.resolve(undefined),
      ]);
      if (artifact.digest !== expectedArtifactDigest) {
        throw new Error("post-effect artifact digest changed");
      }
      if (servedArtifact !== undefined && servedArtifact.artifactDigest !== artifact.digest) {
        throw new Error("served observation is not bound to the immutable artifact digest");
      }
      observation = observeWorkflowRunEffect(
        liveTarget,
        provenance,
        repository,
        providerOutcome ?? "",
        servedArtifact,
      );
    } catch {
      observation = unknownObservation();
    }
    await writeOutputs(outputPath, {
      effect_observation: observation.effectObservation,
      reconciliation_required: observation.reconciliationRequired,
      served_snapshot_digest: observation.servedSnapshotDigest,
    });
    if (observation.reconciliationRequired === "true") {
      throw new Error("DeploymentUnknown: deployment requires reconciliation");
    }
    return;
  }
  const [artifact, liveTarget] = await Promise.all([
    fetchArtifactIdentity(provenance, repository, apiUrl, token),
    fetchLiveWorkflowTarget(provenance, repository, apiUrl, token),
  ]);
  validateLiveWorkflowTarget(liveTarget, provenance, repository);
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
