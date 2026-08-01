import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

interface Step {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly "timeout-minutes"?: number;
}

interface Job {
  readonly if?: string;
  readonly concurrency: { readonly group: string; readonly "cancel-in-progress": boolean };
  readonly steps: ReadonlyArray<Step>;
  readonly "timeout-minutes": number;
}

interface Workflow {
  readonly name: string;
  readonly on: Readonly<Record<string, unknown>>;
  readonly jobs: Readonly<Record<string, Job>>;
}

const root = path.resolve(import.meta.dirname, "../../..");
const loadWorkflow = (name: string): Workflow =>
  parse(readFileSync(path.join(root, ".github/workflows", name), "utf8")) as Workflow;

const producer = () => loadWorkflow("control-room-alchemy.yml");
const trusted = () => loadWorkflow("control-room-alchemy-trusted.yml");

const locateSecretExpressions = (value: unknown, current = ""): ReadonlyArray<string> => {
  if (typeof value === "string") {
    return /\$\{\{[^}]*secrets\s*(?:\.|\[)/.test(value) ? [current] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => locateSecretExpressions(item, `${current}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      locateSecretExpressions(child, current === "" ? key : `${current}.${key}`),
    );
  }
  return [];
};

const actions = (workflow: Workflow): ReadonlyArray<string> =>
  Object.values(workflow.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses])),
  );

const assertBudget = (
  job: Job,
  expectedPreEffectMinutes: number,
  minimumPostEffectHeadroom: number,
): void => {
  expect(job.steps.every((step) => step["timeout-minutes"] !== undefined)).toBe(true);
  const providerIndex = job.steps.findIndex((step) => step.id === "provider");
  const preEffectMinutes = job.steps
    .slice(0, providerIndex + 1)
    .reduce((total, step) => total + (step["timeout-minutes"] ?? 0), 0);
  expect(preEffectMinutes).toBe(expectedPreEffectMinutes);
  expect(job["timeout-minutes"] - preEffectMinutes).toBeGreaterThanOrEqual(
    minimumPostEffectHeadroom,
  );
  const totalStepMinutes = job.steps.reduce(
    (total, step) => total + (step["timeout-minutes"] ?? 0),
    0,
  );
  expect(totalStepMinutes).toBeLessThan(job["timeout-minutes"]);
};

describe("Alchemy workflow safety", () => {
  test("separates unprivileged artifact production from privileged default-branch deployment", () => {
    const build = producer();
    const deploy = trusted();
    expect(build.name).toBe("Control Room Static Artifact");
    expect(deploy.name).toBe("Control Room Trusted Deploy");
    expect(Object.keys(build.on)).not.toContain("pull_request_target");
    expect(Object.keys(deploy.on)).not.toContain("pull_request_target");
    expect(deploy.on.workflow_run).toEqual({
      workflows: ["Control Room Static Artifact"],
      types: ["completed"],
    });
    expect(locateSecretExpressions(build)).toEqual([]);
    expect(JSON.stringify(build)).not.toMatch(/alchemy (?:deploy|destroy)/);
  });

  test("pins every action and never cancels a provider mutation", () => {
    for (const workflow of [producer(), trusted()]) {
      for (const action of actions(workflow)) {
        expect(action).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
      }
    }
    const privileged = trusted();
    expect(privileged.jobs["deploy-static"]?.concurrency["cancel-in-progress"]).toBe(false);
    expect(privileged.jobs["cleanup-preview"]?.concurrency["cancel-in-progress"]).toBe(false);
  });

  test("serializes preview deploy and cleanup through the same exact stage group", () => {
    const workflow = trusted();
    expect(workflow.jobs["deploy-static"]?.concurrency.group).toBe(
      "control-room-alchemy-${{ github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.pull_requests[0].number && format('p{0}', github.event.workflow_run.pull_requests[0].number) || 'prod' }}",
    );
    expect(workflow.jobs["cleanup-preview"]?.concurrency.group).toBe(
      "control-room-alchemy-p${{ github.event.pull_request.number }}",
    );
  });

  test("checks out only main and confines provider secrets to trusted deploy or destroy steps", () => {
    const workflow = trusted();
    const checkouts = Object.values(workflow.jobs).flatMap((job) =>
      job.steps.filter((step) => step.uses?.startsWith("actions/checkout@")),
    );
    expect(checkouts).toHaveLength(2);
    for (const checkout of checkouts) {
      expect(checkout.with?.ref).toBe("refs/heads/main");
      expect(JSON.stringify(checkout)).not.toContain("head.sha");
    }
    expect(locateSecretExpressions(workflow)).toEqual([
      "jobs.deploy-static.steps[6].env.CLOUDFLARE_API_TOKEN",
      "jobs.deploy-static.steps[6].env.CLOUDFLARE_ACCOUNT_ID",
      "jobs.cleanup-preview.steps[4].env.CLOUDFLARE_API_TOKEN",
      "jobs.cleanup-preview.steps[4].env.CLOUDFLARE_ACCOUNT_ID",
    ]);
  });

  test("downloads one digest-checked immutable artifact outside the workspace and never executes it", () => {
    const workflow = trusted();
    const steps = workflow.jobs["deploy-static"]!.steps;
    const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    expect(download?.with).toMatchObject({
      "artifact-ids": "${{ steps.provenance.outputs.artifact_id }}",
      path: "${{ runner.temp }}/control-room-static",
      "run-id": "${{ steps.provenance.outputs.run_id }}",
      "digest-mismatch": "error",
    });
    const afterDownload = steps.slice(steps.indexOf(download!) + 1);
    expect(afterDownload[0]?.run).toContain("scan-public-payload.ts");
    expect(afterDownload[1]?.run).toContain("tooling/deploy-static.run.ts");
    expect(afterDownload[1]?.run).not.toContain("apps/control-room/dist");
    const adapter = readFileSync(
      path.join(root, "apps/control-room/tooling/deploy-static.run.ts"),
      "utf8",
    );
    expect(adapter).toContain("await validateStaticArtifact(staticRoot, expectedCommit)");
    expect(adapter).toContain("directory: staticRoot");
    expect(adapter).not.toMatch(/(?:import|require)\s*\(\s*staticRoot/);
    expect(adapter).not.toContain("Command.Build");
  });

  test("validates same-repository provenance before download and exact cleanup before secrets", () => {
    const workflow = trusted();
    const deployment = workflow.jobs["deploy-static"]!.steps;
    const provenance = deployment.find((step) => step.id === "provenance");
    const downloadIndex = deployment.findIndex((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    );
    expect(provenance?.run).toContain("workflow-run-custody.ts");
    expect(deployment.indexOf(provenance!)).toBeLessThan(downloadIndex);

    const cleanup = workflow.jobs["cleanup-preview"]!.steps;
    expect(cleanup[3]?.run).toContain("closed-preview");
    expect(cleanup[3]?.run).toContain("workflow-run-custody.ts");
    expect(cleanup[4]?.run).toContain("alchemy destroy");
  });

  test("reserves job time for served-state observation after bounded provider commands", () => {
    const workflow = trusted();
    const deployment = workflow.jobs["deploy-static"]!;
    const deployProvider = deployment.steps.find((step) => step.id === "provider")!;
    const deployObservation = deployment.steps.find((step) => step.id === "observation")!;
    expect(deployment["timeout-minutes"]).toBe(50);
    expect(deployProvider.run).toContain("timeout --signal=TERM --kill-after=60s 15m");
    expect(deployment.steps.indexOf(deployObservation)).toBeGreaterThan(
      deployment.steps.indexOf(deployProvider),
    );
    expect(deployObservation.if).toContain("always()");
    expect(deployObservation.run).toContain("control-room-static");
    expect(deployObservation.run).toContain("steps.provenance.outputs.artifact_digest");

    const cleanup = workflow.jobs["cleanup-preview"]!;
    const cleanupProvider = cleanup.steps.find((step) => step.id === "provider")!;
    const cleanupObservation = cleanup.steps.find((step) => step.id === "observation")!;
    expect(cleanup["timeout-minutes"]).toBe(35);
    expect(cleanupProvider.run).toContain("timeout --signal=TERM --kill-after=60s 8m");
    expect(cleanup.steps.indexOf(cleanupObservation)).toBeGreaterThan(
      cleanup.steps.indexOf(cleanupProvider),
    );
    expect(cleanupObservation.if).toContain("always()");

    const report = deployment.steps.find(
      (step) => step.name === "Report observed preview snapshot",
    )!;
    expect(report.run).toContain("served snapshot");
    expect(report.run).not.toContain("preview deployed");

    assertBudget(deployment, 41, 9);
    assertBudget(cleanup, 30, 5);

    const custody = readFileSync(
      path.join(root, "apps/control-room/tooling/workflow-run-custody.ts"),
      "utf8",
    );
    expect(custody).toContain("signal: AbortSignal.timeout(GITHUB_OBSERVATION_TIMEOUT_MS)");
  });

  test("uses the pinned workspace Alchemy binary with an explicit credential preflight", () => {
    const workflow = trusted();
    const deploy = workflow.jobs["deploy-static"]!.steps.find((step) => step.id === "provider")!;
    const destroy = workflow.jobs["cleanup-preview"]!.steps.find((step) => step.id === "provider")!;
    const deployRun = deploy.run ?? "";
    const destroyRun = destroy.run ?? "";

    expect(deployRun).toContain('test -n "${CLOUDFLARE_API_TOKEN}"');
    expect(deployRun).toContain('test -n "${CLOUDFLARE_ACCOUNT_ID}"');
    expect(deployRun).toContain("bun run --cwd apps/control-room alchemy deploy");
    expect(deployRun).not.toContain("bunx alchemy");
    expect(deployRun).toContain("--stage");
    expect(deployRun).toContain("--yes");
    expect(deployRun.indexOf("--stage")).toBeLessThan(
      deployRun.indexOf("tooling/deploy-static.run.ts"),
    );
    expect(destroyRun).toContain('test -n "${CLOUDFLARE_API_TOKEN}"');
    expect(destroyRun).toContain('test -n "${CLOUDFLARE_ACCOUNT_ID}"');
    expect(destroyRun).toContain("bun run --cwd apps/control-room alchemy destroy");
    expect(destroyRun).not.toContain("bunx alchemy");
    expect(destroyRun).toContain("--stage");
    expect(destroyRun).toContain("--yes");
    expect(destroyRun.indexOf("--stage")).toBeLessThan(destroyRun.indexOf("alchemy.run.ts"));
  });

  test("the exact acceptance itself invokes the canonical full gate without recursion", () => {
    const acceptance = readFileSync(
      path.join(root, "scripts/accept/0017-control-room-reconstruction.ts"),
      "utf8",
    );
    expect(acceptance).toContain('["nix", "develop", "--command", "just", "check"]');
    const portfolioAcceptance = readFileSync(
      path.join(root, "scripts/accept/0021-pbk-portfolio-control-room.ts"),
      "utf8",
    );
    expect(portfolioAcceptance).toContain(
      '["bun", "scripts/accept/0017-control-room-reconstruction.ts"]',
    );
    expect(portfolioAcceptance).not.toContain('["just", "check"]');
    const check = readFileSync(path.join(root, "scripts/check.ts"), "utf8");
    expect(check).not.toContain("run-feature-acceptance");
    expect(check).not.toContain("0017-control-room-reconstruction");
  });
});
