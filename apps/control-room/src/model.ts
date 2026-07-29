export const SNAPSHOT_SCHEMA = "semantic-public-snapshot-v1";
export const VERSION_SCHEMA = "semantic-public-version-v1";

export type PublicEntity = {
  id: string;
  kind: string;
  name: string;
  summary: string;
  status: string | null;
  tags: string[];
  source_url: string;
  evidence_category: string | null;
  assumptions: string[];
};

export type PublicRelation = {
  source_id: string;
  target_id: string;
  kind: string;
  summary: string;
  source_url: string;
};

export type PublicSnapshot = {
  schema_version: typeof SNAPSHOT_SCHEMA;
  metadata: {
    commit: string;
    digest: string;
    generated_at: string;
    observed_at: string;
    freshness_seconds: number;
    deployed_check_status: "not_checked" | "passed" | "failed";
    observation_source: "local_preview" | "accepted_main";
    repository_url: string;
  };
  counts_by_kind: Record<string, number>;
  ready_work_ids: string[];
  active_work_ids: string[];
  blocked_work_ids: string[];
  completed_work_ids: string[];
  unsupported_claim_ids: string[];
  entities: PublicEntity[];
  relations: PublicRelation[];
};

export type PublicVersion = {
  schema_version: typeof VERSION_SCHEMA;
  commit: string;
  digest: string;
  observed_at: string;
  snapshot: string;
};

export type DataState =
  | "current"
  | "update_available"
  | "stale"
  | "offline"
  | "invalid"
  | "loading";

export type SnapshotState = {
  state: DataState;
  snapshot: PublicSnapshot | null;
  pending: PublicSnapshot | null;
  detail?: string;
};
