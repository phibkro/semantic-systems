import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

interface Step {
  readonly name?: string;
  readonly id?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, unknown>>;
}

interface Job {
  readonly if: string;
  readonly concurrency: { readonly group: string; readonly "cancel-in-progress": boolean };
  readonly steps: ReadonlyArray<Step>;
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly jobs: Readonly<Record<string, Job>>;
}

const workflowPath = path.resolve(
  import.meta.dirname,
  "../../../.github/workflows/control-room-alchemy.yml",
);

const loadWorkflow = (): Workflow => parse(readFileSync(workflowPath, "utf8")) as Workflow;

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

describe("Alchemy workflow safety", () => {
  test("uses exact event routing and never pull_request_target", () => {
    const workflow = loadWorkflow();
    expect(Object.keys(workflow.on)).not.toContain("pull_request_target");
    expect(workflow.jobs["deploy-production"]?.if).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(workflow.jobs["deploy-preview"]?.if).toBe(
      "github.event_name == 'pull_request' && github.event.action != 'closed' && github.event.pull_request.base.ref == 'main' && github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflow.jobs["cleanup-preview"]?.if).toBe(
      "github.event_name == 'pull_request' && github.event.action == 'closed' && github.event.pull_request.base.ref == 'main' && github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  test("pins every action and never cancels provider mutation", () => {
    const workflow = loadWorkflow();
    const actions = Object.values(workflow.jobs).flatMap((job) =>
      job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses])),
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
    for (const job of Object.values(workflow.jobs)) {
      expect(job.concurrency["cancel-in-progress"]).toBe(false);
    }
  });

  test("exposes provider secrets only to explicit deploy/destroy steps", () => {
    const workflow = loadWorkflow();
    expect(locateSecretExpressions(workflow)).toEqual([
      "jobs.deploy-production.steps[9].env.CLOUDFLARE_API_TOKEN",
      "jobs.deploy-production.steps[9].env.CLOUDFLARE_ACCOUNT_ID",
      "jobs.deploy-preview.steps[10].env.CLOUDFLARE_API_TOKEN",
      "jobs.deploy-preview.steps[10].env.CLOUDFLARE_ACCOUNT_ID",
      "jobs.cleanup-preview.steps[4].env.CLOUDFLARE_API_TOKEN",
      "jobs.cleanup-preview.steps[4].env.CLOUDFLARE_ACCOUNT_ID",
    ]);
  });

  test("preview and cleanup identities come only from the exact PR number", () => {
    const workflow = loadWorkflow();
    const deploy = workflow.jobs["deploy-preview"]!.steps.find((step) => step.id === "deployment");
    const cleanup = workflow.jobs["cleanup-preview"]!.steps.find((step) => step.id === "cleanup");
    expect(deploy?.run).toContain('deploy "p${{ github.event.pull_request.number }}"');
    expect(cleanup?.run).toContain('cleanup "p${{ github.event.pull_request.number }}"');
    expect(cleanup?.run).toContain("deployment-identity.ts");
  });

  test("cleanup executes only trusted target-branch code, never PR-head code", () => {
    const workflow = loadWorkflow();
    const checkout = workflow.jobs["cleanup-preview"]!.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout?.with?.ref).toBe(
      "${{ github.event.pull_request.merged && github.sha || github.event.pull_request.base.sha }}",
    );
    expect(checkout?.with?.ref).not.toContain("head.sha");
  });
});
