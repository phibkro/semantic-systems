import type { PublicSnapshot } from "../../../src/project-model/public-export.ts";

export {
  PUBLIC_SNAPSHOT_SCHEMA as SNAPSHOT_SCHEMA,
  PUBLIC_VERSION_SCHEMA as VERSION_SCHEMA,
  PublicEntitySchema,
  PublicRelationSchema,
  PublicSnapshotSchema,
  PublicVersionSchema,
  type PublicEntity,
  type PublicRelation,
  type PublicSnapshot,
  type PublicVersion,
} from "../../../src/project-model/public-export.ts";

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
