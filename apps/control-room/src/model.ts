export const SNAPSHOT_SCHEMA = "semantic-public-snapshot-v1";
export const VERSION_SCHEMA = "semantic-public-version-v1";

export const PUBLIC_ENTITY_KINDS = new Set([
  "agent",
  "artifact",
  "assumption",
  "claim",
  "component",
  "decision",
  "deployment",
  "domain_machine",
  "effect",
  "environment",
  "evidence",
  "gate",
  "handler",
  "human",
  "invariant",
  "law",
  "milestone",
  "obligation",
  "operation",
  "package",
  "protocol",
  "question",
  "realization",
  "responsibility",
  "runtime",
  "theory",
  "type",
  "work_item",
]);

export const PUBLIC_RELATION_KINDS = new Set([
  "accountable_for",
  "assigned_to",
  "assumes",
  "blocks",
  "changes",
  "conflicts_with",
  "contains",
  "covers",
  "derives",
  "discharges",
  "extends",
  "handles",
  "hosts",
  "implements",
  "informs",
  "invalidates",
  "preserves",
  "provides",
  "publishes",
  "reads",
  "realizes",
  "refines",
  "requires",
  "reviewed_by",
  "selects",
  "sends",
  "supports",
  "validates",
  "writes",
]);

export interface PublicEntity {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string | null;
  readonly tags: ReadonlyArray<string>;
  readonly source_url: string;
  readonly evidence_category: string | null;
  readonly assumptions: ReadonlyArray<string>;
}

export interface PublicRelation {
  readonly source_id: string;
  readonly target_id: string;
  readonly kind: string;
  readonly summary: string;
  readonly source_url: string;
}

export interface PublicSnapshot {
  readonly schema_version: typeof SNAPSHOT_SCHEMA;
  readonly metadata: {
    readonly commit: string;
    readonly digest: string;
    readonly generated_at: string;
    readonly observed_at: string;
    readonly freshness_seconds: number;
    readonly deployed_check_status: "not_checked" | "passed" | "failed";
    readonly observation_source: "local_preview" | "main_ci_assertion" | "pr_ci_assertion";
    readonly repository_url: string;
  };
  readonly counts_by_kind: Readonly<Record<string, number>>;
  readonly ready_work_ids: ReadonlyArray<string>;
  readonly active_work_ids: ReadonlyArray<string>;
  readonly blocked_work_ids: ReadonlyArray<string>;
  readonly completed_work_ids: ReadonlyArray<string>;
  readonly unsupported_claim_ids: ReadonlyArray<string>;
  readonly entities: ReadonlyArray<PublicEntity>;
  readonly relations: ReadonlyArray<PublicRelation>;
}

export interface PublicVersion {
  readonly schema_version: typeof VERSION_SCHEMA;
  readonly commit: string;
  readonly digest: string;
  readonly observed_at: string;
  readonly snapshot: string;
}

export type DataState =
  | "current"
  | "update_available"
  | "stale"
  | "offline"
  | "invalid"
  | "unavailable"
  | "loading";

export interface SnapshotState {
  readonly state: DataState;
  readonly snapshot: PublicSnapshot | null;
  readonly pending: PublicSnapshot | null;
  readonly detail?: string;
}
