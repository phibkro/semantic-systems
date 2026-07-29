import { SNAPSHOT_SCHEMA, type PublicSnapshot } from "../model";

export const fixtureSnapshot: PublicSnapshot = {
  schema_version: SNAPSHOT_SCHEMA,
  metadata: {
    commit: "0123456789abcdef0123456789abcdef01234567",
    digest: "a".repeat(64),
    generated_at: "2026-07-29T12:00:00Z",
    observed_at: "2026-07-29T12:00:00Z",
    freshness_seconds: 86_400,
    deployed_check_status: "not_checked",
    repository_url: "https://github.com/phibkro/semantic-systems",
  },
  counts_by_kind: { claim: 1, component: 1, evidence: 1, theory: 1, work_item: 1 },
  ready_work_ids: ["work.ready"],
  active_work_ids: [],
  blocked_work_ids: [],
  completed_work_ids: ["work.done"],
  unsupported_claim_ids: ["claim.unsupported"],
  entities: [
    {
      id: "component.alpha",
      kind: "component",
      name: "Alpha system",
      summary: "Phone-first system",
      status: "active",
      tags: ["system"],
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "theory.safe",
      kind: "theory",
      name: "Safe theory",
      summary: "A semantic contract",
      status: "accepted",
      tags: ["semantics"],
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
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
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
      evidence_category: null,
      assumptions: [],
    },
    {
      id: "evidence.example",
      kind: "evidence",
      name: "Example evidence",
      summary: "A bounded behavior observation",
      status: "passing",
      tags: ["evidence"],
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
      evidence_category: "example_test",
      assumptions: ["Fixture scope only"],
    },
    {
      id: "work.ready",
      kind: "work_item",
      name: "Ready work",
      summary: "Can begin",
      status: "ready",
      tags: ["work"],
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
      evidence_category: null,
      assumptions: [],
    },
  ],
  relations: [
    {
      source_id: "component.alpha",
      target_id: "theory.safe",
      kind: "implements",
      summary: "Alpha implements the theory",
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
    },
    {
      source_id: "evidence.example",
      target_id: "theory.safe",
      kind: "supports",
      summary: "Bounded support",
      source_url:
        "https://github.com/phibkro/semantic-systems/blob/0123456789abcdef0123456789abcdef01234567/model/fixture.json",
    },
  ],
};
