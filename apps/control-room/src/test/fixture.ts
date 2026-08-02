import type { AgentObservationReport } from "../../../../src/agent-observation/index.ts";
import { SNAPSHOT_SCHEMA, type PublicSnapshot } from "../model.ts";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const source = (file = "fixture.json") =>
  `https://github.com/phibkro/semantic-systems/blob/${COMMIT}/model/${file}`;

export const fixtureSnapshot: PublicSnapshot = {
  schema_version: SNAPSHOT_SCHEMA,
  metadata: {
    commit: COMMIT,
    digest: "a".repeat(64),
    generated_at: "2026-07-31T12:00:00Z",
    observed_at: "2026-07-31T12:00:00Z",
    freshness_seconds: 86_400,
    deployed_check_status: "not_checked",
    observation_source: "local_preview",
    repository_url: "https://github.com/phibkro/semantic-systems",
  },
  counts_by_kind: { claim: 1, component: 1, evidence: 1, theory: 1, work_item: 3 },
  ready_work_ids: ["work.ready"],
  active_work_ids: [],
  blocked_work_ids: ["work.blocked"],
  completed_work_ids: ["work.accepted"],
  unsupported_claim_ids: ["claim.unsupported"],
  entities: [
    {
      id: "component.explorer",
      kind: "component",
      name: "Semantic project explorer",
      summary: "The public observation surface.",
      status: "active",
      tags: ["system"],
      source_url: source(),
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "theory.safe",
      kind: "theory",
      name: "Semantic theory",
      summary: "An explicit semantic contract.",
      status: "accepted",
      tags: ["semantics"],
      source_url: source(),
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "claim.unsupported",
      kind: "claim",
      name: "<script>window.pwned=true</script>",
      summary: "<img src=x onerror=window.pwned=true>",
      status: "proposed",
      tags: ["evidence"],
      source_url: source(),
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "evidence.example",
      kind: "evidence",
      name: "Example evidence",
      summary: "A bounded runtime observation.",
      status: "passing",
      tags: ["evidence"],
      source_url: source(),
      evidence_category: "example_test",
      assumptions: ["Fixture scope only"],
    },
    {
      id: "work.ready",
      kind: "work_item",
      name: "Ready work",
      summary: "Can begin.",
      status: "ready",
      tags: ["work"],
      source_url: source(),
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "work.blocked",
      kind: "work_item",
      name: "Blocked work",
      summary: "Waiting on a scheduler dependency.",
      status: "blocked",
      tags: ["work"],
      source_url: source(),
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "work.accepted",
      kind: "work_item",
      name: "Accepted work",
      summary: "Completed and accepted.",
      status: "accepted",
      tags: ["work"],
      source_url: source(),
      evidence_category: null,
      assumptions: [],
    },
  ],
  relations: [
    {
      source_id: "component.explorer",
      target_id: "theory.safe",
      kind: "implements",
      summary: "Explorer presents this theory.",
      source_url: source(),
    },
    {
      source_id: "evidence.example",
      target_id: "theory.safe",
      kind: "supports",
      summary: "Bounded support.",
      source_url: source(),
    },
  ],
};

const matched = (value: string) => ({ value, state: "matched" as const });

export const fixtureObservationReport: AgentObservationReport = {
  format: "semantic.agent-observation-report/v1",
  source: {
    vendor: "langfuse",
    vendor_project_id: "langfuse-project",
    trace_id: "trace-langfuse",
    source_digest: `sha256:${"b".repeat(64)}`,
    captured_at: "2026-08-02T10:05:00.000Z",
    interval: {
      start: "2026-08-02T10:00:00.000Z",
      end: "2026-08-02T11:00:00.000Z",
    },
    row_limit: 10,
    observed_rows: 1,
  },
  capture_state: "complete",
  trace: {
    roots: [
      {
        observation_id: "observation-root",
        parent_observation_id: null,
        name: "bounded-model-call",
        kind: "SPAN",
        started_at: "2026-08-02T10:00:00.000Z",
        ended_at: "2026-08-02T10:00:01.000Z",
        duration_ns: null,
        service_name: null,
        status: { level: "DEFAULT", message: "" },
        correlation: {
          project: matched("pbk.semantic"),
          work: matched("work.observation"),
          attempt: { value: "attempt.42", state: "observed_only" },
          revision: matched(COMMIT),
          evidence: [{ value: "evidence.example", state: "matched" }],
        },
        children: [],
      },
    ],
  },
  diagnostics: [],
  unsupported_claims: [
    "semantic correctness of an agent action",
    "work readiness, completion, or acceptance",
  ],
};
